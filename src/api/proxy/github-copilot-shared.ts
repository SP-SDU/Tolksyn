import {
  copilotBase,
  copilotHeaders,
  copilotModelHeaders,
  exchangeCopilotAccessToken,
  normalizeEnterpriseDomain,
} from '@/api/providers/github-copilot-shared';
import { AppError } from '@/types/app-error';

export async function proxyCopilotModels(request: Request): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await withCopilotToken(request, async ({ token, enterpriseUrl }) =>
      fetch(`${copilotBase(enterpriseUrl)}/models`, {
        headers: copilotModelHeaders(token),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }

  return passthroughJson(upstream);
}

export async function proxyCopilotPost(request: Request, path: 'chat/completions' | 'responses'): Promise<Response> {
  const body = await request.text();

  let upstream: Response;
  try {
    upstream = await withCopilotToken(request, async ({ token, enterpriseUrl }) =>
      fetch(`${copilotBase(enterpriseUrl)}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...copilotHeaders(token, {
            vision: hasVisionInput(body),
            initiator: 'user',
          }),
        },
        body,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }

  return passthroughJson(upstream);
}

async function withCopilotToken(
  request: Request,
  run: (input: { token: string; enterpriseUrl?: string }) => Promise<Response>,
): Promise<Response> {
  const authHeader = request.headers.get('authorization') ?? '';
  const refreshToken = parseBearer(authHeader);
  if (!refreshToken) {
    return new Response(JSON.stringify({ message: 'Missing GitHub Copilot OAuth token.' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  const enterpriseUrl = enterpriseFromRequest(request);
  let exchangeError: unknown;
  let token = refreshToken;

  try {
    const exchanged = await exchangeCopilotAccessToken({
      fetch,
      refreshToken,
      enterpriseUrl,
    });
    token = exchanged.token;
  } catch (error) {
    exchangeError = error;
  }

  try {
    const primary = await run({
      token,
      enterpriseUrl,
    });

    if (token !== refreshToken && (primary.status === 401 || primary.status === 403)) {
      return run({
        token: refreshToken,
        enterpriseUrl,
      });
    }

    return primary;
  } catch (error) {
    if (token !== refreshToken) {
      try {
        return await run({
          token: refreshToken,
          enterpriseUrl,
        });
      } catch {
      }
    }

    return errorResponse(error ?? exchangeError);
  }
}

function errorResponse(error: unknown): Response {
  const status =
    error instanceof AppError
      ? error.code === 'unsupported'
        ? 400
        : error.code === 'auth_failed'
        ? 401
        : error.code === 'rate_limited'
          ? 429
          : error.code === 'network_unavailable'
            ? 503
            : error.code === 'timeout'
              ? 504
              : 502
      : 502;
  const message = error instanceof AppError ? error.message : 'GitHub Copilot request failed.';

  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function passthroughJson(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function parseBearer(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const match = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (match) {
    return match[1].trim();
  }

  return trimmed;
}

function enterpriseFromRequest(request: Request): string | undefined {
  const fromHeader = request.headers.get('x-copilot-enterprise-url') ?? '';
  if (fromHeader.trim()) {
    return normalizeEnterpriseDomain(fromHeader);
  }

  const fromQuery = new URL(request.url).searchParams.get('enterpriseUrl') ?? '';
  if (fromQuery.trim()) {
    return normalizeEnterpriseDomain(fromQuery);
  }

  return undefined;
}

function hasVisionInput(body: string): boolean {
  if (!body.trim()) {
    return false;
  }

  try {
    const payload = JSON.parse(body) as {
      messages?: { content?: { type?: string }[] }[];
      input?: { content?: { type?: string }[] }[];
    };

    const chatVision = payload.messages?.some(
      (item) => Array.isArray(item.content) && item.content.some((part) => part?.type === 'image_url'),
    );
    if (chatVision) {
      return true;
    }

    return Boolean(
      payload.input?.some((item) => Array.isArray(item.content) && item.content.some((part) => part?.type === 'input_image')),
    );
  } catch {
    return false;
  }
}

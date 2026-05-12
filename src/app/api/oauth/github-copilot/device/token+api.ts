import { AppError } from '@/types/app-error';
import { normalizeEnterpriseDomain } from '@/api/providers/github-copilot-shared';

const GITHUB_CLIENT_ID = 'Ov23li8tweQw6odWQebz';

export async function POST(request: Request): Promise<Response> {
  const payload = (await request.json().catch(() => ({}))) as {
    device_code?: string;
    grant_type?: string;
  };

  let domain: string;
  try {
    domain = enterpriseDomain(request);
  } catch (error) {
    return invalidEnterpriseResponse(error);
  }

  const response = await fetch(`https://${domain}/login/oauth/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: payload.device_code ?? '',
      grant_type: payload.grant_type ?? 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function enterpriseDomain(request: Request): string {
  const query = new URL(request.url).searchParams.get('enterpriseUrl') ?? '';
  return normalizeEnterpriseDomain(query) ?? 'github.com';
}

function invalidEnterpriseResponse(error: unknown): Response {
  const message = error instanceof AppError ? error.message : 'Invalid GitHub Enterprise URL.';
  return new Response(JSON.stringify({ message }), {
    status: 400,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

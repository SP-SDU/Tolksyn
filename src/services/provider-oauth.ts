import { AppError } from '@/types/app-error';
import { normalizeEnterpriseDomain } from '@/api/providers/github-copilot-shared';
import type { ProviderAuth } from '@/types/settings';

const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_HOST = 'https://auth.openai.com';
const GITHUB_CLIENT_ID = 'Ov23li8tweQw6odWQebz';
const POLL_BUFFER_MS = 3000;

type FetchLike = typeof fetch;

export type OAuthFlow = {
  providerId: string;
  url: string;
  code: string;
  instructions: string;
  complete: () => Promise<ProviderAuth>;
};

export type OAuthStartOptions = {
  enterpriseUrl?: string;
};

export function createProviderOAuth({
  fetch,
  now,
  sleep,
}: {
  fetch: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const getNow = now ?? (() => Date.now());
  const wait = sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return {
    async start(providerId: string, options?: OAuthStartOptions): Promise<OAuthFlow> {
      if (providerId === 'openai') {
        return startOpenAI({ fetch, now: getNow, sleep: wait });
      }

      if (providerId === 'github-copilot') {
        return startCopilot({ fetch, sleep: wait, enterpriseUrl: options?.enterpriseUrl });
      }

      throw new AppError('unsupported', `OAuth is not supported for provider "${providerId}".`);
    },
  };
}

async function startOpenAI({
  fetch,
  now,
  sleep,
}: {
  fetch: FetchLike;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}): Promise<OAuthFlow> {
  const codeResponse = await fetch(`${OPENAI_HOST}/api/accounts/deviceauth/usercode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: OPENAI_CLIENT_ID }),
  });

  if (!codeResponse.ok) {
    throw new AppError('auth_failed', 'Failed to initiate OpenAI authorization.');
  }

  const device = (await codeResponse.json()) as {
    device_auth_id: string;
    user_code: string;
    interval?: string;
  };
  const intervalMs = Math.max(parseInt(device.interval ?? '5', 10) || 5, 1) * 1000;

  return {
    providerId: 'openai',
    url: `${OPENAI_HOST}/codex/device`,
    code: device.user_code,
    instructions: `Enter code: ${device.user_code}`,
    async complete() {
      while (true) {
        const poll = await fetch(`${OPENAI_HOST}/api/accounts/deviceauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            device_auth_id: device.device_auth_id,
            user_code: device.user_code,
          }),
        });

        if (poll.ok) {
          const grant = (await poll.json()) as {
            authorization_code: string;
            code_verifier: string;
          };

          const tokenResponse = await fetch(`${OPENAI_HOST}/oauth/token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code: grant.authorization_code,
              redirect_uri: `${OPENAI_HOST}/deviceauth/callback`,
              client_id: OPENAI_CLIENT_ID,
              code_verifier: grant.code_verifier,
            }).toString(),
          });

          if (!tokenResponse.ok) {
            throw new AppError('auth_failed', 'OpenAI token exchange failed.');
          }

          const token = (await tokenResponse.json()) as {
            refresh_token: string;
            access_token: string;
            expires_in?: number;
          };

          return {
            type: 'oauth',
            refresh: token.refresh_token,
            access: token.access_token,
            expires: now() + (token.expires_in ?? 3600) * 1000,
          };
        }

        if (poll.status !== 403 && poll.status !== 404) {
          throw new AppError('auth_failed', 'OpenAI OAuth authorization failed.');
        }

        await sleep(intervalMs + POLL_BUFFER_MS);
      }
    },
  };
}

async function startCopilot({
  fetch,
  sleep,
  enterpriseUrl,
}: {
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  enterpriseUrl?: string;
}): Promise<OAuthFlow> {
  const domain = normalizeEnterpriseDomain(enterpriseUrl);
  const urls = copilotOAuthUrls(domain);
  const codeResponse = await fetch(urls.code, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: 'read:user',
    }),
  });

  if (!codeResponse.ok) {
    if (isWebProxyNotFound(codeResponse)) {
      throw oauthProxyUnavailableError();
    }

    throw new AppError('auth_failed', 'Failed to initiate GitHub Copilot authorization.');
  }

  const code = (await codeResponse.json()) as {
    verification_uri: string;
    user_code: string;
    device_code: string;
    interval: number;
  };

  return {
    providerId: 'github-copilot',
    url: code.verification_uri,
    code: code.user_code,
    instructions: `Enter code: ${code.user_code}`,
    async complete() {
      while (true) {
        const tokenResponse = await fetch(urls.token, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            device_code: code.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });

        if (!tokenResponse.ok) {
          if (isWebProxyNotFound(tokenResponse)) {
            throw oauthProxyUnavailableError();
          }

          throw new AppError('auth_failed', 'GitHub Copilot OAuth authorization failed.');
        }

        const token = (await tokenResponse.json()) as {
          access_token?: string;
          error?: string;
          interval?: number;
        };

        if (token.access_token) {
          return {
            type: 'oauth',
            refresh: token.access_token,
            access: token.access_token,
            expires: 0,
            ...(domain ? { enterpriseUrl: domain } : {}),
          };
        }

        if (token.error === 'authorization_pending') {
          await sleep(code.interval * 1000 + POLL_BUFFER_MS);
          continue;
        }

        if (token.error === 'slow_down') {
          const nextInterval = token.interval && token.interval > 0 ? token.interval : code.interval + 5;
          await sleep(nextInterval * 1000 + POLL_BUFFER_MS);
          continue;
        }

        throw new AppError('auth_failed', 'GitHub Copilot OAuth authorization failed.');
      }
    },
  };
}

function copilotOAuthUrls(enterpriseDomain?: string) {
  const domain = enterpriseDomain?.trim() || 'github.com';
  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    const origin = window.location.origin.replace(/\/$/, '');
    const suffix = enterpriseDomain ? `?enterpriseUrl=${encodeURIComponent(enterpriseDomain)}` : '';
    return {
      code: `${origin}/api/oauth/github-copilot/device/code${suffix}`,
      token: `${origin}/api/oauth/github-copilot/device/token${suffix}`,
    };
  }

  return {
    code: `https://${domain}/login/device/code`,
    token: `https://${domain}/login/oauth/access_token`,
  };
}

function isWebProxyNotFound(response: Response): boolean {
  return typeof window !== 'undefined' && response.status === 404;
}

function oauthProxyUnavailableError() {
  return new AppError(
    'auth_failed',
    'GitHub Copilot OAuth on web requires local API OAuth proxy routes. Start the app with `npm run start` and open web to enable /api/oauth routes.',
  );
}

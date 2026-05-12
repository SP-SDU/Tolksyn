import { AppError, providerHttpStatusToError } from '@/types/app-error';

type FetchLike = typeof fetch;

const COPILOT_HEADERS = {
  'User-Agent': 'GitHubCopilotChat/0.35.0',
  'Editor-Version': 'vscode/1.107.0',
  'Editor-Plugin-Version': 'copilot-chat/0.35.0',
  'Copilot-Integration-Id': 'vscode-chat',
} as const;

export type CopilotInitiator = 'user' | 'agent';

export function normalizeEnterpriseDomain(enterpriseUrl?: string): string | undefined {
  const value = enterpriseUrl?.trim();
  if (!value) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch (error) {
    throw new AppError('unsupported', 'Invalid GitHub Enterprise URL.', error);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError('unsupported', 'Invalid GitHub Enterprise URL protocol.');
  }

  if (parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new AppError('unsupported', 'GitHub Enterprise URL must be a hostname only.');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || isUnsafeEnterpriseHostname(hostname)) {
    throw new AppError('unsupported', 'Unsafe GitHub Enterprise hostname.');
  }

  if (hostname === 'github.com') {
    return undefined;
  }

  throw new AppError('unsupported', 'Custom GitHub Enterprise hosts are not enabled.');
}

function isUnsafeEnterpriseHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.includes(':') ||
    /^\d+(?:\.\d+){3}$/.test(hostname)
  );
}

export function copilotBase(enterpriseUrl?: string): string {
  const domain = normalizeEnterpriseDomain(enterpriseUrl);
  if (!domain) {
    return 'https://api.githubcopilot.com';
  }

  return `https://copilot-api.${domain}`;
}

export function isCopilotResponsesModel(modelId: string): boolean {
  const match = /^gpt-(\d+)/i.exec(modelId);
  if (!match) {
    return false;
  }

  const generation = Number(match[1]);
  return generation >= 5 && !modelId.startsWith('gpt-5-mini');
}

export function copilotTokenExchangeUrl(enterpriseUrl?: string): string {
  const domain = normalizeEnterpriseDomain(enterpriseUrl);
  if (!domain) {
    return 'https://api.github.com/copilot_internal/v2/token';
  }

  return `https://api.${domain}/copilot_internal/v2/token`;
}

export function copilotHeaders(accessToken: string, options?: { vision?: boolean; initiator?: CopilotInitiator }) {
  const initiator = options?.initiator ?? 'user';
  return {
    ...COPILOT_HEADERS,
    Authorization: `Bearer ${accessToken}`,
    'Openai-Intent': 'conversation-edits',
    'X-Initiator': initiator,
    ...(options?.vision ? { 'Copilot-Vision-Request': 'true' } : {}),
  };
}

export function copilotTokenExchangeHeaders(refreshToken: string) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${refreshToken}`,
    ...COPILOT_HEADERS,
  };
}

export function copilotModelHeaders(token: string) {
  return {
    ...COPILOT_HEADERS,
    Authorization: `Bearer ${token}`,
  };
}

export async function exchangeCopilotAccessToken({
  fetch,
  refreshToken,
  enterpriseUrl,
}: {
  fetch: FetchLike;
  refreshToken: string;
  enterpriseUrl?: string;
}): Promise<{ token: string; expiresAt: number }> {
  const response = await fetch(copilotTokenExchangeUrl(enterpriseUrl), {
    headers: copilotTokenExchangeHeaders(refreshToken),
  });

  if (!response.ok) {
    throw await providerHttpStatusToError(response);
  }

  const payload = (await response.json()) as {
    token?: string;
    expires_at?: number;
  };

  if (!payload.token?.trim()) {
    throw new AppError('auth_failed', 'GitHub Copilot token exchange did not return a token.');
  }

  return {
    token: payload.token,
    expiresAt: (payload.expires_at ?? 0) * 1000,
  };
}

import { AppError } from '@/types/app-error';

const PROHIBITED_QUERY_PATTERNS = [
  /ignore\s+(?:all\s+)?previous/i,
  /disregard\s+(?:all\s+)?previous/i,
  /system\s+prompt/i,
  /developer\s+message/i,
  /assistant\s+instructions/i,
  /prompt\s+injection/i,
  /jailbreak/i,
  /reveal\s+secrets?/i,
  /api\s+key/i,
  /password/i,
  /credentials?/i,
  /\btoken\b/i,
];

export function validateSafeHttpsUrl(value: string, kind = 'webfetch'): string {
  const trimmed = value.trim();
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    logUnsafeWebAttempt(`unsafe ${kind} URL`, 'malformed URL', trimmed);
    throw new AppError('unsupported', 'Unsafe URL: malformed URL.');
  }

  const reason = unsafeUrlReason(parsed);
  if (reason) {
    logUnsafeWebAttempt(`unsafe ${kind} URL`, reason, trimmed);
    throw new AppError('unsupported', `Unsafe URL: ${reason}.`);
  }

  parsed.hash = '';
  return parsed.href;
}

export function sanitizeSearchQuery(value: string): string {
  const query = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  const pattern = PROHIBITED_QUERY_PATTERNS.find((item) => item.test(query));
  if (pattern) {
    logUnsafeWebAttempt('unsafe websearch query', `prohibited phrase ${pattern.source}`, query);
    throw new AppError('unsupported', 'Unsafe search query: prohibited phrase.');
  }

  return query;
}

export function sanitizeUntrustedWebText(value: string, maxLength = 4000): string {
  return value
    .replace(/<\s*\//g, '<')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[`*_~^|\\[\]{}<>]+/g, ' ')
    .replace(/\b(system|user|assistant|developer)\s*:/gi, ' ')
    .replace(/ignore\s+(?:all\s+)?previous(?:\s+instructions?)?/gi, ' ')
    .replace(/disregard\s+(?:all\s+)?previous(?:\s+instructions?)?/gi, ' ')
    .replace(/system\s+prompt/gi, ' ')
    .replace(/developer\s+message/gi, ' ')
    .replace(/assistant\s+instructions/gi, ' ')
    .replace(/prompt\s+injection/gi, ' ')
    .replace(/jailbreak/gi, ' ')
    .replace(/reveal\s+secrets?/gi, ' ')
    .replace(/api\s+key|password|credentials?|\btoken\b/gi, ' ')
    .replace(/[()]+/g, ' ')
    .replace(/[^A-Za-z0-9\s.,;:/%+&'/?=\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function logUnsafeWebAttempt(kind: string, reason: string, value: string): void {
  console.warn(`[tolksyn] Blocked ${kind}:`, `${reason}; target=${redactedTarget(value)}`);
}

function unsafeUrlReason(parsed: URL): string | null {
  if (parsed.protocol !== 'https:') {
    return 'only HTTPS URLs are allowed';
  }

  if (parsed.username || parsed.password) {
    return 'credentials in URLs are not allowed';
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname) {
    return 'missing hostname';
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return 'local hostnames are not allowed';
  }

  if (hostname.includes(':')) {
    return 'IP literals are not allowed';
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4 && isUnsafeIpv4(ipv4)) {
    return 'private or reserved IP addresses are not allowed';
  }

  return null;
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function isUnsafeIpv4([a, b, c, d]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 ||
    (a === 255 && b === 255 && c === 255 && d === 255)
  );
}

function redactedTarget(value: string): string {
  try {
    const parsed = new URL(value.trim());
    return `${parsed.protocol}//${parsed.hostname || 'unknown'}`;
  } catch {
    return '[redacted]';
  }
}

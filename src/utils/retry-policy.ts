/**
 * Jitter prevents many queued sends from hitting ingest again at the same instant after an outage.
 */
export function computeRetryDelayMs({
  retryCount,
  random,
  baseDelayMs,
  maxDelayMs,
}: {
  retryCount: number;
  random: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}): number {
  const base = baseDelayMs ?? 500;
  const max = maxDelayMs ?? 30_000;
  const exponential = Math.min(max, base * 2 ** Math.max(retryCount - 1, 0));
  const jittered = Math.round(exponential * (0.5 + random()));
  return Math.min(max, Math.max(base, jittered));
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

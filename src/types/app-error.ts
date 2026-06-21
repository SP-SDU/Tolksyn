/** Callers branch on code because provider and network error text is not stable. */
export type AppErrorCode =
  | "permission_denied"
  | "timeout"
  | "network_unavailable"
  | "auth_failed"
  | "rate_limited"
  | "invalid_response"
  | "schema_violation"
  | "extraction_fallback"
  | "unsupported"
  | "internal";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export async function providerHttpStatusToError(
  response: Response,
): Promise<AppError> {
  const status = response.status;
  const detail = await providerErrorDetail(response);
  const message =
    detail.message ?? `Provider request failed with status ${status}.`;
  const normalized = detail.normalized;
  const quotaLike =
    normalized.includes("quota") ||
    normalized.includes("resource_exhausted") ||
    normalized.includes("insufficient_quota") ||
    normalized.includes("billing");
  const ratelimitLike =
    normalized.includes("rate limit") ||
    normalized.includes("too many requests");

  // Some providers return 403 with quota/billing wording instead of 429.
  if (status === 429 || (status === 403 && (quotaLike || ratelimitLike))) {
    return new AppError("rate_limited", message);
  }

  if (status === 401 || status === 403) {
    return new AppError("auth_failed", message);
  }

  if (status >= 500) {
    return new AppError("network_unavailable", message);
  }

  return new AppError("invalid_response", message);
}

async function providerErrorDetail(
  response: Response,
): Promise<{ normalized: string; message: string | null }> {
  try {
    const text = await response.text();
    if (!text.trim()) {
      return emptyProviderErrorDetail();
    }

    let message = text.trim();
    try {
      const parsed = JSON.parse(text) as unknown;
      const extracted = extractProviderErrorMessage(parsed);
      message = extracted ?? message;
    } catch {}

    const truncated = message.slice(0, 400);
    return {
      normalized: truncated.toLowerCase(),
      message: truncated,
    };
  } catch {
    return emptyProviderErrorDetail();
  }
}

function emptyProviderErrorDetail(): { normalized: string; message: null } {
  return { normalized: String(), message: null };
}

function extractProviderErrorMessage(input: unknown): string | undefined {
  if (typeof input === "string") {
    const value = input.trim();
    return value.length ? value : undefined;
  }

  const record = Object(input) as Record<string, unknown>;
  const direct =
    (typeof record.message === "string" && record.message.trim()) ||
    (typeof record.error_description === "string" &&
      record.error_description.trim()) ||
    (typeof record.detail === "string" && record.detail.trim());
  if (direct) {
    return direct;
  }

  const nested = record.error;
  return nested === undefined ? undefined : extractProviderErrorMessage(nested);
}

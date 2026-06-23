import { AppError } from "@/types/app-error";

const MIN_EXTRACTION_TIMEOUT_MS = 120_000;

export function normalizeRemoteError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  ) {
    return new AppError("timeout", "The extraction request timed out.", error);
  }

  if (
    (error instanceof TypeError && /network/i.test(error.message)) ||
    (error instanceof Error && /network request failed/i.test(error.message))
  ) {
    return new AppError(
      "network_unavailable",
      "The extraction request failed due to network unavailability.",
      error,
    );
  }

  if (error instanceof Error) {
    return new AppError(
      "internal",
      error.message || "The extraction request failed.",
      error,
    );
  }

  return new AppError("internal", "The extraction request failed.", error);
}

export function extractionTimeoutMs(timeoutMs: number): number {
  return Math.max(timeoutMs, MIN_EXTRACTION_TIMEOUT_MS);
}

export function providerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

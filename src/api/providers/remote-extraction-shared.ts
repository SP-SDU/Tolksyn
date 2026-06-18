import { AppError } from "@/types/app-error";
import { validateStructuredItem } from "@/types/item-schema";

import {
  AUXILIARY_ENVELOPE_KEY,
  normalizeAuxiliaryText,
  normalizeStructuredObjectKeys,
  parseLooseJson,
  readEnvelopeValue,
  STRUCTURED_ENVELOPE_KEY,
  toObjectValue,
} from "./remote-extraction-repair";

const MIN_EXTRACTION_TIMEOUT_MS = 120_000;

/**
 * Converts provider, fetch, and SDK failures into application error codes.
 * Retry behavior depends on AppError.code, so this keeps transport-specific
 * errors from leaking into the retry layer.
 */
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

/**
 * Enforces a lower timeout bound because remote vision extraction can be slow
 * even when the provider is behaving correctly.
 */
export function extractionTimeoutMs(timeoutMs: number): number {
  return Math.max(timeoutMs, MIN_EXTRACTION_TIMEOUT_MS);
}

/**
 * Parses a provider response into the strict internal extraction shape.
 *
 * The provider-facing boundary is intentionally tolerant of common LLM output
 * mistakes, but validateStructuredItem remains the final authority before data
 * reaches the confirmation flow.
 */
export function parseProviderJsonEnvelope(rawText: unknown) {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    throw new AppError(
      "invalid_response",
      "Provider response did not contain text output.",
    );
  }

  const parsed = parseLooseJson(rawText);
  if (!parsed.ok) {
    console.error("[tolksyn] Provider returned malformed JSON:", rawText);
    throw new AppError(
      "invalid_response",
      "Provider response did not contain valid JSON.",
      parsed.error,
    );
  }

  const envelope = parsed.value;

  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new AppError(
      "schema_violation",
      "Provider returned JSON in an unexpected shape.",
    );
  }

  const record = envelope as Record<string, unknown>;
  const structuredRaw = readEnvelopeValue(record, STRUCTURED_ENVELOPE_KEY);
  const auxiliaryRaw = readEnvelopeValue(record, AUXILIARY_ENVELOPE_KEY);
  const structuredObject = toObjectValue(structuredRaw);

  if (!structuredObject) {
    throw new AppError(
      "schema_violation",
      "Provider returned an invalid structured_json object.",
    );
  }

  // Repair only provider naming and simple scalar formatting mistakes.
  // Missing, incompatible, or semantically invalid fields are still rejected below.
  const normalizedStructured = normalizeStructuredObjectKeys(structuredObject);

  const validation = validateStructuredItem(normalizedStructured);

  if (!validation.success) {
    throw new AppError(
      "schema_violation",
      "Provider JSON failed schema validation.",
      validation.error,
    );
  }

  return {
    structuredJson: validation.data,
    auxiliaryText: normalizeAuxiliaryText(auxiliaryRaw),
  };
}

export function providerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

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
} from "./response-repair";

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

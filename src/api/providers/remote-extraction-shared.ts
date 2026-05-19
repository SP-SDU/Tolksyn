import { AppError } from '@/types/app-error';
import { emptyStructuredItem, validateStructuredItem } from '@/types/item-schema';

const MIN_EXTRACTION_TIMEOUT_MS = 120_000;

export function normalizeRemoteError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  ) {
    return new AppError('timeout', 'The extraction request timed out.', error);
  }

  if (
    (error instanceof TypeError && /network/i.test(error.message)) ||
    (error instanceof Error && /network request failed/i.test(error.message))
  ) {
    return new AppError('network_unavailable', 'The extraction request failed due to network unavailability.', error);
  }

  if (error instanceof Error) {
    return new AppError('internal', error.message || 'The extraction request failed.', error);
  }

  return new AppError('internal', 'The extraction request failed.', error);
}

export function extractionTimeoutMs(timeoutMs: number): number {
  return Math.max(1, timeoutMs, MIN_EXTRACTION_TIMEOUT_MS);
}


export function parseProviderJsonEnvelope(rawText: unknown) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new AppError('invalid_response', 'Provider response did not contain text output.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    console.error('[tolksyn] Provider returned malformed JSON:', rawText);
    throw new AppError('invalid_response', 'Provider response did not contain valid JSON.', error);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError('schema_violation', 'Provider returned JSON in an unexpected shape.');
  }

  const record = parsed as {
    structured_json?: unknown;
    auxiliary_text_optional?: unknown;
  };

  if (!record.structured_json || typeof record.structured_json !== 'object' || Array.isArray(record.structured_json)) {
    throw new AppError('schema_violation', 'Provider returned an invalid structured_json object.');
  }

  const validation = validateStructuredItem({
    ...emptyStructuredItem(),
    ...record.structured_json,
  });
  if (!validation.success) {
    throw new AppError('schema_violation', 'Provider JSON failed schema validation.', validation.error);
  }

  return {
    structuredJson: validation.data,
    auxiliaryText: normalizeAuxiliaryText(record.auxiliary_text_optional),
  };
}

function normalizeAuxiliaryText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return undefined;
}

export function providerErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

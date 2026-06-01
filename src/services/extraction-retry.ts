import { buildExtractionPrompt } from "@/api/providers/extraction-prompt";
import { providerErrorMessage } from "@/api/providers/remote-extraction-shared";
import type {
  ExtractionPromptAttempt,
  RemoteExtractionInput,
  RemoteExtractionProvider,
  RemoteExtractionResult,
} from "@/api/providers/remote-extraction-types";
import { RuntimeLimits } from "@/constants/runtime";
import { AppError } from "@/types/app-error";
import { emptyStructuredItem } from "@/types/item-schema";
import { createAbortError, isAbortError, throwIfAborted } from "@/utils/abort";

/**
 * Repair prompts recover parseable JSON, and empty output still lets the operator fill confirm manually.
 */
export async function extractWithRetries({
  fallbackProvider,
  input,
  extract,
}: {
  fallbackProvider: RemoteExtractionProvider;
  input: RemoteExtractionInput;
  extract: (input: RemoteExtractionInput) => Promise<RemoteExtractionResult>;
}): Promise<RemoteExtractionResult> {
  const attempts: ExtractionPromptAttempt[] = [];
  const basePrompt = input.prompt ?? buildExtractionPrompt();
  let prompt = basePrompt;
  let lastError = "";

  for (
    let index = 1;
    index <= RuntimeLimits.maxExtractionAttempts;
    index += 1
  ) {
    try {
      throwIfAborted(input.signal);
      const result = await extract({
        ...input,
        prompt,
      });
      throwIfAborted(input.signal);
      attempts.push({
        attempt: index,
        prompt,
        responseText: result.responseText,
      });

      return {
        ...result,
        extractionDiagnostics: {
          failed: false,
          attempts,
        },
      };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (input.signal?.aborted) {
        throw createAbortError();
      }

      const code = error instanceof AppError ? error.code : "internal";
      const message = providerErrorMessage(error);
      const repairDetails = buildRepairErrorDetails(error);
      attempts.push({
        attempt: index,
        prompt,
        error: message,
      });

      if (!isRetryable(code) || index >= RuntimeLimits.maxExtractionAttempts) {
        return {
          structuredJson: emptyStructuredItem(),
          barcodes: [],
          metadata: {
            provider: fallbackProvider,
            durationMs: 1,
            imageWidth: input.images[0]?.width ?? 0,
            imageHeight: input.images[0]?.height ?? 0,
          },
          extractionDiagnostics: {
            failed: true,
            finalError: message,
            fallbackStructuredJson: true,
            attempts,
          },
        };
      }

      lastError = message;
      prompt = buildRepairPrompt({
        basePrompt,
        attempt: index + 1,
        error: lastError,
        details: repairDetails,
      });
    }
  }

  return {
    structuredJson: emptyStructuredItem(),
    barcodes: [],
    metadata: {
      provider: fallbackProvider,
      durationMs: 1,
      imageWidth: input.images[0]?.width ?? 0,
      imageHeight: input.images[0]?.height ?? 0,
    },
    extractionDiagnostics: {
      failed: true,
      finalError: lastError || "Extraction failed.",
      fallbackStructuredJson: true,
      attempts,
    },
  };
}

function isRetryable(code: AppError["code"]) {
  return [
    "schema_violation",
    "invalid_response",
    "internal",
    "extraction_fallback",
  ].includes(code);
}

function buildRepairPrompt({
  basePrompt,
  attempt,
  error,
  details,
}: {
  basePrompt: string;
  attempt: number;
  error: string;
  details?: string;
}) {
  return [
    basePrompt,
    `RETRY ATTEMPT ${attempt}.`,
    `Previous error: ${error}`,
    details ? `Validation details: ${details}` : "",
    "Fix your previous output and return one single valid JSON object only.",
    "No markdown, no prose, no code fences, no partial fragments.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildRepairErrorDetails(error: unknown): string | undefined {
  if (!(error instanceof AppError) || !error.cause) {
    return undefined;
  }

  const fieldErrors = extractFieldErrors(error.cause);
  if (!fieldErrors) {
    return undefined;
  }

  const lines = Object.entries(fieldErrors)
    .map(([field, messages]) => {
      if (!Array.isArray(messages) || messages.length === 0) {
        return undefined;
      }

      return `${field}: ${messages.map((message) => String(message)).join(", ")}`;
    })
    .filter((line): line is string => Boolean(line));

  if (!lines.length) {
    return undefined;
  }

  return lines.join("; ");
}

function extractFieldErrors(
  value: unknown,
): Record<string, unknown[] | string[]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as { fieldErrors?: unknown };
  if (!record.fieldErrors || typeof record.fieldErrors !== "object") {
    return undefined;
  }

  return record.fieldErrors as Record<string, unknown[] | string[]>;
}

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
}: {
  basePrompt: string;
  attempt: number;
  error: string;
}) {
  return [
    basePrompt,
    `RETRY ATTEMPT ${attempt}.`,
    `Previous error: ${error}`,
    "Fix your previous output and return one single valid JSON object only.",
    "No markdown, no prose, no code fences, no partial fragments.",
  ]
    .filter(Boolean)
    .join(" ");
}

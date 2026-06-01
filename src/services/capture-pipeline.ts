import { getErrorMessage } from "@/types/app-error";
import type { AttemptImage } from "@/types/attempt-image";
import { emptyStructuredItem, type StructuredItem } from "@/types/item-schema";
import { isAbortError, throwIfAborted } from "@/utils/abort";
import {
  mergeExtractionResult,
  type BarcodeHit,
  type WebSearchEnrichment,
} from "@/utils/merge-extraction-result";

/**
 * Confirm must stay reachable when barcode or VLM fails, and cancel after create must not orphan files.
 */
export async function processImage({
  source,
  inputUris,
  liveBarcodes,
  now,
  createAttemptId,
  imageStore,
  attempts,
  barcodeDetector,
  extractor,
  webSearchEnricher,
  onProgress,
  signal,
}: {
  source: "camera" | "gallery";
  inputUris: string[];
  liveBarcodes?: BarcodeHit[];
  signal?: AbortSignal;
  now: () => number;
  createAttemptId: () => string;
  imageStore: {
    persistImages(input: { inputUris: string[]; attemptId: string }): Promise<
      {
        imageUri: string;
        thumbnailUri: string;
        imageBase64: string;
        mimeType: string;
        width: number;
        height: number;
      }[]
    >;
  };
  attempts: {
    create(input: {
      id: string;
      source: "camera" | "gallery";
      images: AttemptImage[];
      createdAt: number;
    }): Promise<unknown>;
    saveExtractionResult(
      attemptId: string,
      result: ReturnType<typeof mergeExtractionResult>,
    ): Promise<unknown>;
    markFailed?(attemptId: string, errorCode: string): Promise<unknown>;
    deleteById?(attemptId: string): Promise<unknown>;
  };
  barcodeDetector: {
    detect(input: {
      imageUris: string[];
      signal?: AbortSignal;
    }): Promise<BarcodeHit[]>;
  };
  extractor: {
    extract(input: {
      images: {
        imageUri: string;
        imageBase64: string;
        mimeType: string;
        width: number;
        height: number;
      }[];
      prompt?: string;
      signal?: AbortSignal;
    }): Promise<{
      structuredJson: StructuredItem;
      barcodes: BarcodeHit[];
      auxiliaryText?: string;
      responseText?: string;
      extractionDiagnostics?: {
        failed: boolean;
        finalError?: string;
        fallbackStructuredJson?: boolean;
        attempts: {
          attempt: number;
          prompt: string;
          responseText?: string;
          error?: string;
        }[];
      };
      metadata: {
        provider: string;
        durationMs: number;
        imageWidth: number;
        imageHeight: number;
      };
    }>;
  };
  webSearchEnricher?: {
    enrich(input: {
      images: {
        imageUri: string;
        imageBase64: string;
        mimeType: string;
        width: number;
        height: number;
      }[];
      structuredJson: Awaited<
        ReturnType<typeof extractor.extract>
      >["structuredJson"];
      barcodes: BarcodeHit[];
      auxiliaryText?: string;
      responseText?: string;
      signal?: AbortSignal;
    }): Promise<
      | {
          structuredJson: Awaited<
            ReturnType<typeof extractor.extract>
          >["structuredJson"];
          diagnostics: WebSearchEnrichment;
        }
      | undefined
    >;
  };
  onProgress?: (
    stage:
      | "persisted"
      | "barcode_started"
      | "barcode_done"
      | "extraction_started"
      | "extraction_done"
      | "websearch_started"
      | "websearch_done",
  ) => void;
}): Promise<{ attemptId: string }> {
  const attemptId = createAttemptId();
  let created = false;

  try {
    throwIfAborted(signal);
    const persisted = await imageStore.persistImages({ inputUris, attemptId });
    throwIfAborted(signal);
    const createdAt = now();
    onProgress?.("persisted");

    await attempts.create({
      id: attemptId,
      source,
      images: persisted.map((p) => ({
        imageUri: p.imageUri,
        thumbnailUri: p.thumbnailUri,
      })),
      createdAt,
    });
    created = true;
    throwIfAborted(signal);

    const [detectedBarcodes, extracted] = await Promise.all([
      // Barcode runs alongside extraction so confirm screen latency stays bounded.
      (async () => {
        onProgress?.("barcode_started");
        try {
          throwIfAborted(signal);
          const barcodes = await barcodeDetector.detect({
            imageUris: persisted.map((p) => p.imageUri),
            signal,
          });
          throwIfAborted(signal);
          onProgress?.("barcode_done");
          return barcodes;
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) {
            throw error;
          }

          console.error("[tolksyn] Barcode detection failed:", error);
          onProgress?.("barcode_done");
          return [];
        }
      })(),
      (async () => {
        onProgress?.("extraction_started");
        try {
          throwIfAborted(signal);
          const extraction = await extractor.extract({
            images: persisted.map((p) => ({
              imageUri: p.imageUri,
              imageBase64: p.imageBase64,
              mimeType: p.mimeType,
              width: p.width,
              height: p.height,
            })),
            signal,
          });
          throwIfAborted(signal);
          onProgress?.("extraction_done");
          return extraction;
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) {
            throw error;
          }

          onProgress?.("extraction_done");
          return failedExtractionResult({
            error,
            width: persisted[0]?.width ?? 0,
            height: persisted[0]?.height ?? 0,
          });
        }
      })(),
    ]);
    throwIfAborted(signal);

    const allBarcodes = [
      ...(liveBarcodes ?? []),
      ...detectedBarcodes,
      ...extracted.barcodes,
    ];
    if (webSearchEnricher) {
      onProgress?.("websearch_started");
    }
    const webSearch = await enrichWithWebSearch({
      webSearchEnricher,
      images: persisted.map((p) => ({
        imageUri: p.imageUri,
        imageBase64: p.imageBase64,
        mimeType: p.mimeType,
        width: p.width,
        height: p.height,
      })),
      structuredJson: extracted.structuredJson,
      barcodes: allBarcodes,
      auxiliaryText: extracted.auxiliaryText,
      responseText: extracted.responseText,
      signal,
    });
    throwIfAborted(signal);
    if (webSearchEnricher) {
      onProgress?.("websearch_done");
    }

    const merged = mergeExtractionResult({
      structuredJson: webSearch.structuredJson,
      barcodes: allBarcodes,
      auxiliaryText: extracted.auxiliaryText,
      responseText: extracted.responseText,
      extractionDiagnostics: extracted.extractionDiagnostics,
      webSearchEnrichment: webSearch.diagnostics,
      metadata: extracted.metadata,
    });

    throwIfAborted(signal);
    await attempts.saveExtractionResult(attemptId, merged);

    if (merged.extractionDiagnostics?.failed && attempts.markFailed) {
      await attempts.markFailed(
        attemptId,
        merged.extractionDiagnostics.finalError || "extract_failed",
      );
    }

    return { attemptId };
  } catch (error) {
    // User cancel after persist should not leave a half-baked attempt in history.
    if ((isAbortError(error) || signal?.aborted) && created) {
      await attempts.deleteById?.(attemptId);
    }

    throw error;
  }
}

function failedExtractionResult({
  error,
  width,
  height,
}: {
  error: unknown;
  width: number;
  height: number;
}) {
  const message = getErrorMessage(error, "Extraction failed.");

  return {
    structuredJson: emptyStructuredItem(),
    barcodes: [],
    auxiliaryText: undefined,
    responseText: undefined,
    extractionDiagnostics: {
      failed: true,
      finalError: message,
      fallbackStructuredJson: true,
      attempts: [
        {
          attempt: 1,
          prompt: "",
          error: message,
        },
      ],
    },
    metadata: {
      provider: "remote_failed",
      durationMs: 1,
      imageWidth: width,
      imageHeight: height,
    },
  };
}

async function enrichWithWebSearch({
  webSearchEnricher,
  images,
  structuredJson,
  barcodes,
  auxiliaryText,
  responseText,
  signal,
}: {
  webSearchEnricher?: Parameters<typeof processImage>[0]["webSearchEnricher"];
  images: {
    imageUri: string;
    imageBase64: string;
    mimeType: string;
    width: number;
    height: number;
  }[];
  structuredJson: StructuredItem;
  barcodes: BarcodeHit[];
  auxiliaryText?: string;
  responseText?: string;
  signal?: AbortSignal;
}): Promise<{
  structuredJson: StructuredItem;
  diagnostics?: WebSearchEnrichment;
}> {
  if (!webSearchEnricher) {
    return { structuredJson };
  }

  try {
    throwIfAborted(signal);
    const enriched = await webSearchEnricher.enrich({
      images,
      structuredJson,
      barcodes,
      auxiliaryText,
      responseText,
      signal,
    });
    throwIfAborted(signal);

    return enriched ?? { structuredJson };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw error;
    }

    return {
      structuredJson,
      diagnostics: {
        enabled: true,
        attempts: [],
        queries: [],
        searchResults: [],
        sources: [],
        fieldChanges: [],
        conflicts: [],
        failed: true,
        error: getErrorMessage(error, "Manufacturer web search failed."),
        durationMs: 0,
      },
    };
  }
}

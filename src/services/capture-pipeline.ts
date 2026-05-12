import { mergeExtractionResult, type BarcodeHit, type WebSearchEnrichment } from '@/utils/merge-extraction-result';
import { getErrorMessage } from '@/types/app-error';
import { emptyStructuredItem, type StructuredItem } from '@/types/item-schema';
import { isAbortError, throwIfAborted } from '@/utils/abort';

export async function processImage({
  source,
  inputUri,
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
  source: 'camera' | 'gallery';
  inputUri: string;
  liveBarcodes?: BarcodeHit[];
  signal?: AbortSignal;
  now: () => number;
  createAttemptId: () => string;
  imageStore: {
    persistImage(input: { inputUri: string; attemptId: string }): Promise<{
      imageUri: string;
      thumbnailUri: string;
      imageBase64: string;
      mimeType: string;
      width: number;
      height: number;
    }>;
  };
  attempts: {
    create(input: {
      id: string;
      source: 'camera' | 'gallery';
      imageUri: string;
      thumbnailUri: string;
      createdAt: number;
    }): Promise<unknown>;
    saveExtractionResult(attemptId: string, result: ReturnType<typeof mergeExtractionResult>): Promise<unknown>;
    markFailed?(attemptId: string, errorCode: string): Promise<unknown>;
    deleteById?(attemptId: string): Promise<unknown>;
  };
  barcodeDetector: {
    detect(input: { imageUri: string; signal?: AbortSignal }): Promise<BarcodeHit[]>;
  };
  extractor: {
    extract(input: {
      imageUri: string;
      imageBase64: string;
      mimeType: string;
      width: number;
      height: number;
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
      imageUri: string;
      imageBase64: string;
      mimeType: string;
      width: number;
      height: number;
      structuredJson: Awaited<ReturnType<typeof extractor.extract>>['structuredJson'];
      barcodes: BarcodeHit[];
      auxiliaryText?: string;
      responseText?: string;
      signal?: AbortSignal;
    }): Promise<{
      structuredJson: Awaited<ReturnType<typeof extractor.extract>>['structuredJson'];
      diagnostics: WebSearchEnrichment;
    } | undefined>;
  };
  onProgress?: (stage: 'persisted' | 'barcode_started' | 'barcode_done' | 'extraction_started' | 'extraction_done' | 'websearch_started' | 'websearch_done') => void;
}): Promise<{ attemptId: string }> {
  const attemptId = createAttemptId();
  let created = false;

  try {
    throwIfAborted(signal);
    const persisted = await imageStore.persistImage({ inputUri, attemptId });
    throwIfAborted(signal);
    const createdAt = now();
    onProgress?.('persisted');

    await attempts.create({
      id: attemptId,
      source,
      imageUri: persisted.imageUri,
      thumbnailUri: persisted.thumbnailUri,
      createdAt,
    });
    created = true;
    throwIfAborted(signal);

    const [detectedBarcodes, extracted] = await Promise.all([
      (async () => {
        onProgress?.('barcode_started');
        try {
          throwIfAborted(signal);
          const barcodes = await barcodeDetector.detect({ imageUri: persisted.imageUri, signal });
          throwIfAborted(signal);
          onProgress?.('barcode_done');
          return barcodes;
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) {
            throw error;
          }

          console.error('[tolksyn] Barcode detection failed:', error);
          onProgress?.('barcode_done');
          return [];
        }
      })(),
      (async () => {
        onProgress?.('extraction_started');
        try {
          throwIfAborted(signal);
          const extraction = await extractor.extract({
            imageUri: persisted.imageUri,
            imageBase64: persisted.imageBase64,
            mimeType: persisted.mimeType,
            width: persisted.width,
            height: persisted.height,
            signal,
          });
          throwIfAborted(signal);
          onProgress?.('extraction_done');
          return extraction;
        } catch (error) {
          if (isAbortError(error) || signal?.aborted) {
            throw error;
          }

          onProgress?.('extraction_done');
          return failedExtractionResult({
            error,
            width: persisted.width,
            height: persisted.height,
          });
        }
      })(),
    ]);
    throwIfAborted(signal);

    const allBarcodes = [...(liveBarcodes ?? []), ...detectedBarcodes, ...extracted.barcodes];
    if (webSearchEnricher) {
      onProgress?.('websearch_started');
    }
    const webSearch = await enrichWithWebSearch({
      webSearchEnricher,
      imageUri: persisted.imageUri,
      imageBase64: persisted.imageBase64,
      mimeType: persisted.mimeType,
      width: persisted.width,
      height: persisted.height,
      structuredJson: extracted.structuredJson,
      barcodes: allBarcodes,
      auxiliaryText: extracted.auxiliaryText,
      responseText: extracted.responseText,
      signal,
    });
    throwIfAborted(signal);
    if (webSearchEnricher) {
      onProgress?.('websearch_done');
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
      await attempts.markFailed(attemptId, merged.extractionDiagnostics.finalError || 'extract_failed');
    }

    return { attemptId };
  } catch (error) {
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
  const message = getErrorMessage(error, 'Extraction failed.');

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
          prompt: '',
          error: message,
        },
      ],
    },
    metadata: {
      provider: 'remote_failed',
      durationMs: 1,
      imageWidth: width,
      imageHeight: height,
    },
  };
}

async function enrichWithWebSearch({
  webSearchEnricher,
  imageUri,
  imageBase64,
  mimeType,
  width,
  height,
  structuredJson,
  barcodes,
  auxiliaryText,
  responseText,
  signal,
}: {
  webSearchEnricher?: Parameters<typeof processImage>[0]['webSearchEnricher'];
  imageUri: string;
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
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
      imageUri,
      imageBase64,
      mimeType,
      width,
      height,
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
        error: getErrorMessage(error, 'Manufacturer web search failed.'),
        durationMs: 0,
      },
    };
  }
}

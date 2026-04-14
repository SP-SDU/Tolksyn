import { mergeExtractionResult, type BarcodeHit } from '@/utils/merge-extraction-result';

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
  onProgress,
}: {
  source: 'camera' | 'gallery';
  inputUri: string;
  liveBarcodes?: BarcodeHit[];
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
  };
  barcodeDetector: {
    detect(input: { imageUri: string }): Promise<BarcodeHit[]>;
  };
  extractor: {
    extract(input: {
      imageUri: string;
      imageBase64: string;
      mimeType: string;
      width: number;
      height: number;
    }): Promise<{
      structuredJson: Record<string, unknown>;
      barcodes: BarcodeHit[];
      auxiliaryText?: string;
      metadata: {
        provider: string;
        durationMs: number;
        imageWidth: number;
        imageHeight: number;
      };
    }>;
  };
  onProgress?: (stage: 'persisted' | 'barcode_started' | 'barcode_done' | 'extraction_started' | 'extraction_done') => void;
}): Promise<{ attemptId: string }> {
  const attemptId = createAttemptId();
  const persisted = await imageStore.persistImage({ inputUri, attemptId });
  const createdAt = now();
  onProgress?.('persisted');

  await attempts.create({
    id: attemptId,
    source,
    imageUri: persisted.imageUri,
    thumbnailUri: persisted.thumbnailUri,
    createdAt,
  });

  const [detectedBarcodes, extracted] = await Promise.all([
    (async () => {
      onProgress?.('barcode_started');
      const barcodes = await barcodeDetector.detect({ imageUri: persisted.imageUri });
      onProgress?.('barcode_done');
      return barcodes;
    })(),
    (async () => {
      onProgress?.('extraction_started');
      const extraction = await extractor.extract({
        imageUri: persisted.imageUri,
        imageBase64: persisted.imageBase64,
        mimeType: persisted.mimeType,
        width: persisted.width,
        height: persisted.height,
      });
      onProgress?.('extraction_done');
      return extraction;
    })(),
  ]);

  const merged = mergeExtractionResult({
    structuredJson: extracted.structuredJson as ReturnType<typeof mergeExtractionResult>['structuredJson'],
    barcodes: [...(liveBarcodes ?? []), ...detectedBarcodes, ...extracted.barcodes],
    auxiliaryText: extracted.auxiliaryText,
    metadata: extracted.metadata,
  });

  await attempts.saveExtractionResult(attemptId, merged);

  return { attemptId };
}

import { processImage } from '@/services/capture-pipeline';
import { emptyStructuredItem } from '@/types/item-schema';

describe('processImage', () => {
  test('creates an attempt and saves merged extraction output', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);
    const result = await processImage({
      source: 'camera',
      inputUri: 'file://input.jpg',
      liveBarcodes: [{ type: 'ean13', data: '4046356160483' }],
      now: () => 123,
      createAttemptId: () => 'attempt-123',
      imageStore: {
        persistImage: jest.fn().mockResolvedValue({
          imageUri: 'file://stored.jpg',
          thumbnailUri: 'file://thumb.jpg',
          imageBase64: 'abc',
          mimeType: 'image/jpeg',
          width: 1200,
          height: 900,
        }),
      },
      attempts: {
        create,
        saveExtractionResult,
      },
      barcodeDetector: {
        detect: jest.fn().mockResolvedValue([{ type: 'ean13', data: '4046356160483' }]),
      },
      extractor: {
        extract: jest.fn().mockResolvedValue({
          structuredJson: {
            ...emptyStructuredItem(),
            manufacturer: 'Siemens',
          },
          barcodes: [],
          metadata: {
            provider: 'remote_openai_compatible',
            durationMs: 1400,
            imageWidth: 1200,
            imageHeight: 900,
          },
        }),
      },
    });

    expect(result).toEqual({ attemptId: 'attempt-123' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'attempt-123',
        source: 'camera',
        imageUri: 'file://stored.jpg',
      }),
    );
    expect(saveExtractionResult).toHaveBeenCalledWith(
      'attempt-123',
      expect.objectContaining({
        structuredJson: expect.objectContaining({ manufacturer: 'Siemens' }),
        barcodeEnrichment: expect.objectContaining({
          detected: [{ type: 'ean13', data: '4046356160483' }],
        }),
      }),
    );
  });

  test('runs manufacturer web search enrichment after extraction and saves reconciled output', async () => {
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);
    const stages: string[] = [];

    await processImage({
      source: 'camera',
      inputUri: 'file://input.jpg',
      now: () => 123,
      createAttemptId: () => 'attempt-websearch',
      imageStore: {
        persistImage: jest.fn().mockResolvedValue({
          imageUri: 'file://stored.jpg',
          thumbnailUri: 'file://thumb.jpg',
          imageBase64: 'abc',
          mimeType: 'image/jpeg',
          width: 1200,
          height: 900,
        }),
      },
      attempts: {
        create: jest.fn().mockResolvedValue(undefined),
        saveExtractionResult,
      },
      barcodeDetector: {
        detect: jest.fn().mockResolvedValue([{ type: 'ean13', data: '4046356160483' }]),
      },
      extractor: {
        extract: jest.fn().mockResolvedValue({
          structuredJson: {
            ...emptyStructuredItem(),
            productNumber: '2865463',
          },
          barcodes: [],
          auxiliaryText: 'label text',
          metadata: {
            provider: 'remote_openai_compatible',
            durationMs: 1400,
            imageWidth: 1200,
            imageHeight: 900,
          },
        }),
      },
      webSearchEnricher: {
        enrich: jest.fn().mockResolvedValue({
          structuredJson: {
            ...emptyStructuredItem(),
            manufacturer: 'Phoenix Contact',
            productNumber: '2865463',
          },
          diagnostics: {
            enabled: true,
            attempts: [],
            queries: ['Phoenix Contact 2865463 official datasheet'],
            searchResults: [
              {
                query: 'Phoenix Contact 2865463 official datasheet',
                output: 'official product result',
                urls: ['https://example.com/product'],
              },
            ],
            sources: [{ url: 'https://example.com/product', excerpt: 'official product page' }],
            fieldChanges: [
              {
                field: 'manufacturer',
                before: null,
                after: 'Phoenix Contact',
                evidenceUrls: ['https://example.com/product'],
              },
            ],
            conflicts: [],
            failed: false,
            durationMs: 25,
          },
        }),
      },
      onProgress: (stage) => stages.push(stage),
    });

    expect(stages).toEqual(expect.arrayContaining(['websearch_started', 'websearch_done']));

    expect(saveExtractionResult).toHaveBeenCalledWith(
      'attempt-websearch',
      expect.objectContaining({
        structuredJson: expect.objectContaining({
          manufacturer: 'Phoenix Contact',
          productNumber: '2865463',
        }),
        webSearchEnrichment: expect.objectContaining({
          queries: ['Phoenix Contact 2865463 official datasheet'],
          fieldChanges: [expect.objectContaining({ field: 'manufacturer', after: 'Phoenix Contact' })],
          sources: [expect.objectContaining({ url: 'https://example.com/product' })],
        }),
      }),
    );
  });

  test('keeps extraction result when manufacturer web search enrichment fails', async () => {
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);

    await processImage({
      source: 'camera',
      inputUri: 'file://input.jpg',
      now: () => 123,
      createAttemptId: () => 'attempt-websearch-failed',
      imageStore: {
        persistImage: jest.fn().mockResolvedValue({
          imageUri: 'file://stored.jpg',
          thumbnailUri: 'file://thumb.jpg',
          imageBase64: 'abc',
          mimeType: 'image/jpeg',
          width: 1200,
          height: 900,
        }),
      },
      attempts: {
        create: jest.fn().mockResolvedValue(undefined),
        saveExtractionResult,
      },
      barcodeDetector: {
        detect: jest.fn().mockResolvedValue([]),
      },
      extractor: {
        extract: jest.fn().mockResolvedValue({
          structuredJson: {
            ...emptyStructuredItem(),
            productNumber: '2865463',
          },
          barcodes: [],
          metadata: {
            provider: 'remote_openai_compatible',
            durationMs: 1400,
            imageWidth: 1200,
            imageHeight: 900,
          },
        }),
      },
      webSearchEnricher: {
        enrich: jest.fn().mockRejectedValue(new Error('Exa unavailable')),
      },
    });

    expect(saveExtractionResult).toHaveBeenCalledWith(
      'attempt-websearch-failed',
      expect.objectContaining({
        structuredJson: expect.objectContaining({
          productNumber: '2865463',
        }),
        webSearchEnrichment: expect.objectContaining({
          enabled: true,
          failed: true,
          error: 'Exa unavailable',
        }),
      }),
    );
  });

  test('marks attempt as extract_failed when extraction diagnostics report fallback', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);
    const markFailed = jest.fn().mockResolvedValue(undefined);

    await processImage({
      source: 'gallery',
      inputUri: 'file://input.jpg',
      now: () => 123,
      createAttemptId: () => 'attempt-xyz',
      imageStore: {
        persistImage: jest.fn().mockResolvedValue({
          imageUri: 'file://stored.jpg',
          thumbnailUri: 'file://thumb.jpg',
          imageBase64: 'abc',
          mimeType: 'image/jpeg',
          width: 1200,
          height: 900,
        }),
      },
      attempts: {
        create,
        saveExtractionResult,
        markFailed,
      },
      barcodeDetector: {
        detect: jest.fn().mockResolvedValue([]),
      },
      extractor: {
        extract: jest.fn().mockResolvedValue({
          structuredJson: emptyStructuredItem(),
          barcodes: [],
          extractionDiagnostics: {
            failed: true,
            finalError: 'Provider JSON failed schema validation.',
            attempts: [],
          },
          metadata: {
            provider: 'remote_openai_codex',
            durationMs: 1000,
            imageWidth: 1200,
            imageHeight: 900,
          },
        }),
      },
    });

    expect(markFailed).toHaveBeenCalledWith('attempt-xyz', 'Provider JSON failed schema validation.');
  });

  test('saves failed extraction result instead of throwing raw extractor errors', async () => {
    const saveExtractionResult = jest.fn().mockResolvedValue(undefined);
    const markFailed = jest.fn().mockResolvedValue(undefined);

    const result = await processImage({
      source: 'camera',
      inputUri: 'file://input.jpg',
      now: () => 123,
      createAttemptId: () => 'attempt-json-error',
      imageStore: {
        persistImage: jest.fn().mockResolvedValue({
          imageUri: 'file://stored.jpg',
          thumbnailUri: 'file://thumb.jpg',
          imageBase64: 'abc',
          mimeType: 'image/jpeg',
          width: 1200,
          height: 900,
        }),
      },
      attempts: {
        create: jest.fn().mockResolvedValue(undefined),
        saveExtractionResult,
        markFailed,
      },
      barcodeDetector: {
        detect: jest.fn().mockResolvedValue([]),
      },
      extractor: {
        extract: jest.fn().mockRejectedValue(new SyntaxError('Unterminated string in JSON at position 28')),
      },
    });

    expect(result).toEqual({ attemptId: 'attempt-json-error' });
    expect(saveExtractionResult).toHaveBeenCalledWith(
      'attempt-json-error',
      expect.objectContaining({
        structuredJson: emptyStructuredItem(),
        extractionDiagnostics: expect.objectContaining({
          failed: true,
          finalError: 'Unterminated string in JSON at position 28',
        }),
      }),
    );
    expect(markFailed).toHaveBeenCalledWith('attempt-json-error', 'Unterminated string in JSON at position 28');
  });
});

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
});

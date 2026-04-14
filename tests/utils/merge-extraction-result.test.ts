import { emptyStructuredItem } from '@/types/item-schema';
import { mergeExtractionResult } from '@/utils/merge-extraction-result';

describe('mergeExtractionResult', () => {
  test('keeps extracted fields and enriches with barcode suggestions', () => {
    const result = mergeExtractionResult({
      structuredJson: {
        ...emptyStructuredItem(),
        manufacturer: 'Phoenix Contact',
        productNumber: '2865463',
        eanOrUpc: null,
      },
      barcodes: [
        { type: 'ean13', data: '4046356160483' },
        { type: 'ean13', data: '4046356160483' },
      ],
      auxiliaryText: 'Isolation Switch Amplifier',
      metadata: {
        provider: 'remote_openai_compatible',
        durationMs: 1200,
        imageWidth: 1200,
        imageHeight: 900,
      },
    });

    expect(result.structuredJson.manufacturer).toBe('Phoenix Contact');
    expect(result.structuredJson.productNumber).toBe('2865463');
    expect(result.barcodeEnrichment.detected).toHaveLength(1);
    expect(result.barcodeEnrichment.relatedFieldSuggestions.eanOrUpc).toBe('4046356160483');
    expect(result.barcodeEnrichment.conflicts).toHaveLength(0);
  });

  test('keeps conflicting barcodes without overwriting extracted values', () => {
    const result = mergeExtractionResult({
      structuredJson: {
        ...emptyStructuredItem(),
        eanOrUpc: '1111111111111',
      },
      barcodes: [
        { type: 'ean13', data: '2222222222222' },
        { type: 'ean13', data: '3333333333333' },
      ],
      metadata: {
        provider: 'remote_gemini',
        durationMs: 900,
        imageWidth: 800,
        imageHeight: 600,
      },
    });

    expect(result.structuredJson.eanOrUpc).toBe('1111111111111');
    expect(result.barcodeEnrichment.conflicts).toEqual([
      {
        field: 'eanOrUpc',
        values: ['2222222222222', '3333333333333'],
      },
    ]);
  });

  test('keeps multiple barcode types in enrichment without conflicts', () => {
    const result = mergeExtractionResult({
      structuredJson: {
        ...emptyStructuredItem(),
        eanOrUpc: null,
      },
      barcodes: [
        { type: 'ean13', data: '4046356160483' },
        { type: 'code128', data: 'PC-2865463' },
        { type: 'qr', data: 'https://example.com/product/2865463' },
      ],
      metadata: {
        provider: 'remote_openai_compatible',
        durationMs: 500,
        imageWidth: 1000,
        imageHeight: 1000,
      },
    });

    expect(result.barcodeEnrichment.detected).toEqual([
      { type: 'ean13', data: '4046356160483' },
      { type: 'code128', data: 'PC-2865463' },
      { type: 'qr', data: 'https://example.com/product/2865463' },
    ]);
    expect(result.barcodeEnrichment.relatedFieldSuggestions.eanOrUpc).toBe('4046356160483');
    expect(result.barcodeEnrichment.conflicts).toEqual([]);
  });
});

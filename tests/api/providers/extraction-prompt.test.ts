import { buildExtractionPrompt } from '@/api/providers/extraction-prompt';

describe('buildExtractionPrompt', () => {
  test('includes required response keys and all structured fields', () => {
    const prompt = buildExtractionPrompt();

    expect(prompt).toContain('structured_json');
    expect(prompt).toContain('auxiliary_text_optional');

    expect(prompt).toContain('sku');
    expect(prompt).toContain('manufacturer');
    expect(prompt).toContain('productNumber');
    expect(prompt).toContain('eanOrUpc');
    expect(prompt).toContain('quantity');
    expect(prompt).toContain('priceEur');
    expect(prompt).toContain('weightKg');
    expect(prompt).toContain('link');
  });

  test('forces strict json-only response guidance', () => {
    const prompt = buildExtractionPrompt();

    expect(prompt).toContain('Return only valid JSON');
    expect(prompt).toContain('Do not add markdown');
  });
});

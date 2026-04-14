import { AppError } from '@/types/app-error';
import { emptyStructuredItem } from '@/types/item-schema';
import { extractWithRetries } from '@/services/extraction-retry';

describe('extractWithRetries', () => {
  test('retries parse errors and returns success diagnostics on later success', async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(new AppError('schema_violation', 'Provider JSON failed schema validation.'))
      .mockResolvedValueOnce({
        structuredJson: {
          ...emptyStructuredItem(),
          manufacturer: 'Siemens',
        },
        barcodes: [],
        responseText: '{"structured_json":{"manufacturer":"Siemens"}}',
        metadata: {
          provider: 'remote_openai_compatible',
          durationMs: 1234,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    const result = await extractWithRetries({
      input: {
        endpointUrl: 'https://example.com',
        apiKey: 'k',
        model: 'm',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
      },
      extract,
    });

    expect(extract).toHaveBeenCalledTimes(2);
    expect(result.extractionDiagnostics?.failed).toBe(false);
    expect(result.extractionDiagnostics?.attempts).toHaveLength(2);
  });

  test('falls back to empty structured item after retry exhaustion', async () => {
    const extract = jest.fn().mockRejectedValue(new AppError('schema_violation', 'bad json'));

    const result = await extractWithRetries({
      input: {
        endpointUrl: 'https://example.com',
        apiKey: 'k',
        model: 'm',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
      },
      extract,
    });

    expect(extract).toHaveBeenCalledTimes(3);
    expect(result.extractionDiagnostics?.failed).toBe(true);
    expect(result.structuredJson).toEqual(emptyStructuredItem());
    expect(result.extractionDiagnostics?.attempts).toHaveLength(3);
  });
});

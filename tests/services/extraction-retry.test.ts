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
      fallbackProvider: 'remote_openai_compatible',
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
      fallbackProvider: 'remote_gemini',
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
    expect(result.metadata.provider).toBe('remote_gemini');
    expect(result.extractionDiagnostics?.failed).toBe(true);
    expect(result.structuredJson).toEqual(emptyStructuredItem());
    expect(result.extractionDiagnostics?.attempts).toHaveLength(3);
  });

  test('uses caller provided prompt for the first attempt and repair prompt base', async () => {
    const extract = jest
      .fn()
      .mockRejectedValueOnce(new AppError('schema_violation', 'bad json'))
      .mockResolvedValueOnce({
        structuredJson: emptyStructuredItem(),
        barcodes: [],
        metadata: {
          provider: 'remote_openai_compatible',
          durationMs: 1,
          imageWidth: 100,
          imageHeight: 100,
        },
      });

    await extractWithRetries({
      fallbackProvider: 'remote_openai_compatible',
      input: {
        endpointUrl: 'https://example.com',
        apiKey: 'k',
        model: 'm',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
        prompt: 'Return query JSON only.',
      },
      extract,
    });

    expect(extract).toHaveBeenNthCalledWith(1, expect.objectContaining({
      prompt: 'Return query JSON only.',
    }));
    expect(extract).toHaveBeenNthCalledWith(2, expect.objectContaining({
      prompt: expect.stringContaining('Return query JSON only.'),
    }));
  });

  test('preserves abort semantics when cancellation wins a provider error race', async () => {
    const controller = new AbortController();
    const extract = jest.fn().mockImplementation(async () => {
      controller.abort();
      throw new AppError('schema_violation', 'late provider error');
    });

    await expect(
      extractWithRetries({
        fallbackProvider: 'remote_openai_compatible',
        input: {
          endpointUrl: 'https://example.com',
          apiKey: 'k',
          model: 'm',
          imageBase64: 'abc',
          mimeType: 'image/jpeg',
          timeoutMs: 5000,
          signal: controller.signal,
        },
        extract,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(extract).toHaveBeenCalledTimes(1);
  });
});

import { createOpenAICompatibleExtractor } from '@/api/providers/openai-compatible-extractor';
import { extractionTimeoutMs } from '@/api/providers/remote-extraction-shared';
import { AppError } from '@/types/app-error';
import { emptyStructuredItem } from '@/types/item-schema';

describe('createOpenAICompatibleExtractor', () => {
  test('rejects non-https endpoints', async () => {
    const extractor = createOpenAICompatibleExtractor({
      fetch: jest.fn(),
    });

    await expect(
      extractor.extract({
        endpointUrl: 'http://example.com/v1/chat/completions',
        apiKey: 'secret',
        model: 'gpt-4.1-mini',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ code: 'unsupported' } satisfies Partial<AppError>);
  });

  test('normalizes malformed provider responses to invalid_response', async () => {
    const extractor = createOpenAICompatibleExtractor({
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      }),
    });

    await expect(
      extractor.extract({
        endpointUrl: 'https://example.com/v1/chat/completions',
        apiKey: 'secret',
        model: 'gpt-4.1-mini',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' } satisfies Partial<AppError>);
  });

  test('maps quota payload in 403 response to rate_limited with provider detail', async () => {
    const extractor = createOpenAICompatibleExtractor({
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            error: {
              message: 'You exceeded your current quota, please check your plan and billing details.',
              type: 'insufficient_quota',
            },
          }),
      }),
    });

    await expect(
      extractor.extract({
        endpointUrl: 'https://example.com/v1/chat/completions',
        apiKey: 'secret',
        model: 'gpt-4.1-mini',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({
      code: 'rate_limited',
      message: expect.stringContaining('quota'),
    } satisfies Partial<AppError>);
  });

  test('preserves provider verbatim 403 message for auth failures', async () => {
    const extractor = createOpenAICompatibleExtractor({
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            error: {
              message: 'Your account is not authorized for this model deployment.',
              type: 'invalid_request_error',
            },
          }),
      }),
    });

    await expect(
      extractor.extract({
        endpointUrl: 'https://example.com/v1/chat/completions',
        apiKey: 'secret',
        model: 'gpt-4.1-mini',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({
      code: 'auth_failed',
      message: 'Your account is not authorized for this model deployment.',
    } satisfies Partial<AppError>);
  });

  test('aborts when request exceeds effective timeout and maps to timeout error', async () => {
    const extractor = createOpenAICompatibleExtractor({
      fetch: jest.fn((_url, init) => {
        const signal = init?.signal;
        return new Promise((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              json: async () => ({
                choices: [],
              }),
            } as any);
          }, extractionTimeoutMs(5) + 1000);
        });
      }),
    });

    await expect(
      extractor.extract({
        endpointUrl: 'https://example.com/v1/chat/completions',
        apiKey: 'secret',
        model: 'gpt-4.1-mini',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: 'timeout' } satisfies Partial<AppError>);
  }, 130_000);

  test('uses minimum extraction timeout floor for short configured timeout', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                structured_json: emptyStructuredItem(),
              }),
            },
          },
        ],
      }),
    });
    const timeoutSpy = jest.spyOn(global, 'setTimeout');

    try {
      const extractor = createOpenAICompatibleExtractor({
        fetch: fetch as any,
      });

      await extractor.extract({
        endpointUrl: 'https://example.com/v1/chat/completions',
        apiKey: 'secret',
        model: 'gpt-4.1-mini',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5,
      });

      expect(timeoutSpy).toHaveBeenCalled();
      const firstDelay = timeoutSpy.mock.calls[0]?.[1];
      expect(firstDelay).toBeGreaterThan(5);
      expect(firstDelay).toBeGreaterThanOrEqual(120_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  test('normalizes network issues to network_unavailable', async () => {
    const extractor = createOpenAICompatibleExtractor({
      fetch: jest.fn().mockRejectedValue(new TypeError('Network request failed')),
    });

    await expect(
      extractor.extract({
        endpointUrl: 'https://example.com/v1/chat/completions',
        apiKey: 'secret',
        model: 'gpt-4.1-mini',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ code: 'network_unavailable' } satisfies Partial<AppError>);
  });

  test('normalizes schema drift to schema_violation', async () => {
    const extractor = createOpenAICompatibleExtractor({
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  structured_json: [],
                }),
              },
            },
          ],
        }),
      }),
    });

    await expect(
      extractor.extract({
        endpointUrl: 'https://example.com/v1/chat/completions',
        apiKey: 'secret',
        model: 'gpt-4.1-mini',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ code: 'schema_violation' } satisfies Partial<AppError>);
  });

  test('extracts structured json from a successful response', async () => {
    const extractor = createOpenAICompatibleExtractor({
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  structured_json: {
                    ...emptyStructuredItem(),
                    manufacturer: 'Siemens',
                  },
                  auxiliary_text_optional: 'Detected label text',
                }),
              },
            },
          ],
        }),
      }),
    });

    const result = await extractor.extract({
      endpointUrl: 'https://example.com/v1/chat/completions',
      apiKey: 'secret',
      model: 'gpt-4.1-mini',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      timeoutMs: 5000,
    });

    expect(result.structuredJson.manufacturer).toBe('Siemens');
    expect(result.auxiliaryText).toBe('Detected label text');
    expect(result.metadata.provider).toBe('remote_openai_compatible');
  });
});

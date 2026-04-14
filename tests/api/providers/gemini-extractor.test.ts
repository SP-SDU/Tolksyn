import { createGeminiExtractor } from '@/api/providers/gemini-extractor';
import { extractionTimeoutMs } from '@/api/providers/remote-extraction-shared';
import { AppError } from '@/types/app-error';
import { emptyStructuredItem } from '@/types/item-schema';

describe('createGeminiExtractor', () => {
  test('normalizes timeouts to timeout errors', async () => {
    const extractor = createGeminiExtractor({
      fetch: jest.fn().mockRejectedValue(new DOMException('Timed out', 'AbortError')),
    });

    await expect(
      extractor.extract({
        endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        apiKey: 'secret',
        model: 'gemini-2.0-flash',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ code: 'timeout' } satisfies Partial<AppError>);
  });

  test('extracts structured json from the first text part', async () => {
    const extractor = createGeminiExtractor({
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      structured_json: {
                        ...emptyStructuredItem(),
                        manufacturer: 'Phoenix Contact',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      }),
    });

    const result = await extractor.extract({
      endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      apiKey: 'secret',
      model: 'gemini-2.0-flash',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      timeoutMs: 5000,
    });

    expect(result.structuredJson.manufacturer).toBe('Phoenix Contact');
    expect(result.metadata.provider).toBe('remote_gemini');
  });

  test('aborts when request exceeds effective timeout and maps to timeout error', async () => {
    const extractor = createGeminiExtractor({
      fetch: jest.fn((_url, init) => {
        const signal = init?.signal;
        return new Promise((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              json: async () => ({
                candidates: [],
              }),
            } as any);
          }, extractionTimeoutMs(5) + 1000);
        });
      }),
    });

    await expect(
      extractor.extract({
        endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        apiKey: 'secret',
        model: 'gemini-2.0-flash',
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
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    structured_json: emptyStructuredItem(),
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    const timeoutSpy = jest.spyOn(global, 'setTimeout');

    try {
      const extractor = createGeminiExtractor({
        fetch: fetch as any,
      });

      await extractor.extract({
        endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        apiKey: 'secret',
        model: 'gemini-2.0-flash',
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
});

import { createGeminiExtractor } from '@/api/providers/gemini-extractor';
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
});

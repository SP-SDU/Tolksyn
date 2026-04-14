import { createOpenAICompatibleExtractor } from '@/api/providers/openai-compatible-extractor';
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

import { createOpenAICodexExtractor } from '@/api/providers/openai-codex-extractor';
import { AppError } from '@/types/app-error';
import { emptyStructuredItem } from '@/types/item-schema';

describe('createOpenAICodexExtractor', () => {
  test('parses successful codex response output_text payload', async () => {
    const extractor = createOpenAICodexExtractor({
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    structured_json: {
                      ...emptyStructuredItem(),
                      manufacturer: 'Siemens',
                    },
                  }),
                },
              ],
            },
          ],
        }),
      }),
    });

    const result = await extractor.extract({
      endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
      apiKey: '',
      model: 'gpt-5.3-codex',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      timeoutMs: 5000,
      oauth: {
        type: 'oauth',
        access: 'token',
        refresh: 'refresh',
        expires: 0,
      },
    });

    expect(result.structuredJson.manufacturer).toBe('Siemens');
    expect(result.metadata.provider).toBe('remote_openai_codex');
  });

  test('parses streaming codex SSE output_text delta events', async () => {
    const extractor = createOpenAICodexExtractor({
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          [
            JSON.stringify({ type: 'response.output_text.delta', delta: '{"structured_json":' }),
            JSON.stringify({ type: 'response.output_text.delta', delta: '{"manufacturer":"Siemens"}' }),
            JSON.stringify({ type: 'response.output_text.delta', delta: '}' }),
            'data: [DONE]',
          ]
            .map((item) => (item.startsWith('data:') ? item : `data: ${item}`))
            .join('\n'),
      }),
    });

    const result = await extractor.extract({
      endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
      apiKey: '',
      model: 'gpt-5.3-codex',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      timeoutMs: 5000,
      oauth: {
        type: 'oauth',
        access: 'token',
        refresh: 'refresh',
        expires: 0,
      },
    });

    expect(result.structuredJson.manufacturer).toBe('Siemens');
  });

  test('returns verbatim provider message on non-ok response', async () => {
    const extractor = createOpenAICodexExtractor({
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ message: 'Model not available for your account' }),
      }),
    });

    await expect(
      extractor.extract({
        endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
        apiKey: '',
        model: 'gpt-5.3-codex',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
        oauth: {
          type: 'oauth',
          access: 'token',
          refresh: 'refresh',
          expires: 0,
        },
      }),
    ).rejects.toMatchObject({
      code: 'auth_failed',
      message: 'Model not available for your account',
    } satisfies Partial<AppError>);
  });

  test('timeouts are not forced to 6 seconds for codex models', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  structured_json: emptyStructuredItem(),
                }),
              },
            ],
          },
        ],
      }),
    });
    const timeoutSpy = jest.spyOn(global, 'setTimeout');

    try {
      const extractor = createOpenAICodexExtractor({ fetch: fetch as any });
      await extractor.extract({
        endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
        apiKey: '',
        model: 'gpt-5.4',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 6000,
        oauth: {
          type: 'oauth',
          access: 'token',
          refresh: 'refresh',
          expires: 0,
        },
      });

      expect(timeoutSpy).toHaveBeenCalled();
      const firstDelay = timeoutSpy.mock.calls[0]?.[1];
      expect(firstDelay).toBeGreaterThan(6000);
      expect(firstDelay).toBeGreaterThanOrEqual(120_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  test('uses local proxy url on web to avoid direct codex CORS calls', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  structured_json: emptyStructuredItem(),
                }),
              },
            ],
          },
        ],
      }),
    });
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      location: {
        origin: 'http://localhost:8081',
      },
    };

    try {
      const extractor = createOpenAICodexExtractor({ fetch: fetch as any });
      await extractor.extract({
        endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
        apiKey: '',
        model: 'gpt-5.3-codex',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
        oauth: {
          type: 'oauth',
          access: 'token',
          refresh: 'refresh',
          expires: 0,
        },
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8081/api/proxy/openai/codex/responses',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer token',
          }),
          body: expect.stringContaining('"stream":true'),
        }),
      );
      const [, options] = (fetch as jest.Mock).mock.calls[0] as [string, { body?: string }];
      expect(options.body).toContain('"instructions"');
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});

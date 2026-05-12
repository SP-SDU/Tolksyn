import { createGitHubCopilotExtractor } from '@/api/providers/github-copilot-extractor';
import { isCopilotResponsesModel } from '@/api/providers/github-copilot-shared';
import { emptyStructuredItem } from '@/types/item-schema';

describe('createGitHubCopilotExtractor', () => {
  test('detects responses models case-insensitively', () => {
    expect(isCopilotResponsesModel('GPT-5.4')).toBe(true);
    expect(isCopilotResponsesModel('GPT-5-MINI')).toBe(false);
  });

  test('uses chat completions endpoint for gpt-4 models', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: 'copilot-access', expires_at: 1_900_000_000 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
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
    const extractor = createGitHubCopilotExtractor({ fetch: fetch as any });

    await extractor.extract({
      endpointUrl: 'https://api.githubcopilot.com/chat/completions',
      apiKey: '',
      model: 'gpt-4.1',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      timeoutMs: 5000,
      oauth: {
        type: 'oauth',
        refresh: 'refresh-token',
        access: 'refresh-token',
        expires: 0,
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/copilot_internal/v2/token',
      expect.any(Object),
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://api.githubcopilot.com/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('uses responses endpoint for gpt-5 models', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: 'copilot-access', expires_at: 1_900_000_000 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            output_text: JSON.stringify({
              structured_json: emptyStructuredItem(),
            }),
          }),
      });
    const extractor = createGitHubCopilotExtractor({ fetch: fetch as any });

    const result = await extractor.extract({
      endpointUrl: 'https://api.githubcopilot.com/chat/completions',
      apiKey: '',
      model: 'gpt-5.4',
      imageBase64: 'abc',
      mimeType: 'image/jpeg',
      timeoutMs: 5000,
      oauth: {
        type: 'oauth',
        refresh: 'refresh-token',
        access: 'refresh-token',
        expires: 0,
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.githubcopilot.com/responses',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.metadata.provider).toBe('remote_github_copilot');
  });

  test('uses local proxy endpoints on web', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
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
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      location: {
        origin: 'http://localhost:8081',
      },
    };

    try {
      const extractor = createGitHubCopilotExtractor({ fetch: fetch as any });
      await extractor.extract({
        endpointUrl: 'https://api.githubcopilot.com/chat/completions',
        apiKey: '',
        model: 'gpt-4.1',
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        timeoutMs: 5000,
        oauth: {
          type: 'oauth',
          refresh: 'refresh-token',
          access: 'refresh-token',
          expires: 0,
        },
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8081/api/proxy/github-copilot/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer refresh-token',
          }),
        }),
      );
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});

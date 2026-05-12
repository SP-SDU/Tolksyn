import { createProviderCatalog, isExperimentalProvider } from '@/services/provider-catalog';

describe('provider catalog', () => {
  test('marks only default providers as non-experimental', () => {
    expect(isExperimentalProvider('openai')).toBe(false);
    expect(isExperimentalProvider('google')).toBe(false);
    expect(isExperimentalProvider('anthropic')).toBe(false);
    expect(isExperimentalProvider('github-copilot')).toBe(false);
    expect(isExperimentalProvider('openrouter')).toBe(true);
  });

  test('uses fetched provider defaults when provider exists in catalog', async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: 'openai',
          name: 'OpenAI',
          api: 'https://api.openai.com/v1/chat/completions',
          models: {
            'gpt-5': {
              id: 'gpt-5',
              name: 'GPT-5',
              release_date: '2025-12-04',
              reasoning: true,
            },
          },
        },
      }),
    });

    const catalog = createProviderCatalog({
      secrets,
      fetch: fetch as any,
      now: () => 1_000,
    });

    const defaults = await catalog.defaultsFor('openai');

    expect(defaults).toEqual({
      endpointUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-5',
    });
  });

  test('defaults OpenAI endpoint to codex responses for oauth auth mode', async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: 'openai',
          name: 'OpenAI',
          api: 'https://api.openai.com/v1/chat/completions',
          models: {
            'gpt-5.3-codex': {
              id: 'gpt-5.3-codex',
              name: 'GPT-5.3 Codex',
              release_date: '2026-01-01',
              reasoning: true,
            },
          },
        },
      }),
    });

    const catalog = createProviderCatalog({
      secrets,
      fetch: fetch as any,
      now: () => 1_000,
    });

    const defaults = await catalog.defaultsFor('openai', 'oauth');

    expect(defaults).toEqual({
      endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
      model: 'gpt-5.3-codex',
    });
  });

  test('returns codex endpoint fallback for openai oauth without fetched provider', async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const catalog = createProviderCatalog({
      secrets,
      fetch: fetch as any,
      now: () => 1_000,
    });

    const defaults = await catalog.defaultsFor('openai', 'oauth');

    expect(defaults.endpointUrl).toBe('https://chatgpt.com/backend-api/codex/responses');
  });

  test('drops gpt-4.1 models and keeps newer OpenAI models', async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: 'openai',
          name: 'OpenAI',
          api: 'https://api.openai.com/v1/chat/completions',
          models: {
            'gpt-4.1': {
              id: 'gpt-4.1',
              name: 'GPT-4.1',
              release_date: '2025-01-01',
              reasoning: true,
            },
            'gpt-5.3-codex': {
              id: 'gpt-5.3-codex',
              name: 'GPT-5.3 Codex',
              release_date: '2026-01-01',
              reasoning: true,
            },
          },
        },
      }),
    });

    const catalog = createProviderCatalog({
      secrets,
      fetch: fetch as any,
      now: () => 1_000,
    });

    const models = await catalog.modelOptions('openai');

    expect(models.some((item) => item.id === 'gpt-5.3-codex')).toBe(true);
    expect(models.some((item) => item.id === 'gpt-4.1')).toBe(false);
  });

  test('uses local web github-copilot models proxy endpoint', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'github-copilot': {
            id: 'github-copilot',
            name: 'GitHub Copilot',
            api: 'https://api.githubcopilot.com/chat/completions',
            models: {
              'gpt-4.1': {
                id: 'gpt-4.1',
                name: 'GPT-4.1',
                release_date: '2026-01-01',
                reasoning: true,
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'copilot-access',
          expires_at: 1_900_000_000,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              model_picker_enabled: true,
              id: 'gpt-4.1',
              name: 'GPT-4.1',
              version: 'gpt-4.1-2026-01-01',
              capabilities: {
                supports: {
                  vision: true,
                },
                limits: {},
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

    const catalog = createProviderCatalog({
      secrets: createSecretStore({
        'tolksyn.secret.provider_auth': JSON.stringify({
          'github-copilot': {
            type: 'oauth',
            refresh: 'refresh-token',
            access: 'refresh-token',
            expires: 0,
          },
        }),
      }),
      fetch: fetch as any,
      now: () => 1_000,
    });

    try {
      await catalog.modelOptions('github-copilot', 'oauth');

      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8081/api/proxy/github-copilot/models',
        expect.objectContaining({
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

function createSecretStore(seed?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(seed ?? {}));

  return {
    async getItem(key: string): Promise<string | null> {
      return map.get(key) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      map.set(key, value);
    },
    async deleteItem(key: string): Promise<void> {
      map.delete(key);
    },
  };
}

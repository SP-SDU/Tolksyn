import {
  createProviderCatalog,
  isExperimentalProvider,
} from "@/services/provider-catalog";

describe("provider catalog", () => {
  test("marks only default providers as non-experimental", () => {
    expect(isExperimentalProvider("openai")).toBe(false);
    expect(isExperimentalProvider("google")).toBe(false);
    expect(isExperimentalProvider("anthropic")).toBe(false);
    expect(isExperimentalProvider("github-copilot")).toBe(false);
    expect(isExperimentalProvider("openrouter")).toBe(true);
  });

  test("uses fetched provider defaults when provider exists in catalog", async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models: {
            "gpt-5": {
              id: "gpt-5",
              name: "GPT-5",
              release_date: "2025-12-04",
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

    const defaults = await catalog.defaultsFor("openai");

    expect(defaults).toEqual({
      model: "gpt-5",
    });
  });

  test("defaults OpenAI endpoint to codex responses for oauth auth mode", async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models: {
            "gpt-5.3-codex": {
              id: "gpt-5.3-codex",
              name: "GPT-5.3 Codex",
              release_date: "2026-01-01",
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

    const defaults = await catalog.defaultsFor("openai", "oauth");

    expect(defaults).toEqual({
      model: "gpt-5.3-codex",
    });
  });

  test("returns codex endpoint fallback for openai oauth without fetched provider", async () => {
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

    const defaults = await catalog.defaultsFor("openai", "oauth");

    expect(defaults.model).toBe("gpt-4.1-mini");
  });

  test("drops gpt-4.1 models and keeps newer OpenAI models", async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models: {
            "gpt-4.1": {
              id: "gpt-4.1",
              name: "GPT-4.1",
              release_date: "2025-01-01",
              reasoning: true,
            },
            "gpt-5.3-codex": {
              id: "gpt-5.3-codex",
              name: "GPT-5.3 Codex",
              release_date: "2026-01-01",
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

    const models = await catalog.modelOptions("openai");

    expect(models.some((item) => item.id === "gpt-5.3-codex")).toBe(true);
    expect(models.some((item) => item.id === "gpt-4.1")).toBe(false);
  });

  test("uses local web github-copilot models proxy endpoint", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "github-copilot": {
            id: "github-copilot",
            name: "GitHub Copilot",
            api: "https://api.githubcopilot.com/chat/completions",
            models: {
              "gpt-4.1": {
                id: "gpt-4.1",
                name: "GPT-4.1",
                release_date: "2026-01-01",
                reasoning: true,
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "copilot-access",
          expires_at: 1_900_000_000,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              model_picker_enabled: true,
              id: "gpt-4.1",
              name: "GPT-4.1",
              version: "gpt-4.1-2026-01-01",
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
        origin: "http://localhost:8081",
      },
    };

    const catalog = createProviderCatalog({
      secrets: createSecretStore({
        "tolksyn.secret.provider_auth": JSON.stringify({
          "github-copilot": {
            type: "oauth",
            refresh: "refresh-token",
            access: "refresh-token",
            expires: 0,
          },
        }),
      }),
      fetch: fetch as any,
      now: () => 1_000,
    });

    try {
      await catalog.modelOptions("github-copilot", "oauth");

      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "http://localhost:8081/api/proxy/github-copilot/models",
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: "Bearer refresh-token",
          }),
        }),
      );
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  test("includes gpt-5 base models in oauth mode", async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models: {
            "gpt-5.5": {
              id: "gpt-5.5",
              name: "GPT-5.5",
              release_date: "2026-04-01",
              reasoning: true,
            },
            "gpt-5.4": {
              id: "gpt-5.4",
              name: "GPT-5.4",
              release_date: "2026-03-01",
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

    const models = await catalog.modelOptions("openai", "oauth");

    expect(models.some((m) => m.id === "gpt-5.5")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5.4")).toBe(true);
  });

  test("includes codex models in oauth mode", async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models: {
            "gpt-5.3-codex": {
              id: "gpt-5.3-codex",
              name: "GPT-5.3 Codex",
              release_date: "2026-02-01",
              reasoning: true,
            },
            "gpt-5.2-codex": {
              id: "gpt-5.2-codex",
              name: "GPT-5.2 Codex",
              release_date: "2025-12-01",
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

    const models = await catalog.modelOptions("openai", "oauth");

    expect(models.some((m) => m.id === "gpt-5.3-codex")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5.2-codex")).toBe(true);
  });

  test("includes mini models in oauth mode", async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models: {
            "gpt-5.4-mini": {
              id: "gpt-5.4-mini",
              name: "GPT-5.4 Mini",
              release_date: "2026-03-01",
              reasoning: true,
            },
            "gpt-5-mini": {
              id: "gpt-5-mini",
              name: "GPT-5 Mini",
              release_date: "2025-08-01",
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

    const models = await catalog.modelOptions("openai", "oauth");

    expect(models.some((m) => m.id === "gpt-5.4-mini")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5-mini")).toBe(true);
  });

  test("includes codex-mini and codex-max variants in oauth mode", async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models: {
            "gpt-5.1-codex-mini": {
              id: "gpt-5.1-codex-mini",
              name: "GPT-5.1 Codex Mini",
              release_date: "2025-11-01",
              reasoning: true,
            },
            "gpt-5.1-codex-max": {
              id: "gpt-5.1-codex-max",
              name: "GPT-5.1 Codex Max",
              release_date: "2025-12-01",
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

    const models = await catalog.modelOptions("openai", "oauth");

    expect(models.some((m) => m.id === "gpt-5.1-codex-mini")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5.1-codex-max")).toBe(true);
  });

  test("excludes gpt-4 models from oauth mode", async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models: {
            "gpt-4.1": {
              id: "gpt-4.1",
              name: "GPT-4.1",
              release_date: "2025-04-01",
              reasoning: true,
            },
            "gpt-4o": {
              id: "gpt-4o",
              name: "GPT-4o",
              release_date: "2024-05-01",
              reasoning: false,
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

    const models = await catalog.modelOptions("openai", "oauth");

    expect(models.some((m) => m.id === "gpt-4.1")).toBe(false);
    expect(models.some((m) => m.id === "gpt-4o")).toBe(false);
  });

  test("excludes chat models from oauth mode", async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models: {
            "gpt-5-chat": {
              id: "gpt-5-chat",
              name: "GPT-5 Chat",
              release_date: "2026-01-01",
              reasoning: true,
            },
            "gpt-5.1-chat": {
              id: "gpt-5.1-chat",
              name: "GPT-5.1 Chat",
              release_date: "2025-11-01",
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

    const models = await catalog.modelOptions("openai", "oauth");

    expect(models.some((m) => m.id === "gpt-5-chat")).toBe(false);
    expect(models.some((m) => m.id === "gpt-5.1-chat")).toBe(false);
  });

  test("excludes image models from oauth mode", async () => {
    const secrets = createSecretStore();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models: {
            "gpt-5-image": {
              id: "gpt-5-image",
              name: "GPT-5 Image",
              release_date: "2026-01-01",
              reasoning: true,
            },
            sora: {
              id: "sora",
              name: "Sora",
              release_date: "2026-01-01",
              reasoning: false,
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

    const models = await catalog.modelOptions("openai", "oauth");

    expect(models.some((m) => m.id === "gpt-5-image")).toBe(false);
    expect(models.some((m) => m.id === "sora")).toBe(false);
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

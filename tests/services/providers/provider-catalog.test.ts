import {
  createProviderCatalog,
  fallbackProviderModel,
  fallbackProviderSnapshot,
  isExperimentalProvider,
} from "@/services/providers/provider-catalog";

import { createSecretStore } from "@/tests/helpers/fakes";

describe("provider catalog", () => {
  test("coalesces concurrent provider catalog loads", async () => {
    const secrets = createSecretStore();
    const fetch = fetchedOpenAiCatalog();
    const catalog = createProviderCatalog({
      secrets,
      fetch: fetch as any,
      now: () => 1_000,
    });

    const [left, right] = await Promise.all([catalog.all(), catalog.all()]);

    expect(left).toEqual(right);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("coalesces concurrent catalog fallback after fetch failure", async () => {
    const catalog = createProviderCatalog({
      secrets: createSecretStore(),
      fetch: jest.fn().mockRejectedValue(new Error("offline")) as any,
      now: () => 1_000,
    });

    const [left, right] = await Promise.all([catalog.all(), catalog.all()]);

    expect(left.length).toBeGreaterThan(0);
    expect(right).toEqual(left);
  });

  test("returns provider snapshot without fetching remote catalog", async () => {
    const fetch = jest.fn();
    const catalog = createProviderCatalog({
      secrets: createSecretStore(),
      fetch: fetch as any,
      now: () => 1_000,
    });

    const providers = await catalog.snapshot();

    expect(providers.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("returns cached provider snapshot even when stale", async () => {
    const fetch = jest.fn();
    const cached = [
      {
        id: "cached-provider",
        name: "Cached Provider",
        models: [
          {
            id: "cached-model",
            name: "Cached Model",
            variants: [],
            supportsImage: false,
            releaseDate: "2026-01-01",
          },
        ],
      },
    ];
    const catalog = createProviderCatalog({
      secrets: createSecretStore({
        "tolksyn.settings.provider_catalog": JSON.stringify({
          fetchedAt: 0,
          providers: cached,
        }),
      }),
      fetch: fetch as any,
      now: () => 1_000_000,
    });

    const providers = await catalog.snapshot();

    expect(providers).toEqual(cached);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("returns static provider model fallback", () => {
    expect(fallbackProviderModel("google")).toBe("gemini-2.0-flash");
  });

  test("returns static provider snapshot fallback", () => {
    expect(fallbackProviderSnapshot()).toEqual([
      {
        id: "openai",
        name: "OpenAI",
        api: "https://api.openai.com/v1/chat/completions",
        models: [
          {
            id: "gpt-4.1-mini",
            name: "GPT-4.1 Mini",
            variants: ["minimal", "low", "medium", "high", "xhigh"],
            supportsImage: true,
            releaseDate: "2025-01-01",
          },
        ],
      },
      {
        id: "anthropic",
        name: "Anthropic",
        api: "https://api.anthropic.com/v1/messages",
        models: [
          {
            id: "claude-sonnet-4-0",
            name: "Claude Sonnet 4",
            variants: ["low", "medium", "high"],
            supportsImage: true,
            releaseDate: "2025-01-01",
          },
        ],
      },
      {
        id: "github-copilot",
        name: "GitHub Copilot",
        api: "https://api.githubcopilot.com/chat/completions",
        models: [
          {
            id: "gpt-4.1",
            name: "GPT-4.1",
            variants: ["low", "medium", "high"],
            supportsImage: true,
            releaseDate: "2025-01-01",
          },
        ],
      },
      {
        id: "google",
        name: "Google",
        api: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        models: [
          {
            id: "gemini-2.0-flash",
            name: "Gemini 2.0 Flash",
            variants: ["low", "high"],
            supportsImage: true,
            releaseDate: "2025-01-01",
          },
        ],
      },
    ]);
  });

  test("exposes supported provider auth methods", () => {
    const catalog = createProviderCatalog({
      secrets: createSecretStore(),
      fetch: jest.fn() as any,
      now: () => 1_000,
    });

    expect(catalog.authMethods("openai")).toEqual(["api", "oauth"]);
    expect(catalog.authMode("openai")).toBe("api");
    expect(catalog.authMethods("github-copilot")).toEqual(["oauth"]);
    expect(catalog.authMode("github-copilot")).toBe("oauth");
    expect(catalog.authMethods("anthropic")).toEqual(["api"]);
    expect(catalog.isSupportedProvider("openai")).toBe(true);
    expect(catalog.isSupportedProvider("google")).toBe(true);
    expect(catalog.isSupportedProvider("anthropic")).toBe(true);
    expect(catalog.isSupportedProvider("github-copilot")).toBe(true);
    expect(catalog.isSupportedProvider("openrouter")).toBe(false);
  });

  test("fetches models.dev catalog and saves both native and web cache keys", async () => {
    const secrets = {
      getItem: jest.fn().mockResolvedValue(null),
      setItem: jest.fn().mockResolvedValue(undefined),
      deleteItem: jest.fn().mockResolvedValue(undefined),
    };
    const fetch = fetchedOpenAiCatalog();
    const catalog = createProviderCatalog({
      secrets,
      fetch: fetch as any,
      now: () => 1_000,
    });

    await catalog.all();

    expect(fetch).toHaveBeenCalledWith("https://models.dev/api.json");
    expect(secrets.setItem).toHaveBeenCalledWith(
      "tolksyn.settings.provider_catalog",
      expect.stringContaining("gpt-5"),
    );
    expect(secrets.setItem).toHaveBeenCalledWith(
      "tolksyn.settings.provider_catalog.web",
      expect.stringContaining("gpt-5"),
    );
  });

  test("uses cached catalog within five minute ttl", async () => {
    const cached = [
      {
        id: "cached-provider",
        name: "Cached Provider",
        models: [
          {
            id: "cached-model",
            name: "Cached Model",
            variants: [],
            supportsImage: false,
            releaseDate: "2026-01-01",
          },
        ],
      },
    ];
    const fetch = jest.fn();
    const catalog = createProviderCatalog({
      secrets: createSecretStore({
        "tolksyn.settings.provider_catalog": JSON.stringify({
          fetchedAt: 1_000,
          providers: cached,
        }),
      }),
      fetch: fetch as any,
      now: () => 1_000 + 1000 * 60 * 5 - 1,
    });

    await expect(catalog.all()).resolves.toEqual(cached);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("uses memory catalog within five minute ttl and force refresh bypasses it", async () => {
    const fetch = fetchedOpenAiCatalog();
    const catalog = createProviderCatalog({
      secrets: createSecretStore(),
      fetch: fetch as any,
      now: () => 1_000,
    });

    await catalog.all();
    await catalog.all();
    await catalog.all(true);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("refreshes stale cache and falls back to stale cache on fetch failure", async () => {
    const cached = [
      {
        id: "cached-provider",
        name: "Cached Provider",
        models: [
          {
            id: "cached-model",
            name: "Cached Model",
            variants: [],
            supportsImage: false,
            releaseDate: "2026-01-01",
          },
        ],
      },
    ];
    const fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const catalog = createProviderCatalog({
      secrets: createSecretStore({
        "tolksyn.settings.provider_catalog": JSON.stringify({
          fetchedAt: 1_000,
          providers: cached,
        }),
      }),
      fetch: fetch as any,
      now: () => 1_000 + 1000 * 60 * 5,
    });

    await expect(catalog.all()).resolves.toEqual(cached);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("refreshes cache at exact ttl boundary and after memory ttl expires", async () => {
    const cached = [providerItem("cached-provider", "Cached Provider", "cached-model")];
    const fresh = {
      openai: rawProvider("openai", "OpenAI", {
        "gpt-5-fresh": openAiModel("gpt-5-fresh", "GPT-5 Fresh", "2026-01-01"),
      }),
    };
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => fresh });
    let now = 1_000 + 1000 * 60 * 5;
    const catalog = createProviderCatalog({
      secrets: createSecretStore({
        "tolksyn.settings.provider_catalog": JSON.stringify({
          fetchedAt: 1_000,
          providers: cached,
        }),
      }),
      fetch: fetch as any,
      now: () => now,
    });

    await expect(catalog.all()).resolves.toEqual([
      {
        id: "openai",
        name: "OpenAI",
        api: "https://api.openai.com/v1/chat/completions",
        models: [
          {
            id: "gpt-5-fresh",
            name: "GPT-5 Fresh",
            variants: ["minimal", "low", "medium", "high", "xhigh"],
            supportsImage: false,
            releaseDate: "2026-01-01",
          },
        ],
      },
    ]);

    now += 1000 * 60 * 5;
    await catalog.all();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("clears inflight catalog request after failure so next load can retry", async () => {
    const fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          openai: rawProvider("openai", "OpenAI", {
            "gpt-5": openAiModel("gpt-5", "GPT-5", "2026-01-01"),
          }),
        }),
      });
    const catalog = createProviderCatalog({
      secrets: createSecretStore(),
      fetch: fetch as any,
      now: () => 1_000,
    });

    await expect(catalog.all()).resolves.toEqual(fallbackProviderSnapshot());
    await expect(catalog.all()).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("marks only default providers as non-experimental", () => {
    // Default providers ship with the app. Experimental ones are opt-in
    expect(isExperimentalProvider("openai")).toBe(false);
    expect(isExperimentalProvider("google")).toBe(false);
    expect(isExperimentalProvider("anthropic")).toBe(false);
    expect(isExperimentalProvider("github-copilot")).toBe(false);
    expect(isExperimentalProvider("openrouter")).toBe(true);
  });

  test("uses fetched provider defaults when provider exists in catalog", async () => {
    const secrets = createSecretStore();
    const fetch = fetchedOpenAiCatalog();

    const catalog = createProviderCatalog({
      secrets,
      fetch: fetch as any,
      now: () => 1_000,
    });

    const defaults = await catalog.defaultsFor("openai");

    // Latest model from catalog used as default for the provider
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

    // OAuth mode selects the codex model by default
    expect(defaults).toEqual({
      model: "gpt-5.3-codex",
    });
  });

  test("uses fallback defaults and empty options for unknown or empty providers", async () => {
    const catalog = createProviderCatalog({
      secrets: createSecretStore(),
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          empty: {
            id: "empty",
            name: "Empty",
            models: {},
          },
        }),
      }) as any,
      now: () => 1_000,
    });

    await expect(catalog.byId("missing")).resolves.toBeUndefined();
    await expect(catalog.defaultsFor("missing")).resolves.toEqual({
      model: "gpt-4.1-mini",
    });
    await expect(catalog.modelOptions("missing")).resolves.toEqual([]);
    await expect(catalog.thinkingLevels("missing", "model")).resolves.toEqual(
      [],
    );
    await expect(catalog.supportsImage("missing", "model")).resolves.toBe(
      false,
    );
  });

  test("normalizes fetched providers, variants, image support, filtering, and sort order", async () => {
    const catalog = createProviderCatalog({
      secrets: createSecretStore(),
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          zed: {
            id: "github-copilot",
            name: "GitHub Copilot",
            api: "https://api.githubcopilot.com/chat/completions",
            models: {
              old: {
                id: "old",
                name: "Old",
                release_date: "2025-01-01",
                reasoning: true,
                status: "deprecated",
              },
              "gpt-5-late": {
                id: "gpt-5-late",
                name: "GPT-5 Late",
                release_date: "2025-12-04",
                reasoning: true,
                modalities: { input: ["text", "image"] },
              },
            },
          },
          aaa: {
            id: "google",
            name: "Google",
            api: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
            models: {
              "gemini-3.1-pro": {
                id: "gemini-3.1-pro",
                name: "Gemini 3.1 Pro",
                release_date: "2026-01-01",
                reasoning: true,
                provider: { npm: "@ai-sdk/google" },
              },
              "gemini-2.5-flash": {
                id: "gemini-2.5-flash",
                name: "Gemini 2.5 Flash",
                release_date: "2025-01-01",
                reasoning: true,
                attachment: true,
              },
              "gemini-basic": {
                id: "gemini-basic",
                name: "Gemini Basic",
                release_date: "2024-01-01",
                reasoning: false,
              },
            },
          },
          mid: {
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
              "gpt-5-early": {
                id: "gpt-5-early",
                name: "GPT-5 Early",
                release_date: "2025-12-03",
                reasoning: true,
              },
              "gpt-5-late": {
                id: "gpt-5-late",
                name: "GPT-5 Late",
                release_date: "2025-12-04",
                reasoning: true,
              },
            },
          },
        }),
      }) as any,
      now: () => 1_000,
    });

    const providers = await catalog.all();

    expect(providers.map((provider) => provider.name)).toEqual([
      "GitHub Copilot",
      "Google",
      "OpenAI",
    ]);
    expect(await catalog.thinkingLevels("github-copilot", "gpt-5-late")).toEqual(
      ["low", "medium", "high", "xhigh"],
    );
    expect(await catalog.supportsImage("github-copilot", "gpt-5-late")).toBe(
      true,
    );
    expect(await catalog.thinkingLevels("google", "gemini-3.1-pro")).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(await catalog.thinkingLevels("google", "gemini-2.5-flash")).toEqual([
      "high",
      "max",
    ]);
    expect(await catalog.thinkingLevels("google", "gemini-basic")).toEqual([]);
    expect(await catalog.supportsImage("google", "gemini-2.5-flash")).toBe(
      true,
    );
    expect((await catalog.modelOptions("openai")).map((model) => model.id)).toEqual(
      ["gpt-5-late", "gpt-5-early"],
    );
    expect(await catalog.thinkingLevels("openai", "gpt-5-early")).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    expect(await catalog.thinkingLevels("openai", "gpt-5-late")).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  test("normalizes provider catalog edge cases", async () => {
    const catalog = createProviderCatalog({
      secrets: createSecretStore(),
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          empty: rawProvider("empty", "Empty", {}),
          zzz: rawProvider("z-provider", "Zulu Provider", {
            deprecated: {
              id: "deprecated",
              name: "Deprecated",
              release_date: "2026-01-01",
              reasoning: true,
              status: "deprecated",
            },
          }),
          vertex: rawProvider("vertex-provider", "Vertex Provider", {
            "vertex-2.0": {
              id: "vertex-2.0",
              name: "Vertex 2.0",
              release_date: "2026-01-01",
              reasoning: true,
              provider: { npm: "@ai-sdk/google-vertex" },
            },
          }),
          google: rawProvider("google", "Google", {
            "gemini-2.0-pro": {
              id: "gemini-2.0-pro",
              name: "Gemini 2.0 Pro",
              release_date: "2026-01-01",
              reasoning: true,
            },
          }),
          openai: rawProvider("openai", "OpenAI", {
            "gpt-4.1-preview": openAiModel(
              "gpt-4.1-preview",
              "GPT-4.1 Preview",
              "2025-01-01",
            ),
            "gpt-5-old": openAiModel("gpt-5-old", "GPT-5 Old", "2025-12-03"),
            "o3-mini": openAiModel("o3-mini", "O3 Mini", "2026-01-02"),
          }),
        }),
      }) as any,
      now: () => 1_000,
    });

    const providers = await catalog.all();

    expect(providers.map((provider) => provider.id)).toEqual([
      "google",
      "openai",
      "vertex-provider",
    ]);
    expect(await catalog.thinkingLevels("vertex-provider", "vertex-2.0")).toEqual([
      "low",
      "high",
    ]);
    expect(await catalog.thinkingLevels("google", "gemini-2.0-pro")).toEqual([
      "low",
      "high",
    ]);
    expect((await catalog.modelOptions("openai")).map((model) => model.id)).toEqual([
      "gpt-5-old",
      "o3-mini",
    ]);
    expect(await catalog.thinkingLevels("openai", "o3-mini")).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(await catalog.thinkingLevels("openai", "gpt-5-old")).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    expect(await catalog.supportsImage("openai", "o3-mini")).toBe(false);
  });

  test("keeps api mode model list unfiltered while oauth mode keeps only text gpt-5 models", async () => {
    const catalog = createProviderCatalog({
      secrets: createSecretStore(),
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          openai: rawProvider("openai", "OpenAI", {
            "gpt-4o": openAiModel("gpt-4o", "GPT-4o", "2024-05-01", false),
            "gpt-5.10-codex": openAiModel(
              "gpt-5.10-codex",
              "GPT-5.10 Codex",
              "2026-02-01",
            ),
            "gpt-5.1-image": openAiModel(
              "gpt-5.1-image",
              "GPT-5.1 Image",
              "2026-01-01",
            ),
          }),
        }),
      }) as any,
      now: () => 1_000,
    });

    expect((await catalog.modelOptions("openai", "api")).map((model) => model.id)).toEqual([
      "gpt-5.10-codex",
      "gpt-5.1-image",
      "gpt-4o",
    ]);
    expect((await catalog.modelOptions("openai", "oauth")).map((model) => model.id)).toEqual([
      "gpt-5.10-codex",
    ]);
  });

  test("uses fallback default when cached provider has no models", async () => {
    const catalog = createProviderCatalog({
      secrets: createSecretStore({
        "tolksyn.settings.provider_catalog": JSON.stringify({
          fetchedAt: 1_000,
          providers: [{ id: "openai", name: "OpenAI", models: [] }],
        }),
      }),
      fetch: jest.fn() as any,
      now: () => 1_000,
    });

    await expect(catalog.defaultsFor("openai")).resolves.toEqual({
      model: "gpt-4.1-mini",
    });
  });

  test("returns codex endpoint fallback for openai oauth without fetched provider", async () => {
    // Empty catalog response means no remote provider data
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

    // Hardcoded fallback used when catalog has no provider entry
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

    // gpt-4.1 filtered out. Newer models retained
    expect(models.some((item) => item.id === "gpt-5.3-codex")).toBe(true);
    expect(models.some((item) => item.id === "gpt-4.1")).toBe(false);
  });

  test("uses local web github-copilot models proxy endpoint", async () => {
    // 3 fetches: catalog, token exchange, then models via proxy
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
        origin: "http://localhost:8081/",
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

      // On web, models requested through the local proxy, not directly
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

  test("uses access token when copilot refresh token is blank", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "github-copilot": rawProvider("github-copilot", "GitHub Copilot", {
            "gpt-4.1": openAiModel("gpt-4.1", "GPT-4.1", "2026-01-01"),
          }),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [],
        }),
      });

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      location: { origin: "http://localhost:8081" },
    };

    const catalog = createProviderCatalog({
      secrets: createSecretStore({
        "tolksyn.secret.provider_auth": JSON.stringify({
          "github-copilot": {
            type: "oauth",
            refresh: "   ",
            access: "  access-token  ",
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
            authorization: "Bearer access-token",
          }),
        }),
      );
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  test("keeps local copilot models when stored auth is missing or remote fetch fails", async () => {
    const local = rawProvider("github-copilot", "GitHub Copilot", {
      "gpt-4.1": openAiModel("gpt-4.1", "GPT-4.1", "2026-01-01"),
    });
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ "github-copilot": local }),
    });
    const catalog = createProviderCatalog({
      secrets: createSecretStore(),
      fetch: fetch as any,
      now: () => 1_000,
    });

    await expect(catalog.modelOptions("github-copilot", "oauth")).resolves.toEqual([
      {
        id: "gpt-4.1",
        name: "GPT-4.1",
        variants: ["low", "medium", "high"],
        supportsImage: false,
        releaseDate: "2026-01-01",
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("keeps only enabled remote copilot models and sorts them by name", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          "github-copilot": rawProvider("github-copilot", "GitHub Copilot", {
            beta: openAiModel("beta", "Beta Local", "2026-01-01"),
            alpha: openAiModel("alpha", "Alpha Local", "2026-01-01"),
            disabled: openAiModel("disabled", "Disabled Local", "2026-01-01"),
            missing: openAiModel("missing", "Missing Local", "2026-01-01"),
          }),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "copilot-access", expires_at: 1_900_000_000 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            remoteCopilotModel("beta", "Beta Remote", true, []),
            remoteCopilotModel("alpha", "Alpha Remote", false, ["text/plain"]),
            remoteCopilotModel(
              "disabled",
              "Disabled Remote",
              false,
              ["image/jpeg"],
              false,
            ),
          ],
        }),
      });
    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {};
    const catalog = createProviderCatalog({
      secrets: createSecretStore({
        "tolksyn.secret.provider_auth": JSON.stringify({
          "github-copilot": {
            type: "oauth",
            refresh: "refresh-token",
            access: "access-token",
            expires: 0,
          },
        }),
      }),
      fetch: fetch as any,
      now: () => 1_000,
    });

    try {
      await expect(catalog.modelOptions("github-copilot", "oauth")).resolves.toEqual([
        {
          id: "alpha",
          name: "Alpha Remote",
          variants: ["low", "medium", "high"],
          supportsImage: false,
          releaseDate: "2026-01-01",
        },
        {
          id: "beta",
          name: "Beta Remote",
          variants: ["low", "medium", "high"],
          supportsImage: true,
          releaseDate: "2026-01-01",
        },
      ]);
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  test("falls back to direct copilot models request when window has no origin", async () => {
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
              name: "Remote GPT-4.1",
              version: "gpt-4.1-2026-01-01",
              supported_endpoints: ["chat.completions"],
              capabilities: {
                supports: {},
                limits: {
                  vision: {
                    supported_media_types: ["image/png"],
                  },
                },
              },
            },
          ],
        }),
      });

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {};

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
      await expect(
        catalog.modelOptions("github-copilot", "oauth"),
      ).resolves.toEqual([
        {
          id: "gpt-4.1",
          name: "Remote GPT-4.1",
          variants: ["low", "medium", "high"],
          supportsImage: true,
          releaseDate: "2026-01-01",
        },
      ]);
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        "https://api.githubcopilot.com/models",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer copilot-access",
          }),
        }),
      );
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  test("includes gpt-5 base models in oauth mode", async () => {
    const models = await openAiOauthModels({
      "gpt-5.5": openAiModel("gpt-5.5", "GPT-5.5", "2026-04-01"),
      "gpt-5.4": openAiModel("gpt-5.4", "GPT-5.4", "2026-03-01"),
    });

    // gpt-5.x base models available in oauth mode
    expect(models.some((m) => m.id === "gpt-5.5")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5.4")).toBe(true);
  });

  test("includes codex models in oauth mode", async () => {
    const models = await openAiOauthModels({
      "gpt-5.3-codex": openAiModel(
        "gpt-5.3-codex",
        "GPT-5.3 Codex",
        "2026-02-01",
      ),
      "gpt-5.2-codex": openAiModel(
        "gpt-5.2-codex",
        "GPT-5.2 Codex",
        "2025-12-01",
      ),
    });

    // Codex models available in oauth mode
    expect(models.some((m) => m.id === "gpt-5.3-codex")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5.2-codex")).toBe(true);
  });

  test("includes mini models in oauth mode", async () => {
    const models = await openAiOauthModels({
      "gpt-5.4-mini": openAiModel("gpt-5.4-mini", "GPT-5.4 Mini", "2026-03-01"),
      "gpt-5-mini": openAiModel("gpt-5-mini", "GPT-5 Mini", "2025-08-01"),
    });

    // Mini models (cost-effective) available in oauth mode
    expect(models.some((m) => m.id === "gpt-5.4-mini")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5-mini")).toBe(true);
  });

  test("includes codex-mini and codex-max variants in oauth mode", async () => {
    const models = await openAiOauthModels({
      "gpt-5.1-codex-mini": openAiModel(
        "gpt-5.1-codex-mini",
        "GPT-5.1 Codex Mini",
        "2025-11-01",
      ),
      "gpt-5.1-codex-max": openAiModel(
        "gpt-5.1-codex-max",
        "GPT-5.1 Codex Max",
        "2025-12-01",
      ),
    });

    // Codex size variants (mini/max) available in oauth mode
    expect(models.some((m) => m.id === "gpt-5.1-codex-mini")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5.1-codex-max")).toBe(true);
  });

  test("excludes gpt-4 models from oauth mode", async () => {
    const models = await openAiOauthModels({
      "gpt-4.1": openAiModel("gpt-4.1", "GPT-4.1", "2025-04-01"),
      "gpt-4o": openAiModel("gpt-4o", "GPT-4o", "2024-05-01", false),
    });

    // gpt-4 models excluded from oauth mode (only gpt-5 and codex)
    expect(models.some((m) => m.id === "gpt-4.1")).toBe(false);
    expect(models.some((m) => m.id === "gpt-4o")).toBe(false);
  });

  test("excludes chat models from oauth mode", async () => {
    const models = await openAiOauthModels({
      "gpt-5-chat": openAiModel("gpt-5-chat", "GPT-5 Chat", "2026-01-01"),
      "gpt-5.1-chat": openAiModel("gpt-5.1-chat", "GPT-5.1 Chat", "2025-11-01"),
    });

    // Chat-suffixed models excluded from oauth mode
    expect(models.some((m) => m.id === "gpt-5-chat")).toBe(false);
    expect(models.some((m) => m.id === "gpt-5.1-chat")).toBe(false);
  });

  test("excludes image models from oauth mode", async () => {
    const models = await openAiOauthModels({
      "gpt-5-image": openAiModel("gpt-5-image", "GPT-5 Image", "2026-01-01"),
      sora: openAiModel("sora", "Sora", "2026-01-01", false),
    });

    // Image generation models excluded from oauth mode (text-only use case)
    expect(models.some((m) => m.id === "gpt-5-image")).toBe(false);
    expect(models.some((m) => m.id === "sora")).toBe(false);
  });
});

function fetchedOpenAiCatalog() {
  return jest.fn().mockResolvedValue({
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
}

type TestProviderModel = {
  id: string;
  name: string;
  release_date: string;
  reasoning: boolean;
  status?: "alpha" | "beta" | "deprecated";
  provider?: {
    npm?: string;
  };
  modalities?: {
    input?: string[];
  };
  attachment?: boolean;
};

function providerItem(id: string, name: string, modelId: string) {
  return {
    id,
    name,
    models: [
      {
        id: modelId,
        name: modelId,
        variants: [],
        supportsImage: false,
        releaseDate: "2026-01-01",
      },
    ],
  };
}

function rawProvider(
  id: string,
  name: string,
  models: Record<string, TestProviderModel>,
) {
  return {
    id,
    name,
    api:
      id === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : undefined,
    models,
  };
}

function openAiModel(
  id: string,
  name: string,
  releaseDate: string,
  reasoning = true,
): TestProviderModel {
  return { id, name, release_date: releaseDate, reasoning };
}

function remoteCopilotModel(
  id: string,
  name: string,
  vision: boolean,
  mediaTypes: string[],
  modelPickerEnabled = true,
) {
  return {
    model_picker_enabled: modelPickerEnabled,
    id,
    name,
    version: `${id}-2026-01-01`,
    capabilities: {
      supports: { vision },
      limits: {
        vision: {
          supported_media_types: mediaTypes,
        },
      },
    },
  };
}

async function openAiOauthModels(models: Record<string, TestProviderModel>) {
  const catalog = createProviderCatalog({
    secrets: createSecretStore(),
    fetch: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        openai: {
          id: "openai",
          name: "OpenAI",
          api: "https://api.openai.com/v1/chat/completions",
          models,
        },
      }),
    }) as any,
    now: () => 1_000,
  });

  return catalog.modelOptions("openai", "oauth");
}

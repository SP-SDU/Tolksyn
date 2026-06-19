import {
  createProviderCatalog,
  isExperimentalProvider,
} from "@/services/provider-catalog";

import { createSecretStore } from "@/tests/helpers/fakes";

describe("provider catalog", () => {
  test("coalesces concurrent provider catalog loads", async () => {
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

  test("marks only default providers as non-experimental", () => {
    // Arrange and Act and Assert
    // Default providers ship with the app. Experimental ones are opt-in
    expect(isExperimentalProvider("openai")).toBe(false);
    expect(isExperimentalProvider("google")).toBe(false);
    expect(isExperimentalProvider("anthropic")).toBe(false);
    expect(isExperimentalProvider("github-copilot")).toBe(false);
    expect(isExperimentalProvider("openrouter")).toBe(true);
  });

  test("uses fetched provider defaults when provider exists in catalog", async () => {
    // Arrange
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

    // Act
    const defaults = await catalog.defaultsFor("openai");

    // Assert
    // Latest model from catalog used as default for the provider
    expect(defaults).toEqual({
      model: "gpt-5",
    });
  });

  test("defaults OpenAI endpoint to codex responses for oauth auth mode", async () => {
    // Arrange
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

    // Act
    const defaults = await catalog.defaultsFor("openai", "oauth");

    // Assert
    // OAuth mode selects the codex model by default
    expect(defaults).toEqual({
      model: "gpt-5.3-codex",
    });
  });

  test("returns codex endpoint fallback for openai oauth without fetched provider", async () => {
    // Arrange
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

    // Act
    const defaults = await catalog.defaultsFor("openai", "oauth");

    // Assert
    // Hardcoded fallback used when catalog has no provider entry
    expect(defaults.model).toBe("gpt-4.1-mini");
  });

  test("drops gpt-4.1 models and keeps newer OpenAI models", async () => {
    // Arrange
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

    // Act
    const models = await catalog.modelOptions("openai");

    // Assert
    // gpt-4.1 filtered out. Newer models retained
    expect(models.some((item) => item.id === "gpt-5.3-codex")).toBe(true);
    expect(models.some((item) => item.id === "gpt-4.1")).toBe(false);
  });

  test("uses local web github-copilot models proxy endpoint", async () => {
    // Arrange
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

    // Act and Assert
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

  test("includes gpt-5 base models in oauth mode", async () => {
    // Arrange
    const models = await openAiOauthModels({
      "gpt-5.5": openAiModel("gpt-5.5", "GPT-5.5", "2026-04-01"),
      "gpt-5.4": openAiModel("gpt-5.4", "GPT-5.4", "2026-03-01"),
    });

    // Act

    // Assert
    // gpt-5.x base models available in oauth mode
    expect(models.some((m) => m.id === "gpt-5.5")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5.4")).toBe(true);
  });

  test("includes codex models in oauth mode", async () => {
    // Arrange
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

    // Act

    // Assert
    // Codex models available in oauth mode
    expect(models.some((m) => m.id === "gpt-5.3-codex")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5.2-codex")).toBe(true);
  });

  test("includes mini models in oauth mode", async () => {
    // Arrange
    const models = await openAiOauthModels({
      "gpt-5.4-mini": openAiModel("gpt-5.4-mini", "GPT-5.4 Mini", "2026-03-01"),
      "gpt-5-mini": openAiModel("gpt-5-mini", "GPT-5 Mini", "2025-08-01"),
    });

    // Act

    // Assert
    // Mini models (cost-effective) available in oauth mode
    expect(models.some((m) => m.id === "gpt-5.4-mini")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5-mini")).toBe(true);
  });

  test("includes codex-mini and codex-max variants in oauth mode", async () => {
    // Arrange
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

    // Act

    // Assert
    // Codex size variants (mini/max) available in oauth mode
    expect(models.some((m) => m.id === "gpt-5.1-codex-mini")).toBe(true);
    expect(models.some((m) => m.id === "gpt-5.1-codex-max")).toBe(true);
  });

  test("excludes gpt-4 models from oauth mode", async () => {
    // Arrange
    const models = await openAiOauthModels({
      "gpt-4.1": openAiModel("gpt-4.1", "GPT-4.1", "2025-04-01"),
      "gpt-4o": openAiModel("gpt-4o", "GPT-4o", "2024-05-01", false),
    });

    // Act

    // Assert
    // gpt-4 models excluded from oauth mode (only gpt-5 and codex)
    expect(models.some((m) => m.id === "gpt-4.1")).toBe(false);
    expect(models.some((m) => m.id === "gpt-4o")).toBe(false);
  });

  test("excludes chat models from oauth mode", async () => {
    // Arrange
    const models = await openAiOauthModels({
      "gpt-5-chat": openAiModel("gpt-5-chat", "GPT-5 Chat", "2026-01-01"),
      "gpt-5.1-chat": openAiModel("gpt-5.1-chat", "GPT-5.1 Chat", "2025-11-01"),
    });

    // Act

    // Assert
    // Chat-suffixed models excluded from oauth mode
    expect(models.some((m) => m.id === "gpt-5-chat")).toBe(false);
    expect(models.some((m) => m.id === "gpt-5.1-chat")).toBe(false);
  });

  test("excludes image models from oauth mode", async () => {
    // Arrange
    const models = await openAiOauthModels({
      "gpt-5-image": openAiModel("gpt-5-image", "GPT-5 Image", "2026-01-01"),
      sora: openAiModel("sora", "Sora", "2026-01-01", false),
    });

    // Act

    // Assert
    // Image generation models excluded from oauth mode (text-only use case)
    expect(models.some((m) => m.id === "gpt-5-image")).toBe(false);
    expect(models.some((m) => m.id === "sora")).toBe(false);
  });
});

type TestProviderModel = {
  id: string;
  name: string;
  release_date: string;
  reasoning: boolean;
};

function openAiModel(
  id: string,
  name: string,
  releaseDate: string,
  reasoning = true,
): TestProviderModel {
  return { id, name, release_date: releaseDate, reasoning };
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

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createGitHubCopilot } from "github-copilot-oauth";
import { createOpenAIOAuth, deriveAccountId } from "openai-codex-oauth";

import { createRemoteExtractor } from "@/services/extraction/remote-extractor";
import { sampleExtractionImages } from "@/tests/helpers/fakes";
import { emptyStructuredItem } from "@/types/item-schema";
import { defaultSettings } from "@/types/settings";

jest.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: jest.fn(() =>
    jest.fn((model: string) => ({ provider: "anthropic", model })),
  ),
}));

jest.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: jest.fn(() =>
    jest.fn((model: string) => ({ provider: "google", model })),
  ),
}));

jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: jest.fn(() =>
    jest.fn((model: string) => ({ provider: "openai", model })),
  ),
}));

jest.mock("ai", () => ({
  generateText: jest.fn(),
}));

jest.mock("github-copilot-oauth", () => ({
  createGitHubCopilot: jest.fn(() =>
    jest.fn((model: string) => ({ provider: "github-copilot", model })),
  ),
}));

jest.mock("openai-codex-oauth", () => ({
  createOpenAIOAuth: jest.fn(() =>
    jest.fn((model: string) => ({ provider: "openai-oauth", model })),
  ),
  deriveAccountId: jest.fn((access: string) => `derived-${access}`),
}));

const generateTextMock = jest.mocked(generateText);
const createOpenAIMock = jest.mocked(createOpenAI);
const createGoogleGenerativeAIMock = jest.mocked(createGoogleGenerativeAI);
const createAnthropicMock = jest.mocked(createAnthropic);
const createOpenAIOAuthMock = jest.mocked(createOpenAIOAuth);
const deriveAccountIdMock = jest.mocked(deriveAccountId);
const createGitHubCopilotMock = jest.mocked(createGitHubCopilot);

const providerText = JSON.stringify({
  structured_json: emptyStructuredItem(),
  auxiliary_text_optional: "label text",
});

describe("remote extractor", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    createOpenAIMock.mockClear();
    createGoogleGenerativeAIMock.mockClear();
    createAnthropicMock.mockClear();
    createOpenAIOAuthMock.mockClear();
    deriveAccountIdMock.mockClear();
    createGitHubCopilotMock.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("uses the Vercel AI SDK for API-key extraction", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: providerText,
    } as Awaited<ReturnType<typeof generateText>>);
    const settings = defaultSettings();
    settings.provider.id = "openai";
    settings.provider.model = "gpt-4.1-mini";
    settings.provider.authModeByProvider.openai = "api";
    settings.provider.auth.openai = { type: "api", key: "openai-key" };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    const result = await extractor.extract({
      images: sampleExtractionImages(),
    });

    // Vercel AI SDK called with a user message containing text prompt and image file
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: undefined,
        messages: [
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({ type: "text" }),
              expect.objectContaining({
                type: "file",
                mediaType: "image/jpeg",
              }),
            ]),
          }),
        ],
      }),
    );
    expect(result.structuredJson).toEqual(emptyStructuredItem());
    expect(result.auxiliaryText).toBe("label text");
    expect(result.responseText).toBe(providerText);
    expect(result.metadata.provider).toBe("remote_ai_sdk");
    expect(result.metadata.imageWidth).toBe(1200);
    expect(result.metadata.imageHeight).toBe(800);
    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(1);
    expect(result.barcodes).toEqual([]);
  });

  test.each([
    ["openai", createOpenAIMock, "openai-key"],
    ["google", createGoogleGenerativeAIMock, "google-key"],
    ["anthropic", createAnthropicMock, "anthropic-key"],
  ])("passes API credentials to %s model factory", async (id, factory, key) => {
    generateTextMock.mockResolvedValueOnce({
      text: providerText,
    } as Awaited<ReturnType<typeof generateText>>);
    const settings = defaultSettings();
    settings.provider.id = id;
    settings.provider.model = `${id}-model`;
    settings.provider.authModeByProvider[id] = "api";
    settings.provider.auth[id] = { type: "api", key };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    await extractor.extract({ images: sampleExtractionImages() });

    expect(factory).toHaveBeenCalledWith({ apiKey: key });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: id, model: `${id}-model` },
      }),
    );
  });

  test("defaults missing auth mode to API-key auth", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: providerText,
    } as Awaited<ReturnType<typeof generateText>>);
    const settings = defaultSettings();
    settings.provider.id = "google";
    settings.provider.model = "gemini-2.0-flash";
    delete settings.provider.authModeByProvider.google;
    settings.provider.auth.google = { type: "api", key: "google-key" };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    await extractor.extract({ images: sampleExtractionImages() });

    expect(createGoogleGenerativeAIMock).toHaveBeenCalledWith({
      apiKey: "google-key",
    });
  });

  test.each(["openai", "google", "anthropic", "github-copilot"])(
    "fallback catalog supports %s image extraction",
    async (id) => {
      generateTextMock.mockResolvedValueOnce({
        text: providerText,
      } as Awaited<ReturnType<typeof generateText>>);
      const settings = defaultSettings();
      settings.provider.id = id;
      settings.provider.model = `${id}-model`;
      settings.provider.authModeByProvider[id] =
        id === "github-copilot" ? "oauth" : "api";
      settings.provider.auth[id] =
        id === "github-copilot"
          ? {
              type: "oauth",
              access: "gh-access",
              refresh: "gh-refresh",
              expires: 0,
            }
          : { type: "api", key: `${id}-key` };
      const extractor = createRemoteExtractor({
        getSettings: async () => settings,
      });

      await expect(
        extractor.extract({ images: sampleExtractionImages() }),
      ).resolves.toMatchObject({ metadata: { provider: "remote_ai_sdk" } });
    },
  );

  test("rejects unsupported fallback providers before auth", async () => {
    const settings = defaultSettings();
    settings.provider.id = "perplexity";
    settings.provider.model = "sonar-pro";
    settings.provider.authModeByProvider.perplexity = "api";
    settings.provider.auth.perplexity = { type: "api", key: "perplexity-key" };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
    });

    await expect(
      extractor.extract({ images: sampleExtractionImages() }),
    ).rejects.toMatchObject({
      code: "unsupported",
      message: expect.stringContaining("does not support image input"),
    });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  test("requires auth for supported API-key provider", async () => {
    const settings = defaultSettings();
    settings.provider.id = "google";
    settings.provider.model = "gemini-2.0-flash";
    settings.provider.authModeByProvider.google = "api";
    settings.provider.auth.google = { type: "api", key: "   " };

    await expectExtractionFailure(settings, {
      code: "auth_failed",
      message: "Configure a provider API key in Settings.",
    });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  test("rejects API-key auth when stored auth belongs to a different mode", async () => {
    const settings = defaultSettings();
    settings.provider.id = "google";
    settings.provider.model = "gemini-2.0-flash";
    settings.provider.authModeByProvider.google = "api";
    settings.provider.auth.google = {
      type: "oauth",
      access: "token",
      refresh: "refresh",
      expires: 0,
    };

    await expectExtractionFailure(settings, { code: "auth_failed" });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  test.each(["openai", "github-copilot"])(
    "requires OAuth auth object for %s",
    async (id) => {
      const settings = defaultSettings();
      settings.provider.id = id;
      settings.provider.model = `${id}-model`;
      settings.provider.authModeByProvider[id] = "oauth";
      delete settings.provider.auth[id];

      await expectExtractionFailure(settings, {
        code: "auth_failed",
        message: expect.stringContaining(
          id === "github-copilot" ? "GitHub Copilot OAuth" : "OpenAI OAuth",
        ),
      });
      expect(generateTextMock).not.toHaveBeenCalled();
    },
  );

  test.each(["openai", "github-copilot"])(
    "rejects API auth object for %s OAuth mode",
    async (id) => {
      const settings = defaultSettings();
      settings.provider.id = id;
      settings.provider.model = `${id}-model`;
      settings.provider.authModeByProvider[id] = "oauth";
      settings.provider.auth[id] = { type: "api", key: "api-key" };

      await expectExtractionFailure(settings, {
        code: "auth_failed",
        message: expect.stringContaining(
          id === "github-copilot" ? "GitHub Copilot OAuth" : "OpenAI OAuth",
        ),
      });
      expect(generateTextMock).not.toHaveBeenCalled();
    },
  );

  test("rejects OAuth mode for providers without OAuth extraction", async () => {
    const settings = defaultSettings();
    settings.provider.id = "google";
    settings.provider.model = "gemini-2.0-flash";
    settings.provider.authModeByProvider.google = "oauth";
    settings.provider.auth.google = {
      type: "oauth",
      access: "token",
      refresh: "refresh",
      expires: 0,
    };

    await expectExtractionFailure(settings, {
      code: "auth_failed",
      message: expect.stringContaining("OAuth extraction"),
    });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  test.each(["openai", "github-copilot"])(
    "requires non-empty OAuth access for %s",
    async (id) => {
      const settings = defaultSettings();
      settings.provider.id = id;
      settings.provider.model = `${id}-model`;
      settings.provider.authModeByProvider[id] = "oauth";
      settings.provider.auth[id] = {
        type: "oauth",
        access: "   ",
        refresh: "refresh",
        expires: 0,
      };

      await expectExtractionFailure(settings, {
        code: "auth_failed",
        message: expect.stringContaining(
          id === "github-copilot" ? "GitHub Copilot OAuth" : "OpenAI OAuth",
        ),
      });
      expect(generateTextMock).not.toHaveBeenCalled();
    },
  );

  test.each(["openai", "github-copilot"])(
    "rejects expired OAuth sessions for %s",
    async (id) => {
      jest.spyOn(Date, "now").mockReturnValue(1000);
      const settings = defaultSettings();
      settings.provider.id = id;
      settings.provider.model = `${id}-model`;
      settings.provider.authModeByProvider[id] = "oauth";
      settings.provider.auth[id] = {
        type: "oauth",
        access: "access",
        refresh: "refresh",
        expires: 1000,
      };

      await expectExtractionFailure(settings, {
        code: "auth_failed",
        message: `${id === "github-copilot" ? "GitHub Copilot" : "OpenAI"} OAuth session expired. Reconnect ${id === "github-copilot" ? "GitHub Copilot" : "OpenAI"} in Settings.`,
      });
      expect(generateTextMock).not.toHaveBeenCalled();
    },
  );

  test("uses OpenAI OAuth tokens and derives missing account id", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: providerText,
    } as Awaited<ReturnType<typeof generateText>>);
    const settings = defaultSettings();
    settings.provider.id = "openai";
    settings.provider.model = "gpt-5.3-codex";
    settings.provider.authModeByProvider.openai = "oauth";
    settings.provider.auth.openai = {
      type: "oauth",
      access: "oa-access",
      refresh: "oa-refresh",
      expires: Date.now() + 60_000,
    };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    await extractor.extract({ images: sampleExtractionImages() });

    expect(deriveAccountIdMock).toHaveBeenCalledWith("oa-access");
    expect(createOpenAIOAuthMock).toHaveBeenCalledWith({
      tokens: {
        accessToken: "oa-access",
        refreshToken: "oa-refresh",
        expiresAt: settings.provider.auth.openai.expires,
        accountId: "derived-oa-access",
      },
      originator: "tolksyn",
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "openai-oauth", model: "gpt-5.3-codex" },
      }),
    );
  });

  test("keeps explicit OpenAI OAuth account id", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: providerText,
    } as Awaited<ReturnType<typeof generateText>>);
    const settings = defaultSettings();
    settings.provider.id = "openai";
    settings.provider.model = "gpt-5.3-codex";
    settings.provider.authModeByProvider.openai = "oauth";
    settings.provider.auth.openai = {
      type: "oauth",
      access: "oa-access",
      refresh: "",
      expires: 0,
      accountId: "acct-123",
    };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    await extractor.extract({ images: sampleExtractionImages() });

    expect(deriveAccountIdMock).not.toHaveBeenCalled();
    expect(createOpenAIOAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: expect.objectContaining({
          refreshToken: undefined,
          expiresAt: undefined,
          accountId: "acct-123",
        }),
      }),
    );
  });

  test("uses GitHub Copilot OAuth refresh token and enterprise URL", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: providerText,
    } as Awaited<ReturnType<typeof generateText>>);
    const settings = defaultSettings();
    settings.provider.id = "github-copilot";
    settings.provider.model = "gpt-4.1";
    settings.provider.authModeByProvider["github-copilot"] = "oauth";
    settings.provider.auth["github-copilot"] = {
      type: "oauth",
      access: "gh-access",
      refresh: "gh-refresh",
      expires: 0,
      enterpriseUrl: "https://github.example.com",
    };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    await extractor.extract({ images: sampleExtractionImages() });

    expect(createGitHubCopilotMock).toHaveBeenCalledWith({
      tokens: {
        githubToken: "gh-refresh",
        enterpriseUrl: "https://github.example.com",
      },
      enterpriseUrl: "https://github.example.com",
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "github-copilot", model: "gpt-4.1" },
      }),
    );
  });

  test("uses GitHub Copilot access token when refresh token is absent", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: providerText,
    } as Awaited<ReturnType<typeof generateText>>);
    const settings = defaultSettings();
    settings.provider.id = "github-copilot";
    settings.provider.model = "gpt-4.1";
    settings.provider.authModeByProvider["github-copilot"] = "oauth";
    settings.provider.auth["github-copilot"] = {
      type: "oauth",
      access: "gh-access",
      refresh: "",
      expires: 0,
    };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    await extractor.extract({ images: sampleExtractionImages() });

    expect(createGitHubCopilotMock).toHaveBeenCalledWith({
      tokens: {
        githubToken: "gh-access",
        enterpriseUrl: undefined,
      },
      enterpriseUrl: undefined,
    });
  });

  test("uses caller prompt and abort signal in AI SDK request", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: providerText,
    } as Awaited<ReturnType<typeof generateText>>);
    const controller = new AbortController();
    const settings = defaultSettings();
    settings.provider.id = "openai";
    settings.provider.model = "gpt-4.1-mini";
    settings.provider.authModeByProvider.openai = "api";
    settings.provider.auth.openai = { type: "api", key: "openai-key" };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    await extractor.extract({
      images: sampleExtractionImages(),
      prompt: "Use this prompt.",
      signal: controller.signal,
    });

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: controller.signal,
        maxRetries: 0,
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              { type: "text", text: "Use this prompt." },
            ]),
          }),
        ],
      }),
    );
  });

  test("uses one millisecond minimum duration", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    generateTextMock.mockResolvedValueOnce({
      text: providerText,
    } as Awaited<ReturnType<typeof generateText>>);
    const settings = defaultSettings();
    settings.provider.id = "openai";
    settings.provider.model = "gpt-4.1-mini";
    settings.provider.authModeByProvider.openai = "api";
    settings.provider.auth.openai = { type: "api", key: "openai-key" };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    const result = await extractor.extract({
      images: sampleExtractionImages(),
    });

    expect(result.metadata.durationMs).toBe(1);
  });

  test("uses zero metadata dimensions when no images are provided", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: providerText,
    } as Awaited<ReturnType<typeof generateText>>);
    const settings = defaultSettings();
    settings.provider.id = "openai";
    settings.provider.model = "gpt-4.1-mini";
    settings.provider.authModeByProvider.openai = "api";
    settings.provider.auth.openai = { type: "api", key: "openai-key" };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    const result = await extractor.extract({ images: [] });

    expect(result.metadata.imageWidth).toBe(0);
    expect(result.metadata.imageHeight).toBe(0);
  });

  test("returns remote AI SDK fallback diagnostics when generation fails", async () => {
    generateTextMock.mockRejectedValue(new Error("provider down"));
    const settings = defaultSettings();
    settings.provider.id = "openai";
    settings.provider.model = "gpt-4.1-mini";
    settings.provider.authModeByProvider.openai = "api";
    settings.provider.auth.openai = { type: "api", key: "openai-key" };
    const extractor = createRemoteExtractor({
      getSettings: async () => settings,
      providerCatalog: { supportsImage: async () => true },
    } as any);

    const result = await extractor.extract({
      images: sampleExtractionImages(),
    });

    expect(generateTextMock).toHaveBeenCalledTimes(3);
    expect(result.metadata.provider).toBe("remote_ai_sdk");
    expect(result.extractionDiagnostics).toMatchObject({
      failed: true,
      finalError: "provider down",
      fallbackStructuredJson: true,
    });
  });

  test("fails before generation when models.dev lists a provider without an enabled AI SDK adapter", async () => {
    const settings = defaultSettings();
    settings.provider.id = "perplexity";
    settings.provider.model = "sonar-pro";
    settings.provider.authModeByProvider.perplexity = "api";
    settings.provider.auth.perplexity = { type: "api", key: "perplexity-key" };

    // Provider without AI SDK adapter fails before calling generateText
    await expectExtractionFailure(settings, {
      code: "unsupported",
      message: expect.stringContaining("not enabled"),
    });
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});

async function expectExtractionFailure(
  settings: ReturnType<typeof defaultSettings>,
  error: Record<string, unknown>,
) {
  const extractor = createRemoteExtractor({
    getSettings: async () => settings,
    providerCatalog: { supportsImage: async () => true },
  } as any);

  await expect(
    extractor.extract({
      images: sampleExtractionImages(),
    }),
  ).rejects.toMatchObject(error);
}

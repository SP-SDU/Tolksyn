import { generateText } from "ai";

import { createRemoteExtractor } from "@/services/extraction/remote-extractor";
import { sampleExtractionImages } from "@/tests/helpers/fakes";
import { emptyStructuredItem } from "@/types/item-schema";
import { defaultSettings } from "@/types/settings";

jest.mock("ai", () => ({
  generateText: jest.fn(),
}));

const generateTextMock = jest.mocked(generateText);

describe("remote extractor", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  test("uses the Vercel AI SDK for API-key extraction", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: JSON.stringify({ structured_json: emptyStructuredItem() }),
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
    expect(result.metadata.provider).toBe("remote_ai_sdk");
  });

  test("requires auth for supported API-key provider", async () => {
    // Empty API key for an API-key authed provider
    const settings = defaultSettings();
    settings.provider.id = "google";
    settings.provider.model = "gemini-2.0-flash";
    settings.provider.authModeByProvider.google = "api";
    settings.provider.auth.google = { type: "api", key: "" };

    // Missing key should fail immediately without calling the AI SDK
    await expectExtractionFailure(settings, { code: "auth_failed" });
    expect(generateTextMock).not.toHaveBeenCalled();
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

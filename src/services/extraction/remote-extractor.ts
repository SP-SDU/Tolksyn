import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createGitHubCopilot } from "github-copilot-oauth";
import { createOpenAIOAuth, deriveAccountId } from "openai-codex-oauth";

import { normalizeRemoteError } from "@/services/extraction/errors";
import { buildExtractionPrompt } from "@/services/extraction/prompt";
import { parseProviderJsonEnvelope } from "@/services/extraction/response";
import { extractWithRetries } from "@/services/extraction/retry";
import { createProviderCatalog } from "@/services/providers/provider-catalog";
import { AppError } from "@/types/app-error";
import type { AppSettings, ProviderAuth } from "@/types/settings";

type LanguageModelFactory = (
  model: string,
) => Parameters<typeof generateText>[0]["model"];

type RemoteExtractorInput = {
  images: {
    imageUri: string;
    imageBase64: string;
    mimeType: string;
    width: number;
    height: number;
  }[];
  prompt?: string;
  signal?: AbortSignal;
};

const API_PROVIDER_FACTORIES: Record<
  string,
  (credential: string) => LanguageModelFactory
> = {
  openai: (apiKey) => createOpenAI({ apiKey }),
  google: (apiKey) => createGoogleGenerativeAI({ apiKey }),
  anthropic: (apiKey) => createAnthropic({ apiKey }),
};

const OAUTH_PROVIDER_FACTORIES: Record<
  string,
  (auth: Extract<ProviderAuth, { type: "oauth" }>) => LanguageModelFactory
> = {
  openai: (auth) =>
    createOpenAIOAuth({
      tokens: {
        accessToken: auth.access,
        refreshToken: auth.refresh || undefined,
        expiresAt: auth.expires || undefined,
        accountId: auth.accountId ?? deriveAccountId(auth.access),
      },
      originator: "tolksyn",
    }),
  "github-copilot": (auth) =>
    createGitHubCopilot({
      tokens: {
        githubToken: auth.refresh || auth.access,
        enterpriseUrl: auth.enterpriseUrl,
      },
      enterpriseUrl: auth.enterpriseUrl,
    }),
};

/** Misconfigured vision models should fail before capture work, not after image persist. */
export function createRemoteExtractor(settingsRepository: {
  getSettings(): Promise<AppSettings>;
  providerCatalog?: ReturnType<typeof createProviderCatalog>;
}) {
  return {
    async extract(input: RemoteExtractorInput) {
      const settings = await settingsRepository.getSettings();
      const id = settings.provider.id;
      const mode = settings.provider.authModeByProvider[id] ?? "api";
      const auth = requireAuth(settings, id, mode);

      await assertSupportsImages(
        settingsRepository.providerCatalog,
        id,
        settings.provider.model,
        mode,
      );

      const modelFactory = resolveModelFactory({
        providerId: id,
        mode,
        credential: auth.credential,
        auth: auth.value,
      });

      return extractWithRetries({
        fallbackProvider: "remote_ai_sdk",
        input: {
          apiKey: auth.credential,
          model: settings.provider.model,
          images: input.images.map((img) => ({
            imageBase64: img.imageBase64,
            mimeType: img.mimeType,
            width: img.width,
            height: img.height,
          })),
          timeoutMs: settings.provider.timeoutMs,
          prompt: input.prompt,
          signal: input.signal,
        },
        extract: (payload) => runAiSdkExtraction(modelFactory, payload),
      });
    },
  };
}

async function assertSupportsImages(
  catalog: ReturnType<typeof createProviderCatalog> | undefined,
  id: string,
  model: string,
  mode: "api" | "oauth",
) {
  const supported = catalog
    ? await catalog.supportsImage(id, model, mode)
    : ["openai", "google", "anthropic", "github-copilot"].includes(id);

  if (!supported) {
    throw new AppError(
      "unsupported",
      `Model "${model}" for provider "${id}" does not support image input.`,
    );
  }
}

function requireAuth(
  settings: AppSettings,
  id: string,
  mode: "api" | "oauth",
): { credential: string; value: ProviderAuth | undefined } {
  const auth = settings.provider.auth[id];

  if (mode === "api") {
    if (!auth || auth.type !== "api" || !auth.key.trim()) {
      throw new AppError("auth_failed", "Configure a provider API key in Settings.");
    }

    return { credential: auth.key, value: auth };
  }

  if (!["openai", "github-copilot"].includes(id)) {
    throw new AppError(
      "auth_failed",
      "OAuth extraction is currently supported only for OpenAI and GitHub Copilot.",
    );
  }

  if (!auth || auth.type !== "oauth" || !auth.access.trim()) {
    throw new AppError(
      "auth_failed",
      `Connect ${oauthProviderName(id)} OAuth in Settings before running extraction.`,
    );
  }

  if (auth.expires > 0 && auth.expires <= Date.now()) {
    const name = oauthProviderName(id);
    throw new AppError(
      "auth_failed",
      `${name} OAuth session expired. Reconnect ${name} in Settings.`,
    );
  }

  return { credential: auth.access, value: auth };
}

function oauthProviderName(id: string) {
  return id === "github-copilot" ? "GitHub Copilot" : "OpenAI";
}

async function runAiSdkExtraction(
  modelFactory: LanguageModelFactory,
  payload: Parameters<typeof extractWithRetries>[0]["input"],
) {
  try {
    const startedAt = Date.now();
    const prompt = payload.prompt ?? buildExtractionPrompt();
    const response = await generateText({
      model: modelFactory(payload.model),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...payload.images.map((img) => ({
              type: "file" as const,
              data: img.imageBase64,
              mediaType: img.mimeType,
            })),
          ],
        },
      ],
      abortSignal: payload.signal,
      maxRetries: 0,
    });
    const parsed = parseProviderJsonEnvelope(response.text);

    return {
      structuredJson: parsed.structuredJson,
      barcodes: [],
      auxiliaryText: parsed.auxiliaryText,
      responseText: response.text,
      metadata: {
        provider: "remote_ai_sdk" as const,
        durationMs: Math.max(1, Date.now() - startedAt),
        imageWidth: payload.images[0]?.width ?? 0,
        imageHeight: payload.images[0]?.height ?? 0,
      },
    };
  } catch (error) {
    throw normalizeRemoteError(error);
  }
}

function resolveModelFactory({
  providerId,
  mode,
  credential,
  auth,
}: {
  providerId: string;
  mode: "api" | "oauth";
  credential: string;
  auth: ProviderAuth | undefined;
}): LanguageModelFactory {
  if (mode === "api") {
    const createProvider = API_PROVIDER_FACTORIES[providerId];
    if (!createProvider) {
      throw new AppError(
        "unsupported",
        `Provider "${providerId}" is listed by the catalog but is not enabled in Tolksyn's AI SDK adapter set.`,
      );
    }

    return createProvider(credential);
  }

  const createProvider = OAUTH_PROVIDER_FACTORIES[providerId];
  if (createProvider && auth?.type === "oauth") {
    return createProvider(auth);
  }

  throw new AppError(
    "unsupported",
    `OAuth is not enabled for provider "${providerId}".`,
  );
}

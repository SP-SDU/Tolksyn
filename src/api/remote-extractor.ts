import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createGitHubCopilot } from 'github-copilot-oauth';
import { createOpenAIOAuth, deriveAccountId } from 'openai-codex-oauth';

import { buildExtractionPrompt } from '@/api/providers/extraction-prompt';
import { normalizeRemoteError, parseProviderJsonEnvelope } from '@/api/providers/remote-extraction-shared';
import { extractWithRetries } from '@/services/extraction-retry';
import { createProviderCatalog } from '@/services/provider-catalog';
import { AppError } from '@/types/app-error';
import type { AppSettings, ProviderAuth } from '@/types/settings';

type LanguageModelFactory = (model: string) => Parameters<typeof generateText>[0]['model'];

const API_PROVIDER_FACTORIES: Record<string, (credential: string) => LanguageModelFactory> = {
  openai: (apiKey) => createOpenAI({ apiKey }),
  google: (apiKey) => createGoogleGenerativeAI({ apiKey }),
  anthropic: (apiKey) => createAnthropic({ apiKey }),
};

export function createRemoteExtractor(settingsRepository: {
  getSettings(): Promise<AppSettings>;
  providerCatalog?: ReturnType<typeof createProviderCatalog>;
}) {
  return {
    async extract(input: {
      images: {
        imageUri: string;
        imageBase64: string;
        mimeType: string;
        width: number;
        height: number;
      }[];
      prompt?: string;
      signal?: AbortSignal;
    }) {
      const settings = await settingsRepository.getSettings();
      const id = settings.provider.id;
      const mode = settings.provider.authModeByProvider[id] ?? 'api';
      const supported = settingsRepository.providerCatalog
        ? await settingsRepository.providerCatalog.supportsImage(id, settings.provider.model, mode)
        : ['openai', 'google', 'anthropic', 'github-copilot'].includes(id);
      if (!supported) {
        throw new AppError(
          'unsupported',
          `Model "${settings.provider.model}" for provider "${id}" does not support image input.`,
        );
      }

      const auth = settings.provider.auth[id];
      let credential = '';

      if (mode === 'api') {
        if (!auth || auth.type !== 'api' || !auth.key.trim()) {
          throw new AppError('auth_failed', 'Configure a provider API key in Settings.');
        }

        credential = auth.key;
      } else {
        if (!['openai', 'github-copilot'].includes(id)) {
          throw new AppError('auth_failed', 'OAuth extraction is currently supported only for OpenAI and GitHub Copilot.');
        }

        if (!auth || auth.type !== 'oauth' || !auth.access.trim()) {
          const providerName = id === 'github-copilot' ? 'GitHub Copilot' : 'OpenAI';
          throw new AppError('auth_failed', `Connect ${providerName} OAuth in Settings before running extraction.`);
        }

        if (auth.expires > 0 && auth.expires <= Date.now()) {
          const providerName = id === 'github-copilot' ? 'GitHub Copilot' : 'OpenAI';
          throw new AppError('auth_failed', `${providerName} OAuth session expired. Reconnect ${providerName} in Settings.`);
        }

        credential = auth.access;
      }

      const modelFactory = resolveModelFactory({ providerId: id, mode, credential, auth });

return extractWithRetries({
        fallbackProvider: 'remote_ai_sdk',
        input: {
          apiKey: credential,
          model: settings.provider.model,
          images: input.images.map(img => ({
            imageBase64: img.imageBase64,
            mimeType: img.mimeType,
            width: img.width,
            height: img.height,
          })),
          timeoutMs: settings.provider.timeoutMs,
          prompt: input.prompt,
          signal: input.signal,
        },
        extract: async (payload) => {
          try {
            const startedAt = Date.now();
            const prompt = payload.prompt ?? buildExtractionPrompt();
            const response = await generateText({
              model: modelFactory(payload.model),
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    ...payload.images.map(img => ({
                      type: 'file' as const,
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
                provider: 'remote_ai_sdk' as const,
                durationMs: Math.max(1, Date.now() - startedAt),
                imageWidth: payload.images[0]?.width ?? 0,
                imageHeight: payload.images[0]?.height ?? 0,
              },
            };
          } catch (error) {
            throw normalizeRemoteError(error);
          }
        },
      });
    },
  };
}

function resolveModelFactory({
  providerId,
  mode,
  credential,
  auth,
}: {
  providerId: string;
  mode: 'api' | 'oauth';
  credential: string;
  auth: ProviderAuth | undefined;
}): LanguageModelFactory {
  if (mode === 'api') {
    const createProvider = API_PROVIDER_FACTORIES[providerId];
    if (!createProvider) {
      throw new AppError('unsupported', `Provider "${providerId}" is listed by the catalog but is not enabled in Tolksyn's AI SDK adapter set.`);
    }

    return createProvider(credential);
  }

  if (providerId === 'openai' && auth?.type === 'oauth') {
    return createOpenAIOAuth({
      tokens: {
        accessToken: auth.access,
        refreshToken: auth.refresh || undefined,
        expiresAt: auth.expires || undefined,
        accountId: auth.accountId ?? deriveAccountId(auth.access),
      },
      originator: 'tolksyn',
    });
  }

  if (providerId === 'github-copilot' && auth?.type === 'oauth') {
    return createGitHubCopilot({
      tokens: {
        githubToken: auth.refresh || auth.access,
        enterpriseUrl: auth.enterpriseUrl,
      },
      enterpriseUrl: auth.enterpriseUrl,
    });
  }

  throw new AppError('unsupported', `OAuth is not enabled for provider "${providerId}".`);
}

import { createGeminiExtractor } from '@/api/providers/gemini-extractor';
import { createOpenAICodexExtractor } from '@/api/providers/openai-codex-extractor';
import { createOpenAICompatibleExtractor } from '@/api/providers/openai-compatible-extractor';
import { extractWithRetries } from '@/services/extraction-retry';
import { createProviderCatalog } from '@/services/provider-catalog';
import { AppError } from '@/types/app-error';
import type { AppSettings } from '@/types/settings';

export function createRemoteExtractor(settingsRepository: {
  getSettings(): Promise<AppSettings>;
  providerCatalog?: ReturnType<typeof createProviderCatalog>;
}) {
  const openaiCompatible = createOpenAICompatibleExtractor({ fetch });
  const codex = createOpenAICodexExtractor({ fetch });
  const gemini = createGeminiExtractor({ fetch });

  return {
    async extract(input: {
      imageUri: string;
      imageBase64: string;
      mimeType: string;
      width: number;
      height: number;
    }) {
      const settings = await settingsRepository.getSettings();
      const id = settings.provider.id;
      const mode = settings.provider.authModeByProvider[id] ?? 'api';
      const supported = settingsRepository.providerCatalog
        ? await settingsRepository.providerCatalog.supportsImage(id, settings.provider.model, mode)
        : ['openai', 'google', 'github-copilot'].includes(id);
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

      if (id === 'google') {
        return extractWithRetries({
          input: {
            endpointUrl: settings.provider.endpointUrl,
            apiKey: credential,
            model: settings.provider.model,
            imageBase64: input.imageBase64,
            mimeType: input.mimeType,
            timeoutMs: settings.provider.timeoutMs,
            imageWidth: input.width,
            imageHeight: input.height,
          },
          extract: (payload) => gemini.extract(payload),
        });
      }

      if (id === 'openai' && mode === 'oauth' && settings.provider.endpointUrl.includes('chatgpt.com/backend-api/codex/responses')) {
        return extractWithRetries({
          input: {
            endpointUrl: settings.provider.endpointUrl,
            apiKey: '',
            model: settings.provider.model,
            imageBase64: input.imageBase64,
            mimeType: input.mimeType,
            timeoutMs: settings.provider.timeoutMs,
            imageWidth: input.width,
            imageHeight: input.height,
          },
          extract: (payload) =>
            codex.extract({
              ...payload,
              oauth: auth as Extract<typeof auth, { type: 'oauth' }>,
            }),
        });
      }

      return extractWithRetries({
        input: {
          endpointUrl: settings.provider.endpointUrl,
          apiKey: credential,
          model: settings.provider.model,
          imageBase64: input.imageBase64,
          mimeType: input.mimeType,
          timeoutMs: settings.provider.timeoutMs,
          imageWidth: input.width,
          imageHeight: input.height,
        },
        extract: (payload) => openaiCompatible.extract(payload),
      });
    },
  };
}

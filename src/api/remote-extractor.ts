import { AppError } from '@/types/app-error';
import type { AppSettings } from '@/types/settings';
import { createGeminiExtractor } from '@/api/providers/gemini-extractor';
import { createOpenAICompatibleExtractor } from '@/api/providers/openai-compatible-extractor';

export function createRemoteExtractor(settingsRepository: {
  getSettings(): Promise<AppSettings>;
}) {
  const openaiCompatible = createOpenAICompatibleExtractor({ fetch });
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
      if (!settings.provider.apiKey.trim()) {
        throw new AppError('auth_failed', 'Configure a provider API key in Settings.');
      }

      if (settings.provider.kind === 'gemini') {
        return gemini.extract({
          endpointUrl: settings.provider.endpointUrl,
          apiKey: settings.provider.apiKey,
          model: settings.provider.model,
          imageBase64: input.imageBase64,
          mimeType: input.mimeType,
          timeoutMs: settings.provider.timeoutMs,
          imageWidth: input.width,
          imageHeight: input.height,
        });
      }

      return openaiCompatible.extract({
        endpointUrl: settings.provider.endpointUrl,
        apiKey: settings.provider.apiKey,
        model: settings.provider.model,
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        timeoutMs: settings.provider.timeoutMs,
        imageWidth: input.width,
        imageHeight: input.height,
      });
    },
  };
}

import { providerHttpStatusToError } from '@/types/app-error';
import {
  ensureHttps,
  extractionTimeoutMs,
  normalizeRemoteError,
  parseProviderJsonEnvelope,
} from '@/api/providers/remote-extraction-shared';
import { buildExtractionPrompt } from '@/api/providers/extraction-prompt';
import type {
  FetchLike,
  RemoteExtractionInput,
  RemoteExtractionResult,
} from '@/api/providers/remote-extraction-types';

export function createOpenAICompatibleExtractor({ fetch }: { fetch: FetchLike }) {
  return {
    async extract(input: RemoteExtractionInput): Promise<RemoteExtractionResult> {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), extractionTimeoutMs(input.timeoutMs));

      try {
        const url = ensureHttps(input.endpointUrl);
        const startedAt = Date.now();
        const response = await fetch(url.toString(), {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            model: input.model,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: input.prompt ?? buildExtractionPrompt(),
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${input.mimeType};base64,${input.imageBase64}`,
                    },
                  },
                ],
              },
            ],
          }),
        });

        if (!response.ok) {
          throw await providerHttpStatusToError(response);
        }

        const payload = (await response.json()) as {
          choices?: { message?: { content?: unknown } }[];
        };
        const content = payload.choices?.[0]?.message?.content;
        const parsed = parseProviderJsonEnvelope(content);
        const responseText = typeof content === 'string' ? content : JSON.stringify(content ?? null);

        return {
          structuredJson: parsed.structuredJson,
          barcodes: [],
          auxiliaryText: parsed.auxiliaryText,
          responseText,
          metadata: {
            provider: 'remote_openai_compatible',
            durationMs: Math.max(1, Date.now() - startedAt),
            imageWidth: input.imageWidth ?? 0,
            imageHeight: input.imageHeight ?? 0,
          },
        };
      } catch (error) {
        throw normalizeRemoteError(error);
      } finally {
        clearTimeout(timeoutHandle);
      }
    },
  };
}

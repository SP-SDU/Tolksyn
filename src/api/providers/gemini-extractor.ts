import { AppError, providerHttpStatusToError } from '@/types/app-error';
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
import { createAbortError, linkAbortSignal } from '@/utils/abort';

export function createGeminiExtractor({ fetch }: { fetch: FetchLike }) {
  return {
    async extract(input: RemoteExtractionInput): Promise<RemoteExtractionResult> {
      const linked = linkAbortSignal(input.signal);
      const timeoutHandle = setTimeout(() => linked.controller.abort(), extractionTimeoutMs(input.timeoutMs));

      try {
        const url = ensureHttps(input.endpointUrl);
        const startedAt = Date.now();
        const response = await fetch(url.toString(), {
          method: 'POST',
          signal: linked.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': input.apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: input.prompt ?? buildExtractionPrompt(),
                  },
                  {
                    inlineData: {
                      mimeType: input.mimeType,
                      data: input.imageBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        });

        if (!response.ok) {
          throw await providerHttpStatusToError(response);
        }

        const payload = await parseProviderResponseJson<{
          candidates?: { content?: { parts?: { text?: unknown }[] } }[];
        }>(response);
        const content = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
        const parsed = parseProviderJsonEnvelope(content);
        const responseText = typeof content === 'string' ? content : JSON.stringify(content ?? null);

        return {
          structuredJson: parsed.structuredJson,
          barcodes: [],
          auxiliaryText: parsed.auxiliaryText,
          responseText,
          metadata: {
            provider: 'remote_gemini',
            durationMs: Math.max(1, Date.now() - startedAt),
            imageWidth: input.imageWidth ?? 0,
            imageHeight: input.imageHeight ?? 0,
          },
        };
      } catch (error) {
        if (input.signal?.aborted) {
          throw createAbortError();
        }

        throw normalizeRemoteError(error);
      } finally {
        clearTimeout(timeoutHandle);
        linked.cleanup();
      }
    },
  };
}

async function parseProviderResponseJson<T>(response: Response): Promise<T> {
  if (typeof response.text !== 'function') {
    return response.json() as Promise<T>;
  }

  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error('[tolksyn] Provider HTTP response was malformed JSON:', raw);
    throw new AppError('invalid_response', 'Provider HTTP response was malformed JSON.', error);
  }
}

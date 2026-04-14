import { AppError } from '@/types/app-error';
import {
  ensureHttps,
  normalizeRemoteError,
  parseProviderJsonEnvelope,
} from '@/api/providers/remote-extraction-shared';
import { buildExtractionPrompt } from '@/api/providers/extraction-prompt';
import type {
  FetchLike,
  RemoteExtractionInput,
  RemoteExtractionResult,
} from '@/api/providers/remote-extraction-types';

export function createGeminiExtractor({ fetch }: { fetch: FetchLike }) {
  return {
    async extract(input: RemoteExtractionInput): Promise<RemoteExtractionResult> {
      try {
        const url = ensureHttps(input.endpointUrl);
        const startedAt = Date.now();
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': input.apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: buildExtractionPrompt(),
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
          throw httpStatusToError(response.status);
        }

        const payload = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: unknown }[] } }[];
        };
        const content = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
        const parsed = parseProviderJsonEnvelope(content);

        return {
          structuredJson: parsed.structuredJson,
          barcodes: [],
          auxiliaryText: parsed.auxiliaryText,
          metadata: {
            provider: 'remote_gemini',
            durationMs: Math.max(1, Date.now() - startedAt),
            imageWidth: input.imageWidth ?? 0,
            imageHeight: input.imageHeight ?? 0,
          },
        };
      } catch (error) {
        throw normalizeRemoteError(error);
      }
    },
  };
}

function httpStatusToError(status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError('auth_failed', 'Provider authentication failed.');
  }

  if (status === 429) {
    return new AppError('rate_limited', 'Provider rate limited the request.');
  }

  if (status >= 500) {
    return new AppError('network_unavailable', 'Provider is temporarily unavailable.');
  }

  return new AppError('invalid_response', 'Provider returned an unexpected response.');
}

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
import type { ProviderAuth } from '@/types/settings';

export function createOpenAICodexExtractor({ fetch }: { fetch: FetchLike }) {
  return {
    async extract(
      input: RemoteExtractionInput & {
        oauth: Extract<ProviderAuth, { type: 'oauth' }>;
      },
    ): Promise<RemoteExtractionResult> {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), extractionTimeoutMs(input.timeoutMs));

      try {
        const url = codexUrl(input.endpointUrl);
        const startedAt = Date.now();
        const payload = {
          model: input.model,
          store: false,
          stream: true,
          instructions: input.prompt ?? buildExtractionPrompt(),
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_image',
                  image_url: `data:${input.mimeType};base64,${input.imageBase64}`,
                },
              ],
            },
          ],
        };
        const response = await fetch(url.toString(), {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${input.oauth.access}`,
            'ChatGPT-Account-Id': input.oauth.accountId ?? '',
            originator: 'tolksyn',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw await providerHttpStatusToError(response);
        }

        const raw =
          typeof response.text === 'function'
            ? await response.text()
            : JSON.stringify(
                ((await response.json()) as {
                  output?: {
                    content?: {
                      type?: string;
                      text?: string;
                    }[];
                  }[];
                }) ?? {},
              );
        const text = extractOutputText(raw);
        const parsed = parseProviderJsonEnvelope(text);

        return {
          structuredJson: parsed.structuredJson,
          barcodes: [],
          auxiliaryText: parsed.auxiliaryText,
          responseText: text,
          metadata: {
            provider: 'remote_openai_codex',
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

function codexUrl(endpointUrl: string): URL {
  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    const origin = window.location.origin.replace(/\/$/, '');
    return new URL(`${origin}/api/proxy/openai/codex/responses`);
  }

  return ensureHttps(endpointUrl);
}

function extractOutputText(raw: string): string {
  const direct = extractOutputTextFromJson(raw);
  if (direct) {
    return direct;
  }

  const fromSse = extractOutputTextFromSse(raw);
  if (fromSse) {
    return fromSse;
  }

  throw new AppError('invalid_response', raw || 'Provider response did not contain output_text.');
}

function extractOutputTextFromJson(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as {
      output?: {
        content?: {
          type?: string;
          text?: string;
        }[];
      }[];
    };

    return parsed.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === 'output_text' && typeof part.text === 'string')?.text;
  } catch {
    return undefined;
  }
}

function extractOutputTextFromSse(raw: string): string | undefined {
  const rows = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'));

  let accumulated = '';

  for (const row of rows) {
    const data = row.slice(5).trim();
    if (!data || data === '[DONE]') {
      continue;
    }

    try {
      const event = JSON.parse(data) as {
        type?: string;
        delta?: string;
        text?: string;
        response?: {
          output?: {
            content?: {
              type?: string;
              text?: string;
            }[];
          }[];
        };
      };

      if (event.response?.output) {
        const value = event.response.output
          .flatMap((item) => item.content ?? [])
          .find((part) => part.type === 'output_text' && typeof part.text === 'string')?.text;
        if (value) {
          return value;
        }
      }

      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        accumulated += event.delta;
      }

      if (event.type === 'response.output_text.done' && typeof event.text === 'string') {
        return event.text;
      }
    } catch {
    }
  }

  return accumulated || undefined;
}

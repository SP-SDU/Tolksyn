import { AppError, providerHttpStatusToError } from '@/types/app-error';
import {
  extractionTimeoutMs,
  normalizeRemoteError,
  parseProviderJsonEnvelope,
} from '@/api/providers/remote-extraction-shared';
import { buildExtractionPrompt } from '@/api/providers/extraction-prompt';
import {
  copilotBase,
  copilotHeaders,
  exchangeCopilotAccessToken,
  isCopilotResponsesModel,
  normalizeEnterpriseDomain,
} from '@/api/providers/github-copilot-shared';
import type {
  FetchLike,
  RemoteExtractionInput,
  RemoteExtractionResult,
} from '@/api/providers/remote-extraction-types';
import type { ProviderAuth } from '@/types/settings';
import { createAbortError, linkAbortSignal } from '@/utils/abort';

export function createGitHubCopilotExtractor({ fetch }: { fetch: FetchLike }) {
  return {
    async extract(
      input: RemoteExtractionInput & {
        oauth: Extract<ProviderAuth, { type: 'oauth' }>;
      },
    ): Promise<RemoteExtractionResult> {
      const linked = linkAbortSignal(input.signal);
      const timeoutHandle = setTimeout(() => linked.controller.abort(), extractionTimeoutMs(input.timeoutMs));

      try {
        const useResponses = isCopilotResponsesModel(input.model);
        const url = copilotUrl(useResponses, input.oauth.enterpriseUrl);
        const refreshToken = input.oauth.refresh?.trim() || input.oauth.access?.trim();
        if (!refreshToken) {
          throw new AppError('auth_failed', 'GitHub Copilot OAuth token is missing. Reconnect GitHub Copilot in Settings.');
        }

        const startedAt = Date.now();
        const response = await fetch(url.toString(), {
          method: 'POST',
          signal: linked.signal,
          headers: await copilotRequestHeaders({
            fetch,
            refreshToken,
            enterpriseUrl: input.oauth.enterpriseUrl,
            vision: true,
          }),
          body: JSON.stringify(
            useResponses
              ? {
                  model: input.model,
                  store: false,
                  input: [
                    {
                      role: 'user',
                      content: [
                        {
                          type: 'input_text',
                          text: input.prompt ?? buildExtractionPrompt(),
                        },
                        {
                          type: 'input_image',
                          image_url: `data:${input.mimeType};base64,${input.imageBase64}`,
                        },
                      ],
                    },
                  ],
                }
              : {
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
                },
          ),
        });

        if (!response.ok) {
          throw await providerHttpStatusToError(response);
        }

        const text = useResponses
          ? extractResponsesOutputText(await response.text())
          : extractChatCompletionText(await response.text());
        const parsed = parseProviderJsonEnvelope(text);

        return {
          structuredJson: parsed.structuredJson,
          barcodes: [],
          auxiliaryText: parsed.auxiliaryText,
          responseText: text,
          metadata: {
            provider: 'remote_github_copilot',
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

function copilotUrl(useResponses: boolean, enterpriseUrl?: string): URL {
  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    const origin = window.location.origin.replace(/\/$/, '');
    return new URL(`${origin}/api/proxy/github-copilot/${useResponses ? 'responses' : 'chat/completions'}`);
  }

  const base = copilotBase(enterpriseUrl);
  return new URL(`${base}/${useResponses ? 'responses' : 'chat/completions'}`);
}

async function copilotRequestHeaders({
  fetch,
  refreshToken,
  enterpriseUrl,
  vision,
}: {
  fetch: FetchLike;
  refreshToken: string;
  enterpriseUrl?: string;
  vision: boolean;
}): Promise<Record<string, string>> {
  const baseHeaders = {
    'Content-Type': 'application/json',
  };

  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    const domain = normalizeEnterpriseDomain(enterpriseUrl);
    return {
      ...baseHeaders,
      authorization: `Bearer ${refreshToken}`,
      ...(domain ? { 'x-copilot-enterprise-url': domain } : {}),
    };
  }

  const exchanged = await exchangeCopilotAccessToken({
    fetch,
    refreshToken,
    enterpriseUrl,
  });

  return {
    ...baseHeaders,
    ...copilotHeaders(exchanged.token, {
      vision,
      initiator: 'user',
    }),
  };
}

function extractChatCompletionText(raw: string): string {
  const payload = JSON.parse(raw) as {
    choices?: {
      message?: {
        content?: unknown;
      };
    }[];
  };

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }

  if (typeof content !== 'undefined') {
    return JSON.stringify(content);
  }

  throw new AppError('invalid_response', 'GitHub Copilot chat response did not contain message content.');
}

function extractResponsesOutputText(raw: string): string {
  const payload = JSON.parse(raw) as {
    output_text?: string;
    output?: {
      content?: {
        type?: string;
        text?: string;
      }[];
    }[];
  };

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  const fromOutput = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((part) => part.type === 'output_text' && typeof part.text === 'string')?.text;
  if (fromOutput) {
    return fromOutput;
  }

  throw new AppError('invalid_response', 'GitHub Copilot responses payload did not contain output_text.');
}

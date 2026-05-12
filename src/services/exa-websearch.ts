import { AppError, providerHttpStatusToError } from '@/types/app-error';
import { RuntimeLimits } from '@/constants/runtime';
import { sanitizeSearchQuery, sanitizeUntrustedWebText, validateSafeHttpsUrl } from '@/services/web-safety';
import { createAbortError, linkAbortSignal } from '@/utils/abort';

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp';

export type ExaSearchInput = {
  query: string;
  numResults?: number;
  livecrawl?: 'fallback' | 'preferred';
  type?: 'auto' | 'fast' | 'deep';
  contextMaxCharacters?: number;
  signal?: AbortSignal;
};

export function createExaWebSearch({ fetch }: { fetch: typeof global.fetch }) {
  return {
    async search(input: ExaSearchInput): Promise<string> {
      const query = sanitizeSearchQuery(input.query);
      const linked = linkAbortSignal(input.signal);
      const timeoutHandle = setTimeout(() => linked.controller.abort(), RuntimeLimits.exaSearchTimeoutMs);

      try {
        const response = await fetch(exaUrl(), {
          method: 'POST',
          signal: linked.signal,
          headers: {
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'web_search_exa',
              arguments: {
                query,
                type: input.type ?? 'auto',
                numResults: input.numResults ?? 8,
                livecrawl: input.livecrawl ?? 'fallback',
                ...(input.contextMaxCharacters ? { contextMaxCharacters: input.contextMaxCharacters } : {}),
              },
            },
          }),
        });

        if (!response.ok) {
          throw await providerHttpStatusToError(response);
        }

        return sanitizeUntrustedWebText(parseExaSse(await response.text()) ?? 'No search results found. Please try a different query.');
      } catch (error) {
        if (input.signal?.aborted) {
          throw createAbortError();
        }

        if (error instanceof AppError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new AppError('timeout', 'The Exa web search request timed out.', error);
        }

        throw new AppError('network_unavailable', error instanceof Error ? error.message : 'Exa web search failed.', error);
      } finally {
        clearTimeout(timeoutHandle);
        linked.cleanup();
      }
    },
  };
}

export function parseExaSse(body: string): string | undefined {
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) {
      continue;
    }

    try {
      const data = JSON.parse(line.substring(6)) as {
        result?: {
          content?: { type?: string; text?: string }[];
        };
      };
      const text = data.result?.content?.[0]?.text;
      if (text) {
        return text;
      }
    } catch {
    }
  }

  return undefined;
}

export function extractUrlsFromText(text: string): string[] {
  if (!text) {
    return [];
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  const matches = text.match(/https?:\/\/[^\s)\]}>"]+/g) ?? [];

  for (const match of matches) {
    const url = match.replace(/[.,;:!?]+$/, '');
    let normalized: string;
    try {
      normalized = validateSafeHttpsUrl(url, 'exa result');
    } catch {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    urls.push(normalized);
  }

  return urls;
}

function exaUrl(): string {
  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    return `${window.location.origin.replace(/\/$/, '')}/api/proxy/exa/mcp`;
  }

  return EXA_MCP_URL;
}

import { AppError, providerHttpStatusToError } from '@/types/app-error';

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp';

export type ExaSearchInput = {
  query: string;
  numResults?: number;
  livecrawl?: 'fallback' | 'preferred';
  type?: 'auto' | 'fast' | 'deep';
  contextMaxCharacters?: number;
};

export function createExaWebSearch({ fetch }: { fetch: typeof global.fetch }) {
  return {
    async search(input: ExaSearchInput): Promise<string> {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), 25_000);

      try {
        const response = await fetch(exaUrl(), {
          method: 'POST',
          signal: controller.signal,
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
                query: input.query,
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

        return parseExaSse(await response.text()) ?? 'No search results found. Please try a different query.';
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new AppError('timeout', 'The Exa web search request timed out.', error);
        }

        throw new AppError('network_unavailable', error instanceof Error ? error.message : 'Exa web search failed.', error);
      } finally {
        clearTimeout(timeoutHandle);
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
    if (seen.has(url)) {
      continue;
    }

    seen.add(url);
    urls.push(url);
  }

  return urls;
}

function exaUrl(): string {
  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    return `${window.location.origin.replace(/\/$/, '')}/api/proxy/exa/mcp`;
  }

  return EXA_MCP_URL;
}

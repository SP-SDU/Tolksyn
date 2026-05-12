import { AppError, providerHttpStatusToError } from '@/types/app-error';
import { sanitizeUntrustedWebText, validateSafeHttpsUrl } from '@/services/web-safety';
import { createAbortError, linkAbortSignal } from '@/utils/abort';

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

export type WebFetchResult = {
  url: string;
  contentType: string;
  text: string;
};

export function createWebFetch({ fetch, proxyBaseUrl }: { fetch: typeof global.fetch; proxyBaseUrl?: string }) {
  return {
    async fetch({ url, timeoutMs = 30_000, signal }: { url: string; timeoutMs?: number; signal?: AbortSignal }): Promise<WebFetchResult> {
      const safeUrl = validateSafeHttpsUrl(url, 'webfetch');

      const requestUrl = proxyBaseUrl ? `${proxyBaseUrl}?url=${encodeURIComponent(safeUrl)}` : safeUrl;

      const linked = linkAbortSignal(signal);
      const timeoutHandle = setTimeout(() => linked.controller.abort(), Math.min(timeoutMs, 120_000));

      try {
        const response = await fetch(requestUrl, {
          method: 'GET',
          signal: linked.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            Accept: 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        if (!response.ok) {
          throw await providerHttpStatusToError(response);
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength && Number(contentLength) > MAX_RESPONSE_SIZE) {
          throw new AppError('unsupported', 'Response too large (exceeds 5MB limit)');
        }

        const contentType = response.headers.get('content-type') ?? '';
        const text = await response.text();
        if (text.length > MAX_RESPONSE_SIZE) {
          throw new AppError('unsupported', 'Response too large (exceeds 5MB limit)');
        }

        return {
          url: safeUrl,
          contentType: contentType.split(';')[0]?.trim().toLowerCase() || '',
          text: sanitizeUntrustedWebText(contentType.includes('text/html') ? htmlToText(text) : text),
        };
      } catch (error) {
        if (signal?.aborted) {
          throw createAbortError();
        }

        if (error instanceof AppError) {
          throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new AppError('timeout', 'Request timed out', error);
        }

        throw error;
      } finally {
        clearTimeout(timeoutHandle);
        linked.cleanup();
      }
    },
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

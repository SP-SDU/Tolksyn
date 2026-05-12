import { sanitizeUntrustedWebText, validateSafeHttpsUrl } from '@/services/web-safety';

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

const WEBFETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  Accept: 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1',
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get('url') ?? '';
  let safeUrl: string;

  try {
    safeUrl = validateSafeHttpsUrl(url, 'webfetch proxy');
  } catch {
    return new Response('Missing or invalid url', { status: 400 });
  }

  const upstream = await fetch(safeUrl, {
    method: 'GET',
    headers: WEBFETCH_HEADERS,
  });

  const text = await readLimitedResponseText(upstream);
  if (text === undefined) {
    return new Response('Response too large', {
      status: 413,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const contentType = upstream.headers.get('Content-Type') ?? '';
  const plainText = contentType.toLowerCase().includes('text/html') ? htmlToText(text) : text;

  return new Response(sanitizeUntrustedWebText(plainText), {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readLimitedResponseText(response: Response): Promise<string | undefined> {
  const contentLength = response.headers.get('Content-Length');
  if (contentLength && Number(contentLength) > MAX_RESPONSE_SIZE) {
    return undefined;
  }

  if (!response.body) {
    const text = await response.text();
    return text.length > MAX_RESPONSE_SIZE ? undefined : text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      received += value.byteLength;
      if (received > MAX_RESPONSE_SIZE) {
        return undefined;
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    reader.releaseLock();
  }
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

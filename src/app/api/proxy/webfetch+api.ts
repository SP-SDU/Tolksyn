import { sanitizeUntrustedWebText, validateSafeHttpsUrl } from '@/services/web-safety';

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

  return new Response(sanitizeUntrustedWebText(await upstream.text()), {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

import { sanitizeSearchQuery } from '@/services/web-safety';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!isSafeExaRequest(body)) {
    return new Response('Missing or invalid query', { status: 400 });
  }

  const upstream = await fetch('https://mcp.exa.ai/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    body,
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-store',
    },
  });
}

function isSafeExaRequest(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { params?: { name?: unknown; arguments?: { query?: unknown } } };
    if (payload.params?.name !== 'web_search_exa') {
      return true;
    }

    if (typeof payload.params.arguments?.query !== 'string') {
      return false;
    }

    sanitizeSearchQuery(payload.params.arguments.query);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  const payload = (await request.json().catch(() => ({}))) as {
    model?: string;
    input?: unknown;
    store?: boolean;
    stream?: boolean;
    instructions?: string;
    previous_response_id?: string;
  };
  const auth = request.headers.get('authorization') ?? '';
  const account = request.headers.get('ChatGPT-Account-Id') ?? '';

  const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: auth,
      'ChatGPT-Account-Id': account,
      originator: 'tolksyn',
    },
    body: JSON.stringify({
      model: payload.model,
      store: payload.store ?? false,
      stream: payload.stream ?? true,
      instructions: payload.instructions,
      input: payload.input,
      previous_response_id: payload.previous_response_id,
    }),
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

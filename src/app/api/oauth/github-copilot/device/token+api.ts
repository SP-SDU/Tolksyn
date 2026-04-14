const GITHUB_CLIENT_ID = 'Ov23li8tweQw6odWQebz';

export async function POST(request: Request): Promise<Response> {
  const payload = (await request.json().catch(() => ({}))) as {
    device_code?: string;
    grant_type?: string;
  };

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: payload.device_code ?? '',
      grant_type: payload.grant_type ?? 'urn:ietf:params:oauth:grant-type:device_code',
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

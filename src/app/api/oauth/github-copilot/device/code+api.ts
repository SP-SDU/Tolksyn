const GITHUB_CLIENT_ID = 'Ov23li8tweQw6odWQebz';

export async function POST(request: Request): Promise<Response> {
  const domain = enterpriseDomain(request);
  const response = await fetch(`https://${domain}/login/device/code`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: 'read:user',
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

function enterpriseDomain(request: Request): string {
  const query = new URL(request.url).searchParams.get('enterpriseUrl') ?? '';
  const normalized = query.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return normalized || 'github.com';
}

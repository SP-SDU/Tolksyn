import { GET } from '@/app/api/proxy/webfetch+api';

describe('webfetch proxy api route', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('forwards http url fetches with browser-like headers', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<html><body><h1>Product page</h1><script>x()</script></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );

    const response = await GET(new Request('http://localhost:8081/api/proxy/webfetch?url=https%3A%2F%2Fexample.com%2Fproduct'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('Product page');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/product',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          Accept: expect.stringContaining('text/html'),
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': expect.stringContaining('Mozilla/5.0'),
        }),
      }),
    );
  });

  test('rejects oversized upstream responses', async () => {
    const body = 'x'.repeat(5 * 1024 * 1024 + 1);
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'Content-Length': String(5 * 1024 * 1024 + 1) },
      }),
    );

    const response = await GET(new Request('http://localhost:8081/api/proxy/webfetch?url=https%3A%2F%2Fexample.com%2Fhuge'));

    expect(response.status).toBe(413);
    expect(await response.text()).toBe('Response too large');
  });

  test('returns a gateway error when upstream fetch fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('redirect blocked'));

    const response = await GET(new Request('http://localhost:8081/api/proxy/webfetch?url=https%3A%2F%2Fexample.com%2Fredirect'));

    expect(response.status).toBe(502);
    expect(await response.text()).toBe('Upstream request failed');
  });

  test('rejects missing or unsafe urls', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(GET(new Request('http://localhost:8081/api/proxy/webfetch'))).resolves.toMatchObject({ status: 400 });
    await expect(GET(new Request('http://localhost:8081/api/proxy/webfetch?url=file%3A%2F%2F%2Fetc%2Fpasswd'))).resolves.toMatchObject({ status: 400 });
    await expect(GET(new Request('http://localhost:8081/api/proxy/webfetch?url=http%3A%2F%2Fexample.com%2Fproduct'))).resolves.toMatchObject({ status: 400 });
    await expect(GET(new Request('http://localhost:8081/api/proxy/webfetch?url=https%3A%2F%2F127.0.0.1%2Fproduct'))).resolves.toMatchObject({ status: 400 });

  });
});

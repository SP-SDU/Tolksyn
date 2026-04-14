import { POST } from '@/app/api/proxy/openai/codex/responses+api';

describe('openai codex proxy api route', () => {
  test('forwards codex request and preserves provider error payload text', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Model not available for your account',
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const response = await POST(
      new Request('http://localhost:8081/api/proxy/openai/codex/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer token',
          'ChatGPT-Account-Id': 'acct_123',
        },
        body: JSON.stringify({
          model: 'gpt-5.4',
          store: false,
          stream: true,
          instructions: 'Extract to JSON',
          input: [],
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('Model not available for your account');
    expect(mock).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/codex/responses',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"instructions":"Extract to JSON"'),
      }),
    );
    const [, options] = mock.mock.calls[0] as [string, { body?: string }];
    expect(options.body).toContain('"stream":true');

    mock.mockRestore();
  });
});

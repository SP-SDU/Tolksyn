import { POST as codePost } from '@/app/api/oauth/github-copilot/device/code+api';
import { POST as tokenPost } from '@/app/api/oauth/github-copilot/device/token+api';

describe('github copilot oauth api routes', () => {
  test('forwards device code request to github endpoint', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          device_code: 'dev',
          user_code: 'CODE',
          verification_uri: 'https://github.com/login/device',
          interval: 5,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const response = await codePost(new Request('http://localhost:8081/api/oauth/github-copilot/device/code', { method: 'POST' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user_code).toBe('CODE');
    expect(mock).toHaveBeenCalledWith(
      'https://github.com/login/device/code',
      expect.objectContaining({ method: 'POST' }),
    );

    mock.mockRestore();
  });

  test('forwards token payload request to github endpoint', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'token',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const response = await tokenPost(
      new Request('http://localhost:8081/api/oauth/github-copilot/device/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_code: 'device-123',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mock).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        body: expect.stringContaining('device-123'),
      }),
    );

    mock.mockRestore();
  });

  test('supports enterprise domain forwarding via query param', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          device_code: 'dev',
          user_code: 'CODE',
          verification_uri: 'https://company.ghe.com/login/device',
          interval: 5,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    await codePost(
      new Request('http://localhost:8081/api/oauth/github-copilot/device/code?enterpriseUrl=company.ghe.com', {
        method: 'POST',
      }),
    );

    expect(mock).toHaveBeenCalledWith(
      'https://company.ghe.com/login/device/code',
      expect.objectContaining({ method: 'POST' }),
    );

    mock.mockRestore();
  });
});

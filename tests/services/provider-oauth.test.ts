import { createProviderOAuth } from '@/services/provider-oauth';

describe('provider oauth', () => {
  test('completes openai device flow and returns oauth credentials', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          device_auth_id: 'device-id',
          user_code: 'OPENAI-CODE',
          interval: '1',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorization_code: 'auth-code',
          code_verifier: 'code-verifier',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          refresh_token: 'refresh-token',
          access_token: 'access-token',
          expires_in: 3600,
        }),
      });
    const sleep = jest.fn().mockResolvedValue(undefined);
    const oauth = createProviderOAuth({ fetch: fetch as any, now: () => 1_000, sleep });

    const flow = await oauth.start('openai');
    expect(flow.url).toBe('https://auth.openai.com/codex/device');
    expect(flow.code).toBe('OPENAI-CODE');
    expect(flow.instructions).toContain('OPENAI-CODE');

    const auth = await flow.complete();
    expect(auth).toEqual({
      type: 'oauth',
      refresh: 'refresh-token',
      access: 'access-token',
      expires: 3_601_000,
    });
    expect(sleep).toHaveBeenCalled();
  });

  test('completes github-copilot device flow and returns oauth credentials', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verification_uri: 'https://github.com/login/device',
          user_code: 'GITHUB-CODE',
          device_code: 'github-device-code',
          interval: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: 'authorization_pending',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'copilot-token',
        }),
      });
    const sleep = jest.fn().mockResolvedValue(undefined);
    const oauth = createProviderOAuth({ fetch: fetch as any, now: () => 2_000, sleep });

    const flow = await oauth.start('github-copilot');
    expect(flow.url).toBe('https://github.com/login/device');
    expect(flow.code).toBe('GITHUB-CODE');
    expect(flow.instructions).toContain('GITHUB-CODE');

    const auth = await flow.complete();
    expect(auth).toEqual({
      type: 'oauth',
      refresh: 'copilot-token',
      access: 'copilot-token',
      expires: 0,
    });
    expect(sleep).toHaveBeenCalled();
  });

  test('uses local web oauth proxy endpoints for github-copilot on web', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verification_uri: 'https://github.com/login/device',
          user_code: 'GITHUB-CODE',
          device_code: 'github-device-code',
          interval: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'copilot-token',
        }),
      });

    const originalWindow = (globalThis as { window?: unknown }).window;
    const originalPlatform = process.env.EXPO_OS;
    (globalThis as { window?: unknown }).window = {
      location: {
        origin: 'http://localhost:8081',
      },
    };
    process.env.EXPO_OS = 'web';

    try {
      const oauth = createProviderOAuth({ fetch: fetch as any, now: () => 2_000, sleep: jest.fn().mockResolvedValue(undefined) });
      const flow = await oauth.start('github-copilot');
      const auth = await flow.complete();

      expect(auth).toEqual({
        type: 'oauth',
        refresh: 'copilot-token',
        access: 'copilot-token',
        expires: 0,
      });
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'http://localhost:8081/api/oauth/github-copilot/device/code',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8081/api/oauth/github-copilot/device/token',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      process.env.EXPO_OS = originalPlatform;
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  test('supports enterprise domain in github-copilot oauth flow', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          verification_uri: 'https://company.ghe.com/login/device',
          user_code: 'GHE-CODE',
          device_code: 'ghe-device-code',
          interval: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'enterprise-copilot-token',
        }),
      });

    const oauth = createProviderOAuth({ fetch: fetch as any, now: () => 2_000, sleep: jest.fn().mockResolvedValue(undefined) });
    const flow = await oauth.start('github-copilot', { enterpriseUrl: 'https://company.ghe.com/' });
    const auth = await flow.complete();

    expect(auth).toEqual({
      type: 'oauth',
      refresh: 'enterprise-copilot-token',
      access: 'enterprise-copilot-token',
      expires: 0,
      enterpriseUrl: 'company.ghe.com',
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://company.ghe.com/login/device/code',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://company.ghe.com/login/oauth/access_token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('returns actionable error when web oauth proxy route is unavailable', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
      text: async () => 'Not found',
    });

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      location: {
        origin: 'http://localhost:8081',
      },
    };

    try {
      const oauth = createProviderOAuth({ fetch: fetch as any, now: () => 2_000, sleep: jest.fn().mockResolvedValue(undefined) });
      await expect(oauth.start('github-copilot')).rejects.toMatchObject({
        code: 'auth_failed',
        message: expect.stringContaining('/api/oauth routes'),
      });
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});

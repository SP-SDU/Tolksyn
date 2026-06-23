import { GitHubCopilotOAuthError } from "github-copilot-oauth";

import { createProviderOAuth } from "@/services/providers/provider-oauth";

describe("provider oauth", () => {
  test("completes openai device flow and returns oauth credentials", async () => {
    // 4 fetch calls: device code, poll (pending), auth code exchange, token exchange
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          device_auth_id: "device-id",
          user_code: "OPENAI-CODE",
          interval: "1",
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorization_code: "auth-code",
          code_verifier: "code-verifier",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          refresh_token: "refresh-token",
          access_token: "access-token",
          id_token: jwtWithAccount("account-123"),
          expires_in: 3600,
        }),
      });
    const sleep = jest.fn().mockResolvedValue(undefined);
    const oauth = createProviderOAuth({
      fetch: fetch as any,
      now: () => 1_000,
      sleep,
    });

    const flow = await oauth.start("openai");

    // start() returns the verification URL, user code, and instructions
    expect(flow.url).toBe("https://auth.openai.com/codex/device");
    expect(flow.code).toBe("OPENAI-CODE");
    expect(flow.instructions).toContain("OPENAI-CODE");

    const auth = await flow.complete();

    // complete() returns credentials with expiry computed from now plus expires_in
    expect(auth).toEqual({
      type: "oauth",
      refresh: "refresh-token",
      access: "access-token",
      expires: 3_601_000,
      accountId: "account-123",
    });
    expect(sleep).toHaveBeenCalled();
  });

  test("openai oauth uses empty refresh token when response omits refresh token", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          device_auth_id: "device-id",
          user_code: "OPENAI-CODE",
          interval: "1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorization_code: "auth-code",
          code_verifier: "code-verifier",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "access-token",
        }),
      });
    const oauth = createProviderOAuth({
      fetch: fetch as any,
      now: () => 1_000,
      sleep: jest.fn().mockResolvedValue(undefined),
    });

    const flow = await oauth.start("openai");

    await expect(flow.complete()).resolves.toEqual({
      type: "oauth",
      refresh: "",
      access: "access-token",
      expires: 3_601_000,
      accountId: undefined,
    });
  });

  test("completes github-copilot device flow and returns oauth credentials", async () => {
    // 3 fetches: device code, poll (pending), token (completed)
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(githubDeviceCodeResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: "authorization_pending",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "copilot-token",
        }),
      });
    const sleep = jest.fn().mockResolvedValue(undefined);
    const oauth = createProviderOAuth({
      fetch: fetch as any,
      now: () => 2_000,
      sleep,
    });

    const flow = await oauth.start("github-copilot");

    expect(flow.url).toBe("https://github.com/login/device");
    expect(flow.code).toBe("GITHUB-CODE");
    expect(flow.instructions).toContain("GITHUB-CODE");

    const auth = await flow.complete();

    // GitHub Copilot OAuth returns the same value for refresh and access
    expect(auth).toEqual({
      type: "oauth",
      refresh: "copilot-token",
      access: "copilot-token",
      expires: 0,
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://github.com/login/device/code",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(sleep).toHaveBeenCalled();
  });

  test("uses direct github oauth endpoints when window is unavailable", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(githubDeviceCodeResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "copilot-token",
        }),
      });
    const originalWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;

    try {
      const oauth = createProviderOAuth({
        fetch: fetch as any,
        now: () => 2_000,
        sleep: jest.fn().mockResolvedValue(undefined),
      });
      const flow = await oauth.start("github-copilot");
      await flow.complete();

      expect(fetch).toHaveBeenNthCalledWith(
        1,
        "https://github.com/login/device/code",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "https://github.com/login/oauth/access_token",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  test("uses local web oauth proxy endpoints for github-copilot on web", async () => {
    // Simulate web platform with a known window origin
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(githubDeviceCodeResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "copilot-token",
        }),
      });

    const originalWindow = (globalThis as { window?: unknown }).window;
    const originalPlatform = process.env.EXPO_OS;
    (globalThis as { window?: unknown }).window = {
      location: {
        origin: "http://localhost:8081/",
      },
    };
    process.env.EXPO_OS = "web";

    try {
      const oauth = createProviderOAuth({
        fetch: fetch as any,
        now: () => 2_000,
        sleep: jest.fn().mockResolvedValue(undefined),
      });
      const flow = await oauth.start("github-copilot");
      const auth = await flow.complete();

      // On web, requests go to local proxy routes, not GitHub directly
      expect(auth).toEqual({
        type: "oauth",
        refresh: "copilot-token",
        access: "copilot-token",
        expires: 0,
      });
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        "http://localhost:8081/api/oauth/github-copilot/device/code",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "http://localhost:8081/api/oauth/github-copilot/device/token",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      restoreEnv("EXPO_OS", originalPlatform);
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  test("rejects custom enterprise domain in github-copilot oauth flow", async () => {
    const fetch = jest.fn();

    const oauth = createProviderOAuth({
      fetch: fetch as any,
      now: () => 2_000,
      sleep: jest.fn().mockResolvedValue(undefined),
    });

    // Enterprise domains blocked at the proxy level. Fetch never called
    await expect(
      oauth.start("github-copilot", {
        enterpriseUrl: "https://company.ghe.com/",
      }),
    ).rejects.toMatchObject({
      code: "unsupported",
      message: "Custom GitHub Enterprise hosts are not enabled.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("rejects unsupported oauth providers", async () => {
    const oauth = createProviderOAuth({
      fetch: jest.fn() as any,
      now: () => 2_000,
      sleep: jest.fn().mockResolvedValue(undefined),
    });

    await expect(oauth.start("anthropic")).rejects.toMatchObject({
      code: "unsupported",
      message: 'OAuth is not supported for provider "anthropic".',
    });
  });

  test("normalizes thrown errors to auth failed app errors", async () => {
    const oauth = createProviderOAuth({
      fetch: jest.fn().mockRejectedValue(new Error("network down")) as any,
      now: () => 2_000,
      sleep: jest.fn().mockResolvedValue(undefined),
    });

    await expect(oauth.start("github-copilot")).rejects.toMatchObject({
      code: "auth_failed",
      message: "network down",
    });
  });

  test("does not trust unsupported code on plain thrown errors", async () => {
    const error = Object.assign(new Error("plain unsupported"), {
      code: "unsupported",
    });
    const oauth = createProviderOAuth({
      fetch: jest.fn().mockRejectedValue(error) as any,
      now: () => 2_000,
      sleep: jest.fn().mockResolvedValue(undefined),
    });

    await expect(oauth.start("github-copilot")).rejects.toMatchObject({
      code: "auth_failed",
      message: "plain unsupported",
    });
  });

  test("maps oauth package failures to auth failed unless explicitly unsupported", async () => {
    const oauth = createProviderOAuth({
      fetch: jest
        .fn()
        .mockRejectedValue(
          new GitHubCopilotOAuthError("authorization_failed", "poll failed"),
        ) as any,
      now: () => 2_000,
      sleep: jest.fn().mockResolvedValue(undefined),
    });

    await expect(oauth.start("github-copilot")).rejects.toMatchObject({
      code: "auth_failed",
      message: "poll failed",
    });
  });

  test("normalizes unknown thrown values to generic oauth failure", async () => {
    const oauth = createProviderOAuth({
      fetch: jest.fn().mockRejectedValue(null) as any,
      now: () => 2_000,
      sleep: jest.fn().mockResolvedValue(undefined),
    });

    await expect(oauth.start("github-copilot")).rejects.toMatchObject({
      code: "auth_failed",
      message: "OAuth authorization failed.",
    });
  });

  test("returns actionable error when web oauth proxy route is unavailable", async () => {
    // 404 from the proxy endpoint
    const fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "Not found" }),
      text: async () => "Not found",
    });

    const originalWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      location: {
        origin: "http://localhost:8081",
      },
    };

    try {
      const oauth = createProviderOAuth({
        fetch: fetch as any,
        now: () => 2_000,
        sleep: jest.fn().mockResolvedValue(undefined),
      });
      await expect(oauth.start("github-copilot")).rejects.toMatchObject({
        code: "auth_failed",
        message: expect.stringContaining("/api/oauth routes"),
      });
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function githubDeviceCodeResponse() {
  return {
    ok: true,
    json: async () => ({
      verification_uri: "https://github.com/login/device",
      user_code: "GITHUB-CODE",
      device_code: "github-device-code",
      interval: 1,
    }),
  };
}

function jwtWithAccount(accountId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      "https://api.openai.com/auth": {
        chatgpt_account_id: accountId,
      },
    }),
  ).toString("base64url");

  return `header.${payload}.signature`;
}

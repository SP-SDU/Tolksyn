import {
  GitHubCopilotOAuthError,
  normalizeEnterpriseDomain,
  startGitHubCopilotDeviceFlow,
} from "github-copilot-oauth";
import { OpenAIOAuthError, startOpenAIDeviceFlow } from "openai-codex-oauth";

import { AppError } from "@/types/app-error";
import type { ProviderAuth } from "@/types/settings";

type FetchLike = typeof fetch;

export type OAuthFlow = {
  providerId: string;
  url: string;
  code: string;
  instructions: string;
  complete: () => Promise<ProviderAuth>;
};

export type OAuthStartOptions = {
  enterpriseUrl?: string;
};

export function createProviderOAuth({
  fetch,
  now,
  sleep,
}: {
  fetch: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}) {
  return {
    async start(
      providerId: string,
      options?: OAuthStartOptions,
    ): Promise<OAuthFlow> {
      try {
        if (providerId === "openai") {
          const flow = await startOpenAIDeviceFlow({ fetch, now, sleep });
          return {
            providerId: flow.providerId,
            url: flow.url,
            code: flow.code,
            instructions: flow.instructions,
            async complete() {
              const tokens = await flow.complete();
              return {
                type: "oauth",
                refresh: tokens.refreshToken ?? "",
                access: tokens.accessToken,
                expires: tokens.expiresAt ?? 0,
                accountId: tokens.accountId,
              };
            },
          };
        }

        if (providerId === "github-copilot") {
          const enterpriseUrl = normalizeEnterpriseDomain(
            options?.enterpriseUrl,
          );
          const flow = await startGitHubCopilotDeviceFlow({
            fetch: githubOAuthFetch(fetch, enterpriseUrl),
            sleep,
            enterpriseUrl,
          });
          return {
            providerId: flow.providerId,
            url: flow.url,
            code: flow.code,
            instructions: flow.instructions,
            async complete() {
              const tokens = await flow.complete();
              return {
                type: "oauth",
                refresh: tokens.githubToken,
                access: tokens.githubToken,
                expires: 0,
                enterpriseUrl: tokens.enterpriseUrl,
              };
            },
          };
        }

        throw new AppError(
          "unsupported",
          `OAuth is not supported for provider "${providerId}".`,
        );
      } catch (error) {
        throw normalizeOAuthError(error);
      }
    },
  };
}

function githubOAuthFetch(fetch: FetchLike, enterpriseUrl?: string): FetchLike {
  return async (input, init) => {
    const proxied = githubProxyUrl(input, enterpriseUrl);
    const response = await fetch(proxied ?? input, init);
    if (proxied && response.status === 404) {
      throw oauthProxyUnavailableError();
    }

    return response;
  };
}

function githubProxyUrl(
  input: Parameters<FetchLike>[0],
  enterpriseUrl?: string,
): string | undefined {
  if (
    typeof window === "undefined" ||
    typeof window.location?.origin !== "string"
  ) {
    return undefined;
  }

  const value = input instanceof Request ? input.url : String(input);
  const origin = window.location.origin.replace(/\/$/, "");
  const suffix = enterpriseUrl
    ? `?enterpriseUrl=${encodeURIComponent(enterpriseUrl)}`
    : "";
  if (value.endsWith("/login/device/code")) {
    return `${origin}/api/oauth/github-copilot/device/code${suffix}`;
  }

  if (value.endsWith("/login/oauth/access_token")) {
    return `${origin}/api/oauth/github-copilot/device/token${suffix}`;
  }

  return undefined;
}

function normalizeOAuthError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (
    error instanceof GitHubCopilotOAuthError ||
    error instanceof OpenAIOAuthError
  ) {
    return new AppError(
      error.code === "unsupported" ? "unsupported" : "auth_failed",
      error.message,
      error,
    );
  }

  if (error instanceof Error) {
    return new AppError("auth_failed", error.message, error);
  }

  return new AppError("auth_failed", "OAuth authorization failed.", error);
}

function oauthProxyUnavailableError() {
  return new AppError(
    "auth_failed",
    "GitHub Copilot OAuth on web requires local API OAuth proxy routes. Start the app with `npm run start` and open web to enable /api/oauth routes.",
  );
}

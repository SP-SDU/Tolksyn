import { createSettingsRepository } from "@/repositories/settings-repository";

import { createSecretStore } from "@/tests/helpers/fakes";

describe("settings repository web fallback", () => {
  test("loads persisted settings from secret store when sqlite value is malformed", async () => {
    // Simulate a database with truncated JSON so SQLite read fails
    // Valid settings stored in secret store as web fallback
    const valid = JSON.stringify({
      provider: {
        id: "github-copilot",
        endpointUrl: "https://api.githubcopilot.com/chat/completions",
        model: "gpt-4.1",
        timeoutMs: 6000,
        showExperimentalProviders: true,
        authModeByProvider: {
          "github-copilot": "oauth",
        },
      },
      ingest: {
        endpointUrl: "https://example.com/ingest",
      },
      barcode: {
        enabled: true,
        allowedTypes: ["ean13"],
      },
      webSearch: {
        enabled: true,
      },
    });

    const secrets = createSecretStore({
      "tolksyn.settings.web": valid,
      "tolksyn.secret.provider_auth": JSON.stringify({
        "github-copilot": {
          type: "oauth",
          refresh: "r",
          access: "a",
          expires: 0,
        },
      }),
      "tolksyn.secret.ingest_api_key": "ingest",
    });

    const db = {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  limit() {
                    return Promise.resolve([
                      {
                        value:
                          '{"provider":{"id":"openai","endpointUrl":"https://api.openai.com/v1/chat/completions"',
                      },
                    ]);
                  },
                };
              },
            };
          },
        };
      },
      insert() {
        return {
          values() {
            return {
              onConflictDoUpdate() {
                return Promise.resolve();
              },
            };
          },
        };
      },
    };

    const repo = createSettingsRepository({ db: db as any, secrets });
    const settings = await repo.getSettings();

    // Fallback settings used. Web search enabled. OAuth auth loaded from secret store
    expect(settings.provider.id).toBe("github-copilot");
    expect(settings.provider.showExperimentalProviders).toBe(true);
    expect(settings.webSearch.enabled).toBe(true);
    expect(settings.provider.auth["github-copilot"]).toEqual({
      type: "oauth",
      refresh: "r",
      access: "a",
      expires: 0,
    });
  });
});

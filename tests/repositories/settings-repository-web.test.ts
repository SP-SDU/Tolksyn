import { createSettingsRepository } from "@/repositories/settings-repository";

describe("settings repository web fallback", () => {
  test("loads persisted settings from secret store when sqlite value is malformed", async () => {
    // Arrange
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

    // Act
    const repo = createSettingsRepository({ db: db as any, secrets });
    const settings = await repo.getSettings();

    // Assert
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

function createSecretStore(seed?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(seed ?? {}));

  return {
    async getItem(key: string): Promise<string | null> {
      return map.get(key) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      map.set(key, value);
    },
    async deleteItem(key: string): Promise<void> {
      map.delete(key);
    },
  };
}

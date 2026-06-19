import { isProviderConfigured } from "@/services/provider-configuration";
import { defaultSettings } from "@/types/settings";

describe("provider configuration", () => {
  test("requires auth for default provider", () => {
    expect(isProviderConfigured(defaultSettings())).toBe(false);
  });

  test("accepts configured api provider", () => {
    const settings = defaultSettings();
    settings.provider.authModeByProvider.openai = "api";
    settings.provider.auth.openai = { type: "api", key: " openai-key " };

    expect(isProviderConfigured(settings)).toBe(true);
  });

  test("rejects expired oauth provider", () => {
    const settings = defaultSettings();
    settings.provider.auth.openai = {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() - 1,
    };

    expect(isProviderConfigured(settings)).toBe(false);
  });
});

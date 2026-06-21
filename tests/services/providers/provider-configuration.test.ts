import { isProviderConfigured } from "@/services/providers/provider-configuration";
import { defaultSettings } from "@/types/settings";

describe("provider configuration", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("requires auth for default provider", () => {
    expect(isProviderConfigured(defaultSettings())).toBe(false);
  });

  test("accepts configured api provider", () => {
    const settings = defaultSettings();
    settings.provider.authModeByProvider.openai = "api";
    settings.provider.auth.openai = { type: "api", key: " openai-key " };

    expect(isProviderConfigured(settings)).toBe(true);
  });

  test("rejects blank api provider keys", () => {
    const settings = defaultSettings();
    settings.provider.authModeByProvider.openai = "api";
    settings.provider.auth.openai = { type: "api", key: " " };

    expect(isProviderConfigured(settings)).toBe(false);
  });

  test("rejects auth stored for a different provider", () => {
    const settings = defaultSettings();
    settings.provider.id = "google";
    settings.provider.authModeByProvider.google = "api";
    settings.provider.auth.openai = { type: "api", key: "openai-key" };

    expect(isProviderConfigured(settings)).toBe(false);
  });

  test("defaults missing auth mode to api", () => {
    const settings = defaultSettings();
    settings.provider.id = "google";
    settings.provider.auth.google = { type: "api", key: "google-key" };

    expect(isProviderConfigured(settings)).toBe(true);
  });

  test("rejects api auth when selected mode is oauth", () => {
    const settings = defaultSettings();
    settings.provider.auth.openai = { type: "api", key: "openai-key" };

    expect(isProviderConfigured(settings)).toBe(false);
  });

  test("accepts oauth provider with non-expiring token", () => {
    const settings = defaultSettings();
    settings.provider.auth.openai = {
      type: "oauth",
      access: " access-token ",
      refresh: "refresh-token",
      expires: 0,
    };

    expect(isProviderConfigured(settings)).toBe(true);
  });

  test("accepts oauth provider with future expiry", () => {
    const settings = defaultSettings();
    settings.provider.auth.openai = {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60_000,
    };

    expect(isProviderConfigured(settings)).toBe(true);
  });

  test("rejects oauth provider with blank access token", () => {
    const settings = defaultSettings();
    settings.provider.auth.openai = {
      type: "oauth",
      access: " ",
      refresh: "refresh-token",
      expires: 0,
    };

    expect(isProviderConfigured(settings)).toBe(false);
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

  test("rejects oauth provider expiring exactly now", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000);
    const settings = defaultSettings();
    settings.provider.auth.openai = {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: 1_000,
    };

    expect(isProviderConfigured(settings)).toBe(false);
  });
});

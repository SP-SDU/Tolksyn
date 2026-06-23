import { defaultSettings } from "@/types/settings";

describe("settings types", () => {
  test("defaultSettings returns startup defaults without secrets", () => {
    const settings = defaultSettings();

    expect(settings.provider).toMatchObject({
      id: "openai",
      model: "gpt-5.3-codex",
      modelVariant: null,
      timeoutMs: 6000,
      showExperimentalProviders: false,
      authModeByProvider: { openai: "oauth" },
      auth: {},
    });
    expect(settings.ingest).toEqual({
      endpointUrl: "http://10.0.2.2:8787/ingest",
      apiKey: "",
    });
    expect(settings.barcode).toMatchObject({ enabled: true });
    expect(settings.barcode.allowedTypes).toEqual([
      "ean13",
      "ean8",
      "upc_a",
      "upc_e",
      "code128",
      "code39",
      "qr",
      "pdf417",
    ]);
    expect(settings.webSearch.enabled).toBe(false);
    expect(settings.reminders.providerConfiguration.enabled).toBe(true);
  });
});

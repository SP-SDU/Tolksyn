describe("secure secret store", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("loads persisted web settings key from localStorage", async () => {
    setupWebSecureStore({
      ["tolksyn.settings.web"]: '{"provider":{"id":"openai"}}',
    });

    const { secureSecretStore } = require("@/db/secure-store");
    const persisted = await secureSecretStore.getItem("tolksyn.settings.web");

    // Web settings read from localStorage when native secure store is unavailable
    expect(persisted).toBe('{"provider":{"id":"openai"}}');
  });

  test("clears tolksyn web keys from localStorage and memory cache", async () => {
    const localStorage = setupWebSecureStore({
      ["tolksyn.settings.web"]: '{"provider":{"id":"openai"}}',
      ["tolksyn.secret.provider_auth"]: '{"openai":{"type":"api","key":"x"}}',
      ["other.key"]: "keep-me",
    });

    const { secureSecretStore, clearWebKeys } = require("@/db/secure-store");

    // Keys exist before clearing
    expect(await secureSecretStore.getItem("tolksyn.settings.web")).toBe(
      '{"provider":{"id":"openai"}}',
    );

    await clearWebKeys("tolksyn.");

    // tolksyn-prefixed keys removed. Unrelated keys preserved
    expect(await secureSecretStore.getItem("tolksyn.settings.web")).toBeNull();
    expect(
      await secureSecretStore.getItem("tolksyn.secret.provider_auth"),
    ).toBeNull();
    expect(localStorage.getItem("other.key")).toBe("keep-me");
  });
});

function setupWebSecureStore(seed: Record<string, string>) {
  const values = new Map<string, string>(Object.entries(seed));
  const localStorage = {
    get length() {
      return values.size;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };

  Object.defineProperty(globalThis, "window", {
    value: { localStorage },
    configurable: true,
  });

  jest.doMock("react-native", () => ({
    Platform: { OS: "web" },
  }));
  jest.doMock("expo-secure-store", () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  }));

  return localStorage;
}

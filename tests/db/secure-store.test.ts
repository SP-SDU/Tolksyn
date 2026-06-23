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

  test("sets and deletes web secrets in localStorage", async () => {
    const localStorage = setupWebSecureStore({});
    const { secureSecretStore } = require("@/db/secure-store");

    await secureSecretStore.setItem("tolksyn.secret.key", "secret");
    expect(localStorage.getItem("tolksyn.secret.key")).toBe("secret");
    expect(await secureSecretStore.getItem("tolksyn.secret.key")).toBe("secret");

    await secureSecretStore.deleteItem("tolksyn.secret.key");
    expect(localStorage.getItem("tolksyn.secret.key")).toBeNull();
    expect(await secureSecretStore.getItem("tolksyn.secret.key")).toBeNull();
  });

  test("web store works without window using memory cache only", async () => {
    setupWebSecureStore({});
    delete (globalThis as { window?: unknown }).window;
    const { secureSecretStore, clearWebKeys } = require("@/db/secure-store");

    await secureSecretStore.setItem("tolksyn.secret.key", "secret");
    expect(await secureSecretStore.getItem("tolksyn.secret.key")).toBe("secret");
    await secureSecretStore.deleteItem("tolksyn.secret.key");
    expect(await secureSecretStore.getItem("tolksyn.secret.key")).toBeNull();
    await expect(clearWebKeys()).resolves.toBeUndefined();
  });

  test("native store delegates to expo secure store", async () => {
    const secureStore = setupNativeSecureStore();
    const { secureSecretStore, clearWebKeys } = require("@/db/secure-store");

    secureStore.getItemAsync.mockResolvedValue("secret");

    await expect(secureSecretStore.getItem("key")).resolves.toBe("secret");
    await secureSecretStore.setItem("key", "value");
    await secureSecretStore.deleteItem("key");
    await expect(clearWebKeys()).resolves.toBeUndefined();

    expect(secureStore.getItemAsync).toHaveBeenCalledWith("key");
    expect(secureStore.setItemAsync).toHaveBeenCalledWith("key", "value");
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("key");
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

function setupNativeSecureStore() {
  delete (globalThis as { window?: unknown }).window;
  const secureStore = {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  };

  jest.doMock("react-native", () => ({
    Platform: { OS: "ios" },
  }));
  jest.doMock("expo-secure-store", () => secureStore);

  return secureStore;
}

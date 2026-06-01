describe("secure secret store", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("loads persisted web settings key from localStorage", async () => {
    // Arrange
    const values = new Map<string, string>([
      ["tolksyn.settings.web", '{"provider":{"id":"openai"}}'],
    ]);

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

    // Act
    const { secureSecretStore } = require("@/db/secure-store");
    const persisted = await secureSecretStore.getItem("tolksyn.settings.web");

    // Assert
    // Web settings read from localStorage when native secure store is unavailable
    expect(persisted).toBe('{"provider":{"id":"openai"}}');
  });

  test("clears tolksyn web keys from localStorage and memory cache", async () => {
    // Arrange
    const values = new Map<string, string>([
      ["tolksyn.settings.web", '{"provider":{"id":"openai"}}'],
      ["tolksyn.secret.provider_auth", '{"openai":{"type":"api","key":"x"}}'],
      ["other.key", "keep-me"],
    ]);

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

    // Act
    const { secureSecretStore, clearWebKeys } = require("@/db/secure-store");

    // Assert: keys exist before clearing
    expect(await secureSecretStore.getItem("tolksyn.settings.web")).toBe(
      '{"provider":{"id":"openai"}}',
    );

    // Act
    await clearWebKeys("tolksyn.");

    // Assert
    // tolksyn-prefixed keys removed. Unrelated keys preserved
    expect(await secureSecretStore.getItem("tolksyn.settings.web")).toBeNull();
    expect(
      await secureSecretStore.getItem("tolksyn.secret.provider_auth"),
    ).toBeNull();
    expect(localStorage.getItem("other.key")).toBe("keep-me");
  });
});

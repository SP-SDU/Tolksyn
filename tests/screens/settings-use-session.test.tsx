import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useSession } from "@/screens/settings/use-session";
import { mockDeferredMount } from "@/tests/helpers/deferred-mount-mock";
import { defaultSettings } from "@/types/settings";

const mockRuntime = {
  settings: {
    getSettings: jest.fn(),
    saveSettings: jest.fn(),
  },
  providerCatalog: {
    fallbackSnapshot: jest.fn(),
    all: jest.fn(),
    snapshot: jest.fn(),
    authMethods: jest.fn(),
    authMode: jest.fn(),
    isSupportedProvider: jest.fn(),
    defaultsFor: jest.fn(),
    modelOptions: jest.fn(),
    thinkingLevels: jest.fn(),
  },
  oauth: {
    start: jest.fn(),
  },
  clearLocalData: jest.fn(),
};

const mockToast = {
  show: jest.fn(),
};

jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = jest.requireActual("react");
    React.useEffect(() => {
      const cleanup = cb();
      return cleanup;
    }, [cb]);
  },
}));

jest.mock("@/providers/app-provider", () => ({
  useAppRuntime: () => mockRuntime,
}));

jest.mock("@/providers/toast-provider", () => ({
  useToast: () => mockToast,
}));

jest.mock("@/utils/idle", () => {
  const { mockDeferredMount } = jest.requireActual(
    "@/tests/helpers/deferred-mount-mock",
  );

  return { scheduleDeferredMount: mockDeferredMount.scheduleDeferredMount };
});

describe("settings session", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeferredMount.mounts.length = 0;
    const settings = defaultSettings();
    mockRuntime.settings.getSettings.mockResolvedValue(settings);
    mockRuntime.providerCatalog.all.mockReturnValue(new Promise(() => {}));
    mockRuntime.providerCatalog.snapshot.mockResolvedValue([
      {
        id: "cached-openai",
        name: "Cached OpenAI",
        models: [],
      },
    ]);
    mockRuntime.providerCatalog.fallbackSnapshot.mockReturnValue([
      {
        id: "openai",
        name: "OpenAI",
        models: [
          {
            id: settings.provider.model,
            name: "GPT-5.3 Codex",
            variants: ["low", "medium", "high"],
            supportsImage: true,
            releaseDate: "2026-02-01",
          },
        ],
      },
    ]);
    mockRuntime.providerCatalog.authMethods.mockReturnValue(["oauth"]);
    mockRuntime.providerCatalog.authMode.mockReturnValue("oauth");
    mockRuntime.providerCatalog.isSupportedProvider.mockReturnValue(true);
    mockRuntime.providerCatalog.defaultsFor.mockResolvedValue({
      model: settings.provider.model,
    });
    mockRuntime.providerCatalog.modelOptions.mockResolvedValue([
      {
        id: settings.provider.model,
        name: "GPT-5.3 Codex",
        variants: ["low", "medium", "high"],
        supportsImage: true,
        releaseDate: "2026-02-01",
      },
    ]);
    mockRuntime.providerCatalog.thinkingLevels.mockResolvedValue([
      "low",
      "medium",
      "high",
    ]);
  });

  test("starts remote provider catalog refresh after deferred mount", async () => {
    await renderLoadedSession();

    expect(mockRuntime.providerCatalog.all).not.toHaveBeenCalled();
    await act(async () => {
      for (const mount of [...mockDeferredMount.mounts]) {
        mount.callback();
      }
      await Promise.resolve();
    });

    expect(mockRuntime.providerCatalog.all).toHaveBeenCalled();
  });

  test("does not touch async provider catalog APIs before first settings paint", async () => {
    await renderLoadedSession();

    expect(mockRuntime.providerCatalog.fallbackSnapshot).toHaveBeenCalled();
    expect(mockRuntime.providerCatalog.snapshot).not.toHaveBeenCalled();
    expect(mockRuntime.providerCatalog.all).not.toHaveBeenCalled();
    expect(mockRuntime.providerCatalog.modelOptions).not.toHaveBeenCalled();
    expect(mockRuntime.providerCatalog.thinkingLevels).not.toHaveBeenCalled();
    expect(mockDeferredMount.mounts.length).toBeGreaterThan(0);
  });

  test("does not schedule catalog work while settings are still loading", () => {
    mockRuntime.settings.getSettings.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSession(), {
      concurrentRoot: false,
    });

    expect(result.current.loading).toBe(true);
    expect(mockRuntime.providerCatalog.fallbackSnapshot).toHaveBeenCalled();
    expect(mockDeferredMount.mounts).toHaveLength(0);
    expect(mockRuntime.providerCatalog.all).not.toHaveBeenCalled();
    expect(mockRuntime.providerCatalog.modelOptions).not.toHaveBeenCalled();
    expect(mockRuntime.providerCatalog.thinkingLevels).not.toHaveBeenCalled();
  });

  test("allows applying websearch changes before OAuth is connected", async () => {
    const { result } = await renderLoadedSession();

    act(() => {
      result.current.updateDraft((next) => {
        next.webSearch.enabled = true;
      });
    });

    expectApplyAllowed(result);
  });

  test("allows applying reminder changes before API key is configured", async () => {
    const settings = defaultSettings();
    settings.provider.authModeByProvider.openai = "api";
    mockRuntime.settings.getSettings.mockResolvedValue(settings);
    mockRuntime.providerCatalog.authMethods.mockReturnValue(["api"]);
    mockRuntime.providerCatalog.authMode.mockReturnValue("api");

    const { result } = await renderLoadedSession();

    act(() => {
      result.current.updateDraft((next) => {
        next.reminders.providerConfiguration.enabled = false;
      });
    });

    expectApplyAllowed(result);
  });

  test("keeps blank ingest endpoint as an apply blocker", async () => {
    const { result } = await renderLoadedSession();

    act(() => {
      result.current.updateDraft((next) => {
        next.ingest.endpointUrl = " ";
      });
    });

    expect(result.current.dirty).toBe(true);
    expect(result.current.valid).toBe(false);
    expect(result.current.applyHint).toBe("Ingest endpoint is required.");
  });
});

async function renderLoadedSession() {
  const hook = renderHook(() => useSession(), {
    concurrentRoot: false,
  });

  await waitFor(
    () => {
      expect(hook.result.current.loading).toBe(false);
    },
    { timeout: 100 },
  );

  return hook;
}

function expectApplyAllowed(
  result: Awaited<ReturnType<typeof renderLoadedSession>>["result"],
) {
  expect(result.current.dirty).toBe(true);
  expect(result.current.valid).toBe(true);
  expect(result.current.applyHint).toBeNull();
}

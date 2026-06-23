import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Alert, Platform } from "react-native";

import { ToastDurations } from "@/constants/runtime";
import { useAppRuntime } from "@/providers/app-provider";
import { useToast } from "@/providers/toast-provider";
import type {
  ProviderAuthMode,
  ProviderItem,
  ProviderModel,
} from "@/types/provider";
import { isExperimentalProvider } from "@/services/providers/provider-catalog";
import type { OAuthFlow } from "@/services/providers/provider-oauth";
import { getErrorMessage } from "@/types/app-error";
import {
  defaultSettings,
  type AppSettings,
  type ProviderAuth,
} from "@/types/settings";
import { scheduleDeferredMount } from "@/utils/idle";

type OAuthState = {
  busy: boolean;
  flow?: OAuthFlow;
  status?: string;
};

export function useSession() {
  const runtime = useAppRuntime();
  const toast = useToast();
  const [saved, setSaved] = useState<AppSettings>(() => defaultSettings());
  const [draft, setDraft] = useState<AppSettings>(() => defaultSettings());
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [oauth, setOauth] = useState<OAuthState>({ busy: false });
  const {
    providerOpen,
    setProviderOpen,
    modelOpen,
    setModelOpen,
    thinkingOpen,
    setThinkingOpen,
    query,
    setQuery,
    closePickers,
  } = usePickers();

  useSettingsLoader({
    runtime,
    setSaved,
    setDraft,
    setProviders,
    setLoading,
    setOauth,
    closePickers,
    setQuery,
  });

  const {
    id,
    methods,
    mode,
    key,
    connected,
    supported,
    providerName,
    modelName,
    models,
    setModels,
    thinkingLevels,
    setThinkingLevels,
    providerList,
  } = useSettingsCatalog({ runtime, draft, providers, query, loading });
  const { dirty, valid, applyHint } = useSettingsValidation({
    saved,
    draft,
  });

  async function apply(next?: AppSettings) {
    await applySettings({
      payload: next ?? draft,
      runtime,
      toast,
      setSaving,
      setSaved,
      setDraft,
      setOauth,
      closePickers,
      setQuery,
    });
  }

  function cancel() {
    setDraft(cloneSettings(saved));
    setOauth({ busy: false, status: "Changes discarded." });
    toast.show({ text: "Changes discarded.", tone: "info" });
    closePickers();
    setQuery("");
  }

  async function startOAuth() {
    await startSettingsOAuth({ id, runtime, toast, setOauth });
  }

  async function completeOAuth() {
    await completeSettingsOAuth({
      id,
      draft,
      flow: oauth.flow,
      toast,
      setDraft,
      setOauth,
      apply,
    });
  }

  async function selectProvider(nextId: string) {
    await selectSettingsProvider({
      nextId,
      draft,
      runtime,
      setDraft,
      setOauth,
      closePickers,
      setQuery,
    });
  }

  async function setMode(next: ProviderAuthMode) {
    await setSettingsMode({
      id,
      mode: next,
      draft,
      runtime,
      setModels,
      setThinkingLevels,
      setDraft,
    });
  }

  function setApiKey(value: string) {
    updateDraft((next) => {
      next.provider.auth[id] = { type: "api", key: value };
    });
  }

  async function selectModel(modelId: string) {
    await selectSettingsModel({
      id,
      modelId,
      draft,
      runtime,
      setDraft,
      setThinkingLevels,
      setModelOpen,
      setThinkingOpen,
    });
  }

  function selectThinkingLevel(value: string | null) {
    updateDraft((next) => {
      next.provider.modelVariant = value;
    });
    setThinkingOpen(false);
  }

  function onCopied() {
    setOauth((state) => ({ ...state, status: "Copied." }));
    toast.show({ text: "Copied.", tone: "success" });
  }

  function onCopyFailed() {
    setOauth((state) => ({ ...state, status: "Copy failed. Copy manually." }));
    toast.show({
      text: "Copy failed. Copy manually.",
      tone: "warning",
      durationMs: ToastDurations.warningMs,
    });
  }

  function clearLocalData() {
    confirmClearLocalData(performClearLocalData);
  }

  async function performClearLocalData() {
    await clearSettingsLocalData({
      runtime,
      toast,
      setClearing,
      setSaved,
      setDraft,
      setProviders,
      setModels,
      setThinkingLevels,
      setOauth,
      closePickers,
      setQuery,
    });
  }

  function updateDraft(mutator: (next: AppSettings) => void) {
    const next = cloneSettings(draft);
    mutator(next);
    setDraft(next);
  }

  return {
    draft,
    id,
    methods,
    mode,
    key,
    connected,
    supported,
    providerName,
    modelName,
    models,
    thinkingLevels,
    providerList,
    loading,
    dirty,
    valid,
    applyHint,
    saving,
    clearing,
    oauth,
    providerOpen,
    modelOpen,
    thinkingOpen,
    query,
    setQuery,
    setProviderOpen,
    setModelOpen,
    setThinkingOpen,
    updateDraft,
    apply,
    cancel,
    startOAuth,
    completeOAuth,
    selectProvider,
    setMode,
    setApiKey,
    selectModel,
    selectThinkingLevel,
    onCopied,
    onCopyFailed,
    clearLocalData,
  };
}

type SettingsRuntime = ReturnType<typeof useAppRuntime>;
type SettingsToast = ReturnType<typeof useToast>;
type StateSetter<T> = Dispatch<SetStateAction<T>>;

function usePickers() {
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [query, setQuery] = useState("");
  const closePickers = useCallback(() => {
    setProviderOpen(false);
    setModelOpen(false);
    setThinkingOpen(false);
  }, []);

  return {
    providerOpen,
    setProviderOpen,
    modelOpen,
    setModelOpen,
    thinkingOpen,
    setThinkingOpen,
    query,
    setQuery,
    closePickers,
  };
}

function useSettingsLoader({
  runtime,
  setSaved,
  setDraft,
  setProviders,
  setLoading,
  setOauth,
  closePickers,
  setQuery,
}: {
  runtime: SettingsRuntime;
  setSaved: StateSetter<AppSettings>;
  setDraft: StateSetter<AppSettings>;
  setProviders: StateSetter<ProviderItem[]>;
  setLoading: StateSetter<boolean>;
  setOauth: StateSetter<OAuthState>;
  closePickers: () => void;
  setQuery: StateSetter<string>;
}) {
  const load = useCallback(() => {
    let active = true;
    let cancelDeferredRefresh: (() => void) | undefined;

    void (async () => {
      try {
        const nextProviders = runtime.providerCatalog.fallbackSnapshot();
        const nextSettings = await runtime.settings.getSettings();
        if (!active) return;
        setSaved(cloneSettings(nextSettings));
        setDraft(cloneSettings(nextSettings));
        setProviders(nextProviders);
        setLoading(false);
        closePickers();
        setOauth({ busy: false });
        setQuery("");
        cancelDeferredRefresh = scheduleDeferredMount(() => {
          void runtime.providerCatalog
            .all()
            .then((freshProviders) => {
              if (active) setProviders(freshProviders);
            })
            .catch(() => {});
        });
      } catch (error) {
        if (active) {
          Alert.alert(
            "Settings failed",
            getErrorMessage(error, "Unable to load settings."),
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      cancelDeferredRefresh?.();
    };
  }, [
    closePickers,
    runtime,
    setDraft,
    setLoading,
    setOauth,
    setProviders,
    setQuery,
    setSaved,
  ]);

  useFocusEffect(load);
}

function useSettingsCatalog({
  runtime,
  draft,
  providers,
  query,
  loading,
}: {
  runtime: SettingsRuntime;
  draft: AppSettings;
  providers: ProviderItem[];
  query: string;
  loading: boolean;
}) {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [thinkingLevels, setThinkingLevels] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(query);
  const id = draft.provider.id;
  const methods = runtime.providerCatalog.authMethods(id);
  const mode = draft.provider.authModeByProvider[id] ?? methods[0];
  const auth = draft.provider.auth[id];
  const key = auth?.type === "api" ? auth.key : "";
  const connected = auth?.type === "oauth";
  const supported = runtime.providerCatalog.isSupportedProvider(id);
  const providerName = providers.find((item) => item.id === id)?.name ?? id;
  const provider = providers.find((item) => item.id === id);
  const effectiveModels = models.length ? models : (provider?.models ?? []);
  const modelName =
    effectiveModels.find((item) => item.id === draft.provider.model)?.name ??
    draft.provider.model;
  const effectiveThinkingLevels = thinkingLevels.length
    ? thinkingLevels
    : (effectiveModels.find((item) => item.id === draft.provider.model)
        ?.variants ?? []);

  useEffect(() => {
    if (loading) return undefined;

    let active = true;
    const cancel = scheduleDeferredMount(() => {
      void runtime.providerCatalog.modelOptions(id, mode).then((nextModels) => {
        if (active) setModels(nextModels);
      });
    });

    return () => {
      active = false;
      cancel();
    };
  }, [id, loading, mode, runtime]);

  useEffect(() => {
    if (loading) return undefined;

    let active = true;
    const cancel = scheduleDeferredMount(() => {
      void runtime.providerCatalog
        .thinkingLevels(id, draft.provider.model, mode)
        .then((nextLevels) => {
          if (active) setThinkingLevels(nextLevels);
        });
    });

    return () => {
      active = false;
      cancel();
    };
  }, [draft.provider.model, id, loading, mode, runtime]);

  const visibleProviders = useMemo(() => {
    if (draft.provider.showExperimentalProviders) return providers;
    return providers.filter((item) => !isExperimentalProvider(item.id));
  }, [providers, draft.provider.showExperimentalProviders]);
  const providerList = useMemo(() => {
    const value = deferredQuery.trim().toLowerCase();
    if (!value) return visibleProviders;
    return visibleProviders.filter((item) =>
      `${item.name} ${item.id}`.toLowerCase().includes(value),
    );
  }, [visibleProviders, deferredQuery]);

  return {
    id,
    methods,
    mode,
    key,
    connected,
    supported,
    providerName,
    modelName,
    models: effectiveModels,
    setModels,
    thinkingLevels: effectiveThinkingLevels,
    setThinkingLevels,
    providerList,
  };
}

function useSettingsValidation({
  saved,
  draft,
}: {
  saved: AppSettings;
  draft: AppSettings;
}) {
  const dirty = useMemo(
    () => JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft],
  );
  const valid = useMemo(
    () => isValidSettingsDraft({ draft }),
    [draft],
  );
  const applyHint = useMemo(
    () => settingsApplyHint({ dirty, draft }),
    [dirty, draft],
  );

  return { dirty, valid, applyHint };
}

async function applySettings({
  payload,
  runtime,
  toast,
  setSaving,
  setSaved,
  setDraft,
  setOauth,
  closePickers,
  setQuery,
}: {
  payload: AppSettings;
  runtime: SettingsRuntime;
  toast: SettingsToast;
  setSaving: StateSetter<boolean>;
  setSaved: StateSetter<AppSettings>;
  setDraft: StateSetter<AppSettings>;
  setOauth: StateSetter<OAuthState>;
  closePickers: () => void;
  setQuery: StateSetter<string>;
}) {
  setSaving(true);
  try {
    const normalized = normalizeForSave(payload);
    await runtime.settings.saveSettings(normalized);
    const fresh = await runtime.settings.getSettings();
    setSaved(cloneSettings(fresh));
    setDraft(cloneSettings(fresh));
    setOauth({ busy: false, status: "Settings applied." });
    toast.show({ text: "Settings applied.", tone: "success" });
    closePickers();
    setQuery("");
  } catch (error) {
    Alert.alert(
      "Apply failed",
      getErrorMessage(error, "Unable to apply settings."),
    );
  } finally {
    setSaving(false);
  }
}

async function startSettingsOAuth({
  id,
  runtime,
  toast,
  setOauth,
}: {
  id: string;
  runtime: SettingsRuntime;
  toast: SettingsToast;
  setOauth: StateSetter<OAuthState>;
}) {
  try {
    setOauth({ busy: true, status: undefined });
    const flow = await runtime.oauth.start(id);
    setOauth({ busy: false, flow, status: flow.instructions });
    await WebBrowser.openBrowserAsync(flow.url);
  } catch (error) {
    setOauth({ busy: false });
    toast.show({
      text: getErrorMessage(error, "Unable to start OAuth flow."),
      tone: "error",
      durationMs: 3200,
    });
    Alert.alert(
      "OAuth failed",
      getErrorMessage(error, "Unable to start OAuth flow."),
    );
  }
}

async function completeSettingsOAuth({
  id,
  draft,
  flow,
  toast,
  setDraft,
  setOauth,
  apply,
}: {
  id: string;
  draft: AppSettings;
  flow: OAuthFlow | undefined;
  toast: SettingsToast;
  setDraft: StateSetter<AppSettings>;
  setOauth: StateSetter<OAuthState>;
  apply: (next: AppSettings) => Promise<void>;
}) {
  if (!flow) return;

  try {
    setOauth((current) => ({
      ...current,
      busy: true,
      status: "Waiting for provider confirmation...",
    }));
    const token = await flow.complete();
    const next = cloneSettings(draft);
    next.provider.auth[id] = token;
    next.provider.authModeByProvider[id] = "oauth";
    setDraft(next);
    setOauth({ busy: false, status: "OAuth connected. Applied." });
    await apply(next);
  } catch (error) {
    setOauth({ busy: false });
    toast.show({
      text: getErrorMessage(error, "Unable to complete OAuth flow."),
      tone: "error",
      durationMs: ToastDurations.errorMs,
    });
    Alert.alert(
      "OAuth failed",
      getErrorMessage(error, "Unable to complete OAuth flow."),
    );
  }
}

async function selectSettingsProvider({
  nextId,
  draft,
  runtime,
  setDraft,
  setOauth,
  closePickers,
  setQuery,
}: {
  nextId: string;
  draft: AppSettings;
  runtime: SettingsRuntime;
  setDraft: StateSetter<AppSettings>;
  setOauth: StateSetter<OAuthState>;
  closePickers: () => void;
  setQuery: StateSetter<string>;
}) {
  try {
    const nextMethods = runtime.providerCatalog.authMethods(nextId);
    const nextMode =
      draft.provider.authModeByProvider[nextId] ?? nextMethods[0];
    const defaults = await runtime.providerCatalog.defaultsFor(
      nextId,
      nextMode,
    );
    const nextDraft = cloneSettings(draft);
    nextDraft.provider.id = nextId;
    nextDraft.provider.model = defaults.model;
    nextDraft.provider.modelVariant = null;
    nextDraft.provider.authModeByProvider[nextId] = nextMode;
    setDraft(nextDraft);
    setOauth({ busy: false });
    closePickers();
    setQuery("");
  } catch (error) {
    Alert.alert(
      "Provider failed",
      getErrorMessage(error, "Unable to select provider."),
    );
  }
}

async function setSettingsMode({
  id,
  mode,
  draft,
  runtime,
  setModels,
  setThinkingLevels,
  setDraft,
}: {
  id: string;
  mode: ProviderAuthMode;
  draft: AppSettings;
  runtime: SettingsRuntime;
  setModels: StateSetter<ProviderModel[]>;
  setThinkingLevels: StateSetter<string[]>;
  setDraft: StateSetter<AppSettings>;
}) {
  const nextDraft = cloneSettings(draft);
  nextDraft.provider.authModeByProvider[id] = mode;

  try {
    const defaults = await runtime.providerCatalog.defaultsFor(id, mode);
    const options = await runtime.providerCatalog.modelOptions(id, mode);
    if (!options.some((item) => item.id === nextDraft.provider.model)) {
      nextDraft.provider.model = defaults.model;
      nextDraft.provider.modelVariant = null;
    }
    setModels(options);
    setThinkingLevels(
      await runtime.providerCatalog.thinkingLevels(
        id,
        nextDraft.provider.model,
        mode,
      ),
    );
  } catch {}

  setDraft(nextDraft);
}

async function selectSettingsModel({
  id,
  modelId,
  draft,
  runtime,
  setDraft,
  setThinkingLevels,
  setModelOpen,
  setThinkingOpen,
}: {
  id: string;
  modelId: string;
  draft: AppSettings;
  runtime: SettingsRuntime;
  setDraft: StateSetter<AppSettings>;
  setThinkingLevels: StateSetter<string[]>;
  setModelOpen: StateSetter<boolean>;
  setThinkingOpen: StateSetter<boolean>;
}) {
  try {
    const nextLevels = await runtime.providerCatalog.thinkingLevels(
      id,
      modelId,
      draft.provider.authModeByProvider[id],
    );
    const nextDraft = cloneSettings(draft);
    nextDraft.provider.model = modelId;
    if (
      nextDraft.provider.modelVariant &&
      !nextLevels.includes(nextDraft.provider.modelVariant)
    ) {
      nextDraft.provider.modelVariant = null;
    }
    setDraft(nextDraft);
    setThinkingLevels(nextLevels);
    setModelOpen(false);
    setThinkingOpen(false);
  } catch (error) {
    Alert.alert(
      "Model failed",
      getErrorMessage(error, "Unable to select model."),
    );
  }
}

function confirmClearLocalData(performClearLocalData: () => Promise<void>) {
  const title = "Clear local data?";
  const message =
    "This will remove local attempts, queue, settings, auth tokens, and cached provider catalog on this device.";
  if (Platform.OS === "web") {
    const ok =
      typeof window !== "undefined"
        ? window.confirm(`${title}\n\n${message}`)
        : true;
    if (ok) void performClearLocalData();
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: "Clear",
      style: "destructive",
      onPress: () => void performClearLocalData(),
    },
  ]);
}

async function clearSettingsLocalData({
  runtime,
  toast,
  setClearing,
  setSaved,
  setDraft,
  setProviders,
  setModels,
  setThinkingLevels,
  setOauth,
  closePickers,
  setQuery,
}: {
  runtime: SettingsRuntime;
  toast: SettingsToast;
  setClearing: StateSetter<boolean>;
  setSaved: StateSetter<AppSettings>;
  setDraft: StateSetter<AppSettings>;
  setProviders: StateSetter<ProviderItem[]>;
  setModels: StateSetter<ProviderModel[]>;
  setThinkingLevels: StateSetter<string[]>;
  setOauth: StateSetter<OAuthState>;
  closePickers: () => void;
  setQuery: StateSetter<string>;
}) {
  setClearing(true);
  try {
    await runtime.clearLocalData();
    const defaults = cloneSettings(defaultSettings());
    const nextProviders = await runtime.providerCatalog.all(true);
    setSaved(defaults);
    setDraft(defaults);
    setProviders(nextProviders);
    setModels(
      await runtime.providerCatalog.modelOptions(
        defaults.provider.id,
        defaults.provider.authModeByProvider[defaults.provider.id],
      ),
    );
    setThinkingLevels(
      await runtime.providerCatalog.thinkingLevels(
        defaults.provider.id,
        defaults.provider.model,
        defaults.provider.authModeByProvider[defaults.provider.id],
      ),
    );
    setOauth({ busy: false, status: "Local data cleared." });
    toast.show({
      text: "All local app data cleared.",
      tone: "success",
      durationMs: ToastDurations.warningMs,
    });
    closePickers();
    setQuery("");
  } catch (error) {
    Alert.alert(
      "Clear failed",
      getErrorMessage(error, "Unable to clear local data."),
    );
  } finally {
    setClearing(false);
  }
}

function isValidSettingsDraft({
  draft,
}: {
  draft: AppSettings;
}) {
  return Boolean(
    draft.provider.model.trim() &&
    draft.provider.timeoutMs > 0 &&
    draft.ingest.endpointUrl.trim(),
  );
}

function settingsApplyHint({
  dirty,
  draft,
}: {
  dirty: boolean;
  draft: AppSettings;
}) {
  if (!dirty) return null;
  return firstInvalidMessage([
    [isBlank(draft.provider.model), "Model is required."],
    [draft.provider.timeoutMs <= 0, "Timeout must be greater than 0."],
    [isBlank(draft.ingest.endpointUrl), "Ingest endpoint is required."],
  ]);
}

function firstInvalidMessage(checks: [boolean, string][]) {
  return checks.find(([invalid]) => invalid)?.[1] ?? null;
}

function isBlank(value: string) {
  return !value.trim();
}

function normalizeForSave(settings: AppSettings): AppSettings {
  const id = settings.provider.id;
  const mode = settings.provider.authModeByProvider[id] ?? "api";

  return {
    ...settings,
    provider: {
      ...settings.provider,
      model: settings.provider.model.trim(),
      modelVariant: settings.provider.modelVariant?.trim() || null,
      auth: {
        ...settings.provider.auth,
        [id]: getAuthForSave({ mode, current: settings.provider.auth[id] }),
      },
    },
    ingest: {
      endpointUrl: settings.ingest.endpointUrl.trim(),
      apiKey: settings.ingest.apiKey,
    },
    barcode: {
      ...settings.barcode,
      allowedTypes: settings.barcode.allowedTypes.filter(Boolean),
    },
    webSearch: {
      enabled: settings.webSearch.enabled,
    },
  };
}

function getAuthForSave({
  mode,
  current,
}: {
  mode: ProviderAuthMode;
  current: ProviderAuth | undefined;
}): ProviderAuth | undefined {
  if (mode === "api") {
    return current?.type === "api" && current.key.trim() ? current : undefined;
  }

  return current?.type === "oauth" ? current : undefined;
}

function cloneSettings(settings: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(settings)) as AppSettings;
}

export type Session = ReturnType<typeof useSession>;

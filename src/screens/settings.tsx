import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Switch, Text, View } from 'react-native';

import { CopyButton } from '@/components/copy-button';
import { OptionPicker } from '@/components/option-picker';
import { AppHeader, BrutalFrame, FieldRow, StatusPill, StickyActionBar } from '@/components/ui/app-chrome';
import { Button } from '@/components/ui/button';
import { Input, LabeledInput } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { useAppRuntime } from '@/providers/app-provider';
import { useToast } from '@/providers/toast-provider';
import { isExperimentalProvider } from '@/services/provider-catalog';
import type { ProviderAuthMode, ProviderItem, ProviderModel } from '@/services/provider-catalog';
import type { OAuthFlow } from '@/services/provider-oauth';
import { ToastDurations } from '@/constants/runtime';
import { getErrorMessage } from '@/types/app-error';
import { defaultSettings, type AppSettings, type ProviderAuth } from '@/types/settings';

type OAuthState = {
  busy: boolean;
  flow?: OAuthFlow;
  status?: string;
};

export function SettingsScreen() {
  const runtime = useAppRuntime();
  const toast = useToast();
  const [saved, setSaved] = useState<AppSettings>(defaultSettings());
  const [draft, setDraft] = useState<AppSettings>(defaultSettings());
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [thinkingLevels, setThinkingLevels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [oauth, setOauth] = useState<OAuthState>({ busy: false });
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    let active = true;

    void (async () => {
      try {
        const [nextSettings, nextProviders] = await Promise.all([
          runtime.settings.getSettings(),
          runtime.providerCatalog.all(),
        ]);

        if (!active) {
          return;
        }

        setSaved(cloneSettings(nextSettings));
        setDraft(cloneSettings(nextSettings));
        setProviders(nextProviders);
        setOauth({ busy: false });
        setProviderOpen(false);
        setModelOpen(false);
        setThinkingOpen(false);
        setQuery('');
      } catch (error) {
        if (active) {
          Alert.alert('Settings failed', getErrorMessage(error, 'Unable to load settings.'));
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [runtime]);

  useFocusEffect(load);
  useEffect(load, [load]);

  const id = draft.provider.id;

  useEffect(() => {
    let active = true;

    void runtime.providerCatalog.modelOptions(id, draft.provider.authModeByProvider[id]).then((nextModels) => {
      if (!active) {
        return;
      }

      setModels(nextModels);
    });

    return () => {
      active = false;
    };
  }, [draft.provider.authModeByProvider, id, runtime]);

  useEffect(() => {
    let active = true;

    void runtime.providerCatalog.thinkingLevels(id, draft.provider.model, draft.provider.authModeByProvider[id]).then((nextLevels) => {
      if (!active) {
        return;
      }

      setThinkingLevels(nextLevels);
    });

    return () => {
      active = false;
    };
  }, [draft.provider.authModeByProvider, draft.provider.model, id, runtime]);

  const methods = runtime.providerCatalog.authMethods(id);
  const mode = draft.provider.authModeByProvider[id] ?? methods[0];
  const auth = draft.provider.auth[id];
  const key = auth?.type === 'api' ? auth.key : '';
  const connected = auth?.type === 'oauth';
  const supported = runtime.providerCatalog.isSupportedProvider(id);
  const providerName = providers.find((item) => item.id === id)?.name ?? id;
  const modelName = models.find((item) => item.id === draft.provider.model)?.name ?? draft.provider.model;
  const visibleProviders = useMemo(() => {
    if (draft.provider.showExperimentalProviders) {
      return providers;
    }

    return providers.filter((item) => !isExperimentalProvider(item.id));
  }, [providers, draft.provider.showExperimentalProviders]);
  const list = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) {
      return visibleProviders;
    }

    return visibleProviders.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(value));
  }, [visibleProviders, query]);
  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

  const valid = useMemo(() => {
    if (!draft.provider.endpointUrl.trim() || !draft.provider.model.trim() || draft.provider.timeoutMs <= 0) {
      return false;
    }

    if (mode === 'api' && !key.trim()) {
      return false;
    }

    if (mode === 'oauth' && !connected) {
      return false;
    }

    // || !draft.ingest.apiKey.trim() is not used as it blocks oauth providers
    if (!draft.ingest.endpointUrl.trim()) {
      return false;
    }

    return true;
  }, [draft, mode, key, connected]);

  const applyHint = useMemo(() => {
    if (!dirty) {
      return null;
    }

    if (!draft.provider.endpointUrl.trim()) {
      return 'Provider endpoint is required.';
    }
    if (!draft.provider.model.trim()) {
      return 'Model is required.';
    }
    if (draft.provider.timeoutMs <= 0) {
      return 'Timeout must be greater than 0.';
    }
    if (mode === 'api' && !key.trim()) {
      return 'API key is required for API mode.';
    }
    if (mode === 'oauth' && !connected) {
      return 'OAuth must be connected before applying.';
    }
    if (!draft.ingest.endpointUrl.trim()) {
      return 'Ingest endpoint is required.';
    }
    if (!draft.ingest.apiKey.trim()) {
      return 'Ingest x-api-key is required.';
    }

    return null;
  }, [connected, dirty, draft.ingest.apiKey, draft.ingest.endpointUrl, draft.provider.endpointUrl, draft.provider.model, draft.provider.timeoutMs, key, mode]);

  async function apply(next?: AppSettings) {
    const payload = next ?? draft;

    setSaving(true);

    try {
      const normalized = normalizeForSave(payload);
      await runtime.settings.saveSettings(normalized);
      const fresh = await runtime.settings.getSettings();
      setSaved(cloneSettings(fresh));
      setDraft(cloneSettings(fresh));
      setOauth({ busy: false, status: 'Settings applied.' });
      toast.show({ text: 'Settings applied.', tone: 'success' });
      setProviderOpen(false);
      setModelOpen(false);
      setThinkingOpen(false);
      setQuery('');
    } catch (error) {
      Alert.alert('Apply failed', getErrorMessage(error, 'Unable to apply settings.'));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(cloneSettings(saved));
    setOauth({ busy: false, status: 'Changes discarded.' });
    toast.show({ text: 'Changes discarded.', tone: 'info' });
    setProviderOpen(false);
    setModelOpen(false);
    setThinkingOpen(false);
    setQuery('');
  }

  async function startOAuth() {
    try {
      setOauth({ busy: true, status: undefined });
      const flow = await runtime.oauth.start(id);
      setOauth({ busy: false, flow, status: flow.instructions });
      await WebBrowser.openBrowserAsync(flow.url);
    } catch (error) {
      setOauth({ busy: false });
      toast.show({
        text: getErrorMessage(error, 'Unable to start OAuth flow.'),
        tone: 'error',
        durationMs: 3200,
      });
      Alert.alert('OAuth failed', getErrorMessage(error, 'Unable to start OAuth flow.'));
    }
  }

  async function completeOAuth() {
    if (!oauth.flow) {
      return;
    }

    try {
      setOauth((current) => ({ ...current, busy: true, status: 'Waiting for provider confirmation...' }));
      const token = await oauth.flow.complete();
      const next = cloneSettings(draft);
      next.provider.auth[id] = token;
      next.provider.authModeByProvider[id] = 'oauth';
      setDraft(next);
      setOauth({ busy: false, status: 'OAuth connected. Applied.' });
      await apply(next);
    } catch (error) {
      setOauth({ busy: false });
      toast.show({
        text: getErrorMessage(error, 'Unable to complete OAuth flow.'),
        tone: 'error',
        durationMs: ToastDurations.errorMs,
      });
      Alert.alert('OAuth failed', getErrorMessage(error, 'Unable to complete OAuth flow.'));
    }
  }

  async function selectProvider(nextId: string) {
    try {
      const nextMethods = runtime.providerCatalog.authMethods(nextId);
      const nextMode = draft.provider.authModeByProvider[nextId] ?? nextMethods[0];
      const defaults = await runtime.providerCatalog.defaultsFor(nextId, nextMode);
      const nextDraft = cloneSettings(draft);
      nextDraft.provider.id = nextId;
      nextDraft.provider.endpointUrl = defaults.endpointUrl;
      nextDraft.provider.model = defaults.model;
      nextDraft.provider.modelVariant = null;
      nextDraft.provider.authModeByProvider[nextId] = nextMode;
      setDraft(nextDraft);
      setOauth({ busy: false });
      setProviderOpen(false);
      setModelOpen(false);
      setThinkingOpen(false);
      setQuery('');
    } catch (error) {
      Alert.alert('Provider failed', getErrorMessage(error, 'Unable to select provider.'));
    }
  }

  async function setMode(next: ProviderAuthMode) {
    const nextDraft = cloneSettings(draft);
    nextDraft.provider.authModeByProvider[id] = next;

    try {
      const defaults = await runtime.providerCatalog.defaultsFor(id, next);
      nextDraft.provider.endpointUrl = defaults.endpointUrl;
      const options = await runtime.providerCatalog.modelOptions(id, next);
      if (!options.some((item) => item.id === nextDraft.provider.model)) {
        nextDraft.provider.model = defaults.model;
        nextDraft.provider.modelVariant = null;
      }
      setModels(options);
      setThinkingLevels(await runtime.providerCatalog.thinkingLevels(id, nextDraft.provider.model, next));
      setDraft(nextDraft);
    } catch {
      setDraft(nextDraft);
    }
  }

  function setApiKey(value: string) {
    const nextDraft = cloneSettings(draft);
    nextDraft.provider.auth[id] = {
      type: 'api',
      key: value,
    };
    setDraft(nextDraft);
  }

  async function selectModel(modelId: string) {
    try {
      const nextLevels = await runtime.providerCatalog.thinkingLevels(id, modelId, draft.provider.authModeByProvider[id]);
      const nextDraft = cloneSettings(draft);
      nextDraft.provider.model = modelId;
      if (nextDraft.provider.modelVariant && !nextLevels.includes(nextDraft.provider.modelVariant)) {
        nextDraft.provider.modelVariant = null;
      }
      setDraft(nextDraft);
      setThinkingLevels(nextLevels);
      setModelOpen(false);
      setThinkingOpen(false);
    } catch (error) {
      Alert.alert('Model failed', getErrorMessage(error, 'Unable to select model.'));
    }
  }

  function selectThinkingLevel(value: string | null) {
    const nextDraft = cloneSettings(draft);
    nextDraft.provider.modelVariant = value;
    setDraft(nextDraft);
    setThinkingOpen(false);
  }

  function onCopied() {
    setOauth((state) => ({ ...state, status: 'Copied.' }));
    toast.show({ text: 'Copied.', tone: 'success' });
  }

  function onCopyFailed() {
    setOauth((state) => ({ ...state, status: 'Copy failed. Copy manually.' }));
    toast.show({ text: 'Copy failed. Copy manually.', tone: 'warning', durationMs: ToastDurations.warningMs });
  }

  function clearLocalData() {
    const title = 'Clear local data?';
    const message =
      'This will remove local attempts, queue, settings, auth tokens, and cached provider catalog on this device.';

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : true;
      if (ok) {
        void performClearLocalData();
      }
      return;
    }

    Alert.alert(
      title,
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void performClearLocalData();
          },
        },
      ],
    );
  }

  async function performClearLocalData() {
    setClearing(true);
    try {
      await runtime.clearLocalData();
      const defaults = cloneSettings(defaultSettings());
      const nextProviders = await runtime.providerCatalog.all(true);
      setSaved(defaults);
      setDraft(defaults);
      setProviders(nextProviders);
      setModels(await runtime.providerCatalog.modelOptions(defaults.provider.id, defaults.provider.authModeByProvider[defaults.provider.id]));
      setThinkingLevels(
        await runtime.providerCatalog.thinkingLevels(
          defaults.provider.id,
          defaults.provider.model,
          defaults.provider.authModeByProvider[defaults.provider.id],
        ),
      );
      setOauth({ busy: false, status: 'Local data cleared.' });
      toast.show({ text: 'All local app data cleared.', tone: 'success', durationMs: ToastDurations.warningMs });
      setProviderOpen(false);
      setModelOpen(false);
      setThinkingOpen(false);
      setQuery('');
    } catch (error) {
      Alert.alert('Clear failed', getErrorMessage(error, 'Unable to clear local data.'));
    } finally {
      setClearing(false);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <Screen className="gap-4 pb-28">
        <AppHeader eyebrow="Control" title="Settings" meta="Configure extraction, ingest, and local data." />

        <BrutalFrame className="gap-2 bg-paper">
          <View className="flex-row flex-wrap gap-2">
            <StatusPill label={providerName} tone={supported ? 'success' : 'warning'} />
            <StatusPill label={mode === 'oauth' ? (connected ? 'OAuth Connected' : 'OAuth Required') : 'API Key'} tone={mode === 'oauth' && !connected ? 'warning' : 'default'} />
            {dirty ? <StatusPill label="Unsaved" tone="warning" /> : <StatusPill label="Saved" tone="info" />}
          </View>
          <FieldRow label="Model" value={modelName || 'None'} />
          <FieldRow label="Ingest" value={draft.ingest.endpointUrl || 'Missing endpoint'} tone={draft.ingest.endpointUrl ? 'default' : 'warning'} />
        </BrutalFrame>

        <Section title="Provider">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-black uppercase tracking-wide text-foreground">Show experimental providers</Text>
            <Switch
              value={draft.provider.showExperimentalProviders}
              onValueChange={(value) => {
                const next = cloneSettings(draft);
                next.provider.showExperimentalProviders = value;
                setDraft(next);
              }}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-black uppercase tracking-wide text-foreground">Provider</Text>
            <Button
              variant="secondary"
              className="items-start"
              label={`${providerName} (${id})`}
              onPress={() => {
                setProviderOpen(true);
                setModelOpen(false);
                setThinkingOpen(false);
              }}
            />
          </View>

          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
            {supported
              ? 'Supported for extraction in this app.'
              : 'Configured providers are saved, but this provider is not yet supported for extraction.'}
          </Text>

          <View className="gap-1.5">
            <Text className="text-xs font-black uppercase tracking-wide text-foreground">Model</Text>
            <Button
              variant="secondary"
              className="items-start"
              label={modelName || 'Select model'}
              onPress={() => {
                setModelOpen(true);
                setProviderOpen(false);
                setThinkingOpen(false);
              }}
            />
          </View>

          {thinkingLevels.length ? (
            <View className="gap-1.5">
              <Text className="text-xs font-black uppercase tracking-wide text-foreground">Thinking</Text>
              <Button
                variant="secondary"
                className="items-start"
                label={draft.provider.modelVariant ? formatThinkingLevel(draft.provider.modelVariant) : 'Auto'}
                onPress={() => {
                  setThinkingOpen(true);
                  setProviderOpen(false);
                  setModelOpen(false);
                }}
              />
            </View>
          ) : null}

          <LabeledInput
            label="Endpoint URL"
            value={draft.provider.endpointUrl}
            onChangeText={(value) => {
              const next = cloneSettings(draft);
              next.provider.endpointUrl = value;
              setDraft(next);
            }}
          />
          <LabeledInput
            label="Timeout (ms)"
            keyboardType="number-pad"
            value={String(draft.provider.timeoutMs)}
            onChangeText={(value) => {
              const next = cloneSettings(draft);
              next.provider.timeoutMs = Number(value) || 0;
              setDraft(next);
            }}
          />

          {methods.length > 1 ? (
            <View className="flex-row gap-2">
              {methods.map((item) => (
                <Button
                  key={item}
                  variant={mode === item ? 'primary' : 'secondary'}
                  size="sm"
                  className="flex-1"
                  label={item === 'api' ? 'API Key' : 'OAuth'}
                  onPress={() => setMode(item)}
                />
              ))}
            </View>
          ) : null}

          {mode === 'api' ? (
            <LabeledInput label="API Key" secureTextEntry value={key} onChangeText={setApiKey} />
          ) : (
            <View className="gap-3 border-2 border-border bg-paper p-3">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-sm font-black uppercase tracking-wide text-foreground">OAuth</Text>
                {connected ? <StatusPill label="Connected" tone="success" /> : <StatusPill label="Not Connected" tone="warning" />}
              </View>
              <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
                Starting OAuth opens a blocking browser/custom tab. Complete provider authorization, return here, then press Complete OAuth.
              </Text>

              {oauth.flow ? (
                <>
                  <View className="gap-1.5">
                    <Text className="text-xs font-black uppercase tracking-wide text-foreground">Verification URL</Text>
                    <View className="flex-row items-center gap-2">
                      <Input value={oauth.flow.url} editable={false} className="flex-1" />
                      <CopyButton
                        value={oauth.flow?.url ?? ''}
                        variant="secondary"
                        size="sm"
                        className="h-12 w-12 px-0"
                        onCopied={onCopied}
                        onCopyFailed={onCopyFailed}
                      />
                    </View>
                  </View>

                  <View className="gap-1.5">
                    <Text className="text-xs font-black uppercase tracking-wide text-foreground">Code</Text>
                    <View className="flex-row items-center gap-2">
                      <Input value={oauth.flow.code} editable={false} className="flex-1" />
                      <CopyButton
                        value={oauth.flow?.code ?? ''}
                        variant="secondary"
                        size="sm"
                        className="h-12 w-12 px-0"
                        onCopied={onCopied}
                        onCopyFailed={onCopyFailed}
                      />
                    </View>
                  </View>
                </>
              ) : null}

              {oauth.status ? <Text className="text-xs font-semibold text-muted">{oauth.status}</Text> : null}

              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  label="Start OAuth"
                  disabled={oauth.busy}
                  onPress={startOAuth}
                />
                <Button
                  className="flex-1"
                  label={oauth.busy ? 'Waiting…' : 'Complete OAuth'}
                  disabled={!oauth.flow || oauth.busy}
                  onPress={completeOAuth}
                />
              </View>
            </View>
          )}
        </Section>

        <Section title="Ingest">
          <LabeledInput
            label="Endpoint URL"
            value={draft.ingest.endpointUrl}
            onChangeText={(value) => {
              const next = cloneSettings(draft);
              next.ingest.endpointUrl = value;
              setDraft(next);
            }}
          />
          <LabeledInput
            label="x-api-key"
            secureTextEntry
            value={draft.ingest.apiKey}
            onChangeText={(value) => {
              const next = cloneSettings(draft);
              next.ingest.apiKey = value;
              setDraft(next);
            }}
          />
        </Section>

        <Section title="Barcode">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-black uppercase tracking-wide text-foreground">Enable local barcode scan</Text>
            <Switch
              value={draft.barcode.enabled}
              onValueChange={(value) => {
                const next = cloneSettings(draft);
                next.barcode.enabled = value;
                setDraft(next);
              }}
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-xs font-black uppercase tracking-wide text-foreground">Allowed types (comma-separated)</Text>
            <Input
              value={draft.barcode.allowedTypes.join(', ')}
              onChangeText={(value) => {
                const next = cloneSettings(draft);
                next.barcode.allowedTypes = value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean);
                setDraft(next);
              }}
            />
          </View>
        </Section>

        <Section title="Websearch">
          <View className="gap-2 border-2 border-border bg-caution p-3">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="text-sm font-black uppercase tracking-wide text-foreground">Manufacturer web search</Text>
                <Text className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  Experimental. Uses Exa AI to generate search queries, fetch source pages, and ask the VLM to reconcile manufacturer/product data.
                </Text>
              </View>
              <Switch
                value={draft.webSearch.enabled}
                onValueChange={(value) => {
                  const next = cloneSettings(draft);
                  next.webSearch.enabled = value;
                  setDraft(next);
                }}
              />
            </View>
          </View>
        </Section>

        <Section title="App Data">
          <Text className="text-sm font-semibold text-muted">
            Reset this app on this device by clearing local history, queue, settings, tokens, and provider cache.
          </Text>
          <Button
            variant="caution"
            label={clearing ? 'Clearing…' : 'Clear Local Data'}
            disabled={clearing || saving || oauth.busy}
            onPress={clearLocalData}
          />
        </Section>
      </Screen>

      {dirty ? (
        <StickyActionBar className="absolute bottom-0 left-0 right-0">
          {applyHint ? <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{applyHint}</Text> : null}
          <View className="flex-row gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              label="Cancel"
              disabled={saving}
              onPress={cancel}
            />
            <Button
              className="flex-1"
              disabled={saving || !valid}
              label={saving ? 'Applying…' : 'Apply'}
              onPress={() => apply()}
            />
          </View>
        </StickyActionBar>
      ) : null}

      <OptionPicker
        title="Select Provider"
        open={providerOpen}
        items={list.map((item) => ({ id: item.id, label: `${item.name} (${item.id})` }))}
        selectedId={id}
        query={query}
        onQueryChange={setQuery}
        onClose={() => setProviderOpen(false)}
        onSelect={(nextId) => void selectProvider(nextId)}
      />
      <OptionPicker
        title="Select Model"
        open={modelOpen}
        items={models.map((item) => ({ id: item.id, label: `${item.name} (${item.id})` }))}
        selectedId={draft.provider.model}
        onClose={() => setModelOpen(false)}
        onSelect={(modelId) => void selectModel(modelId)}
      />
      <OptionPicker
        title="Select Thinking"
        open={thinkingOpen}
        items={[{ id: '__auto__', label: 'Auto' }, ...thinkingLevels.map((item) => ({ id: item, label: formatThinkingLevel(item) }))]}
        selectedId={draft.provider.modelVariant ?? '__auto__'}
        onClose={() => setThinkingOpen(false)}
        onSelect={(value) => selectThinkingLevel(value === '__auto__' ? null : value)}
      />
    </View>
  );
}

function normalizeForSave(settings: AppSettings): AppSettings {
  const id = settings.provider.id;
  const mode = settings.provider.authModeByProvider[id] ?? 'api';

  return {
    ...settings,
    provider: {
      ...settings.provider,
      endpointUrl: settings.provider.endpointUrl.trim(),
      model: settings.provider.model.trim(),
      modelVariant: settings.provider.modelVariant?.trim() || null,
      auth: {
        ...settings.provider.auth,
        [id]: getAuthForSave({
          mode,
          current: settings.provider.auth[id],
        }),
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
  if (mode === 'api') {
    if (current?.type === 'api' && current.key.trim()) {
      return current;
    }

    return undefined;
  }

  if (current?.type === 'oauth') {
    return current;
  }

  return undefined;
}

function formatThinkingLevel(value: string) {
  if (value === 'xhigh') {
    return 'XHigh';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function cloneSettings(settings: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(settings)) as AppSettings;
}

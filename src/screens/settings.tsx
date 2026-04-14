import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input, LabeledInput } from '@/components/ui/input';
import { Screen, ScreenTitle } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { useAppRuntime } from '@/providers/app-provider';
import { defaultSettings, type AppSettings } from '@/types/settings';
import { getUserFacingErrorMessage } from '@/types/user-feedback';

export function SettingsScreen() {
  const runtime = useAppRuntime();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings());
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = useCallback(() => {
    let active = true;

    void runtime.settings.getSettings().then((next) => {
      if (active) {
        setSettings(next);
      }
    });

    return () => {
      active = false;
    };
  }, [runtime]);

  useFocusEffect(loadSettings);
  useEffect(loadSettings, [loadSettings]);

  async function save() {
    setIsSaving(true);
    try {
      await runtime.settings.saveSettings({
        ...settings,
        barcode: {
          ...settings.barcode,
          allowedTypes: settings.barcode.allowedTypes.filter(Boolean),
        },
      });
      Alert.alert('Saved', 'Settings updated.');
    } catch (error) {
      Alert.alert('Save failed', getUserFacingErrorMessage(error, 'Unable to save settings.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen className="gap-4">
      <ScreenTitle title="Settings" />

      <Section title="Provider">
        <View className="flex-row gap-2">
          <Button
            variant={settings.provider.kind === 'openai_compatible' ? 'primary' : 'secondary'}
            size="sm"
            className="flex-1 rounded-xl"
            label="OpenAI-compatible"
            onPress={() =>
              setSettings((current) => ({
                ...current,
                provider: { ...current.provider, kind: 'openai_compatible' },
              }))
            }
          />
          <Button
            variant={settings.provider.kind === 'gemini' ? 'primary' : 'secondary'}
            size="sm"
            className="flex-1 rounded-xl"
            label="Gemini"
            onPress={() =>
              setSettings((current) => ({
                ...current,
                provider: { ...current.provider, kind: 'gemini' },
              }))
            }
          />
        </View>
        <LabeledInput
          label="Endpoint URL"
          value={settings.provider.endpointUrl}
          onChangeText={(value) =>
            setSettings((current) => ({ ...current, provider: { ...current.provider, endpointUrl: value } }))
          }
        />
        <LabeledInput
          label="Model"
          value={settings.provider.model}
          onChangeText={(value) =>
            setSettings((current) => ({ ...current, provider: { ...current.provider, model: value } }))
          }
        />
        <LabeledInput
          label="API Key"
          secureTextEntry
          value={settings.provider.apiKey}
          onChangeText={(value) =>
            setSettings((current) => ({ ...current, provider: { ...current.provider, apiKey: value } }))
          }
        />
        <LabeledInput
          label="Timeout (ms)"
          keyboardType="number-pad"
          value={String(settings.provider.timeoutMs)}
          onChangeText={(value) =>
            setSettings((current) => ({
              ...current,
              provider: {
                ...current.provider,
                timeoutMs: Number(value) || 0,
              },
            }))
          }
        />
      </Section>

      <Section title="Ingest">
        <LabeledInput
          label="Endpoint URL"
          value={settings.ingest.endpointUrl}
          onChangeText={(value) =>
            setSettings((current) => ({ ...current, ingest: { ...current.ingest, endpointUrl: value } }))
          }
        />
        <LabeledInput
          label="x-api-key"
          secureTextEntry
          value={settings.ingest.apiKey}
          onChangeText={(value) =>
            setSettings((current) => ({ ...current, ingest: { ...current.ingest, apiKey: value } }))
          }
        />
      </Section>

      <Section title="Barcode">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-slate-700">Enable local barcode scan</Text>
          <Switch
            value={settings.barcode.enabled}
            onValueChange={(value) =>
              setSettings((current) => ({ ...current, barcode: { ...current.barcode, enabled: value } }))
            }
          />
        </View>
        <View className="gap-1.5">
          <Text className="text-sm font-semibold text-slate-700">Allowed types (comma-separated)</Text>
          <Input
            value={settings.barcode.allowedTypes.join(', ')}
            onChangeText={(value) =>
              setSettings((current) => ({
                ...current,
                barcode: {
                  ...current.barcode,
                  allowedTypes: value.split(',').map((item) => item.trim()),
                },
              }))
            }
          />
        </View>
      </Section>

      <Button
        disabled={isSaving}
        label={isSaving ? 'Saving…' : 'Save Settings'}
        className="rounded-2xl"
        onPress={save}
      />
    </Screen>
  );
}

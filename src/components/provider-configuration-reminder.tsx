import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { useAppRuntime } from "@/providers/app-provider";
import { isProviderConfigured } from "@/services/providers/provider-configuration";
import type { AppSettings } from "@/types/settings";

import { Button } from "./ui/button";

export function ProviderConfigurationReminder() {
  const runtime = useAppRuntime();
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [visible, setVisible] = useState(false);
  const [dontRemind, setDontRemind] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const next = await runtime.settings.getSettings();
      if (!active) return;
      setSettings(next);
      setVisible(
        next.reminders.providerConfiguration.enabled &&
          !isProviderConfigured(next),
      );
    })();

    return () => {
      active = false;
    };
  }, [runtime]);

  async function saveReminderPreference(disabled: boolean) {
    if (!settings) return;
    const next = cloneSettings(settings);
    next.reminders.providerConfiguration.enabled = !disabled;
    setSettings(next);
    await runtime.settings.saveSettings(next);
  }

  function close() {
    setVisible(false);
  }

  async function openSettings() {
    if (dontRemind) {
      await saveReminderPreference(true);
    }
    close();
    router.push("/settings");
  }

  async function changeDontRemind(value: boolean) {
    setDontRemind(value);
    if (value) {
      await saveReminderPreference(true);
    }
  }

  if (!settings) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        accessibilityLabel="Dismiss provider configuration reminder"
        onPress={close}
      >
        <Pressable
          role="dialog"
          accessibilityLabel="Provider not configured"
          className="gap-4 border-4 border-border bg-background p-4"
          onPress={(event) => event.stopPropagation()}
        >
          <View className="gap-2">
            <Text
              role="heading"
              accessibilityRole="header"
              className="text-xl font-black uppercase tracking-tight text-foreground"
            >
              Provider not configured
            </Text>
            <Text className="text-sm font-semibold uppercase tracking-wide text-muted">
              Connect OAuth or add an API key in Settings before extracting
              product data.
            </Text>
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontRemind }}
            accessibilityLabel="Don't remind me"
            className="flex-row items-center justify-between gap-3 border-2 border-border bg-card p-3"
            onPress={() => void changeDontRemind(!dontRemind)}
          >
            <Text className="flex-1 text-sm font-black uppercase tracking-wide text-foreground">
              Do not remind me
            </Text>
            <View className="h-6 w-6 items-center justify-center border-2 border-border bg-background">
              {dontRemind ? (
                <Text className="text-base font-black text-foreground">X</Text>
              ) : null}
            </View>
          </Pressable>
          <View className="flex-row gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              label="Not Now"
              onPress={close}
            />
            <Button
              className="flex-1"
              label="Open Settings"
              onPress={() => void openSettings()}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function cloneSettings(settings: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(settings)) as AppSettings;
}

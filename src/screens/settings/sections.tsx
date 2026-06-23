import { Switch, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input, LabeledInput } from "@/components/ui/input";
import { Section } from "@/components/ui/section";

import type { Session } from "./use-session";

export function IngestSettingsSection({ session }: { session: Session }) {
  return (
    <Section title="Ingest">
      <LabeledInput
        label="Endpoint URL"
        value={session.draft.ingest.endpointUrl}
        onChangeText={(value) =>
          session.updateDraft((next) => {
            next.ingest.endpointUrl = value;
          })
        }
      />
      <LabeledInput
        label="x-api-key"
        secureTextEntry
        value={session.draft.ingest.apiKey}
        onChangeText={(value) =>
          session.updateDraft((next) => {
            next.ingest.apiKey = value;
          })
        }
      />
    </Section>
  );
}

export function BarcodeSettingsSection({ session }: { session: Session }) {
  return (
    <Section title="Barcode">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-black uppercase tracking-wide text-foreground">
          Enable local barcode scan
        </Text>
        <Switch
          accessibilityLabel="Enable local barcode scan"
          value={session.draft.barcode.enabled}
          onValueChange={(value) =>
            session.updateDraft((next) => {
              next.barcode.enabled = value;
            })
          }
        />
      </View>
      <View className="gap-1.5">
        <Text className="text-xs font-black uppercase tracking-wide text-foreground">
          Allowed types (comma-separated)
        </Text>
        <Input
          accessibilityLabel="Allowed barcode types"
          value={session.draft.barcode.allowedTypes.join(", ")}
          onChangeText={(value) =>
            session.updateDraft((next) => {
              next.barcode.allowedTypes = value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
            })
          }
        />
      </View>
    </Section>
  );
}

export function WebSearchSettingsSection({ session }: { session: Session }) {
  return (
    <Section title="Websearch">
      <View className="gap-2 border-2 border-border bg-caution p-3">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-sm font-black uppercase tracking-wide text-foreground">
              Manufacturer web search
            </Text>
            <Text className="text-xs font-semibold uppercase tracking-wide text-foreground">
              Experimental. Uses Exa AI to generate search queries, fetch source
              pages, and ask the VLM to reconcile manufacturer/product data.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Enable manufacturer web search"
            value={session.draft.webSearch.enabled}
            onValueChange={(value) =>
              session.updateDraft((next) => {
                next.webSearch.enabled = value;
              })
            }
          />
        </View>
      </View>
    </Section>
  );
}

export function ReminderSettingsSection({ session }: { session: Session }) {
  return (
    <Section title="Reminders">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-sm font-black uppercase tracking-wide text-foreground">
            Provider setup reminder
          </Text>
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
            Show startup popup when provider auth is not configured.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Provider setup reminder"
          value={session.draft.reminders.providerConfiguration.enabled}
          onValueChange={(value) =>
            session.updateDraft((next) => {
              next.reminders.providerConfiguration.enabled = value;
            })
          }
        />
      </View>
    </Section>
  );
}

export function AppDataSettingsSection({ session }: { session: Session }) {
  return (
    <Section title="App Data">
      <Text className="text-sm font-semibold text-muted">
        Reset this app on this device by clearing local history, queue,
        settings, tokens, and provider cache.
      </Text>
      <Button
        variant="caution"
        label={session.clearing ? "Clearing…" : "Clear Local Data"}
        disabled={session.clearing || session.saving || session.oauth.busy}
        onPress={session.clearLocalData}
      />
    </Section>
  );
}

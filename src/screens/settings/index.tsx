import { Text, View } from "react-native";

import { AppHeader } from "@/components/ui/app-chrome";
import { Screen as ScreenContainer } from "@/components/ui/screen";

import { useProgressiveSections } from "@/utils/progressive-sections";
import { ActionBar } from "./action-bar";
import { Pickers } from "./pickers";
import { ProviderSection } from "./provider-section";
import {
  AppDataSettingsSection,
  BarcodeSettingsSection,
  IngestSettingsSection,
  WebSearchSettingsSection,
} from "./sections";
import { Summary } from "./summary";
import { useSession } from "./use-session";

const SETTINGS_SECTION_COUNT = 5;

export function SettingsScreen() {
  const session = useSession();
  const visibleSections = useProgressiveSections(
    session.loading,
    SETTINGS_SECTION_COUNT,
  );

  return (
    <View className="flex-1 bg-background">
      <ScreenContainer className="gap-4 pb-28">
        <AppHeader
          eyebrow="Control"
          title="Settings"
          meta="Configure extraction, ingest, and local data."
        />
        {session.loading ? <SettingsLoading /> : <Summary session={session} />}
        {visibleSections >= 1 ? <ProviderSection session={session} /> : null}
        {visibleSections >= 2 ? (
          <IngestSettingsSection session={session} />
        ) : null}
        {visibleSections >= 3 ? (
          <BarcodeSettingsSection session={session} />
        ) : null}
        {visibleSections >= 4 ? (
          <WebSearchSettingsSection session={session} />
        ) : null}
        {visibleSections >= 5 ? (
          <AppDataSettingsSection session={session} />
        ) : null}
      </ScreenContainer>
      {session.loading ? null : <ActionBar session={session} />}
      {session.loading ? null : <Pickers session={session} />}
    </View>
  );
}

function SettingsLoading() {
  return (
    <View className="border-2 border-border bg-paper p-4">
      <Text className="text-sm font-black uppercase tracking-wide text-muted">
        Loading settings...
      </Text>
    </View>
  );
}

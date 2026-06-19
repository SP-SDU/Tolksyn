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
  ReminderSettingsSection,
  WebSearchSettingsSection,
} from "./sections";
import { Summary } from "./summary";
import { useSession } from "./use-session";

const SETTINGS_SECTION_COUNT = 6;

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

        {session.loading ? <SettingsWarmup /> : <Summary session={session} />}
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
          <ReminderSettingsSection session={session} />
        ) : null}
        {visibleSections >= 6 ? (
          <AppDataSettingsSection session={session} />
        ) : null}
      </ScreenContainer>

      {session.loading ? null : <ActionBar session={session} />}
      {session.loading ? null : <Pickers session={session} />}
    </View>
  );
}

function SettingsWarmup() {
  return (
    <View className="gap-4" pointerEvents="none">
      <SummaryWarmup />
      <SectionWarmup title="Provider" height="h-56" />
      <SectionWarmup title="Ingest" height="h-32" />
      <SectionWarmup title="Barcode" height="h-36" />
      <SectionWarmup title="Websearch" height="h-28" />
      <SectionWarmup title="Reminders" height="h-28" />
      <SectionWarmup title="App Data" height="h-28" />
    </View>
  );
}

function SummaryWarmup() {
  return (
    <View className="gap-3 border-2 border-border bg-paper p-4">
      <View className="flex-row gap-2">
        <Block className="h-7 w-24" />
        <Block className="h-7 w-28" />
        <Block className="h-7 w-16" />
      </View>
      <Block className="h-4 w-2/3" />
      <Block className="h-4 w-5/6" />
    </View>
  );
}

function SectionWarmup({ title, height }: { title: string; height: string }) {
  return (
    <View className={`gap-3 border-2 border-border bg-paper p-4 ${height}`}>
      <Text className="text-xs font-black uppercase tracking-wide text-muted">
        {title}
      </Text>
      <Block className="h-4 w-1/2" />
      <Block className="h-11 w-full" />
      <Block className="h-4 w-2/3" />
    </View>
  );
}

function Block({ className }: { className: string }) {
  return (
    <View className={`border-2 border-border bg-background ${className}`} />
  );
}

import { View } from "react-native";

import { AppHeader } from "@/components/ui/app-chrome";
import { Screen as ScreenContainer } from "@/components/ui/screen";

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

export function SettingsScreen() {
  const session = useSession();

  return (
    <View className="flex-1 bg-background">
      <ScreenContainer className="gap-4 pb-28">
        <AppHeader
          eyebrow="Control"
          title="Settings"
          meta="Configure extraction, ingest, and local data."
        />
        <Summary session={session} />
        <ProviderSection session={session} />
        <IngestSettingsSection session={session} />
        <BarcodeSettingsSection session={session} />
        <WebSearchSettingsSection session={session} />
        <AppDataSettingsSection session={session} />
      </ScreenContainer>
      <ActionBar session={session} />
      <Pickers session={session} />
    </View>
  );
}

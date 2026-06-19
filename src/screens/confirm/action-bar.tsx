import { Text, View } from "react-native";

import { OptionPicker } from "@/components/option-picker";
import { StickyActionBar } from "@/components/ui/app-chrome";
import { Button } from "@/components/ui/button";

import type { Session } from "./use-session";

export function ActionBar({ session }: { session: Session }) {
  return (
    <StickyActionBar className="absolute bottom-0 left-0 right-0">
      <Text className="px-1 pb-1 text-xs font-semibold text-muted">
        CSV export uses US formatting: decimal point, comma separator.
      </Text>
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={
            session.isSubmitting || session.isRetrying || session.isDiscarding
          }
          label={session.isDiscarding ? "Discarding…" : "Discard"}
          onPress={session.handleDiscard}
        />
        <Button
          variant="secondary"
          className="flex-1"
          disabled={
            session.isSubmitting || session.isRetrying || session.isDiscarding
          }
          label={session.isRetrying ? "Retrying…" : "Retry"}
          onPress={session.handleTryAgain}
        />
        <Button
          className="flex-1"
          disabled={
            session.isSubmitting || session.isRetrying || session.isDiscarding
          }
          label={session.isSubmitting ? "Processing…" : "Accept…"}
          onPress={() => session.setIsAcceptPickerOpen(true)}
        />
      </View>
    </StickyActionBar>
  );
}

export function AcceptActionPicker({ session }: { session: Session }) {
  return (
    <OptionPicker
      title="Accept Action"
      open={session.isAcceptPickerOpen}
      selectedId="upload"
      items={[
        { id: "upload", label: "Upload to endpoint" },
        { id: "export_json", label: "Export JSON" },
        { id: "export_csv", label: "Export CSV" },
      ]}
      onClose={() => session.setIsAcceptPickerOpen(false)}
      onSelect={(id) => session.performAcceptAction(id)}
    />
  );
}

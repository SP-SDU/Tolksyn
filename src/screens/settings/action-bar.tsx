import { Text, View } from "react-native";

import { StickyActionBar } from "@/components/ui/app-chrome";
import { Button } from "@/components/ui/button";

import type { Session } from "./use-session";

export function ActionBar({ session }: { session: Session }) {
  if (!session.dirty) {
    return null;
  }

  return (
    <StickyActionBar className="absolute bottom-0 left-0 right-0">
      {session.applyHint ? (
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          {session.applyHint}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          label="Cancel"
          disabled={session.saving}
          onPress={session.cancel}
        />
        <Button
          className="flex-1"
          disabled={session.saving || !session.valid}
          label={session.saving ? "Applying…" : "Apply"}
          onPress={() => session.apply()}
        />
      </View>
    </StickyActionBar>
  );
}

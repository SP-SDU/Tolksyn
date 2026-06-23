import { View } from "react-native";

import { BrutalFrame, FieldRow, StatusPill } from "@/components/ui/app-chrome";

import type { Session } from "./use-session";

export function Summary({ session }: { session: Session }) {
  return (
    <BrutalFrame className="gap-2 bg-paper">
      <View className="flex-row flex-wrap gap-2">
        <StatusPill
          label={session.providerName}
          tone={session.supported ? "success" : "warning"}
        />
        <StatusPill
          label={
            session.mode === "oauth"
              ? session.connected
                ? "OAuth Connected"
                : "OAuth Required"
              : "API Key"
          }
          tone={
            session.mode === "oauth" && !session.connected
              ? "warning"
              : "default"
          }
        />
        {session.dirty ? (
          <StatusPill label="Unsaved" tone="warning" />
        ) : (
          <StatusPill label="Saved" tone="info" />
        )}
      </View>
      <FieldRow label="Model" value={session.modelName || "None"} />
      <FieldRow
        label="Ingest"
        value={session.draft.ingest.endpointUrl || "Missing endpoint"}
        tone={session.draft.ingest.endpointUrl ? "default" : "warning"}
      />
    </BrutalFrame>
  );
}

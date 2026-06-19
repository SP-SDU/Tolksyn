import { View } from "react-native";

import { AppHeader } from "@/components/ui/app-chrome";
import { Screen as ScreenContainer } from "@/components/ui/screen";

import { AcceptActionPicker, ActionBar } from "./action-bar";
import { BarcodeEvidence } from "./barcode-evidence";
import { DiagnosticsEvidence } from "./diagnostics-evidence";
import { AttemptNotFound, MissingDraft } from "./empty-states";
import {
  StructuredRecordEditor,
  StructuredRecordPickers,
} from "./structured-record-editor";
import { Summary } from "./summary";
import { useSession } from "./use-session";

export function ConfirmScreen({ attemptId }: { attemptId: string }) {
  const session = useSession(attemptId);

  if (!session.attempt) {
    return <AttemptNotFound />;
  }

  if (!session.draft) {
    return <MissingDraft onRetry={session.handleTryAgain} />;
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenContainer className="gap-4 pb-32">
        <AppHeader
          eyebrow="Step 2"
          title="Verify"
          meta="Edit the extraction. Accept only when the record is clean."
        />
        <Summary attempt={session.attempt} />
        <StructuredRecordEditor session={session} />
        <BarcodeEvidence attempt={session.attempt} />
        <DiagnosticsEvidence attempt={session.attempt} />
      </ScreenContainer>
      <ActionBar session={session} />
      <AcceptActionPicker session={session} />
      <StructuredRecordPickers session={session} />
    </View>
  );
}

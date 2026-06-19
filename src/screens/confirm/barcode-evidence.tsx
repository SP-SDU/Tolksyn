import { Text } from "react-native";

import { BrutalFrame, FieldRow } from "@/components/ui/app-chrome";

import type { ConfirmAttempt } from "./use-session";

export function BarcodeEvidence({ attempt }: { attempt: ConfirmAttempt }) {
  const detected = attempt.extractionResult?.barcodeEnrichment.detected ?? [];
  const suggested =
    attempt.extractionResult?.barcodeEnrichment.relatedFieldSuggestions
      .eanOrUpc ?? "None";

  return (
    <BrutalFrame className="gap-3 bg-paper">
      <Text className="text-xl font-black uppercase tracking-tight text-foreground">
        Barcode
      </Text>
      <FieldRow label="Suggested EAN/UPC" value={suggested} />
      {detected.length ? (
        detected.map((barcode) => (
          <FieldRow
            key={`${barcode.type}:${barcode.data}`}
            label={barcode.type}
            value={barcode.data}
          />
        ))
      ) : (
        <Text className="text-sm font-semibold text-muted">
          No barcode was detected.
        </Text>
      )}
    </BrutalFrame>
  );
}

import type { BarcodeConflict, BarcodeHit } from "@/types/extraction";

export type SubmissionPayload = {
  schemaVersion: "tolksyn.item.v1";
  attemptId: string;
  acceptedRevision: number;
  structuredJson: Record<string, unknown>;
  barcodeEnrichment: {
    detected: BarcodeHit[];
    primary: BarcodeHit | null;
    relatedFieldSuggestions: {
      eanOrUpc: string | null;
    };
    conflicts: BarcodeConflict[];
  };
  auxiliaryText?: string;
  metadata: Record<string, unknown>;
};

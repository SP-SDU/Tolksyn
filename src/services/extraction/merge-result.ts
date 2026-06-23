import type {
  BarcodeHit,
  MergeExtractionInput,
  MergeExtractionResult,
} from "@/types/extraction";

// QR and Code128 belong in detected barcodes but must not auto-fill retail eanOrUpc.
const barcodeSuggestionTypes = new Set(["ean13", "ean8", "upc_a", "upc_e"]);

/** Conflicting EAN/UPC reads must surface on confirm instead of silently picking one. */
export function mergeExtractionResult(
  input: MergeExtractionInput,
): MergeExtractionResult {
  const detected = dedupeBarcodes(input.barcodes);
  const eanOrUpcCandidates = detected
    .filter((barcode) => barcodeSuggestionTypes.has(barcode.type))
    .map((barcode) => barcode.data);

  return {
    ...input,
    barcodeEnrichment: {
      detected,
      primary: detected[0] ?? null,
      relatedFieldSuggestions: {
        eanOrUpc: eanOrUpcCandidates[0] ?? null,
      },
      conflicts:
        eanOrUpcCandidates.length > 1
          ? [{ field: "eanOrUpc", values: eanOrUpcCandidates }]
          : [],
    },
  };
}

function dedupeBarcodes(barcodes: BarcodeHit[]): BarcodeHit[] {
  const seen = new Set<string>();
  const deduped: BarcodeHit[] = [];

  for (const barcode of barcodes) {
    const key = `${barcode.type}:${barcode.data}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(barcode);
  }

  return deduped;
}

import type { StructuredItem } from '@/types/item-schema';
import type { ExtractionPromptAttempt } from '@/api/providers/remote-extraction-types';

export type BarcodeHit = {
  type: string;
  data: string;
};

export type ExtractionMetadata = {
  provider: string;
  durationMs: number;
  imageWidth: number;
  imageHeight: number;
};

export type WebSearchEnrichment = {
  enabled: boolean;
  attempts: {
    type: 'query_planning' | 'exa_search' | 'webfetch' | 'reconciliation';
    status: 'success' | 'failed';
    prompt?: string;
    responseText?: string;
    query?: string;
    url?: string;
    excerpt?: string;
    error?: string;
  }[];
  queries: string[];
  searchResults: {
    query: string;
    output: string;
    urls: string[];
  }[];
  sources: {
    url: string;
    contentType?: string;
    excerpt: string;
  }[];
  fieldChanges: {
    field: string;
    before: string | number | null;
    after: string | number | null;
    evidenceUrls: string[];
    reason?: string;
  }[];
  conflicts: string[];
  failed: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
  durationMs: number;
};

export type MergeExtractionInput = {
  structuredJson: StructuredItem;
  barcodes: BarcodeHit[];
  auxiliaryText?: string;
  responseText?: string;
  extractionDiagnostics?: {
    failed: boolean;
    finalError?: string;
    attempts: ExtractionPromptAttempt[];
  };
  webSearchEnrichment?: WebSearchEnrichment;
  metadata: ExtractionMetadata;
};

export type BarcodeConflict = {
  field: 'eanOrUpc';
  values: string[];
};

export type MergeExtractionResult = MergeExtractionInput & {
  barcodeEnrichment: {
    detected: BarcodeHit[];
    primary: BarcodeHit | null;
    relatedFieldSuggestions: {
      eanOrUpc: string | null;
    };
    conflicts: BarcodeConflict[];
  };
};

const barcodeSuggestionTypes = new Set(['ean13', 'ean8', 'upc_a', 'upc_e']);

export function mergeExtractionResult(input: MergeExtractionInput): MergeExtractionResult {
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
      conflicts: eanOrUpcCandidates.length > 1
        ? [{ field: 'eanOrUpc', values: eanOrUpcCandidates }]
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

import type { StructuredItem } from "@/types/item-schema";

export type BarcodeHit = {
  type: string;
  data: string;
};

export type ExtractionPromptAttempt = {
  attempt: number;
  prompt: string;
  responseText?: string;
  error?: string;
};

export type RemoteExtractionProvider =
  | "remote_openai_compatible"
  | "remote_gemini"
  | "remote_openai_codex"
  | "remote_github_copilot"
  | "remote_ai_sdk";

export type RemoteExtractionResult = {
  structuredJson: StructuredItem;
  barcodes: BarcodeHit[];
  auxiliaryText?: string;
  responseText?: string;
  extractionDiagnostics?: {
    failed: boolean;
    finalError?: string;
    fallbackStructuredJson?: boolean;
    attempts: ExtractionPromptAttempt[];
  };
  metadata: {
    provider: RemoteExtractionProvider;
    durationMs: number;
    imageWidth: number;
    imageHeight: number;
  };
};

export type RemoteExtractionInput = {
  apiKey: string;
  model: string;
  images: {
    imageBase64: string;
    mimeType: string;
    width: number;
    height: number;
  }[];
  timeoutMs: number;
  prompt?: string;
  signal?: AbortSignal;
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
    type: "query_planning" | "exa_search" | "webfetch" | "reconciliation";
    status: "success" | "failed";
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
  field: "eanOrUpc";
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

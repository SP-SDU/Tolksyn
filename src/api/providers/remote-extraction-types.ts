import type { StructuredItem } from '@/types/item-schema';

export type ExtractionPromptAttempt = {
  attempt: number;
  prompt: string;
  responseText?: string;
  error?: string;
};

export type RemoteExtractionResult = {
  structuredJson: StructuredItem;
  barcodes: [];
  auxiliaryText?: string;
  responseText?: string;
  extractionDiagnostics?: {
    failed: boolean;
    finalError?: string;
    fallbackStructuredJson?: boolean;
    attempts: ExtractionPromptAttempt[];
  };
  metadata: {
    provider: 'remote_openai_compatible' | 'remote_gemini' | 'remote_openai_codex' | 'remote_github_copilot';
    durationMs: number;
    imageWidth: number;
    imageHeight: number;
  };
};

export type RemoteExtractionInput = {
  endpointUrl: string;
  apiKey: string;
  model: string;
  imageBase64: string;
  mimeType: string;
  timeoutMs: number;
  imageWidth?: number;
  imageHeight?: number;
  prompt?: string;
  signal?: AbortSignal;
};

export type FetchLike = typeof fetch;

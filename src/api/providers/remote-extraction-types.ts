import type { StructuredItem } from '@/types/item-schema';

export type RemoteExtractionResult = {
  structuredJson: StructuredItem;
  barcodes: [];
  auxiliaryText?: string;
  metadata: {
    provider: 'remote_openai_compatible' | 'remote_gemini';
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
};

export type FetchLike = typeof fetch;

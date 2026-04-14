export type ProviderKind = 'openai_compatible' | 'gemini';

export type AppSettings = {
  provider: {
    kind: ProviderKind;
    endpointUrl: string;
    model: string;
    timeoutMs: number;
    apiKey: string;
  };
  ingest: {
    endpointUrl: string;
    apiKey: string;
  };
  barcode: {
    enabled: boolean;
    allowedTypes: string[];
  };
};

export function defaultSettings(): AppSettings {
  return {
    provider: {
      kind: 'openai_compatible',
      endpointUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4.1-mini',
      timeoutMs: 6000,
      apiKey: '',
    },
    ingest: {
      endpointUrl: 'http://10.0.2.2:8787/ingest',
      apiKey: '',
    },
    barcode: {
      enabled: true,
      allowedTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr', 'pdf417'],
    },
  };
}

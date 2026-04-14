import type { ProviderAuthMode } from '@/services/provider-catalog';

export type ProviderAuth =
  | {
      type: 'api';
      key: string;
    }
  | {
      type: 'oauth';
      refresh: string;
      access: string;
      expires: number;
      accountId?: string;
      enterpriseUrl?: string;
    };

export type ProviderAuthMap = Record<string, ProviderAuth | undefined>;

export type AppSettings = {
  provider: {
    id: string;
    endpointUrl: string;
    model: string;
    modelVariant: string | null;
    timeoutMs: number;
    showExperimentalProviders: boolean;
    authModeByProvider: Record<string, ProviderAuthMode>;
    auth: ProviderAuthMap;
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
      id: 'openai',
      endpointUrl: 'https://chatgpt.com/backend-api/codex/responses',
      model: 'gpt-5.3-codex',
      modelVariant: null,
      timeoutMs: 6000,
      showExperimentalProviders: false,
      authModeByProvider: {
        openai: 'oauth',
      },
      auth: {},
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

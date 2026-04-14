import { eq } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import { settingsTable } from '@/db/schema';
import type * as schema from '@/db/schema';
import { defaultSettings, type AppSettings } from '@/types/settings';

const SETTINGS_KEY = 'tolksyn.settings';
const PROVIDER_SECRET_KEY = 'tolksyn.secret.provider_api_key';
const INGEST_SECRET_KEY = 'tolksyn.secret.ingest_api_key';

type PersistedSettings = Omit<AppSettings, 'provider' | 'ingest'> & {
  provider: Omit<AppSettings['provider'], 'apiKey'>;
  ingest: Omit<AppSettings['ingest'], 'apiKey'>;
};

type DbLike = ExpoSQLiteDatabase<typeof schema>;

export interface SecretStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem?(key: string): Promise<void>;
}

export function createSettingsRepository({
  db,
  secrets,
}: {
  db: DbLike;
  secrets: SecretStore;
}) {
  return {
    async getSettings(): Promise<AppSettings> {
      const persisted = await loadPersistedSettings(db);
      const providerApiKey = (await secrets.getItem(PROVIDER_SECRET_KEY)) ?? '';
      const ingestApiKey = (await secrets.getItem(INGEST_SECRET_KEY)) ?? '';

      return {
        ...persisted,
        provider: {
          ...persisted.provider,
          apiKey: providerApiKey,
        },
        ingest: {
          ...persisted.ingest,
          apiKey: ingestApiKey,
        },
      };
    },

    async saveSettings(settings: AppSettings): Promise<void> {
      const persisted: PersistedSettings = {
        provider: {
          kind: settings.provider.kind,
          endpointUrl: settings.provider.endpointUrl.trim(),
          model: settings.provider.model.trim(),
          timeoutMs: settings.provider.timeoutMs,
        },
        ingest: {
          endpointUrl: settings.ingest.endpointUrl.trim(),
        },
        barcode: {
          enabled: settings.barcode.enabled,
          allowedTypes: settings.barcode.allowedTypes,
        },
      };

      await upsertSetting(db, SETTINGS_KEY, JSON.stringify(persisted));
      await secrets.setItem(PROVIDER_SECRET_KEY, settings.provider.apiKey);
      await secrets.setItem(INGEST_SECRET_KEY, settings.ingest.apiKey);
    },
  };
}

async function loadPersistedSettings(db: DbLike): Promise<PersistedSettings> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY)).limit(1);
  const row = rows[0];
  if (!row) {
    const defaults = defaultSettings();
    return {
      provider: {
        kind: defaults.provider.kind,
        endpointUrl: defaults.provider.endpointUrl,
        model: defaults.provider.model,
        timeoutMs: defaults.provider.timeoutMs,
      },
      ingest: {
        endpointUrl: defaults.ingest.endpointUrl,
      },
      barcode: defaults.barcode,
    };
  }

  return JSON.parse(row.value) as PersistedSettings;
}

async function upsertSetting(db: DbLike, key: string, value: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value },
    });
}

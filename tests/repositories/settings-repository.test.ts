import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createSettingsRepository } from '@/repositories/settings-repository';

describe('settings repository', () => {
  test('defaults manufacturer web search to disabled', async () => {
    const repo = createSettingsRepository({ db: createTestDb() as any, secrets: createSecretStore() });

    const settings = await repo.getSettings();

    expect(settings.webSearch).toEqual({
      enabled: false,
    });
  });

  test('migrates legacy provider key into per-provider auth map', async () => {
    const db = createTestDb();
    const secret = createSecretStore({
      'tolksyn.secret.provider_api_key': 'legacy-provider-key',
      'tolksyn.secret.ingest_api_key': 'legacy-ingest-key',
    });

    await db.insert(schema.settingsTable).values({
      key: 'tolksyn.settings',
      value: JSON.stringify({
        provider: {
          kind: 'gemini',
          endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
          model: 'gemini-2.0-flash',
          timeoutMs: 9000,
        },
        ingest: {
          endpointUrl: 'https://example.com/ingest',
        },
        barcode: {
          enabled: true,
          allowedTypes: ['ean13'],
        },
      }),
    });

    const repo = createSettingsRepository({ db: db as any, secrets: secret });
    const settings = await repo.getSettings();

    expect(settings.provider.id).toBe('google');
    expect(settings.provider.showExperimentalProviders).toBe(false);
    expect(settings.webSearch.enabled).toBe(false);
    expect(settings.provider.auth.google).toEqual({
      type: 'api',
      key: 'legacy-provider-key',
    });
    expect(settings.ingest.apiKey).toBe('legacy-ingest-key');
  });

  test('persists provider auth in secure store and excludes secrets from sqlite settings row', async () => {
    const db = createTestDb();
    const secret = createSecretStore();
    const repo = createSettingsRepository({ db: db as any, secrets: secret });

    await repo.saveSettings({
      provider: {
        id: 'openai',
        model: ' gpt-4.1-mini ',
        modelVariant: null,
        timeoutMs: 7000,
        showExperimentalProviders: true,
        authModeByProvider: {
          openai: 'oauth',
          google: 'api',
        },
        auth: {
          openai: {
            type: 'oauth',
            refresh: 'refresh-token',
            access: 'access-token',
            expires: 1_700_000_000,
            accountId: 'org_123',
          },
          google: {
            type: 'api',
            key: 'google-key',
          },
        },
      },
      ingest: {
        endpointUrl: ' https://example.com/ingest ',
        apiKey: 'ingest-key',
      },
        barcode: {
          enabled: true,
          allowedTypes: ['ean13', 'qr'],
        },
        webSearch: {
          enabled: true,
        },
      });

    const rows = await db.select().from(schema.settingsTable).where(eq(schema.settingsTable.key, 'tolksyn.settings'));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toContain('"id":"openai"');
    expect(rows[0].value).toContain('"webSearch":{"enabled":true}');
    expect(rows[0].value).not.toContain('google-key');
    expect(rows[0].value).not.toContain('refresh-token');

    const storedAuth = await secret.getItem('tolksyn.secret.provider_auth');
    expect(storedAuth).toContain('refresh-token');
    expect(storedAuth).toContain('google-key');

    const next = await repo.getSettings();
    expect(next.provider.model).toBe('gpt-4.1-mini');
    expect(next.provider.showExperimentalProviders).toBe(true);
    expect(next.webSearch.enabled).toBe(true);
    expect(next.ingest.endpointUrl).toBe('https://example.com/ingest');
    expect(next.provider.auth.openai).toEqual({
      type: 'oauth',
      refresh: 'refresh-token',
      access: 'access-token',
      expires: 1_700_000_000,
      accountId: 'org_123',
    });
  });
});

function createTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  return db;
}

function createSecretStore(seed?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(seed ?? {}));

  return {
    async getItem(key: string): Promise<string | null> {
      return map.get(key) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      map.set(key, value);
    },
    async deleteItem(key: string): Promise<void> {
      map.delete(key);
    },
  };
}

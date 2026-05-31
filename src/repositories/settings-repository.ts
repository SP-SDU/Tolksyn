import { eq } from "drizzle-orm";
import type { ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { Platform } from "react-native";

import type * as schema from "@/db/schema";
import { settingsTable } from "@/db/schema";
import { createProviderCatalog } from "@/services/provider-catalog";
import {
  defaultSettings,
  type AppSettings,
  type ProviderAuthMap,
} from "@/types/settings";

const SETTINGS_KEY = "tolksyn.settings";
const WEB_SETTINGS_KEY = "tolksyn.settings.web";
const PROVIDER_SECRET_KEY = "tolksyn.secret.provider_api_key";
const PROVIDER_AUTH_SECRET_KEY = "tolksyn.secret.provider_auth";
const INGEST_SECRET_KEY = "tolksyn.secret.ingest_api_key";

type PersistedProvider = {
  id: string;
  model: string;
  modelVariant?: string | null;
  timeoutMs: number;
  showExperimentalProviders?: boolean;
  authModeByProvider: Record<string, "api" | "oauth">;
};

type PersistedSettings = {
  provider: PersistedProvider;
  ingest: {
    endpointUrl: string;
  };
  barcode: AppSettings["barcode"];
  webSearch: AppSettings["webSearch"];
};

type LegacyProvider = {
  kind?: "openai_compatible" | "gemini";
  id?: string;
  endpointUrl?: string;
  model?: string;
  modelVariant?: string | null;
  timeoutMs?: number;
  showExperimentalProviders?: boolean;
  authModeByProvider?: Record<string, "api" | "oauth">;
};

type LegacyPersistedSettings = {
  provider?: LegacyProvider;
  ingest?: {
    endpointUrl?: string;
  };
  barcode?: AppSettings["barcode"];
  webSearch?: AppSettings["webSearch"];
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
  catalog,
}: {
  db: DbLike;
  secrets: SecretStore;
  catalog?: ReturnType<typeof createProviderCatalog>;
}) {
  const providerCatalog = catalog ?? createProviderCatalog({ secrets, fetch });

  return {
    async getSettings(): Promise<AppSettings> {
      const persisted = await loadPersisted(db, secrets, providerCatalog);
      const auth = await loadAuth(secrets);
      const id = persisted.provider.id;
      const mode =
        persisted.provider.authModeByProvider[id] ??
        providerCatalog.authMode(id);
      const ingestApiKey = (await secrets.getItem(INGEST_SECRET_KEY)) ?? "";

      return {
        provider: {
          id,
          model: persisted.provider.model,
          modelVariant: persisted.provider.modelVariant ?? null,
          timeoutMs: persisted.provider.timeoutMs,
          showExperimentalProviders:
            persisted.provider.showExperimentalProviders ?? false,
          authModeByProvider: {
            ...persisted.provider.authModeByProvider,
            [id]: mode,
          },
          auth,
        },
        ingest: {
          endpointUrl: persisted.ingest.endpointUrl,
          apiKey: ingestApiKey,
        },
        barcode: persisted.barcode,
        webSearch: persisted.webSearch,
      };
    },

    async saveSettings(settings: AppSettings): Promise<void> {
      const id = settings.provider.id;
      const mode =
        settings.provider.authModeByProvider[id] ??
        providerCatalog.authMode(id);
      const auth = cleanAuth(settings.provider.auth, id, mode);
      const persisted: PersistedSettings = {
        provider: {
          id,
          model: settings.provider.model.trim(),
          modelVariant: settings.provider.modelVariant,
          timeoutMs: settings.provider.timeoutMs,
          showExperimentalProviders: Boolean(
            settings.provider.showExperimentalProviders,
          ),
          authModeByProvider: {
            ...settings.provider.authModeByProvider,
            [id]: mode,
          },
        },
        ingest: {
          endpointUrl: settings.ingest.endpointUrl.trim(),
        },
        barcode: {
          enabled: settings.barcode.enabled,
          allowedTypes: settings.barcode.allowedTypes,
        },
        webSearch: {
          enabled: settings.webSearch.enabled,
        },
      };

      if (Platform.OS === "web") {
        await secrets.setItem(WEB_SETTINGS_KEY, JSON.stringify(persisted));
      } else {
        await upsertSetting(db, SETTINGS_KEY, JSON.stringify(persisted));
      }
      await saveAuth(secrets, auth);
      await secrets.setItem(INGEST_SECRET_KEY, settings.ingest.apiKey);
    },
  };
}

async function loadPersisted(
  db: DbLike,
  secrets: SecretStore,
  catalog: ReturnType<typeof createProviderCatalog>,
): Promise<PersistedSettings> {
  const web = await secrets.getItem(WEB_SETTINGS_KEY);
  const parsedWeb = await parsePersisted(web, secrets, catalog);
  if (Platform.OS === "web" && parsedWeb) {
    return parsedWeb;
  }

  let rowValue: string | null = null;
  try {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, SETTINGS_KEY))
      .limit(1);
    rowValue = rows[0]?.value ?? null;
  } catch {
    rowValue = null;
  }

  const parsedDb = await parsePersisted(rowValue, secrets, catalog);
  if (parsedDb) {
    if (Platform.OS === "web") {
      await secrets.setItem(WEB_SETTINGS_KEY, JSON.stringify(parsedDb));
    }

    return parsedDb;
  }

  if (parsedWeb) {
    return parsedWeb;
  }

  return fromDefaults();
}

async function parsePersisted(
  rawValue: string | null,
  secrets: SecretStore,
  catalog: ReturnType<typeof createProviderCatalog>,
): Promise<PersistedSettings | null> {
  if (!rawValue) {
    return null;
  }

  let raw: LegacyPersistedSettings;
  try {
    raw = JSON.parse(rawValue) as LegacyPersistedSettings;
  } catch {
    return null;
  }

  const defaults = fromDefaults();
  const id = raw.provider?.id ?? mapLegacyId(raw.provider?.kind);
  const mode = raw.provider?.authModeByProvider?.[id] ?? catalog.authMode(id);
  const providerDefaults = await catalog.defaultsFor(id, mode);
  const migrated: PersistedSettings = {
    provider: {
      id,
      model: raw.provider?.model ?? providerDefaults.model,
      modelVariant:
        raw.provider?.modelVariant ?? defaults.provider.modelVariant,
      timeoutMs: raw.provider?.timeoutMs ?? defaults.provider.timeoutMs,
      showExperimentalProviders:
        raw.provider?.showExperimentalProviders ??
        defaults.provider.showExperimentalProviders,
      authModeByProvider: {
        ...defaults.provider.authModeByProvider,
        ...(raw.provider?.authModeByProvider ?? {}),
        [id]: mode,
      },
    },
    ingest: {
      endpointUrl: raw.ingest?.endpointUrl ?? defaults.ingest.endpointUrl,
    },
    barcode: raw.barcode ?? defaults.barcode,
    webSearch: raw.webSearch ?? defaults.webSearch,
  };

  await migrateLegacyApiSecret(secrets, id);

  return migrated;
}

async function migrateLegacyApiSecret(
  secrets: SecretStore,
  id: string,
): Promise<void> {
  const legacy = await secrets.getItem(PROVIDER_SECRET_KEY);
  if (!legacy?.trim()) {
    return;
  }

  const auth = await loadAuth(secrets);
  if (auth[id]) {
    return;
  }

  auth[id] = {
    type: "api",
    key: legacy,
  };
  await saveAuth(secrets, auth);
}

function fromDefaults(): PersistedSettings {
  const defaults = defaultSettings();

  return {
    provider: {
      id: defaults.provider.id,
      model: defaults.provider.model,
      modelVariant: defaults.provider.modelVariant,
      timeoutMs: defaults.provider.timeoutMs,
      showExperimentalProviders: defaults.provider.showExperimentalProviders,
      authModeByProvider: defaults.provider.authModeByProvider,
    },
    ingest: {
      endpointUrl: defaults.ingest.endpointUrl,
    },
    barcode: defaults.barcode,
    webSearch: defaults.webSearch,
  };
}

function mapLegacyId(kind: "openai_compatible" | "gemini" | undefined): string {
  if (kind === "gemini") {
    return "google";
  }

  return "openai";
}

function cleanAuth(
  map: ProviderAuthMap,
  id: string,
  mode: "api" | "oauth",
): ProviderAuthMap {
  const next: ProviderAuthMap = { ...map };
  const auth = next[id];
  if (!auth) {
    return next;
  }

  if (mode === "api") {
    if (auth.type !== "api" || !auth.key.trim()) {
      delete next[id];
    }
    return next;
  }

  if (auth.type !== "oauth") {
    delete next[id];
  }

  return next;
}

async function loadAuth(secrets: SecretStore): Promise<ProviderAuthMap> {
  const raw = await secrets.getItem(PROVIDER_AUTH_SECRET_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as ProviderAuthMap;
  } catch {
    return {};
  }
}

async function saveAuth(
  secrets: SecretStore,
  auth: ProviderAuthMap,
): Promise<void> {
  const keys = Object.keys(auth).filter((key) => auth[key]);
  if (!keys.length) {
    if (secrets.deleteItem) {
      await secrets.deleteItem(PROVIDER_AUTH_SECRET_KEY);
    }
    return;
  }

  await secrets.setItem(PROVIDER_AUTH_SECRET_KEY, JSON.stringify(auth));
}

async function upsertSetting(
  db: DbLike,
  key: string,
  value: string,
): Promise<void> {
  await db.insert(settingsTable).values({ key, value }).onConflictDoUpdate({
    target: settingsTable.key,
    set: { value },
  });
}

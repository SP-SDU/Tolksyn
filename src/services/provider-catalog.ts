import {
  copilotBase,
  copilotModelHeaders,
  exchangeGitHubCopilotToken,
  normalizeEnterpriseDomain,
} from "github-copilot-oauth";
import { Platform } from "react-native";

import type { SecretStore } from "@/repositories/settings-repository";

export type ProviderAuthMode = "api" | "oauth";

export type ProviderModel = {
  id: string;
  name: string;
  variants: string[];
  supportsImage: boolean;
  releaseDate: string;
};

export type ProviderItem = {
  id: string;
  name: string;
  api?: string;
  models: ProviderModel[];
};

type CacheData = {
  fetchedAt: number;
  providers: ProviderItem[];
};

type ModelsDevProvider = {
  id: string;
  name: string;
  api?: string;
  models: Record<
    string,
    {
      id: string;
      name: string;
      release_date: string;
      reasoning: boolean;
      status?: "alpha" | "beta" | "deprecated";
      provider?: {
        npm?: string;
      };
    }
  >;
};

const CATALOG_URL = "https://models.dev/api.json";
const CACHE_KEY = "tolksyn.settings.provider_catalog";
const WEB_CACHE_KEY = "tolksyn.settings.provider_catalog.web";
const PROVIDER_AUTH_SECRET_KEY = "tolksyn.secret.provider_auth";
const TTL_MS = 1000 * 60 * 5;

/** models.dev changes often, and cache keeps settings responsive when the catalog fetch fails. */
const AUTH_METHODS: Record<string, ProviderAuthMode[]> = {
  openai: ["api", "oauth"],
  "github-copilot": ["oauth"],
};

const DEFAULT_PROVIDER_IDS = new Set([
  "openai",
  "google",
  "anthropic",
  "github-copilot",
]);

const SUPPORTED_EXTRACTION_PROVIDER_IDS = new Set([
  "openai",
  "google",
  "anthropic",
  "github-copilot",
]);

const FALLBACK_DEFAULTS = {
  openai: {
    model: "gpt-4.1-mini",
  },
  anthropic: {
    model: "claude-sonnet-4-0",
  },
  google: {
    model: "gemini-2.0-flash",
  },
  "github-copilot": {
    model: "gpt-4.1",
  },
} as const;

const FALLBACK_PROVIDERS: ProviderItem[] = [
  {
    id: "openai",
    name: "OpenAI",
    api: "https://api.openai.com/v1/chat/completions",
    models: [
      {
        id: "gpt-4.1-mini",
        name: "GPT-4.1 Mini",
        variants: ["minimal", "low", "medium", "high", "xhigh"],
        supportsImage: true,
        releaseDate: "2025-01-01",
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    api: "https://api.anthropic.com/v1/messages",
    models: [
      {
        id: "claude-sonnet-4-0",
        name: "Claude Sonnet 4",
        variants: ["low", "medium", "high"],
        supportsImage: true,
        releaseDate: "2025-01-01",
      },
    ],
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    api: "https://api.githubcopilot.com/chat/completions",
    models: [
      {
        id: "gpt-4.1",
        name: "GPT-4.1",
        variants: ["low", "medium", "high"],
        supportsImage: true,
        releaseDate: "2025-01-01",
      },
    ],
  },
  {
    id: "google",
    name: "Google",
    api: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    models: [
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        variants: ["low", "high"],
        supportsImage: true,
        releaseDate: "2025-01-01",
      },
    ],
  },
];

function defaults(providerId: string): { model: string } {
  const value = (
    FALLBACK_DEFAULTS as Record<string, { model: string } | undefined>
  )[providerId];
  if (value) {
    return value;
  }

  return FALLBACK_DEFAULTS.openai;
}

export function fallbackProviderModel(providerId: string): string {
  return defaults(providerId).model;
}

export function fallbackProviderSnapshot(): ProviderItem[] {
  return FALLBACK_PROVIDERS;
}

function authMethods(providerId: string): ProviderAuthMode[] {
  return AUTH_METHODS[providerId] ?? ["api"];
}

function authMode(providerId: string): ProviderAuthMode {
  return authMethods(providerId)[0];
}

function isSupportedProvider(providerId: string): boolean {
  return SUPPORTED_EXTRACTION_PROVIDER_IDS.has(providerId);
}

export function isExperimentalProvider(providerId: string): boolean {
  return !DEFAULT_PROVIDER_IDS.has(providerId);
}

function variantsForModel(
  providerId: string,
  model: ModelsDevProvider["models"][string],
): string[] {
  if (!model.reasoning) {
    return [];
  }

  const id = model.id.toLowerCase();
  const npm = model.provider?.npm ?? "";

  if (
    providerId === "google" ||
    npm === "@ai-sdk/google" ||
    npm === "@ai-sdk/google-vertex"
  ) {
    if (id.includes("3.1")) {
      return ["low", "medium", "high"];
    }

    if (id.includes("2.5")) {
      return ["high", "max"];
    }

    return ["low", "high"];
  }

  if (providerId === "github-copilot") {
    if (id.includes("gpt-5") && model.release_date >= "2025-12-04") {
      return ["low", "medium", "high", "xhigh"];
    }

    return ["low", "medium", "high"];
  }

  if (providerId === "openai") {
    if (id.includes("gpt-5")) {
      const variants = ["minimal", "low", "medium", "high"];
      if (model.release_date >= "2025-12-04") {
        variants.push("xhigh");
      }
      return variants;
    }

    return ["low", "medium", "high"];
  }

  return ["low", "medium", "high"];
}

function normalizeProviders(
  raw: Record<string, ModelsDevProvider>,
): ProviderItem[] {
  return Object.values(raw)
    .map((provider) => {
      const models = Object.values(provider.models)
        .filter((model) => model.status !== "deprecated")
        .filter(
          (model) =>
            !(provider.id === "openai" && model.id.startsWith("gpt-4.1")),
        )
        .map((model) => ({
          id: model.id,
          name: model.name,
          variants: variantsForModel(provider.id, model),
          supportsImage: supportsImageInput(model),
          releaseDate: model.release_date,
        }))
        .sort((a, b) => compareModels(provider.id, a, b));

      return {
        id: provider.id,
        name: provider.name,
        api: provider.api,
        models,
      };
    })
    .filter((provider) => provider.models.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function supportsImageInput(
  model: ModelsDevProvider["models"][string],
): boolean {
  const typed = model as {
    modalities?: {
      input?: string[];
    };
    attachment?: boolean;
  };

  if (typed.modalities?.input?.includes("image")) {
    return true;
  }

  if (typed.attachment === true) {
    return true;
  }

  return false;
}

function compareModels(
  providerId: string,
  left: ProviderModel,
  right: ProviderModel,
): number {
  if (providerId === "openai") {
    const leftCodex = isOpenAIOAuthModel(left.id);
    const rightCodex = isOpenAIOAuthModel(right.id);
    if (leftCodex !== rightCodex) {
      return leftCodex ? -1 : 1;
    }

    if (left.releaseDate !== right.releaseDate) {
      return right.releaseDate.localeCompare(left.releaseDate);
    }
  }

  return left.name.localeCompare(right.name);
}

function isOpenAIOAuthModel(modelId: string): boolean {
  const id = modelId.toLowerCase();

  if (!id.startsWith("gpt-")) {
    return false;
  }

  const versionPart = id.slice(4);
  const versionNumber = parseInt(versionPart.split("-")[0], 10);
  if (isNaN(versionNumber) || versionNumber < 5) {
    return false;
  }

  if (id.includes("chat") || id.includes("image")) {
    return false;
  }

  return true;
}

function filterModels(
  providerId: string,
  mode: ProviderAuthMode | undefined,
  models: ProviderModel[],
): ProviderModel[] {
  if (providerId === "openai" && mode === "oauth") {
    return models.filter((model) => isOpenAIOAuthModel(model.id));
  }

  return models;
}

type StoredAuth = {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  enterpriseUrl?: string;
};

async function loadProviderAuth(
  secrets: SecretStore,
): Promise<Record<string, StoredAuth | undefined>> {
  const raw = await secrets.getItem(PROVIDER_AUTH_SECRET_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, StoredAuth | undefined>;
  } catch {
    return {};
  }
}

type CopilotResponse = {
  data: {
    model_picker_enabled: boolean;
    id: string;
    name: string;
    version: string;
    supported_endpoints?: string[];
    capabilities: {
      supports: {
        vision?: boolean;
      };
      limits: {
        vision?: {
          supported_media_types?: string[];
        };
      };
    };
  }[];
};

function copilotReleaseDate(version: string, id: string): string {
  const prefix = `${id}-`;
  if (version.startsWith(prefix)) {
    return version.slice(prefix.length);
  }

  return "";
}

async function loadCached(secrets: SecretStore): Promise<CacheData | null> {
  const key = Platform.OS === "web" ? WEB_CACHE_KEY : CACHE_KEY;
  const raw = await secrets.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as CacheData;
  } catch {
    return null;
  }
}

async function saveCached(
  secrets: SecretStore,
  data: CacheData,
): Promise<void> {
  const value = JSON.stringify(data);
  await secrets.setItem(CACHE_KEY, value);
  await secrets.setItem(WEB_CACHE_KEY, value);
}

async function fetchProviders(fetcher: typeof fetch): Promise<ProviderItem[]> {
  const response = await fetcher(CATALOG_URL);
  if (!response.ok) {
    throw new Error(`models.dev request failed (${response.status})`);
  }

  const raw = (await response.json()) as Record<string, ModelsDevProvider>;
  return normalizeProviders(raw);
}

export function createProviderCatalog({
  secrets,
  fetch,
  now,
}: {
  secrets: SecretStore;
  fetch: typeof globalThis.fetch;
  now?: () => number;
}) {
  const getNow = now ?? (() => Date.now());
  let memory: CacheData | null = null;
  let inflight: Promise<ProviderItem[]> | null = null;

  async function copilotModels(
    provider: ProviderItem,
  ): Promise<ProviderModel[]> {
    const auth = await loadProviderAuth(secrets);
    const token = auth["github-copilot"];
    const refreshToken = token?.refresh?.trim() || token?.access?.trim();
    if (!refreshToken) {
      return provider.models;
    }
    const enterpriseUrl = token?.enterpriseUrl;

    try {
      const request = await copilotModelsRequest(
        fetch,
        refreshToken,
        enterpriseUrl,
      );
      const response = await fetch(request.url, {
        headers: request.headers,
      });

      if (!response.ok) {
        return provider.models;
      }

      const payload = (await response.json()) as CopilotResponse;
      const map = new Map(
        payload.data
          .filter((item) => item.model_picker_enabled)
          .map((item) => [item.id, item] as const),
      );

      const merged = provider.models
        .filter((model) => map.has(model.id))
        .map((model) => {
          const remote = map.get(model.id);
          const supportsImage =
            Boolean(remote?.capabilities.supports.vision) ||
            Boolean(
              remote?.capabilities.limits.vision?.supported_media_types?.some(
                (item) => item.startsWith("image/"),
              ),
            );
          return {
            ...model,
            name: remote?.name ?? model.name,
            supportsImage,
            releaseDate: remote
              ? copilotReleaseDate(remote.version, remote.id)
              : model.releaseDate,
          };
        });

      return merged.sort((a, b) => compareModels("github-copilot", a, b));
    } catch {
      return provider.models;
    }
  }

  async function provider(
    providerId: string,
    mode?: ProviderAuthMode,
  ): Promise<ProviderItem | undefined> {
    const item = await byId(providerId);
    if (!item) {
      return undefined;
    }

    const models =
      providerId === "github-copilot" ? await copilotModels(item) : item.models;
    const filtered = filterModels(providerId, mode, models);

    return {
      ...item,
      models: filtered,
    };
  }

  async function all(force = false): Promise<ProviderItem[]> {
    if (!force && memory && getNow() - memory.fetchedAt < TTL_MS) {
      return memory.providers;
    }

    const cached = await loadCached(secrets);
    if (!force && cached && getNow() - cached.fetchedAt < TTL_MS) {
      memory = cached;
      return cached.providers;
    }

    if (!force && inflight) {
      return inflight;
    }

    const request = (async () => {
      try {
        const providers = await fetchProviders(fetch);
        memory = {
          fetchedAt: getNow(),
          providers,
        };
        await saveCached(secrets, memory);
        return providers;
      } catch {
        if (cached) {
          memory = cached;
          return cached.providers;
        }

        return FALLBACK_PROVIDERS;
      }
    })();

    inflight = request;

    try {
      return await request;
    } finally {
      if (inflight === request) inflight = null;
    }
  }

  async function snapshot(): Promise<ProviderItem[]> {
    if (memory) {
      return memory.providers;
    }

    const cached = await loadCached(secrets);
    if (cached) {
      memory = cached;
      return cached.providers;
    }

    return FALLBACK_PROVIDERS;
  }

  async function byId(providerId: string): Promise<ProviderItem | undefined> {
    const providers = await all();
    return providers.find((provider) => provider.id === providerId);
  }

  async function defaultsFor(
    providerId: string,
    mode?: ProviderAuthMode,
  ): Promise<{ model: string }> {
    const fallback = defaults(providerId);
    const item = await provider(providerId, mode);
    if (!item) {
      return {
        model: fallback.model,
      };
    }

    const model = item.models[0]?.id ?? fallback.model;
    return {
      model,
    };
  }

  async function modelOptions(
    providerId: string,
    mode?: ProviderAuthMode,
  ): Promise<ProviderModel[]> {
    const item = await provider(providerId, mode);
    return item?.models ?? [];
  }

  async function thinkingLevels(
    providerId: string,
    modelId: string,
    mode?: ProviderAuthMode,
  ): Promise<string[]> {
    const models = await modelOptions(providerId, mode);
    return models.find((model) => model.id === modelId)?.variants ?? [];
  }

  async function supportsImage(
    providerId: string,
    modelId: string,
    mode?: ProviderAuthMode,
  ): Promise<boolean> {
    const models = await modelOptions(providerId, mode);
    return models.find((model) => model.id === modelId)?.supportsImage ?? false;
  }

  return {
    all,
    fallbackSnapshot: fallbackProviderSnapshot,
    snapshot,
    byId,
    defaultsFor,
    modelOptions,
    thinkingLevels,
    supportsImage,
    authMethods,
    authMode,
    isSupportedProvider,
  };
}

async function copilotModelsRequest(
  fetcher: typeof fetch,
  refreshToken: string,
  enterpriseUrl?: string,
): Promise<{ url: string; headers: Record<string, string> }> {
  const domain = normalizeEnterpriseDomain(enterpriseUrl);
  if (
    typeof window !== "undefined" &&
    typeof window.location?.origin === "string"
  ) {
    const origin = window.location.origin.replace(/\/$/, "");
    const url = new URL(`${origin}/api/proxy/github-copilot/models`);
    if (domain) {
      url.searchParams.set("enterpriseUrl", domain);
    }

    return {
      url: url.toString(),
      headers: {
        authorization: `Bearer ${refreshToken}`,
        ...(domain ? { "x-copilot-enterprise-url": domain } : {}),
      },
    };
  }

  const exchanged = await exchangeGitHubCopilotToken({
    fetch: fetcher,
    githubToken: refreshToken,
    enterpriseUrl,
  });

  return {
    url: `${copilotBase(enterpriseUrl)}/models`,
    headers: copilotModelHeaders(exchanged.token),
  };
}

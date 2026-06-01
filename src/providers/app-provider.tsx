import type {
  AgentQueryCrawlInput,
  AgentQueryCrawlResult,
} from "agent-query-crawl";
import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
import * as ImagePicker from "expo-image-picker";
import * as Network from "expo-network";
import { useSQLiteContext } from "expo-sqlite";
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { Platform } from "react-native";

import { createIngestTransport } from "@/api/ingest-transport";
import { createDb } from "@/db/client";
import { attemptsTable, queueItemsTable, settingsTable } from "@/db/schema";
import { clearWebKeys, secureSecretStore } from "@/db/secure-store";
import { createAttemptRepository } from "@/repositories/attempt-repository";
import { createQueueRepository } from "@/repositories/queue-repository";
import { createSettingsRepository } from "@/repositories/settings-repository";
import { createBarcodeDetector } from "@/services/barcode-detector";
import { processImage } from "@/services/capture-pipeline";
import { createExportService } from "@/services/export-service";
import { importFromGallery } from "@/services/gallery-import";
import { createImageStore } from "@/services/image-store";
import { createManufacturerWebSearchEnricher } from "@/services/manufacturer-websearch";
import { createProviderCatalog } from "@/services/provider-catalog";
import { createProviderOAuth } from "@/services/provider-oauth";
import { drainQueue } from "@/services/queue-worker";
import { createSubmissionService } from "@/services/submission-service";
import { buildIdempotencyKey } from "@/utils/idempotency";
import type { BarcodeHit } from "@/utils/merge-extraction-result";
import { computeRetryDelayMs } from "@/utils/retry-policy";

type RemoteExtractor = ReturnType<
  (typeof import("@/api/remote-extractor"))["createRemoteExtractor"]
>;

const AppRuntimeContext = createContext<ReturnType<
  typeof createRuntime
> | null>(null);

/** Heavy AI modules load here so tab screens stay fast and tests can inject mocks. */
export function AppRuntimeProvider({ children }: React.PropsWithChildren) {
  const sqlite = useSQLiteContext();
  useDrizzleStudio(sqlite);
  const runtime = useMemo(() => createRuntime(sqlite), [sqlite]);

  useEffect(() => {
    startTransition(() => {
      void runtime.syncQueue();
    });

    const subscription = Network.addNetworkStateListener((state) => {
      if (state.isInternetReachable || state.isConnected) {
        startTransition(() => {
          void runtime.syncQueue();
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [runtime]);

  return (
    <AppRuntimeContext.Provider value={runtime}>
      {children}
    </AppRuntimeContext.Provider>
  );
}

export function useAppRuntime() {
  const runtime = useContext(AppRuntimeContext);
  if (!runtime) {
    throw new Error("useAppRuntime must be used within AppRuntimeProvider.");
  }

  return runtime;
}

function createRuntime(sqlite: Parameters<typeof createDb>[0]) {
  const db = createDb(sqlite);
  const imageStore = createImageStore();
  const attempts = createAttemptRepository(db, sqlite, {
    onDelete: (id) => imageStore.deleteAttemptImages(id),
    onPrune: async (ids) => {
      await Promise.all(ids.map((id) => imageStore.deleteAttemptImages(id)));
    },
  });
  const queue = createQueueRepository(db);
  const catalog = createProviderCatalog({
    secrets: secureSecretStore,
    fetch,
  });
  const settings = createSettingsRepository({
    db,
    secrets: secureSecretStore,
    catalog,
  });
  const barcodeDetector = createBarcodeDetector();
  const exportService = createExportService();
  let loadedExtractor: RemoteExtractor | null = null;
  let loadedQueryCrawl: Promise<{
    query(input: AgentQueryCrawlInput): Promise<AgentQueryCrawlResult>;
  }> | null = null;
  const extractor: RemoteExtractor = {
    async extract(input) {
      // First extraction pays the AI SDK bundle cost, and deferring keeps tab launch responsive.
      if (!loadedExtractor) {
        const { createRemoteExtractor } =
          await import("@/api/remote-extractor");
        loadedExtractor = createRemoteExtractor(settings);
      }

      return loadedExtractor.extract(input);
    },
  };
  const queryCrawl = {
    async query(input: AgentQueryCrawlInput) {
      loadedQueryCrawl ??= import("agent-query-crawl").then(
        ({ createAgentQueryCrawl }) =>
          createAgentQueryCrawl({
            fetch,
            search: {
              // Exa MCP is blocked cross-origin from the browser, so the dev-server proxy carries auth.
              proxyBaseUrl:
                Platform.OS === "web" ? "/api/proxy/exa/mcp" : undefined,
            },
            webFetch: {
              proxyBaseUrl:
                Platform.OS === "web" ? "/api/proxy/webfetch" : undefined,
            },
          }),
      );

      return (await loadedQueryCrawl).query(input);
    },
  };
  const webSearchEnricher = createManufacturerWebSearchEnricher({
    settings,
    extractor,
    queryCrawl,
  });
  const oauth = createProviderOAuth({ fetch });
  const transport = createIngestTransport(settings);
  const submissionService = createSubmissionService({
    attempts,
    queue,
    transport: {
      submit: ({ idempotencyKey, payload }) =>
        transport.submit({
          idempotencyKey,
          payload,
        }),
    },
    network: {
      async isOnline() {
        const state = await Network.getNetworkStateAsync();
        return Boolean(
          state.isConnected && state.isInternetReachable !== false,
        );
      },
    },
    createIdempotencyKey: buildIdempotencyKey,
    now: () => Date.now(),
  });

  return {
    attempts,
    queue,
    settings,
    providerCatalog: catalog,
    oauth,
    exportService,

    async importFromGallery() {
      return importFromGallery({
        requestPermission: ImagePicker.requestMediaLibraryPermissionsAsync,
        launchPicker: () =>
          ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 1,
            allowsEditing: false,
            allowsMultipleSelection: true,
          }),
      });
    },

    async processImages(options: {
      source: "camera" | "gallery";
      inputUris: string[];
      liveBarcodes?: BarcodeHit[];
      signal?: AbortSignal;
      onProgress?: Parameters<typeof processImage>[0]["onProgress"];
    }) {
      const appSettings = await settings.getSettings();
      return processImage({
        ...options,
        now: () => Date.now(),
        createAttemptId: () =>
          `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        imageStore,
        attempts,
        barcodeDetector: {
          detect: ({ imageUris }) =>
            appSettings.barcode.enabled
              ? Promise.all(
                  imageUris.map((imageUri) =>
                    barcodeDetector.detect({
                      imageUri,
                      allowedTypes: appSettings.barcode.allowedTypes,
                    }),
                  ),
                ).then((results) => results.flat())
              : Promise.resolve([]),
        },
        extractor,
        webSearchEnricher,
      });
    },

    async submitAttempt(
      input: Parameters<typeof submissionService.acceptAttempt>[0],
    ) {
      return submissionService.acceptAttempt(input);
    },

    async syncQueue() {
      await drainQueue({
        now: Date.now(),
        repository: queue,
        transport,
        computeDelayMs: (retryCount) =>
          computeRetryDelayMs({ retryCount, random: Math.random }),
      });
    },

    async clearLocalData() {
      try {
        await db.delete(queueItemsTable);
      } catch {}
      try {
        await db.delete(attemptsTable);
      } catch {}
      try {
        await db.delete(settingsTable);
      } catch {}
      try {
        await imageStore.deleteAllImages();
      } catch {}

      const secretKeys = [
        "tolksyn.settings.web",
        "tolksyn.secret.provider_api_key",
        "tolksyn.secret.provider_auth",
        "tolksyn.secret.ingest_api_key",
        "tolksyn.settings.provider_catalog",
        "tolksyn.settings.provider_catalog.web",
      ];

      if (secureSecretStore.deleteItem) {
        for (const key of secretKeys) {
          try {
            await secureSecretStore.deleteItem(key);
          } catch {}
        }
      }

      await clearWebKeys("tolksyn.");
    },
  };
}

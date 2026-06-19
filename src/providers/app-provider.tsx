import type {
  AgentQueryCrawlInput,
  AgentQueryCrawlResult,
} from "agent-query-crawl";
import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
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
import { createProviderCatalog } from "@/services/provider-catalog";
import { computeRetryDelayMs } from "@/services/queue-retry-policy";
import { drainQueue } from "@/services/queue-worker";
import { buildSubmissionIdempotencyKey } from "@/services/submission-idempotency";
import { createSubmissionService } from "@/services/submission-service";
import type { BarcodeHit } from "@/types/extraction";

type CaptureProgressStage =
  | "persisted"
  | "barcode_started"
  | "barcode_done"
  | "extraction_started"
  | "extraction_done"
  | "websearch_started"
  | "websearch_done";

type ImageStore = {
  persistImages(input: { inputUris: string[]; attemptId: string }): Promise<
    {
      imageUri: string;
      thumbnailUri: string;
      imageBase64: string;
      mimeType: string;
      width: number;
      height: number;
    }[]
  >;
  deleteAttemptImages(attemptId: string): Promise<void>;
  deleteAllImages(): Promise<void>;
};

type RemoteExtractor = ReturnType<
  (typeof import("@/services/extraction/remote-extractor"))["createRemoteExtractor"]
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
  let loadedImageStore: Promise<ImageStore> | null = null;
  const getImageStore = () => {
    loadedImageStore ??= import("@/services/image-store").then(
      ({ createImageStore }) => createImageStore(),
    );
    return loadedImageStore;
  };
  const imageStore: ImageStore = {
    async persistImages(input) {
      return (await getImageStore()).persistImages(input);
    },
    async deleteAttemptImages(attemptId) {
      return (await getImageStore()).deleteAttemptImages(attemptId);
    },
    async deleteAllImages() {
      return (await getImageStore()).deleteAllImages();
    },
  };
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
  const exportService = {
    async exportJson(payload: any): Promise<void> {
      const { createExportService } = await import("@/services/export-service");
      return createExportService().exportJson(payload);
    },
    async exportCsv(attemptId: string, item: any): Promise<void> {
      const { createExportService } = await import("@/services/export-service");
      return createExportService().exportCsv(attemptId, item);
    },
  };
  let loadedExtractor: RemoteExtractor | null = null;
  let loadedBarcodeDetector: {
    detect(input: {
      imageUri: string;
      allowedTypes?: string[];
    }): Promise<BarcodeHit[]>;
  } | null = null;
  let loadedWebSearchEnricher: { enrich(input: any): Promise<any> } | null =
    null;
  let loadedOAuth: {
    start(providerId: string, options?: { enterpriseUrl?: string }): Promise<any>;
  } | null = null;
  let loadedQueryCrawl: Promise<{
    query(input: AgentQueryCrawlInput): Promise<AgentQueryCrawlResult>;
  }> | null = null;
  const getBarcodeDetector = async () => {
    if (!loadedBarcodeDetector) {
      const { createBarcodeDetector } = await import(
        "@/services/barcode-detector"
      );
      loadedBarcodeDetector = createBarcodeDetector();
    }

    return loadedBarcodeDetector;
  };
  const extractor: RemoteExtractor = {
    async extract(input) {
      // First extraction pays the AI SDK bundle cost, and deferring keeps tab launch responsive.
      if (!loadedExtractor) {
        const { createRemoteExtractor } =
          await import("@/services/extraction/remote-extractor");
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
  const webSearchEnricher = {
    async enrich(input: any): Promise<any> {
      if (!loadedWebSearchEnricher) {
        const { createManufacturerWebSearchEnricher } = await import(
          "@/services/manufacturer-websearch"
        );
        loadedWebSearchEnricher = createManufacturerWebSearchEnricher({
          settings,
          extractor,
          queryCrawl,
        });
      }

      return loadedWebSearchEnricher.enrich(input);
    },
  };
  const oauth = {
    async start(providerId: string, options?: { enterpriseUrl?: string }) {
      if (!loadedOAuth) {
        const { createProviderOAuth } = await import(
          "@/services/provider-oauth"
        );
        loadedOAuth = createProviderOAuth({ fetch });
      }

      return loadedOAuth.start(providerId, options);
    },
  };
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
    createIdempotencyKey: buildSubmissionIdempotencyKey,
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
      const [{ importFromGallery }, ImagePicker] = await Promise.all([
        import("@/services/gallery-import"),
        import("expo-image-picker"),
      ]);
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
      onProgress?: (stage: CaptureProgressStage) => void;
    }) {
      const [{ processImage }, appSettings] = await Promise.all([
        import("@/services/capture-processing"),
        settings.getSettings(),
      ]);
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
              ? getBarcodeDetector().then((barcodeDetector) =>
                  Promise.all(
                    imageUris.map((imageUri) =>
                      barcodeDetector.detect({
                        imageUri,
                        allowedTypes: appSettings.barcode.allowedTypes,
                      }),
                    ),
                  ).then((results) => results.flat()),
                )
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

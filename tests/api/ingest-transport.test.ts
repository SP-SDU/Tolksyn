import { createIngestTransport } from "@/api/ingest-transport";
import { defaultSettings } from "@/types/settings";

describe("createIngestTransport", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("maps hung ingest requests to retryable timeout errors", async () => {
    jest.useFakeTimers();
    jest.spyOn(global, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        }) as Promise<Response>,
    );
    const settings = defaultSettings();
    settings.ingest.endpointUrl = "https://example.com/ingest";
    settings.ingest.apiKey = "secret";
    const transport = createIngestTransport({
      getSettings: async () => settings,
    });

    const result = transport.submit({
      idempotencyKey: "key",
      payload: { ok: true },
    });
    await Promise.resolve();
    jest.advanceTimersByTime(30_000);

    await expect(result).resolves.toEqual({
      kind: "retryable_error",
      errorCode: "timeout",
    });
  });
});

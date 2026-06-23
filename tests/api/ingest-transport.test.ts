import { createIngestTransport } from "@/api/ingest-transport";
import { AppError } from "@/types/app-error";
import { defaultSettings } from "@/types/settings";

const endpointUrl = "https://example.com/ingest";
const apiKey = "secret";
const defaultSubmission = { idempotencyKey: "key", payload: {} };

describe("createIngestTransport", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test.each([
    ["blank endpoint", { endpointUrl: " ", apiKey: "secret" }, "invalid_response"],
    ["blank api key", { endpointUrl, apiKey: " " }, "auth_failed"],
  ] as const)(
    "rejects %s before posting",
    async (_name, ingest, errorCode) => {
      const fetch = jest.spyOn(global, "fetch");
      const transport = transportFor(ingest);

      await expect(
        transport.submit({
          idempotencyKey: "key",
          payload: { ok: true },
        }),
      ).resolves.toEqual({ kind: "permanent_error", errorCode });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("posts payload with auth and idempotency headers", async () => {
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 204,
    } as Response);
    const transport = transportFor();

    await expect(
      transport.submit({
        idempotencyKey: "key-1",
        payload: { nested: { ok: true } },
      }),
    ).resolves.toEqual({ kind: "success" });
    expect(fetch).toHaveBeenCalledWith(
      endpointUrl,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "key-1",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ nested: { ok: true } }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  test("clears timeout after fetch settles", async () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 204,
    } as Response);
    const transport = transportFor();

    await expect(
      transport.submit({ idempotencyKey: "key", payload: {} }),
    ).resolves.toEqual({ kind: "success" });
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  test.each([
    [408, { kind: "retryable_error", errorCode: "timeout" }],
    [429, { kind: "retryable_error", errorCode: "rate_limited" }],
    [500, { kind: "retryable_error", errorCode: "network_unavailable" }],
    [503, { kind: "retryable_error", errorCode: "network_unavailable" }],
    [400, { kind: "permanent_error", errorCode: "invalid_response" }],
    [401, { kind: "permanent_error", errorCode: "auth_failed" }],
    [403, { kind: "permanent_error", errorCode: "auth_failed" }],
    [422, { kind: "permanent_error", errorCode: "invalid_response" }],
  ] as const)("maps HTTP %i", async (status, expected) => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status } as Response);
    const transport = transportFor();

    await expect(
      transport.submit({ idempotencyKey: "key", payload: {} }),
    ).resolves.toEqual(expected);
  });

  test("maps settings AppError to permanent submission result", async () => {
    const transport = createIngestTransport({
      getSettings: async () => {
        throw new AppError("auth_failed", "No auth");
      },
    });

    await expect(
      transport.submit({ idempotencyKey: "key", payload: {} }),
    ).resolves.toEqual({ kind: "permanent_error", errorCode: "auth_failed" });
  });

  test("maps platform abort-shaped objects to timeout", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue({ name: "AbortError" });
    const transport = transportFor();

    await expect(
      transport.submit({ idempotencyKey: "key", payload: {} }),
    ).resolves.toEqual({ kind: "retryable_error", errorCode: "timeout" });
  });

  test("maps fetch failures to network unavailable", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));
    const transport = transportFor();

    await expect(
      transport.submit({ idempotencyKey: "key", payload: {} }),
    ).resolves.toEqual({
      kind: "retryable_error",
      errorCode: "network_unavailable",
    });
  });

  test.each([null, "offline", { name: "NetworkError" }] as const)(
    "maps non-abort thrown value %p to network unavailable",
    async (thrown) => {
      jest.spyOn(global, "fetch").mockRejectedValue(thrown);
      const transport = transportFor();

      await expect(
        transport.submit({ idempotencyKey: "key", payload: {} }),
      ).resolves.toEqual({
        kind: "retryable_error",
        errorCode: "network_unavailable",
      });
    },
  );

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
    const transport = transportFor();

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

function transportFor(
  ingest: { endpointUrl: string; apiKey: string } = { endpointUrl, apiKey },
) {
  const settings = ingestSettings(ingest);
  return createIngestTransport({
    getSettings: async () => settings,
  });
}

function ingestSettings({
  endpointUrl,
  apiKey,
}: {
  endpointUrl: string;
  apiKey: string;
}) {
  const settings = defaultSettings();
  settings.ingest.endpointUrl = endpointUrl;
  settings.ingest.apiKey = apiKey;
  return settings;
}

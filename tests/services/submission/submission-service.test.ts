import { createSubmissionService } from "@/services/submission/submission-service";
import { AppError } from "@/types/app-error";
import { emptyStructuredItem } from "@/types/item-schema";

describe("createSubmissionService", () => {
  test("sends immediately when online and transport succeeds", async () => {
    const markSent = jest.fn();
    const markQueued = jest.fn();
    const enqueue = jest.fn();
    const submit = jest.fn().mockResolvedValue({ kind: "success" });
    const service = createSubmissionService({
      attempts: {
        markSent,
        markQueued,
        markFailed: jest.fn(),
      },
      queue: {
        enqueue,
      },
      transport: { submit },
      network: {
        isOnline: async () => true,
      },
      createIdempotencyKey: async () => "idempotency-key",
      now: () => 10,
    });

    const result = await service.acceptAttempt({
      attemptId: "attempt-1",
      acceptedRevision: 1,
      payload: {
        schemaVersion: "tolksyn.item.v1",
        attemptId: "attempt-1",
        acceptedRevision: 1,
        structuredJson: emptyStructuredItem(),
        barcodeEnrichment: {
          detected: [],
          primary: null,
          relatedFieldSuggestions: { eanOrUpc: null },
          conflicts: [],
        },
        metadata: { source: "camera" },
      },
    });

    // Success path: sent immediately, queue never touched
    expect(result).toEqual({
      outcome: "sent",
      idempotencyKey: "idempotency-key",
    });
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "idempotency-key" }),
    );
    expect(markSent).toHaveBeenCalledWith("attempt-1");
    expect(enqueue).not.toHaveBeenCalled();
    expect(markQueued).not.toHaveBeenCalled();
  });

  test("queues immediately when offline", async () => {
    const markQueued = jest.fn();
    const enqueue = jest.fn();
    const service = createSubmissionService({
      attempts: {
        markSent: jest.fn(),
        markQueued,
        markFailed: jest.fn(),
      },
      queue: {
        enqueue,
      },
      transport: { submit: jest.fn() },
      network: {
        isOnline: async () => false,
      },
      createIdempotencyKey: async () => "idempotency-key",
      now: () => 10,
    });

    const result = await service.acceptAttempt({
      attemptId: "attempt-1",
      acceptedRevision: 2,
      payload: {
        schemaVersion: "tolksyn.item.v1",
        attemptId: "attempt-1",
        acceptedRevision: 2,
        structuredJson: emptyStructuredItem(),
        barcodeEnrichment: {
          detected: [],
          primary: null,
          relatedFieldSuggestions: { eanOrUpc: null },
          conflicts: [],
        },
        metadata: { source: "camera" },
      },
    });

    // Offline: submission queued without attempting transport
    expect(result).toEqual({
      outcome: "queued",
      idempotencyKey: "idempotency-key",
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "attempt-1:2",
        attemptId: "attempt-1",
        acceptedRevision: 2,
        idempotencyKey: "idempotency-key",
        enqueuedAt: 10,
      }),
    );
    expect(markQueued).toHaveBeenCalledWith("attempt-1", 2);
  });

  test("queues retryable transport failures instead of dropping them", async () => {
    // Online but transport returns a retryable error
    const markQueued = jest.fn();
    const service = createSubmissionService({
      attempts: {
        markSent: jest.fn(),
        markQueued,
        markFailed: jest.fn(),
      },
      queue: {
        enqueue: jest.fn(),
      },
      transport: {
        submit: jest.fn().mockResolvedValue({
          kind: "retryable_error",
          errorCode: "network_unavailable",
        }),
      },
      network: {
        isOnline: async () => true,
      },
      createIdempotencyKey: async () => "idempotency-key",
      now: () => 10,
    });

    const result = await service.acceptAttempt({
      attemptId: "attempt-1",
      acceptedRevision: 3,
      payload: {
        schemaVersion: "tolksyn.item.v1",
        attemptId: "attempt-1",
        acceptedRevision: 3,
        structuredJson: emptyStructuredItem(),
        barcodeEnrichment: {
          detected: [],
          primary: null,
          relatedFieldSuggestions: { eanOrUpc: null },
          conflicts: [],
        },
        metadata: { source: "camera" },
      },
    });

    // Retryable transport failure also queues. Never sent
    expect(result).toEqual({
      outcome: "queued",
      idempotencyKey: "idempotency-key",
    });
    expect(markQueued).toHaveBeenCalledWith("attempt-1", 3);
  });

  test("marks permanent transport failures and throws an app error", async () => {
    const markFailed = jest.fn();
    const service = createSubmissionService({
      attempts: {
        markSent: jest.fn(),
        markQueued: jest.fn(),
        markFailed,
      },
      queue: {
        enqueue: jest.fn(),
      },
      transport: {
        submit: jest.fn().mockResolvedValue({
          kind: "permanent_error",
          errorCode: "auth_failed",
        }),
      },
      network: {
        isOnline: async () => true,
      },
      createIdempotencyKey: async () => "idempotency-key",
      now: () => 10,
    });

    // Permanent failure throws and marks the attempt as failed
    await expect(
      service.acceptAttempt({
        attemptId: "attempt-1",
        acceptedRevision: 4,
        payload: {
          schemaVersion: "tolksyn.item.v1",
          attemptId: "attempt-1",
          acceptedRevision: 4,
          structuredJson: emptyStructuredItem(),
          barcodeEnrichment: {
            detected: [],
            primary: null,
            relatedFieldSuggestions: { eanOrUpc: null },
            conflicts: [],
          },
          metadata: { source: "camera" },
        },
      }),
    ).rejects.toMatchObject({
      code: "auth_failed",
      message:
        "Submission authentication failed. Check the ingest API key in Settings.",
    } satisfies Partial<AppError>);
    expect(markFailed).toHaveBeenCalledWith("attempt-1", "auth_failed");
  });

  test.each([
    ["invalid_response", "Submission was rejected by the ingest endpoint."],
    [
      "unsupported",
      "Submission is not supported by the configured ingest endpoint.",
    ],
    ["rate_limited", "Unable to submit this attempt."],
  ] as const)(
    "maps permanent %s transport failure to user-facing app error",
    async (errorCode, message) => {
      const service = createSubmissionService({
        attempts: {
          markSent: jest.fn(),
          markQueued: jest.fn(),
          markFailed: jest.fn(),
        },
        queue: {
          enqueue: jest.fn(),
        },
        transport: {
          submit: jest.fn().mockResolvedValue({
            kind: "permanent_error",
            errorCode,
          }),
        },
        network: {
          isOnline: async () => true,
        },
        createIdempotencyKey: async () => "idempotency-key",
        now: () => 10,
      });

      await expect(
        service.acceptAttempt({
          attemptId: "attempt-1",
          acceptedRevision: 5,
          payload: payload(5),
        }),
      ).rejects.toMatchObject({ code: errorCode, message });
    },
  );
});

function payload(acceptedRevision: number) {
  return {
    schemaVersion: "tolksyn.item.v1" as const,
    attemptId: "attempt-1",
    acceptedRevision,
    structuredJson: emptyStructuredItem(),
    barcodeEnrichment: {
      detected: [],
      primary: null,
      relatedFieldSuggestions: { eanOrUpc: null },
      conflicts: [],
    },
    metadata: { source: "camera" as const },
  };
}

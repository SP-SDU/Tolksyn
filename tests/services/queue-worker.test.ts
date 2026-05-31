import {
  drainQueue,
  type QueueItem,
  type QueueRepository,
  type QueueSubmissionResult,
  type SubmissionTransport,
} from "@/services/queue-worker";

class MemoryQueueRepository implements QueueRepository {
  constructor(private readonly items: QueueItem[]) {}

  async peekReady(now: number): Promise<QueueItem | null> {
    return (
      this.items.find(
        (item) => item.nextAttemptAt <= now && item.status === "queued",
      ) ?? null
    );
  }

  async markSent(id: string): Promise<void> {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "sent";
    }
  }

  async reschedule(
    id: string,
    nextAttemptAt: number,
    retryCount: number,
    errorCode: string,
  ): Promise<void> {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.nextAttemptAt = nextAttemptAt;
      item.retryCount = retryCount;
      item.lastErrorCode = errorCode;
    }
  }

  async markFailed(id: string, errorCode: string): Promise<void> {
    const item = this.items.find((entry) => entry.id === id);
    if (item) {
      item.status = "failed";
      item.lastErrorCode = errorCode;
    }
  }

  snapshot(): QueueItem[] {
    return this.items;
  }
}

describe("drainQueue", () => {
  test("drains ready items in FIFO order", async () => {
    const repository = new MemoryQueueRepository([
      {
        id: "1",
        sequence: 1,
        status: "queued",
        nextAttemptAt: 0,
        retryCount: 0,
        payload: { attemptId: "a-1" },
        idempotencyKey: "k1",
      },
      {
        id: "2",
        sequence: 2,
        status: "queued",
        nextAttemptAt: 0,
        retryCount: 0,
        payload: { attemptId: "a-2" },
        idempotencyKey: "k2",
      },
    ]);
    const delivered: string[] = [];
    const transport: SubmissionTransport = {
      async submit(item) {
        delivered.push(item.id);
        return { kind: "success" };
      },
    };

    await drainQueue({
      now: 0,
      repository,
      transport,
      computeDelayMs: () => 500,
    });

    expect(delivered).toEqual(["1", "2"]);
    expect(repository.snapshot().map((item) => item.status)).toEqual([
      "sent",
      "sent",
    ]);
  });

  test("stops on retryable transport failure and reschedules the head item", async () => {
    const repository = new MemoryQueueRepository([
      {
        id: "1",
        sequence: 1,
        status: "queued",
        nextAttemptAt: 0,
        retryCount: 0,
        payload: { attemptId: "a-1" },
        idempotencyKey: "k1",
      },
      {
        id: "2",
        sequence: 2,
        status: "queued",
        nextAttemptAt: 0,
        retryCount: 0,
        payload: { attemptId: "a-2" },
        idempotencyKey: "k2",
      },
    ]);
    const transport: SubmissionTransport = {
      async submit(): Promise<QueueSubmissionResult> {
        return { kind: "retryable_error", errorCode: "network_unavailable" };
      },
    };

    await drainQueue({
      now: 1000,
      repository,
      transport,
      computeDelayMs: () => 250,
    });

    expect(repository.snapshot()).toEqual([
      expect.objectContaining({
        id: "1",
        status: "queued",
        retryCount: 1,
        nextAttemptAt: 1250,
        lastErrorCode: "network_unavailable",
      }),
      expect.objectContaining({
        id: "2",
        status: "queued",
        retryCount: 0,
      }),
    ]);
  });

  test("marks permanent failures without retrying later items ahead of them", async () => {
    const repository = new MemoryQueueRepository([
      {
        id: "1",
        sequence: 1,
        status: "queued",
        nextAttemptAt: 0,
        retryCount: 0,
        payload: { attemptId: "a-1" },
        idempotencyKey: "k1",
      },
      {
        id: "2",
        sequence: 2,
        status: "queued",
        nextAttemptAt: 0,
        retryCount: 0,
        payload: { attemptId: "a-2" },
        idempotencyKey: "k2",
      },
    ]);
    const outcomes: QueueSubmissionResult[] = [
      { kind: "permanent_error", errorCode: "auth_failed" },
      { kind: "success" },
    ];
    const transport: SubmissionTransport = {
      async submit() {
        return outcomes.shift() ?? { kind: "success" };
      },
    };

    await drainQueue({
      now: 0,
      repository,
      transport,
      computeDelayMs: () => 500,
    });

    expect(repository.snapshot()).toEqual([
      expect.objectContaining({
        id: "1",
        status: "failed",
        lastErrorCode: "auth_failed",
      }),
      expect.objectContaining({ id: "2", status: "sent" }),
    ]);
  });
});

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
    // Arrange
    // Two items both ready at now=0. Transport always succeeds
    const repository = new MemoryQueueRepository(twoReadyItems());
    const delivered: string[] = [];
    const transport: SubmissionTransport = {
      async submit(item) {
        delivered.push(item.id);
        return { kind: "success" };
      },
    };

    // Act
    await drainQueue({
      now: 0,
      repository,
      transport,
      computeDelayMs: () => 500,
    });

    // Assert
    // Items delivered in sequence order. Both marked sent
    expect(delivered).toEqual(["1", "2"]);
    expect(repository.snapshot().map((item) => item.status)).toEqual([
      "sent",
      "sent",
    ]);
  });

  test("stops on retryable transport failure and reschedules the head item", async () => {
    // Arrange
    // Head item will fail with retryable error. Second item should not be processed
    const repository = new MemoryQueueRepository(twoReadyItems());
    const transport: SubmissionTransport = {
      async submit(): Promise<QueueSubmissionResult> {
        return { kind: "retryable_error", errorCode: "network_unavailable" };
      },
    };

    // Act
    await drainQueue({
      now: 1000,
      repository,
      transport,
      computeDelayMs: () => 250,
    });

    // Assert
    // Head item rescheduled with incremented retryCount. Item 2 untouched
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
    // Arrange
    // Head item gets permanent error. Second item should still be processed
    const repository = new MemoryQueueRepository(twoReadyItems());
    const outcomes: QueueSubmissionResult[] = [
      { kind: "permanent_error", errorCode: "auth_failed" },
      { kind: "success" },
    ];
    const transport: SubmissionTransport = {
      async submit() {
        return outcomes.shift() ?? { kind: "success" };
      },
    };

    // Act
    await drainQueue({
      now: 0,
      repository,
      transport,
      computeDelayMs: () => 500,
    });

    // Assert
    // Head marked failed. Second item sent (permanent error does not block later items)
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

function twoReadyItems(): QueueItem[] {
  return [queueItem(1), queueItem(2)];
}

function queueItem(sequence: 1 | 2): QueueItem {
  return {
    id: String(sequence),
    sequence,
    status: "queued",
    nextAttemptAt: 0,
    retryCount: 0,
    payload: { attemptId: `a-${sequence}` },
    idempotencyKey: `k${sequence}`,
  };
}

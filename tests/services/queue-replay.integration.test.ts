import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/db/schema";
import { createQueueRepository } from "@/repositories/queue-repository";
import {
  drainQueue,
  type QueueSubmissionResult,
} from "@/services/queue-worker";

describe("queue replay integration", () => {
  test("keeps strict FIFO blocking when head item is retryable after restart", async () => {
    // Arrange
    // Shared in-memory DB simulates persistent state across restarts
    const sqlite = new Database(":memory:");
    const db1 = createTestDb(sqlite);
    const queue1 = createQueueRepository(db1 as any);

    // enqueuedAt values establish FIFO ordering: queue-1 before queue-2
    await queue1.enqueue({
      id: "queue-1",
      attemptId: "attempt-1",
      acceptedRevision: 1,
      idempotencyKey: "k1",
      payload: { attemptId: "attempt-1" },
      enqueuedAt: 10,
    });
    await queue1.enqueue({
      id: "queue-2",
      attemptId: "attempt-2",
      acceptedRevision: 1,
      idempotencyKey: "k2",
      payload: { attemptId: "attempt-2" },
      enqueuedAt: 11,
    });

    // Second repo instance from the same connection simulates a process restart
    const db2 = createTestDb(sqlite);
    const queue2 = createQueueRepository(db2 as any);
    const delivered: string[] = [];
    // First submit fails with retryable error so head blocks. Remaining succeed
    const outcomes: QueueSubmissionResult[] = [
      { kind: "retryable_error", errorCode: "network_unavailable" },
      { kind: "success" },
      { kind: "success" },
    ];

    // Act
    // Head item (queue-1) hits retryable error and blocks
    await drainReplayQueue({
      now: 999,
      repository: queue2,
      delivered,
      outcomes,
    });

    // Assert
    // Only head item was processed (blocked, not skipped)
    expect(delivered).toEqual(["queue-1"]);

    // Act
    // Drain again after delay, head is retryable again, then queue-2 proceeds
    await drainReplayQueue({
      now: 1100,
      repository: queue2,
      delivered,
      outcomes,
    });

    // Assert
    // Queue-1 retried first (head stays head), queue-2 delivered after
    expect(delivered).toEqual(["queue-1", "queue-1", "queue-2"]);
  });
});

function createTestDb(sqlite: Database.Database) {
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS queue_items (
      id TEXT PRIMARY KEY NOT NULL,
      sequence INTEGER NOT NULL,
      status TEXT NOT NULL,
      next_attempt_at INTEGER NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      last_error_code TEXT,
      attempt_id TEXT NOT NULL,
      accepted_revision INTEGER NOT NULL,
      enqueued_at INTEGER NOT NULL
    );
  `);

  return db;
}

async function drainReplayQueue({
  now,
  repository,
  delivered,
  outcomes,
}: {
  now: number;
  repository: ReturnType<typeof createQueueRepository>;
  delivered: string[];
  outcomes: QueueSubmissionResult[];
}) {
  await drainQueue({
    now,
    repository,
    transport: {
      submit: async (item) => {
        delivered.push(item.id);
        return outcomes.shift() ?? { kind: "success" };
      },
    },
    computeDelayMs: () => 100,
  });
}

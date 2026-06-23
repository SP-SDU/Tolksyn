import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/db/schema";
import { createQueueRepository } from "@/repositories/queue-repository";

describe("queue repository", () => {
  test("persists queued submissions in FIFO order", async () => {
    const db = createTestDb();
    const repository = createQueueRepository(db as any);

    await seedQueue(repository);

    const first = await repository.peekReady(10);

    // queue-1 enqueued first with lower enqueuedAt, so it is returned first
    expect(first?.id).toBe("queue-1");

    await repository.markSent("queue-1");
    const second = await repository.peekReady(10);

    // After marking first as sent, queue-2 becomes the next ready item
    expect(second?.id).toBe("queue-2");
  });

  test("reschedules retryable failures and keeps item available later", async () => {
    const db = createTestDb();
    const repository = createQueueRepository(db as any);

    await repository.enqueue(queueItem(1));

    await repository.reschedule("queue-1", 50, 1, "network_unavailable");

    // Item not visible before its scheduled retry time
    expect(await repository.peekReady(49)).toBeNull();
    // Item visible at exactly its scheduled time with updated retry state
    expect(await repository.peekReady(50)).toEqual(
      expect.objectContaining({
        id: "queue-1",
        retryCount: 1,
        lastErrorCode: "network_unavailable",
      }),
    );
  });

  test("blocks later ready item when queue head is not ready yet", async () => {
    const db = createTestDb();
    const repository = createQueueRepository(db as any);

    await seedQueue(repository);

    // Head item rescheduled far into the future
    await repository.reschedule("queue-1", 100, 1, "network_unavailable");

    // Even though queue-2 is ready, it is blocked because queue-1 is head
    expect(await repository.peekReady(50)).toBeNull();
  });
});

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE queue_items (
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

function queueItem(index: 1 | 2) {
  const names = { 1: "one", 2: "two" };

  return {
    id: `queue-${index}`,
    attemptId: `attempt-${index}`,
    acceptedRevision: 1,
    idempotencyKey: `key-${index}`,
    payload: { hello: names[index] },
    enqueuedAt: 9 + index,
  };
}

async function seedQueue(repository: ReturnType<typeof createQueueRepository>) {
  await repository.enqueue(queueItem(1));
  await repository.enqueue(queueItem(2));
}

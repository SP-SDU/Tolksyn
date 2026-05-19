import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from '@/db/schema';
import { createQueueRepository } from '@/repositories/queue-repository';
import { drainQueue, type QueueSubmissionResult } from '@/services/queue-worker';

describe('queue replay integration', () => {
  test('keeps strict FIFO blocking when head item is retryable after restart', async () => {
    const sqlite = new Database(':memory:');
    const db1 = createTestDb(sqlite);
    const queue1 = createQueueRepository(db1 as any);

    await queue1.enqueue({
      id: 'queue-1',
      attemptId: 'attempt-1',
      acceptedRevision: 1,
      idempotencyKey: 'k1',
      payload: { attemptId: 'attempt-1' },
      enqueuedAt: 10,
    });
    await queue1.enqueue({
      id: 'queue-2',
      attemptId: 'attempt-2',
      acceptedRevision: 1,
      idempotencyKey: 'k2',
      payload: { attemptId: 'attempt-2' },
      enqueuedAt: 11,
    });

    const db2 = createTestDb(sqlite);
    const queue2 = createQueueRepository(db2 as any);
    const delivered: string[] = [];
    const outcomes: QueueSubmissionResult[] = [
      { kind: 'retryable_error', errorCode: 'network_unavailable' },
      { kind: 'success' },
      { kind: 'success' },
    ];

    await drainQueue({
      now: 999,
      repository: queue2,
      transport: {
        submit: async (item) => {
          delivered.push(item.id);
          return outcomes.shift() ?? { kind: 'success' };
        },
      },
      computeDelayMs: () => 100,
    });

    expect(delivered).toEqual(['queue-1']);

    await drainQueue({
      now: 1100,
      repository: queue2,
      transport: {
        submit: async (item) => {
          delivered.push(item.id);
          return outcomes.shift() ?? { kind: 'success' };
        },
      },
      computeDelayMs: () => 100,
    });

    expect(delivered).toEqual(['queue-1', 'queue-1', 'queue-2']);
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

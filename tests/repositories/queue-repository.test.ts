import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from '@/db/schema';
import { createQueueRepository } from '@/repositories/queue-repository';

describe('queue repository', () => {
  test('persists queued submissions in FIFO order', async () => {
    const db = createTestDb();
    const repository = createQueueRepository(db as any);

    await repository.enqueue({
      id: 'queue-1',
      attemptId: 'attempt-1',
      acceptedRevision: 1,
      idempotencyKey: 'key-1',
      payload: { hello: 'one' },
      enqueuedAt: 10,
    });
    await repository.enqueue({
      id: 'queue-2',
      attemptId: 'attempt-2',
      acceptedRevision: 1,
      idempotencyKey: 'key-2',
      payload: { hello: 'two' },
      enqueuedAt: 11,
    });

    const first = await repository.peekReady(10);
    expect(first?.id).toBe('queue-1');
    await repository.markSent('queue-1');

    const second = await repository.peekReady(10);
    expect(second?.id).toBe('queue-2');
  });

  test('reschedules retryable failures and keeps item available later', async () => {
    const db = createTestDb();
    const repository = createQueueRepository(db as any);

    await repository.enqueue({
      id: 'queue-1',
      attemptId: 'attempt-1',
      acceptedRevision: 1,
      idempotencyKey: 'key-1',
      payload: { hello: 'one' },
      enqueuedAt: 10,
    });
    await repository.reschedule('queue-1', 50, 1, 'network_unavailable');

    expect(await repository.peekReady(49)).toBeNull();
    expect(await repository.peekReady(50)).toEqual(
      expect.objectContaining({
        id: 'queue-1',
        retryCount: 1,
        lastErrorCode: 'network_unavailable',
      }),
    );
  });

  test('blocks later ready item when queue head is not ready yet', async () => {
    const db = createTestDb();
    const repository = createQueueRepository(db as any);

    await repository.enqueue({
      id: 'queue-1',
      attemptId: 'attempt-1',
      acceptedRevision: 1,
      idempotencyKey: 'key-1',
      payload: { hello: 'one' },
      enqueuedAt: 10,
    });
    await repository.enqueue({
      id: 'queue-2',
      attemptId: 'attempt-2',
      acceptedRevision: 1,
      idempotencyKey: 'key-2',
      payload: { hello: 'two' },
      enqueuedAt: 11,
    });

    await repository.reschedule('queue-1', 100, 1, 'network_unavailable');

    expect(await repository.peekReady(50)).toBeNull();
  });
});

function createTestDb() {
  const sqlite = new Database(':memory:');
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

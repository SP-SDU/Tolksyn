import { asc, eq, max } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import { queueItemsTable } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { QueueItem, QueueRepository } from '@/services/queue-worker';

export type PersistedQueueItem = QueueItem & {
  attemptId: string;
  acceptedRevision: number;
  enqueuedAt: number;
};

type DbLike = ExpoSQLiteDatabase<typeof schema>;

export function createQueueRepository(db: DbLike): QueueRepository & {
  enqueue(input: {
    id: string;
    attemptId: string;
    acceptedRevision: number;
    idempotencyKey: string;
    payload: unknown;
    enqueuedAt: number;
  }): Promise<PersistedQueueItem>;
} {
  return {
    async enqueue(input) {
      const nextSequence = await getNextSequence(db);

      const item: PersistedQueueItem = {
        ...input,
        sequence: nextSequence,
        status: 'queued',
        nextAttemptAt: 0,
        retryCount: 0,
      };

      await db.insert(queueItemsTable).values(serializeQueueItem(item));
      return item;
    },

    async peekReady(now) {
      const rows = await db
        .select()
        .from(queueItemsTable)
        .where(eq(queueItemsTable.status, 'queued'))
        .orderBy(asc(queueItemsTable.sequence))
        .limit(1);
      const row = rows[0];

      if (!row) {
        return null;
      }

      const item = deserializeQueueItem(row);
      return item.nextAttemptAt <= now ? item : null;
    },

    async markSent(id) {
      await db
        .update(queueItemsTable)
        .set({
          status: 'sent',
        })
        .where(eq(queueItemsTable.id, id));
    },

    async reschedule(id, nextAttemptAt, retryCount, errorCode) {
      await db
        .update(queueItemsTable)
        .set({
          nextAttemptAt,
          retryCount,
          lastErrorCode: errorCode,
        })
        .where(eq(queueItemsTable.id, id));
    },

    async markFailed(id, errorCode) {
      await db
        .update(queueItemsTable)
        .set({
          status: 'failed',
          lastErrorCode: errorCode,
        })
        .where(eq(queueItemsTable.id, id));
    },
  };
}

function serializeQueueItem(item: PersistedQueueItem) {
  return {
    id: item.id,
    sequence: item.sequence,
    status: item.status,
    nextAttemptAt: item.nextAttemptAt,
    retryCount: item.retryCount,
    payload: JSON.stringify(item.payload),
    idempotencyKey: item.idempotencyKey,
    lastErrorCode: item.lastErrorCode ?? null,
    attemptId: item.attemptId,
    acceptedRevision: item.acceptedRevision,
    enqueuedAt: item.enqueuedAt,
  };
}

function deserializeQueueItem(row: typeof queueItemsTable.$inferSelect): PersistedQueueItem {
  return {
    id: row.id,
    sequence: row.sequence,
    status: row.status as QueueItem['status'],
    nextAttemptAt: row.nextAttemptAt,
    retryCount: row.retryCount,
    payload: JSON.parse(row.payload),
    idempotencyKey: row.idempotencyKey,
    lastErrorCode: row.lastErrorCode ?? undefined,
    attemptId: row.attemptId,
    acceptedRevision: row.acceptedRevision,
    enqueuedAt: row.enqueuedAt,
  };
}

async function getNextSequence(db: DbLike): Promise<number> {
  const row = await db.select({ max: max(queueItemsTable.sequence) }).from(queueItemsTable);
  return (row[0]?.max ?? 0) + 1;
}

import { desc, eq, inArray } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import { attemptsTable } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { StructuredItem } from '@/types/item-schema';
import type { MergeExtractionResult } from '@/utils/merge-extraction-result';

const MAX_ATTEMPTS = 20;

export type AttemptStatus =
  | 'captured'
  | 'ready_for_review'
  | 'queued'
  | 'sent'
  | 'extract_failed'
  | 'send_failed'
  | 'discarded';

export type AttemptRecord = {
  id: string;
  source: 'camera' | 'gallery';
  imageUri: string;
  thumbnailUri: string;
  createdAt: number;
  updatedAt: number;
  status: AttemptStatus;
  acceptedRevision: number;
  draftStructuredJson?: StructuredItem;
  extractionResult?: MergeExtractionResult;
  errorCode?: string;
};

type DbLike = ExpoSQLiteDatabase<typeof schema>;

export function createAttemptRepository(db: DbLike) {
  return {
    async create(input: {
      id: string;
      source: AttemptRecord['source'];
      imageUri: string;
      thumbnailUri: string;
      createdAt: number;
    }): Promise<AttemptRecord> {
      const attempt: AttemptRecord = {
        ...input,
        updatedAt: input.createdAt,
        status: 'captured',
        acceptedRevision: 0,
      };

      await db.insert(attemptsTable).values(serializeAttempt(attempt));
      await pruneAttempts(db);
      return attempt;
    },

    async saveExtractionResult(id: string, result: MergeExtractionResult): Promise<void> {
      await db
        .update(attemptsTable)
        .set({
          extractionResult: JSON.stringify(result),
          draftStructuredJson: JSON.stringify(result.structuredJson),
          status: 'ready_for_review',
          updatedAt: Date.now(),
        })
        .where(eq(attemptsTable.id, id));
      await pruneAttempts(db);
    },

    async saveDraft(id: string, draftStructuredJson: StructuredItem): Promise<void> {
      await db
        .update(attemptsTable)
        .set({
          draftStructuredJson: JSON.stringify(draftStructuredJson),
          updatedAt: Date.now(),
        })
        .where(eq(attemptsTable.id, id));
      await pruneAttempts(db);
    },

    async markQueued(id: string, acceptedRevision: number): Promise<void> {
      await db
        .update(attemptsTable)
        .set({
          status: 'queued',
          acceptedRevision,
          updatedAt: Date.now(),
        })
        .where(eq(attemptsTable.id, id));
      await pruneAttempts(db);
    },

    async markSent(id: string): Promise<void> {
      await db
        .update(attemptsTable)
        .set({
          status: 'sent',
          updatedAt: Date.now(),
        })
        .where(eq(attemptsTable.id, id));
      await pruneAttempts(db);
    },

    async markFailed(id: string, errorCode: string): Promise<void> {
      await db
        .update(attemptsTable)
        .set({
          status: 'send_failed',
          errorCode,
          updatedAt: Date.now(),
        })
        .where(eq(attemptsTable.id, id));
      await pruneAttempts(db);
    },

    async getById(id: string): Promise<AttemptRecord | null> {
      const rows = await db.select().from(attemptsTable).where(eq(attemptsTable.id, id)).limit(1);
      const row = rows[0];

      return row ? deserializeAttempt(row) : null;
    },

    async listRecent(limit: number): Promise<AttemptRecord[]> {
      const rows = await db.select().from(attemptsTable).orderBy(desc(attemptsTable.createdAt)).limit(limit);

      return rows.map(deserializeAttempt);
    },
  };
}

function serializeAttempt(record: AttemptRecord) {
  return {
    id: record.id,
    source: record.source,
    imageUri: record.imageUri,
    thumbnailUri: record.thumbnailUri,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    acceptedRevision: record.acceptedRevision,
    draftStructuredJson: record.draftStructuredJson ? JSON.stringify(record.draftStructuredJson) : null,
    extractionResult: record.extractionResult ? JSON.stringify(record.extractionResult) : null,
    errorCode: record.errorCode ?? null,
  };
}

function deserializeAttempt(row: typeof attemptsTable.$inferSelect): AttemptRecord {
  return {
    id: row.id,
    source: row.source as AttemptRecord['source'],
    imageUri: row.imageUri,
    thumbnailUri: row.thumbnailUri,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status as AttemptStatus,
    acceptedRevision: row.acceptedRevision,
    draftStructuredJson: row.draftStructuredJson ? (JSON.parse(row.draftStructuredJson) as StructuredItem) : undefined,
    extractionResult: row.extractionResult
      ? (JSON.parse(row.extractionResult) as MergeExtractionResult)
      : undefined,
    errorCode: row.errorCode ?? undefined,
  };
}

async function pruneAttempts(db: DbLike): Promise<void> {
  const rows = await db
    .select({ id: attemptsTable.id })
    .from(attemptsTable)
    .orderBy(desc(attemptsTable.createdAt));

  if (rows.length <= MAX_ATTEMPTS) {
    return;
  }

  const idsToDelete = rows.slice(MAX_ATTEMPTS).map((row) => row.id);
  if (idsToDelete.length === 0) {
    return;
  }

  await db.delete(attemptsTable).where(inArray(attemptsTable.id, idsToDelete));
}

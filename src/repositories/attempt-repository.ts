import { desc, eq, inArray } from "drizzle-orm";
import type { ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";

import type * as schema from "@/db/schema";
import { attemptsTable } from "@/db/schema";
import type { AttemptImage } from "@/types/attempt-image";
import type { StructuredItem } from "@/types/item-schema";
import type { MergeExtractionResult } from "@/utils/merge-extraction-result";

const MAX_ATTEMPTS = 20;

export type AttemptStatus =
  | "captured"
  | "ready_for_review"
  | "queued"
  | "sent"
  | "extract_failed"
  | "send_failed"
  | "discarded";

export type AttemptRecord = {
  id: string;
  source: "camera" | "gallery";
  images: AttemptImage[];
  createdAt: number;
  updatedAt: number;
  status: AttemptStatus;
  acceptedRevision: number;
  draftStructuredJson?: StructuredItem;
  extractionResult?: MergeExtractionResult;
  extractionDiagnostics?: MergeExtractionResult["extractionDiagnostics"];
  errorCode?: string;
};

type DbLike = ExpoSQLiteDatabase<typeof schema>;

export function createAttemptRepository(
  db: DbLike,
  sqlite?: SQLiteDatabase,
  hooks?: {
    onDelete?: (id: string) => void | Promise<void>;
    onPrune?: (ids: string[]) => void | Promise<void>;
  },
) {
  return {
    async create(input: {
      id: string;
      source: AttemptRecord["source"];
      images: AttemptImage[];
      createdAt: number;
    }): Promise<AttemptRecord> {
      const attempt: AttemptRecord = {
        ...input,
        updatedAt: input.createdAt,
        status: "captured",
        acceptedRevision: 0,
      };

      await db.insert(attemptsTable).values(serializeAttempt(attempt));
      await pruneAttempts(db, sqlite, hooks);
      return attempt;
    },

    async saveExtractionResult(
      id: string,
      result: MergeExtractionResult,
    ): Promise<void> {
      await db
        .update(attemptsTable)
        .set({
          extractionResult: JSON.stringify(result),
          draftStructuredJson: JSON.stringify(result.structuredJson),
          status: "ready_for_review",
          updatedAt: Date.now(),
        })
        .where(eq(attemptsTable.id, id));
      await pruneAttempts(db, sqlite, hooks);
    },

    async saveDraft(
      id: string,
      draftStructuredJson: StructuredItem,
    ): Promise<void> {
      await db
        .update(attemptsTable)
        .set({
          draftStructuredJson: JSON.stringify(draftStructuredJson),
          updatedAt: Date.now(),
        })
        .where(eq(attemptsTable.id, id));
      await pruneAttempts(db, sqlite, hooks);
    },

    async markQueued(id: string, acceptedRevision: number): Promise<void> {
      await db
        .update(attemptsTable)
        .set({
          status: "queued",
          acceptedRevision,
          updatedAt: Date.now(),
        })
        .where(eq(attemptsTable.id, id));
      await pruneAttempts(db, sqlite, hooks);
    },

    async markSent(id: string): Promise<void> {
      await db
        .update(attemptsTable)
        .set({
          status: "sent",
          updatedAt: Date.now(),
        })
        .where(eq(attemptsTable.id, id));
      await pruneAttempts(db, sqlite, hooks);
    },

    async markFailed(id: string, errorCode: string): Promise<void> {
      await db
        .update(attemptsTable)
        .set({
          status: "send_failed",
          errorCode,
          updatedAt: Date.now(),
        })
        .where(eq(attemptsTable.id, id));
      await pruneAttempts(db, sqlite, hooks);
    },

    async deleteById(id: string): Promise<void> {
      if (sqlite?.runAsync) {
        try {
          await sqlite.runAsync("delete from attempts where id = ?", id);
          await hooks?.onDelete?.(id);
          return;
        } catch {}
      }

      await db.delete(attemptsTable).where(eq(attemptsTable.id, id));
      try {
        await hooks?.onDelete?.(id);
      } catch {}
    },

    async getById(id: string): Promise<AttemptRecord | null> {
      if (sqlite?.getFirstAsync) {
        try {
          const row = await sqlite.getFirstAsync<{
            id: string;
            source: string;
            imageUri: string;
            thumbnailUri: string;
            createdAt: number;
            updatedAt: number;
            status: string;
            acceptedRevision: number;
            draftStructuredJson: string | null;
            extractionResult: string | null;
            errorCode: string | null;
          }>(
            `select id, source, image_uri as imageUri, thumbnail_uri as thumbnailUri, created_at as createdAt, updated_at as updatedAt, status, accepted_revision as acceptedRevision, draft_structured_json as draftStructuredJson, extraction_result as extractionResult, error_code as errorCode from attempts where id = ? limit 1`,
            id,
          );

          if (!row) {
            return null;
          }

          return {
            id: row.id,
            source: row.source as AttemptRecord["source"],
            images: parseAttemptImages(row.imageUri, row.thumbnailUri),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            status: row.status as AttemptStatus,
            acceptedRevision: row.acceptedRevision,
            draftStructuredJson: parseJsonOrUndefined<StructuredItem>(
              row.draftStructuredJson,
            ),
            extractionResult: parseJsonOrUndefined<MergeExtractionResult>(
              row.extractionResult,
            ),
            extractionDiagnostics: parseExtractionDiagnostics(
              row.extractionResult,
            ),
            errorCode: row.errorCode ?? undefined,
          };
        } catch {}
      }

      try {
        const rows = await db
          .select()
          .from(attemptsTable)
          .where(eq(attemptsTable.id, id))
          .limit(1);
        const row = rows[0];

        return row ? deserializeAttempt(row) : null;
      } catch {
        try {
          const base = await db.query.attemptsTable.findFirst({
            where: eq(attemptsTable.id, id),
            columns: {
              id: true,
              source: true,
              imageUri: true,
              thumbnailUri: true,
              createdAt: true,
              updatedAt: true,
              status: true,
              acceptedRevision: true,
              errorCode: true,
            },
          });

          if (!base) {
            return null;
          }

          return {
            id: base.id,
            source: base.source as AttemptRecord["source"],
            images: parseAttemptImages(base.imageUri, base.thumbnailUri),
            createdAt: base.createdAt,
            updatedAt: base.updatedAt,
            status: base.status as AttemptStatus,
            acceptedRevision: base.acceptedRevision,
            errorCode: base.errorCode ?? undefined,
          };
        } catch {
          return null;
        }
      }
    },

    async listRecent(limit: number): Promise<AttemptRecord[]> {
      if (sqlite?.getAllAsync) {
        try {
          const rows = await sqlite.getAllAsync<{
            id: string;
            source: string;
            imageUri: string;
            thumbnailUri: string;
            createdAt: number;
            updatedAt: number;
            status: string;
            acceptedRevision: number;
            errorCode: string | null;
          }>(
            `select id, source, image_uri as imageUri, thumbnail_uri as thumbnailUri, created_at as createdAt, updated_at as updatedAt, status, accepted_revision as acceptedRevision, error_code as errorCode from attempts order by created_at desc limit ?`,
            limit,
          );

          return rows.map((row) => ({
            id: row.id,
            source: row.source as AttemptRecord["source"],
            images: parseAttemptImages(row.imageUri, row.thumbnailUri),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            status: row.status as AttemptStatus,
            acceptedRevision: row.acceptedRevision,
            errorCode: row.errorCode ?? undefined,
          }));
        } catch {}
      }

      try {
        const rows = await db
          .select({
            id: attemptsTable.id,
            source: attemptsTable.source,
            imageUri: attemptsTable.imageUri,
            thumbnailUri: attemptsTable.thumbnailUri,
            createdAt: attemptsTable.createdAt,
            updatedAt: attemptsTable.updatedAt,
            status: attemptsTable.status,
            acceptedRevision: attemptsTable.acceptedRevision,
            errorCode: attemptsTable.errorCode,
          })
          .from(attemptsTable)
          .orderBy(desc(attemptsTable.createdAt))
          .limit(limit);

        return rows.map((row) => ({
          id: row.id,
          source: row.source as AttemptRecord["source"],
          images: parseAttemptImages(row.imageUri, row.thumbnailUri),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          status: row.status as AttemptStatus,
          acceptedRevision: row.acceptedRevision,
          errorCode: row.errorCode ?? undefined,
        }));
      } catch {
        return [];
      }
    },

    async getDistinctFieldValues(
      field: keyof StructuredItem,
      limit: number = 20,
    ): Promise<string[]> {
      try {
        let rows;
        if (sqlite?.getAllAsync) {
          rows = await sqlite.getAllAsync<{
            draftStructuredJson: string | null;
          }>(
            `select draft_structured_json as draftStructuredJson from attempts order by created_at desc limit ?`,
            limit,
          );
        } else {
          rows = await db
            .select({ draftStructuredJson: attemptsTable.draftStructuredJson })
            .from(attemptsTable)
            .orderBy(desc(attemptsTable.createdAt))
            .limit(limit);
        }

        const values = new Set<string>();
        for (const row of rows) {
          if (!row.draftStructuredJson) continue;
          const parsed = parseJsonOrUndefined<StructuredItem>(
            row.draftStructuredJson,
          );
          if (parsed && typeof parsed === "object") {
            const val = parsed[field];
            if (typeof val === "string" && val.trim().length > 0) {
              values.add(val.trim());
            }
          }
        }
        return Array.from(values);
      } catch {
        return [];
      }
    },
  };
}

function serializeAttempt(record: AttemptRecord) {
  return {
    id: record.id,
    source: record.source,
    imageUri: JSON.stringify(record.images.map((image) => image.imageUri)),
    thumbnailUri: JSON.stringify(
      record.images.map((image) => image.thumbnailUri),
    ),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    acceptedRevision: record.acceptedRevision,
    draftStructuredJson: record.draftStructuredJson
      ? JSON.stringify(record.draftStructuredJson)
      : null,
    extractionResult: record.extractionResult
      ? JSON.stringify(record.extractionResult)
      : null,
    errorCode: record.errorCode ?? null,
  };
}

function deserializeAttempt(
  row: typeof attemptsTable.$inferSelect,
): AttemptRecord {
  return {
    id: row.id,
    source: row.source as AttemptRecord["source"],
    images: parseAttemptImages(row.imageUri, row.thumbnailUri),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status as AttemptStatus,
    acceptedRevision: row.acceptedRevision,
    draftStructuredJson: parseJsonOrUndefined<StructuredItem>(
      row.draftStructuredJson,
    ),
    extractionResult: parseJsonOrUndefined<MergeExtractionResult>(
      row.extractionResult,
    ),
    extractionDiagnostics: parseExtractionDiagnostics(row.extractionResult),
    errorCode: row.errorCode ?? undefined,
  };
}

function parseUriList(value: string | null | undefined): string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      );
    }

    if (typeof parsed === "string" && parsed.length > 0) {
      return [parsed];
    }
  } catch {
    return [value];
  }

  return [];
}

function parseAttemptImages(
  imageUriValue: string | null | undefined,
  thumbnailUriValue: string | null | undefined,
): AttemptImage[] {
  const imageUris = parseUriList(imageUriValue);
  const thumbnailUris = parseUriList(thumbnailUriValue);

  return imageUris.map((imageUri, index) => ({
    imageUri,
    thumbnailUri: thumbnailUris[index] ?? imageUri,
  }));
}

function parseExtractionDiagnostics(
  value: string | null,
): MergeExtractionResult["extractionDiagnostics"] | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as {
      extractionDiagnostics?: MergeExtractionResult["extractionDiagnostics"];
    };
    return parsed.extractionDiagnostics;
  } catch {
    return undefined;
  }
}

function parseJsonOrUndefined<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

async function pruneAttempts(
  db: DbLike,
  sqlite?: SQLiteDatabase,
  hooks?: { onPrune?: (ids: string[]) => void | Promise<void> },
): Promise<void> {
  try {
    const rows = sqlite?.getAllAsync
      ? await sqlite.getAllAsync<{ id: string }>(
          "select id from attempts order by created_at desc",
        )
      : await db
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

    if (sqlite?.runAsync) {
      const placeholders = idsToDelete.map(() => "?").join(",");
      await sqlite.runAsync(
        `delete from attempts where id in (${placeholders})`,
        idsToDelete,
      );
      await hooks?.onPrune?.(idsToDelete);
      return;
    }

    await db
      .delete(attemptsTable)
      .where(inArray(attemptsTable.id, idsToDelete));
    await hooks?.onPrune?.(idsToDelete);
  } catch (error) {
    console.warn(
      "[tolksyn] Attempt pruning skipped:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

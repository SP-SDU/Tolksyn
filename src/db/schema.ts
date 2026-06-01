import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Local attempt rows let confirm and history work offline without re-running extraction. */
export const attemptsTable = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  imageUri: text("image_uri").notNull(),
  thumbnailUri: text("thumbnail_uri").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  status: text("status").notNull(),
  acceptedRevision: integer("accepted_revision").notNull().default(0),
  draftStructuredJson: text("draft_structured_json"),
  extractionResult: text("extraction_result"),
  errorCode: text("error_code"),
});

/** Accepted payloads wait here when offline, and sequence keeps send order stable across restarts. */
export const queueItemsTable = sqliteTable("queue_items", {
  id: text("id").primaryKey(),
  sequence: integer("sequence").notNull(),
  status: text("status").notNull(),
  nextAttemptAt: integer("next_attempt_at").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  payload: text("payload").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  lastErrorCode: text("last_error_code"),
  attemptId: text("attempt_id").notNull(),
  acceptedRevision: integer("accepted_revision").notNull(),
  enqueuedAt: integer("enqueued_at").notNull(),
});

export const settingsTable = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type AttemptRow = typeof attemptsTable.$inferSelect;
export type QueueItemRow = typeof queueItemsTable.$inferSelect;
export type SettingsRow = typeof settingsTable.$inferSelect;

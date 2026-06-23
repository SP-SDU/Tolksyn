import { getTableColumns, getTableName } from "drizzle-orm";

import {
  attemptsTable,
  queueItemsTable,
  settingsTable,
} from "@/db/schema";

describe("database schema", () => {
  test("defines attempt columns", () => {
    expect(getTableName(attemptsTable)).toBe("attempts");
    expect(Object.keys(getTableColumns(attemptsTable))).toEqual([
      "id",
      "source",
      "imageUri",
      "thumbnailUri",
      "createdAt",
      "updatedAt",
      "status",
      "acceptedRevision",
      "draftStructuredJson",
      "extractionResult",
      "errorCode",
    ]);
    expect(attemptsTable.id.name).toBe("id");
    expect(attemptsTable.acceptedRevision.name).toBe("accepted_revision");
    expect(attemptsTable.acceptedRevision.default).toBe(0);
  });

  test("defines queue item columns", () => {
    expect(getTableName(queueItemsTable)).toBe("queue_items");
    expect(Object.keys(getTableColumns(queueItemsTable))).toEqual([
      "id",
      "sequence",
      "status",
      "nextAttemptAt",
      "retryCount",
      "payload",
      "idempotencyKey",
      "lastErrorCode",
      "attemptId",
      "acceptedRevision",
      "enqueuedAt",
    ]);
    expect(queueItemsTable.nextAttemptAt.name).toBe("next_attempt_at");
    expect(queueItemsTable.idempotencyKey.name).toBe("idempotency_key");
    expect(queueItemsTable.retryCount.default).toBe(0);
  });

  test("defines settings columns", () => {
    expect(getTableName(settingsTable)).toBe("settings");
    expect(Object.keys(getTableColumns(settingsTable))).toEqual(["key", "value"]);
    expect(settingsTable.key.name).toBe("key");
    expect(settingsTable.value.name).toBe("value");
  });
});

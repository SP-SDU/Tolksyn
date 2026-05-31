import { drizzle } from "drizzle-orm/expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";

import * as schema from "@/db/schema";

export const DATABASE_NAME = "tolksyn.db";

export function createDb(sqliteDb: SQLiteDatabase) {
  return drizzle(sqliteDb, { schema });
}

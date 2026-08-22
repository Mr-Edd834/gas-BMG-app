import * as SQLite from "expo-sqlite";
import { SCHEMA_STATEMENTS } from "./schema";

const DB_NAME = "bmg_shop.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// expo-sqlite is the on-device source of truth (spec Part B §3). Every write
// must succeed with zero internet — this module never talks to the network.
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(SCHEMA_STATEMENTS.join("\n"));
      return db;
    });
  }
  return dbPromise;
}

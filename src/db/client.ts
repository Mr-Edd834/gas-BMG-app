import * as SQLite from "expo-sqlite";
import { SCHEMA_STATEMENTS } from "./schema";

const DB_NAME = "bmg_shop.db";

// expo-sqlite is the on-device source of truth (spec Part B §3). Every write
// must succeed with zero internet — this module never talks to the network.
//
// ---------------------------------------------------------------------------
// WHY EVERY STATEMENT IS QUEUED
// ---------------------------------------------------------------------------
// Opening the add-sale screen used to fire eight statements at once: the
// catalog alone fans out to six, plus stock and recent brands. Add the
// reminder resync that runs at boot and fifteen-plus could be in flight
// together.
//
// That looks like healthy parallelism and is not. There is ONE connection, and
// SQLite runs its statements one at a time regardless — so the concurrency
// bought no speed at all. What it did buy was pressure on expo-sqlite's
// native object registry: every `prepareAsync` creates a NativeStatement that
// has to be paired with a native counterpart, and under that pressure the
// pairing failed, surfacing on the device as:
//
//   "cannot convert provided JavaScript object to the shared object
//    because it doesn't contain valid id"
//
// which the screen reported as "could not open what this shop sells" — a read
// failure with no bad data behind it.
//
// So statements go through one queue. Nothing is lost, because the database
// was serial all along; the only thing that changes is that we now ask for it
// that way instead of stampeding.
//
// The other half is self-healing: a dev reload can leave the JS side holding a
// database handle whose native half is gone. Rather than dead-ending every
// read until the app restarts, a stale-handle error reopens the database once
// and retries.

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function open(): Promise<SQLite.SQLiteDatabase> {
  return SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
    // Every statement is CREATE ... IF NOT EXISTS, so this is safe to run on
    // every open and is how a new table reaches an existing install.
    await db.execAsync(SCHEMA_STATEMENTS.join("\n"));
    return db;
  });
}

function rawDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

// A handle whose native half has been torn down. Matched on the message
// because expo-sqlite does not give this a distinct error type.
function isStaleHandle(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("valid id") ||
    message.includes("NativeStatement") ||
    message.includes("NativeDatabase")
  );
}

let queue: Promise<unknown> = Promise.resolve();
// Set while a transaction's callback is running. Its inner statements must
// bypass the queue, or they would wait behind the transaction that is waiting
// for them — a deadlock. Safe because JavaScript is single-threaded and no
// other queued task can start while the transaction's promise is pending.
let inTransaction = false;

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  if (inTransaction) return run();

  const task = queue.then(run, run);
  // The queue continues past a failure: one broken statement must not stall
  // every later read behind it.
  queue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

/** Runs an operation, reopening the database once if the handle went stale. */
async function withRetry<T>(
  op: (db: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  try {
    return await op(await rawDb());
  } catch (err) {
    if (!isStaleHandle(err)) throw err;
    console.warn("[db] handle went stale — reopening", err);
    dbPromise = null;
    return op(await rawDb());
  }
}

type Bind = SQLite.SQLiteBindValue;

// The surface the rest of the app uses. Deliberately narrow: these five
// methods are everything the queries need, and keeping it small is what makes
// the queueing above complete rather than partial.
export interface Db {
  getAllAsync<T>(source: string, ...params: Bind[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: Bind[]): Promise<T | null>;
  runAsync(source: string, ...params: Bind[]): Promise<SQLite.SQLiteRunResult>;
  execAsync(source: string): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

const db: Db = {
  getAllAsync: <T,>(source: string, ...params: Bind[]) =>
    enqueue(() => withRetry((d) => d.getAllAsync<T>(source, ...params))),

  getFirstAsync: <T,>(source: string, ...params: Bind[]) =>
    enqueue(() => withRetry((d) => d.getFirstAsync<T>(source, ...params))),

  runAsync: (source: string, ...params: Bind[]) =>
    enqueue(() => withRetry((d) => d.runAsync(source, ...params))),

  execAsync: (source: string) =>
    enqueue(() => withRetry((d) => d.execAsync(source))),

  withTransactionAsync: (task: () => Promise<void>) =>
    enqueue(() =>
      withRetry(async (d) => {
        inTransaction = true;
        try {
          await d.withTransactionAsync(task);
        } finally {
          // Cleared even if the transaction throws, or every later statement
          // would silently skip the queue from then on.
          inTransaction = false;
        }
      })
    ),
};

export function getDb(): Promise<Db> {
  // Kept async so the many `await getDb()` call sites stay unchanged, and so
  // the first caller still waits for the schema to be applied.
  return rawDb().then(() => db);
}

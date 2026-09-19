// Runs the REAL record query (pulled out of the source file, not retyped)
// against a throwaway in-memory SQLite with the same tables, to prove the
// UNION ALL parses and interleaves correctly before it reaches a phone.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const src = fs.readFileSync(
  "C:/Users/Macharia/Documents/edd_y/gas BMG app/src/db/queries/refilling.ts",
  "utf8"
);

function sqlStartingWith(prefix) {
  const i = src.indexOf("`" + prefix);
  if (i < 0) throw new Error("could not find SQL starting: " + prefix);
  const end = src.indexOf("`", i + 1);
  return src.slice(i + 1, end);
}

const recordSql = sqlStartingWith("SELECT ev.id, ev.kind");

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE staff (id TEXT PRIMARY KEY, name TEXT);
  CREATE TABLE refill_companies (id TEXT PRIMARY KEY, business_id TEXT, name TEXT,
    director TEXT, phone TEXT, code TEXT, created_at TEXT, updated_at TEXT, synced INT);
  CREATE TABLE refill_batches (id TEXT PRIMARY KEY, business_id TEXT, company_id TEXT,
    batch_code TEXT, note TEXT, sent_at TEXT, staff_id TEXT, created_at TEXT,
    updated_at TEXT, synced INT);
  CREATE TABLE refill_batch_lines (id TEXT PRIMARY KEY, business_id TEXT, batch_id TEXT,
    brand TEXT, size TEXT, qty_sent INT, created_at TEXT, updated_at TEXT, synced INT);
  CREATE TABLE refill_returns (id TEXT PRIMARY KEY, business_id TEXT, batch_id TEXT,
    note TEXT, returned_at TEXT, staff_id TEXT, created_at TEXT, updated_at TEXT, synced INT);
  CREATE TABLE refill_return_lines (id TEXT PRIMARY KEY, business_id TEXT, return_id TEXT,
    brand TEXT, size TEXT, qty_returned INT, created_at TEXT, updated_at TEXT, synced INT);
  CREATE TABLE refill_photos (id TEXT PRIMARY KEY, business_id TEXT, source_type TEXT,
    source_id TEXT, kind TEXT, local_path TEXT, cloud_url TEXT, created_at TEXT,
    updated_at TEXT, synced INT);
`);

const B = "biz-1";
const C = "co-1";
db.prepare("INSERT INTO staff VALUES (?, ?)").run("s1", "Wanjiru");
db.prepare(
  "INSERT INTO refill_batches (id, business_id, company_id, batch_code, note, sent_at, staff_id) VALUES (?,?,?,?,?,?,?)"
).run("b1", B, C, "KGD-11JUL26-01", "Driver Musa", "2026-07-11T16:30:00.000Z", "s1");
db.prepare(
  "INSERT INTO refill_batches (id, business_id, company_id, batch_code, note, sent_at, staff_id) VALUES (?,?,?,?,?,?,?)"
).run("b2", B, C, "KGD-20JUL26-01", null, "2026-07-20T09:00:00.000Z", "s1");
// Two partial returns against the FIRST batch, one of them after the second
// batch was sent — the interleaving that a JS-side merge would get wrong.
db.prepare(
  "INSERT INTO refill_returns (id, business_id, batch_id, note, returned_at, staff_id) VALUES (?,?,?,?,?,?)"
).run("r1", B, "b1", null, "2026-07-14T10:00:00.000Z", "s1");
db.prepare(
  "INSERT INTO refill_returns (id, business_id, batch_id, note, returned_at, staff_id) VALUES (?,?,?,?,?,?)"
).run("r2", B, "b1", "last two", "2026-07-22T11:00:00.000Z", "s1");

const rows = db.prepare(recordSql).all(B, C, B, C, 30, 0);
console.log("rows returned:", rows.length);
for (const r of rows) {
  console.log(`  ${r.at}  ${r.kind.padEnd(8)} ${r.batch_code}  by ${r.staff_name}  note=${r.note ?? "-"}`);
}

const expected = ["returned", "sent", "returned", "sent"];
const got = rows.map((r) => r.kind);
console.log(
  "\ninterleaved newest-first as expected:",
  JSON.stringify(got) === JSON.stringify(expected) ? "YES" : `NO (got ${got})`
);

// A "came back" row must be stamped with when it CAME BACK, never with when
// its batch left. Batch b1 left on 11 July; its two returns are 14 and 22 July.
{
  const backRows = rows.filter((r) => r.kind === "returned");
  const dates = backRows.map((r) => r.at.slice(0, 10));
  const sentDate = "2026-07-11";
  console.log(
    "\nreturned rows dated by returned_at, not sent_at:",
    dates.every((d) => d !== sentDate) &&
      dates.includes("2026-07-14") &&
      dates.includes("2026-07-22")
      ? "YES"
      : `NO (${dates})`,
    dates
  );
  const sentRow = rows.find((r) => r.kind === "sent" && r.batch_code === "KGD-11JUL26-01");
  console.log(
    "and the sent row for the same batch still shows the send date:",
    sentRow.at.slice(0, 10) === sentDate ? "YES" : `NO (${sentRow.at})`
  );
}

// Paging must not duplicate or skip across page boundaries.
const p1 = db.prepare(recordSql).all(B, C, B, C, 2, 0).map((r) => `${r.kind}:${r.id}`);
const p2 = db.prepare(recordSql).all(B, C, B, C, 2, 2).map((r) => `${r.kind}:${r.id}`);
const all = [...p1, ...p2];
console.log("page1:", p1, "page2:", p2);
console.log(
  "paging covers every row exactly once:",
  new Set(all).size === 4 && all.length === 4 ? "YES" : "NO"
);

// And the batch-page query, which must stay returns-only.
const batchSql = sqlStartingWith("SELECT r.id, 'returned' AS kind");
const batchRows = db.prepare(batchSql).all(B, "b1");
console.log(
  "\nbatch page sees only its own returns:",
  batchRows.length === 2 && batchRows.every((r) => r.kind === "returned") ? "YES" : "NO",
  batchRows.map((r) => r.at)
);

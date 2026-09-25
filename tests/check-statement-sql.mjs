// Runs the REAL statement pagination query (read out of the source file, not
// retyped) against an in-memory SQLite.
//
// The thing being proven: the statement no longer silently loses history, and
// paging walks the true merged sequence of sales, repayments and returns
// rather than three separate newest-N windows stitched together.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sqlFromSource } from "./sqlTemplates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(ROOT + "/src/db/queries/ledger.ts", "utf8");
const schemaSrc = fs.readFileSync(ROOT + "/src/db/schema.ts", "utf8");

const sqlStartingWith = (prefix) => sqlFromSource(src, prefix);

const db = new DatabaseSync(":memory:");
for (const m of schemaSrc.matchAll(/`(CREATE (?:UNIQUE )?(?:TABLE|INDEX)[\s\S]*?)`/g)) {
  db.exec(m[1]);
}

const B = "biz-1";
const C = "cust-1";
db.exec(`INSERT INTO businesses (id,name,created_at,updated_at) VALUES ('${B}','BMG','x','x')`);
db.exec(`INSERT INTO staff (id,business_id,name,created_at,updated_at) VALUES ('st1','${B}','Wanjiru','x','x')`);
db.exec(`INSERT INTO customers (id,business_id,name,created_at,updated_at) VALUES ('${C}','${B}','Quick Sale','x','x')`);

const day = (n) => new Date(2026, 0, 1 + n, 10).toISOString();

// The exact shape that defeated the old version: a long run of sales BEFORE
// the first repayment. With three separate "newest 40" windows merged in JS,
// a repayment older than the newest 40 sales could never appear on any page.
for (let i = 0; i < 60; i++) {
  db.prepare(
    `INSERT INTO sales (id,business_id,customer_id,staff_id,cash_amount,credit_amount,sold_at,created_at,updated_at)
     VALUES (?,?,?,?,0,0,?,?,?)`
  ).run(`s${i}`, B, C, "st1", day(i), day(i), day(i));
  db.prepare(
    `INSERT INTO sale_items (id,business_id,sale_id,commodity_type,label,brand_or_supplier,size_or_denomination,qty,unit_price,created_at,updated_at)
     VALUES (?,?,?,'cylinder','K-Gas Big','K-Gas','Big',1,2000,?,?)`
  ).run(`i${i}`, B, `s${i}`, day(i), day(i));
}
// One repayment early in the timeline, against the very first sale.
db.prepare(
  `INSERT INTO repayments (id,business_id,sale_id,customer_id,staff_id,amount,paid_at,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?)`
).run("p1", B, "s0", C, "st1", 2000, day(1), day(1), day(1));
// One empty return, likewise old.
db.prepare(
  `INSERT INTO empty_returns (id,business_id,sale_item_id,customer_id,staff_id,qty,returned_at,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?)`
).run("e1", B, "i0", C, "st1", 1, day(2), day(2), day(2));

let pass = 0;
const fails = [];
function check(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}\n       got  ${a}\n       want ${b}`); }
}

const PAGE_SQL = sqlStartingWith("SELECT ev.id, ev.kind, ev.at FROM (");
const page = (limit, offset) =>
  db.prepare(PAGE_SQL).all(B, C, B, C, B, C, limit, offset);

console.log("\nstatement pagination:");

const all = page(1000, 0);
check("every event is reachable — 60 sales, 1 repayment, 1 return", all.length, 62);

// Walk the whole thing 40 at a time, exactly as the screen does.
const walked = [];
for (let offset = 0; ; offset += 40) {
  const chunk = page(40, offset);
  walked.push(...chunk.map((r) => `${r.kind}:${r.id}`));
  if (chunk.length < 40) break;
}
check("paging reaches all 62 with no duplicates", new Set(walked).size, 62);
check("and returns none of them twice", walked.length, 62);

// The old bug, stated directly: these two old events sit far below the newest
// 40 sales, and a JS merge of three separate windows would never surface them.
check("an old repayment is still reachable", walked.includes("repayment:p1"), true);
check("an old empty return is still reachable", walked.includes("empty-return:e1"), true);

check("newest first", all[0].id, "s59");
check("oldest last", all[all.length - 1].id, "s0");

// Ties must break deterministically or paging duplicates and skips rows.
db.prepare(
  `INSERT INTO repayments (id,business_id,sale_id,customer_id,staff_id,amount,paid_at,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?)`
).run("p_tie", B, "s0", C, "st1", 1, day(30), day(30), day(30));
const first = page(1000, 0).map((r) => r.id);
const second = page(1000, 0).map((r) => r.id);
check("a repayment sharing a sale's timestamp orders deterministically", first, second);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);

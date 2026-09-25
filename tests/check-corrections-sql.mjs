// Proves that a cancelled sale disappears from every figure in the app.
//
// The danger with this feature is not writing a query wrongly — it is
// FORGETTING one. A single money query that still counts a cancelled 60,000
// sale is wrong forever and nothing on screen says so. So this file does two
// things:
//
//   1. A structural sweep: every query that reads sales or sale_items must
//      either carry the filter or be on an explicit list of display-only and
//      lookup queries. A new query added later fails this until someone
//      decides which it is.
//   2. A behavioural run against real SQLite: sell, cancel, and check that
//      the debts, revenue, stock and tab counts all drop back.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Q = ROOT + "/src/db/queries/";

let pass = 0;
const fails = [];
function check(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}\n       got  ${a}\n       want ${b}`); }
}

// ---------------------------------------------------------------------------
// 1. Structural sweep
// ---------------------------------------------------------------------------
console.log("\nevery sales query either filters or is listed as display-only:");

// Queries that legitimately do NOT filter, each with the reason. Anything not
// here must carry the filter.
const ALLOWED = {
  "sales.ts": [
    "JOIN customers c ON c.id = s.customer_id", // SALES_FROM; buildWhere filters it
    "SELECT id, sale_id, commodity_type", // items for already-chosen sales
    "SELECT sale_item_id, SUM(qty) AS qty", // returns for already-chosen sales
    "UPDATE sales SET note",              // editing a note, not counting
    "INSERT INTO",
  ],
  "ledger.ts": [
    "SELECT ev.id, ev.kind, ev.at FROM (", // the statement, which SHOWS cancelled sales
    "SELECT s.id, s.sold_at,",             // description lookup for referenced sales
    "SELECT sale_id, label, qty FROM sale_items", // labels for chosen rows
    "SELECT r.id, r.amount, r.paid_at",    // repayments by id
    "SELECT er.id, er.qty, er.returned_at", // returns by id
    "SELECT sale_id, SUM",
  ],
  "customers.ts": ["SELECT sale_id, label, qty FROM sale_items"],
  "settings.ts": ["SELECT DISTINCT brand_or_supplier"], // "was it ever used", cancelled counts too
  "corrections.ts": ["*"],
  "debts.ts": ["SELECT si.id, si.sale_id", "SELECT sale_item_id", "INSERT INTO", "FROM sale_items WHERE business_id = ?"],
  "reports.ts": [],
  "stock.ts": [],
};

for (const file of fs.readdirSync(Q).filter((f) => f.endsWith(".ts"))) {
  const src = fs.readFileSync(Q + file, "utf8");
  if ((ALLOWED[file] ?? []).includes("*")) continue;

  // Every backtick SQL literal in the file.
  for (const m of src.matchAll(/`([^`]*(?:FROM|JOIN)\s+sale[^`]*)`/g)) {
    const sql = m[1];
    if (!/\b(sales|sale_items)\b/.test(sql)) continue;
    const filtered = /liveSale|liveStockEvent|includeCancelled/.test(sql);
    const allowed = (ALLOWED[file] ?? []).some((a) => sql.includes(a));
    if (!filtered && !allowed) {
      fails.push(`${file}: unfiltered sales query`);
      console.log(`  FAIL ${file}: a sales query neither filters nor is listed\n       ${sql.trim().split("\n")[0]}`);
    }
  }
}
// buildWhere carries the filter for every listSales/summariseSales caller.
check("sales.ts filters by default in buildWhere",
  /if \(!f\.includeCancelled\) clauses\.push\(liveSale/.test(fs.readFileSync(Q + "sales.ts", "utf8")), true);
if (fails.length === 0) console.log("  ok   no unfiltered sales query found");

// ---------------------------------------------------------------------------
// 2. Behavioural run
// ---------------------------------------------------------------------------
const schemaSrc = fs.readFileSync(ROOT + "/src/db/schema.ts", "utf8");
const db = new DatabaseSync(":memory:");
// NOTE the `UNIQUE` here. Without it this regex silently skips every unique
// index, and a test asserting "this cannot happen twice" passes because the
// rule enforcing it was never created. That is exactly what happened first
// time round — the harness was wrong, not the app.
for (const m of schemaSrc.matchAll(/`(CREATE (?:UNIQUE )?(?:TABLE|INDEX)[\s\S]*?)`/g)) {
  db.exec(m[1]);
}

// The real filter text, taken from corrections.ts so it cannot drift.
const corrections = fs.readFileSync(Q + "corrections.ts", "utf8");
const liveSaleTpl = corrections.match(/return `(NOT EXISTS[\s\S]*?)`;/)[1];
const liveStockTpl = corrections.match(/return `(\([\s\S]*?)`;/)[1];
const fill = (sql) =>
  sql
    .replace(/\$\{liveSale\("(\w+)"\)\}/g, (_, a) => liveSaleTpl.replace(/\$\{alias\}/g, a))
    .replace(/\$\{liveStockEvent\("(\w+)"\)\}/g, (_, a) => liveStockTpl.replace(/\$\{alias\}/g, a));

function sqlFrom(file, prefix) {
  const src = fs.readFileSync(Q + file, "utf8");
  const i = src.indexOf("`" + prefix);
  if (i < 0) throw new Error(`not found in ${file}: ${prefix}`);
  return fill(src.slice(i + 1, src.indexOf("`", i + 1)));
}

const B = "b1", C = "c1";
db.exec(`INSERT INTO businesses (id,name,created_at,updated_at) VALUES ('${B}','BMG','x','x')`);
db.exec(`INSERT INTO staff (id,business_id,name,created_at,updated_at) VALUES ('st1','${B}','Wanjiru','x','x')`);
db.exec(`INSERT INTO customers (id,business_id,name,created_at,updated_at) VALUES ('${C}','${B}','Musa','x','x')`);

const AT = new Date(2026, 8, 20, 10).toISOString();
// Edd's example: 2 cylinders at 2,000 meant; 3 at 20,000 typed. All on credit.
function addSale(id, itemId, qty, price) {
  db.prepare(`INSERT INTO sales (id,business_id,customer_id,staff_id,cash_amount,credit_amount,sold_at,created_at,updated_at)
              VALUES (?,?,?,?,0,0,?,?,?)`).run(id, B, C, "st1", AT, AT, AT);
  db.prepare(`INSERT INTO sale_items (id,business_id,sale_id,commodity_type,label,brand_or_supplier,size_or_denomination,qty,unit_price,created_at,updated_at)
              VALUES (?,?,?,'cylinder','K-Gas Big','K-Gas','Big',?,?,?,?)`).run(itemId, B, id, qty, price, AT, AT);
  db.prepare(`INSERT INTO stock_events (id,business_id,event_type,scope,brand,size,qty,staff_id,source_type,source_id,occurred_at,created_at,updated_at)
              VALUES (?,?,'sold','full','K-Gas','Big',?,?, 'sale_item',?,?,?,?)`).run("ev" + id, B, qty, "st1", itemId, AT, AT, AT);
}
addSale("wrong", "iw", 3, 20000);

console.log("\nbefore cancelling — the wrong sale counts everywhere:");
const moneySql = sqlFrom("debts.ts", "SELECT s.id, s.customer_id");
check("the 60,000 debt is there", db.prepare(moneySql).all(B).length, 1);
const revenueSql = sqlFrom("reports.ts", "SELECT s.sold_at AS at");
check("revenue sees it", db.prepare(revenueSql).all(B, AT).map((r) => r.goods_total), [60000]);
const stockSql = sqlFrom("stock.ts", "SELECT brand, size,");
check("3 cylinders are off the shelf", db.prepare(stockSql).all(B)[0].qty, -3);

// Now she fixes it: the wrong sale is cancelled, a correct one replaces it.
addSale("right", "ir", 2, 2000);
db.prepare(`INSERT INTO sale_corrections (id,business_id,cancelled_sale_id,replacement_sale_id,reason,staff_id,created_at,updated_at)
            VALUES ('sc1',?,'wrong','right','typed 3 at 20,000 by mistake','st1',?,?)`).run(B, AT, AT);

console.log("\nafter cancelling — only the corrected sale counts:");
check("one debt, not two", db.prepare(moneySql).all(B).length, 1);
check("and it is the 4,000 one", db.prepare(moneySql).all(B)[0].id, "right");
check("revenue is 4,000, not 64,000", db.prepare(revenueSql).all(B, AT).map((r) => r.goods_total), [4000]);
check("2 cylinders off the shelf, not 5", db.prepare(stockSql).all(B)[0].qty, -2);

const productSql = sqlFrom("reports.ts", "SELECT CASE");
check("best sellers count 2 sold, not 5",
  db.prepare(productSql).all(B, AT, AT).map((r) => r.qty), [2]);

const tabSql = sqlFrom("customers.ts", "SELECT");
check("the customer's tab counts one sale, not two",
  db.prepare(tabSql).all(B)[0].sale_count, 1);

const payerSql = sqlFrom("reports.ts", "SELECT s.id, s.customer_id, c.name AS customer_name");
check("settle-speed sees one debt of 4,000",
  db.prepare(payerSql).all(B).map((r) => r.goods_total), [4000]);

const emptiesSql = sqlFrom("debts.ts", "SELECT si.id, s.customer_id");
check("empties owed comes from the corrected sale only",
  db.prepare(emptiesSql).all(B).map((r) => r.qty), [2]);

// And the record still shows it, which is the entire point.
const shown = db.prepare(
  `SELECT s.id FROM sales s WHERE s.business_id = ? ORDER BY s.id`
).all(B).map((r) => r.id);
check("the book still holds both rows", shown, ["right", "wrong"]);
check("and knows which was cancelled",
  db.prepare("SELECT cancelled_sale_id, replacement_sale_id FROM sale_corrections").all(),
  [{ cancelled_sale_id: "wrong", replacement_sale_id: "right" }]);

// A sale can only be cancelled once.
let doubleBlocked = false;
try {
  db.prepare(`INSERT INTO sale_corrections (id,business_id,cancelled_sale_id,replacement_sale_id,reason,staff_id,created_at,updated_at)
              VALUES ('sc2',?,'wrong',NULL,NULL,'st1',?,?)`).run(B, AT, AT);
} catch { doubleBlocked = true; }
check("the same sale cannot be cancelled twice", doubleBlocked, true);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);

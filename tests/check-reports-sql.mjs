// Runs the REAL Reports queries (pulled out of the source file, not retyped)
// against an in-memory SQLite, to prove they parse and return the right
// numbers before the screen is built on top of them.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const root = "C:/Users/Macharia/Documents/edd_y/gas BMG app";
const src = fs.readFileSync(root + "/src/db/queries/reports.ts", "utf8");
const schemaSrc = fs.readFileSync(root + "/src/db/schema.ts", "utf8");

function sqlStartingWith(prefix) {
  const i = src.indexOf("`" + prefix);
  if (i < 0) throw new Error("SQL not found: " + prefix);
  return src.slice(i + 1, src.indexOf("`", i + 1));
}

// Build the real schema out of schema.ts, so the queries run against the
// actual tables rather than a hand-written approximation that might differ.
const db = new DatabaseSync(":memory:");
for (const m of schemaSrc.matchAll(/`(CREATE (?:TABLE|INDEX)[\s\S]*?)`/g)) {
  db.exec(m[1]);
}

const B = "biz-1";
db.exec(`INSERT INTO businesses (id, name, created_at, updated_at) VALUES ('${B}','BMG','x','x')`);
db.exec(`INSERT INTO staff (id, business_id, name, created_at, updated_at) VALUES ('st1','${B}','Wanjiru','x','x')`);
db.exec(`INSERT INTO customers (id, business_id, name, created_at, updated_at) VALUES ('c1','${B}','Musa','x','x')`);
db.exec(`INSERT INTO customers (id, business_id, name, created_at, updated_at) VALUES ('c2','${B}','Achieng','x','x')`);

let n = 0;
function sale(id, customer, soldAt, cash, items) {
  db.prepare(
    `INSERT INTO sales (id, business_id, customer_id, staff_id, cash_amount, credit_amount, sold_at, created_at, updated_at)
     VALUES (?,?,?,?,?,0,?,?,?)`
  ).run(id, B, customer, "st1", cash, soldAt, soldAt, soldAt);
  for (const it of items) {
    db.prepare(
      `INSERT INTO sale_items (id, business_id, sale_id, commodity_type, label, brand_or_supplier, size_or_denomination, qty, unit_price, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(`i${++n}`, B, id, it.type, it.label, it.brand, it.size ?? null, it.qty, it.price, soldAt, soldAt);
  }
}
function repay(id, saleId, customer, amount, at) {
  db.prepare(
    `INSERT INTO repayments (id, business_id, sale_id, customer_id, staff_id, amount, paid_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, B, saleId, customer, "st1", amount, at, at, at);
}

const d = (day, hour = 10) => new Date(2026, 8, day, hour).toISOString();

// s1: 2000 of cylinders, 500 cash -> 1500 credit. Cleared in two payments.
sale("s1", "c1", d(1), 500, [{ type: "cylinder", label: "K-Gas Big", brand: "K-Gas", size: "Big", qty: 1, price: 2000 }]);
repay("p1", "s1", "c1", 700, d(3));
repay("p2", "s1", "c1", 800, d(20));

// s2: mixed sale, fully unpaid. 3000 cylinder + 1000 airtime = 4000 owed.
sale("s2", "c2", d(14), 0, [
  { type: "cylinder", label: "K-Gas Small", brand: "K-Gas", size: "Small", qty: 2, price: 1500 },
  { type: "airtime", label: "Safaricom 100", brand: "Safaricom", size: "100", qty: 20, price: 50 },
]);

// s3: cash sale today, no debt.
sale("s3", "c1", d(16), 950, [{ type: "airtime", label: "Safaricom 50", brand: "Safaricom", size: "50", qty: 20, price: 47.5 }]);

let pass = 0;
const fails = [];
function check(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log(`  ok  ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}\n       got  ${a}\n       want ${b}`); }
}

console.log("\nloadSaleTotalsSince:");
const totals = db.prepare(sqlStartingWith("SELECT s.sold_at AS at")).all(B, d(1, 0));
check("three sales, totals summed from line items", totals.map((r) => r.goods_total), [2000, 4000, 950]);
// The bug guard: cash_amount is how it was PAID, never the sale's value.
check("a fully-unpaid sale still has its full value", totals[1].goods_total, 4000);
check("and its cash is zero", totals[1].cash_amount, 0);

console.log("\nloadProductTotals:");
const products = db.prepare(sqlStartingWith("SELECT CASE")).all(B, d(1, 0), d(16, 23));
// Assert on the ROW COUNT first. Building a map keyed by name would
// silently swallow a duplicate row — which is exactly how the GROUP BY bug
// nearly slipped through: two 'Safaricom airtime' rows collapsed into one map
// entry and only the quantity looked wrong.
check('each product appears exactly once', products.length, 3);
const byLabel = Object.fromEntries(products.map((p) => [p.product, { qty: p.qty, revenue: p.revenue }]));
check("cylinders are labelled brand · size", byLabel["K-Gas · Big"], { qty: 1, revenue: 2000 });
check("airtime is labelled by supplier", byLabel["Safaricom airtime"], { qty: 40, revenue: 1950 });


console.log("\nloadDebtByCommodity:");
const debtRows = db.prepare(sqlStartingWith("SELECT i.sale_id,")).all(B, B);
const byCommodity = new Map();
for (const row of debtRows) {
  const outstanding = Math.max(0, row.goods_total - row.cash_amount - row.paid);
  if (outstanding <= 0 || row.goods_total <= 0) continue;
  const share = row.line_value / row.goods_total;
  byCommodity.set(row.commodity_type, (byCommodity.get(row.commodity_type) ?? 0) + outstanding * share);
}
// s1 is fully repaid so contributes nothing; s2 splits 4000 by line value.
check("a cleared debt contributes nothing", byCommodity.has("cylinder") ? Math.round(byCommodity.get("cylinder")) : 0, 3000);
check("a mixed unpaid sale is split by each line's share", Math.round(byCommodity.get("airtime")), 1000);
check("the split adds back to the amount actually owed",
  Math.round([...byCommodity.values()].reduce((a, b) => a + b, 0)), 4000);

console.log("\nloadPayerHistories:");
const payerSales = db.prepare(sqlStartingWith("SELECT s.id, s.customer_id, c.name AS customer_name")).all(B);
check("every sale comes back with its customer", payerSales.length, 3);
const s1 = payerSales.find((r) => r.id === "s1");
check("s1's principal is goods minus cash", s1.goods_total - s1.cash_amount, 1500);
const reps = db.prepare(sqlStartingWith("SELECT sale_id, amount, paid_at FROM repayments")).all(B);
check("both repayments load, oldest first", reps.map((r) => r.amount), [700, 800]);

console.log(`\n${pass} passed, ${fails.length} failed`);
// exit moved to end

console.log("\nDEBUG products:", JSON.stringify(products, null, 1));
console.log("DEBUG range:", d(1,0), "->", d(16,23));
console.log("DEBUG all items:", JSON.stringify(db.prepare("SELECT i.id,i.commodity_type,i.brand_or_supplier,i.size_or_denomination,i.qty,i.unit_price,s.sold_at FROM sale_items i JOIN sales s ON s.id=i.sale_id").all(), null, 1));

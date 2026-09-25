import { getDb } from "../client";
import { liveSale } from "./corrections";

import { generateId } from "../../lib/uuid";
import { insertStockEvent } from "./stock";
import {
  debtOutstanding,
  debtPrincipal,
  emptiesOutstanding,
  mostUrgent,
  urgencyOf,
  type Urgency,
} from "../../debts/rules";

// The Debts section reads; it never creates sales. Everything here is derived
// from rows Home/Sales already wrote (spec Part C §2 §1, §10).
//
// Note there is no "debts" table anywhere. A debt is not a thing the app
// stores — it is what a credit sale LOOKS like once you subtract what has come
// back. Storing it would mean two truths that can disagree (G1), and the one
// that disagreed would be the one showing a shopkeeper the wrong number.

export interface MoneyDebt {
  saleId: string;
  soldAt: string;
  description: string;
  principal: number;
  paid: number;
  outstanding: number;
  urgency: Urgency;
}

export interface CustomerMoneyDebts {
  customerId: string;
  customerName: string;
  debts: MoneyDebt[];
  totalOutstanding: number;
  urgency: Urgency;
}

/**
 * Every customer with money outstanding right now, most urgent first.
 *
 * Customers who owe nothing simply do not appear (spec §4) — a settled debt
 * leaves the list and lives on only in the record.
 */
export async function listMoneyDebts(
  businessId: string
): Promise<CustomerMoneyDebts[]> {
  const db = await getDb();

  // One pass over sales joined to their items and repayments. Done as three
  // flat queries rather than a query per sale: she extends credit widely, and
  // a per-row query would turn one screen into hundreds of round trips.
  const sales = await db.getAllAsync<{
    id: string;
    customer_id: string;
    customer_name: string;
    cash_amount: number;
    sold_at: string;
  }>(
    `SELECT s.id, s.customer_id, c.name AS customer_name,
            s.cash_amount, s.sold_at
     FROM sales s
     JOIN customers c ON c.id = s.customer_id
     WHERE s.business_id = ? AND ${liveSale("s")}
     ORDER BY s.sold_at ASC`,
    businessId
  );
  if (sales.length === 0) return [];

  const items = await db.getAllAsync<{
    sale_id: string;
    label: string;
    qty: number;
    unit_price: number;
  }>(
    `SELECT sale_id, label, qty, unit_price
     FROM sale_items WHERE business_id = ?
     ORDER BY created_at ASC`,
    businessId
  );

  const repayments = await db.getAllAsync<{ sale_id: string; amount: number }>(
    `SELECT sale_id, amount FROM repayments WHERE business_id = ?`,
    businessId
  );

  const itemsBySale = new Map<string, { qty: number; unitPrice: number; label: string }[]>();
  for (const i of items) {
    const list = itemsBySale.get(i.sale_id) ?? [];
    list.push({ qty: i.qty, unitPrice: i.unit_price, label: i.label });
    itemsBySale.set(i.sale_id, list);
  }

  const repaymentsBySale = new Map<string, { amount: number }[]>();
  for (const r of repayments) {
    const list = repaymentsBySale.get(r.sale_id) ?? [];
    list.push({ amount: r.amount });
    repaymentsBySale.set(r.sale_id, list);
  }

  const byCustomer = new Map<string, CustomerMoneyDebts>();

  for (const sale of sales) {
    const saleItems = itemsBySale.get(sale.id) ?? [];
    const principal = debtPrincipal(saleItems, sale.cash_amount);
    if (principal <= 0) continue; // paid fully in cash — never was a debt

    const saleRepayments = repaymentsBySale.get(sale.id) ?? [];
    const outstanding = debtOutstanding(principal, saleRepayments);
    if (outstanding <= 0) continue; // settled — it belongs to the record now

    const paid = principal - outstanding;
    const entry = byCustomer.get(sale.customer_id) ?? {
      customerId: sale.customer_id,
      customerName: sale.customer_name,
      debts: [],
      totalOutstanding: 0,
      urgency: "on-track" as Urgency,
    };

    entry.debts.push({
      saleId: sale.id,
      soldAt: sale.sold_at,
      description: saleItems.map((i) => `${i.label} ×${i.qty}`).join(", "),
      principal,
      paid,
      outstanding,
      urgency: urgencyOf(sale.sold_at),
    });
    entry.totalOutstanding += outstanding;
    byCustomer.set(sale.customer_id, entry);
  }

  const result = [...byCustomer.values()];
  for (const c of result) {
    // A customer card wears their worst debt's dot (spec §7).
    c.urgency = mostUrgent(c.debts.map((d) => d.urgency));
    c.debts.sort((a, b) => a.soldAt.localeCompare(b.soldAt));
  }
  return result;
}

export interface EmptiesBatch {
  saleItemId: string;
  soldAt: string;
  brand: string;
  size: string;
  taken: number;
  outstanding: number;
  urgency: Urgency;
}

export interface CustomerEmptiesDebts {
  customerId: string;
  customerName: string;
  batches: EmptiesBatch[];
  totalOutstanding: number;
  urgency: Urgency;
}

/**
 * Every customer still holding empties, most urgent first.
 *
 * Independent of money (spec §1): she can be square on cash and still owe six
 * cylinders. The two are never summed into one "balance", because they are
 * settled by completely different acts — one by paying, one by carrying metal
 * back to the shop.
 */
export async function listEmptiesDebts(
  businessId: string
): Promise<CustomerEmptiesDebts[]> {
  const db = await getDb();

  const rows = await db.getAllAsync<{
    id: string;
    customer_id: string;
    customer_name: string;
    brand_or_supplier: string | null;
    size_or_denomination: string | null;
    qty: number;
    empties_returned: number | null;
    sold_at: string;
  }>(
    `SELECT si.id, s.customer_id, c.name AS customer_name,
            si.brand_or_supplier, si.size_or_denomination,
            si.qty, si.empties_returned, s.sold_at
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN customers c ON c.id = s.customer_id
     WHERE si.business_id = ? AND si.commodity_type = 'cylinder'
       AND ${liveSale("s")}
     ORDER BY s.sold_at ASC`,
    businessId
  );
  if (rows.length === 0) return [];

  const returns = await db.getAllAsync<{ sale_item_id: string; qty: number }>(
    `SELECT sale_item_id, qty FROM empty_returns WHERE business_id = ?`,
    businessId
  );
  const returnsByItem = new Map<string, { qty: number }[]>();
  for (const r of returns) {
    const list = returnsByItem.get(r.sale_item_id) ?? [];
    list.push({ qty: r.qty });
    returnsByItem.set(r.sale_item_id, list);
  }

  const byCustomer = new Map<string, CustomerEmptiesDebts>();

  for (const row of rows) {
    const outstanding = emptiesOutstanding(
      row.qty,
      row.empties_returned,
      returnsByItem.get(row.id) ?? []
    );
    if (outstanding <= 0) continue;

    const entry = byCustomer.get(row.customer_id) ?? {
      customerId: row.customer_id,
      customerName: row.customer_name,
      batches: [],
      totalOutstanding: 0,
      urgency: "on-track" as Urgency,
    };

    entry.batches.push({
      saleItemId: row.id,
      soldAt: row.sold_at,
      brand: row.brand_or_supplier ?? "Unknown",
      size: row.size_or_denomination ?? "",
      taken: row.qty,
      outstanding,
      urgency: urgencyOf(row.sold_at),
    });
    entry.totalOutstanding += outstanding;
    byCustomer.set(row.customer_id, entry);
  }

  const result = [...byCustomer.values()];
  for (const c of result) {
    c.urgency = mostUrgent(c.batches.map((b) => b.urgency));
    c.batches.sort((a, b) => a.soldAt.localeCompare(b.soldAt));
  }
  return result;
}

/**
 * Record one repayment against one specific debt (spec §4).
 *
 * Append-only: this never updates a balance anywhere, because no balance is
 * stored. The debt's outstanding figure changes purely because a new row now
 * exists for the next recomputation to subtract.
 */
export async function recordRepayment(input: {
  businessId: string;
  saleId: string;
  customerId: string;
  staffId: string;
  amount: number;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO repayments
       (id, business_id, sale_id, customer_id, staff_id, amount, paid_at,
        created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    generateId(),
    input.businessId,
    input.saleId,
    input.customerId,
    input.staffId,
    input.amount,
    now,
    now,
    now
  );
}

/**
 * Record empties coming back against one specific batch (spec §5).
 *
 * Writes TWO facts in one transaction, and the second is easy to forget:
 *  1. the customer owes fewer empties (this table), and
 *  2. the shop now physically HOLDS those empties — a `received` event on the
 *     shared ledger, which is what makes "empties in hand" truthful when the
 *     refill supplier arrives (spec §5 data-model rule).
 *
 * They must commit together. A return recorded without the received event
 * would clear the customer's obligation while the cylinders appear not to
 * exist anywhere — the shop would under-count what it can send for refill.
 */
export async function recordEmptyReturn(input: {
  businessId: string;
  saleItemId: string;
  customerId: string;
  staffId: string;
  brand: string;
  size: string;
  qty: number;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO empty_returns
         (id, business_id, sale_item_id, customer_id, staff_id, qty,
          returned_at, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      generateId(),
      input.businessId,
      input.saleItemId,
      input.customerId,
      input.staffId,
      input.qty,
      now,
      now,
      now
    );

    await insertStockEvent({
      businessId: input.businessId,
      eventType: "received",
      scope: "empty",
      brand: input.brand,
      size: input.size,
      qty: input.qty,
      staffId: input.staffId,
      sourceType: "empty_return",
      sourceId: input.saleItemId,
      occurredAt: now,
    });
  });
}

/**
 * Empties physically in the shop, per brand+size (spec §5).
 *
 * in hand = opening-count + received − sent (+ manual adjustments)
 *
 * READ-ONLY here. The action that reduces it — sending empties to a refiller —
 * belongs to the Refilling section, which owns that event. Until that section
 * exists this number only ever grows, which is correct rather than broken:
 * nothing has left the shop yet as far as the app has been told.
 */
export async function loadEmptiesInHand(
  businessId: string
): Promise<{ rows: { brand: string; size: string; qty: number }[]; total: number }> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    brand: string;
    size: string;
    qty: number;
  }>(
    `SELECT brand, size,
            SUM(CASE WHEN event_type = 'sent' THEN -qty ELSE qty END) AS qty
     FROM stock_events
     WHERE business_id = ? AND scope = 'empty'
     GROUP BY brand, size
     HAVING qty > 0
     ORDER BY brand ASC, size ASC`,
    businessId
  );
  return { rows, total: rows.reduce((sum, r) => sum + r.qty, 0) };
}

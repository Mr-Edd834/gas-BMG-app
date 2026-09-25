import { getDb } from "../client";
import { liveSale } from "./corrections";

import type { DebtHistory } from "../../reports/kpis";

// Reads for the Reports section (spec Part C §5 §5).
//
// Reports captures nothing and stores nothing. Every figure is computed at
// read time from records the other sections already wrote (G1), which is why
// this file is all SELECTs and why adding a KPI never needs a migration.
//
// Standing figures — what is owed right now — deliberately come from
// `listMoneyDebts` / `listEmptiesDebts` in `debts.ts` rather than from new SQL
// here. Those already derive a balance the careful way, and the one time this
// app showed a wrong number it was because a second code path computed a debt
// differently ("Fully paid" on unpaid debts). One derivation, reused.

export interface ReportSale {
  at: string;
  total: number;
  credit: number;
}

/**
 * Lightweight sale totals since a date, for revenue, the credit-reliance
 * trend and busiest days.
 *
 * The total is SUMMED FROM THE LINE ITEMS, never read as
 * `cash_amount + credit_amount`. Those two columns record how the sale was
 * paid for, and trusting them as the sale's value is exactly the bug that
 * once made unpaid debts read as "Fully paid". The goods total is the truth;
 * the credit portion is whatever the cash did not cover.
 */
export async function loadSaleTotalsSince(
  businessId: string,
  sinceIso: string
): Promise<ReportSale[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    at: string;
    goods_total: number;
    cash_amount: number;
  }>(
    `SELECT s.sold_at AS at,
            COALESCE(SUM(i.qty * i.unit_price), 0) AS goods_total,
            s.cash_amount
     FROM sales s
     LEFT JOIN sale_items i ON i.sale_id = s.id
     WHERE s.business_id = ? AND s.sold_at >= ? AND ${liveSale("s")}
     GROUP BY s.id
     ORDER BY s.sold_at ASC`,
    businessId,
    sinceIso
  );

  return rows.map((r) => ({
    at: r.at,
    total: r.goods_total,
    credit: Math.max(0, r.goods_total - r.cash_amount),
  }));
}

export interface ProductTotalRow {
  label: string;
  qty: number;
  revenue: number;
}

/**
 * Units and revenue per product within a range (spec §4.7).
 *
 * "Product" is the commodity line's identity — "K-Gas · Small",
 * "Safaricom airtime" — built from brand and size rather than from the stored
 * `label`, so the same thing sold on two different days always groups
 * together even if the label text is ever reworded.
 */
export async function loadProductTotals(
  businessId: string,
  fromIso: string,
  toIso: string
): Promise<ProductTotalRow[]> {
  const db = await getDb();
  // The alias is `product`, NOT `label`. `sale_items` has a real column called
  // `label`, and in GROUP BY SQLite resolves a real column ahead of an output
  // alias — so `GROUP BY label` silently groups by the stored text instead of
  // by the computed identity. That produced two separate "Safaricom airtime"
  // rows (one per denomination) with the numbers split between them, which
  // would have halved airtime in the best-seller ranking. Caught by running
  // the query rather than by reading it.
  const rows = await db.getAllAsync<{
    product: string;
    qty: number;
    revenue: number;
  }>(
    `SELECT CASE
              WHEN i.commodity_type = 'airtime'
                THEN COALESCE(i.brand_or_supplier, 'Airtime') || ' airtime'
              WHEN i.size_or_denomination IS NOT NULL AND i.size_or_denomination <> ''
                THEN COALESCE(i.brand_or_supplier, i.label) || ' · ' || i.size_or_denomination
              ELSE COALESCE(i.brand_or_supplier, i.label)
            END AS product,
            SUM(i.qty) AS qty,
            SUM(i.qty * i.unit_price) AS revenue
     FROM sale_items i
     JOIN sales s ON s.id = i.sale_id
     WHERE i.business_id = ? AND s.sold_at >= ? AND s.sold_at <= ?
       AND ${liveSale("s")}
     GROUP BY product
     ORDER BY qty DESC`,
    businessId,
    fromIso,
    toIso
  );

  return rows.map((r) => ({ label: r.product, qty: r.qty, revenue: r.revenue }));
}

export interface CommodityDebt {
  commodity: string;
  amount: number;
}

/**
 * Outstanding money split by what it was owed FOR (spec §4.5).
 *
 * A sale can mix commodities — a cylinder and airtime on one credit ticket —
 * and the debt is a single balance against the whole sale, so there is no
 * stored answer to "how much of this is cylinder debt". It is apportioned by
 * each commodity's share of the sale's value: a 2,000/- unpaid sale that was
 * 75% cylinders contributes 1,500/- to cylinder debt.
 *
 * Why it is worth splitting at all: cylinder debt drags unreturned empties
 * along behind it, so the same shilling owed carries a different risk
 * depending on what bought it.
 */
export async function loadDebtByCommodity(
  businessId: string
): Promise<CommodityDebt[]> {
  const db = await getDb();

  const rows = await db.getAllAsync<{
    sale_id: string;
    commodity_type: string;
    line_value: number;
    goods_total: number;
    cash_amount: number;
    paid: number;
  }>(
    `SELECT i.sale_id,
            i.commodity_type,
            SUM(i.qty * i.unit_price) AS line_value,
            totals.goods_total,
            totals.cash_amount,
            totals.paid
     FROM sale_items i
     JOIN (SELECT s.id,
                  s.cash_amount,
                  COALESCE(SUM(li.qty * li.unit_price), 0) AS goods_total,
                  COALESCE((SELECT SUM(r.amount) FROM repayments r
                            WHERE r.sale_id = s.id), 0) AS paid
           FROM sales s
           LEFT JOIN sale_items li ON li.sale_id = s.id
           WHERE s.business_id = ? AND ${liveSale("s")}
           GROUP BY s.id) totals
       ON totals.id = i.sale_id
     WHERE i.business_id = ?
     GROUP BY i.sale_id, i.commodity_type`,
    businessId,
    businessId
  );

  const byCommodity = new Map<string, number>();
  for (const row of rows) {
    const outstanding = Math.max(
      0,
      row.goods_total - row.cash_amount - row.paid
    );
    if (outstanding <= 0 || row.goods_total <= 0) continue;
    const share = row.line_value / row.goods_total;
    byCommodity.set(
      row.commodity_type,
      (byCommodity.get(row.commodity_type) ?? 0) + outstanding * share
    );
  }

  return [...byCommodity.entries()]
    .map(([commodity, amount]) => ({ commodity, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export interface PayerHistory {
  customerId: string;
  customerName: string;
  purchases: number;
  debts: DebtHistory[];
}

/**
 * Every credit sale ever made, with its repayments, grouped by customer —
 * the raw material for settle-speed (spec §4.6).
 *
 * All-time on purpose, and including debts long since cleared: the KPI is
 * precisely "how fast do they usually pay", which is a question about
 * finished debts. Restricting it to a period would answer a different, less
 * useful question.
 */
export async function loadPayerHistories(
  businessId: string
): Promise<PayerHistory[]> {
  const db = await getDb();

  const sales = await db.getAllAsync<{
    id: string;
    customer_id: string;
    customer_name: string;
    sold_at: string;
    goods_total: number;
    cash_amount: number;
  }>(
    `SELECT s.id, s.customer_id, c.name AS customer_name, s.sold_at,
            COALESCE(SUM(i.qty * i.unit_price), 0) AS goods_total,
            s.cash_amount
     FROM sales s
     JOIN customers c ON c.id = s.customer_id
     LEFT JOIN sale_items i ON i.sale_id = s.id
     WHERE s.business_id = ? AND ${liveSale("s")}
     GROUP BY s.id
     ORDER BY s.sold_at ASC`,
    businessId
  );
  if (sales.length === 0) return [];

  const repayments = await db.getAllAsync<{
    sale_id: string;
    amount: number;
    paid_at: string;
  }>(
    `SELECT sale_id, amount, paid_at FROM repayments
     WHERE business_id = ?
     ORDER BY paid_at ASC`,
    businessId
  );

  const paymentsBySale = new Map<string, { at: string; amount: number }[]>();
  for (const r of repayments) {
    const list = paymentsBySale.get(r.sale_id) ?? [];
    list.push({ at: r.paid_at, amount: r.amount });
    paymentsBySale.set(r.sale_id, list);
  }

  const byCustomer = new Map<string, PayerHistory>();
  for (const sale of sales) {
    const entry = byCustomer.get(sale.customer_id) ?? {
      customerId: sale.customer_id,
      customerName: sale.customer_name,
      // Purchase volume is context for the settle-speed figure: a slow payer
      // who buys a lot is a different decision from one who buys little.
      // Counted here rather than stored anywhere (G1).
      purchases: 0,
      debts: [],
    };
    entry.purchases += 1;

    const principal = Math.max(0, sale.goods_total - sale.cash_amount);
    if (principal > 0) {
      entry.debts.push({
        takenAt: sale.sold_at,
        principal,
        repayments: paymentsBySale.get(sale.id) ?? [],
      });
    }
    byCustomer.set(sale.customer_id, entry);
  }

  return [...byCustomer.values()];
}

export interface EmptiesHistory {
  customerId: string;
  customerName: string;
  // Deliberately the same shape as a money debt, so `daysToClear` and
  // `settleSpeed` work on it unchanged. An empty owed and a shilling owed
  // behave identically in time: taken on a date, given back in instalments,
  // finished when the balance reaches zero. Reusing the arithmetic means
  // empties turnaround inherits the one rule that matters — measured to the
  // return that CLEARS the line, not to the first one — instead of a second
  // implementation drifting away from it.
  cylinders: DebtHistory[];
}

/**
 * How long customers take to bring empties back.
 *
 * The mirror of settle speed for the other half of what this app tracks.
 * Empties are half the reason the paper notebook failed, and until now they
 * had no presence in Reports at all.
 *
 * `principal` is what was still owed after the sale-time handover: a customer
 * who brings two empties while buying two full cylinders owes nothing and
 * never enters this measure.
 */
export async function loadEmptiesHistories(
  businessId: string
): Promise<EmptiesHistory[]> {
  const db = await getDb();

  const items = await db.getAllAsync<{
    id: string;
    customer_id: string;
    customer_name: string;
    qty: number;
    empties_returned: number | null;
    sold_at: string;
  }>(
    `SELECT si.id, s.customer_id, c.name AS customer_name,
            si.qty, si.empties_returned, s.sold_at
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN customers c ON c.id = s.customer_id
     WHERE si.business_id = ? AND si.commodity_type = 'cylinder'
       AND ${liveSale("s")}
     ORDER BY s.sold_at ASC`,
    businessId
  );
  if (items.length === 0) return [];

  const returns = await db.getAllAsync<{
    sale_item_id: string;
    qty: number;
    returned_at: string;
  }>(
    `SELECT sale_item_id, qty, returned_at FROM empty_returns
     WHERE business_id = ?
     ORDER BY returned_at ASC`,
    businessId
  );

  const returnsByItem = new Map<string, { at: string; amount: number }[]>();
  for (const r of returns) {
    const list = returnsByItem.get(r.sale_item_id) ?? [];
    list.push({ at: r.returned_at, amount: r.qty });
    returnsByItem.set(r.sale_item_id, list);
  }

  const byCustomer = new Map<string, EmptiesHistory>();
  for (const item of items) {
    const owed = Math.max(0, item.qty - (item.empties_returned ?? 0));
    if (owed <= 0) continue;

    const entry = byCustomer.get(item.customer_id) ?? {
      customerId: item.customer_id,
      customerName: item.customer_name,
      cylinders: [],
    };
    entry.cylinders.push({
      takenAt: item.sold_at,
      principal: owed,
      repayments: returnsByItem.get(item.id) ?? [],
    });
    byCustomer.set(item.customer_id, entry);
  }

  return [...byCustomer.values()];
}

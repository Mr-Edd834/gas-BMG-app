import { getDb } from "../client";
import { generateId } from "../../lib/uuid";
import { insertStockEvent } from "./stock";
import type { CartLine } from "../../sales/types";
import type { CommodityType } from "../../types/db";

export interface NewSaleInput {
  businessId: string;
  customerId: string;
  staffId: string;
  lines: CartLine[];
  cashAmount: number;
  creditAmount: number;
  note: string | null;
  receiptPhotoLocalPath: string | null;
}

// Writes a sale, its items, and the stock/empties ledger events it causes —
// all in ONE local transaction, entirely offline (G8: expo-sqlite is the
// source of truth, nothing here touches the network or can fail on no signal).
// Either the whole sale lands or none of it does, so the ledger can never end
// up holding a `sold` event for a sale that isn't there.
//
// Note for later sections: withTransactionAsync is atomic but NOT exclusive —
// expo-sqlite allows other async queries to interleave into it. That is fine
// here because a save is one user action on one device with no other writer
// running. If a future section introduces genuinely concurrent writes, it
// wants withExclusiveTransactionAsync, not this.
//
// Attribution is automatic (G6): staffId comes from this phone's identity, and
// sold_at is stamped here, so the shopkeeper taps neither.
export async function createSale(input: NewSaleInput): Promise<string> {
  const db = await getDb();
  const saleId = generateId();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO sales
         (id, business_id, customer_id, staff_id, cash_amount, credit_amount,
          note, receipt_photo_local_path, receipt_photo_cloud_url, sold_at,
          created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)`,
      saleId,
      input.businessId,
      input.customerId,
      input.staffId,
      input.cashAmount,
      input.creditAmount,
      input.note,
      input.receiptPhotoLocalPath,
      now,
      now,
      now
    );

    for (const line of input.lines) {
      const itemId = generateId();
      await db.runAsync(
        `INSERT INTO sale_items
           (id, business_id, sale_id, commodity_type, label, brand_or_supplier,
            size_or_denomination, qty, unit_price, is_auto_priced,
            empties_returned, created_at, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        itemId,
        input.businessId,
        saleId,
        line.commodity,
        line.label,
        line.brandOrSupplier,
        line.sizeOrDenomination,
        line.qty,
        line.unitPrice,
        line.isAutoPriced ? 1 : 0,
        line.emptiesReturned,
        now,
        now
      );

      // Lean stock wiring, spec Part C §1 §7b (RETRO-NOTE) — cylinders only.
      // Airtime/burners/cookers are deliberately NOT stock-tracked at MVP.
      if (line.commodity !== "cylinder") continue;
      if (!line.brandOrSupplier || !line.sizeOrDenomination) continue;

      // Full stock goes down by what was sold. Without this the opening count
      // and every Reports stock figure would never move.
      await insertStockEvent({
        businessId: input.businessId,
        eventType: "sold",
        scope: "full",
        brand: line.brandOrSupplier,
        size: line.sizeOrDenomination,
        qty: line.qty,
        staffId: input.staffId,
        sourceType: "sale_item",
        sourceId: itemId,
        occurredAt: now,
      });

      // An empty handed over at the counter is a SEPARATE movement: empties in
      // hand go up. One cylinder sale can therefore write both events.
      const empties = line.emptiesReturned ?? 0;
      if (empties > 0) {
        await insertStockEvent({
          businessId: input.businessId,
          eventType: "received",
          scope: "empty",
          brand: line.brandOrSupplier,
          size: line.sizeOrDenomination,
          qty: empties,
          staffId: input.staffId,
          sourceType: "sale_item",
          sourceId: itemId,
          occurredAt: now,
        });
      }
    }
  });

  return saleId;
}

export interface SaleItemRecord {
  id: string;
  commodityType: CommodityType;
  label: string;
  qty: number;
  unitPrice: number;
  isAutoPriced: boolean;
  // Handed over at the counter, at the moment of sale.
  emptiesReturned: number | null;
  // Brought back afterwards, via the Debts section. Kept separate from the
  // at-sale count because they are different events on different days — and
  // because without it this screen would still show the original shortfall
  // long after the cylinders had actually come back.
  emptiesReturnedLater: number;
}

export interface SaleRecord {
  id: string;
  soldAt: string;
  cashAmount: number;
  creditAmount: number;
  note: string | null;
  receiptPhotoLocalPath: string | null;
  staffName: string;
  // Present on every row, used by the global record. The per-customer history
  // ignores them — it already knows whose page it is.
  customerName: string;
  isQuickSale: boolean;
  items: SaleItemRecord[];
}

// Filters for the global record (spec Part C §3 §4). Applied in SQL rather
// than in JS because the list is paginated: filtering a page after fetching it
// would show fewer rows than the page size and silently drop matches.
export interface SalesFilter {
  businessId: string;
  customerId?: string;
  // Matches customer name, case-insensitive.
  search?: string;
  // 'cash' = nothing was left owing; 'credit' = something was.
  kind?: "all" | "cash" | "credit" | "quick";
  // ISO bounds, inclusive.
  fromIso?: string;
  toIso?: string;
  // Exactly these sales, in place of a range. Used by the per-customer
  // statement, which decides WHICH events belong on a page by merging three
  // tables and then needs the sales for that page — hydrated through this same
  // path so items, photos and empties are attached identically to everywhere
  // else (spec §5, one data source).
  saleIds?: string[];
}

// SQL shared by every sales read in the app.
//
// Spec §5 is explicit that the per-customer history and the global record are
// ONE data source viewed twice, never two stores that could drift. So both go
// through this, and the only difference between them is which filters they
// pass.
//
// goods_total is computed from the line items rather than read from
// cash + credit, for the reason established in src/debts/rules.ts: the items
// are the fact, the payment split is a claim about it, and older rows exist
// where the claim is wrong.
function buildWhere(f: SalesFilter): { sql: string; args: (string | number)[] } {
  const clauses = ["s.business_id = ?"];
  const args: (string | number)[] = [f.businessId];

  if (f.customerId) {
    clauses.push("s.customer_id = ?");
    args.push(f.customerId);
  }
  if (f.saleIds) {
    // An empty list must match NOTHING. `IN ()` is a syntax error in SQLite,
    // and omitting the clause would quietly return every sale in the shop —
    // the failure mode where a page of zero sales renders as all of them.
    if (f.saleIds.length === 0) {
      clauses.push("0 = 1");
    } else {
      clauses.push(`s.id IN (${f.saleIds.map(() => "?").join(",")})`);
      args.push(...f.saleIds);
    }
  }
  if (f.search && f.search.trim().length > 0) {
    clauses.push("LOWER(c.name) LIKE ?");
    args.push(`%${f.search.trim().toLowerCase()}%`);
  }
  if (f.fromIso) {
    clauses.push("s.sold_at >= ?");
    args.push(f.fromIso);
  }
  if (f.toIso) {
    clauses.push("s.sold_at <= ?");
    args.push(f.toIso);
  }
  if (f.kind === "quick") {
    clauses.push("c.is_quick_sale = 1");
  } else if (f.kind === "credit") {
    clauses.push("(goods.total - s.cash_amount) > 0");
  } else if (f.kind === "cash") {
    clauses.push("(goods.total - s.cash_amount) <= 0");
  }

  return { sql: clauses.join(" AND "), args };
}

const SALES_FROM = `
  FROM sales s
  JOIN customers c ON c.id = s.customer_id
  LEFT JOIN staff st ON st.id = s.staff_id
  LEFT JOIN (
    SELECT sale_id, SUM(CAST(ROUND(qty * unit_price) AS INTEGER)) AS total
    FROM sale_items GROUP BY sale_id
  ) goods ON goods.sale_id = s.id`;

/**
 * How many sales match, and what they come to (spec §4, running total).
 *
 * Deliberately a separate query over ALL matches rather than a sum of the
 * loaded page — "47 sales · KSh 82,300" has to describe the whole filter, not
 * however much has scrolled into view so far.
 */
export async function summariseSales(
  filter: SalesFilter
): Promise<{ count: number; total: number }> {
  const db = await getDb();
  const { sql, args } = buildWhere(filter);
  const row = await db.getFirstAsync<{ count: number; total: number | null }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(goods.total), 0) AS total
     ${SALES_FROM} WHERE ${sql}`,
    ...args
  );
  return { count: row?.count ?? 0, total: row?.total ?? 0 };
}

/**
 * A page of sales, newest first.
 *
 * Paginated because she extends credit widely and this list only grows; the
 * spec requires it not be loaded into memory whole.
 */
export async function listSales(
  filter: SalesFilter,
  limit = 30,
  offset = 0
): Promise<SaleRecord[]> {
  const db = await getDb();
  const { sql, args } = buildWhere(filter);

  const saleRows = await db.getAllAsync<{
    id: string;
    sold_at: string;
    cash_amount: number;
    credit_amount: number;
    note: string | null;
    receipt_photo_local_path: string | null;
    staff_name: string | null;
    customer_name: string;
    is_quick_sale: 0 | 1;
  }>(
    `SELECT s.id, s.sold_at, s.cash_amount, s.credit_amount, s.note,
            s.receipt_photo_local_path, st.name AS staff_name,
            c.name AS customer_name, c.is_quick_sale
     ${SALES_FROM}
     WHERE ${sql}
     ORDER BY s.sold_at DESC
     LIMIT ? OFFSET ?`,
    ...args,
    limit,
    offset
  );

  return hydrate(db, saleRows);
}

// One customer's history, newest first (spec Part C §1 §6). For the pinned
// Quick Sale tab this is simply every quick sale, because they all share that
// one customer row.
// listCustomerSales was removed. It took a customer's newest 500 sales for the
// statement and said nothing on reaching that ceiling, so older history simply
// vanished. It is gone rather than merely unused, because an exported helper
// with a silent limit inside it is a trap for whoever reaches for it next —
// and the fix (loadCustomerAccount, which pages properly) is the thing they
// should find instead.

// Attaches line items and later empty-returns to a page of sale rows.
async function hydrate(
  db: Awaited<ReturnType<typeof getDb>>,
  saleRows: {
    id: string;
    sold_at: string;
    cash_amount: number;
    credit_amount: number;
    note: string | null;
    receipt_photo_local_path: string | null;
    staff_name: string | null;
    customer_name: string;
    is_quick_sale: 0 | 1;
  }[]
): Promise<SaleRecord[]> {
  if (saleRows.length === 0) return [];

  const placeholders = saleRows.map(() => "?").join(",");
  const itemRows = await db.getAllAsync<{
    id: string;
    sale_id: string;
    commodity_type: CommodityType;
    label: string;
    qty: number;
    unit_price: number;
    is_auto_priced: 0 | 1;
    empties_returned: number | null;
  }>(
    `SELECT id, sale_id, commodity_type, label, qty, unit_price,
            is_auto_priced, empties_returned
     FROM sale_items
     WHERE sale_id IN (${placeholders})
     ORDER BY created_at ASC`,
    ...saleRows.map((s) => s.id)
  );

  // Empties brought back after the sale, summed per line.
  const laterReturns = await db.getAllAsync<{
    sale_item_id: string;
    qty: number;
  }>(
    `SELECT sale_item_id, SUM(qty) AS qty
     FROM empty_returns
     WHERE sale_item_id IN (SELECT id FROM sale_items WHERE sale_id IN (${placeholders}))
     GROUP BY sale_item_id`,
    ...saleRows.map((s) => s.id)
  );
  const laterByItem = new Map<string, number>();
  for (const r of laterReturns) laterByItem.set(r.sale_item_id, r.qty);

  const itemsBySale = new Map<string, SaleItemRecord[]>();
  for (const row of itemRows) {
    const list = itemsBySale.get(row.sale_id) ?? [];
    list.push({
      id: row.id,
      commodityType: row.commodity_type,
      label: row.label,
      qty: row.qty,
      unitPrice: row.unit_price,
      isAutoPriced: row.is_auto_priced === 1,
      emptiesReturned: row.empties_returned,
      emptiesReturnedLater: laterByItem.get(row.id) ?? 0,
    });
    itemsBySale.set(row.sale_id, list);
  }

  return saleRows.map((s) => ({
    id: s.id,
    soldAt: s.sold_at,
    cashAmount: s.cash_amount,
    creditAmount: s.credit_amount,
    note: s.note,
    receiptPhotoLocalPath: s.receipt_photo_local_path,
    staffName: s.staff_name ?? "",
    customerName: s.customer_name,
    isQuickSale: s.is_quick_sale === 1,
    items: itemsBySale.get(s.id) ?? [],
  }));
}

// The ONE mutable field in the whole of history (G4, spec Part C §1 §6).
// A note is a memo — it feeds no balance — so editing it is safe. Amounts,
// items, payment split, attribution and timestamp stay frozen; corrections to
// those are made with a new adjusting entry, never by rewriting the past.
// Do not generalise this function to any other column.
export async function updateSaleNote(
  saleId: string,
  note: string
): Promise<void> {
  const db = await getDb();
  const trimmed = note.trim();
  await db.runAsync(
    "UPDATE sales SET note = ?, updated_at = ?, synced = 0 WHERE id = ?",
    trimmed.length > 0 ? trimmed : null,
    new Date().toISOString(),
    saleId
  );
}

// Cylinder brands this shop actually sold most recently, so the picker can
// float them to the top (spec Part C §1 §5). Derived from history — no
// "recently used" list is stored anywhere.
export async function listRecentCylinderBrands(
  businessId: string,
  limit: number
): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ brand_or_supplier: string }>(
    `SELECT si.brand_or_supplier
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE si.business_id = ? AND si.commodity_type = 'cylinder'
       AND si.brand_or_supplier IS NOT NULL
     GROUP BY si.brand_or_supplier
     ORDER BY MAX(s.sold_at) DESC
     LIMIT ?`,
    businessId,
    limit
  );
  return rows.map((r) => r.brand_or_supplier);
}

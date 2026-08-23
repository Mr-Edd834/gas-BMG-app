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
  emptiesReturned: number | null;
}

export interface SaleRecord {
  id: string;
  soldAt: string;
  cashAmount: number;
  creditAmount: number;
  note: string | null;
  receiptPhotoLocalPath: string | null;
  staffName: string;
  items: SaleItemRecord[];
}

// One customer's history, newest first (spec Part C §1 §6). For the pinned
// Quick Sale tab this is simply every quick sale, because they all share that
// one customer row.
export async function listCustomerSales(
  businessId: string,
  customerId: string
): Promise<SaleRecord[]> {
  const db = await getDb();

  const saleRows = await db.getAllAsync<{
    id: string;
    sold_at: string;
    cash_amount: number;
    credit_amount: number;
    note: string | null;
    receipt_photo_local_path: string | null;
    staff_name: string | null;
  }>(
    `SELECT s.id, s.sold_at, s.cash_amount, s.credit_amount, s.note,
            s.receipt_photo_local_path, st.name AS staff_name
     FROM sales s
     LEFT JOIN staff st ON st.id = s.staff_id
     WHERE s.business_id = ? AND s.customer_id = ?
     ORDER BY s.sold_at DESC`,
    businessId,
    customerId
  );

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

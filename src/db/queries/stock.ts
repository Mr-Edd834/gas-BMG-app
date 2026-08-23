import { getDb } from "../client";
import { generateId } from "../../lib/uuid";
import type { StockEventType, StockScope } from "../../types/db";

// Reads and writes for the shared stock/empties ledger (G2, spec Part C §4 §10).
// Every quantity here is a SUM over events — there is no count column to read
// or update, by design (G1).

export function stockKey(brand: string, size: string): string {
  return `${brand}|${size}`;
}

// full stock (per brand+size) = opening-count + returned-from-refill
//                               + manual-add − sold
// Spec Part C §4 §10 / Part C §1 §7b. Can legitimately go negative — that
// means an opening count or a refill was never recorded, and the honest fix
// is a manual-add in Settings, not clamping the number here.
export async function loadFullStockMap(
  businessId: string
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    brand: string;
    size: string;
    qty: number;
  }>(
    `SELECT brand, size,
            SUM(CASE WHEN event_type = 'sold' THEN -qty ELSE qty END) AS qty
     FROM stock_events
     WHERE business_id = ? AND scope = 'full'
     GROUP BY brand, size`,
    businessId
  );

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(stockKey(row.brand, row.size), row.qty);
  }
  return map;
}

export interface StockEventInput {
  businessId: string;
  eventType: StockEventType;
  scope: StockScope;
  brand: string;
  size: string;
  qty: number;
  staffId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  occurredAt: string;
  note?: string | null;
}

// Append one ledger row. Callers inside a sale save pass the sale's own
// transaction — this function never opens one itself, so a sale and the events
// it causes commit together or not at all.
export async function insertStockEvent(input: StockEventInput): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO stock_events
       (id, business_id, event_type, scope, brand, size, qty, staff_id,
        source_type, source_id, note, occurred_at, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    generateId(),
    input.businessId,
    input.eventType,
    input.scope,
    input.brand,
    input.size,
    input.qty,
    input.staffId,
    input.sourceType,
    input.sourceId,
    input.note ?? null,
    input.occurredAt,
    now,
    now
  );
}

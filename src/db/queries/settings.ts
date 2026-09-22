import { getDb } from "../client";
import { generateId } from "../../lib/uuid";
import { insertStockEvent } from "./stock";
import type { StockScope } from "../../types/db";
import type { StockWrite } from "../../settings/openingStock";

// Settings reads and writes (spec Part C §6 §8).
//
// Two kinds of write live here and they behave very differently. Catalog and
// preference changes are settings — they may be changed in place. Stock counts
// are RECORDS, and go into the append-only ledger like everything else, even
// when they are corrections.

// ---------------------------------------------------------------------------
// Per-device preferences
// ---------------------------------------------------------------------------

export async function getPref(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM device_prefs WHERE key = ?",
    key
  );
  return row?.value ?? null;
}

export async function setPref(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO device_prefs (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                    updated_at = excluded.updated_at`,
    key,
    value,
    new Date().toISOString()
  );
}

// ---------------------------------------------------------------------------
// Catalog editing (spec §6 §2)
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  id: string;
  value: string;
  active: boolean;
  // Whether any past sale already refers to this entry. It decides the wording
  // she is shown, not whether the action is allowed.
  usedInHistory: boolean;
}

export async function listCatalogEntries(
  businessId: string,
  kind: string
): Promise<CatalogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    value: string;
    active: number;
  }>(
    `SELECT id, value, active FROM catalog_items
     WHERE business_id = ? AND kind = ?
     ORDER BY active DESC, created_at ASC`,
    businessId,
    kind
  );
  if (rows.length === 0) return [];

  // Which values history already mentions. Sale items store the brand as TEXT
  // rather than as a foreign key, so past records are never broken by a
  // catalog change — but knowing an item is in use lets the UI explain what
  // removing it will and will not do.
  const used = await db.getAllAsync<{ value: string }>(
    `SELECT DISTINCT brand_or_supplier AS value FROM sale_items
     WHERE business_id = ? AND brand_or_supplier IS NOT NULL
     UNION
     SELECT DISTINCT size_or_denomination AS value FROM sale_items
     WHERE business_id = ? AND size_or_denomination IS NOT NULL`,
    businessId,
    businessId
  );
  const usedValues = new Set(used.map((u) => u.value));

  return rows.map((r) => ({
    id: r.id,
    value: r.value,
    active: r.active === 1,
    usedInHistory: usedValues.has(r.value),
  }));
}

export async function addCatalogEntry(
  businessId: string,
  kind: string,
  value: string
): Promise<void> {
  const db = await getDb();
  const trimmed = value.trim();
  if (!trimmed) return;

  // Re-adding something previously hidden revives the original row rather than
  // creating a duplicate, so the picker never shows the same brand twice.
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM catalog_items
     WHERE business_id = ? AND kind = ? AND value = ? COLLATE NOCASE`,
    businessId,
    kind,
    trimmed
  );
  const now = new Date().toISOString();

  if (existing) {
    await db.runAsync(
      "UPDATE catalog_items SET active = 1, updated_at = ?, synced = 0 WHERE id = ?",
      now,
      existing.id
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO catalog_items (id, business_id, kind, value, active, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, 1, ?, ?, 0)`,
    generateId(),
    businessId,
    kind,
    trimmed,
    now,
    now
  );
}

/**
 * Removing a catalog entry HIDES it; it never deletes the row.
 *
 * The spec left soft-hide vs hard-delete open, to be resolved at build, and
 * the resolution is: always soft-hide, whether or not history refers to it.
 *
 * Deleting would be safe for past records — sale items store the brand as
 * text, so nothing would break — but it would be unrecoverable for her. A
 * brand removed by a mistaken tap could not be restored with its original
 * identity, and the app has no delete anywhere else precisely because one tap
 * should never be able to destroy something. Hiding costs a single column and
 * makes the mistake reversible.
 */
export async function hideCatalogEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE catalog_items SET active = 0, updated_at = ?, synced = 0 WHERE id = ?",
    new Date().toISOString(),
    id
  );
}

export async function restoreCatalogEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE catalog_items SET active = 1, updated_at = ?, synced = 0 WHERE id = ?",
    new Date().toISOString(),
    id
  );
}

// ---------------------------------------------------------------------------
// Opening stock count (spec §6 §3)
// ---------------------------------------------------------------------------

/** Whether this shop has ever recorded an opening count for that pile. */
export async function hasOpeningCount(
  businessId: string,
  scope: StockScope
): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM stock_events
     WHERE business_id = ? AND scope = ? AND event_type = 'opening-count'`,
    businessId,
    scope
  );
  return (row?.count ?? 0) > 0;
}

/**
 * Writes a first count, or a correction to one.
 *
 * `mode` decides the event type, and that choice is the whole integrity story.
 * A first count is an `opening-count`: the starting truth that everything else
 * is measured from. A later count is a `manual-add` carrying only the
 * DIFFERENCE, because the original count is history and history is never
 * edited (G4/G5). The derived total moves; the record of how it got there
 * stays intact.
 */
export async function writeStockCount(input: {
  businessId: string;
  scope: StockScope;
  staffId: string;
  mode: "opening" | "recount";
  writes: StockWrite[];
  note: string | null;
}): Promise<void> {
  const db = await getDb();
  const occurredAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const write of input.writes) {
      if (write.qty === 0) continue;
      await insertStockEvent({
        businessId: input.businessId,
        eventType: input.mode === "opening" ? "opening-count" : "manual-add",
        scope: input.scope,
        brand: write.brand,
        size: write.size,
        // Signed. A recount that finds fewer cylinders than the records claim
        // writes a negative quantity, which is the ordinary case — breakages
        // and quiet losses are exactly what a recount exists to discover.
        qty: write.qty,
        staffId: input.staffId,
        sourceType: "stock-count",
        sourceId: null,
        occurredAt,
        note: input.note,
      });
    }
  });
}

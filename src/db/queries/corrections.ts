import { getDb } from "../client";
import { generateId } from "../../lib/uuid";

// Cancelling a sale that was recorded wrongly, and the one rule that makes it
// work: every figure in the app ignores a cancelled sale.
//
// The wrong row is never edited and never deleted. A cancellation is a new
// row saying "that sale is out, this one replaces it" — so the book still
// shows what was originally written, crossed out, next to the correction.
// That visible trail is the whole point (see the table comment in schema.ts).

/**
 * The condition every money-or-count query must carry.
 *
 * Written once, here, because the danger is not getting it wrong — it is
 * FORGETTING it somewhere. A single query that omits this keeps counting a
 * cancelled 60,000 sale, and the figure it feeds is quietly wrong forever.
 * Importing one shared string makes the omission visible when you read a
 * query, rather than invisible.
 *
 * `alias` is whatever the query calls the sales table, usually "s".
 */
export function liveSale(alias = "s"): string {
  return `NOT EXISTS (SELECT 1 FROM sale_corrections sc
                      WHERE sc.cancelled_sale_id = ${alias}.id)`;
}

/**
 * The same rule for the stock ledger.
 *
 * A sale writes stock events against each of its LINES, not against the sale,
 * so cancelling has to reach one level deeper. Miss this and the cylinders
 * from a cancelled sale stay subtracted from the shelf forever — the stock
 * count drifts and nothing explains why.
 */
export function liveStockEvent(alias = "e"): string {
  return `(${alias}.source_type <> 'sale_item' OR NOT EXISTS (
            SELECT 1 FROM sale_items si
            JOIN sale_corrections sc ON sc.cancelled_sale_id = si.sale_id
            WHERE si.id = ${alias}.source_id))`;
}

export interface SaleCorrection {
  cancelledSaleId: string;
  replacementSaleId: string | null;
  reason: string | null;
  staffName: string;
  at: string;
}

export type CorrectionBlock =
  | "already-cancelled"
  | "has-repayments"
  | "has-returns"
  | null;

/**
 * Whether this sale can still be corrected, and if not, why.
 *
 * Two deliberate refusals. A sale that has already been paid against, or had
 * empties brought back against it, is no longer a standalone mistake — money
 * and cylinders have moved on the strength of it, and cancelling it would
 * leave those payments pointing at something that is no longer counted.
 *
 * That case is rarer and messier, and it belongs in a conversation rather
 * than behind a button. The screen says which of the two it is, so she is not
 * left guessing why a button will not work.
 */
export async function correctionBlockedBecause(
  businessId: string,
  saleId: string
): Promise<CorrectionBlock> {
  const db = await getDb();

  const cancelled = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sale_corrections WHERE cancelled_sale_id = ?",
    saleId
  );
  if ((cancelled?.n ?? 0) > 0) return "already-cancelled";

  const repaid = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM repayments WHERE business_id = ? AND sale_id = ?",
    businessId,
    saleId
  );
  if ((repaid?.n ?? 0) > 0) return "has-repayments";

  const returned = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM empty_returns er
     JOIN sale_items si ON si.id = er.sale_item_id
     WHERE er.business_id = ? AND si.sale_id = ?`,
    businessId,
    saleId
  );
  if ((returned?.n ?? 0) > 0) return "has-returns";

  return null;
}

/** Records the cancellation. Append-only; nothing else is touched. */
export async function cancelSale(input: {
  businessId: string;
  cancelledSaleId: string;
  replacementSaleId: string | null;
  reason: string | null;
  staffId: string;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO sale_corrections
       (id, business_id, cancelled_sale_id, replacement_sale_id, reason,
        staff_id, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    generateId(),
    input.businessId,
    input.cancelledSaleId,
    input.replacementSaleId,
    input.reason,
    input.staffId,
    now,
    now
  );
}

/**
 * Corrections touching the given sales, keyed by sale id.
 *
 * Returns both directions, because a sale can be either side of one: the
 * cancelled sale needs to know it was cancelled, and the replacement needs to
 * know what it replaced. The record shows both halves next to each other.
 */
export async function loadCorrectionsFor(
  saleIds: string[]
): Promise<{
  cancelled: Map<string, SaleCorrection>;
  replacements: Map<string, SaleCorrection>;
}> {
  const cancelled = new Map<string, SaleCorrection>();
  const replacements = new Map<string, SaleCorrection>();
  if (saleIds.length === 0) return { cancelled, replacements };

  const db = await getDb();
  const holes = saleIds.map(() => "?").join(",");
  const rows = await db.getAllAsync<{
    cancelled_sale_id: string;
    replacement_sale_id: string | null;
    reason: string | null;
    staff_name: string | null;
    created_at: string;
  }>(
    `SELECT sc.cancelled_sale_id, sc.replacement_sale_id, sc.reason,
            st.name AS staff_name, sc.created_at
     FROM sale_corrections sc
     LEFT JOIN staff st ON st.id = sc.staff_id
     WHERE sc.cancelled_sale_id IN (${holes})
        OR sc.replacement_sale_id IN (${holes})`,
    ...saleIds,
    ...saleIds
  );

  for (const row of rows) {
    const entry: SaleCorrection = {
      cancelledSaleId: row.cancelled_sale_id,
      replacementSaleId: row.replacement_sale_id,
      reason: row.reason,
      staffName: row.staff_name ?? "",
      at: row.created_at,
    };
    cancelled.set(row.cancelled_sale_id, entry);
    if (row.replacement_sale_id) {
      replacements.set(row.replacement_sale_id, entry);
    }
  }

  return { cancelled, replacements };
}

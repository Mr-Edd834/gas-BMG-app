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

/**
 * The same rule again, for payments and returns attached to a sale.
 *
 * When a sale is corrected, its payments and returned empties are COPIED onto
 * the replacement (see cancelSale). These two conditions retire the originals,
 * so the 3,000 someone paid is counted once against the corrected sale and not
 * twice across both.
 */
export function liveRepayment(alias = "r"): string {
  return `NOT EXISTS (SELECT 1 FROM sale_corrections sc
                      WHERE sc.cancelled_sale_id = ${alias}.sale_id)`;
}

export function liveEmptyReturn(alias = "er"): string {
  return `NOT EXISTS (SELECT 1 FROM sale_items si
                      JOIN sale_corrections sc ON sc.cancelled_sale_id = si.sale_id
                      WHERE si.id = ${alias}.sale_item_id)`;
}

export type CorrectionBlock = "already-cancelled" | null;

/**
 * Whether this sale can still be corrected.
 *
 * Only one refusal now: a sale already cancelled cannot be cancelled twice.
 *
 * It used to refuse a sale that had been part-paid, or had empties returned
 * against it — on the reasoning that money had moved on the strength of it.
 * Edd pushed back, and he was right: those payments were real, and what the
 * customer actually owes is simply the corrected total minus what they have
 * already handed over. Refusing was making the app's bookkeeping the
 * shopkeeper's problem. The payments are carried across instead — see
 * `cancelSale`.
 */
export async function correctionBlockedBecause(
  _businessId: string,
  saleId: string
): Promise<CorrectionBlock> {
  const db = await getDb();
  const cancelled = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sale_corrections WHERE cancelled_sale_id = ?",
    saleId
  );
  return (cancelled?.n ?? 0) > 0 ? "already-cancelled" : null;
}

/** What a correction will carry over, so the screen can say so beforehand. */
export async function correctionCarryOver(
  businessId: string,
  saleId: string
): Promise<{ paid: number; payments: number; emptiesBack: number }> {
  const db = await getDb();

  const money = await db.getFirstAsync<{ total: number; n: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n
     FROM repayments WHERE business_id = ? AND sale_id = ?`,
    businessId,
    saleId
  );
  const empties = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(er.qty), 0) AS total
     FROM empty_returns er
     JOIN sale_items si ON si.id = er.sale_item_id
     WHERE er.business_id = ? AND si.sale_id = ?`,
    businessId,
    saleId
  );

  return {
    paid: money?.total ?? 0,
    payments: money?.n ?? 0,
    emptiesBack: empties?.total ?? 0,
  };
}

/**
 * Records the cancellation, and carries the customer's payments and returned
 * empties over to the replacement.
 *
 * The case this exists for, in Edd's words: a sale is recorded as 50,000 when
 * it should have been 5,000, the customer has already paid 3,000, and after
 * the correction they should owe 2,000. That falls out by itself once the
 * 3,000 is attached to the corrected sale — because what is owed is always
 * worked out as the goods minus what has been paid (G1), never stored.
 *
 * The originals are not moved, edited or deleted. They stay attached to the
 * cancelled sale, where `liveRepayment` and `liveEmptyReturn` retire them, and
 * a COPY carrying the same amount, the same date and the same staff member is
 * attached to the replacement. The customer's statement therefore reads the
 * same as it did before the mistake was noticed — the payment still sits on
 * the day it was actually made.
 *
 * All in one transaction: a correction that cancelled a sale and then failed
 * to carry a payment across would lose that money outright.
 */
export async function cancelSale(input: {
  businessId: string;
  cancelledSaleId: string;
  replacementSaleId: string | null;
  reason: string | null;
  staffId: string;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
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

    if (!input.replacementSaleId) return;

    // --- payments ----------------------------------------------------------
    const payments = await db.getAllAsync<{
      customer_id: string;
      staff_id: string;
      amount: number;
      paid_at: string;
    }>(
      `SELECT customer_id, staff_id, amount, paid_at FROM repayments
       WHERE business_id = ? AND sale_id = ?
       ORDER BY paid_at ASC`,
      input.businessId,
      input.cancelledSaleId
    );

    for (const p of payments) {
      await db.runAsync(
        `INSERT INTO repayments
           (id, business_id, sale_id, customer_id, staff_id, amount, paid_at,
            created_at, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        generateId(),
        input.businessId,
        input.replacementSaleId,
        p.customer_id,
        // Keeps the person who actually took the money, not whoever is
        // holding the phone during the correction.
        p.staff_id,
        p.amount,
        p.paid_at,
        now,
        now
      );
    }

    // --- returned empties ---------------------------------------------------
    // Matched by brand and size rather than by line id, because the
    // replacement's lines are new rows. Capped at what the corrected sale
    // actually says was taken: if she fixes 3 cylinders down to 2, at most 2
    // empties can be outstanding against it, so at most 2 can come back.
    const returns = await db.getAllAsync<{
      customer_id: string;
      staff_id: string;
      qty: number;
      returned_at: string;
      brand: string | null;
      size: string | null;
    }>(
      `SELECT er.customer_id, er.staff_id, er.qty, er.returned_at,
              si.brand_or_supplier AS brand, si.size_or_denomination AS size
       FROM empty_returns er
       JOIN sale_items si ON si.id = er.sale_item_id
       WHERE er.business_id = ? AND si.sale_id = ?
       ORDER BY er.returned_at ASC`,
      input.businessId,
      input.cancelledSaleId
    );
    if (returns.length === 0) return;

    const newLines = await db.getAllAsync<{
      id: string;
      brand: string | null;
      size: string | null;
      qty: number;
    }>(
      `SELECT id, brand_or_supplier AS brand, size_or_denomination AS size, qty
       FROM sale_items WHERE sale_id = ? AND commodity_type = 'cylinder'`,
      input.replacementSaleId
    );

    const room = new Map(newLines.map((l) => [`${l.brand}|${l.size}`, l.qty]));
    const lineFor = new Map(newLines.map((l) => [`${l.brand}|${l.size}`, l.id]));

    for (const r of returns) {
      const key = `${r.brand}|${r.size}`;
      const itemId = lineFor.get(key);
      const left = room.get(key) ?? 0;
      // The brand is no longer on the corrected sale, or it is already full.
      if (!itemId || left <= 0) continue;

      const qty = Math.min(r.qty, left);
      room.set(key, left - qty);

      await db.runAsync(
        `INSERT INTO empty_returns
           (id, business_id, sale_item_id, customer_id, staff_id, qty,
            returned_at, created_at, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        generateId(),
        input.businessId,
        itemId,
        r.customer_id,
        r.staff_id,
        qty,
        r.returned_at,
        now,
        now
      );
    }
  });
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

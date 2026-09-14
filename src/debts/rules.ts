import { lineTotal } from "../sales/types";
import { DUE_SOON_DAYS, DEBT_DEADLINE_DAYS } from "../config/tunables";

// The arithmetic of debt, in one place.
//
// Every screen that shows an amount owed — the sale history card, the Debts
// list, the record, a reminder's text — calls these functions rather than
// doing its own sums. That is the whole point: two screens computing "owed"
// independently is how you end up with a history card saying "Fully paid"
// while the Debts screen says KSh 400 outstanding, and no way to tell which
// is lying.

/**
 * What a sale's goods were actually worth.
 *
 * The FACT of a sale is its line items: quantity times unit price, written
 * once and never editable (G4/G5). Note this deliberately ignores the stored
 * cash/credit split — those are two numbers a human typed at a counter, and
 * if they disagree with the goods, the goods win.
 */
export function saleGoodsTotal(
  items: { qty: number; unitPrice: number }[]
): number {
  return items.reduce((sum, i) => sum + lineTotal(i.qty, i.unitPrice), 0);
}

/**
 * The debt a sale created: goods value minus cash actually received.
 *
 * DERIVED, never read from the stored credit_amount column (G1). If she
 * records KSh 600 cash against KSh 1,000 of goods and leaves the credit box
 * blank, the debt is still 400 — reading credit_amount would call it 0 and
 * the money would vanish from the app entirely.
 *
 * Clamped at 0: an over-payment is an arithmetic mistake to correct on the
 * payment screen, not a negative debt to carry around.
 */
export function debtPrincipal(
  items: { qty: number; unitPrice: number }[],
  cashAmount: number
): number {
  return Math.max(0, saleGoodsTotal(items) - cashAmount);
}

/**
 * Still owed on one debt, after its repayments.
 *
 * Recomputed from the full list of repayment rows every time rather than kept
 * as a running balance. Slower in theory, correct in practice — and it means
 * a repayment row arriving late from another phone's sync simply lands and the
 * number is right, with nothing to reconcile.
 */
export function debtOutstanding(
  principal: number,
  repayments: { amount: number }[]
): number {
  const paid = repayments.reduce((sum, r) => sum + r.amount, 0);
  return Math.max(0, principal - paid);
}

/**
 * Empties still owed on one cylinder line.
 *
 * taken at sale − handed over at the counter − returned later.
 */
export function emptiesOutstanding(
  qtyTaken: number,
  emptiesReturnedAtSale: number | null,
  laterReturns: { qty: number }[]
): number {
  const returnedLater = laterReturns.reduce((sum, r) => sum + r.qty, 0);
  return Math.max(0, qtyTaken - (emptiesReturnedAtSale ?? 0) - returnedLater);
}

/**
 * When a debt taken on `soldAt` falls due.
 *
 * Fixed at creation and NEVER recalculated (G3). A partial payment on
 * Wednesday does not move Monday's deadline — that rule exists because a
 * resetting deadline lets a customer stay permanently almost-paid and never
 * actually settle, which is the failure mode the paper notebook had.
 */
export function deadlineFor(soldAt: string): Date {
  const due = new Date(soldAt);
  due.setDate(due.getDate() + DEBT_DEADLINE_DAYS);
  return due;
}

export type Urgency = "overdue" | "due-soon" | "on-track";

/**
 * How urgent a debt is right now (spec §7).
 *
 * Deliberately three coarse buckets rather than a day count. The spec removed
 * per-row "3d overdue" stamps as clutter: at a counter she needs to know who
 * to chase, not to read arithmetic. A dot answers that in peripheral vision.
 */
export function urgencyOf(soldAt: string, now: Date = new Date()): Urgency {
  const due = deadlineFor(soldAt);
  if (now >= due) return "overdue";
  const soonFrom = new Date(due);
  soonFrom.setDate(soonFrom.getDate() - DUE_SOON_DAYS);
  return now >= soonFrom ? "due-soon" : "on-track";
}

// Most urgent wins, so a customer card shows their worst debt (spec §7).
const RANK: Record<Urgency, number> = {
  overdue: 2,
  "due-soon": 1,
  "on-track": 0,
};

export function mostUrgent(list: Urgency[]): Urgency {
  return list.reduce<Urgency>(
    (worst, u) => (RANK[u] > RANK[worst] ? u : worst),
    "on-track"
  );
}

// "Needs collecting" is anyone with a red or amber dot (spec §4, §7).
export function needsCollecting(u: Urgency): boolean {
  return u !== "on-track";
}

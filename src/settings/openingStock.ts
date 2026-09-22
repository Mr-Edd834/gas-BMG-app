// The arithmetic of seeding — and later correcting — the shop's stock counts
// (spec Part C §6 §3).
//
// Pure, so it can be tested on a laptop. It is worth testing carefully because
// it is the only place in the app that writes a number nobody observed
// happening: every other event records a real act — a sale, a payment, a batch
// leaving. An opening count is an assertion about the past, and if it is wrong
// every derived figure downstream is wrong with it.

import type { CountMap } from "../refilling/batchDraft";
import { countKey } from "../refilling/batchDraft";

export interface StockWrite {
  brand: string;
  size: string;
  qty: number;
}

/**
 * The events to write for a FIRST count.
 *
 * Only non-zero entries become events. A brand she does not stock should leave
 * no trace at all rather than an explicit "zero K-Gas Big", because the ledger
 * is a list of things that are true, and a row asserting nothing is a row that
 * has to be read and dismissed forever after.
 */
export function openingWrites(counted: CountMap): StockWrite[] {
  return Object.entries(counted)
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => {
      const [brand, size] = key.split("|");
      return { brand, size, qty };
    })
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.size.localeCompare(b.size));
}

/**
 * The adjustments to write for a RECOUNT.
 *
 * This is the heart of the spec's answer to "what if my first count was
 * wrong". The opening count is not a master figure that later counts
 * overwrite — it is simply the FIRST event. A correction therefore never edits
 * it; it appends a `manual-add` for the DIFFERENCE between what the records
 * currently derive and what she has just counted on the floor.
 *
 * Nothing is lost by doing it this way, and that is the point: the old sales
 * and refills stay exactly as recorded, and only the derived total moves to
 * match reality. It also leaves an honest trail — "on this date the count was
 * off by three" is a fact worth keeping, and an overwrite would have destroyed
 * it silently.
 *
 * A delta is negative when the shelf holds LESS than the records claim, which
 * is the common case: breakages and quiet losses are exactly what a recount
 * discovers. `manual-add` therefore carries a signed quantity, and the ledger's
 * sums add it as-is.
 */
export function recountAdjustments(
  counted: CountMap,
  current: Map<string, number>
): StockWrite[] {
  const keys = new Set([...Object.keys(counted), ...current.keys()]);
  const writes: StockWrite[] = [];

  for (const key of keys) {
    const [brand, size] = key.split("|");
    const truth = counted[key] ?? 0;
    const derived = current.get(key) ?? 0;
    const delta = truth - derived;
    // An unchanged line writes nothing. Recounting a shop of eleven brands
    // when two were wrong should leave two events, not twenty-two.
    if (delta !== 0) writes.push({ brand, size, qty: delta });
  }

  return writes.sort(
    (a, b) => a.brand.localeCompare(b.brand) || a.size.localeCompare(b.size)
  );
}

/**
 * Pre-fills the steppers on a recount with what the records currently say.
 *
 * Starting a recount at zero would be dangerous rather than merely annoying:
 * she fills in only the brands she is checking, and every brand she did not
 * touch would read as a genuine zero and be corrected down to nothing. Filling
 * the current figures in first makes an untouched brand mean "unchanged",
 * which is what leaving something alone should always mean.
 */
export function prefillFrom(current: Map<string, number>): CountMap {
  const counts: CountMap = {};
  for (const [key, qty] of current) {
    if (qty > 0) counts[key] = qty;
  }
  return counts;
}

/** Total across a count, for the running figure at the bottom of the screen. */
export function countedTotal(counted: CountMap): number {
  return Object.values(counted).reduce((sum, qty) => sum + Math.max(0, qty), 0);
}

/** How many brands she has actually filled in, as reassurance she is done. */
export function filledBrandCount(counted: CountMap): number {
  const brands = new Set<string>();
  for (const [key, qty] of Object.entries(counted)) {
    if (qty > 0) brands.add(key.slice(0, key.indexOf("|")));
  }
  return brands.size;
}

export { countKey };

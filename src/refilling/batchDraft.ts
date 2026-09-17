// The arithmetic behind sending a batch and marking one returned.
//
// Pure on purpose: no React, no Expo, no database. The send page holds a grid
// of every brand × every size, and the return page holds the same grid capped
// at what is still out — both are "a map of counts, collapsed into lines, then
// checked against a save rule". Keeping that here means it can be tested by
// `npm test` on the laptop, where the screens themselves cannot be: they need
// a device to render on.

export interface DraftLine {
  brand: string;
  size: string;
  qty: number;
}

// Counts live in a flat map keyed "brand|size" rather than a nested object,
// because the grid is sparse — she touches two brands out of eleven — and a
// flat map means one setState per tap instead of cloning a nested tree.
export type CountMap = Record<string, number>;

export function countKey(brand: string, size: string): string {
  return `${brand}|${size}`;
}

export function countAt(counts: CountMap, brand: string, size: string): number {
  return counts[countKey(brand, size)] ?? 0;
}

/**
 * Sets one cell, clamped to [0, max].
 *
 * The clamp lives here rather than in the stepper because the return page's
 * ceiling is per-cell (what is still out for that exact brand and size) and is
 * data, not a UI constant. A stepper that let her return four cylinders from a
 * batch of three would write a negative "still out" into the ledger.
 */
export function setCount(
  counts: CountMap,
  brand: string,
  size: string,
  qty: number,
  max?: number
): CountMap {
  const ceiling = max === undefined ? qty : Math.min(qty, max);
  const clamped = Math.max(0, ceiling);
  const next = { ...counts };
  if (clamped === 0) {
    delete next[countKey(brand, size)];
  } else {
    next[countKey(brand, size)] = clamped;
  }
  return next;
}

/** Everything she actually set, in a stable order. Zeroes are dropped. */
export function draftLines(counts: CountMap): DraftLine[] {
  return Object.entries(counts)
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => {
      const [brand, size] = key.split("|");
      return { brand, size, qty };
    })
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.size.localeCompare(b.size));
}

export function totalCylinders(counts: CountMap): number {
  return Object.values(counts).reduce((sum, qty) => sum + Math.max(0, qty), 0);
}

/** Whether a brand row has anything set, so the row can highlight (spec §4). */
export function brandTouched(counts: CountMap, brand: string): boolean {
  return Object.entries(counts).some(
    ([key, qty]) => qty > 0 && key.slice(0, key.indexOf("|")) === brand
  );
}

export type BlockReason = "no-cylinders" | "no-photo" | null;

/**
 * Why save is disabled — or null when it is allowed.
 *
 * Returning the REASON rather than a boolean is deliberate: a greyed-out
 * button with no explanation is the thing that makes people tap it repeatedly
 * and then give up. The screen turns this into a line of amber text beside the
 * button, so the rule is visible before the tap rather than after it.
 *
 * Both rules come straight from the spec (§4 for sending, §5 for returning):
 * at least one cylinder, and at least one cylinder photo. The photo is the one
 * place in this app where a photo is mandatory — everywhere else a photo is
 * optional and may never block a save (G8) — because a batch of cylinders
 * leaving the shop with no evidence is the dispute this section exists to
 * prevent.
 */
export function saveBlockedBecause(args: {
  counts: CountMap;
  cylinderPhotos: string[];
}): BlockReason {
  if (totalCylinders(args.counts) === 0) return "no-cylinders";
  if (args.cylinderPhotos.length === 0) return "no-photo";
  return null;
}

import type { CommodityType } from "../types/db";

// A line in the in-progress cart (spec Part C §1 §5, "The cart pattern").
// This is in-memory only — nothing is written to SQLite until "Save sale" on
// the payment step, so an abandoned sale leaves no trace (G5: what IS written
// is permanent, so we take care to write only on a real save).
export interface CartLine {
  // Stable key for list rendering + edit targeting. Not the DB row id; the
  // sale_items row gets its own UUID at save time.
  key: string;
  commodity: CommodityType;
  // What the customer sees on the cart card, e.g. "K-Gas · Big".
  label: string;
  brandOrSupplier: string | null;
  sizeOrDenomination: string | null;
  qty: number;
  // Per-unit price. Typed by the shopkeeper for everything except airtime,
  // where it is derived from the 95%-of-face-value rule (auto-priced, no box).
  unitPrice: number;
  isAutoPriced: boolean;
  // Cylinders only: empties handed back AT THE POINT OF SALE (0..qty).
  emptiesReturned: number | null;
  // Airtime only, display detail: how the cards were counted out.
  // Deliberately not persisted — sale_items (spec Part B §8) records the card
  // count, and 1 pack vs 10 singles is the same 10 cards at the same price.
  packs: number | null;
  singles: number | null;
}

export type CommodityKey = CommodityType;

export const COMMODITIES: { key: CommodityKey; label: string }[] = [
  { key: "cylinder", label: "Cylinder" },
  { key: "airtime", label: "Airtime" },
  { key: "burner", label: "Burner" },
  { key: "cooker", label: "Cookers" },
];

// The ONE place a money line total is computed, so the cart, the payment
// total, the saved row and the history screen can never disagree.
//
// Airtime lines store the exact per-card price the 95% rule produced
// (auto price ÷ cards), so this same rounding rule reproduces the auto price
// exactly — see buildAirtimeLine in src/sales/buildLines.ts.
export function lineTotal(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice);
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotal(l.qty, l.unitPrice), 0);
}

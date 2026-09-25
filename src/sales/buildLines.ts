import { computeAirtimePrice } from "../catalog/seed";
import { generateId } from "../lib/uuid";
import type { CartLine } from "./types";
import type { CommodityType } from "../types/db";

// The single path from picker state → cart lines.
//
// Spec Part C §1 §5 (implementation note): "editing = remove-and-reopen
// through the *same* add path, so there is no second code path that can drift
// from the add logic." That is enforced here — the edit flow rebuilds its
// picker state from the line it pulled out (draftFrom* below), then commits
// back through these exact same builders. Nothing anywhere else constructs a
// CartLine.

export interface CylinderSizeState {
  qty: number;
  price: string;
  returned: number;
}
export interface CylinderPickerState {
  brand: string | null;
  sizes: Record<string, CylinderSizeState>;
}

export interface AirtimeDenomState {
  packs: number;
  singles: number;
}
export interface AirtimePickerState {
  supplier: string | null;
  denoms: Record<string, AirtimeDenomState>;
}

export interface FlatOptionState {
  qty: number;
  price: string;
}
export interface FlatPickerState {
  options: Record<string, FlatOptionState>;
}

export const emptyCylinderSize: CylinderSizeState = {
  qty: 0,
  price: "",
  returned: 0,
};
export const emptyAirtimeDenom: AirtimeDenomState = { packs: 0, singles: 0 };
export const emptyFlatOption: FlatOptionState = { qty: 0, price: "" };

export function parsePrice(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function airtimeCards(state: AirtimeDenomState): number {
  return state.packs * 10 + state.singles;
}

// --- picker state → cart lines -------------------------------------------

// One cart line per size with qty > 0 (spec Part C §1 §5, CYLINDER picker).
export function buildCylinderLines(
  state: CylinderPickerState,
  sizes: string[]
): CartLine[] {
  const brand = state.brand;
  if (!brand) return [];

  const lines: CartLine[] = [];
  for (const size of sizes) {
    const row = state.sizes[size];
    if (!row || row.qty <= 0) continue;
    lines.push({
      key: generateId(),
      commodity: "cylinder",
      label: `${brand} · ${size}`,
      brandOrSupplier: brand,
      sizeOrDenomination: size,
      qty: row.qty,
      unitPrice: parsePrice(row.price),
      isAutoPriced: false,
      // Exact count per size, so a partial return (buy 3, hand back 2) lives
      // on one line. The remainder becomes a cylinder debt in Debts.
      emptiesReturned: Math.min(row.returned, row.qty),
      packs: null,
      singles: null,
    });
  }
  return lines;
}

// One cart line per denomination with any quantity, auto-priced at 95% of
// face value — no price box anywhere in this path (spec Part C §1 §5).
export function buildAirtimeLines(
  state: AirtimePickerState,
  denominations: number[]
): CartLine[] {
  const supplier = state.supplier;
  if (!supplier) return [];

  const lines: CartLine[] = [];
  for (const denom of denominations) {
    const row = state.denoms[String(denom)];
    if (!row) continue;
    const cards = airtimeCards(row);
    if (cards <= 0) continue;

    const total = computeAirtimePrice(denom, row.packs, row.singles);
    lines.push({
      key: generateId(),
      commodity: "airtime",
      label: `${supplier} ${denom} airtime`,
      brandOrSupplier: supplier,
      sizeOrDenomination: String(denom),
      qty: cards,
      // Store the per-card price the rule produced, so lineTotal(qty, unit)
      // reproduces the auto price exactly rather than re-deriving it with
      // different float rounding.
      unitPrice: total / cards,
      isAutoPriced: true,
      emptiesReturned: null,
      packs: row.packs,
      singles: row.singles,
    });
  }
  return lines;
}

// One cart line per option with qty > 0 (spec Part C §1 §5, BURNER/COOKER).
export function buildFlatLines(
  commodity: "burner" | "cooker",
  state: FlatPickerState,
  options: string[]
): CartLine[] {
  const lines: CartLine[] = [];
  for (const option of options) {
    const row = state.options[option];
    if (!row || row.qty <= 0) continue;
    lines.push({
      key: generateId(),
      commodity,
      label: option,
      brandOrSupplier: commodity === "burner" ? option : null,
      sizeOrDenomination: null,
      qty: row.qty,
      unitPrice: parsePrice(row.price),
      isAutoPriced: false,
      emptiesReturned: null,
      packs: null,
      singles: null,
    });
  }
  return lines;
}

// "Is this ready?" lives in ./walkAway — kept apart from these builders because
// they call generateId() (expo-crypto, native-only), and the readiness rule
// needs to be testable off-device.

// --- cart line → picker state (the "reopens PRE-FILLED" half) -------------
//
// A line carries everything its picker needs, so an edit restores qty, price,
// empties, supplier and packs/singles exactly as they were.

export function draftFromCylinderLine(line: CartLine): CylinderPickerState {
  const size = line.sizeOrDenomination ?? "";
  return {
    brand: line.brandOrSupplier,
    sizes: {
      [size]: {
        qty: line.qty,
        price: formatPriceInput(line.unitPrice),
        returned: line.emptiesReturned ?? 0,
      },
    },
  };
}

export function draftFromAirtimeLine(line: CartLine): AirtimePickerState {
  const denom = line.sizeOrDenomination ?? "";
  return {
    supplier: line.brandOrSupplier,
    denoms: {
      [denom]: {
        packs: line.packs ?? 0,
        singles: line.singles ?? 0,
      },
    },
  };
}

export function draftFromFlatLine(line: CartLine): FlatPickerState {
  return {
    options: {
      [line.label]: {
        qty: line.qty,
        price: formatPriceInput(line.unitPrice),
      },
    },
  };
}

// A re-opened price box must show exactly what she typed, so this keeps
// decimals if there were any and renders an unset price as an empty box
// (which then trips the price-required validation, as it should).
function formatPriceInput(price: number): string {
  if (!Number.isFinite(price) || price === 0) return "";
  return String(price);
}

/**
 * Rebuilds cart lines from a sale that was already saved.
 *
 * Used when correcting a mistake: the wrong sale's lines are loaded back into
 * the cart so she edits what she typed rather than retyping the whole thing
 * from memory. From her side it looks exactly like editing the sale — which
 * is the point. What differs is underneath: saving writes a NEW sale and
 * cancels the old one, rather than overwriting it.
 *
 * `packs` and `singles` come back null because they were never persisted —
 * ten single cards and one pack of ten are the same ten cards at the same
 * price (spec Part B §8), so the breakdown is a cart-time convenience only.
 */
export function cartLinesFromSale(
  items: {
    id: string;
    commodityType: CommodityType;
    label: string;
    qty: number;
    unitPrice: number;
    isAutoPriced: boolean;
    emptiesReturned: number | null;
    brandOrSupplier: string | null;
    sizeOrDenomination: string | null;
  }[]
): CartLine[] {
  return items.map((item) => ({
    key: item.id,
    commodity: item.commodityType,
    label: item.label,
    brandOrSupplier: item.brandOrSupplier,
    sizeOrDenomination: item.sizeOrDenomination,
    qty: item.qty,
    unitPrice: item.unitPrice,
    isAutoPriced: item.isAutoPriced,
    emptiesReturned: item.emptiesReturned,
    packs: null,
    singles: null,
  }));
}

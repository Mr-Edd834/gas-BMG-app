import type { CommodityType } from "../types/db";
import type { CartLine } from "./types";

// What happens to an open picker when she walks away from it without pressing
// its Add button — by switching commodity, tapping a cart line, or moving on.
//
// Kept in its own module with NO React and NO Expo imports on purpose: this is
// the logic that decides whether a shopkeeper's typed-in sale is kept or
// thrown away, and that deserves tests. Code that touches native modules can
// only run on a phone; code that is just data in, data out can run anywhere,
// including the test suite. So the screen builds the lines and hands them
// here, and everything that is a DECISION lives in this file.

export type DraftStatus =
  // Nothing entered — safe to discard.
  | "empty"
  // Every line has what it needs — safe to put in the cart.
  | "ready"
  // Something entered but a price is missing. Must be neither discarded (that
  // loses her work) nor added (spec §5: a sale can never carry a silent zero
  // price). It is held as a draft until she finishes it.
  | "incomplete";

/**
 * One definition of "ready", used by the pickers to enable their Add button
 * AND by the walk-away below. If those two ever disagreed, a draft could look
 * complete in one place and be rejected in the other.
 */
export function statusOfLines(lines: CartLine[]): DraftStatus {
  if (lines.length === 0) return "empty";
  // Airtime is auto-priced and exempt from the price rule (spec §5).
  const unpriced = lines.some((l) => !l.isAutoPriced && l.unitPrice <= 0);
  return unpriced ? "incomplete" : "ready";
}

export interface EditingInfo {
  line: CartLine;
  // Where the line sat before it was pulled out for editing.
  index: number;
}

/** Puts a line that is out for editing back where it came from, unchanged. */
export function withRestored(
  cart: CartLine[],
  editing: EditingInfo | null
): CartLine[] {
  if (!editing) return cart;
  return [
    ...cart.slice(0, editing.index),
    editing.line,
    ...cart.slice(editing.index),
  ];
}

export type Drafts<S> = Partial<Record<CommodityType, S>>;

/**
 * Resolves the open picker.
 *
 * This used to be "throw it away", which lost everything she had typed the
 * moment she tapped Airtime before tapping Add. Now the rule follows from what
 * she typed:
 *
 *   ready       → added to the cart. She can still edit it there, which is why
 *                 Add was never really needed as a separate step.
 *   incomplete  → kept as a draft for that commodity and restored when she
 *                 reopens it. NOT added — that would be a silent zero price.
 *   empty       → nothing to keep.
 *
 * An EDIT keeps her changes if they are complete, and otherwise puts the
 * original line back untouched: the sale never loses a line it already had.
 *
 * @param lines  what the open picker would produce right now, built by the
 *               same builders its Add button uses
 * @param state  the raw picker state, stored as the draft if incomplete
 */
export function resolveWalkAway<S>(args: {
  open: { commodity: CommodityType; editing: EditingInfo | null } | null;
  lines: CartLine[];
  state: S | null;
  cart: CartLine[];
  drafts: Drafts<S>;
}): { cart: CartLine[]; drafts: Drafts<S> } {
  const { open, lines, state, cart, drafts } = args;
  if (!open) return { cart, drafts };

  const status = statusOfLines(lines);

  if (open.editing) {
    if (status === "ready") {
      const at = open.editing.index;
      return {
        cart: [...cart.slice(0, at), ...lines, ...cart.slice(at)],
        drafts,
      };
    }
    return { cart: withRestored(cart, open.editing), drafts };
  }

  const next: Drafts<S> = { ...drafts };
  if (status === "incomplete" && state !== null) {
    next[open.commodity] = state;
    return { cart, drafts: next };
  }
  delete next[open.commodity];
  return {
    cart: status === "ready" ? [...cart, ...lines] : cart,
    drafts: next,
  };
}

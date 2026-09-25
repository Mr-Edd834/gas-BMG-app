import type { CartLine } from "../sales/types";

// Sections still unbuilt are placeholders — each gets its real screen when its
// own section is built, per CLAUDE.md "Build order".
export type TabParamList = {
  Home: undefined;
  Debts: undefined;
  SalesRecord: undefined;
  Refilling: undefined;
  Reports: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  // The add-sale flow (spec Part C §1 §5). One flow, two steps; `mode` is the
  // only difference between "new tab" (asks a name) and "add sale to existing
  // tab" (name already known).
  AddSale:
    | { mode: "new-tab" }
    | { mode: "existing"; customerId: string; customerName: string }
    // Fixing a sale recorded wrongly. The old sale's lines are loaded back
    // into the cart, so she edits what she typed. Saving writes a NEW sale
    // and cancels the old one — see src/db/queries/corrections.ts.
    | {
        mode: "correct";
        saleId: string;
        customerId: string;
        customerName: string;
      };
  // Step 2. The cart travels as a param so backing out of payment returns to
  // the still-mounted build step with its cart untouched.
  Payment: {
    lines: CartLine[];
    customerId: string | null;
    customerName: string;
    newCustomerName: string | null;
    // Set only when fixing a mistake: the sale this one replaces, and the cash
    // the customer had already handed over at the counter on it. That cash is
    // part of the sale being fixed rather than a separate payment, so it has
    // to travel with it or it simply ceases to exist.
    correctingSaleId?: string | null;
    prefillCash?: number;
    // The note and receipt describe a transaction that really happened — only
    // the typed numbers were wrong — so they travel with it. She can still
    // replace either, if the receipt was the part that was wrong.
    prefillNote?: string | null;
    prefillPhoto?: string | null;
  };
  CustomerHistory: { customerId: string; customerName: string };
  // The interleaved ledger (spec Part C §2 §6). One screen serving both
  // directions of both kinds of debt — `view` picks which.
  DebtsRecord: { view: "money" | "empties" };

  // Refilling (spec Part C §4): company → batches → returns.
  CreateCompany: undefined;
  RefillCompany: { companyId: string; companyName: string };
  SendBatch: { companyId: string; companyName: string; companyCode: string };
  RefillBatch: { batchId: string };
  MarkReturned: { batchId: string };
  DeliveriesRecord: { companyId: string; companyName: string };

  // Settings (spec Part C §6): the catalog that makes the app reusable, the
  // cold-start stock count, and the device's own preferences.
  CatalogHub: undefined;
  CatalogList: { kind: string; title: string; note?: string };
  OpeningStock: undefined;
  CompanyCodes: undefined;
  Reminders: undefined;
  Storage: undefined;
};

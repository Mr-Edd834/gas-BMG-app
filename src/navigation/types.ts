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
    | { mode: "existing"; customerId: string; customerName: string };
  // Step 2. The cart travels as a param so backing out of payment returns to
  // the still-mounted build step with its cart untouched.
  Payment: {
    lines: CartLine[];
    customerId: string | null;
    customerName: string;
    newCustomerName: string | null;
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
};

import type { CartLine } from "../sales/types";

// The five sections outside Home are placeholders in this build — Home/Sales
// is built first per CLAUDE.md "Build order", and each of these gets its real
// screen when its own section is built.
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
};

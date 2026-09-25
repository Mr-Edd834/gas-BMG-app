import { getDb } from "../client";
import { liveSale } from "./corrections";

import { generateId } from "../../lib/uuid";
import type { Customer } from "../../types/db";

// A customer tab as the Home wall needs it (spec Part C §1 §3).
// Note what is NOT here: any balance/owed figure. Home is not a dashboard and
// a tab's appearance never changes with debt status — debt is the Debts
// section's job, and balances are always derived anyway (G1).
export interface CustomerTab {
  id: string;
  name: string;
  isQuickSale: boolean;
  // "Access frequency" (spec §3 tab ordering). DERIVED by counting this
  // customer's sales — never a stored counter column (G1).
  saleCount: number;
  lastSoldAt: string | null;
  // Most recent purchase summary; null until the tab has a real sale (G7 —
  // no placeholder last-item text ever ships).
  lastItemSummary: string | null;
}

interface TabRow {
  id: string;
  name: string;
  is_quick_sale: 0 | 1;
  sale_count: number;
  last_sold_at: string | null;
  last_sale_id: string | null;
}

export async function listCustomerTabs(
  businessId: string
): Promise<CustomerTab[]> {
  const db = await getDb();

  const rows = await db.getAllAsync<TabRow>(
    `SELECT
       c.id,
       c.name,
       c.is_quick_sale,
       (SELECT COUNT(*) FROM sales s
         WHERE s.customer_id = c.id AND ${liveSale("s")}) AS sale_count,
       (SELECT s.sold_at FROM sales s
         WHERE s.customer_id = c.id AND ${liveSale("s")}
         ORDER BY s.sold_at DESC LIMIT 1) AS last_sold_at,
       (SELECT s.id FROM sales s
         WHERE s.customer_id = c.id AND ${liveSale("s")}
         ORDER BY s.sold_at DESC LIMIT 1) AS last_sale_id
     FROM customers c
     WHERE c.business_id = ?`,
    businessId
  );

  // One extra round trip for the last sale's items, rather than N.
  const lastSaleIds = rows
    .map((r) => r.last_sale_id)
    .filter((id): id is string => id !== null);

  const summaries = new Map<string, string>();
  if (lastSaleIds.length > 0) {
    const placeholders = lastSaleIds.map(() => "?").join(",");
    const itemRows = await db.getAllAsync<{
      sale_id: string;
      label: string;
      qty: number;
    }>(
      `SELECT sale_id, label, qty FROM sale_items
       WHERE sale_id IN (${placeholders})
       ORDER BY created_at ASC`,
      ...lastSaleIds
    );
    for (const item of itemRows) {
      const part = `${item.label} ×${item.qty}`;
      const existing = summaries.get(item.sale_id);
      summaries.set(item.sale_id, existing ? `${existing}, ${part}` : part);
    }
  }

  const tabs: CustomerTab[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    isQuickSale: r.is_quick_sale === 1,
    saleCount: r.sale_count,
    lastSoldAt: r.last_sold_at,
    lastItemSummary: r.last_sale_id
      ? summaries.get(r.last_sale_id) ?? null
      : null,
  }));

  return sortTabs(tabs);
}

// Tab ordering (spec Part C §1 §3, RULE): access frequency descending, with
// Quick Sale pinned to the top regardless. Quick sales are excluded from
// frequency ranking simply because that tab never competes on frequency —
// it is always first, and its count never displaces a real customer.
export function sortTabs(tabs: CustomerTab[]): CustomerTab[] {
  return [...tabs].sort((a, b) => {
    if (a.isQuickSale !== b.isQuickSale) return a.isQuickSale ? -1 : 1;
    if (b.saleCount !== a.saleCount) return b.saleCount - a.saleCount;
    // Tie-break on recency, then name, so equal-frequency tabs hold a stable
    // and predictable order instead of shuffling between reads.
    const aTime = a.lastSoldAt ?? "";
    const bTime = b.lastSoldAt ?? "";
    if (aTime !== bTime) return bTime.localeCompare(aTime);
    return a.name.localeCompare(b.name);
  });
}

export async function createCustomer(
  businessId: string,
  name: string
): Promise<Customer> {
  const db = await getDb();
  const now = new Date().toISOString();
  const row: Customer = {
    id: generateId(),
    business_id: businessId,
    name: name.trim(),
    is_quick_sale: 0,
    created_at: now,
    updated_at: now,
    synced: 0,
  };
  await db.runAsync(
    `INSERT INTO customers (id, business_id, name, is_quick_sale, created_at, updated_at, synced)
     VALUES (?, ?, ?, 0, ?, ?, 0)`,
    row.id,
    row.business_id,
    row.name,
    row.created_at,
    row.updated_at
  );
  return row;
}

export async function getQuickSaleCustomer(
  businessId: string
): Promise<Customer | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Customer>(
    "SELECT * FROM customers WHERE business_id = ? AND is_quick_sale = 1 LIMIT 1",
    businessId
  );
  return row ?? null;
}

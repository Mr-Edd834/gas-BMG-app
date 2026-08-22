import { getDb } from "./client";
import { generateId } from "../lib/uuid";
import { SEED_CATALOG_ITEMS } from "../catalog/seed";

// Ensures first-launch seed data exists: one business row (manual per-shop
// setup — no public signup, spec Part A §2/§6), the real catalog (§3, G7),
// and the pinned Quick Sale customer tab (Part C §1 §4). Safe to call on
// every app start — each piece is inserted only if missing.
export async function ensureSeeded(): Promise<{ businessId: string }> {
  const db = await getDb();

  let business = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM businesses LIMIT 1"
  );
  if (!business) {
    const id = generateId();
    const now = new Date().toISOString();
    await db.runAsync(
      "INSERT INTO businesses (id, name, created_at, updated_at, synced) VALUES (?, ?, ?, ?, 0)",
      id,
      "My Shop",
      now,
      now
    );
    business = { id };
  }
  const businessId = business.id;

  const catalogCountRow = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM catalog_items WHERE business_id = ?",
    businessId
  );
  if (!catalogCountRow || catalogCountRow.count === 0) {
    const now = new Date().toISOString();
    for (const item of SEED_CATALOG_ITEMS) {
      await db.runAsync(
        `INSERT INTO catalog_items (id, business_id, kind, value, active, created_at, updated_at, synced)
         VALUES (?, ?, ?, ?, 1, ?, ?, 0)`,
        generateId(),
        businessId,
        item.kind,
        item.value,
        now,
        now
      );
    }
  }

  const quickSale = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM customers WHERE business_id = ? AND is_quick_sale = 1",
    businessId
  );
  if (!quickSale) {
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO customers (id, business_id, name, is_quick_sale, created_at, updated_at, synced)
       VALUES (?, ?, 'Quick Sale', 1, ?, ?, 0)`,
      generateId(),
      businessId,
      now,
      now
    );
  }

  return { businessId };
}

import { getDb } from "../client";
import { generateId } from "../../lib/uuid";
import type { Staff } from "../../types/db";

// Identity = a name picked once per phone (spec Part B §5, Part C §1 §2).
// There is deliberately NO login, PIN or password anywhere in this file —
// that was drafted and explicitly rejected (CLAUDE.md, Security).

export async function listStaff(businessId: string): Promise<Staff[]> {
  const db = await getDb();
  return db.getAllAsync<Staff>(
    "SELECT * FROM staff WHERE business_id = ? ORDER BY name COLLATE NOCASE ASC",
    businessId
  );
}

// Used by the picker's "that's not me" path — anyone can add themselves once
// (spec Part B §5). The roster syncs to Supabase later so all three phones
// converge on the same list.
export async function addStaff(
  businessId: string,
  name: string
): Promise<Staff> {
  const db = await getDb();
  const trimmed = name.trim();

  const existing = await db.getFirstAsync<Staff>(
    "SELECT * FROM staff WHERE business_id = ? AND name = ? COLLATE NOCASE",
    businessId,
    trimmed
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const row: Staff = {
    id: generateId(),
    business_id: businessId,
    name: trimmed,
    created_at: now,
    updated_at: now,
    synced: 0,
  };
  await db.runAsync(
    `INSERT INTO staff (id, business_id, name, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, 0)`,
    row.id,
    row.business_id,
    row.name,
    row.created_at,
    row.updated_at
  );
  return row;
}

// The single device_identity row, resolved to the staff member it points at.
// Returns null on a fresh install → the app shows the name picker.
export async function getDeviceStaff(businessId: string): Promise<Staff | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Staff>(
    `SELECT s.* FROM device_identity d
     JOIN staff s ON s.id = d.staff_id
     WHERE d.id = 1 AND s.business_id = ?`,
    businessId
  );
  return row ?? null;
}

export async function setDeviceStaff(
  businessId: string,
  staffId: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO device_identity (id, staff_id, business_id) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET staff_id = excluded.staff_id, business_id = excluded.business_id`,
    staffId,
    businessId
  );
}

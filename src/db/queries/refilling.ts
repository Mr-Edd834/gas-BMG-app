import { getDb } from "../client";
import { generateId } from "../../lib/uuid";
import { buildBatchCode, uniqueCompanyCode, batchDatePart } from "../../refilling/ids";
import { insertStockEvent } from "./stock";

// The supply side (spec Part C §4): empties leaving for a refiller, coming
// back full.
//
// Two rules run through everything here. Counts are never stored — how many
// cylinders are still out is a SUM over what was sent minus what has returned
// (G1) — and every movement also writes to the shared stock ledger (G2), which
// is what keeps "empties in hand" and "full stock" honest across the app.

export interface RefillCompany {
  id: string;
  name: string;
  director: string;
  phone: string;
  code: string;
  openBatches: number;
  cylindersOut: number;
}

export async function listCompanies(
  businessId: string
): Promise<RefillCompany[]> {
  const db = await getDb();
  const companies = await db.getAllAsync<{
    id: string;
    name: string;
    director: string;
    phone: string;
    code: string;
  }>(
    `SELECT id, name, director, phone, code
     FROM refill_companies WHERE business_id = ?
     ORDER BY name ASC`,
    businessId
  );
  if (companies.length === 0) return [];

  // Still-out counts per company, derived in one pass: everything sent, minus
  // everything returned, grouped by company.
  const outRows = await db.getAllAsync<{
    company_id: string;
    open_batches: number;
    out: number;
  }>(
    `SELECT b.company_id,
            COUNT(DISTINCT CASE WHEN sent.qty > COALESCE(ret.qty, 0)
                                THEN b.id END) AS open_batches,
            SUM(sent.qty - COALESCE(ret.qty, 0)) AS out
     FROM refill_batches b
     JOIN (SELECT batch_id, SUM(qty_sent) AS qty
           FROM refill_batch_lines GROUP BY batch_id) sent
       ON sent.batch_id = b.id
     LEFT JOIN (SELECT r.batch_id, SUM(rl.qty_returned) AS qty
                FROM refill_returns r
                JOIN refill_return_lines rl ON rl.return_id = r.id
                GROUP BY r.batch_id) ret
       ON ret.batch_id = b.id
     WHERE b.business_id = ?
     GROUP BY b.company_id`,
    businessId
  );
  const byCompany = new Map(outRows.map((r) => [r.company_id, r]));

  return companies.map((c) => ({
    ...c,
    openBatches: byCompany.get(c.id)?.open_batches ?? 0,
    cylindersOut: Math.max(0, byCompany.get(c.id)?.out ?? 0),
  }));
}

export async function listCompanyCodes(businessId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ code: string }>(
    "SELECT code FROM refill_companies WHERE business_id = ?",
    businessId
  );
  return rows.map((r) => r.code);
}

/**
 * Creates a company and assigns it a code unique within this shop.
 *
 * The code is resolved against the codes already taken at the moment of
 * creation, not derived blindly — two companies reducing to the same initials
 * would make their batch IDs ambiguous, which removes the only reason those
 * IDs exist.
 */
export async function createCompany(input: {
  businessId: string;
  name: string;
  director: string;
  phone: string;
}): Promise<{ id: string; code: string }> {
  const db = await getDb();
  const taken = await listCompanyCodes(input.businessId);
  const code = uniqueCompanyCode(input.name, taken);
  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO refill_companies
       (id, business_id, name, director, phone, code, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    id,
    input.businessId,
    input.name.trim(),
    input.director.trim(),
    input.phone.trim(),
    code,
    now,
    now
  );
  return { id, code };
}

export interface BatchLine {
  brand: string;
  size: string;
  sent: number;
  returned: number;
  out: number;
}

export interface RefillBatch {
  id: string;
  batchCode: string;
  companyId: string;
  companyName: string;
  sentAt: string;
  note: string | null;
  staffName: string;
  lines: BatchLine[];
  totalSent: number;
  totalOut: number;
}

/**
 * Batches for one company. `openOnly` drives the "current batches" list.
 *
 * A batch stays current until every line is fully back (spec §5). Partial
 * returns keep it visible showing what remains, because a half-returned batch
 * is precisely the one she still needs to chase.
 */
export async function listBatches(
  businessId: string,
  companyId: string,
  openOnly: boolean
): Promise<RefillBatch[]> {
  const db = await getDb();

  const batches = await db.getAllAsync<{
    id: string;
    batch_code: string;
    company_id: string;
    company_name: string;
    sent_at: string;
    note: string | null;
    staff_name: string | null;
  }>(
    `SELECT b.id, b.batch_code, b.company_id, c.name AS company_name,
            b.sent_at, b.note, st.name AS staff_name
     FROM refill_batches b
     JOIN refill_companies c ON c.id = b.company_id
     LEFT JOIN staff st ON st.id = b.staff_id
     WHERE b.business_id = ? AND b.company_id = ?
     ORDER BY b.sent_at DESC`,
    businessId,
    companyId
  );
  if (batches.length === 0) return [];

  const hydrated = await hydrateBatches(db, batches);
  return openOnly ? hydrated.filter((b) => b.totalOut > 0) : hydrated;
}

export async function loadBatch(
  businessId: string,
  batchId: string
): Promise<RefillBatch | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string;
    batch_code: string;
    company_id: string;
    company_name: string;
    sent_at: string;
    note: string | null;
    staff_name: string | null;
  }>(
    `SELECT b.id, b.batch_code, b.company_id, c.name AS company_name,
            b.sent_at, b.note, st.name AS staff_name
     FROM refill_batches b
     JOIN refill_companies c ON c.id = b.company_id
     LEFT JOIN staff st ON st.id = b.staff_id
     WHERE b.business_id = ? AND b.id = ?`,
    businessId,
    batchId
  );
  if (!row) return null;
  const [batch] = await hydrateBatches(db, [row]);
  return batch ?? null;
}

async function hydrateBatches(
  db: Awaited<ReturnType<typeof getDb>>,
  rows: {
    id: string;
    batch_code: string;
    company_id: string;
    company_name: string;
    sent_at: string;
    note: string | null;
    staff_name: string | null;
  }[]
): Promise<RefillBatch[]> {
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");

  const sentLines = await db.getAllAsync<{
    batch_id: string;
    brand: string;
    size: string;
    qty_sent: number;
  }>(
    `SELECT batch_id, brand, size, qty_sent FROM refill_batch_lines
     WHERE batch_id IN (${placeholders})`,
    ...ids
  );

  // Returns are summed per brand+size, because one batch line can come back
  // across several separate deliveries.
  const returnedLines = await db.getAllAsync<{
    batch_id: string;
    brand: string;
    size: string;
    qty: number;
  }>(
    `SELECT r.batch_id, rl.brand, rl.size, SUM(rl.qty_returned) AS qty
     FROM refill_returns r
     JOIN refill_return_lines rl ON rl.return_id = r.id
     WHERE r.batch_id IN (${placeholders})
     GROUP BY r.batch_id, rl.brand, rl.size`,
    ...ids
  );

  const key = (b: string, brand: string, size: string) => `${b}|${brand}|${size}`;
  const returnedMap = new Map(
    returnedLines.map((r) => [key(r.batch_id, r.brand, r.size), r.qty])
  );

  const linesByBatch = new Map<string, BatchLine[]>();
  for (const l of sentLines) {
    const returned = returnedMap.get(key(l.batch_id, l.brand, l.size)) ?? 0;
    const list = linesByBatch.get(l.batch_id) ?? [];
    list.push({
      brand: l.brand,
      size: l.size,
      sent: l.qty_sent,
      returned,
      out: Math.max(0, l.qty_sent - returned),
    });
    linesByBatch.set(l.batch_id, list);
  }

  return rows.map((r) => {
    const lines = (linesByBatch.get(r.id) ?? []).sort(
      (a, b) => a.brand.localeCompare(b.brand) || a.size.localeCompare(b.size)
    );
    return {
      id: r.id,
      batchCode: r.batch_code,
      companyId: r.company_id,
      companyName: r.company_name,
      sentAt: r.sent_at,
      note: r.note,
      staffName: r.staff_name ?? "",
      lines,
      totalSent: lines.reduce((s, l) => s + l.sent, 0),
      totalOut: lines.reduce((s, l) => s + l.out, 0),
    };
  });
}

/**
 * Records a send: the batch, its lines, its photos, and the ledger events.
 *
 * All in one transaction. A batch whose `sent` events were missing would leave
 * those cylinders counted as still in the shop — she would go to the next
 * refill collection believing she holds empties that physically left days ago.
 */
export async function createBatch(input: {
  businessId: string;
  companyId: string;
  companyCode: string;
  staffId: string;
  lines: { brand: string; size: string; qty: number }[];
  note: string | null;
  photoPaths: string[];
}): Promise<{ id: string; batchCode: string }> {
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  // How many batches already went to this company today, for the -NN suffix.
  const sameDay = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM refill_batches
     WHERE business_id = ? AND company_id = ? AND batch_code LIKE ?`,
    input.businessId,
    input.companyId,
    `${input.companyCode}-${batchDatePart(now)}-%`
  );
  const batchCode = buildBatchCode(
    input.companyCode,
    now,
    sameDay?.count ?? 0
  );
  const batchId = generateId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO refill_batches
         (id, business_id, company_id, batch_code, note, sent_at, staff_id,
          created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      batchId,
      input.businessId,
      input.companyId,
      batchCode,
      input.note,
      nowIso,
      input.staffId,
      nowIso,
      nowIso
    );

    for (const line of input.lines) {
      if (line.qty <= 0) continue;
      await db.runAsync(
        `INSERT INTO refill_batch_lines
           (id, business_id, batch_id, brand, size, qty_sent,
            created_at, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        generateId(),
        input.businessId,
        batchId,
        line.brand,
        line.size,
        line.qty,
        nowIso,
        nowIso
      );

      // Empties in hand go DOWN — they have physically left the shop.
      await insertStockEvent({
        businessId: input.businessId,
        eventType: "sent",
        scope: "empty",
        brand: line.brand,
        size: line.size,
        qty: line.qty,
        staffId: input.staffId,
        sourceType: "refill_batch",
        sourceId: batchId,
        occurredAt: nowIso,
      });
    }

    for (const path of input.photoPaths) {
      await db.runAsync(
        `INSERT INTO refill_photos
           (id, business_id, source_type, source_id, kind, local_path,
            cloud_url, created_at, updated_at, synced)
         VALUES (?, ?, 'batch', ?, 'cylinder', ?, NULL, ?, ?, 0)`,
        generateId(),
        input.businessId,
        batchId,
        path,
        nowIso,
        nowIso
      );
    }
  });

  return { id: batchId, batchCode };
}

/**
 * Records cylinders coming back from a refiller.
 *
 * These return as FULL stock, not as empties — that is the whole point of the
 * trip. So the ledger event is `returned-from-refill` against the full-stock
 * scope, which is what finally makes sellable stock go up.
 */
export async function recordRefillReturn(input: {
  businessId: string;
  batchId: string;
  staffId: string;
  lines: { brand: string; size: string; qty: number }[];
  note: string | null;
  cylinderPhotoPaths: string[];
  receiptPhotoPaths: string[];
}): Promise<void> {
  const db = await getDb();
  const nowIso = new Date().toISOString();
  const returnId = generateId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO refill_returns
         (id, business_id, batch_id, note, returned_at, staff_id,
          created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      returnId,
      input.businessId,
      input.batchId,
      input.note,
      nowIso,
      input.staffId,
      nowIso,
      nowIso
    );

    for (const line of input.lines) {
      if (line.qty <= 0) continue;
      await db.runAsync(
        `INSERT INTO refill_return_lines
           (id, business_id, return_id, brand, size, qty_returned,
            created_at, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        generateId(),
        input.businessId,
        returnId,
        line.brand,
        line.size,
        line.qty,
        nowIso,
        nowIso
      );

      await insertStockEvent({
        businessId: input.businessId,
        eventType: "returned-from-refill",
        scope: "full",
        brand: line.brand,
        size: line.size,
        qty: line.qty,
        staffId: input.staffId,
        sourceType: "refill_return",
        sourceId: returnId,
        occurredAt: nowIso,
      });
    }

    for (const path of input.cylinderPhotoPaths) {
      await insertPhoto(db, input.businessId, returnId, "cylinder", path, nowIso);
    }
    for (const path of input.receiptPhotoPaths) {
      await insertPhoto(db, input.businessId, returnId, "receipt", path, nowIso);
    }
  });
}

async function insertPhoto(
  db: Awaited<ReturnType<typeof getDb>>,
  businessId: string,
  returnId: string,
  kind: "cylinder" | "receipt",
  path: string,
  nowIso: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO refill_photos
       (id, business_id, source_type, source_id, kind, local_path, cloud_url,
        created_at, updated_at, synced)
     VALUES (?, ?, 'return', ?, ?, ?, NULL, ?, ?, 0)`,
    generateId(),
    businessId,
    returnId,
    kind,
    path,
    nowIso,
    nowIso
  );
}

export async function loadPhotos(
  sourceType: "batch" | "return",
  sourceId: string
): Promise<{ id: string; kind: "cylinder" | "receipt"; localPath: string }[]> {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT id, kind, local_path AS localPath FROM refill_photos
     WHERE source_type = ? AND source_id = ?
     ORDER BY created_at ASC`,
    sourceType,
    sourceId
  );
}

export interface DeliveryRecord {
  id: string;
  batchId: string;
  batchCode: string;
  returnedAt: string;
  note: string | null;
  staffName: string;
  lines: { brand: string; size: string; qty: number }[];
  photos: { id: string; kind: "cylinder" | "receipt"; localPath: string }[];
}

/**
 * Every return ever made to one company, newest first (spec §9).
 *
 * Per company rather than one global list: she thinks per company, and the
 * batch ID already carries the company anyway. Read-only and append-only —
 * a record only settles a dispute if it cannot be quietly altered, and with
 * three equal-permission phones an in-app delete is a delete for everyone.
 */
export async function listDeliveries(
  businessId: string,
  companyId: string,
  limit = 30,
  offset = 0
): Promise<DeliveryRecord[]> {
  const db = await getDb();

  const returns = await db.getAllAsync<{
    id: string;
    batch_id: string;
    batch_code: string;
    returned_at: string;
    note: string | null;
    staff_name: string | null;
  }>(
    `SELECT r.id, r.batch_id, b.batch_code, r.returned_at, r.note,
            st.name AS staff_name
     FROM refill_returns r
     JOIN refill_batches b ON b.id = r.batch_id
     LEFT JOIN staff st ON st.id = r.staff_id
     WHERE r.business_id = ? AND b.company_id = ?
     ORDER BY r.returned_at DESC
     LIMIT ? OFFSET ?`,
    businessId,
    companyId,
    limit,
    offset
  );
  if (returns.length === 0) return [];

  const ids = returns.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");

  const lines = await db.getAllAsync<{
    return_id: string;
    brand: string;
    size: string;
    qty_returned: number;
  }>(
    `SELECT return_id, brand, size, qty_returned FROM refill_return_lines
     WHERE return_id IN (${placeholders})`,
    ...ids
  );

  const photos = await db.getAllAsync<{
    id: string;
    source_id: string;
    kind: "cylinder" | "receipt";
    local_path: string;
  }>(
    `SELECT id, source_id, kind, local_path FROM refill_photos
     WHERE source_type = 'return' AND source_id IN (${placeholders})
     ORDER BY created_at ASC`,
    ...ids
  );

  const linesBy = new Map<string, { brand: string; size: string; qty: number }[]>();
  for (const l of lines) {
    const list = linesBy.get(l.return_id) ?? [];
    list.push({ brand: l.brand, size: l.size, qty: l.qty_returned });
    linesBy.set(l.return_id, list);
  }

  const photosBy = new Map<
    string,
    { id: string; kind: "cylinder" | "receipt"; localPath: string }[]
  >();
  for (const p of photos) {
    const list = photosBy.get(p.source_id) ?? [];
    list.push({ id: p.id, kind: p.kind, localPath: p.local_path });
    photosBy.set(p.source_id, list);
  }

  return returns.map((r) => ({
    id: r.id,
    batchId: r.batch_id,
    batchCode: r.batch_code,
    returnedAt: r.returned_at,
    note: r.note,
    staffName: r.staff_name ?? "",
    lines: (linesBy.get(r.id) ?? []).sort(
      (a, b) => a.brand.localeCompare(b.brand) || a.size.localeCompare(b.size)
    ),
    photos: photosBy.get(r.id) ?? [],
  }));
}

// Core schema — spec Part B §8 (starting point, "refine per section" as each
// section spec is actually built; see comments below on what's deliberately
// deferred to its owning section).
//
// Conventions applied to every synced table (tech spec §8, §3):
//   id            TEXT PK, UUID generated on-device (src/lib/uuid.ts)
//   business_id   TEXT, scopes every row to one shop (multi-shop reuse, §6)
//   synced        INTEGER 0/1, flips to 1 once pushed to Supabase (offline sync, §3)
//   created_at / updated_at   TEXT ISO-8601 timestamps
//
// G1 (never store a computed balance/count) means this file intentionally has
// NO "balance", "owed", "in_stock" etc. columns anywhere. Those are always
// derived at read time from the rows below.

export const SCHEMA_STATEMENTS: string[] = [
  `PRAGMA foreign_keys = ON;`,

  // One row per shop. Minimal — no billing/tenant-admin fields (spec Part A §1, §6).
  `CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,

  // The name-picker roster (spec Part B §5). No passwords — see CLAUDE.md Security.
  `CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,

  // Device-local only, never synced: which staff member this physical phone
  // belongs to (set once by the first-launch name picker). Single row per
  // install. Spec Part C §1 §2 "Identity context" (CURRENT_STAFF).
  `CREATE TABLE IF NOT EXISTS device_identity (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    staff_id TEXT REFERENCES staff(id),
    business_id TEXT REFERENCES businesses(id)
  );`,

  // Customer tabs (spec Part C §1 §3). is_quick_sale marks the single pinned
  // Quick Sale tab; there should only ever be one such row per business.
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL,
    is_quick_sale INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,

  // A sale (spec Part C §1 §5, §7). note is the one mutable field (G4);
  // everything else is written once and never edited (append-only, G5).
  `CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    customer_id TEXT NOT NULL REFERENCES customers(id),
    staff_id TEXT NOT NULL REFERENCES staff(id),
    cash_amount REAL NOT NULL DEFAULT 0,
    credit_amount REAL NOT NULL DEFAULT 0,
    note TEXT,
    receipt_photo_local_path TEXT,
    receipt_photo_cloud_url TEXT,
    sold_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);`,

  // One row per commodity line within a sale (spec Part C §1 §5, §7).
  // commodity_type: cylinder | airtime | burner | cooker.
  // empties_returned is only meaningful for commodity_type = 'cylinder'; it is
  // the count handed over AT SALE TIME (spec §5 CYLINDER picker). Later,
  // partial returns of the remainder are their own dated events — see
  // empty_returns below, added when the Debts section (build order #2) is
  // implemented, not here, to match that section's exact return-flow spec.
  `CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    sale_id TEXT NOT NULL REFERENCES sales(id),
    commodity_type TEXT NOT NULL CHECK (commodity_type IN ('cylinder','airtime','burner','cooker')),
    label TEXT NOT NULL,
    brand_or_supplier TEXT,
    size_or_denomination TEXT,
    qty INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    is_auto_priced INTEGER NOT NULL DEFAULT 0,
    empties_returned INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);`,

  // The editable catalog (spec Part C §6 §2). Seeded from src/catalog/seed.ts
  // on first launch. active supports soft-hide (never hard-delete an item
  // already referenced by immutable history — spec open item, Part C §6 §9).
  `CREATE TABLE IF NOT EXISTS catalog_items (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    kind TEXT NOT NULL,
    value TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_catalog_items_kind ON catalog_items(kind);`,

  // THE shared stock/empties event ledger (G2; spec Part C §4 §10 RETRO-NOTE,
  // applied back onto Home/Sales via Part C §1 §7b). ONE table feeds Debts
  // (empties in hand), Refilling, Reports and stock counts. Append-only.
  //
  // G1: there is deliberately no "count"/"stock level" column anywhere — the
  // two quantities the app needs are SUMs over these rows:
  //   full stock (brand+size)     = opening-count + returned-from-refill
  //                                 + manual-add − sold        [scope 'full']
  //   empties in hand (brand+size) = opening-count + received
  //                                 − sent + manual-add        [scope 'empty']
  //
  // `scope` exists because `opening-count` and `manual-add` are the only two
  // event types that can mean EITHER pile (Settings seeds both a full-stock
  // and an empties opening count — Refilling §10 "cold-start problem"), so the
  // row has to say which ledger it lands in. The other four types are
  // inherently one or the other ('sold'/'returned-from-refill' = full,
  // 'received'/'sent' = empty) and simply carry the matching scope.
  //
  // source_type/source_id link an event back to what caused it (e.g. the
  // sale_item that wrote it) without a hard FK, so this table stays usable by
  // sections whose own tables don't exist yet (Refilling batches).
  `CREATE TABLE IF NOT EXISTS stock_events (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('opening-count','received','sent','returned-from-refill','sold','manual-add')),
    scope TEXT NOT NULL CHECK (scope IN ('full','empty')),
    brand TEXT NOT NULL,
    size TEXT NOT NULL,
    qty INTEGER NOT NULL,
    staff_id TEXT REFERENCES staff(id),
    source_type TEXT,
    source_id TEXT,
    note TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_stock_events_item ON stock_events(business_id, scope, brand, size);`,
  `CREATE INDEX IF NOT EXISTS idx_stock_events_source ON stock_events(source_type, source_id);`,

  // One dated repayment against ONE specific debt (spec Part C §2 §4).
  //
  // sale_id, not just customer_id: every credit sale is its own debt with its
  // own fixed 7-day deadline (G3), so "Musa paid 500" is meaningless until you
  // know WHICH of Musa's three debts it was against. Attaching a payment to the
  // customer in general would make the deadlines unusable.
  //
  // Append-only. Three installments are three rows, never one row edited three
  // times — that is what makes the history a record rather than a running
  // total, and it is why a balance can always be recomputed from scratch.
  `CREATE TABLE IF NOT EXISTS repayments (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    sale_id TEXT NOT NULL REFERENCES sales(id),
    customer_id TEXT NOT NULL REFERENCES customers(id),
    staff_id TEXT NOT NULL REFERENCES staff(id),
    amount REAL NOT NULL,
    paid_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_repayments_sale ON repayments(sale_id);`,
  `CREATE INDEX IF NOT EXISTS idx_repayments_paid_at ON repayments(paid_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_repayments_customer ON repayments(customer_id);`,

  // One dated return of empties against ONE specific cylinder line (spec §5).
  //
  // Keyed to sale_item_id rather than the sale, because empties are owed per
  // brand+size: "3 K-Gas Small" and "2 Total Gas Big" on the same sale are two
  // separate batches that come back independently. Partial returns are normal,
  // so this is many rows per sale_item.
  `CREATE TABLE IF NOT EXISTS empty_returns (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    sale_item_id TEXT NOT NULL REFERENCES sale_items(id),
    customer_id TEXT NOT NULL REFERENCES customers(id),
    staff_id TEXT NOT NULL REFERENCES staff(id),
    qty INTEGER NOT NULL,
    returned_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_empty_returns_item ON empty_returns(sale_item_id);`,
  `CREATE INDEX IF NOT EXISTS idx_empty_returns_at ON empty_returns(returned_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_empty_returns_customer ON empty_returns(customer_id);`,

  // --- REFILLING (spec Part C §4) ------------------------------------------
  // The supply side: empties leaving for a refiller and coming back full.
  // Structurally separate from customer debt — different counterparties,
  // different obligations — but it writes into the SAME shared stock ledger
  // (G2), which is what keeps "empties in hand" and "full stock" truthful.

  // A refilling company. The ONE deliberate exception to this app's
  // no-phone-numbers rule (spec §0): a refiller is a business she must ring
  // when a batch is late, not a private walk-in customer.
  //
  // `code` is the short auto-derived prefix that makes batch IDs readable
  // ("KGD-11JUL26-01"). Stored rather than recomputed so an existing batch ID
  // stays decodable even if the company is later renamed.
  `CREATE TABLE IF NOT EXISTS refill_companies (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL,
    director TEXT NOT NULL,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_refill_companies_biz ON refill_companies(business_id);`,

  // One dated send. A batch can carry several brands at once, so the counts
  // live in refill_batch_lines rather than here — a batch is the unit of
  // tracking, not an individual cylinder (spec §2).
  `CREATE TABLE IF NOT EXISTS refill_batches (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    company_id TEXT NOT NULL REFERENCES refill_companies(id),
    batch_code TEXT NOT NULL,
    note TEXT,
    sent_at TEXT NOT NULL,
    staff_id TEXT REFERENCES staff(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_refill_batches_company ON refill_batches(company_id);`,
  `CREATE INDEX IF NOT EXISTS idx_refill_batches_sent ON refill_batches(sent_at DESC);`,

  // What went out, per brand and size. No "returned" column here (G1): how
  // many are back is a SUM over refill_return_lines, so a batch's remaining
  // count cannot drift from the returns that produced it.
  `CREATE TABLE IF NOT EXISTS refill_batch_lines (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    batch_id TEXT NOT NULL REFERENCES refill_batches(id),
    brand TEXT NOT NULL,
    size TEXT NOT NULL,
    qty_sent INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_refill_batch_lines_batch ON refill_batch_lines(batch_id);`,

  // One dated return against a batch. Partial returns are normal, so a batch
  // can have many of these — which is exactly why batch IDs exist: they
  // correlate returns that arrive weeks apart (spec §6).
  `CREATE TABLE IF NOT EXISTS refill_returns (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    batch_id TEXT NOT NULL REFERENCES refill_batches(id),
    note TEXT,
    returned_at TEXT NOT NULL,
    staff_id TEXT REFERENCES staff(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_refill_returns_batch ON refill_returns(batch_id);`,
  `CREATE INDEX IF NOT EXISTS idx_refill_returns_at ON refill_returns(returned_at DESC);`,

  `CREATE TABLE IF NOT EXISTS refill_return_lines (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    return_id TEXT NOT NULL REFERENCES refill_returns(id),
    brand TEXT NOT NULL,
    size TEXT NOT NULL,
    qty_returned INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_refill_return_lines_return ON refill_return_lines(return_id);`,

  // Photos for both a send and a return, up to 3 per slot (spec §7).
  //
  // One table with source_type/source_id rather than two near-identical ones:
  // the storage rule is the same for every photo in the app (never bytes in
  // the DB — a local path now, a cloud URL once synced), so the difference
  // between a send photo and a return receipt is data, not structure.
  `CREATE TABLE IF NOT EXISTS refill_photos (
    id TEXT PRIMARY KEY NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    source_type TEXT NOT NULL CHECK (source_type IN ('batch','return')),
    source_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('cylinder','receipt')),
    local_path TEXT NOT NULL,
    cloud_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_refill_photos_source ON refill_photos(source_type, source_id);`,

  // Per-device preferences (spec Part C §6 §5): whether reminders fire, and
  // at what hour.
  //
  // Deliberately NOT synced and deliberately not carrying a business_id.
  // These describe THIS PHONE's behaviour, not the shop's records — one staff
  // member silencing her own notifications must not silence everyone else's.
  // Everything else in this database is a record of something that happened;
  // this table is the only one holding a setting, which is why it is the only
  // one that may be overwritten in place rather than appended to.
  `CREATE TABLE IF NOT EXISTS device_prefs (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
];

// Deliberately NOT created here yet — each is owned by a section spec later
// in the build order (see CLAUDE.md "Build order") and will be added, matched
// exactly to that section's spec, when that section is built:
//   - refilling companies / batches / batch_lines / batch photos / batch returns (Refilling §2-9).

-- BMG Shop App — cloud schema
--
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste →
-- Run. It is safe to run again; every statement is IF NOT EXISTS.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS, AND WHAT IT IS NOT
-- ---------------------------------------------------------------------------
-- The phone is the source of truth. Every write succeeds on the device first,
-- offline, immediately — this database is a copy kept somewhere the phone
-- cannot be dropped in a puddle. Nothing in the app ever waits on it.
--
-- That is why there are no constraints here that could REJECT a row the phone
-- has already accepted. A foreign key that fails server-side would strand a
-- sale the shop believes is recorded, which is worse than a missing reference.
-- References are declared for readability and for the query planner, and left
-- deferrable-in-spirit: rows arrive in dependency order from the sync engine,
-- and anything out of order simply syncs on the next pass.
--
-- ---------------------------------------------------------------------------
-- WHY TIMESTAMPS ARE text, NOT timestamptz
-- ---------------------------------------------------------------------------
-- The phone stores ISO-8601 strings and does every calculation on-device (G1).
-- Storing them as timestamptz here would make them round-trip through a
-- different type on the way back down, so a pulled row could differ from the
-- row that was pushed — the one thing a backup must never do. Nothing needs
-- date arithmetic server-side, so text is both safer and honest about what
-- this table is: a faithful copy.
--
-- ---------------------------------------------------------------------------
-- `synced` IS NOT HERE ON PURPOSE
-- ---------------------------------------------------------------------------
-- It is local bookkeeping — "has this row been pushed yet" — and means nothing
-- on the server. Every row that reaches this database is, by definition,
-- synced.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table if not exists businesses (
  id          text primary key,
  name        text not null,
  created_at  text not null,
  updated_at  text not null
);

create table if not exists staff (
  id          text primary key,
  business_id text not null references businesses(id),
  name        text not null,
  created_at  text not null,
  updated_at  text not null
);

-- ---------------------------------------------------------------------------
-- Customers and sales
-- ---------------------------------------------------------------------------

create table if not exists customers (
  id            text primary key,
  business_id   text not null references businesses(id),
  name          text not null,
  is_quick_sale integer not null default 0,
  created_at    text not null,
  updated_at    text not null
);

create table if not exists sales (
  id                        text primary key,
  business_id               text not null references businesses(id),
  customer_id               text not null,
  staff_id                  text,
  cash_amount               numeric not null default 0,
  credit_amount             numeric not null default 0,
  note                      text,
  -- Kept for sales recorded before sale_photos existed. Not migrated: see the
  -- note in src/db/schema.ts — this app does not rewrite history to tidy a
  -- schema.
  receipt_photo_local_path  text,
  receipt_photo_cloud_url   text,
  sold_at                   text not null,
  created_at                text not null,
  updated_at                text not null
);

create table if not exists sale_items (
  id                   text primary key,
  business_id          text not null references businesses(id),
  sale_id              text not null,
  commodity_type       text not null,
  label                text not null,
  brand_or_supplier    text,
  size_or_denomination text,
  qty                  integer not null,
  unit_price           numeric not null,
  is_auto_priced       integer not null default 0,
  empties_returned     integer,
  created_at           text not null,
  updated_at           text not null
);

create table if not exists sale_photos (
  id          text primary key,
  business_id text not null references businesses(id),
  sale_id     text not null,
  local_path  text not null,
  cloud_url   text,
  created_at  text not null,
  updated_at  text not null
);

create table if not exists sale_corrections (
  id                  text primary key,
  business_id         text not null references businesses(id),
  cancelled_sale_id   text not null,
  replacement_sale_id text,
  reason              text,
  staff_id            text,
  created_at          text not null,
  updated_at          text not null
);

-- A sale can be cancelled exactly once, here as well as on the phone. Without
-- it, two devices correcting the same sale while offline would both succeed
-- and the shop would have two replacements for one mistake.
create unique index if not exists sale_corrections_cancelled_idx
  on sale_corrections(cancelled_sale_id);

-- ---------------------------------------------------------------------------
-- Debt: money back, and cylinders back
-- ---------------------------------------------------------------------------

create table if not exists repayments (
  id          text primary key,
  business_id text not null references businesses(id),
  sale_id     text not null,
  customer_id text not null,
  staff_id    text,
  amount      numeric not null,
  paid_at     text not null,
  created_at  text not null,
  updated_at  text not null
);

create table if not exists empty_returns (
  id           text primary key,
  business_id  text not null references businesses(id),
  sale_item_id text not null,
  customer_id  text not null,
  staff_id     text,
  qty          integer not null,
  returned_at  text not null,
  created_at   text not null,
  updated_at   text not null
);

-- ---------------------------------------------------------------------------
-- The catalog, and the shared stock ledger
-- ---------------------------------------------------------------------------

create table if not exists catalog_items (
  id          text primary key,
  business_id text not null references businesses(id),
  kind        text not null,
  value       text not null,
  active      integer not null default 1,
  created_at  text not null,
  updated_at  text not null
);

create table if not exists stock_events (
  id          text primary key,
  business_id text not null references businesses(id),
  event_type  text not null,
  scope       text not null,
  brand       text not null,
  size        text not null,
  qty         integer not null,
  staff_id    text,
  source_type text,
  source_id   text,
  note        text,
  occurred_at text not null,
  created_at  text not null,
  updated_at  text not null
);

-- ---------------------------------------------------------------------------
-- Refilling
-- ---------------------------------------------------------------------------

create table if not exists refill_companies (
  id          text primary key,
  business_id text not null references businesses(id),
  name        text not null,
  director    text not null,
  phone       text not null,
  code        text not null,
  created_at  text not null,
  updated_at  text not null
);

create table if not exists refill_batches (
  id          text primary key,
  business_id text not null references businesses(id),
  company_id  text not null,
  batch_code  text not null,
  note        text,
  sent_at     text not null,
  staff_id    text,
  created_at  text not null,
  updated_at  text not null
);

create table if not exists refill_batch_lines (
  id          text primary key,
  business_id text not null references businesses(id),
  batch_id    text not null,
  brand       text not null,
  size        text not null,
  qty_sent    integer not null,
  created_at  text not null,
  updated_at  text not null
);

create table if not exists refill_returns (
  id          text primary key,
  business_id text not null references businesses(id),
  batch_id    text not null,
  note        text,
  returned_at text not null,
  staff_id    text,
  created_at  text not null,
  updated_at  text not null
);

create table if not exists refill_return_lines (
  id           text primary key,
  business_id  text not null references businesses(id),
  return_id    text not null,
  brand        text not null,
  size         text not null,
  qty_returned integer not null,
  created_at   text not null,
  updated_at   text not null
);

create table if not exists refill_photos (
  id          text primary key,
  business_id text not null references businesses(id),
  source_type text not null,
  source_id   text not null,
  kind        text not null,
  local_path  text not null,
  cloud_url   text,
  created_at  text not null,
  updated_at  text not null
);

-- ---------------------------------------------------------------------------
-- Indexes the sync engine and any future reporting will actually use
-- ---------------------------------------------------------------------------

create index if not exists sales_business_idx        on sales(business_id, sold_at desc);
create index if not exists sale_items_sale_idx       on sale_items(sale_id);
create index if not exists sale_photos_sale_idx      on sale_photos(sale_id);
create index if not exists repayments_sale_idx       on repayments(sale_id);
create index if not exists empty_returns_item_idx    on empty_returns(sale_item_id);
create index if not exists stock_events_business_idx on stock_events(business_id, occurred_at desc);
create index if not exists refill_batches_company_idx on refill_batches(company_id);

-- ---------------------------------------------------------------------------
-- NOT SYNCED, deliberately, and therefore absent:
--
--   device_identity — which staff member THIS phone is. Personal to the
--                     handset; syncing it would make three phones fight over
--                     one name.
--   device_prefs    — reminder on/off and hour. One staff member silencing
--                     her own notifications must not silence everyone else's.
-- ---------------------------------------------------------------------------

-- Row-level security is in 02-rls.sql. Do not put this database in front of a
-- real shop until that has been run AND tested — an unprotected anon key is
-- readable by anyone who unzips the APK.

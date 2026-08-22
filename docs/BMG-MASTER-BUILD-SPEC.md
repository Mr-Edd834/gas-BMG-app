# BMG Shop App — MASTER BUILD SPECIFICATION

> **This is the single source of truth for building the BMG Shop App.** It combines
> every section spec, the technical architecture, global rules, security requirements,
> and the interactive design mockups into one document. Read it top to bottom before
> writing code.
>
> **Assembled for:** Claude Code, building the real React Native + Expo app in Edd's
> local project folder. **Builder/owner:** Edd. **Client:** owner of a small Kenyan
> retail shop ("duka").

---

## 0. How to read this document

This master file is organized in four parts:

1. **Part A — Orientation (this front-matter):** what the app is, the consolidated
   tech stack and how each piece is used, the global rules that apply everywhere, the
   SECURITY requirements, and the list of open/deferred decisions. **Read this first
   and in full.**
2. **Part B — Technical architecture:** the complete `00-tech-architecture.md`.
3. **Part C — Section specs:** the six sections (`01`–`06`), each a full build spec.
   Build in this order; later specs contain RETRO-NOTES that amend earlier ones —
   apply them.
4. **Part D — Design mockups:** the interactive JSX phone-frame mockups for every
   section. These are **web (React/Tailwind/lucide-react) prototypes** used during
   design. They are the **visual blueprint** — match their layout, structure, spacing,
   color, and flow. They are NOT the code to ship (the app is React Native, not web).
   Expect ~90% visual fidelity: fonts/shadows render differently in RN, and the charts
   in the Reports mockup are hand-built placeholders to be rebuilt with a real RN chart
   library. Use the mockups to resolve any visual ambiguity the prose leaves open.

**Priority order if two parts ever seem to conflict:** the SECURITY section (Part A §5)
and this front-matter's global rules win over older text inside section specs; a later
section spec's RETRO-NOTE wins over the earlier spec it amends; the tech architecture
wins on data/schema/sync; the mockups win on visual detail.

---

## 1. What the app is

- Replaces a paper credit-notebook for a small Kenyan gas/airtime shop. **#1 job:
  accurately track informal customer debt — money owed AND unreturned cylinder
  empties** — because that's where the client currently leaks revenue.
- **Record-keeper, not a payments processor.** It never moves money; it only logs
  cash/credit transactions that happened elsewhere. (Keeps it clear of e-money
  licensing; keeps PII minimal under Kenya's Data Protection Act 2019.)
- **Reuse, not SaaS.** Built for this client now, with a reusable core so Edd can
  manually onboard 1–2 more shops later. No billing, no public signup, no tenant
  admin console.
- **Offline-first is non-negotiable** — a physical shop with unreliable connectivity.

---

## 2. Consolidated tech stack — WHAT is used and HOW (read before any section)

This is the whole technical picture at a glance. The authoritative detail is Part B
(`00-tech-architecture.md`); this is the map.

### Frontend
- **React Native + Expo, Android-first.** Near-zero iOS usage for this user profile.
- UI is built as native RN components styled to match the Part D mockups. **No web
  libraries ship** — the mockups' React DOM / Tailwind / recharts are design-only.
- **Charts:** react-native-gifted-charts or victory-native (pick one at build; keep
  consistent). Rebuild the Reports mockup's hand-drawn bars with the real library.
- **Local notifications:** expo-notifications (on-device; no push server).
- **Local photo files:** expo-file-system.

### Local storage (the on-device source of truth)
- **expo-sqlite.** Every write (sale, debt, repayment, return, photo ref, catalog
  edit, ledger event) succeeds **offline, immediately**, against local SQLite. The app
  must be fully usable with no internet. Offline is the normal state, never shown as
  an error.

### Backend (cloud backup + multi-device sync)
- **Supabase (hosted Postgres).** The cloud mirror of local SQLite and the sync point
  between the 3 phones. **Supabase Storage** holds photo files; the DB stores only a
  reference (path/URL), never image bytes.
- A background routine pushes unsynced local rows to Supabase when online, and pulls
  peers' changes, calmly and invisibly.

### How frontend ↔ backend work together (sync model)
- **UUID primary keys** generated on-device so 3 offline phones never collide.
- **Append-only wherever possible** (sales, repayments, returns, ledger events) → no
  merge conflicts. Rare edits/deletes (e.g. a sale note) use **last-write-wins**.
- **Balances/counts are never synced as values** — they're recomputed from the synced
  event history on each device (see Global Rule G1). This is why sync is safe.
- **Multi-shop isolation:** every table carries `business_id`; **Supabase Row Level
  Security** enforces that a device only ever reads/writes its own shop's rows.

### Build & deploy
- **EAS Build → APK, sideloaded** (NOT the Play Store). Configure EAS to output
  **`.apk`**, not the default `.aab`. Install by transferring the file + enabling
  "install from unknown sources" once per phone.
- Per-shop deployment is manual (Edd), not self-serve.

---

## 3. The catalog — the ONLY real client data

Everything else that appears in the mockups (names, timestamps, sample customers, demo
history, MB figures, example counts) is **placeholder that must NEVER ship**. The
catalog below is **real seed data**: it ships pre-loaded on first launch and is
editable in Settings.

- **Cylinder brands:** K-Gas, Total Gas, Afrigas, Pro Gas, Sea Gas, Rubis, Kobil,
  National Oil, G-Gas, Gold Gas, Others. **Sizes:** Small, Big.
- **Airtime suppliers:** Safaricom, Airtel. **Denominations:** 10, 20, 50, 100.
  **Pricing: always 95% of face value**, auto-computed (no price box). Sold in packs
  of 10 and singles.
- **Burner brands:** Skytec, PineGas, Orgaz, Cosco.
- **Cooker types:** Mini-cylinder grill, Double burner stove.

---

## 4. Global rules (apply in EVERY section)

- **G1 — Balances/counts are ALWAYS calculated from event history, never stored.**
  Money owed = credit − repayments. Empties owed = taken − returned. Empties in hand =
  opening + received − sent. Full stock = opening + returned-from-refill + manual-add −
  sold. Storing a computed balance as a field is forbidden (it creates the "two truths"
  bug). This is the app's central integrity principle.
- **G2 — One shared stock/empties event ledger** feeds Debts, Refilling, Reports, and
  stock. Event types: `opening-count`, `received`, `sent`, `returned-from-refill`,
  `sold`, `manual-add`. (Defined in Refilling §10 and Settings §3.)
- **G3 — Each credit sale is its own debt**, with a fixed **7-day deadline** from the
  sale date, that **never resets on partial payment**. Repayments/returns are
  individual dated events (3 installments = 3 records).
- **G4 — History is immutable** except one deliberate exception: a sale's free-text
  **note** may be edited/added after the fact (it doesn't affect any calculation).
  Everything else is corrected by adding a new entry, never by rewriting.
- **G5 — Records are append-only; no in-app delete for anyone.** Deletion of a record
  happens only by the developer directly in Supabase (rare, accountable). Applies
  especially to the Debts record, Sales Record, and Refilling deliveries record.
- **G6 — Staff auto-attribution:** every sale/repayment/return records which phone's
  staff member logged it, with a full timestamp. No extra taps.
- **G7 — Seed vs placeholder:** ship ONLY the catalog (§3) as seed. Never hardcode any
  mockup placeholder into the app.
- **G8 — Offline never blocks.** Any action can complete offline; sync later. Optional
  things (receipt photos) never block a save.

---

## 5. SECURITY

> **DECISION (2026-08-23): no app-entry PIN/password lock.** An earlier draft
> of this spec added a per-phone PIN lock on top of the name-picker model.
> Edd reviewed and explicitly rejected it — **removed, not built.** The
> original tech-doc §5 model stands as the real design: name-picker only, no
> login, no passwords, no device lock. Do not reintroduce a PIN/lock screen
> without a new explicit decision.

### 5.1 App entry (no lock)
- **No PIN, no password, no login screen.** First launch asks only for the
  staff member's name (the name picker) and remembers it on that device.
- **NOT** full accounts: no login-as-any-user, no per-user cloud credentials,
  no cross-phone login. This deliberately avoids network-dependent auth on
  unreliable connectivity.
- If device-loss protection is ever wanted later, that's a fresh decision to
  raise with Edd — do not silently add a lock screen to "be safe."

### 5.2 Backend & data security (Supabase)
- **Row Level Security (RLS) must be actually enabled and enforced** on every table,
  keyed on `business_id`, so a device can only ever read/write its own shop's data.
  RLS being "present" is not enough — policies must be tested to actually block
  cross-shop and unauthorized access.
- **No secrets in the APK.** Only the Supabase anon/public key ships in the app; the
  service-role key NEVER ships and is never embedded in the client. All privileged
  operations stay server-side / in Edd's hands.
- **Least privilege:** the app's Supabase role can do only what the app needs (the
  CRUD its tables require), nothing more. No broad admin rights from the client.
- **Transport security:** all app↔Supabase traffic over HTTPS/TLS (Supabase default);
  do not disable cert validation.
- **Local data at rest:** with no app-entry lock, the SQLite business data is
  protected only by normal device security (screen lock, if the owner sets
  one — outside this app's control). If full local DB encryption (e.g.
  SQLCipher) is feasible without breaking expo-sqlite, it's a nice-to-have
  hardening step, but it's not a substitute for a lock screen and is not
  required for MVP. (OPEN: revisit if the client asks for stronger
  device-loss protection.)
- **Photos:** stored in Supabase Storage with access restricted to the owning shop
  (bucket policies aligned to `business_id`); never world-readable public URLs.
- **Deletes stay developer-only** (Global Rule G5) — this is also a security/integrity
  control: no in-app path can destroy records.
- **PII minimization** (Data Protection Act 2019): store only what the notebook had
  (customer name + debt) plus the deliberate supplier-contact exception in Refilling
  (company/director/phone — businesses she must call). Support deleting a customer's
  record on request (developer-side).

### 5.3 What did NOT change
- Name picker, one-person-per-phone, equal permissions, auto-attribution — all
  retained, and there is no lock in front of them.

---

## 6. Open / deferred decisions (surfaced so nothing drifts silently)

Resolve with Edd; do not silently pick.
- **Typography** for RN (mockups used web fonts; not locked).
- **Airtime 0.95 rate** editability (fixed now; maybe Settings-editable later).
- **"Due soon" window** (currently ≤2 days) and **low-stock threshold** (default ≤2) —
  both tunable.
- **Reminder time** is a per-device preference — confirm it need not sync across phones.
- **Same-morning reminder stacking** vs one daily roll-up.
- **Photo compression level** (unbounded storage is a cost trap — pick a sane default).
- **Catalog item removal** when already used in history: soft-hide vs hard-delete
  (must never corrupt immutable history — prefer soft-hide).
- **Navigation:** six sections (Home, Debts, Sales Record, Reports, Refilling,
  Settings) exceed a comfortable bottom-tab count — group some under a "More" overflow.
- **Whether an overdue unreturned empty ever converts to a money charge —
  DECIDED: no.** It never converts. Empties owed stays a separate, permanent
  count; there is no path in the app that bills a customer for a cylinder.
- **Phase 2 (do NOT build now):** margin/profit KPIs (needs cost-price capture);
  automated supplier-return discrepancy flagging; full inventory beyond lean stock;
  global cross-company deliveries view; staff-activity KPI.

---

# PART B — TECHNICAL ARCHITECTURE

*(The complete technical architecture spec follows. Note: its §5 "multi-user" text
predates the security decision — Part A §5 above supersedes any no-password language.)*
-e 


# BMG Shop App — Technical Architecture Spec

> **Status:** LOCKED (architecture). Cross-cutting technical foundation for the
> whole app. Every section spec (Home/Sales, Debts, Reports, Settings…) builds on
> this. Read this first in any Claude Code session.

---

## 1. What this app is (one paragraph)

A digital replacement for a paper credit-notebook used by a small Kenyan retail
shop selling gas cylinders, burners, cookers, and airtime. Its #1 job is tracking
informal customer debt (money owed **and** cylinders owed) accurately. It is a
record-keeper, not a payments processor — it never moves money, only logs
transactions that happened in cash/credit outside the app. Built for this client
now, with a reusable core so 1–2 more shops can be onboarded later (manually, by
the developer — not a public self-serve SaaS).

---

## 2. Stack (LOCKED)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **React Native + Expo** | Android-first. iOS usage ~nil for this user. |
| Local DB | **expo-sqlite** | On-device source of truth. Bundled in the APK; no user permission prompt (lives in the app's private sandbox). |
| Backend/DB | **Supabase** (hosted Postgres) | Cloud backup + multi-device sync target. |
| Charts | **react-native-gifted-charts** (or victory-native) | For the Reports section. Web charting libs (recharts) are mockup-only and do NOT ship. |
| Distribution | **EAS Build → APK**, sideloaded | Not the Play Store. See §7. |
| Notifications | **expo-notifications** (local) | For debt/repayment reminders. No server push needed. |

Do **not** re-debate the stack. If a genuinely blocking incompatibility appears,
flag it explicitly rather than silently switching.

---

## 3. Offline-first (NON-NEGOTIABLE — decide before writing schema code)

This is a physical shop in Kenya with unreliable connectivity. **Every** write
(sale, repayment, tab, catalog edit) must succeed with **zero** internet and sync
later. This is an architecture decision, not a feature toggle.

### Model
- **expo-sqlite on the phone is the source of truth.** All reads and writes hit
  local SQLite first, synchronously, regardless of network.
- Each locally-created/modified row carries a **`synced` flag** (default `false`)
  and a `updated_at` timestamp.
- A background sync routine, when the device is online, finds `synced = false`
  rows, pushes them to Supabase, and flips them to `true` on confirmation. If the
  push fails (patchy signal), the flag stays `false` and it retries next cycle.
  The user never sees or manages this.
- Sync direction is **local → cloud** primarily (backup), plus a **cloud → local**
  pull to bring in other phones' changes (see multi-user, §5).

### UX rule
- Sync/backup status is shown **calm and informational** ("Saved on device · will
  back up when online" / "Backed up 2 min ago"). **Never** a red alarm. Offline is
  the normal condition here.

---

## 4. Data integrity — the balance is ALWAYS calculated (RULE)

- **Never store a customer's debt balance as a field.** Balance is always derived:
  `sum(unpaid sale amounts) − sum(repayments)` for that customer. Same for
  cylinders owed: `sum(cylinders taken on credit) − sum(empties returned)`.
- Reason: one source of truth. If a stored balance and the transaction history
  ever disagreed, you couldn't tell which is right without recomputing anyway. So
  we don't store two truths — history is the truth, balance is a live calculation.
- Corrections to past sales are made with **new adjusting entries**, never by
  rewriting history. Past sale money/items are immutable (only the free-text note
  on a sale is editable — see Home/Sales spec §6).

---

## 5. Multi-user (3 staff, 3 phones) (LOCKED)

Reversed from an earlier "single user" assumption. Now: up to **3 staff**, each on
**their own phone**, one person per device.

- **Identity:** name-picker on first launch per device; the device remembers its
  person. No login screen, no passwords. Everyone has **equal permissions**
  (all can log sales, repayments, delete records, edit catalog).
- **Attribution:** every sale/repayment is auto-tagged with the device's staff
  member. This is why "Logged by {staff}" can appear with zero extra taps.
- **Roster:** stored in Supabase so all phones converge on the same staff list.
  If someone's name isn't in the picker yet, a "that's not me" option lets them
  add themselves once.
- **Record IDs:** generate **UUIDs on the device** (not auto-increment integers),
  so two offline phones can't create colliding IDs before they sync.
- **Conflict resolution:** most operations are **append-only** (new sales,
  repayments) → no conflict, just two new rows. For the rare edits/deletes
  (delete a customer, edit catalog, mark empties), use **last-write-wins** keyed
  on `updated_at`. This is sufficient at this scale; do NOT add heavy conflict
  machinery (this is why expo-sqlite is fine and WatermelonDB is unnecessary).

---

## 6. Multi-shop reuse (LOCKED, mostly future)

- One **shared Supabase project** across shops. Every table carries a
  **`business_id`** column; each shop's app only ever queries its own
  `business_id`.
- Enforce isolation with **Row Level Security** policies in Supabase, so the
  database itself — not just app code — prevents one shop reading another's data.
- **No** billing, public signup, or tenant-admin console. Onboarding a new shop is
  a manual setup the developer runs. Future shops will have different commodities,
  so the catalog is per-business configurable (see Settings spec, when written).

---

## 7. Distribution — how the frontend becomes an installable APK

- Development/run: `npx expo start` (free, no cloud build needed).
- Build the installable file: **EAS Build** (Expo's cloud build service, free tier
  ~15 Android builds/month — ample for one shop).
- **Must configure EAS to output an `.apk`**, not the default `.aab` (App Bundle),
  because an AAB can't be sideloaded directly. One profile setting in `eas.json`
  (e.g. a `preview` profile with `"buildType": "apk"`).
- Loop: `eas login` → `eas build -p android --profile preview` → download `.apk`.
- Install on her phone: transfer the APK (USB/WhatsApp/Drive), tap it, allow
  "install from unknown sources" once. No Play Store account required.
- Updates repeat the same loop.

---

## 8. Database schema (starting point — refine per section)

Tables (all carry `id` UUID PK, `business_id`, `synced`, `created_at`, `updated_at`):

- **`staff`** — `name`. The roster for the name-picker.
- **`customers`** — `name`, `is_quick_sale` (bool, for the pinned Quick Sale tab),
  `frequency`/access data (or derive from sales). Minimal PII by design: a name
  and nothing more (no phone numbers — she already has those in her own phone).
- **`sales`** — `customer_id`, `staff_id` (attribution), `cash_amount`,
  `credit_amount`, `note` (nullable, editable), `receipt_photo_ref` (nullable),
  `sold_at`.
- **`sale_items`** — `sale_id`, `commodity_type` (cylinder|airtime|burner|cooker),
  `label`, `brand`/`supplier` (nullable), `size`/`denomination` (nullable),
  `qty`, `unit_price` or `auto_price`, `empties_returned` (cylinders only, int).
- **`repayments`** — `customer_id`, `staff_id`, `amount`, `paid_at`. (Debts spec
  will expand this.)
- **`catalog_items`** — powers the editable catalog. `kind` (cylinder_brand|
  cylinder_size|airtime_supplier|airtime_denomination|burner_brand|cooker_option|
  airtime_rate|...), `value`, `active`. Seeded on first launch (see §9), fully
  editable in Settings.
- **`supplier_log`** — cylinders taken to suppliers for refilling: supplier,
  brand, size, qty, taken date, expected/actual return. (Supplier spec later.)

Balances/owed amounts are **not** columns anywhere — always derived (§4).

---

## 9. Seed vs placeholder data (STRICT — see also each section spec)

- **SEED (ships pre-loaded on first launch; client can keep/edit/delete in
  Settings):** the real catalog the client provided —
  - Cylinder brands: K-Gas, Total Gas, Afrigas, Pro Gas, Sea Gas, Rubis, Kobil,
    National Oil, G-Gas, Gold Gas, Others
  - Cylinder sizes: Small, Big
  - Airtime suppliers: Safaricom, Airtel — denominations: 10, 20, 50, 100
  - Airtime rate: 0.95 (95% of face value)
  - Burner brands: Skytec, PineGas, Orgaz, Cosco
  - Cooker options: Mini-cylinder grill, Double burner stove
  - The pinned **Quick Sale** customer tab.
- **PLACEHOLDER (mockup only — must NEVER ship; appears only once the client
  enters real data):** staff names, greeting name, customer names, all timestamps,
  any sample sales/history.

---

## 10. Regulatory / data note

- Minimal PII by design (a name + debt only; no phone numbers, no new contact
  data). Keeps exposure low under Kenya's Data Protection Act 2019, but a name +
  debt is still personal data — support **deleting a customer's record on request**
  (a destructive action → one confirm step).
- The app never moves funds, so no e-money licensing exposure — it only logs
  cash/credit transactions that occurred elsewhere.

---

## 11. Out of scope for MVP (deferred — do not build yet)
- Automated supplier-return discrepancy flagging (needs manual log running first).
- Margin/profitability KPIs (blocked on whether the client tracks cost price).
- Supplier-side payables.
- M-Pesa as a distinct payment method (payment is binary Cash vs Credit for now).
- First-launch guided catalog setup screen (deferred; catalog is editable in
  Settings regardless).
-e 

---

# PART C — SECTION SPECS

> The six sections, in build order. Later specs contain RETRO-NOTES that amend earlier ones — apply them.

---

# BMG Shop App — Home / Sales Section Spec

> **Status:** LOCKED (design). This document is the build spec for the Home screen
> and the entire add-sale flow. It is written for a Claude Code session that will
> implement it in React Native (Expo). Pair it with `00-tech-architecture.md` for
> stack, storage, and sync rules.

---

## 0. Reading rules for whoever builds this

- **SEED DATA** = ships pre-loaded on first launch. Real catalog the client gave us.
  The client can keep, edit, or delete any of it later via the Settings/Catalog
  screen (specced separately). Do **not** treat seed data as immutable, and do
  **not** invent additional seed data beyond what is listed here.
- **PLACEHOLDER DATA** = shown in mockups only (names, timestamps, sample customers,
  demo sales). It must **never** ship. These fields start empty and populate only
  when the client uses the app. Any name, date, or history in this doc marked
  *(placeholder)* is illustrative — do not hardcode it.
- **RULES / STRUCTURE** = the actual spec. Pricing formulas, picker patterns, sort
  order, validation, the frozen-facts/editable-note rule. Build these exactly.

---

## 1. Visual language (applies app-wide, defined once here)

### Color tokens
| Token | Hex | Use |
|---|---|---|
| `paper` | `#EEF0EC` | App background |
| `ink` | `#16231F` | Primary text, dark UI elements |
| `blue` | `#2B6CB5` | Primary actions, active states, links |
| `amber` | `#C2540B` | Owed / outstanding / warning (never alarm-red) |
| `green` | `#2F7A4D` | Paid / settled / save actions |
| `line` | `#C9CDC3` | Borders, dividers |
| `muted` | `#586159` | Secondary text (labels, captions) |
| `mutedLight` | `#525B53` | Timestamps, fine print, detail lines |
| `white` | `#FFFFFF` | Card surfaces |

> Muted tones were deliberately darkened for outdoor/shop-counter legibility.
> Keep them clearly *below* `ink` in weight so hierarchy survives, but never so
> light they wash out against `paper`. Do not lighten them back.

### Typography
- The RN build uses the platform default sans (system font) unless custom fonts are
  wired later. **OPEN:** Space Grotesk (display) / IBM Plex Sans (body) were used in
  web mockups but are **not** locked for the RN app. If added, display = headings/
  amounts, body = everything else. Until then, weight + size carry the hierarchy.

### Shared components
- **Stepper**: `[ − ] value [ + ]`. Minus is a 32px neutral circle (`#F1F2EE`,
  `line` border). Plus is a 32px `blue` circle. Value is bold, centered. Has a
  `min` (0 or 1 depending on context). Used everywhere quantities are set.
- **Card**: white surface, 1px `line` border, 12–16px radius, 12–20px padding.
- **Status chip**: small rounded pill. Amber bg (`#FCEFE6`)/amber text for owed;
  green bg (`#EAF5EE`)/green text for paid.

### Interaction rules (cross-cutting — apply on every screen)
- Touch targets ≥ 44×44px with a visible background fill. Never a bare icon in
  whitespace. (The header back button is a 44px filled circle for this reason.)
- Routine actions (save a sale, add to cart) require zero confirmation taps.
- Destructive/irreversible actions require exactly one confirm step.
- Offline/sync state is shown calm and informational — never a red alarm banner.
  Offline is this app's normal condition, not an error.
- Money is always displayed as `KSh <comma-grouped>` (e.g. `KSh 2,200`).

---

## 2. Identity context (needed by this section, defined fully in tech doc)

- The app is used by up to **3 staff** on **3 separate phones**, one person per
  phone. Each phone learns its person **once** (name picker on first launch),
  then remembers it. No login, no passwords, everyone has equal permissions.
- The signed-in staff name for the current device is referenced here as
  `CURRENT_STAFF`. It drives the greeting and the automatic sale attribution.
- **PLACEHOLDER:** mockups used `Njeri` / `Amos`. Real names come from the picker.

---

## 3. HOME SCREEN — the customer-tab wall

The Home screen is **not** a dashboard. It is a wall of customer tabs. KPIs and
debt totals live in other sections. Home answers one question: "whose account do
I want, and let me act on it fast."

### Layout, top to bottom
1. **Date line** — small uppercase `muted`. *(placeholder value; real = today.)*
2. **Greeting** — `Habari, {CURRENT_STAFF}`. Large, bold, `ink`. Always the
   **staff member on this phone**, not the customer. *(name is placeholder until
   picker is set.)*
3. **Search bar** — white, `line` border, search icon + input. Filters the tab
   wall live by customer name.
4. **`Add new tab +`** — full-width `ink` button, white text. The **only** way to
   create a new customer tab. This is a text button, NOT a floating "+" icon.
5. **Tab wall** — scrollable list of customer tabs (see below).

### Customer tab (card)
Each tab represents a customer's permanent account with the shop. Tabs **never
disappear** and their appearance does **not** change based on paid/unpaid status
(debt is the Debts section's job, not Home's).

Contents:
- **Name** (bold, `ink`).
- **`walk-in` chip** (blue) — only on the pinned Quick Sale tab.
- **Last item line** — most recent purchase summary, `mutedLight`.
- **Timestamp** — clock icon + `DD/MM/YYYY · h:mm AM/PM`, `mutedLight`.
  *(placeholder until real sales exist.)*
- **Footer: two equal buttons**, split by a divider:
  - `View previous sales` (left, `ink`) → opens that customer's history.
  - `Add sale +` (right, `blue`) → opens the add-sale flow **pre-bound to this
    customer** (no name step).

### Tab ordering (RULE)
Sort by **access frequency, descending** — most-frequently-used tabs float to the
top (like a most-watched list). This is the core fix for recurring customers: the
people she deals with most are one tap away, no search needed.
- **Exception:** the **Quick Sale** tab is **pinned to the top** regardless of
  frequency, and sales logged under it do **not** count toward any customer's
  frequency ranking.

---

## 4. QUICK SALE tab (the walk-in / one-off fix)

- A permanent, pinned tab named **Quick Sale**, always at the top of the wall.
- Used for one-off cash customers who don't need a tracked account, so the app
  never forces a name for a stranger buying airtime (protects the fast-entry goal).
- `Add sale +` on it runs the **same** add-sale flow, minus the name step.
- `View previous sales` on it shows **every quick sale** made (same history screen
  as any tab, just populated with all quick-sale records).
- Quick sales are excluded from customer frequency ranking (see §3).

---

## 5. ADD-SALE FLOW

One continuous flow, two steps: **build the cart**, then **payment**. The same
flow serves both "new tab" (asks name first) and "add sale to existing tab"
(name already known). Difference is *only* whether the name field appears.

### Header
- 44px filled-circle back button. Back from payment → returns to build step.
  Back from build step → cancels the whole sale.
- Title: `New tab` (new) / `Sale · {name}` (existing) / `Payment` (payment step).

### STEP 1 — Build the cart

**Name field** — shown **only** when creating a new tab. Free text. Required to
save a new-tab sale.

**Commodity buttons** — a row of 4, pinned near the top. Tapping one opens that
commodity's inline picker (below). The four:
| Key | Label | Notes |
|---|---|---|
| `cylinder` | Cylinder | brand → Small/Big, price + empties |
| `airtime` | Airtime | supplier → denomination, auto-priced |
| `burner` | Burner | brand → qty + price |
| `cooker` | Cookers | flat options → qty + price |

> **The cart pattern (RULE, solves the back-and-forth problem):** picking a
> commodity drops a **card into a cart list** on the *same* screen. Tap another
> commodity, another card drops in. She builds the whole basket in one view — no
> navigating between a picker screen and a list screen. Running **total** shows
> at the bottom with a `Move to payment →` button (only visible once cart > 0).

**Cart line (each item in the basket):**
- Shows label, quantity/detail line, and line total.
- **Tap the line to EDIT it** (full rollback): the line is pulled back out of the
  cart and its picker reopens **pre-filled** with all its values. Fix anything
  (qty, price, empties, supplier, packs/singles), then `Save changes` re-adds it.
  Cancelling an edit restores the original line unchanged (nothing lost).
- A separate **✗** deletes the line outright.
- Implementation note: editing = remove-and-reopen through the *same* add path,
  so there is no second code path that can drift from the add logic.

### Commodity pickers (inline, three shapes)

**CYLINDER picker:**
- Searchable brand list. Recently-used brands float to the top.
- **SEED brands** (pre-loaded, client-editable in Settings): `K-Gas`,
  `Total Gas`, `Afrigas`, `Pro Gas`, `Sea Gas`, `Rubis`, `Kobil`,
  `National Oil`, `G-Gas`, `Gold Gas`, `Others`. (`Others` is the shop's
  catch-all for minor brands — keep it.)
- Pick a brand → **both size rows appear: Small AND Big, each starting at 0.**
  Bump only the size(s) actually sold. Each size row, once qty > 0, reveals:
  - its own **price box** (she types the price — cylinders vary, no preset),
  - its own **empties-returned stepper** (0..qty), showing `(n owed)` in amber
    until all are back, `(all back)` in green when equal.
- **Empties model (RULE):** empties returned is an **exact count per size**, so
  partial returns (buy 3, return 2) live on one card. Unreturned empties become a
  cylinder-debt tracked in the Debts section.
- On save, emits **one cart line per size** that has qty > 0.

**AIRTIME picker:**
- **SEED suppliers:** `Safaricom`, `Airtel`. **SEED denominations:** `10`, `20`,
  `50`, `100` (both suppliers). All client-editable in Settings later.
- Pick supplier → four denomination rows. Each row has **two steppers: Packs and
  Singles** (1 pack = 10 cards). Both start at 0. Bump either.
- **PRICING RULE — automatic, no price box:** price = **95% of total face value**.
  `cards = packs*10 + singles`; `price = round(cards * denominationFaceValue * 0.95)`.
  Verified against client examples: full pack of 10s = KSh 95; 5×20 = 95;
  2×50 = 95; full pack of 20s = 190; full pack of 50s = 475. The row shows its
  computed price live once any quantity is set.
- **SEED rate:** `0.95`. It is currently a fixed rule. **OPEN / future:** decide
  whether the rate becomes an editable catalog value in Settings (so the client
  can change 95% without a code change). For now, treat 0.95 as seed config, not a
  buried magic number — store it where Settings can later reach it.
- On save, emits **one cart line per denomination** that has any quantity, tagged
  with packs/singles and the auto-price.

**BURNER / COOKER picker (flat):**
- Per-option rows, each with a qty stepper (start 0) and, once qty > 0, a price
  box she types.
- **SEED burner brands:** `Skytec`, `PineGas`, `Orgaz`, `Cosco`.
- **SEED cooker options:** `Mini-cylinder grill`, `Double burner stove`.
  (Cookers is the deliberately-named catch-all section so a single-item commodity
  doesn't get its own tab; it has room for future one-off appliances.)
- On save, emits one cart line per option with qty > 0.

### Price-required validation (RULE)
The `Add to sale` / `Save changes` button is **disabled** whenever any row has
qty > 0 but a missing or non-positive price. An amber helper line explains why:
"Add a price for each item before continuing." **Airtime is exempt** (auto-priced).
This makes it impossible to log a sale with a silent zero price.

### STEP 2 — Payment
- **Total due** card (sum of all cart lines).
- **Paid in cash now** field + **On credit** field. Both editable — supports
  split payment (pay half now, half on credit).
- **Live reconciliation strip:** `cash + credit` vs `total`:
  - equal → green "Fully accounted for"
  - short → amber "Still unaccounted", shows remainder
  - over → red-ish "Over-paid — check amounts"
- **Attach receipt photo** — optional, toggle. **Must never block saving.**
- **Note** — optional, open-ended textarea. Not required.
- **Save sale** — green, full width. Footer shows `Logged by {CURRENT_STAFF} ·
  {DD/MM/YYYY · h:mm AM/PM}` — automatic attribution to the phone's staff member
  and full date + time. *(values placeholder until real save.)*
- After save → return to Home, brief "Sale saved" toast. The customer's tab
  reflects the new sale; its frequency bumps (unless quick sale).

---

## 6. VIEW PREVIOUS SALES (per-customer history)

Opened via `View previous sales` on any tab. **View-only for money/items.**

### Per-sale card (collapsed)
- Date/time (`mutedLight`), total (bold).
- Item summary line.
- Status chip: amber "KSh n credit" if any credit, else green "Fully paid".
- Small camera icon if a receipt is attached; note icon if a note exists.

### Expanded (tap to open)
- Each line item with qty, price, and for cylinders the `n/qty empties back`.
- Cash / credit split breakdown.
- Receipt photo (if attached).
- `Logged by {staff}`.
- **Note — the ONE editable thing here (RULE):** the note can always be edited or
  added, whether or not one existed originally. Everything else (amounts, items,
  payment, attribution, timestamp) is **frozen**.
  - Rationale: a note is a memo and does not feed the debt calculation, so editing
    it is safe. The sale's financial facts must stay immutable to protect the
    debt balance (which is *calculated* from sales, never stored). Corrections to
    money/items are made with a **new adjusting entry**, not by rewriting history.
  - **Build note:** do not "helpfully" lock the note along with the rest, and do
    not make other fields editable by pattern-matching the note. The note is a
    deliberate, isolated exception.

### Empty state
"No sales recorded yet." (e.g. a brand-new tab, or Quick Sale before any use.)

---

## 7. Data this section reads/writes (see tech doc for schema)

Writes: a `sale` (customer_id or quick-sale flag, staff attribution, timestamp,
cash amount, credit amount, optional note, optional receipt photo ref) and its
`sale_items` (commodity type, label/brand/size/denomination, qty, unit or
auto price, empties-returned for cylinders).

Reads: customer tabs + frequency, per-customer sale history, catalog (brands,
sizes, suppliers, denominations, cooker/burner options, airtime rate).

Never stores a customer "balance" — it is always derived from sales minus
repayments (see tech doc, §data-integrity).

---

## 7b. RETRO-NOTE — lean stock wiring (added after Refilling + Settings) — APPLY THIS

This was decided after Home/Sales was first specced; it modifies this section.

- **Every cylinder sale must write a `sold` event** into the shared stock/empties
  ledger (see `04-refilling-section.md` §10), per brand + size, quantity sold. This is
  what makes full-stock counts actually decrease. Without it the opening count and
  Reports stock figures never move.
- **Scope = LEAN stock only** (confirmed): a current count per brand+size, derived as
  `full stock = opening-count + returned-from-refill + manual-add − sold`. NOT a full
  inventory system (no purchase orders, valuation, wastage, stock-takes) — that's
  Phase 2.
- **Low-stock warning:** when a brand+size's derived full stock is at/below a small
  threshold (tunable; default e.g. ≤2), surface a calm, non-blocking warning in the
  add-sale flow (e.g. a subtle badge on that cylinder option). It **must never block a
  sale** — she can always sell; it only informs. Selling into negative stock is
  allowed but should show the count as low/negative honestly (usually means the opening
  count or a refill wasn't recorded — the fix is a `manual-add`, per Settings §3).
- Only **cylinders** carry stock tracking for MVP. Airtime/burners/cookers are NOT
  stock-tracked at this stage (can be added later; airtime especially is float, not
  physical stock).
- The empties side is unchanged from the original spec: cylinders handed over at a
  sale still write a `received` event (empties-in-hand), and this is separate from the
  `sold` full-stock decrement. A single cylinder sale can therefore write BOTH a `sold`
  (full stock down) and, if the customer hands over an empty, a `received` (empties up).

---

## 8. Open items carried out of this section
- Typography (custom fonts) not locked for RN.
- Airtime 95% rate: fixed rule now; decide later if it becomes editable catalog config.
- Low-stock threshold value — tunable, not locked.
- Greeting name, all timestamps, staff names, sample customers/history = placeholder,
  populate on real use only.
-e 

---

# BMG Shop App — Debts Section Spec

> **Status:** LOCKED (design). Build spec for the Debts section. Read
> `00-tech-architecture.md` first (offline-first, calculated-never-stored balances,
> multi-user, schema) and `01-home-sales-section.md` (where sales/empties originate).
> This section consumes the data those produce; it does not create sales.

---

## 0. Reading rules (same as every section spec)

- **SEED DATA** = ships pre-loaded, client-editable in Settings. (This section has
  **none of its own** — all catalog seed lives in the Home/Sales + tech specs.)
- **PLACEHOLDER DATA** = mockup-only, never ships. Every name, amount, date, time,
  and count in this doc is placeholder. Real values come from actual sales,
  repayments, and returns once the app is in use. Do **not** hardcode any of them.
- **RULES / STRUCTURE** = the actual spec. Build exactly.

> The client has confirmed: the only real (seed) data she has given anywhere is the
> **catalog** (brands, sizes, suppliers, denominations, airtime rate, cooker/burner
> options — all in the Home/Sales + tech specs). **Everything in the Debts section
> is placeholder** and must appear empty until real activity generates it.

---

## 1. What the Debts section is

The collections cockpit. It answers "who owes me, how much, how urgently, and let
me record what comes back." It tracks **two independent kinds of debt** per
customer:

1. **Money owed** — unpaid credit from sales.
2. **Empties owed** — gas cylinders taken on credit whose empty shells haven't
   been returned.

These are independent: a customer can be square on money but still owe empties, or
vice-versa. Never merge them into a single "balance."

---

## 2. Core data rules (inherit from tech spec, restated because they're load-bearing)

- **Balances are ALWAYS calculated, never stored.**
  - Money owed on a debt = `sale credit amount − sum(repayments applied to that debt)`.
  - Empties owed on a batch = `empties taken on credit − sum(empties returned for that batch)`.
  - The UI must recompute live. (In the mockup, logging a repayment immediately
    drops the shown balance — this is the correct real behavior, not a demo trick.)
- **Each credit sale is its own debt** with its **own fixed 7-day deadline** from
  the sale date. A customer with 3 credit sales has 3 debts, 3 deadlines.
- **Deadlines never reset** on partial payment. Paying half of Monday's debt on
  Wednesday leaves that debt's deadline at the following Monday.
- Repayments and returns are **individual dated events** — three installments are
  three separate records, never collapsed into one.
- Corrections are made by new entries, never by editing history.

---

## 3. Screen structure

Debts is one screen with a **two-way toggle** at the top:
`[ Money owed | Empties owed ]`. Below the toggle, a one-line summary
(`KSh N outstanding` / `N empties out`). Each view has its own list and its own
chronological record. Layout, colors, and shared components follow the visual
language defined in `01-home-sales-section.md` §1 (same palette, Stepper, cards,
44px touch targets, calm-not-alarming principle).

---

## 4. MONEY OWED view

### List — grouped by customer, expandable
- One card per customer who has any unpaid debt. **Customers with zero owed do not
  appear.** (A debt fully repaid disappears from the list — it lives on only in the
  record, §6.)
- **Collapsed customer card shows:** status dot (see §7) · customer name · debt
  count · **total owed** (amber, live-calculated across their debts).
- **Tap to expand:** each individual debt as its own row —
  - status dot · item description · "Taken {DD/MM/YYYY}" · **amount still owed**
    (amber) · "KSh N paid" (green) if partially paid.
  - a `Log repayment on this debt` button under each debt.
- **Grouping into two sections (RULE):**
  - **"Needs collecting"** — pinned at top, customers whose most-urgent debt is
    overdue or due-soon (see §7 thresholds), sorted most-urgent first.
  - **"On track"** — everyone else.
  - This grouping *replaces* the earlier per-row day-countdown text, which was
    removed for being cluttered. Do not reintroduce "Nd overdue" text stamps.

### Repayment flow (RULE — payment attaches to a SPECIFIC debt)
Because each debt has its own deadline, a repayment must be applied to **one chosen
debt**, not the customer in general. Tapping `Log repayment on this debt` opens a
sheet showing:
- which debt (item + taken date), the amount **currently owed on it**,
- an amount field (partial allowed),
- live feedback: "This clears the debt" / "KSh N will remain",
- over-payment is blocked ("More than owed — check the amount"),
- an explicit reminder that the 1-week deadline does not reset.
- On save: writes a dated repayment event (with staff attribution + timestamp),
  the debt's live balance drops, and if it hits zero the debt leaves the list.

---

## 5. EMPTIES OWED view

Mirror structure to Money owed.
- One card per customer who still owes empties. **Zero-owed customers don't appear.**
- **Collapsed card:** status dot · name · **flame icon + total empties out** (amber).
- **Expanded:** each batch — status dot · "{brand} · {size}" · "Taken {date}" ·
  **N out** · a `Tick off returned empties` button.
- Same "Needs collecting" / "On track" grouping and status-dot logic as §4/§7.

### Return flow (RULE — attaches to a specific batch, partial allowed)
`Tick off returned empties` opens a sheet with a **Stepper** (0..still-out) for how
many came back now. Supports partial returns. On confirm: writes a dated return
event, the batch's live "out" count drops, and a cleared batch leaves the list.

### Empties in hand (subtle summary — READ-ONLY here)
A **collapsible, deliberately small** bar at the top of the Empties view:
`Empties in hand (for refill) — {total}`. Tapping expands to a per-brand/size
breakdown (e.g. `K-Gas · Small — 6`) plus the grand total.
- **Purpose:** so when the supplier comes to collect empties for refilling, she
  knows how many she physically holds, and of which types.
- **This is NOT the "empties owed" list.** It is the opposite pile: empties that
  are physically in her shop.
- **DATA-MODEL RULE (important — do not get this wrong):** an empty enters her
  possession **two ways**, and BOTH must be recorded as an "empty received" event
  for this total to be truthful:
  1. a customer **returns** an empty (a return event, §5), and
  2. an empty is **handed over at point of sale** (the cylinder-sale case in
     Home/Sales where empties-returned = the quantity bought, i.e. no empty owed).
  The current Home/Sales flow only stores empties *owed*; it must **also** store
  empties *received* at sale time so this count is correct. (Flagged as a
  cross-section requirement — see §9.)
- **This bar is read-only in Debts.** The action that *reduces* it (sending empties
  to the supplier for refill) lives in the **future Refilling section**, which owns
  the decrement. Hard dependency — see §9.
- Formula: `empties in hand (per type) = sum(empties received of that type)
  − sum(empties sent for refill of that type)`.

---

## 6. THE RECORD (chronological, interleaved, searchable)

Each view has a `View record` button opening a full historical ledger. **This is
the most-misread part — build it exactly:**

- **It is a complete, interleaved, time-ordered ledger of EVERY event, both
  directions**, newest first. NOT grouped by customer.
  - **Money record** = every **credit taken** (money out) + every **repayment**
    (money in), mixed together strictly by when each happened.
  - **Empties record** = every **empty taken** (out) + every **empty returned**
    (in), mixed by time.
- Different customers interleave naturally — Musa's Tuesday credit sits between two
  of Wanjiru's events if that's the true time order.
- **Each row shows, fully visible (RULE — no truncation):**
  - a **direction indicator** (↑ amber = out / taken; ↓ green = in / repaid /
    returned),
  - customer name,
  - the amount (money) or count (empties),
  - **what it was** on its own line — for taken-on-credit events include the
    **commodity + quantity** (e.g. "K-Gas · Small cylinder ×1"). This line wraps
    freely and must never be clipped.
  - a direction tag ("credit taken" / "repaid" / "taken" / "returned"),
  - the **full date AND time**.
- **Layout requirement:** rows are multi-line (name+amount / detail / tag+datetime)
  specifically so long commodity descriptions never push the date and time off
  screen. Do not collapse back to a single truncating line.
- **Search:** a name filter isolates one customer's full timeline out of the stream.
- Expect this list to be **long** (she extends credit to many customers). The DB
  must store every event durably and the list must **paginate / lazy-load**, sorted
  by timestamp descending, indexed on timestamp and on customer for search. Do not
  load the entire history into memory at once.

---

## 7. Status dots + urgency (replaces day-countdown clutter)

A small colored dot per row/customer conveys urgency calmly:
- **Red dot** = overdue (deadline passed).
- **Amber dot** = due soon (within 2 days of deadline — *tunable*, see below).
- **No dot** = on track.
- A customer's card takes the most urgent dot among their debts.
- "Needs collecting" = anyone with a red or amber dot; "On track" = the rest.
- **Threshold note (OPEN, easily tuned):** "due soon" is currently defined as ≤2
  days before the 7-day deadline. If the client wants a different window (1 or 3
  days), it's a one-line change. Not locked.

---

## 8. REMINDERS

- **Mechanism:** local, on-device notifications (**expo-notifications**). No server,
  no internet required — fire even when the app is closed and offline. Critical
  given unreliable shop connectivity.
- **Per debt / per empties-batch** (matches the per-sale deadline model). Each
  credit sale schedules its own notifications at creation time.
- **Two fires each:**
  - **Day-6 heads-up** (one day before deadline), and
  - **Day-7 due** reminder (on the deadline).
- **Time of day:** a **fixed set time each day — default 09:00** (a calm morning
  slot before the day's rush). Not "7 days to the minute from sale."
- **Content:** customer name, amount owed (or empties owed), and the **commodity +
  quantity** taken on credit. Tapping opens straight to that debt in Debts.
- **Lifecycle:**
  - If a debt is **fully cleared** before a scheduled fire → cancel its remaining
    notifications (don't chase settled money).
  - **Partial payment** does NOT cancel and does NOT reset the deadline — the
    scheduled reminder stays, but the amount it will display updates.
- Empties get the same treatment (heads-up + due, 9:00, per batch).
- **OPEN (future option, not built):** if many debts land on the same morning she
  gets multiple 09:00 notifications (faithful to per-debt). A single daily roll-up
  ("You have N debts to collect today") is the alternative if stacking annoys her.
  Noted, not implemented.

---

## 9. Cross-section dependencies (flag so nothing is built on a false assumption)

- **Empties-received event (needs Home/Sales change):** for "empties in hand" (§5)
  to be truthful, the sale flow must record empties handed over at point of sale as
  a received event, in addition to the existing empties-owed tracking. This is a
  Home/Sales data-model addition driven by this section.
- **Refilling section (not yet specced):** owns the "send empties to supplier for
  refill" action that **decrements** empties-in-hand. Until it exists, the in-hand
  count only ever grows. Build the in-hand bar read-only in Debts; do not add a
  reset/decrement action here.

---

## 10. Data this section reads/writes (see tech spec §8 schema)

- **Reads:** sales with a credit component (→ money debts), cylinder sale-items with
  unreturned empties (→ empties owed), the full event history (→ the record),
  empties-received + empties-sent-for-refill (→ empties in hand).
- **Writes:** `repayments` (customer/debt id, staff, amount, timestamp),
  empty-return events (batch id, staff, count, timestamp). Both are append-only
  dated events; balances are derived from them, never stored.
- Schedules/cancels local notifications as debts are created/cleared.

---

## 11. Open items carried out of this section
- "Due soon" window (currently ≤2 days) — tunable, not locked.
- Same-morning reminder stacking vs single daily roll-up — noted, not built.
- Empties-in-hand depends on (a) a Home/Sales empties-received event and (b) the
  future Refilling section's decrement action.
- Whether an unreturned empty past deadline ever converts to a money charge
  (keep deposit / bill for the cylinder) — **DECIDED: no.** Never build a
  charge-conversion path; empties owed stays a permanent, separate count.
-e 

---

# BMG Shop App — Sales Record Section Spec

> **Status:** LOCKED (design). Build spec for the global Sales Record tab. Read
> `00-tech-architecture.md` (offline-first, storage, schema) and
> `01-home-sales-section.md` (where sales originate; the per-customer history that
> shares this data) first. This section only *reads* sales — it never creates or
> edits them.

---

## 0. Reading rules (same as every section spec)

- **SEED DATA** = none in this section. All catalog seed lives in the Home/Sales +
  tech specs.
- **PLACEHOLDER DATA** = everything shown here (names, items, amounts, dates,
  times, staff, notes, photos) is mockup-only and must NEVER ship. Real rows come
  from actual sales once the app is in use. Do not hardcode any of it.
- **RULES / STRUCTURE** = the actual spec. Build exactly.

---

## 1. What the Sales Record is

A **global, chronological record of every sale ever made** — the sales-side twin of
the Debts record. It answers "show me all sales, filtered how I want," whereas the
per-customer "View previous sales" (in Home) answers "what has *this* customer
bought." Same data, two lenses (see §5).

- Lives as its **own top-level tab**, peer to Home, Debts, (planned) Reports.
- View-only. No editing sales here (a sale's note is editable only from the
  per-customer history, per Home/Sales spec — not here).

---

## 2. Every sale shows these fields (all required)

Per the client: each sale row must show **all** of the following — nothing hidden
behind a tap:

1. **Who bought** (customer name; or the Quick Sale tab for walk-ins).
2. **What was bought** (items + quantities).
3. **Total cost.**
4. **How much was paid firsthand** (cash portion) and the credit portion.
5. **When** — full **date AND time of day**.
6. **Who logged it** (staff attribution — automatic, from the device).
7. **The note**, if one was taken.
8. **The receipt photo**, if one was taken.

---

## 3. Layout — all fields visible, but calm (RULE)

The client wants everything on the row (no collapse/expand) AND a minimal,
uncrowded feel. Resolve this with a **3-line hierarchy**, not a single dense line:

- **Line 1:** customer name (+ a small "quick" chip if it was a Quick Sale) on the
  left, **total** (bold) on the right. This is the scan anchor.
- **Line 2:** what was bought (items + quantities), wraps freely.
- **Line 3:** quiet metadata in one wrapping row — the cash/credit split
  ("KSh N cash · KSh N credit" in amber, OR "Paid in full (cash)" in green) ·
  "by {staff}" · "{DD/MM/YYYY} · {h:mm AM/PM}".
- **Note + photo:** rendered **only when they exist**, in a strip beneath the row —
  the note as a subtle tinted box, the photo as a **small thumbnail** (not a large
  block). Most sales have neither, so most rows stay to three clean lines; the ones
  with extras get them without bloating every row.

Follow the app-wide visual language from `01-home-sales-section.md` §1 (palette,
cards, 44px touch targets, darker muted tones for legibility). Keep it consistent
with the Debts record's row rhythm so the user learns **one** long-list pattern,
not several.

---

## 4. Controls (all confirmed in)

- **Search** — by customer name, filters the list live.
- **Filter chips** — `All | Cash | Credit | Quick`:
  - Cash = sales with zero credit; Credit = sales with any credit portion;
    Quick = sales made under the Quick Sale tab.
- **Date range** — a From→To filter (DD/MM/YYYY), toggled from a calendar button.
- **Running total** — a live "N sales shown · KSh {sum of shown totals}" line that
  updates as filters/search/date-range change. High value for a shop owner
  ("how much did I sell this week?").
- Newest first, always. Expect this list to be **long** → paginate / lazy-load,
  sorted by timestamp descending, indexed on timestamp and customer (see tech spec).

---

## 5. Shared data source (RULE — do not build twice)

There are **two views of sales history** in the app:
- **Per-customer** — "View previous sales" inside a Home customer tab (that
  customer's sales only; the note is editable there).
- **Global** — this Sales Record tab (all sales, filterable).

They are the **same underlying sales data**, viewed two ways. Build **one** sales
data source/query layer feeding both. Do not create two parallel stores that could
drift. The only behavioural difference: per-customer allows note editing; the global
record is fully read-only.

---

## 6. Receipt photo storage (ARCHITECTURE — applies wherever photos appear)

Receipt photos attach at sale time (Home/Sales payment step, optional, never
blocking) and surface here and in per-customer history. How they're stored:

- **Never store the image in the database.** The DB row stores only a **reference**
  (local file path + cloud URL). Images are large binaries; putting them in
  SQLite/Postgres bloats the DB and cripples sync. (Client raised this correctly.)
- **On-device (immediate, offline):** save the photo to the app's private storage
  via **expo-file-system**. Works with zero signal. The sale's SQLite row stores the
  local path. This is the source of truth the instant the shutter is tapped.
- **Cloud (backup):** **automatic** upload to **Supabase Storage** (a file bucket,
  separate from the Postgres tables) when online, as part of the normal sync
  routine. The row then also holds the cloud URL. A lost/broken phone must not mean
  lost receipts — same integrity bar as all other data.

### Freeing up phone storage (LOCKED behaviour)
- **Backup is automatic; local deletion is the client's to do whenever she wants.**
  A "free up space" action (lives in Settings/storage management) lets her clear
  local photo files on her own schedule.
- **HARD GUARDRAIL:** she may only delete local photos that are **confirmed backed
  up**. A photo taken offline that hasn't synced yet is the ONLY copy — deleting it
  = permanent loss (violates the "data loss = business-ending" constraint). The
  free-up action must skip / refuse / clearly warn on any not-yet-synced photo.
- Viewing a cleared-but-backed-up photo later **re-fetches from the cloud** (needs
  signal at that moment). Acceptable trade for reclaimed space; the user should
  understand it.

### OPEN decision (deferred — flag, don't assume)
- **Compression level of the stored/synced copy** — not yet decided:
  1. **Full original** — pristine, ~3–8 MB each, slow sync + heavy data use on poor
     signal.
  2. **Light compression** (~1600px long edge, ~80% JPEG, few hundred KB) — receipt
     stays fully legible, syncs fast. Common middle path.
  3. Some setting between.
  - This affects only the stored/synced copy and is a **tunable parameter, not an
    architecture change** — safe to decide later. Note: lighter files also mean
    storage fills far slower, making "free up space" a rare need rather than a
    routine chore.

---

## 7. Navigation note (app-wide, tracked here)

Sales Record is a top-level tab. Running tab count so far: **Home, Debts, Sales
Record**, plus planned **Reports** (and Refilling/Settings still to place). Bottom
tab bars stay comfortable at ~5 items; 6+ needs a "More" overflow. Track this as
remaining sections are placed — it's now a real constraint, not unlimited.

---

## 8. Data this section reads

- **Reads:** all sales + their sale_items, cash/credit split, staff attribution,
  timestamps, notes, and receipt photo references (local path / cloud URL). Same
  `sales` / `sale_items` tables defined in the tech spec §8.
- **Writes:** none (view-only). Note-editing happens only in per-customer history.

---

## 9. Open items carried out of this section
- Receipt photo **compression level** — deferred (see §6).
- Overall **bottom-nav tab count** — watch as Reports/Refilling/Settings are placed.
-e 

---

# BMG Shop App — Refilling Section Spec

> **Status:** LOCKED (design). Build spec for the Refilling tab (supplier side —
> sending empties out to refilling companies and receiving them back as full
> cylinders). Read `00-tech-architecture.md` and `02-debts-section.md` first — this
> section shares the empties/stock event ledger with Debts and introduces lean
> stock tracking that touches Home/Sales. **This section contains RETRO-NOTES (§10)
> that update already-locked sections — apply them.**

---

## 0. Reading rules (same as every section spec)

- **SEED DATA** = none of its own. Uses the cylinder brand catalog + Small/Big
  sizes (defined in Home/Sales + tech specs).
- **PLACEHOLDER DATA** = every company, director, phone, batch, date, count, note,
  and photo shown here is mockup-only and must NEVER ship. Real data comes from
  use. Do not hardcode any of it.
- **RULES / STRUCTURE** = the actual spec. Build exactly.
- **Deliberate PII exception:** this section stores supplier **company name +
  director name + director's phone**. This is a conscious carve-out from the app's
  otherwise strict no-phone-numbers rule (see tech spec §10), justified because
  suppliers are businesses she must call, not private walk-in customers. Store it;
  it is intentional.

---

## 1. What Refilling is

Tracks the cycle of empty cylinders leaving for a refilling company and coming
back full. It is the **supply side**, distinct from customer debt. It's a
top-level tab (peer to Home, Debts, Sales Record). Running nav-tab count is now
high — see tech/nav note; Refilling + Settings likely pushes toward a "More"
overflow. Track it.

---

## 2. Structure: Company tabs → batches → deliveries

- **Refilling landing = a wall of company tabs** (like the Sales customer wall),
  with **"Add new +"** at the top-left to create a company.
- **Each company tab opens to that company's page:** its **current batches**, a
  **"View deliveries record"** button, and a **"Send cylinders +"** action.
- **A batch** = one dated send event that can contain **multiple brands**, each
  with Big/Small counts. Batches are the unit of tracking, not individual cylinders.

---

## 3. Creating a company (single page, all mandatory)

- One page. Three required fields: **company name, director, director's phone.**
  "Create" stays disabled until all three are filled.
- On creation, the app **auto-generates a short company code** (see §6) from the
  name — no extra input from her. The code is shown live as she types the name
  (e.g. "K-Gas Depot" → `KGD`).
- The code is **stored on the company** and surfaced in a **Settings reference
  list** ("KGD = K-Gas Depot") so any batch ID can be decoded later (see §6, §10).

---

## 4. Sending cylinders = creating a NEW batch (RULE — this was iterated hard)

`Send cylinders +` opens **one page listing ALL cylinder brands**, each with its
own **Big and Small** quantity steppers, all starting at 0.
- She sets quantities on whatever's actually going; brands left at 0 are ignored.
  Touched brands highlight so her selection is visible at a glance.
- **Do NOT** build an "add one brand at a time" picker. All brands are present on
  the one page — she loads the pile, counts, fills quantities in one view. (This
  was explicitly corrected multiple times; the all-brands single page is the
  locked design.)
- Below the brand list: a running **total**, then a **mandatory cylinder photo**
  (photo slot, add-more up to the cap — see §7), then an **optional note**
  (driver, lorry, etc.), then **Save batch**.
- Save requires: at least one cylinder set AND at least one cylinder photo.
- On save: the batch gets a date/time stamp + an auto batch ID, appears at the top
  of the company's **current batches**, and a **day-3 check reminder** is scheduled
  (plus a day-7-style overdue nudge if still not fully back — see §8).

---

## 5. Batch page, returns, and lifecycle

### Batch page (its own screen — a batch has too much to inline)
Opened by tapping a current batch. Roomy, sectioned, lightly colored (not cramped):
- A status banner: "{stillOut} of {sentTotal} still out" + a status chip.
- **Each brand as its own card**, with **separate Big and Small tiles** showing
  "{back}/{sent}" and "{n} still out" (amber) or "all back" (green).
- A "When sent" section (photo count + the send note).
- A "Returns so far" section listing partial returns already made against this batch.
- A **"Mark as returned"** button.

### Mark as returned (its own page)
- Shows each brand line that still has cylinders out, with **Big/Small steppers
  capped at what's still out** — **partial returns allowed** (per-brand, per-size).
- **Two photo slots:** **Cylinders returned = MANDATORY**; **Receipt = OPTIONAL**
  but with a **bold "strongly recommended for your own proof"** note. Both support
  add-more up to the cap (§7).
- An **optional note.**
- Confirm requires: at least one cylinder set as returned AND at least one cylinder
  photo. (Receipt not required.)
- On confirm: the batch's back-counts increase live, a dated entry is written to the
  deliveries record, and the returned cylinders **increment full stock** (§9).

### Lifecycle (RULE)
- A batch stays in **current batches** until **every line is fully returned**.
- Partial returns keep it visible, showing what remains.
- When fully returned, the batch **leaves current batches** but its deliveries
  **persist forever in the deliveries record.**

---

## 6. Batch IDs (meaningful, human-readable) (RULE)

Format: **`CODE-DDMMMYY-NN`** → e.g. **`KGD-11JUL26-01`**.
- **CODE** = the company's auto-generated short code (company-first because it's the
  primary "whose batch is this?" anchor — reads left-to-right like a sentence:
  *K-Gas Depot, 11 July, batch 01*).
- **DDMMMYY** = date with a **letter month** (`11JUL26`) — deliberately not numeric,
  to avoid day/month ambiguity.
- **NN** = same-day sequence (01, 02…) to disambiguate multiple batches to the same
  company on one day.
- **Code generation:** initials of the company name (2–3 letters), auto-derived. On
  collision (two companies yield the same code) auto-append a digit (TGD, TGD2).
  Codes are unique, stored on the company, and listed in Settings for reference.
- The batch ID appears on the batch card, the batch page header, and **every
  delivery row in the record** — this is what correlates partial returns of the
  same batch even when they're scattered by time (the problem batch IDs solve).

---

## 7. Photos (cap + rules)

- **Cap: 3 photos per slot.** A deliberate, sane limit — not a technical ceiling.
  Rationale: on unreliable connectivity each photo (even light-compressed) costs
  sync time + data bundle, and fills phone storage faster; 3 covers angles/retakes
  with margin. (See Sales Record spec §6 for the full storage architecture, which
  applies identically here: photos never in the DB, expo-file-system local +
  Supabase Storage cloud, auto-backup, deletable-once-backed-up.)
- **Send:** cylinder photo **mandatory** (1–3).
- **Return:** cylinder photo **mandatory** (1–3); receipt photo **optional but
  strongly recommended** (0–3), with a bold on-screen nudge.
- Photos are **viewable from the deliveries record** (tap thumbnails).

---

## 8. Reminders (per batch, local)

- Local on-device notifications (expo-notifications), scheduled at send time. No
  server, works offline. Same mechanism as debt reminders.
- **Day-3 "check on these"** reminder after sending.
- **Day-7-style overdue nudge** if the batch is still not fully back.
- **One reminder per batch.** Partial return does **not** cancel it — it keeps
  reminding on the **remaining** cylinders until the batch is fully back (mirrors
  the debt rule: partial payment doesn't cancel/reset).

---

## 9. Deliveries record (per company; read-only; append-only)

- Reached via **"View deliveries record"** inside a company tab. Records live
  **per company** (not one global list — she thinks per-company; batch IDs already
  carry the company anyway).
- **A complete, time-ordered log of every return event** (including partials),
  newest first. Roomy, sectioned, lightly colored — readable at a glance:
  - **Batch-ID + company banner** at the top of each entry (the correlation anchor).
  - **"Returned"** section: **each brand its own slot**, Big/Small shown as separate
    pills (never a cramped "K-Gas: 2 Big | Afrigas: 3 Big" line).
  - **When** (full date + time).
  - **Note** (own section, only if present).
  - **Photos — tappable thumbnails** (cylinder + receipt, or "No receipt photo").
- **Read-only and append-only. No edit, no delete — for anyone, in the app.**
  Rationale: a record only settles disputes if it can't be quietly altered; with 3
  equal-permission phones, an in-app delete is a delete for everyone. The only path
  to remove an entry is the developer acting directly in Supabase (rare, controlled,
  accountable). This matches the app-wide immutable-history principle.
- Expect long → paginate / lazy-load, sorted by timestamp desc.
- **OPEN (not now):** a single global "all deliveries across all companies" view is
  a possible future convenience, but not MVP — per-company covers the real need.

---

## 10. RETRO-NOTES — updates to already-locked sections (APPLY THESE)

Building Refilling finalized decisions that change earlier specs. Apply them so the
specs don't contradict:

### The shared empties/stock event ledger (supersedes Debts §5 "empties in hand")
There is **ONE event ledger**, all quantities **calculated never stored**, feeding
Debts (empties in hand), Refilling, and stock. Event types:
- `opening-count` — starting truth, entered in Settings (cold-start; see below).
- `received` — customer returns an empty OR hands one over at point of sale.
- `sent` — empties sent to a refiller (this section, on Save batch).
- `returned-from-refill` — cylinders back from a refiller (this section, on
  confirm return) → these come back as **full sellable stock**.
- `sold` — a sale decrements full stock (Home/Sales).
- `manual-add` — manual stock/empties adjustment in Settings.

Derived quantities:
- `empties in hand (per brand+size) = opening + received − sent`
- `full stock (per brand+size) = opening + returned-from-refill + manual-add − sold`

> **Cold-start problem (why opening-count exists):** on first launch she already
> has empties on the floor and full stock on the shelf from before the app existed.
> Without a starting entry, every count reads zero and is wrong. The `opening-count`
> event seeds reality. It lives in **Settings/stock-setup**, NOT here — because it's
> starting-truth (not movement), shop-wide (not per-company), and rare-setup (not
> daily). Refilling only writes movement events (`sent`, `returned-from-refill`).

### Debts section update
- "Empties in hand" summary now also subtracts `sent` events (was received-only).
- It stays **read-only in Debts**; Refilling owns the decrement via `sent`.

### Home/Sales section update (lean stock tracking — NEW, deliberate)
- **Every sale must now decrement full stock** for the cylinders sold (`sold`
  event). This adds to the already-locked Home/Sales flow.
- **Lean stock scope only** (confirmed): a current count per brand/size, up on
  `returned-from-refill` + `manual-add`, down on `sold`, with a **low-stock
  warning**. NOT a full inventory system (no purchase orders, stock-takes,
  valuation, wastage) — that's Phase 2.

### Settings section additions (for when it's specced)
- **Opening-count / manual stock-adjust** entry (empties + full stock).
- **Company-code reference list** ("KGD = K-Gas Depot").
- (Plus the catalog editor + photo storage/free-up controls already noted.)

---

## 11. Data this section reads/writes

- **Writes:** companies (name/director/phone/code); batches (id, lines with
  Big/Small sent, photos, note, timestamp); return events (`returned-from-refill`,
  per-brand-per-size counts, photos, note, timestamp) → also the `sent` event on
  send. All append-only; batch back-counts and stock are derived, never stored.
- **Reads:** cylinder brand catalog + sizes; the shared ledger (for empties-in-hand
  context); its own companies/batches/deliveries.
- Schedules/cancels local notifications per batch.

---

## 12. Open items carried out of this section
- Global cross-company deliveries view — deferred, not MVP.
- Photo compression level — still the deferred app-wide decision (Sales Record §6).
- Nav tab count — Refilling + Settings likely forces a "More" overflow; resolve in
  final assembly.
- Full inventory system (beyond lean stock) — Phase 2.
-e 

---

# BMG Shop App — Reports / KPIs Section Spec

> **Status:** LOCKED (design). Build spec for the Reports tab. Read
> `00-tech-architecture.md`, `01-home-sales-section.md`, and `02-debts-section.md`
> first — this section computes everything from data those sections already store.
> It captures NO new data of its own.

---

## 0. Reading rules

- **SEED DATA** = none.
- **PLACEHOLDER DATA** = every number, name, customer, percentage, and chart value
  shown in the mockup is fake demo data and must NEVER ship. All real figures are
  **computed at read-time from actual sales/debts/repayments**. Do not hardcode.
- **RULES / STRUCTURE / CALCULATIONS** = the actual spec. Build exactly, especially
  the calculation definitions in §4 — they are the load-bearing part of this section.

---

## 1. Purpose & guiding principles

- A **balanced overview**: business health + collections, in one scrollable screen.
- **Descriptive only. No advice, ever.** The app shows *what is happening*, never
  *what she should do*. Rationale: it's a record-keeper, not a consultant; advice on
  a business we don't fully model would be wrong and erode trust.
- **No fabricated numbers.** Every figure must be truthfully derivable from captured
  data. Where a true number can't be computed (profit), it is not shown, and its
  absence is stated honestly (§6 footer).
- **Descriptive → tappable to source** where sensible (a debtor row → that customer's
  debt). Reports is a lens over existing records, not a new data store.
- **Real charts** in the build: react-native-gifted-charts or victory-native. The
  hand-built bars in the mockup are placeholders and do NOT ship.

---

## 2. What was explicitly INCLUDED / EXCLUDED

- **Excluded — staff-activity KPI** (sales logged per person). Deliberately left out
  to avoid a surveillance feel. Easy to add later; the data (staff attribution) is
  already captured.
- **Excluded — profit / margin.** No cost-price data is captured anywhere, so profit
  is uncomputable. Deferred to Phase 2 (would require a new cost-entry habit).
- **Included:** revenue, outstanding, credit-reliance trend, top debtors,
  debt-by-commodity, slow payers (two-signal), best/slow sellers (qty+revenue),
  busiest days.

---

## 3. Screen layout (top → bottom)

1. **Header + time-range toggle** — Today / Week / Month. Controls the ranged
   figures (see each KPI for whether it responds).
2. **Two headline boxes:**
   - **Revenue** (green) — **ranged** (follows the toggle). Labeled with the active
     period ("this week").
   - **Outstanding** (amber) — **NOT ranged**. Always "owed now · all time."
     Labeled explicitly as a standing balance. A line below both boxes shows empties
     owed ("N empties also owed (all time)").
3. **Collections half** (amber accent): Credit reliance → Top debtors →
   What's owed for (debt by commodity) → Slow payers.
4. **Business-health half** (blue accent): Best sellers & slow movers → Busiest days.
5. **Honest footer** — states these are revenue/cash-flow figures, not profit.

> **Why Outstanding is not ranged (LOCKED decision):** outstanding debt is a standing
> balance, not something that "happens in a period." Ranging it either hides old
> unpaid debt (the exact thing she must never forget) or produces a meaningless
> number. So Revenue is ranged; Outstanding is always all-time-as-of-now, and the two
> are clearly labeled so they're never mistaken for being on the same clock.
> Corollary: **outstanding can legitimately exceed a period's revenue** (accumulated
> debt vs one slice of income) — do not build any check assuming otherwise.

---

## 4. KPI definitions & calculations (the load-bearing part)

All computed from captured data. Definitions are exact on purpose.

### 4.1 Revenue (ranged)
Sum of every sale's **total** with a timestamp in the selected range
(today / this week / this month). Counts full sale value regardless of
cash/credit split (it's revenue booked, not cash collected).

### 4.2 Outstanding (all-time, now)
- **Money:** sum of all unpaid credit balances across all customers, right now
  (Σ credit taken − Σ repayments), all-time. Calculated, never stored.
- **Empties:** total empties owed across all customers, right now.

### 4.3 Credit-reliance trend (ranged)
For each bucket in the range (days in a week view, weeks in a month view):
`% = (credit-portion value of sales in bucket) / (total sales value in bucket) × 100`.
- Charted over time; headline shows the average across buckets.
- Color by severity: <30% green, 30–40% amber, ≥40% red.
- **"Today" range:** a single day is not a trend → fall back to showing the **week's**
  buckets. (Deliberate; note in UI.)
- **Why it matters (context only, not advice):** rising credit share is the earliest
  warning of the core revenue-leakage problem — appears here before it's felt in cash.

### 4.4 Top debtors (all-time, now)
Customers ranked by current money owed, descending. Tappable → that customer's debt
in the Debts section. Top N shown.

### 4.5 What's owed for — debt by commodity (all-time, now)
Current outstanding **money** split by the commodity type each debt was for
(Cylinders / Cookers / Airtime / Burners). Derived by attributing each unpaid debt
to its originating sale's line-item commodity type. Shown as a proportion bar +
ranked list with amounts and %. **Why useful:** cylinder debt also implies empties
floating out — a different risk profile than airtime debt.

### 4.6 Slow payers (TWO SEPARATE SIGNALS — do not blend)

This is the most calculation-sensitive KPI. The app's debt dynamics allow overlapping,
independently-settled, partially-paid debts (Debt A taken Mon, half-paid Wed; Debt B
taken Fri, half-paid Sat). So settle-speed must be defined per debt, not per customer-blur.

**Signal 1 — historical settle speed (`avgDays`):**
- **One debt's days-to-clear** = date of the payment that brings its balance to **zero**
  (the final installment) − debt's date-taken. Intermediate partial payments do NOT
  each count; only the zeroing date matters.
- **A customer's `avgDays`** = **simple average** of days-to-clear across their
  **fully-settled** debts. Each settled debt counts **once, equally** (NOT weighted by
  amount — locked). Show `settledCount` (how many debts the average is based on) as
  context/credibility.
- **Open (unsettled) debts are excluded** from this average — you can't measure
  settle-time on something not yet settled.
- **No-history case:** a customer with zero settled debts has **no average** — show
  "no settled debts yet", NOT `0`. (Zero-vs-blank ambiguity misleads; avoid it.)
  This is common in the app's early weeks and for new customers — expected, not a bug.
- Flag amber when `avgDays ≥ 14` (tunable threshold).

**Signal 2 — current standing (`owesNow` / `overdue`):**
- Whether the customer owes anything **right now**, and whether any of it is overdue.
- Shown as a distinct pill: "overdue now · KSh X" (red) / "owes now · KSh X" (amber) /
  "clear" (green).

**Why two signals (LOCKED):** historical speed and current standing can disagree — a
fast historical payer can be overdue this month; a slow one can owe nothing now.
Blending them into one score hides exactly the distinctions she'd act on. Keep separate.

- **Context:** show `purchases` (their purchase volume) alongside — a slow payer who
  buys a lot is a different decision than one who buys little (this was the explicit ask).

### 4.7 Best sellers & slow movers (ranged)
Products ranked, with **two toggles**:
- **Best / Slow** — top of the ranking vs bottom.
- **Qty / Revenue** — measured by units sold, or by revenue brought in.
- "Product" = commodity line identity (e.g. "K-Gas · Small", "Safaricom airtime",
  "Double burner stove").
- **Why both metrics:** high-quantity ≠ high-revenue (airtime sells in volume at low
  value; big cylinders sell in low volume at high value). Both lenses tell different
  truths. Neither is profit (see footer).

### 4.8 Busiest days (ranged)
Count of sales grouped by **day of week**, within range. Shows peak trading days.

---

## 5. Data inventory used (all already captured — nothing new)

- **Sales:** total, cash/credit split, line items (commodity type, brand/supplier,
  size/denom, qty, unit price), timestamp, customer, staff.
- **Debts/repayments:** each credit sale as a debt (amount, date-taken, deadline);
  each repayment (amount, date, which debt, which customer); live balances (calculated).
- **Empties:** owed balances (calculated from the shared ledger).
- **Customers:** identity, purchase counts.
- Confirmed: **every KPI here is computable from the above.** No new capture needed.

---

## 6. Honest footer (RULE — must ship)

A persistent note: these are **revenue and cash-flow** figures from her own records,
**not profit** — because cost prices aren't tracked. Keeps the "no fiction, no advice"
principle visible in the UI itself. If/when cost tracking is added (Phase 2), profit
KPIs can join and this note changes.

---

## 7. Open items carried out of this section
- Amber threshold for slow payers (≥14 days) — tunable.
- "Due soon" / severity windows shared with Debts — tunable, keep consistent.
- Staff-activity KPI — deliberately excluded now; trivially addable later.
- Profit/margin KPIs — Phase 2, blocked on cost-price capture.
- Chart library final pick (gifted-charts vs victory-native) — resolve at build.
-e 

---

# BMG Shop App — Settings / Catalog Section Spec

> **Status:** LOCKED (design). Build spec for the Settings tab. Read
> `00-tech-architecture.md` first, plus `04-refilling-section.md` (shared ledger,
> company codes) and `03-sales-record-section.md` (photo storage). Settings is where
> the app becomes reusable per-shop and where the cold-start stock truth is seeded.

---

## 0. Reading rules

- **SEED DATA (REAL, ships pre-loaded, editable here):** the catalog in §2. This is
  the ONE place real client data lives. It ships on first launch and she edits it.
- **PLACEHOLDER DATA (never ships):** the demo company codes, the "This phone: Grace"
  name, "212 MB", "2 hours ago", any specific counts. All fake.
- **RULES / STRUCTURE** = build exactly.

---

## 1. Purpose & layout

Settings is grouped into three blocks:
- **Your shop:** Catalog · Opening stock count · Refilling company codes
- **App:** Reminders · Backup & storage
- **This device:** shows the phone's staff name (read-only)
Plus an app version line.

It is deliberately lean. **NOT included (and why):** no login/password (there is
none); no business profile/logo/theming (scope creep, not the notebook's job); no
sync on/off (sync is automatic and invisible by design — exposing it invites
breakage). These exclusions are intentional — do not add them.

---

## 2. Catalog editor (the reuse engine) — REAL SEED DATA

A hub listing six editable lists. Tapping one opens an add/remove list editor.
Editing here changes the options that appear in the Add-Sale flow.

Ships pre-loaded with this client's real catalog:
- **Cylinder brands:** K-Gas, Total Gas, Afrigas, Pro Gas, Sea Gas, Rubis, Kobil,
  National Oil, G-Gas, Gold Gas, Others.
- **Cylinder sizes:** Small, Big.
- **Airtime suppliers:** Safaricom, Airtel.
- **Airtime denominations:** 10, 20, 50, 100 (face value in KSh).
- **Burner brands:** Skytec, PineGas, Orgaz, Cosco.
- **Cooker types:** Mini-cylinder grill, Double burner stove.

Rules:
- Add / remove entries per list. (Edit = remove + re-add is acceptable for MVP.)
- **Airtime is always auto-priced at 95% of face value** — no price field for
  airtime anywhere; surfaced as a note on the denominations editor. (The 0.95 rate is
  fixed for now; making it editable is a deferred open item.)
- This editor is what lets Edd onboard a different shop: change the catalog, the rest
  of the app adapts. It does NOT need to handle wholly new commodity *types* via UI —
  new commodity types for future shops are a manual/dev setup, per project scope.
- Removing a catalog item must not corrupt historical records that reference it
  (history is immutable). Prefer soft-hide over hard-delete if an item is already used
  in past sales — flag for build; at minimum, never rewrite past records.

---

## 3. Opening stock count (cold-start solver) — per brand + size

**Why it exists:** balances are calculated from events, never stored (the app's core
rule). On first install the shop already has empties on the floor and full cylinders
on the shelf from before the app existed. Without a starting event every count reads
zero and every later calculation is wrong. This screen writes the `opening-count`
event(s) that seed reality. It lives in Settings (not Refilling) because it's
starting-truth, shop-wide, rare-setup — not daily movement.

**Structure:**
- An **Empties on hand / Full stock** toggle — one screen, two modes.
- **Every cylinder brand listed, each with Big + Small steppers.** She fills **only
  the brands she actually holds**; the rest stay at zero (avoids ~44 forced entries).
  Touched brands highlight. Running total + count of filled brands at the bottom.
- **Per brand + size is REQUIRED** (not a gross total): the rest of the app tracks
  cylinders per brand+size (sales, refilling, empties ledger, reports). A gross count
  can't feed a per-brand system — selling one K-Gas Big must decrement K-Gas Big
  specifically.

**What goes in each bucket (must be on-screen wording):**
- **Full stock** = only cylinders full and ready to sell, physically in the shop now.
  NOT empties. NOT cylinders already sent to a refiller.
- **Empties on hand** = empty cylinders in the shop now, waiting for refill. Empties
  only.
- **Cylinders already at a refiller at setup time** go in NEITHER — they're logged
  when that refill batch is created (else they'd double-count on return).

**Correction / recount safety (RULE — directly answers "what if my first count is
wrong"):**
- Because balances are event-derived, the opening count is just the FIRST event, not
  a master figure everything overwrites.
- A wrong count is fixed by **adding a correction** (a `manual-add` adjustment event),
  NOT by editing history. Old sales/refills stay exactly as recorded; only the derived
  total shifts to match reality. **No collected data is ever lost.**
- Editing the original opening event is allowed only in the narrow "just set it up,
  typo, nothing logged yet" case; otherwise prefer the adjustment event. UI should
  frame a later change as a **recount that adds a correction**, and say so plainly.
- `manual-add` is already a locked ledger event type (see Refilling §10) — this is its
  purpose.

---

## 4. Refilling company codes (read-only reference)

- A read-only list mapping each refiller's auto-generated code to its name
  ("KGD = K-Gas Depot").
- Purpose: let her decode batch IDs (e.g. `KGD-11JUL26-01`). Codes are generated on
  company creation in the Refilling section; this is just the reference view.

---

## 5. Reminders (controllable)

- **On/off toggle** for debt & refill reminders.
- When on, a **time-of-day** control (default 09:00).
- On-screen notes: reminders are for her own follow-up (never message the customer),
  fire locally on-device even with no internet, and **changing the time does NOT change
  the underlying logic** (debt day-6 heads-up + day-7 due; refill day-3 + day-7). Only
  delivery time/enabled-state is user-controllable; the schedule logic is locked.

---

## 6. Backup & storage

- **Backup status** — human-readable last-backup ("2 hours ago") + a manual **"Back up
  now"**. Copy explains: saves to this phone first, copies to cloud automatically when
  online. She can see status and trigger a backup; she CANNOT turn sync off or alter
  how it works (deliberate).
- **Photo storage / free-up** — shows space used by photos and a **"Clear backed-up
  photos"** action. HARD GUARDRAIL (from Sales Record §6): only photos **already
  confirmed backed up** can be cleared; not-yet-backed-up photos are kept. UI must
  state exactly what's safe to clear vs kept before acting. Cleared photos stay in the
  cloud and remain viewable when online.

---

## 7. This device (read-only)

- Shows the staff name this phone was assigned at first launch ("This phone: Grace"),
  and that every entry logs as that person. **No switch-user** (deliberately cut —
  phones are personal). Just informational.

---

## 8. Data this section reads/writes

- **Writes:** catalog edits; `opening-count` and `manual-add` events (per brand+size);
  reminder on/off + time (device-local preference); triggers manual backup; triggers
  photo cleanup (backed-up only).
- **Reads:** catalog; shared stock/empties ledger (for current counts context);
  company codes; backup status; local photo storage stats; this device's staff name.

---

## 9. Open items carried out of this section
- Airtime 95% rate editability — deferred (fixed for now).
- Soft-hide vs hard-delete for catalog items already used in history — resolve at build
  (must never corrupt immutable history).
- Reminder time is a per-device preference — confirm it need not sync across phones.
-e 

---

-e 
# PART D — DESIGN MOCKUPS (visual blueprint — React/web prototypes, NOT ship code)

> These are interactive phone-frame mockups built in React + Tailwind + lucide-react for design. Match their layout, structure, spacing, color, and flow when building the React Native UI. Do NOT ship this web code. Charts in the Reports mockup are hand-built placeholders — rebuild with a real RN chart library. All names/timestamps/counts here are placeholder and must never ship.

-e 
## Mockup — Home / Sales  (`bmg-home-redesign.jsx`)

```jsx
import React, { useState, useEffect } from 'react';
import {
  Search, Plus, Minus, ArrowLeft, Camera, Check, Flame, Zap,
  UtensilsCrossed, Smartphone, X, StickyNote, Clock
} from 'lucide-react';

const COLORS = {
  paper: '#EEF0EC',
  ink: '#16231F',
  blue: '#2B6CB5',
  amber: '#C2540B',
  green: '#2F7A4D',
  line: '#C9CDC3',
  muted: '#586159',
  mutedLight: '#525b53',
  white: '#ffffff',
};

// The signed-in staff member on THIS device (set once via name picker).
const CURRENT_STAFF = 'Njeri';

const commodityDefs = [
  { key: 'cylinder', label: 'Cylinder', icon: Flame },
  { key: 'airtime', label: 'Airtime', icon: Smartphone },
  { key: 'burner', label: 'Burner', icon: Zap },
  { key: 'cooker', label: 'Cookers', icon: UtensilsCrossed },
];

// Cylinder catalog: brand -> sizes. Recently-used float up (freq sort).
const cylinderBrands = [
  { brand: 'K-Gas', sizes: ['Small', 'Big'], recent: true },
  { brand: 'Total Gas', sizes: ['Small', 'Big'], recent: true },
  { brand: 'Afrigas', sizes: ['Small', 'Big'], recent: true },
  { brand: 'Pro Gas', sizes: ['Small', 'Big'], recent: false },
  { brand: 'Sea Gas', sizes: ['Small', 'Big'], recent: false },
  { brand: 'Rubis', sizes: ['Small', 'Big'], recent: false },
  { brand: 'Kobil', sizes: ['Small', 'Big'], recent: false },
  { brand: 'National Oil', sizes: ['Small', 'Big'], recent: false },
  { brand: 'G-Gas', sizes: ['Small', 'Big'], recent: false },
  { brand: 'Gold Gas', sizes: ['Small', 'Big'], recent: false },
  { brand: 'Others', sizes: ['Small', 'Big'], recent: false },
];

// Airtime: supplier -> denominations. Priced automatically at 95% of face value.
const airtimeSuppliers = ['Safaricom', 'Airtel'];
const airtimeDenoms = [10, 20, 50, 100];
const AIRTIME_RATE = 0.95;

// Burner brands (two-level like cylinders, but a single "unit" per brand).
const burnerBrands = ['Skytec', 'PineGas', 'Orgaz', 'Cosco'];

// Cookers: flat options (mini-cylinder grill + double burner stove).
const cookerOptions = ['Mini-cylinder grill', 'Double burner stove'];

// Seed tabs — sorted by access frequency (most-used on top), quick-sale excluded from ranking.
const initialTabs = [
  { id: 1, name: 'Wanjiru Mwangi', freq: 48, lastItem: 'Total · Big cylinder ×1', when: 'Today · 12:17 PM', quick: false },
  { id: 2, name: 'Otieno K.', freq: 31, lastItem: 'Safaricom 100 airtime', when: '12/07/2026 · 4:30 PM', quick: false },
  { id: 3, name: 'Grace N.', freq: 22, lastItem: 'K-Gas · Small cylinder ×2', when: '10/07/2026 · 9:05 AM', quick: false },
  { id: 4, name: 'Musa Ali', freq: 9, lastItem: 'Double burner', when: '07/07/2026 · 2:40 PM', quick: false },
  { id: 99, name: 'Quick Sale', freq: 0, lastItem: 'One-off cash sales', when: '', quick: true, pinned: true },
];

// Demo previous sales per customer id. In the real app these come from the DB.
const salesHistory = {
  1: [
    { id: 's1', when: '13/07/2026 · 12:17 PM', staff: 'Njeri', items: [{ label: 'Total · Big cylinder', qty: 1, price: 2200, returned: 1 }], cash: 2200, credit: 0, note: '', photo: false },
    { id: 's2', when: '02/07/2026 · 10:04 AM', staff: 'Njeri', items: [{ label: 'Total · Big cylinder', qty: 1, price: 2200, returned: 0 }], cash: 1000, credit: 1200, note: 'Empty not returned — bringing tomorrow', photo: true },
  ],
  2: [
    { id: 's3', when: '12/07/2026 · 4:30 PM', staff: 'Amos', items: [{ label: 'Safaricom 100 airtime', qty: 6, autoPrice: 570, packs: 0, singles: 6 }], cash: 570, credit: 0, note: '', photo: false },
  ],
  3: [
    { id: 's4', when: '10/07/2026 · 9:05 AM', staff: 'Njeri', items: [{ label: 'K-Gas · Small cylinder', qty: 2, price: 1150, returned: 2 }], cash: 2300, credit: 0, note: '', photo: false },
  ],
  4: [
    { id: 's5', when: '07/07/2026 · 2:40 PM', staff: 'Amos', items: [{ label: 'Double burner stove', qty: 1, price: 1500 }], cash: 0, credit: 1500, note: 'Pays end of month', photo: false },
  ],
  99: [
    { id: 'q1', when: 'Today · 11:52 AM', staff: 'Njeri', items: [{ label: 'Safaricom 50 airtime', qty: 3, autoPrice: 143, packs: 0, singles: 3 }], cash: 143, credit: 0, note: '', photo: false },
    { id: 'q2', when: 'Today · 10:20 AM', staff: 'Amos', items: [{ label: 'K-Gas · Small cylinder', qty: 1, price: 1150, returned: 1 }], cash: 1150, credit: 0, note: '', photo: false },
    { id: 'q3', when: '12/07/2026 · 5:15 PM', staff: 'Njeri', items: [{ label: 'Single grill', qty: 1, price: 900 }], cash: 900, credit: 0, note: 'Walk-in, paid cash', photo: false },
  ],
};

function Stepper({ value, onChange, min = 0 }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="rounded-full flex items-center justify-center"
        style={{ width: 32, height: 32, background: '#F1F2EE', border: `1px solid ${COLORS.line}` }}
      >
        <Minus size={16} style={{ color: COLORS.ink }} />
      </button>
      <span className="font-bold text-base w-6 text-center" style={{ color: COLORS.ink }}>{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        className="rounded-full flex items-center justify-center"
        style={{ width: 32, height: 32, background: COLORS.blue }}
      >
        <Plus size={16} color="white" />
      </button>
    </div>
  );
}

// ---------- HOME WALL ----------
function HomeWall({ tabs, onAddTab, onAddSaleTo, onViewHistory, search, setSearch }) {
  const ranked = [...tabs]
    .filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.freq - a.freq;
    });

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-5 pb-3">
        <p className="text-xs uppercase tracking-widest" style={{ color: COLORS.muted }}>Thursday, 17 July</p>
        <h1 className="font-bold text-2xl mt-1" style={{ color: COLORS.ink }}>Habari, {CURRENT_STAFF}</h1>

        <div className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
          <Search size={16} style={{ color: COLORS.mutedLight }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer tabs…"
            className="flex-1 text-sm outline-none bg-transparent"
            style={{ color: COLORS.ink }}
          />
        </div>

        <button
          onClick={onAddTab}
          className="mt-3 w-full rounded-xl py-3 text-sm font-bold"
          style={{ background: COLORS.ink, color: 'white' }}
        >
          Add new tab +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {ranked.map(t => (
          <div key={t.id} className="mb-3 rounded-2xl overflow-hidden" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-base" style={{ color: COLORS.ink }}>{t.name}</p>
                {t.pinned && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EEF3F8', color: COLORS.blue }}>walk-in</span>
                )}
              </div>
              <p className="text-sm mt-1" style={{ color: COLORS.mutedLight }}>{t.lastItem}</p>
              {t.when ? (
                <div className="flex items-center gap-1 mt-1.5">
                  <Clock size={11} style={{ color: COLORS.mutedLight }} />
                  <span className="text-xs" style={{ color: COLORS.mutedLight }}>{t.when}</span>
                </div>
              ) : null}
            </div>
            <div className="flex border-t" style={{ borderColor: COLORS.line }}>
              <button
                onClick={() => onViewHistory(t)}
                className="flex-1 py-2.5 text-sm font-bold border-r"
                style={{ borderColor: COLORS.line, color: COLORS.ink, background: '#FAFBF9' }}
              >
                View previous sales
              </button>
              <button
                onClick={() => onAddSaleTo(t)}
                className="flex-1 py-2.5 text-sm font-bold"
                style={{ color: COLORS.blue, background: '#FAFBF9' }}
              >
                Add sale +
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- ADD SALE (cart flow) ----------
function AddSale({ tab, isNewTab, onCancel, onDone }) {
  const [step, setStep] = useState('build'); // build | payment
  const [name, setName] = useState(isNewTab ? '' : tab.name);
  const [cart, setCart] = useState([]);
  const [activePicker, setActivePicker] = useState(null); // which commodity type is being configured
  const [editItem, setEditItem] = useState(null); // an item pulled back out of the cart for editing

  const total = cart.reduce((sum, item) => sum + (item.autoPrice != null ? item.autoPrice : (parseFloat(item.price) || 0) * item.qty), 0);

  function addToCart(item) {
    setCart(c => [...c, item]);
    setActivePicker(null);
    setEditItem(null);
  }
  function removeFromCart(idx) {
    setCart(c => c.filter((_, i) => i !== idx));
  }
  // Tap a cart line to edit: remove it from the cart, reopen its picker prefilled.
  function editLine(idx) {
    const item = cart[idx];
    setCart(c => c.filter((_, i) => i !== idx));
    setEditItem(item);
    setActivePicker(item.type);
  }
  function cancelPicker() {
    // If we were editing, put the original item back so nothing is lost.
    if (editItem) { setCart(c => [...c, editItem]); }
    setActivePicker(null);
    setEditItem(null);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <button onClick={step === 'payment' ? () => setStep('build') : onCancel} className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}>
          <ArrowLeft size={22} style={{ color: COLORS.ink }} />
        </button>
        <h2 className="font-bold text-base" style={{ color: COLORS.ink }}>
          {step === 'payment' ? 'Payment' : isNewTab ? 'New tab' : `Sale · ${tab.name}`}
        </h2>
      </div>

      {step === 'build' && (
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24">
          {isNewTab && (
            <div className="mb-4">
              <p className="text-xs mb-1" style={{ color: COLORS.mutedLight }}>Customer name</p>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Type name…"
                className="w-full rounded-xl px-3 py-3 text-base outline-none"
                style={{ border: `1px solid ${COLORS.line}`, color: COLORS.ink }}
              />
            </div>
          )}

          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: COLORS.muted }}>Add commodity</p>
          <div className="grid grid-cols-4 gap-2 mb-5">
            {commodityDefs.map(c => {
              const Icon = c.icon;
              const active = activePicker === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setActivePicker(active ? null : c.key)}
                  className="rounded-xl py-3 flex flex-col items-center gap-1"
                  style={{ background: active ? COLORS.blue : COLORS.white, border: `1px solid ${active ? COLORS.blue : COLORS.line}` }}
                >
                  <Icon size={22} style={{ color: active ? 'white' : COLORS.blue }} />
                  <span className="text-xs font-semibold" style={{ color: active ? 'white' : COLORS.ink }}>{c.label}</span>
                </button>
              );
            })}
          </div>

          {activePicker && (
            <CommodityPicker
              type={activePicker}
              onAdd={addToCart}
              onClose={cancelPicker}
              editItem={editItem}
            />
          )}

          {cart.length > 0 && (
            <>
              <p className="text-xs uppercase tracking-widest mb-2 mt-2" style={{ color: COLORS.muted }}>In this sale</p>
              <div className="space-y-2">
                {cart.map((item, i) => {
                  const lineTotal = item.autoPrice != null
                    ? item.autoPrice
                    : (parseFloat(item.price) || 0) * item.qty;
                  return (
                  <div key={i} className="rounded-xl p-3 flex items-start justify-between" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
                    <button onClick={() => editLine(i)} className="text-left flex-1">
                      <p className="text-sm font-semibold" style={{ color: COLORS.ink }}>{item.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: COLORS.mutedLight }}>
                        {item.type === 'airtime'
                          ? `${item.packs ? item.packs + ' pack' + (item.packs > 1 ? 's' : '') : ''}${item.packs && item.singles ? ' + ' : ''}${item.singles ? item.singles + ' single' + (item.singles > 1 ? 's' : '') : ''} · ${item.qty} cards`
                          : `×${item.qty} · KSh ${(parseFloat(item.price) || 0).toLocaleString()} each`}
                        {item.type === 'cylinder' && ` · ${item.returned}/${item.qty} empties back`}
                      </p>
                      <p className="text-xs mt-0.5 font-semibold" style={{ color: COLORS.blue }}>Tap to edit</p>
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold" style={{ color: COLORS.ink }}>
                        KSh {lineTotal.toLocaleString()}
                      </span>
                      <button onClick={() => removeFromCart(i)}><X size={16} style={{ color: COLORS.mutedLight }} /></button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {step === 'payment' && (
        <PaymentStep total={total} onBack={() => setStep('build')} onDone={onDone} />
      )}

      {step === 'build' && cart.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 px-5 py-3" style={{ background: COLORS.paper, borderTop: `1px solid ${COLORS.line}` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: COLORS.muted }}>Total so far</span>
            <span className="font-bold text-lg" style={{ color: COLORS.ink }}>KSh {total.toLocaleString()}</span>
          </div>
          <button
            onClick={() => setStep('payment')}
            className="w-full rounded-xl py-3 text-sm font-bold text-white"
            style={{ background: COLORS.green }}
          >
            Move to payment →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- COMMODITY PICKER (inline, per type) ----------
function CommodityPicker({ type, onAdd, onClose, editItem }) {
  const isCylinder = type === 'cylinder';
  const isAirtime = type === 'airtime';
  const isBurner = type === 'burner';
  const flatOptions = isBurner ? burnerBrands : cookerOptions;

  // When editing, seed initial state from the item pulled out of the cart.
  const [brandSearch, setBrandSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState(
    editItem && isCylinder ? editItem.brand : null
  );
  const [selectedSupplier, setSelectedSupplier] = useState(
    editItem && isAirtime ? editItem.label.split(' ')[0] : null
  );
  const [sizeState, setSizeState] = useState(
    editItem && isCylinder ? { [editItem.size]: { qty: editItem.qty, price: editItem.price, returned: editItem.returned || 0 } } : {}
  );
  const [denomState, setDenomState] = useState(() => {
    if (editItem && isAirtime) {
      const denom = parseInt(editItem.label.match(/\d+/)[0], 10);
      return { [denom]: { packs: editItem.packs || 0, singles: editItem.singles || 0 } };
    }
    return {};
  });
  const [optState, setOptState] = useState(
    editItem && (isBurner || type === 'cooker') ? { [editItem.label]: { qty: editItem.qty, price: editItem.price } } : {}
  );

  function setSizeField(size, field, value) {
    setSizeState(prev => ({ ...prev, [size]: { qty: 0, price: '', returned: 0, ...prev[size], [field]: value } }));
  }
  function setDenomField(denom, field, value) {
    setDenomState(prev => ({ ...prev, [denom]: { packs: 0, singles: 0, ...prev[denom], [field]: value } }));
  }
  function setOptField(opt, field, value) {
    setOptState(prev => ({ ...prev, [opt]: { qty: 0, price: '', ...prev[opt], [field]: value } }));
  }

  // Airtime price = 95% of total face value. cards = packs*10 + singles.
  function airtimePrice(denom, st) {
    const cards = (st.packs || 0) * 10 + (st.singles || 0);
    return Math.round(cards * denom * AIRTIME_RATE);
  }

  function commit() {
    if (isCylinder) {
      if (!selectedBrand) return;
      const sizes = cylinderBrands.find(b => b.brand === selectedBrand).sizes;
      let added = false;
      sizes.forEach(size => {
        const s = sizeState[size];
        if (s && s.qty > 0) {
          onAdd({ type, label: `${selectedBrand} \u00b7 ${size}`, qty: s.qty, price: s.price, returned: s.returned || 0, brand: selectedBrand, size });
          added = true;
        }
      });
      if (!added) return;
    } else if (isAirtime) {
      if (!selectedSupplier) return;
      let added = false;
      airtimeDenoms.forEach(denom => {
        const st = denomState[denom];
        if (st && ((st.packs || 0) > 0 || (st.singles || 0) > 0)) {
          const cards = (st.packs || 0) * 10 + (st.singles || 0);
          onAdd({ type, label: `${selectedSupplier} ${denom} airtime`, qty: cards, price: airtimePrice(denom, st) / cards, autoPrice: airtimePrice(denom, st), packs: st.packs || 0, singles: st.singles || 0 });
          added = true;
        }
      });
      if (!added) return;
    } else {
      let added = false;
      flatOptions.forEach(opt => {
        const s = optState[opt];
        if (s && s.qty > 0) { onAdd({ type, label: opt, qty: s.qty, price: s.price }); added = true; }
      });
      if (!added) return;
    }
  }

  const cylinderHasQty = isCylinder && selectedBrand &&
    cylinderBrands.find(b => b.brand === selectedBrand).sizes.some(s => (sizeState[s]?.qty || 0) > 0);
  const airtimeHasQty = isAirtime && selectedSupplier &&
    airtimeDenoms.some(d => (denomState[d]?.packs || 0) > 0 || (denomState[d]?.singles || 0) > 0);
  const flatHasQty = !isCylinder && !isAirtime && flatOptions.some(o => (optState[o]?.qty || 0) > 0);

  // Price required on any row that has a quantity (airtime is auto-priced, exempt).
  const priceMissing = (() => {
    if (isCylinder && selectedBrand) {
      return cylinderBrands.find(b => b.brand === selectedBrand).sizes.some(s => {
        const st = sizeState[s];
        return st && st.qty > 0 && (!st.price || parseFloat(st.price) <= 0);
      });
    }
    if (!isCylinder && !isAirtime) {
      return flatOptions.some(o => {
        const st = optState[o];
        return st && st.qty > 0 && (!st.price || parseFloat(st.price) <= 0);
      });
    }
    return false;
  })();

  const hasQty = isCylinder ? cylinderHasQty : isAirtime ? airtimeHasQty : flatHasQty;
  const canAdd = hasQty && !priceMissing;

  return (
    <div className="rounded-2xl p-4 mb-5" style={{ background: '#F6F8F4', border: `1px solid ${COLORS.line}` }}>

      {/* CYLINDER: searchable brand list -> dual size rows */}
      {isCylinder && (
        <>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
            <Search size={14} style={{ color: COLORS.mutedLight }} />
            <input value={brandSearch} onChange={e => setBrandSearch(e.target.value)} placeholder="Search brand\u2026"
              className="flex-1 text-sm outline-none bg-transparent" style={{ color: COLORS.ink }} />
          </div>
          <div className="max-h-32 overflow-y-auto mb-3">
            {cylinderBrands
              .filter(b => b.brand.toLowerCase().includes(brandSearch.toLowerCase()))
              .sort((a, b) => (b.recent ? 1 : 0) - (a.recent ? 1 : 0))
              .map(b => (
                <button key={b.brand} onClick={() => setSelectedBrand(b.brand)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg mb-1"
                  style={{ background: selectedBrand === b.brand ? COLORS.blue : COLORS.white, border: `1px solid ${COLORS.line}` }}>
                  <span className="text-sm font-semibold" style={{ color: selectedBrand === b.brand ? 'white' : COLORS.ink }}>{b.brand}</span>
                  {b.recent && <span className="text-xs" style={{ color: selectedBrand === b.brand ? 'white' : COLORS.mutedLight }}>recent</span>}
                </button>
              ))}
          </div>
          {selectedBrand && (
            <div className="space-y-2 mb-3">
              {cylinderBrands.find(b => b.brand === selectedBrand).sizes.map(s => {
                const st = sizeState[s] || { qty: 0, price: '', returned: 0 };
                return (
                  <div key={s} className="rounded-xl p-3" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold" style={{ color: COLORS.ink }}>{s}</span>
                      <Stepper value={st.qty} onChange={v => setSizeField(s, 'qty', v)} min={0} />
                    </div>
                    {st.qty > 0 && (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs" style={{ color: COLORS.muted }}>Price each (KSh)</span>
                          <input value={st.price} onChange={e => setSizeField(s, 'price', e.target.value)} inputMode="numeric" placeholder="0"
                            className="w-24 rounded-lg px-3 py-1.5 text-right text-sm font-bold outline-none" style={{ border: `1px solid ${COLORS.line}`, color: COLORS.ink }} />
                        </div>
                        <div className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: (st.returned || 0) < st.qty ? '#FCEFE6' : '#EAF5EE' }}>
                          <span className="text-xs font-semibold" style={{ color: (st.returned || 0) < st.qty ? COLORS.amber : COLORS.green }}>
                            Empties {(st.returned || 0) < st.qty ? `(${st.qty - (st.returned || 0)} owed)` : '(all back)'}
                          </span>
                          <Stepper value={st.returned || 0} onChange={v => setSizeField(s, 'returned', Math.min(v, st.qty))} min={0} />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* AIRTIME: supplier toggle -> compact denomination rows, packs + singles, auto price */}
      {isAirtime && (
        <>
          <div className="flex gap-2 mb-3">
            {airtimeSuppliers.map(sup => (
              <button key={sup} onClick={() => setSelectedSupplier(sup)}
                className="flex-1 rounded-lg py-2.5 text-sm font-bold"
                style={{ background: selectedSupplier === sup ? COLORS.blue : COLORS.white, color: selectedSupplier === sup ? 'white' : COLORS.ink, border: `1px solid ${COLORS.line}` }}>
                {sup}
              </button>
            ))}
          </div>
          {selectedSupplier && (
            <div className="space-y-2 mb-3">
              {airtimeDenoms.map(denom => {
                const st = denomState[denom] || { packs: 0, singles: 0 };
                const active = (st.packs || 0) > 0 || (st.singles || 0) > 0;
                return (
                  <div key={denom} className="rounded-xl p-3" style={{ background: COLORS.white, border: `1px solid ${active ? COLORS.blue : COLORS.line}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold" style={{ color: COLORS.ink }}>KSh {denom}</span>
                      {active && <span className="text-sm font-bold" style={{ color: COLORS.green }}>KSh {airtimePrice(denom, st).toLocaleString()}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-12" style={{ color: COLORS.muted }}>Packs</span>
                        <Stepper value={st.packs || 0} onChange={v => setDenomField(denom, 'packs', v)} min={0} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-12" style={{ color: COLORS.muted }}>Singles</span>
                        <Stepper value={st.singles || 0} onChange={v => setDenomField(denom, 'singles', v)} min={0} />
                      </div>
                      {active && <span className="text-xs" style={{ color: COLORS.mutedLight }}>{(st.packs||0)*10 + (st.singles||0)} cards</span>}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs" style={{ color: COLORS.mutedLight }}>Price is 95% of face value \u2014 calculated automatically.</p>
            </div>
          )}
        </>
      )}

      {/* BURNER / COOKER: per-option qty + price rows */}
      {!isCylinder && !isAirtime && (
        <div className="space-y-2 mb-3">
          {flatOptions.map(o => {
            const st = optState[o] || { qty: 0, price: '' };
            return (
              <div key={o} className="rounded-xl p-3" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: COLORS.ink }}>{o}</span>
                  <Stepper value={st.qty} onChange={v => setOptField(o, 'qty', v)} min={0} />
                </div>
                {st.qty > 0 && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs" style={{ color: COLORS.muted }}>Price each (KSh)</span>
                    <input value={st.price} onChange={e => setOptField(o, 'price', e.target.value)} inputMode="numeric" placeholder="0"
                      className="w-24 rounded-lg px-3 py-1.5 text-right text-sm font-bold outline-none" style={{ border: `1px solid ${COLORS.line}`, color: COLORS.ink }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {priceMissing && (
        <p className="text-xs mb-2 font-semibold" style={{ color: COLORS.amber }}>Add a price for each item before continuing.</p>
      )}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl py-2.5 text-sm font-semibold" style={{ background: '#F1F2EE', color: COLORS.ink }}>Cancel</button>
        <button onClick={commit} disabled={!canAdd} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white" style={{ background: canAdd ? COLORS.green : COLORS.mutedLight }}>{editItem ? 'Save changes' : 'Add to sale'}</button>
      </div>
    </div>
  );
}

// ---------- PAYMENT ----------
function PaymentStep({ total, onBack, onDone }) {
  const [cash, setCash] = useState('');
  const [credit, setCredit] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(false);

  const cashN = parseFloat(cash) || 0;
  const creditN = parseFloat(credit) || 0;
  const covered = cashN + creditN;
  const remaining = total - covered;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-28">
        <div className="rounded-2xl p-5 mb-4 text-center" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
          <p className="text-xs uppercase tracking-widest" style={{ color: COLORS.muted }}>Total due</p>
          <p className="font-bold text-3xl mt-1" style={{ color: COLORS.ink }}>KSh {total.toLocaleString()}</p>
        </div>

        <div className="mb-3">
          <p className="text-xs mb-1" style={{ color: COLORS.mutedLight }}>Paid in cash now (KSh)</p>
          <input value={cash} onChange={e => setCash(e.target.value)} inputMode="numeric" placeholder="0"
            className="w-full rounded-xl px-3 py-3 text-base outline-none" style={{ border: `1px solid ${COLORS.line}`, color: COLORS.ink }} />
        </div>
        <div className="mb-3">
          <p className="text-xs mb-1" style={{ color: COLORS.mutedLight }}>On credit (KSh)</p>
          <input value={credit} onChange={e => setCredit(e.target.value)} inputMode="numeric" placeholder="0"
            className="w-full rounded-xl px-3 py-3 text-base outline-none" style={{ border: `1px solid ${COLORS.line}`, color: COLORS.ink }} />
        </div>

        <div className="rounded-xl px-3 py-3 mb-4 flex items-center justify-between"
          style={{ background: remaining === 0 ? '#EAF5EE' : remaining > 0 ? '#FCEFE6' : '#FDECEC' }}>
          <span className="text-sm font-semibold" style={{ color: remaining === 0 ? COLORS.green : remaining > 0 ? COLORS.amber : '#B4232A' }}>
            {remaining === 0 ? 'Fully accounted for' : remaining > 0 ? 'Still unaccounted' : 'Over-paid — check amounts'}
          </span>
          <span className="font-bold text-sm" style={{ color: remaining === 0 ? COLORS.green : remaining > 0 ? COLORS.amber : '#B4232A' }}>
            KSh {Math.abs(remaining).toLocaleString()}
          </span>
        </div>

        <button onClick={() => setPhoto(p => !p)} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 mb-3 text-sm font-semibold"
          style={{ border: `1px dashed ${photo ? COLORS.green : COLORS.line}`, color: photo ? COLORS.green : COLORS.mutedLight }}>
          {photo ? <Check size={16} /> : <Camera size={16} />} {photo ? 'Receipt photo attached' : 'Attach receipt photo (optional)'}
        </button>

        <div className="mb-4">
          <div className="flex items-center gap-1 mb-1">
            <StickyNote size={12} style={{ color: COLORS.mutedLight }} />
            <p className="text-xs" style={{ color: COLORS.mutedLight }}>Note (optional)</p>
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Anything worth remembering about this sale…"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none" style={{ border: `1px solid ${COLORS.line}`, color: COLORS.ink }} />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-5 py-3" style={{ background: COLORS.paper, borderTop: `1px solid ${COLORS.line}` }}>
        <button onClick={onDone} className="w-full rounded-xl py-3.5 text-sm font-bold text-white" style={{ background: COLORS.green }}>
          Save sale
        </button>
        <p className="text-center text-xs mt-2" style={{ color: COLORS.mutedLight }}>Logged by {CURRENT_STAFF} · 13/07/2026 · 12:17 PM</p>
      </div>
    </div>
  );
}

// ---------- SALES HISTORY (view-only) ----------
function HistoryScreen({ tab, onBack }) {
  const [expanded, setExpanded] = useState(null);
  const [editingNote, setEditingNote] = useState(null); // sale id whose note is being edited
  const [noteDrafts, setNoteDrafts] = useState({});     // { saleId: text }
  const history = salesHistory[tab.id] || [];

  function noteFor(sale) {
    return noteDrafts[sale.id] != null ? noteDrafts[sale.id] : sale.note;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <button onClick={onBack} className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}>
          <ArrowLeft size={22} style={{ color: COLORS.ink }} />
        </button>
        <div>
          <h2 className="font-bold text-base" style={{ color: COLORS.ink }}>{tab.name}</h2>
          <p className="text-xs" style={{ color: COLORS.mutedLight }}>Previous sales</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        {history.length === 0 ? (
          <div className="text-center mt-16">
            <p className="text-sm" style={{ color: COLORS.mutedLight }}>No sales recorded yet.</p>
          </div>
        ) : history.map(sale => {
          const isOpen = expanded === sale.id;
          const total = sale.cash + sale.credit;
          return (
            <div key={sale.id} className="mb-3 rounded-2xl overflow-hidden" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              <button onClick={() => setExpanded(isOpen ? null : sale.id)} className="w-full text-left p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: COLORS.mutedLight }}>{sale.when}</span>
                  <span className="font-bold text-sm" style={{ color: COLORS.ink }}>KSh {total.toLocaleString()}</span>
                </div>
                <p className="text-sm mt-1 font-semibold" style={{ color: COLORS.ink }}>
                  {sale.items.map(it => `${it.label} ×${it.qty}`).join(', ')}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {sale.credit > 0 ? (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#FCEFE6', color: COLORS.amber }}>
                      KSh {sale.credit.toLocaleString()} credit
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EAF5EE', color: COLORS.green }}>Fully paid</span>
                  )}
                  {sale.photo && <Camera size={12} style={{ color: COLORS.mutedLight }} />}
                  {noteFor(sale) && <StickyNote size={12} style={{ color: COLORS.mutedLight }} />}
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: COLORS.line }}>
                  {sale.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
                      <span className="text-sm" style={{ color: COLORS.ink }}>
                        {it.label} ×{it.qty}
                        {it.returned != null && ` · ${it.returned}/${it.qty} empties back`}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: COLORS.ink }}>
                        KSh {(it.autoPrice != null ? it.autoPrice : (it.price || 0) * it.qty).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t space-y-1" style={{ borderColor: COLORS.line }}>
                    <div className="flex justify-between text-xs"><span style={{ color: COLORS.muted }}>Cash</span><span style={{ color: COLORS.ink }}>KSh {sale.cash.toLocaleString()}</span></div>
                    <div className="flex justify-between text-xs"><span style={{ color: COLORS.muted }}>Credit</span><span style={{ color: COLORS.ink }}>KSh {sale.credit.toLocaleString()}</span></div>
                  </div>
                  {editingNote === sale.id ? (
                    <div className="mt-2">
                      <textarea
                        value={noteFor(sale)}
                        onChange={e => setNoteDrafts(d => ({ ...d, [sale.id]: e.target.value }))}
                        rows={2}
                        autoFocus
                        placeholder="Add a note…"
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                        style={{ border: `1px solid ${COLORS.line}`, color: COLORS.ink }}
                      />
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => setEditingNote(null)} className="flex-1 rounded-lg py-2 text-xs font-semibold" style={{ background: '#F1F2EE', color: COLORS.ink }}>Done</button>
                      </div>
                    </div>
                  ) : noteFor(sale) ? (
                    <button onClick={() => setEditingNote(sale.id)} className="mt-2 w-full text-left rounded-lg px-3 py-2" style={{ background: '#F6F8F4' }}>
                      <p className="text-xs" style={{ color: COLORS.ink }}>{noteFor(sale)}</p>
                      <p className="text-xs mt-1 font-semibold" style={{ color: COLORS.blue }}>Edit note</p>
                    </button>
                  ) : (
                    <button onClick={() => setEditingNote(sale.id)} className="mt-2 flex items-center gap-1 text-xs font-semibold" style={{ color: COLORS.blue }}>
                      <StickyNote size={12} /> Add a note
                    </button>
                  )}
                  {sale.photo && (
                    <div className="mt-2 rounded-lg flex items-center justify-center py-6" style={{ background: '#F1F2EE' }}>
                      <div className="flex items-center gap-1"><Camera size={14} style={{ color: COLORS.mutedLight }} /><span className="text-xs" style={{ color: COLORS.mutedLight }}>Receipt photo</span></div>
                    </div>
                  )}
                  <p className="text-xs mt-2" style={{ color: COLORS.mutedLight }}>Logged by {sale.staff}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- SHELL ----------
function PhoneFrame({ children }) {
  return (
    <div className="overflow-hidden relative" style={{ width: 380, height: 780, background: COLORS.paper, borderRadius: 40, border: '10px solid #16231F', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
      <div className="flex items-center justify-between px-6 pt-3 pb-1 text-xs font-semibold" style={{ color: COLORS.ink }}>
        <span>9:41</span><span>●●●</span>
      </div>
      <div className="relative" style={{ height: 'calc(100% - 28px)' }}>{children}</div>
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div className="absolute left-4 right-4 rounded-xl px-4 py-3 flex items-center gap-2 z-40" style={{ bottom: 24, background: COLORS.ink }}>
      <Check size={16} color="white" />
      <span className="text-sm text-white font-semibold">{msg}</span>
    </div>
  );
}

export default function App() {
  const [tabs] = useState(initialTabs);
  const [search, setSearch] = useState('');
  const [view, setView] = useState({ screen: 'home' });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }
  }, [toast]);

  function saveSale() {
    setView({ screen: 'home' });
    setToast('Sale saved');
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 p-6" style={{ background: '#DCE0DA' }}>
      <PhoneFrame>
        {view.screen === 'home' && (
          <HomeWall
            tabs={tabs}
            search={search}
            setSearch={setSearch}
            onAddTab={() => setView({ screen: 'sale', isNew: true, tab: null })}
            onAddSaleTo={(tab) => setView({ screen: 'sale', isNew: false, tab })}
            onViewHistory={(tab) => setView({ screen: 'history', tab })}
          />
        )}
        {view.screen === 'history' && (
          <HistoryScreen tab={view.tab} onBack={() => setView({ screen: 'home' })} />
        )}
        {view.screen === 'sale' && (
          <AddSale
            tab={view.tab}
            isNewTab={view.isNew}
            onCancel={() => setView({ screen: 'home' })}
            onDone={saveSale}
          />
        )}
        {toast && <Toast msg={toast} />}
      </PhoneFrame>
      <p className="text-xs text-center max-w-xs" style={{ color: '#5b6660' }}>
        Tap “Add sale +” on a tab (no name step) or “Add new tab +” (asks for name). In a sale, tap commodity icons to drop cards into the cart — buy all four without leaving the screen.
      </p>
    </div>
  );
}
```
-e 
---

-e 
## Mockup — Debts  (`bmg-debts-section.jsx`)

```jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Search, ArrowLeft, ChevronDown, ChevronRight, Check, Clock, Flame, List } from 'lucide-react';

const COLORS = {
  paper: '#EEF0EC', ink: '#16231F', blue: '#2B6CB5', amber: '#C2540B',
  green: '#2F7A4D', red: '#B4232A', line: '#C9CDC3', muted: '#3f4a42',
  mutedLight: '#454e47', white: '#ffffff',
};

// ---- PLACEHOLDER demo state (never ships). Real data comes from sales/repayments. ----
// Each money debt = one credit sale, fixed 7-day deadline from saleDate.
// daysLeft: <0 overdue, 0 due today, >0 remaining. Kept for logic, NOT shown as text.
const seedMoneyDebts = [
  { id: 'd1', customer: 'Wanjiru Mwangi', item: 'Total · Big cylinder', saleDate: '06/07/2026', amount: 2200, daysLeft: -2 },
  { id: 'd2', customer: 'Wanjiru Mwangi', item: 'Safaricom airtime', saleDate: '11/07/2026', amount: 300, daysLeft: 3 },
  { id: 'd3', customer: 'Musa Ali', item: 'Afrigas · Big cylinder', saleDate: '05/07/2026', amount: 2100, daysLeft: -3 },
  { id: 'd4', customer: 'Otieno K.', item: 'Double burner stove', saleDate: '12/07/2026', amount: 1500, daysLeft: 4 },
  { id: 'd5', customer: 'Grace N.', item: 'K-Gas · Small cylinder', saleDate: '13/07/2026', amount: 1150, daysLeft: 6 },
];
const seedRepayments = [
  { id: 'r1', debtId: 'd1', customer: 'Wanjiru Mwangi', amount: 750, date: '08/07/2026', time: '2:15 PM' },
  { id: 'r2', debtId: 'd4', customer: 'Otieno K.', amount: 500, date: '12/07/2026', time: '5:40 PM' },
];

// Unified money ledger = every credit-taken event + every repayment, interleaved by time.
// direction: 'out' = credit given (debt taken), 'in' = repayment received.
// sortKey is a real timestamp in the app; here a number just to order the demo newest-first.
const moneyLedger = [
  { id: 'l1', direction: 'out', customer: 'Wanjiru Mwangi', detail: 'Total · Big cylinder ×1', amount: 2200, date: '06/07/2026', time: '9:15 AM', sortKey: 1 },
  { id: 'l2', direction: 'in', customer: 'Wanjiru Mwangi', detail: 'Repayment', amount: 750, date: '08/07/2026', time: '2:15 PM', sortKey: 2 },
  { id: 'l3', direction: 'out', customer: 'Grace N.', detail: 'K-Gas · Small cylinder ×1', amount: 1150, date: '10/07/2026', time: '10:02 AM', sortKey: 3 },
  { id: 'l4', direction: 'out', customer: 'Wanjiru Mwangi', detail: 'Safaricom airtime', amount: 300, date: '11/07/2026', time: '4:48 PM', sortKey: 4 },
  { id: 'l5', direction: 'out', customer: 'Otieno K.', detail: 'Double burner stove ×1', amount: 1500, date: '12/07/2026', time: '11:30 AM', sortKey: 5 },
  { id: 'l6', direction: 'in', customer: 'Otieno K.', detail: 'Repayment', amount: 500, date: '12/07/2026', time: '5:40 PM', sortKey: 6 },
  { id: 'l7', direction: 'out', customer: 'Musa Ali', detail: 'Afrigas · Big cylinder ×1', amount: 2100, date: '05/07/2026', time: '8:20 AM', sortKey: 0 },
];

// Unified empties ledger = every empty taken (not returned at sale) + every return, by time.
const emptiesLedger = [
  { id: 'el1', direction: 'out', customer: 'Musa Ali', detail: 'Afrigas · Big', count: 1, date: '05/07/2026', time: '8:20 AM', sortKey: 0 },
  { id: 'el2', direction: 'out', customer: 'Wanjiru Mwangi', detail: 'Total · Big', count: 1, date: '06/07/2026', time: '9:15 AM', sortKey: 1 },
  { id: 'el3', direction: 'out', customer: 'Grace N.', detail: 'K-Gas · Small', count: 2, date: '10/07/2026', time: '10:02 AM', sortKey: 2 },
  { id: 'el4', direction: 'in', customer: 'Grace N.', detail: 'K-Gas · Small', count: 1, date: '11/07/2026', time: '9:10 AM', sortKey: 3 },
];
const seedEmptyBatches = [
  { id: 'e1', customer: 'Wanjiru Mwangi', brand: 'Total', size: 'Big', saleDate: '06/07/2026', count: 1, daysLeft: -2 },
  { id: 'e2', customer: 'Grace N.', brand: 'K-Gas', size: 'Small', saleDate: '10/07/2026', count: 2, daysLeft: 1 },
  { id: 'e3', customer: 'Musa Ali', brand: 'Afrigas', size: 'Big', saleDate: '05/07/2026', count: 1, daysLeft: -3 },
];
const seedReturns = [
  { id: 'rt1', batchId: 'e2', customer: 'Grace N.', count: 1, date: '11/07/2026', time: '9:10 AM' },
];

// Empties physically IN HAND (in the shop, waiting for supplier refill collection).
// Sources: (1) customer returns, (2) empties handed over at point of sale.
// This is a READ-ONLY summary here. The future Refilling section owns the action
// that reduces this count when empties are sent to the supplier.
// PLACEHOLDER demo values.
const emptiesInHand = [
  { brand: 'K-Gas', size: 'Small', count: 6 },
  { brand: 'Total', size: 'Big', count: 4 },
  { brand: 'Afrigas', size: 'Big', count: 3 },
  { brand: 'K-Gas', size: 'Big', count: 2 },
];

function Stepper({ value, onChange, min = 0, max = 999 }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="rounded-full flex items-center justify-center" style={{ width: 32, height: 32, background: '#F1F2EE', border: `1px solid ${COLORS.line}` }}>
        <span style={{ color: COLORS.ink, fontWeight: 700, fontSize: 18, lineHeight: 1 }}>−</span>
      </button>
      <span className="font-bold text-base w-6 text-center" style={{ color: COLORS.ink }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="rounded-full flex items-center justify-center" style={{ width: 32, height: 32, background: COLORS.blue }}>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 18, lineHeight: 1 }}>+</span>
      </button>
    </div>
  );
}

// Calm status dot: red overdue, amber due-soon (<=2d), invisible spacer if fine.
function StatusDot({ daysLeft }) {
  if (daysLeft > 2) return <span style={{ display: 'inline-block', width: 8, height: 8 }} />;
  const color = daysLeft < 0 ? COLORS.red : COLORS.amber;
  return <span className="rounded-full inline-block" style={{ width: 8, height: 8, background: color }} />;
}
function statusRank(daysLeft) { return daysLeft < 0 ? 0 : daysLeft <= 2 ? 1 : 2; }

function Toast({ msg }) {
  return (
    <div className="absolute left-4 right-4 rounded-xl px-4 py-3 flex items-center gap-2 z-40" style={{ bottom: 24, background: COLORS.ink }}>
      <Check size={16} color="white" />
      <span className="text-sm text-white font-semibold">{msg}</span>
    </div>
  );
}

function MoneyView({ debts, repayments, onRepay, onOpenHistory }) {
  const [expanded, setExpanded] = useState(null);
  function paidFor(debtId) { return repayments.filter(r => r.debtId === debtId).reduce((s, r) => s + r.amount, 0); }

  const groups = useMemo(() => {
    const byCust = {};
    debts.forEach(d => {
      const owed = d.amount - paidFor(d.id);
      if (owed <= 0) return;
      (byCust[d.customer] = byCust[d.customer] || []).push({ ...d, owed });
    });
    return Object.entries(byCust).map(([customer, list]) => ({
      customer, list,
      total: list.reduce((s, d) => s + d.owed, 0),
      urgency: Math.min(...list.map(d => statusRank(d.daysLeft))),
    }));
  }, [debts, repayments]);

  const needs = groups.filter(g => g.urgency <= 1).sort((a, b) => a.urgency - b.urgency);
  const rest = groups.filter(g => g.urgency > 1);

  function renderGroup(g) {
    const isOpen = expanded === g.customer;
    return (
      <div key={g.customer} className="mb-3 rounded-2xl overflow-hidden" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
        <button onClick={() => setExpanded(isOpen ? null : g.customer)} className="w-full flex items-center justify-between p-4">
          <div className="flex items-center gap-2.5 text-left">
            <StatusDot daysLeft={g.list.reduce((m, d) => Math.min(m, d.daysLeft), 99)} />
            <div>
              <p className="font-bold text-base" style={{ color: COLORS.ink }}>{g.customer}</p>
              <p className="text-xs mt-0.5" style={{ color: COLORS.mutedLight }}>{g.list.length} debt{g.list.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base" style={{ color: COLORS.amber }}>KSh {g.total.toLocaleString()}</span>
            {isOpen ? <ChevronDown size={18} style={{ color: COLORS.mutedLight }} /> : <ChevronRight size={18} style={{ color: COLORS.mutedLight }} />}
          </div>
        </button>
        {isOpen && (
          <div className="px-4 pb-4 border-t" style={{ borderColor: COLORS.line }}>
            {g.list.map(d => {
              const paid = paidFor(d.id);
              return (
                <div key={d.id} className="pt-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot daysLeft={d.daysLeft} />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: COLORS.ink }}>{d.item}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Clock size={11} style={{ color: COLORS.mutedLight }} />
                          <span className="text-xs" style={{ color: COLORS.mutedLight }}>Taken {d.saleDate}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: COLORS.amber }}>KSh {d.owed.toLocaleString()}</p>
                      {paid > 0 && <p className="text-xs" style={{ color: COLORS.green }}>KSh {paid.toLocaleString()} paid</p>}
                    </div>
                  </div>
                  <button onClick={() => onRepay(d)} className="mt-2 w-full rounded-lg py-2 text-xs font-bold" style={{ background: '#EEF3F8', color: COLORS.blue }}>
                    Log repayment on this debt
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 pt-4 pb-24">
      <button onClick={onOpenHistory} className="w-full mb-4 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}`, color: COLORS.ink }}>
        <List size={16} /> View repayment record
      </button>
      {needs.length > 0 && (<><p className="text-xs uppercase tracking-widest mb-2 font-bold" style={{ color: COLORS.amber }}>Needs collecting</p>{needs.map(renderGroup)}</>)}
      {rest.length > 0 && (<><p className="text-xs uppercase tracking-widest mb-2 mt-4" style={{ color: COLORS.muted }}>On track</p>{rest.map(renderGroup)}</>)}
      {groups.length === 0 && <p className="text-center text-sm mt-16" style={{ color: COLORS.mutedLight }}>No outstanding money debts.</p>}
    </div>
  );
}

function EmptiesView({ batches, returns, onReturn, onOpenHistory }) {
  const [expanded, setExpanded] = useState(null);
  function returnedFor(batchId) { return returns.filter(r => r.batchId === batchId).reduce((s, r) => s + r.count, 0); }

  const groups = useMemo(() => {
    const byCust = {};
    batches.forEach(b => {
      const out = b.count - returnedFor(b.id);
      if (out <= 0) return;
      (byCust[b.customer] = byCust[b.customer] || []).push({ ...b, out });
    });
    return Object.entries(byCust).map(([customer, list]) => ({
      customer, list,
      total: list.reduce((s, b) => s + b.out, 0),
      urgency: Math.min(...list.map(b => statusRank(b.daysLeft))),
    }));
  }, [batches, returns]);

  const needs = groups.filter(g => g.urgency <= 1).sort((a, b) => a.urgency - b.urgency);
  const rest = groups.filter(g => g.urgency > 1);

  function renderGroup(g) {
    const isOpen = expanded === g.customer;
    return (
      <div key={g.customer} className="mb-3 rounded-2xl overflow-hidden" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
        <button onClick={() => setExpanded(isOpen ? null : g.customer)} className="w-full flex items-center justify-between p-4">
          <div className="flex items-center gap-2.5 text-left">
            <StatusDot daysLeft={g.list.reduce((m, b) => Math.min(m, b.daysLeft), 99)} />
            <p className="font-bold text-base" style={{ color: COLORS.ink }}>{g.customer}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1"><Flame size={15} style={{ color: COLORS.amber }} /><span className="font-bold text-base" style={{ color: COLORS.amber }}>{g.total}</span></div>
            {isOpen ? <ChevronDown size={18} style={{ color: COLORS.mutedLight }} /> : <ChevronRight size={18} style={{ color: COLORS.mutedLight }} />}
          </div>
        </button>
        {isOpen && (
          <div className="px-4 pb-4 border-t" style={{ borderColor: COLORS.line }}>
            {g.list.map(b => (
              <div key={b.id} className="pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusDot daysLeft={b.daysLeft} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: COLORS.ink }}>{b.brand} · {b.size}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock size={11} style={{ color: COLORS.mutedLight }} />
                        <span className="text-xs" style={{ color: COLORS.mutedLight }}>Taken {b.saleDate}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm font-bold" style={{ color: COLORS.amber }}>{b.out} out</p>
                </div>
                <button onClick={() => onReturn(b)} className="mt-2 w-full rounded-lg py-2 text-xs font-bold" style={{ background: '#EEF3F8', color: COLORS.blue }}>
                  Tick off returned empties
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 pt-4 pb-24">
      <button onClick={onOpenHistory} className="w-full mb-3 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}`, color: COLORS.ink }}>
        <List size={16} /> View returns record
      </button>

      <InHandSummary />

      {needs.length > 0 && (<><p className="text-xs uppercase tracking-widest mb-2 font-bold" style={{ color: COLORS.amber }}>Needs collecting</p>{needs.map(renderGroup)}</>)}
      {rest.length > 0 && (<><p className="text-xs uppercase tracking-widest mb-2 mt-4" style={{ color: COLORS.muted }}>On track</p>{rest.map(renderGroup)}</>)}
      {groups.length === 0 && <p className="text-center text-sm mt-16" style={{ color: COLORS.mutedLight }}>No empties outstanding.</p>}
    </div>
  );
}

// Subtle, collapsible "empties in hand" summary — the pile waiting for supplier refill.
function InHandSummary() {
  const [open, setOpen] = useState(false);
  const total = emptiesInHand.reduce((s, e) => s + e.count, 0);
  return (
    <div className="mb-4 rounded-xl overflow-hidden" style={{ background: '#F3F5F1', border: `1px solid ${COLORS.line}` }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Flame size={14} style={{ color: COLORS.muted }} />
          <span className="text-xs font-semibold" style={{ color: COLORS.muted }}>Empties in hand (for refill)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold" style={{ color: COLORS.ink }}>{total}</span>
          {open ? <ChevronDown size={15} style={{ color: COLORS.muted }} /> : <ChevronRight size={15} style={{ color: COLORS.muted }} />}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: COLORS.line }}>
          {emptiesInHand.map((e, i) => (
            <div key={i} className="flex items-center justify-between py-1">
              <span className="text-xs" style={{ color: COLORS.ink }}>{e.brand} · {e.size}</span>
              <span className="text-xs font-bold" style={{ color: COLORS.ink }}>{e.count}</span>
            </div>
          ))}
          <p className="text-xs mt-1.5" style={{ color: COLORS.mutedLight }}>Reduced when you send empties for refill (Refilling section).</p>
        </div>
      )}
    </div>
  );
}

function HistoryRecord({ kind, ledger, liveEntries, onBack }) {
  const [q, setQ] = useState('');

  // Merge any newly-logged live entries into the seed ledger, newest-first by sortKey.
  const merged = useMemo(() => {
    const live = liveEntries.map(e => ({
      id: e.id, direction: 'in', customer: e.customer,
      detail: kind === 'money' ? 'Repayment' : e.detail || 'Return',
      amount: e.amount, count: e.count, date: e.date, time: e.time,
      sortKey: 9999 + (e._k || 0), // live entries are newest
    }));
    return [...live, ...ledger].sort((a, b) => b.sortKey - a.sortKey);
  }, [ledger, liveEntries, kind]);

  const filtered = merged.filter(e => e.customer.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <button onClick={onBack} className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}>
          <ArrowLeft size={22} style={{ color: COLORS.ink }} />
        </button>
        <div>
          <h2 className="font-bold text-base" style={{ color: COLORS.ink }}>{kind === 'money' ? 'Credit & repayment record' : 'Empties record'}</h2>
          <p className="text-xs" style={{ color: COLORS.mutedLight }}>Everything, newest first</p>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
          <Search size={16} style={{ color: COLORS.mutedLight }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a name to isolate their record…" className="flex-1 text-sm outline-none bg-transparent" style={{ color: COLORS.ink }} />
        </div>
        {q && <p className="text-xs mt-2" style={{ color: COLORS.mutedLight }}>Showing {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'} for “{q}”.</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-8">
        {filtered.length === 0 ? (
          <p className="text-center text-sm mt-16" style={{ color: COLORS.mutedLight }}>No entries.</p>
        ) : filtered.map(e => {
          const isOut = e.direction === 'out';
          return (
            <div key={e.id} className="mb-2 rounded-xl p-3 flex gap-3" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              {/* direction indicator */}
              <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 32, height: 32, background: isOut ? '#FCEFE6' : '#EAF5EE', marginTop: 2 }}>
                <span style={{ color: isOut ? COLORS.amber : COLORS.green, fontWeight: 800, fontSize: 16, lineHeight: 1 }}>{isOut ? '↑' : '↓'}</span>
              </div>

              <div className="flex-1 min-w-0">
                {/* Row 1: name + amount */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold" style={{ color: COLORS.ink }}>{e.customer}</p>
                  <span className="text-sm font-bold shrink-0" style={{ color: isOut ? COLORS.amber : COLORS.green }}>
                    {kind === 'money' ? `KSh ${(e.amount || 0).toLocaleString()}` : `${e.count} ${isOut ? 'out' : 'back'}`}
                  </span>
                </div>

                {/* Row 2: what it was — own line, wraps freely, never truncated */}
                <p className="text-sm mt-0.5" style={{ color: COLORS.ink }}>{e.detail}</p>

                {/* Row 3: tag + full date + time */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: isOut ? '#FCEFE6' : '#EAF5EE', color: isOut ? COLORS.amber : COLORS.green }}>
                    {isOut ? (kind === 'money' ? 'credit taken' : 'taken') : (kind === 'money' ? 'repaid' : 'returned')}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: COLORS.muted }}>{e.date} · {e.time}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RepaymentSheet({ debt, paidAlready, onCancel, onSave }) {
  const owed = debt.amount - paidAlready;
  const [amount, setAmount] = useState('');
  const entered = parseFloat(amount) || 0;
  const remainingAfter = Math.max(owed - entered, 0);
  const over = entered > owed;
  return (
    <div className="absolute inset-0 flex items-end justify-center z-30" style={{ background: 'rgba(22,35,31,0.45)' }}>
      <div className="w-full rounded-t-2xl p-5" style={{ background: 'white' }}>
        <p className="font-bold text-base" style={{ color: COLORS.ink }}>Repayment — {debt.customer}</p>
        <p className="text-xs mt-0.5" style={{ color: COLORS.mutedLight }}>{debt.item} · taken {debt.saleDate}</p>
        <div className="mt-3 rounded-xl px-3 py-3 flex items-center justify-between" style={{ background: '#FCEFE6' }}>
          <span className="text-sm font-semibold" style={{ color: COLORS.amber }}>Owed on this debt</span>
          <span className="font-bold" style={{ color: COLORS.amber }}>KSh {owed.toLocaleString()}</span>
        </div>
        <p className="text-xs mt-3 mb-1" style={{ color: COLORS.mutedLight }}>Amount paid now (KSh)</p>
        <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder="0" className="w-full rounded-xl px-3 py-3 text-base outline-none" style={{ border: `1px solid ${over ? COLORS.red : COLORS.line}`, color: COLORS.ink }} />
        {entered > 0 && !over && <p className="text-xs mt-2" style={{ color: remainingAfter === 0 ? COLORS.green : COLORS.muted }}>{remainingAfter === 0 ? 'This clears the debt.' : `KSh ${remainingAfter.toLocaleString()} will remain.`}</p>}
        {over && <p className="text-xs mt-2 font-semibold" style={{ color: COLORS.red }}>More than owed — check the amount.</p>}
        <p className="text-xs mt-1" style={{ color: COLORS.mutedLight }}>The 1-week deadline does not reset on partial payment.</p>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 rounded-xl py-3 text-sm font-semibold" style={{ background: '#F1F2EE', color: COLORS.ink }}>Cancel</button>
          <button onClick={() => onSave(entered)} disabled={entered <= 0 || over} className="flex-1 rounded-xl py-3 text-sm font-bold text-white" style={{ background: (entered > 0 && !over) ? COLORS.blue : COLORS.mutedLight }}>Save repayment</button>
        </div>
      </div>
    </div>
  );
}

function ReturnSheet({ batch, returnedAlready, onCancel, onSave }) {
  const out = batch.count - returnedAlready;
  const [returning, setReturning] = useState(0);
  const remainingAfter = out - returning;
  return (
    <div className="absolute inset-0 flex items-end justify-center z-30" style={{ background: 'rgba(22,35,31,0.45)' }}>
      <div className="w-full rounded-t-2xl p-5" style={{ background: 'white' }}>
        <p className="font-bold text-base" style={{ color: COLORS.ink }}>Return empties — {batch.customer}</p>
        <p className="text-xs mt-0.5" style={{ color: COLORS.mutedLight }}>{batch.brand} · {batch.size} · taken {batch.saleDate}</p>
        <div className="mt-3 rounded-xl px-3 py-3 flex items-center justify-between" style={{ background: '#FCEFE6' }}>
          <span className="text-sm font-semibold" style={{ color: COLORS.amber }}>Empties still out</span>
          <span className="font-bold" style={{ color: COLORS.amber }}>{out}</span>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl px-3 py-3" style={{ border: `1px solid ${COLORS.line}` }}>
          <span className="text-sm" style={{ color: COLORS.muted }}>Returning now</span>
          <Stepper value={returning} onChange={setReturning} min={0} max={out} />
        </div>
        {returning > 0 && <p className="text-xs mt-2" style={{ color: remainingAfter === 0 ? COLORS.green : COLORS.muted }}>{remainingAfter === 0 ? 'All empties accounted for.' : `${remainingAfter} will still be out.`}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 rounded-xl py-3 text-sm font-semibold" style={{ background: '#F1F2EE', color: COLORS.ink }}>Cancel</button>
          <button onClick={() => onSave(returning)} disabled={returning <= 0} className="flex-1 rounded-xl py-3 text-sm font-bold text-white" style={{ background: returning > 0 ? COLORS.blue : COLORS.mutedLight }}>Confirm return</button>
        </div>
      </div>
    </div>
  );
}

function PhoneFrame({ children }) {
  return (
    <div className="overflow-hidden relative" style={{ width: 380, height: 780, background: COLORS.paper, borderRadius: 40, border: '10px solid #16231F', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
      <div className="flex items-center justify-between px-6 pt-3 pb-1 text-xs font-semibold" style={{ color: COLORS.ink }}><span>9:41</span><span>●●●</span></div>
      <div className="relative" style={{ height: 'calc(100% - 28px)' }}>{children}</div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('money');
  const [screen, setScreen] = useState('list');
  const [repayments, setRepayments] = useState(seedRepayments);
  const [returns, setReturns] = useState(seedReturns);
  const [repayTarget, setRepayTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); } }, [toast]);

  function paidFor(debtId) { return repayments.filter(r => r.debtId === debtId).reduce((s, r) => s + r.amount, 0); }
  function returnedFor(batchId) { return returns.filter(r => r.batchId === batchId).reduce((s, r) => s + r.count, 0); }

  function saveRepayment(entered) {
    const d = repayTarget;
    setRepayments(rs => [{ id: 'r' + Date.now(), debtId: d.id, customer: d.customer, amount: entered, date: '13/07/2026', time: 'Just now' }, ...rs]);
    setRepayTarget(null); setToast('Repayment logged');
  }
  function saveReturn(cnt) {
    const b = returnTarget;
    setReturns(rs => [{ id: 'rt' + Date.now(), batchId: b.id, customer: b.customer, count: cnt, date: '13/07/2026', time: 'Just now' }, ...rs]);
    setReturnTarget(null); setToast('Empties updated');
  }

  const totalMoney = seedMoneyDebts.reduce((s, d) => s + Math.max(d.amount - paidFor(d.id), 0), 0);
  const totalEmpties = seedEmptyBatches.reduce((s, b) => s + Math.max(b.count - returnedFor(b.id), 0), 0);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 p-6" style={{ background: '#DCE0DA' }}>
      <PhoneFrame>
        {screen === 'history' ? (
          <HistoryRecord
            kind={view}
            ledger={view === 'money' ? moneyLedger : emptiesLedger}
            liveEntries={view === 'money'
              ? repayments.filter(r => !seedRepayments.find(s => s.id === r.id))
              : returns.filter(r => !seedReturns.find(s => s.id === r.id)).map(r => ({ ...r, detail: 'Return' }))}
            onBack={() => setScreen('list')}
          />
        ) : (
          <div className="flex flex-col h-full">
            <div className="px-5 pt-5 pb-3">
              <h1 className="font-bold text-2xl" style={{ color: COLORS.ink }}>Debts</h1>
              <p className="text-sm mt-0.5" style={{ color: COLORS.mutedLight }}>
                {view === 'money' ? `KSh ${totalMoney.toLocaleString()} outstanding` : `${totalEmpties} empties out`}
              </p>
            </div>
            <div className="mx-5 flex rounded-xl p-1" style={{ background: '#E4E7DF' }}>
              {[['money', 'Money owed'], ['empties', 'Empties owed']].map(([k, label]) => (
                <button key={k} onClick={() => setView(k)} className="flex-1 rounded-lg py-2 text-sm font-bold" style={{ background: view === k ? COLORS.white : 'transparent', color: view === k ? COLORS.ink : COLORS.muted }}>{label}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {view === 'money'
                ? <MoneyView debts={seedMoneyDebts} repayments={repayments} onRepay={setRepayTarget} onOpenHistory={() => setScreen('history')} />
                : <EmptiesView batches={seedEmptyBatches} returns={returns} onReturn={setReturnTarget} onOpenHistory={() => setScreen('history')} />}
            </div>
          </div>
        )}

        {repayTarget && <RepaymentSheet debt={repayTarget} paidAlready={paidFor(repayTarget.id)} onCancel={() => setRepayTarget(null)} onSave={saveRepayment} />}
        {returnTarget && <ReturnSheet batch={returnTarget} returnedAlready={returnedFor(returnTarget.id)} onCancel={() => setReturnTarget(null)} onSave={saveReturn} />}
        {toast && <Toast msg={toast} />}
      </PhoneFrame>

      <p className="text-xs text-center max-w-xs" style={{ color: '#5b6660' }}>
        Log a repayment and watch the balance actually drop. "Needs collecting" surfaces the pressing ones; the dot flags overdue (red) / due-soon (amber). "View record" is the chronological, searchable log.
      </p>
    </div>
  );
}
```
-e 
---

-e 
## Mockup — Sales Record  (`bmg-sales-record.jsx`)

```jsx
import React, { useState, useMemo } from 'react';
import { Search, ArrowLeft, Camera, StickyNote, Calendar, X, SlidersHorizontal } from 'lucide-react';

const COLORS = {
  paper: '#EEF0EC', ink: '#16231F', blue: '#2B6CB5', amber: '#C2540B',
  green: '#2F7A4D', red: '#B4232A', line: '#C9CDC3', muted: '#3f4a42',
  mutedLight: '#454e47', white: '#ffffff',
};

// ---- PLACEHOLDER demo data (never ships). Real rows come from actual sales. ----
// A global record of EVERY sale, newest first. sortKey orders the demo.
const seedSales = [
  {
    id: 's1', customer: 'Wanjiru Mwangi', quick: false, staff: 'Njeri',
    items: 'Total · Big cylinder ×1',
    total: 2200, cash: 1000, credit: 1200,
    date: '13/07/2026', time: '12:17 PM', sortKey: 8,
    note: 'Empty not returned — bringing tomorrow', photo: true,
  },
  {
    id: 's2', customer: 'Quick Sale', quick: true, staff: 'Amos',
    items: 'Safaricom 100 airtime · 6 singles',
    total: 570, cash: 570, credit: 0,
    date: '13/07/2026', time: '11:52 AM', sortKey: 7,
    note: '', photo: false,
  },
  {
    id: 's3', customer: 'Otieno K.', quick: false, staff: 'Njeri',
    items: 'Double burner stove ×1',
    total: 1500, cash: 0, credit: 1500,
    date: '12/07/2026', time: '11:30 AM', sortKey: 6,
    note: 'Pays end of month', photo: false,
  },
  {
    id: 's4', customer: 'Quick Sale', quick: true, staff: 'Njeri',
    items: 'K-Gas · Small cylinder ×1',
    total: 1150, cash: 1150, credit: 0,
    date: '12/07/2026', time: '10:20 AM', sortKey: 5,
    note: '', photo: false,
  },
  {
    id: 's5', customer: 'Grace N.', quick: false, staff: 'Amos',
    items: 'K-Gas · Small cylinder ×2',
    total: 2300, cash: 2300, credit: 0,
    date: '10/07/2026', time: '9:05 AM', sortKey: 4,
    note: '', photo: false,
  },
  {
    id: 's6', customer: 'Musa Ali', quick: false, staff: 'Amos',
    items: 'Afrigas · Big cylinder ×1',
    total: 2100, cash: 0, credit: 2100,
    date: '05/07/2026', time: '8:20 AM', sortKey: 3,
    note: '', photo: true,
  },
];

function SalesRecord() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all'); // all | cash | credit | quick
  const [showDates, setShowDates] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // parse DD/MM/YYYY -> comparable number
  function dnum(d) { if (!d) return null; const [dd, mm, yy] = d.split('/').map(Number); return yy * 10000 + mm * 100 + dd; }

  const filtered = useMemo(() => {
    let rows = [...seedSales].sort((a, b) => b.sortKey - a.sortKey);
    if (q) rows = rows.filter(s => s.customer.toLowerCase().includes(q.toLowerCase()));
    if (filter === 'cash') rows = rows.filter(s => s.credit === 0);
    if (filter === 'credit') rows = rows.filter(s => s.credit > 0);
    if (filter === 'quick') rows = rows.filter(s => s.quick);
    const f = dnum(from), t = dnum(to);
    if (f || t) rows = rows.filter(s => { const d = dnum(s.date); return (!f || d >= f) && (!t || d <= t); });
    return rows;
  }, [q, filter, from, to]);

  const shownTotal = filtered.reduce((s, r) => s + r.total, 0);

  const filters = [['all', 'All'], ['cash', 'Cash'], ['credit', 'Credit'], ['quick', 'Quick']];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <button className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}>
          <ArrowLeft size={22} style={{ color: COLORS.ink }} />
        </button>
        <div>
          <h2 className="font-bold text-base" style={{ color: COLORS.ink }}>Sales record</h2>
          <p className="text-xs" style={{ color: COLORS.mutedLight }}>Every sale, newest first</p>
        </div>
      </div>

      {/* Controls */}
      <div className="px-5 pt-3">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
          <Search size={16} style={{ color: COLORS.mutedLight }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer…" className="flex-1 text-sm outline-none bg-transparent" style={{ color: COLORS.ink }} />
        </div>

        <div className="flex items-center gap-2 mt-2">
          <div className="flex gap-1.5 flex-1">
            {filters.map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: filter === k ? COLORS.ink : COLORS.white, color: filter === k ? 'white' : COLORS.muted, border: `1px solid ${filter === k ? COLORS.ink : COLORS.line}` }}>{label}</button>
            ))}
          </div>
          <button onClick={() => setShowDates(s => !s)} className="flex items-center justify-center rounded-full shrink-0" style={{ width: 34, height: 34, background: (from || to) ? COLORS.blue : COLORS.white, border: `1px solid ${(from || to) ? COLORS.blue : COLORS.line}` }}>
            <Calendar size={15} style={{ color: (from || to) ? 'white' : COLORS.muted }} />
          </button>
        </div>

        {showDates && (
          <div className="flex items-center gap-2 mt-2 rounded-xl px-3 py-2.5" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
            <input value={from} onChange={e => setFrom(e.target.value)} placeholder="From DD/MM/YYYY" className="flex-1 text-xs outline-none bg-transparent" style={{ color: COLORS.ink }} />
            <span style={{ color: COLORS.mutedLight }}>→</span>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="To DD/MM/YYYY" className="flex-1 text-xs outline-none bg-transparent" style={{ color: COLORS.ink }} />
            {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }}><X size={14} style={{ color: COLORS.mutedLight }} /></button>}
          </div>
        )}

        {/* Running total for what's shown */}
        <div className="flex items-center justify-between mt-3 mb-1">
          <span className="text-xs" style={{ color: COLORS.muted }}>{filtered.length} sale{filtered.length === 1 ? '' : 's'} shown</span>
          <span className="text-sm font-bold" style={{ color: COLORS.ink }}>KSh {shownTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* List — all fields visible per row, calm 3-line hierarchy */}
      <div className="flex-1 overflow-y-auto px-5 pt-1 pb-8">
        {filtered.length === 0 ? (
          <p className="text-center text-sm mt-16" style={{ color: COLORS.mutedLight }}>No sales match.</p>
        ) : filtered.map(s => (
          <div key={s.id} className="mb-2 rounded-xl overflow-hidden" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
            <div className="p-3">
              {/* Line 1: who + total */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: COLORS.ink }}>{s.customer}</p>
                  {s.quick && <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0" style={{ background: '#EEF3F8', color: COLORS.blue }}>quick</span>}
                </div>
                <span className="text-sm font-bold shrink-0" style={{ color: COLORS.ink }}>KSh {s.total.toLocaleString()}</span>
              </div>

              {/* Line 2: what was bought */}
              <p className="text-sm mt-0.5" style={{ color: COLORS.ink }}>{s.items}</p>

              {/* Line 3: quiet metadata — split · who logged · full date+time */}
              <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1">
                {s.credit > 0 ? (
                  <span className="text-xs" style={{ color: COLORS.amber }}>KSh {s.cash.toLocaleString()} cash · KSh {s.credit.toLocaleString()} credit</span>
                ) : (
                  <span className="text-xs" style={{ color: COLORS.green }}>Paid in full (cash)</span>
                )}
                <span className="text-xs" style={{ color: COLORS.mutedLight }}>·</span>
                <span className="text-xs" style={{ color: COLORS.muted }}>by {s.staff}</span>
                <span className="text-xs" style={{ color: COLORS.mutedLight }}>·</span>
                <span className="text-xs" style={{ color: COLORS.muted }}>{s.date} · {s.time}</span>
              </div>
            </div>

            {/* Note + photo only appear when present — keeps most rows clean */}
            {(s.note || s.photo) && (
              <div className="px-3 pb-3 flex items-start gap-2">
                {s.note && (
                  <div className="flex-1 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: '#F6F8F4' }}>
                    <StickyNote size={12} style={{ color: COLORS.muted, marginTop: 1 }} />
                    <span className="text-xs" style={{ color: COLORS.ink }}>{s.note}</span>
                  </div>
                )}
                {s.photo && (
                  <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 40, height: 40, background: '#F1F2EE' }}>
                    <Camera size={16} style={{ color: COLORS.muted }} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PhoneFrame({ children }) {
  return (
    <div className="overflow-hidden relative" style={{ width: 380, height: 780, background: COLORS.paper, borderRadius: 40, border: '10px solid #16231F', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
      <div className="flex items-center justify-between px-6 pt-3 pb-1 text-xs font-semibold" style={{ color: COLORS.ink }}><span>9:41</span><span>●●●</span></div>
      <div className="relative" style={{ height: 'calc(100% - 28px)' }}>{children}</div>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 p-6" style={{ background: '#DCE0DA' }}>
      <PhoneFrame><SalesRecord /></PhoneFrame>
      <p className="text-xs text-center max-w-xs" style={{ color: '#5b6660' }}>
        Every sale, all fields on the row (no tap-to-expand). Try the Cash/Credit/Quick filter, search a name, or the calendar for a date range. Note + photo show only when a sale has them.
      </p>
    </div>
  );
}
```
-e 
---

-e 
## Mockup — Refilling  (`bmg-refilling-section.jsx`)

```jsx
import React, { useState, useEffect } from 'react';
import { Search, ArrowLeft, Plus, Minus, Camera, Check, Clock, ChevronRight, Phone, User, Building2, Package, X, StickyNote, List } from 'lucide-react';

const COLORS = {
  paper: '#EEF0EC', ink: '#16231F', blue: '#2B6CB5', amber: '#C2540B',
  green: '#2F7A4D', red: '#B4232A', line: '#C9CDC3', muted: '#3f4a42',
  mutedLight: '#454e47', white: '#ffffff',
  // soft tints for sectioning / calm color
  blueTint: '#EDF3FA', greenTint: '#E9F4EE', amberTint: '#FBEEE4', paperTint: '#F4F6F1',
};

const brands = ['K-Gas', 'Total Gas', 'Afrigas', 'Pro Gas', 'Sea Gas', 'Rubis', 'Kobil', 'National Oil', 'G-Gas', 'Gold Gas', 'Others'];
const PHOTO_CAP = 3;

// PLACEHOLDER demo data (never ships).
const seedCompanies = [
  {
    id: 'c1', name: 'K-Gas Depot', code: 'KGD', director: 'James Mwaura', phone: '0722 114 500',
    batches: [
      {
        id: 'b1', batchId: 'KGD-11JUL26-01', sentDate: '11/07/2026', sentTime: '8:30 AM', daysOut: 8, sentPhotos: 2, sentNote: 'Driver: Peter. Lorry KDA 123J.',
        lines: [
          { brand: 'K-Gas', bigSent: 6, bigBack: 0, smallSent: 4, smallBack: 4 },
          { brand: 'Afrigas', bigSent: 2, bigBack: 0, smallSent: 0, smallBack: 0 },
        ],
        deliveries: [{ id: 'd1', batchId: 'KGD-11JUL26-01', company: 'K-Gas Depot', date: '14/07/2026', time: '10:20 AM', retLines: [{ brand: 'K-Gas', big: 0, small: 4 }], note: 'First lot back', cylPhotos: 1, receiptPhotos: 1 }],
      },
    ],
  },
  {
    id: 'c2', name: 'Total Depot', code: 'TTD', director: 'Alice Wambui', phone: '0733 220 118',
    batches: [],
  },
];

// Derive a 3-letter company code from the name (initials, fallback to first letters).
function deriveCode(name, existing) {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  let base = words.length >= 2 ? words.map(w => w[0]).join('').slice(0, 3) : name.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  base = base.padEnd(2, 'X');
  let code = base, n = 1;
  while (existing.includes(code)) { n += 1; code = base + n; }
  return code;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function makeBatchId(code, seqSameDay) {
  // Demo "today" = 19/07/2026. Real app uses the actual date.
  const d = 19, m = 'JUL', y = '26';
  return `${code}-${String(d).padStart(2, '0')}${m}${y}-${String(seqSameDay).padStart(2, '0')}`;
}

function lineOut(l) { return (l.bigSent - l.bigBack) + (l.smallSent - l.smallBack); }
function batchStillOut(b) { return b.lines.reduce((s, l) => s + lineOut(l), 0); }
function batchSentTotal(b) { return b.lines.reduce((s, l) => s + l.bigSent + l.smallSent, 0); }
function batchFullyBack(b) { return batchStillOut(b) === 0; }
function batchStatus(b) {
  if (batchFullyBack(b)) return 'back';
  const partly = b.lines.some(l => l.bigBack > 0 || l.smallBack > 0) || b.deliveries.length > 0;
  if (b.daysOut >= 7) return 'overdue';
  if (b.daysOut >= 3) return 'checkdue';
  return partly ? 'partial' : 'out';
}

function BigStepper({ value, onChange, min = 0, max = 999 }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="rounded-full flex items-center justify-center" style={{ width: 34, height: 34, background: '#F1F2EE', border: `1px solid ${COLORS.line}` }}><Minus size={16} style={{ color: COLORS.ink }} /></button>
      <span className="font-bold text-lg w-6 text-center" style={{ color: COLORS.ink }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="rounded-full flex items-center justify-center" style={{ width: 34, height: 34, background: COLORS.blue }}><Plus size={16} color="white" /></button>
    </div>
  );
}

function StatusChip({ status, big }) {
  const map = {
    out: { label: 'Out', bg: '#EEF1EC', color: COLORS.muted },
    partial: { label: 'Partly back', bg: COLORS.blueTint, color: COLORS.blue },
    checkdue: { label: 'Check on these', bg: COLORS.amberTint, color: COLORS.amber },
    overdue: { label: 'Overdue', bg: '#FDECEC', color: COLORS.red },
    back: { label: 'Back', bg: COLORS.greenTint, color: COLORS.green },
  };
  const s = map[status];
  return <span className={`rounded-full font-semibold ${big ? 'text-sm px-3 py-1' : 'text-xs px-2 py-0.5'}`} style={{ background: s.bg, color: s.color }}>{s.label}</span>;
}

function PhotoSlot({ label, count, setCount, required, tint }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: tint || COLORS.white, border: `1.5px ${count === 0 && required ? 'dashed' : 'solid'} ${count === 0 && required ? COLORS.amber : COLORS.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold" style={{ color: COLORS.ink }}>{label}</span>
        <span className="text-xs font-semibold" style={{ color: COLORS.mutedLight }}>{count}/{PHOTO_CAP}</span>
      </div>
      <div className="flex gap-2.5 flex-wrap">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-xl flex items-center justify-center relative" style={{ width: 56, height: 56, background: '#E7EAE4' }}>
            <Camera size={18} style={{ color: COLORS.muted }} />
            <button onClick={() => setCount(count - 1)} className="absolute -top-2 -right-2 rounded-full flex items-center justify-center" style={{ width: 20, height: 20, background: COLORS.ink }}><X size={12} color="white" /></button>
          </div>
        ))}
        {count < PHOTO_CAP && (
          <button onClick={() => setCount(count + 1)} className="rounded-xl flex items-center justify-center" style={{ width: 56, height: 56, background: COLORS.white, border: `1.5px dashed ${COLORS.line}` }}>
            <Plus size={20} style={{ color: COLORS.muted }} />
          </button>
        )}
      </div>
      {count === 0 && required && <p className="text-xs mt-2" style={{ color: COLORS.amber }}>At least one photo required.</p>}
    </div>
  );
}

function Toast({ msg }) {
  return (<div className="absolute left-4 right-4 rounded-xl px-4 py-3 flex items-center gap-2 z-40" style={{ bottom: 24, background: COLORS.ink }}><Check size={16} color="white" /><span className="text-sm text-white font-semibold">{msg}</span></div>);
}

function SectionLabel({ children, color }) {
  return <p className="text-xs uppercase tracking-widest font-bold mb-2.5" style={{ color: color || COLORS.muted }}>{children}</p>;
}

// ---------- COMPANY WALL ----------
function CompanyWall({ companies, onAddCompany, onOpen, search, setSearch }) {
  const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-2xl" style={{ color: COLORS.ink }}>Refilling</h1>
          <button onClick={onAddCompany} className="text-sm font-bold px-3.5 py-2 rounded-full" style={{ background: COLORS.ink, color: 'white' }}>Add new +</button>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
          <Search size={16} style={{ color: COLORS.mutedLight }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company…" className="flex-1 text-sm outline-none bg-transparent" style={{ color: COLORS.ink }} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {filtered.map(c => {
          const out = c.batches.reduce((s, b) => s + batchStillOut(b), 0);
          const activeBatches = c.batches.filter(b => !batchFullyBack(b)).length;
          const needsAttention = c.batches.some(b => ['checkdue', 'overdue'].includes(batchStatus(b)));
          return (
            <button key={c.id} onClick={() => onOpen(c)} className="w-full text-left mb-3 rounded-2xl p-5" style={{ background: COLORS.white, border: `1.5px solid ${needsAttention ? COLORS.amber : COLORS.line}` }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl flex items-center justify-center" style={{ width: 46, height: 46, background: COLORS.blueTint }}><Building2 size={22} style={{ color: COLORS.blue }} /></div>
                  <div><p className="font-bold text-lg" style={{ color: COLORS.ink }}>{c.name}</p><p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>{activeBatches} active batch{activeBatches === 1 ? '' : 'es'}</p></div>
                </div>
                {out > 0 && <div className="rounded-xl px-3 py-1.5 text-center" style={{ background: COLORS.amberTint }}><p className="font-bold text-lg" style={{ color: COLORS.amber }}>{out}</p><p className="text-xs" style={{ color: COLORS.amber }}>out</p></div>}
              </div>
              <div className="flex items-center gap-4 mt-4 pt-3" style={{ borderTop: `1px solid ${COLORS.line}` }}>
                <div className="flex items-center gap-1.5"><User size={14} style={{ color: COLORS.mutedLight }} /><span className="text-xs" style={{ color: COLORS.muted }}>{c.director}</span></div>
                <div className="flex items-center gap-1.5"><Phone size={14} style={{ color: COLORS.mutedLight }} /><span className="text-xs" style={{ color: COLORS.muted }}>{c.phone}</span></div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-sm mt-16" style={{ color: COLORS.mutedLight }}>No companies yet. Tap “Add new +”.</p>}
      </div>
    </div>
  );
}

function CreateCompany({ onCancel, onSave, existingCodes }) {
  const [name, setName] = useState(''); const [director, setDirector] = useState(''); const [phone, setPhone] = useState('');
  const ready = name.trim() && director.trim() && phone.trim();
  const previewCode = name.trim() ? deriveCode(name, existingCodes) : '—';
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <button onClick={onCancel} className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}><ArrowLeft size={22} style={{ color: COLORS.ink }} /></button>
        <h2 className="font-bold text-base" style={{ color: COLORS.ink }}>New refilling company</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pt-4">
        <p className="text-xs mb-3" style={{ color: COLORS.mutedLight }}>All three are required.</p>
        <label className="text-xs font-semibold" style={{ color: COLORS.muted }}>Company name</label>
        <div className="flex items-center gap-2 rounded-xl px-3 py-3.5 mt-1 mb-2" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}><Building2 size={16} style={{ color: COLORS.mutedLight }} /><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. K-Gas Depot" className="flex-1 text-sm outline-none bg-transparent" style={{ color: COLORS.ink }} /></div>
        <div className="rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between" style={{ background: COLORS.blueTint }}>
          <span className="text-xs" style={{ color: COLORS.blue }}>Auto code (used in batch IDs)</span>
          <span className="text-sm font-bold" style={{ color: COLORS.blue }}>{previewCode}</span>
        </div>
        <label className="text-xs font-semibold" style={{ color: COLORS.muted }}>Director</label>
        <div className="flex items-center gap-2 rounded-xl px-3 py-3.5 mt-1 mb-4" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}><User size={16} style={{ color: COLORS.mutedLight }} /><input value={director} onChange={e => setDirector(e.target.value)} placeholder="Director's name" className="flex-1 text-sm outline-none bg-transparent" style={{ color: COLORS.ink }} /></div>
        <label className="text-xs font-semibold" style={{ color: COLORS.muted }}>Director's phone</label>
        <div className="flex items-center gap-2 rounded-xl px-3 py-3.5 mt-1" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}><Phone size={16} style={{ color: COLORS.mutedLight }} /><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07xx xxx xxx" inputMode="tel" className="flex-1 text-sm outline-none bg-transparent" style={{ color: COLORS.ink }} /></div>
      </div>
      <div className="px-5 py-3" style={{ borderTop: `1px solid ${COLORS.line}` }}>
        <button onClick={() => ready && onSave({ name, director, phone })} disabled={!ready} className="w-full rounded-xl py-4 text-sm font-bold text-white" style={{ background: ready ? COLORS.green : COLORS.mutedLight }}>Create company tab</button>
      </div>
    </div>
  );
}

// ---------- COMPANY DETAIL ----------
function CompanyDetail({ company, onBack, onSend, onOpenBatch, onOpenRecord }) {
  const active = company.batches.filter(b => !batchFullyBack(b));
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <button onClick={onBack} className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}><ArrowLeft size={22} style={{ color: COLORS.ink }} /></button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-base truncate" style={{ color: COLORS.ink }}>{company.name}</h2>
          <div className="flex items-center gap-1.5"><span className="text-xs" style={{ color: COLORS.muted }}>{company.director}</span><span className="text-xs" style={{ color: COLORS.mutedLight }}>·</span><span className="text-xs" style={{ color: COLORS.muted }}>{company.phone}</span></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24">
        <button onClick={onOpenRecord} className="w-full mb-5 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold" style={{ background: COLORS.blueTint, color: COLORS.blue }}>
          <List size={16} /> View deliveries record
        </button>

        <SectionLabel color={COLORS.amber}>Current batches</SectionLabel>
        {active.length === 0 && <p className="text-sm mt-2" style={{ color: COLORS.mutedLight }}>No cylinders out right now.</p>}
        {active.map(b => {
          const status = batchStatus(b);
          const brandSummary = b.lines.map(l => l.brand).join(', ');
          return (
            <button key={b.id} onClick={() => onOpenBatch(b)} className="w-full text-left rounded-2xl p-5 mb-3" style={{ background: COLORS.white, border: `1.5px solid ${status === 'overdue' ? COLORS.red : status === 'checkdue' ? COLORS.amber : COLORS.line}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><Package size={17} style={{ color: COLORS.blue }} /><span className="text-sm font-bold" style={{ color: COLORS.ink }}>{b.batchId}</span></div>
                <StatusChip status={status} big />
              </div>
              <div className="rounded-xl px-3 py-2.5 mb-2" style={{ background: COLORS.paperTint }}>
                <p className="text-xs" style={{ color: COLORS.muted }}>{brandSummary}</p>
                <p className="text-lg font-bold mt-0.5" style={{ color: COLORS.amber }}>{batchStillOut(b)} still out <span className="text-xs font-normal" style={{ color: COLORS.mutedLight }}>of {batchSentTotal(b)}</span></p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><Clock size={12} style={{ color: COLORS.mutedLight }} /><span className="text-xs" style={{ color: COLORS.muted }}>Sent {b.sentDate} · {b.sentTime}</span></div>
                <ChevronRight size={18} style={{ color: COLORS.mutedLight }} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-5 py-3" style={{ background: COLORS.paper, borderTop: `1px solid ${COLORS.line}` }}>
        <button onClick={onSend} className="w-full rounded-xl py-4 text-sm font-bold text-white" style={{ background: COLORS.blue }}>Send cylinders +</button>
      </div>
    </div>
  );
}

// ---------- BATCH PAGE (roomy, sectioned, colored) ----------
function BatchPage({ batch, onBack, onReturn }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <button onClick={onBack} className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}><ArrowLeft size={22} style={{ color: COLORS.ink }} /></button>
        <div><h2 className="font-bold text-base" style={{ color: COLORS.ink }}>{batch.batchId}</h2><p className="text-xs" style={{ color: COLORS.mutedLight }}>Sent {batch.sentDate} · {batch.sentTime}</p></div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24">
        {/* status banner */}
        <div className="rounded-2xl p-4 mb-5 flex items-center justify-between" style={{ background: COLORS.paperTint }}>
          <div><p className="text-xs" style={{ color: COLORS.muted }}>Still out</p><p className="text-2xl font-bold" style={{ color: COLORS.amber }}>{batchStillOut(batch)}<span className="text-sm font-normal" style={{ color: COLORS.mutedLight }}> of {batchSentTotal(batch)}</span></p></div>
          <StatusChip status={batchStatus(batch)} big />
        </div>

        {/* cylinders — each brand its own roomy card */}
        <SectionLabel>Cylinders in this batch</SectionLabel>
        {batch.lines.map((l, i) => {
          const bigOut = l.bigSent - l.bigBack, smallOut = l.smallSent - l.smallBack;
          return (
            <div key={i} className="rounded-2xl p-4 mb-3" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              <p className="text-base font-bold mb-3" style={{ color: COLORS.ink }}>{l.brand}</p>
              <div className="flex gap-2.5">
                {l.bigSent > 0 && (
                  <div className="flex-1 rounded-xl p-3" style={{ background: bigOut > 0 ? COLORS.amberTint : COLORS.greenTint }}>
                    <p className="text-xs font-semibold" style={{ color: bigOut > 0 ? COLORS.amber : COLORS.green }}>Big</p>
                    <p className="text-lg font-bold mt-0.5" style={{ color: COLORS.ink }}>{l.bigBack}/{l.bigSent}</p>
                    <p className="text-xs" style={{ color: bigOut > 0 ? COLORS.amber : COLORS.green }}>{bigOut > 0 ? `${bigOut} still out` : 'all back'}</p>
                  </div>
                )}
                {l.smallSent > 0 && (
                  <div className="flex-1 rounded-xl p-3" style={{ background: smallOut > 0 ? COLORS.amberTint : COLORS.greenTint }}>
                    <p className="text-xs font-semibold" style={{ color: smallOut > 0 ? COLORS.amber : COLORS.green }}>Small</p>
                    <p className="text-lg font-bold mt-0.5" style={{ color: COLORS.ink }}>{l.smallBack}/{l.smallSent}</p>
                    <p className="text-xs" style={{ color: smallOut > 0 ? COLORS.amber : COLORS.green }}>{smallOut > 0 ? `${smallOut} still out` : 'all back'}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* sent photos + note, own sections */}
        <SectionLabel>When sent</SectionLabel>
        <div className="rounded-2xl p-4 mb-3 flex items-center gap-2" style={{ background: COLORS.blueTint }}>
          <Camera size={16} style={{ color: COLORS.blue }} /><span className="text-sm font-semibold" style={{ color: COLORS.blue }}>{batch.sentPhotos} photo{batch.sentPhotos > 1 ? 's' : ''} on send</span>
        </div>
        {batch.sentNote ? (
          <div className="rounded-2xl p-4 mb-3 flex items-start gap-2" style={{ background: COLORS.paperTint }}><StickyNote size={15} style={{ color: COLORS.muted, marginTop: 1 }} /><div><p className="text-xs font-semibold mb-0.5" style={{ color: COLORS.muted }}>Note</p><p className="text-sm" style={{ color: COLORS.ink }}>{batch.sentNote}</p></div></div>
        ) : null}

        {batch.deliveries.length > 0 && (
          <>
            <SectionLabel color={COLORS.green}>Returns so far</SectionLabel>
            {batch.deliveries.map(d => (
              <div key={d.id} className="rounded-2xl p-4 mb-2" style={{ background: COLORS.greenTint }}>
                <div className="flex items-center justify-between"><span className="text-sm font-bold" style={{ color: COLORS.green }}>{d.items}</span><span className="text-xs" style={{ color: COLORS.muted }}>{d.date} · {d.time}</span></div>
                {d.note ? <p className="text-sm mt-1" style={{ color: COLORS.ink }}>{d.note}</p> : null}
                <p className="text-xs mt-1.5" style={{ color: COLORS.muted }}>{d.cylPhotos} cylinder · {d.receiptPhotos} receipt photo</p>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-5 py-3" style={{ background: COLORS.paper, borderTop: `1px solid ${COLORS.line}` }}>
        <button onClick={onReturn} className="w-full rounded-xl py-4 text-sm font-bold text-white" style={{ background: COLORS.green }}>Mark as returned</button>
      </div>
    </div>
  );
}

// ---------- RETURN PAGE ----------
function ReturnPage({ batch, onCancel, onSave }) {
  const [ret, setRet] = useState(batch.lines.map(() => ({ big: 0, small: 0 })));
  const [cylPhotos, setCylPhotos] = useState(0);
  const [receiptPhotos, setReceiptPhotos] = useState(0);
  const [note, setNote] = useState('');
  function setR(i, field, v) { setRet(r => r.map((x, idx) => idx === i ? { ...x, [field]: v } : x)); }
  const anyReturning = ret.some(r => r.big > 0 || r.small > 0);
  const ready = anyReturning && cylPhotos > 0; // receipt optional; cylinder required

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <button onClick={onCancel} className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}><ArrowLeft size={22} style={{ color: COLORS.ink }} /></button>
        <h2 className="font-bold text-base" style={{ color: COLORS.ink }}>Mark returned</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
        <SectionLabel>What came back?</SectionLabel>
        {batch.lines.map((l, i) => {
          const bigOut = l.bigSent - l.bigBack, smallOut = l.smallSent - l.smallBack;
          if (bigOut === 0 && smallOut === 0) return (
            <div key={i} className="rounded-2xl p-4 mb-3 flex items-center justify-between" style={{ background: COLORS.greenTint }}><span className="text-base font-bold" style={{ color: COLORS.ink }}>{l.brand}</span><span className="text-sm font-semibold" style={{ color: COLORS.green }}>✓ all back</span></div>
          );
          return (
            <div key={i} className="rounded-2xl p-4 mb-3" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              <p className="text-base font-bold mb-3" style={{ color: COLORS.ink }}>{l.brand}</p>
              {bigOut > 0 && <div className="flex items-center justify-between mb-3 rounded-xl px-3 py-2.5" style={{ background: COLORS.paperTint }}><span className="text-sm" style={{ color: COLORS.muted }}>Big <span className="text-xs" style={{ color: COLORS.mutedLight }}>· {bigOut} out</span></span><BigStepper value={ret[i].big} onChange={v => setR(i, 'big', v)} min={0} max={bigOut} /></div>}
              {smallOut > 0 && <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: COLORS.paperTint }}><span className="text-sm" style={{ color: COLORS.muted }}>Small <span className="text-xs" style={{ color: COLORS.mutedLight }}>· {smallOut} out</span></span><BigStepper value={ret[i].small} onChange={v => setR(i, 'small', v)} min={0} max={smallOut} /></div>}
            </div>
          );
        })}

        <SectionLabel>Photos</SectionLabel>
        <div className="mb-2"><PhotoSlot label="Cylinders returned" count={cylPhotos} setCount={setCylPhotos} required tint={COLORS.paperTint} /></div>
        <div className="mb-1"><PhotoSlot label="Receipt" count={receiptPhotos} setCount={setReceiptPhotos} tint={COLORS.paperTint} /></div>
        <p className="text-xs mb-4 font-bold" style={{ color: COLORS.amber }}>Receipt photo is optional — but strongly recommended for your own proof.</p>

        <SectionLabel>Note (optional)</SectionLabel>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Anything worth remembering…" className="w-full rounded-xl px-3 py-3 text-sm outline-none resize-none" style={{ border: `1px solid ${COLORS.line}`, color: COLORS.ink }} />
      </div>

      <div className="px-5 py-3" style={{ borderTop: `1px solid ${COLORS.line}` }}>
        <button onClick={() => ready && onSave(ret, note, receiptPhotos)} disabled={!ready} className="w-full rounded-xl py-4 text-sm font-bold text-white" style={{ background: ready ? COLORS.green : COLORS.mutedLight }}>Confirm return</button>
        {!ready && <p className="text-center text-xs mt-1.5" style={{ color: COLORS.mutedLight }}>Set what returned + a cylinder photo.</p>}
      </div>
    </div>
  );
}

// ---------- SEND PAGE (all brands, inline Big/Small, photos at bottom) ----------
function SendCylinders({ company, onCancel, onSave }) {
  const [qty, setQty] = useState(() => Object.fromEntries(brands.map(b => [b, { big: 0, small: 0 }])));
  const [cylPhotos, setCylPhotos] = useState(0);
  const [note, setNote] = useState('');

  function setQ(brand, field, v) { setQty(q => ({ ...q, [brand]: { ...q[brand], [field]: v } })); }
  const total = brands.reduce((s, b) => s + qty[b].big + qty[b].small, 0);
  const ready = total > 0 && cylPhotos > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <button onClick={onCancel} className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}><ArrowLeft size={22} style={{ color: COLORS.ink }} /></button>
        <h2 className="font-bold text-base" style={{ color: COLORS.ink }}>New batch — {company.name}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
        <SectionLabel>Cylinders going out</SectionLabel>
        <p className="text-xs mb-3" style={{ color: COLORS.mutedLight }}>Set quantities on whatever's going. Leave the rest at zero.</p>
        {brands.map(b => {
          const active = qty[b].big > 0 || qty[b].small > 0;
          return (
            <div key={b} className="rounded-2xl p-4 mb-2.5" style={{ background: active ? COLORS.blueTint : COLORS.white, border: `1.5px solid ${active ? COLORS.blue : COLORS.line}` }}>
              <p className="text-base font-bold mb-3" style={{ color: COLORS.ink }}>{b}</p>
              <div className="flex items-center justify-between mb-2.5"><span className="text-sm" style={{ color: COLORS.muted }}>Big</span><BigStepper value={qty[b].big} onChange={v => setQ(b, 'big', v)} /></div>
              <div className="flex items-center justify-between"><span className="text-sm" style={{ color: COLORS.muted }}>Small</span><BigStepper value={qty[b].small} onChange={v => setQ(b, 'small', v)} /></div>
            </div>
          );
        })}

        <div className="rounded-2xl p-4 my-4 flex items-center justify-between" style={{ background: COLORS.paperTint }}>
          <span className="text-sm font-semibold" style={{ color: COLORS.muted }}>Total cylinders</span>
          <span className="font-bold text-xl" style={{ color: COLORS.ink }}>{total}</span>
        </div>

        <SectionLabel>Photo of cylinders (required)</SectionLabel>
        <div className="mb-4"><PhotoSlot label="Cylinders sent" count={cylPhotos} setCount={setCylPhotos} required tint={COLORS.paperTint} /></div>

        <SectionLabel>Note (optional)</SectionLabel>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Driver, lorry, anything worth noting…" className="w-full rounded-xl px-3 py-3 text-sm outline-none resize-none" style={{ border: `1px solid ${COLORS.line}`, color: COLORS.ink }} />
      </div>

      <div className="px-5 py-3" style={{ borderTop: `1px solid ${COLORS.line}` }}>
        <button onClick={() => ready && onSave(qty, note)} disabled={!ready} className="w-full rounded-xl py-4 text-sm font-bold text-white" style={{ background: ready ? COLORS.green : COLORS.mutedLight }}>Save batch</button>
        <p className="text-center text-xs mt-1.5" style={{ color: COLORS.mutedLight }}>Reminder set: check on this batch in 3 days.</p>
      </div>
    </div>
  );
}

// ---------- DELIVERIES RECORD ----------
function DeliveriesRecord({ company, onBack }) {
  const all = company.batches.flatMap(b => b.deliveries.map(d => ({ ...d, batchSent: b.sentDate }))).sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
        <button onClick={onBack} className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}><ArrowLeft size={22} style={{ color: COLORS.ink }} /></button>
        <div><h2 className="font-bold text-base" style={{ color: COLORS.ink }}>Deliveries record</h2><p className="text-xs" style={{ color: COLORS.mutedLight }}>{company.name} · newest first</p></div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        <p className="text-xs mb-4" style={{ color: COLORS.mutedLight }}>Every return, newest first. The batch ID ties partial returns of the same batch together.</p>
        {all.length === 0 ? <p className="text-center text-sm mt-16" style={{ color: COLORS.mutedLight }}>No deliveries recorded yet.</p> : all.map(d => (
          <div key={d.id} className="mb-3 rounded-2xl overflow-hidden" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
            {/* batch ID + company banner — the correlation anchor */}
            <div className="px-4 py-3" style={{ background: COLORS.blueTint }}>
              <div className="flex items-center gap-2"><Package size={14} style={{ color: COLORS.blue }} /><span className="text-sm font-bold" style={{ color: COLORS.blue }}>{d.batchId}</span></div>
              <div className="flex items-center gap-1.5 mt-1"><Building2 size={12} style={{ color: COLORS.blue }} /><span className="text-xs font-semibold" style={{ color: COLORS.blue }}>{d.company}</span></div>
            </div>

            <div className="p-4">
              {/* what came back — each brand its own slot, Big/Small split */}
              <p className="text-xs font-semibold mb-2" style={{ color: COLORS.muted }}>Returned</p>
              {d.retLines.map((r, i) => (
                <div key={i} className="rounded-xl p-3 mb-2" style={{ background: COLORS.greenTint }}>
                  <p className="text-sm font-bold mb-1" style={{ color: COLORS.ink }}>{r.brand}</p>
                  <div className="flex gap-2">
                    {r.big > 0 && <span className="text-sm font-semibold rounded-lg px-2.5 py-1" style={{ background: COLORS.white, color: COLORS.green }}>{r.big} Big</span>}
                    {r.small > 0 && <span className="text-sm font-semibold rounded-lg px-2.5 py-1" style={{ background: COLORS.white, color: COLORS.green }}>{r.small} Small</span>}
                  </div>
                </div>
              ))}

              {/* when */}
              <div className="flex items-center gap-1.5 mt-2"><Clock size={13} style={{ color: COLORS.mutedLight }} /><span className="text-sm" style={{ color: COLORS.muted }}>{d.date} · {d.time}</span></div>

              {/* note */}
              {d.note ? (
                <div className="mt-3 rounded-xl p-3 flex items-start gap-2" style={{ background: COLORS.paperTint }}><StickyNote size={14} style={{ color: COLORS.muted, marginTop: 1 }} /><div><p className="text-xs font-semibold mb-0.5" style={{ color: COLORS.muted }}>Note</p><p className="text-sm" style={{ color: COLORS.ink }}>{d.note}</p></div></div>
              ) : null}

              {/* viewable photos */}
              <p className="text-xs font-semibold mt-3 mb-1.5" style={{ color: COLORS.muted }}>Photos — tap to view</p>
              <div className="flex gap-2 flex-wrap">
                {Array.from({ length: d.cylPhotos }).map((_, i) => (
                  <button key={'c' + i} className="rounded-xl flex flex-col items-center justify-center" style={{ width: 52, height: 52, background: '#E7EAE4' }}><Camera size={16} style={{ color: COLORS.muted }} /><span style={{ fontSize: 8, color: COLORS.mutedLight }}>cyl</span></button>
                ))}
                {d.receiptPhotos > 0 ? Array.from({ length: d.receiptPhotos }).map((_, i) => (
                  <button key={'r' + i} className="rounded-xl flex flex-col items-center justify-center" style={{ width: 52, height: 52, background: '#E7EAE4' }}><Camera size={16} style={{ color: COLORS.muted }} /><span style={{ fontSize: 8, color: COLORS.mutedLight }}>receipt</span></button>
                )) : <span className="text-xs self-center" style={{ color: COLORS.mutedLight }}>No receipt photo</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhoneFrame({ children }) {
  return (<div className="overflow-hidden relative" style={{ width: 380, height: 780, background: COLORS.paper, borderRadius: 40, border: '10px solid #16231F', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}><div className="flex items-center justify-between px-6 pt-3 pb-1 text-xs font-semibold" style={{ color: COLORS.ink }}><span>9:41</span><span>●●●</span></div><div className="relative" style={{ height: 'calc(100% - 28px)' }}>{children}</div></div>);
}

export default function App() {
  const [companies, setCompanies] = useState(seedCompanies);
  const [search, setSearch] = useState('');
  const [view, setView] = useState({ screen: 'wall' });
  const [toast, setToast] = useState(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); } }, [toast]);

  const openCompany = view.company ? companies.find(c => c.id === view.company.id) : null;
  const openBatch = openCompany && view.batch ? openCompany.batches.find(b => b.id === view.batch.id) : null;

  function createCompany(data) {
    const existing = companies.map(c => c.code);
    const code = deriveCode(data.name, existing);
    setCompanies(cs => [...cs, { id: 'c' + Date.now(), code, ...data, batches: [] }]);
    setView({ screen: 'wall' }); setToast(`Company created · code ${code}`);
  }

  function sendBatch(qty, note) {
    const lines = brands.filter(b => qty[b].big > 0 || qty[b].small > 0).map(b => ({ brand: b, bigSent: qty[b].big, bigBack: 0, smallSent: qty[b].small, smallBack: 0 }));
    // sequence = how many batches this company already sent "today" (demo: +1)
    const sameDay = openCompany.batches.filter(b => b.sentTime === 'Just now').length + 1;
    const batchId = makeBatchId(openCompany.code, sameDay);
    const nb = { id: 'b' + Date.now(), batchId, sentDate: '19/07/2026', sentTime: 'Just now', daysOut: 0, sentPhotos: 1, sentNote: note, lines, deliveries: [] };
    setCompanies(cs => cs.map(c => c.id === openCompany.id ? { ...c, batches: [nb, ...c.batches] } : c));
    setView({ screen: 'detail', company: openCompany }); setToast('Batch sent · reminder in 3 days');
  }

  function confirmReturn(ret, note, receiptPhotos) {
    const retLines = openBatch.lines.map((l, i) => ({ brand: l.brand, big: ret[i].big, small: ret[i].small })).filter(r => r.big > 0 || r.small > 0);
    setCompanies(cs => cs.map(c => {
      if (c.id !== openCompany.id) return c;
      return { ...c, batches: c.batches.map(b => {
        if (b.id !== openBatch.id) return b;
        const lines = b.lines.map((l, i) => ({ ...l, bigBack: l.bigBack + ret[i].big, smallBack: l.smallBack + ret[i].small }));
        const delivery = { id: 'd' + Date.now(), batchId: openBatch.batchId, company: openCompany.name, date: '19/07/2026', time: 'Just now', retLines, note, cylPhotos: 1, receiptPhotos };
        return { ...b, lines, deliveries: [delivery, ...b.deliveries] };
      }) };
    }));
    setView({ screen: 'detail', company: openCompany }); setToast('Return recorded · added to stock');
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 p-6" style={{ background: '#DCE0DA' }}>
      <PhoneFrame>
        {view.screen === 'wall' && <CompanyWall companies={companies} search={search} setSearch={setSearch} onAddCompany={() => setView({ screen: 'create' })} onOpen={(c) => setView({ screen: 'detail', company: c })} />}
        {view.screen === 'create' && <CreateCompany onCancel={() => setView({ screen: 'wall' })} onSave={createCompany} existingCodes={companies.map(c => c.code)} />}
        {view.screen === 'detail' && openCompany && <CompanyDetail company={openCompany} onBack={() => setView({ screen: 'wall' })} onSend={() => setView({ screen: 'send', company: openCompany })} onOpenBatch={(b) => setView({ screen: 'batch', company: openCompany, batch: b })} onOpenRecord={() => setView({ screen: 'record', company: openCompany })} />}
        {view.screen === 'batch' && openBatch && <BatchPage batch={openBatch} onBack={() => setView({ screen: 'detail', company: openCompany })} onReturn={() => setView({ screen: 'return', company: openCompany, batch: openBatch })} />}
        {view.screen === 'return' && openBatch && <ReturnPage batch={openBatch} onCancel={() => setView({ screen: 'batch', company: openCompany, batch: openBatch })} onSave={confirmReturn} />}
        {view.screen === 'send' && openCompany && <SendCylinders company={openCompany} onCancel={() => setView({ screen: 'detail', company: openCompany })} onSave={sendBatch} />}
        {view.screen === 'record' && openCompany && <DeliveriesRecord company={openCompany} onBack={() => setView({ screen: 'detail', company: openCompany })} />}
        {toast && <Toast msg={toast} />}
      </PhoneFrame>
      <p className="text-xs text-center max-w-xs" style={{ color: '#5b6660' }}>
        Send = one page, all brands with Big/Small inputs, photos at the bottom, Save = one batch. Batch page & return page are roomier with sectioned, colored cards.
      </p>
    </div>
  );
}
```
-e 
---

-e 
## Mockup — Reports / KPIs  (`bmg-reports-section.jsx`)

```jsx
import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, Flame, AlertCircle, ChevronRight, Calendar } from 'lucide-react';

const COLORS = {
  paper: '#EEF0EC', ink: '#16231F', blue: '#2B6CB5', amber: '#C2540B',
  green: '#2F7A4D', red: '#B4232A', line: '#C9CDC3', muted: '#3f4a42',
  mutedLight: '#454e47', white: '#ffffff',
  blueTint: '#EDF3FA', greenTint: '#E9F4EE', amberTint: '#FBEEE4', paperTint: '#F4F6F1',
};

// ---- PLACEHOLDER demo data (never ships). Real values are computed from actual sales/debts. ----
const revenueByRange = { today: 8450, week: 61200, month: 248900 };
const outstandingMoney = 7450;
const outstandingEmpties = 9;

// credit-reliance trend: % of sales value on credit, per period
const creditTrend = {
  week: [
    { label: 'Mon', pct: 22 }, { label: 'Tue', pct: 31 }, { label: 'Wed', pct: 28 },
    { label: 'Thu', pct: 44 }, { label: 'Fri', pct: 39 }, { label: 'Sat', pct: 52 }, { label: 'Sun', pct: 35 },
  ],
  month: [
    { label: 'Wk1', pct: 26 }, { label: 'Wk2', pct: 33 }, { label: 'Wk3', pct: 41 }, { label: 'Wk4', pct: 47 },
  ],
};

const topDebtors = [
  { name: 'Musa Ali', amount: 2100 },
  { name: 'Wanjiru Mwangi', amount: 1750 },
  { name: 'Otieno K.', amount: 1000 },
  { name: 'Grace N.', amount: 1150 },
];

// best sellers — both quantity and revenue available
const sellers = [
  { name: 'K-Gas · Small', qty: 42, revenue: 48300 },
  { name: 'Total · Big', qty: 28, revenue: 61600 },
  { name: 'Safaricom airtime', qty: 190, revenue: 18050 },
  { name: 'Afrigas · Big', qty: 14, revenue: 29400 },
  { name: 'Double burner stove', qty: 3, revenue: 4500 },
  { name: 'Mini-cylinder grill', qty: 2, revenue: 1800 },
];

const busiestDays = [
  { day: 'Mon', sales: 18 }, { day: 'Tue', sales: 24 }, { day: 'Wed', sales: 21 },
  { day: 'Thu', sales: 30 }, { day: 'Fri', sales: 38 }, { day: 'Sat', sales: 46 }, { day: 'Sun', sales: 15 },
];

// Slow payers: average days between debt-taken and full settlement, per customer.
// avgDays = simple average of days-to-clear across FULLY SETTLED debts (each counts once).
// A debt's days-to-clear = final (zeroing) payment date − date taken.
// settledCount = how many settled debts the average is based on (null = none yet → no average).
// owesNow / overdue = current standing, a SEPARATE signal from historical settle-speed.
const slowPayers = [
  { name: 'Musa Ali', avgDays: 19, settledCount: 6, purchases: 8, owesNow: 2100, overdue: true },
  { name: 'Otieno K.', avgDays: 14, settledCount: 4, purchases: 5, owesNow: 1000, overdue: false },
  { name: 'Wanjiru Mwangi', avgDays: 9, settledCount: 20, purchases: 22, owesNow: 1750, overdue: false },
  { name: 'Grace N.', avgDays: 4, settledCount: 11, purchases: 12, owesNow: 0, overdue: false },
  { name: 'New — Juma', avgDays: null, settledCount: 0, purchases: 1, owesNow: 500, overdue: false },
];

// Outstanding money broken down by what kind of thing the debt was for.
const debtByCommodity = [
  { type: 'Cylinders', amount: 5350, color: '#2B6CB5' },
  { type: 'Cookers', amount: 1500, color: '#C2540B' },
  { type: 'Airtime', amount: 400, color: '#2F7A4D' },
  { type: 'Burners', amount: 200, color: '#7c5cbf' },
];

function RangeToggle({ range, setRange }) {
  return (
    <div className="flex rounded-xl p-1" style={{ background: '#E4E7DF' }}>
      {[['today', 'Today'], ['week', 'Week'], ['month', 'Month']].map(([k, label]) => (
        <button key={k} onClick={() => setRange(k)} className="flex-1 rounded-lg py-1.5 text-xs font-bold" style={{ background: range === k ? COLORS.white : 'transparent', color: range === k ? COLORS.ink : COLORS.muted }}>{label}</button>
      ))}
    </div>
  );
}

function SectionLabel({ children, color }) {
  return <p className="text-xs uppercase tracking-widest font-bold mb-2.5 mt-5" style={{ color: color || COLORS.muted }}>{children}</p>;
}

// simple bar chart (vertical)
function BarChart({ data, valueKey, labelKey, color, format }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height: 120 }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
          <span className="text-xs font-bold mb-1" style={{ color: COLORS.ink, fontSize: 9 }}>{format ? format(d[valueKey]) : d[valueKey]}</span>
          <div className="w-full rounded-t-md" style={{ height: `${(d[valueKey] / max) * 80}%`, background: color, minHeight: 4 }} />
          <span className="text-xs mt-1" style={{ color: COLORS.muted, fontSize: 9 }}>{d[labelKey]}</span>
        </div>
      ))}
    </div>
  );
}

// horizontal ranked bars
function RankedBars({ data, valueKey, labelKey, color, format }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-sm" style={{ color: COLORS.ink }}>{d[labelKey]}</span>
            <span className="text-sm font-bold" style={{ color: COLORS.ink }}>{format ? format(d[valueKey]) : d[valueKey]}</span>
          </div>
          <div className="w-full rounded-full" style={{ height: 8, background: '#E4E7DF' }}>
            <div className="rounded-full" style={{ height: 8, width: `${(d[valueKey] / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PhoneFrame({ children }) {
  return (<div className="overflow-hidden relative" style={{ width: 380, height: 780, background: COLORS.paper, borderRadius: 40, border: '10px solid #16231F', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}><div className="flex items-center justify-between px-6 pt-3 pb-1 text-xs font-semibold" style={{ color: COLORS.ink }}><span>9:41</span><span>●●●</span></div><div className="relative" style={{ height: 'calc(100% - 28px)' }}>{children}</div></div>);
}

export default function App() {
  const [range, setRange] = useState('week');
  const [sellerMetric, setSellerMetric] = useState('qty'); // qty | revenue
  const [sellerEnd, setSellerEnd] = useState('best'); // best | slow

  const trend = creditTrend[range === 'today' ? 'week' : range];
  const avgCredit = Math.round(trend.reduce((s, d) => s + d.pct, 0) / trend.length);

  const sortedSellers = [...sellers].sort((a, b) => sellerEnd === 'best' ? b[sellerMetric] - a[sellerMetric] : a[sellerMetric] - b[sellerMetric]).slice(0, 4);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 p-6" style={{ background: '#DCE0DA' }}>
      <PhoneFrame>
        <div className="flex flex-col h-full">
          <div className="px-5 pt-5 pb-2">
            <h1 className="font-bold text-2xl" style={{ color: COLORS.ink }}>Reports</h1>
            <div className="mt-3"><RangeToggle range={range} setRange={setRange} /></div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-8">
            {/* Headline numbers */}
            <div className="flex gap-2 mt-3">
              <div className="flex-1 rounded-2xl p-4" style={{ background: COLORS.greenTint }}>
                <div className="flex items-center gap-1.5"><TrendingUp size={14} style={{ color: COLORS.green }} /><span className="text-xs font-semibold" style={{ color: COLORS.green }}>Revenue</span></div>
                <p className="font-bold text-xl mt-1" style={{ color: COLORS.ink }}>KSh {revenueByRange[range].toLocaleString()}</p>
                <p className="text-xs font-semibold" style={{ color: COLORS.green }}>{range === 'today' ? 'today' : range === 'week' ? 'this week' : 'this month'}</p>
              </div>
              <div className="flex-1 rounded-2xl p-4" style={{ background: COLORS.amberTint }}>
                <div className="flex items-center gap-1.5"><Wallet size={14} style={{ color: COLORS.amber }} /><span className="text-xs font-semibold" style={{ color: COLORS.amber }}>Outstanding</span></div>
                <p className="font-bold text-xl mt-1" style={{ color: COLORS.ink }}>KSh {outstandingMoney.toLocaleString()}</p>
                <p className="text-xs font-semibold" style={{ color: COLORS.amber }}>owed now · all time</p>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1.5 px-1">
              <Flame size={11} style={{ color: COLORS.amber }} /><span className="text-xs" style={{ color: COLORS.muted }}>{outstandingEmpties} empties also owed (all time)</span>
            </div>

            {/* COLLECTIONS HALF */}
            <SectionLabel color={COLORS.amber}>Credit reliance</SectionLabel>
            <div className="rounded-2xl p-4" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm" style={{ color: COLORS.muted }}>Share of sales on credit</span>
                <span className="text-lg font-bold" style={{ color: avgCredit >= 40 ? COLORS.red : avgCredit >= 30 ? COLORS.amber : COLORS.green }}>{avgCredit}%</span>
              </div>
              <p className="text-xs mb-3" style={{ color: COLORS.mutedLight }}>Average over the {range === 'month' ? 'month' : 'week'}. Rising credit = watch collections.</p>
              <BarChart data={trend} valueKey="pct" labelKey="label" color={COLORS.amber} format={v => `${v}%`} />
            </div>

            <SectionLabel color={COLORS.amber}>Top debtors</SectionLabel>
            <div className="rounded-2xl p-4" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              {topDebtors.sort((a, b) => b.amount - a.amount).map((d, i) => (
                <button key={i} className="w-full flex items-center justify-between py-2" style={{ borderBottom: i < topDebtors.length - 1 ? `1px solid ${COLORS.line}` : 'none' }}>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full flex items-center justify-center text-xs font-bold" style={{ width: 22, height: 22, background: COLORS.amberTint, color: COLORS.amber }}>{i + 1}</span>
                    <span className="text-sm font-semibold" style={{ color: COLORS.ink }}>{d.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold" style={{ color: COLORS.amber }}>KSh {d.amount.toLocaleString()}</span>
                    <ChevronRight size={15} style={{ color: COLORS.mutedLight }} />
                  </div>
                </button>
              ))}
            </div>

            <SectionLabel color={COLORS.amber}>What's owed for</SectionLabel>
            <div className="rounded-2xl p-4" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              <p className="text-xs mb-3" style={{ color: COLORS.mutedLight }}>The outstanding money, split by what the debt was for.</p>
              {(() => {
                const totalDebt = debtByCommodity.reduce((s, d) => s + d.amount, 0);
                return (
                  <>
                    {/* stacked proportion bar */}
                    <div className="flex w-full rounded-full overflow-hidden mb-3" style={{ height: 12 }}>
                      {debtByCommodity.map((d, i) => (
                        <div key={i} style={{ width: `${(d.amount / totalDebt) * 100}%`, background: d.color }} />
                      ))}
                    </div>
                    {debtByCommodity.sort((a, b) => b.amount - a.amount).map((d, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: i < debtByCommodity.length - 1 ? `1px solid ${COLORS.line}` : 'none' }}>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full" style={{ width: 10, height: 10, background: d.color }} />
                          <span className="text-sm" style={{ color: COLORS.ink }}>{d.type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: COLORS.ink }}>KSh {d.amount.toLocaleString()}</span>
                          <span className="text-xs w-9 text-right" style={{ color: COLORS.mutedLight }}>{Math.round((d.amount / totalDebt) * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>

            <SectionLabel color={COLORS.amber}>Slow payers</SectionLabel>
            <div className="rounded-2xl p-4" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              <p className="text-xs mb-3" style={{ color: COLORS.mutedLight }}>Two things per person: how long they take to clear a debt (averaged over settled debts), and whether they owe anything right now. Purchases give context.</p>
              {[...slowPayers].sort((a, b) => (b.avgDays ?? -1) - (a.avgDays ?? -1)).map((p, i, arr) => (
                <div key={i} className="py-2.5" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.line}` : 'none' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: COLORS.ink }}>{p.name}</span>
                    {p.avgDays === null
                      ? <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: COLORS.paperTint, color: COLORS.mutedLight }}>no settled debts yet</span>
                      : <span className="text-sm font-bold rounded-lg px-2 py-0.5" style={{ background: p.avgDays >= 14 ? COLORS.amberTint : COLORS.paperTint, color: p.avgDays >= 14 ? COLORS.amber : COLORS.muted }}>{p.avgDays} days avg</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs" style={{ color: COLORS.mutedLight }}>{p.purchases} buys</span>
                    {p.avgDays !== null && <span className="text-xs" style={{ color: COLORS.mutedLight }}>· from {p.settledCount} settled</span>}
                    {p.owesNow > 0 && (
                      <span className="text-xs font-semibold rounded-full px-2 py-0.5 ml-auto" style={{ background: p.overdue ? '#FDECEC' : COLORS.amberTint, color: p.overdue ? COLORS.red : COLORS.amber }}>
                        {p.overdue ? 'overdue now' : 'owes now'} · KSh {p.owesNow.toLocaleString()}
                      </span>
                    )}
                    {p.owesNow === 0 && <span className="text-xs font-semibold rounded-full px-2 py-0.5 ml-auto" style={{ background: COLORS.greenTint, color: COLORS.green }}>clear</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* BUSINESS HEALTH HALF */}
            <SectionLabel color={COLORS.blue}>Best sellers & slow movers</SectionLabel>
            <div className="rounded-2xl p-4" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              <div className="flex gap-2 mb-3">
                <div className="flex rounded-lg p-0.5 flex-1" style={{ background: '#E4E7DF' }}>
                  {[['best', 'Best'], ['slow', 'Slow']].map(([k, l]) => (
                    <button key={k} onClick={() => setSellerEnd(k)} className="flex-1 rounded-md py-1 text-xs font-bold" style={{ background: sellerEnd === k ? COLORS.white : 'transparent', color: sellerEnd === k ? COLORS.ink : COLORS.muted }}>{l}</button>
                  ))}
                </div>
                <div className="flex rounded-lg p-0.5 flex-1" style={{ background: '#E4E7DF' }}>
                  {[['qty', 'Qty'], ['revenue', 'Revenue']].map(([k, l]) => (
                    <button key={k} onClick={() => setSellerMetric(k)} className="flex-1 rounded-md py-1 text-xs font-bold" style={{ background: sellerMetric === k ? COLORS.white : 'transparent', color: sellerMetric === k ? COLORS.ink : COLORS.muted }}>{l}</button>
                  ))}
                </div>
              </div>
              <RankedBars data={sortedSellers} valueKey={sellerMetric} labelKey="name" color={sellerEnd === 'best' ? COLORS.blue : COLORS.mutedLight} format={v => sellerMetric === 'revenue' ? `KSh ${v.toLocaleString()}` : v} />
            </div>

            <SectionLabel color={COLORS.blue}>Busiest days</SectionLabel>
            <div className="rounded-2xl p-4" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              <BarChart data={busiestDays} valueKey="sales" labelKey="day" color={COLORS.blue} />
            </div>

            <div className="rounded-xl p-3 mt-5 flex items-start gap-2" style={{ background: COLORS.paperTint }}>
              <AlertCircle size={14} style={{ color: COLORS.mutedLight, marginTop: 1 }} />
              <p className="text-xs" style={{ color: COLORS.muted }}>These are descriptive figures from your own records — revenue and cash flow, not profit (cost prices aren't tracked yet).</p>
            </div>
          </div>
        </div>
      </PhoneFrame>

      <p className="text-xs text-center max-w-xs" style={{ color: '#5b6660' }}>
        Balanced overview: revenue + outstanding up top, then collections (credit reliance, top debtors), then health (best/slow sellers with Qty/Revenue toggle, busiest days). Descriptive only.
      </p>
    </div>
  );
}
```
-e 
---

-e 
## Mockup — Settings / Catalog  (`bmg-settings-section.jsx`)

```jsx
import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, Plus, Minus, X, Search, Bell, Cloud, CloudUpload, Trash2, Smartphone, Package2, Boxes, Building2, Check, Edit3, AlertCircle, Clock } from 'lucide-react';

const COLORS = {
  paper: '#EEF0EC', ink: '#16231F', blue: '#2B6CB5', amber: '#C2540B',
  green: '#2F7A4D', red: '#B4232A', line: '#C9CDC3', muted: '#3f4a42',
  mutedLight: '#454e47', white: '#ffffff',
  blueTint: '#EDF3FA', greenTint: '#E9F4EE', amberTint: '#FBEEE4', paperTint: '#F4F6F1',
};

// ---- SEED catalog (REAL data — ships pre-loaded, editable here). ----
const seedCatalog = {
  cylinderBrands: ['K-Gas', 'Total Gas', 'Afrigas', 'Pro Gas', 'Sea Gas', 'Rubis', 'Kobil', 'National Oil', 'G-Gas', 'Gold Gas', 'Others'],
  cylinderSizes: ['Small', 'Big'],
  airtimeSuppliers: ['Safaricom', 'Airtel'],
  airtimeDenoms: ['10', '20', '50', '100'],
  burnerBrands: ['Skytec', 'PineGas', 'Orgaz', 'Cosco'],
  cookerTypes: ['Mini-cylinder grill', 'Double burner stove'],
};

// ---- PLACEHOLDER (never ships) ----
const seedCompanyCodes = [
  { code: 'KGD', name: 'K-Gas Depot' },
  { code: 'TTD', name: 'Total Depot' },
];

function Row({ icon, label, sub, onClick, danger }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5" style={{ background: COLORS.white }}>
      <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 38, height: 38, background: danger ? '#FDECEC' : COLORS.paperTint }}>{icon}</div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: danger ? COLORS.red : COLORS.ink }}>{label}</p>
        {sub && <p className="text-xs truncate" style={{ color: COLORS.mutedLight }}>{sub}</p>}
      </div>
      <ChevronRight size={18} style={{ color: COLORS.mutedLight }} />
    </button>
  );
}

function GroupCard({ children }) {
  return <div className="rounded-2xl overflow-hidden mb-4" style={{ border: `1px solid ${COLORS.line}` }}>{children}</div>;
}
function Divider() { return <div style={{ height: 1, background: COLORS.line, marginLeft: 56 }} />; }
function SectionLabel({ children }) { return <p className="text-xs uppercase tracking-widest font-bold mb-2 px-1" style={{ color: COLORS.muted }}>{children}</p>; }

function Header({ title, onBack }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: `1px solid ${COLORS.line}` }}>
      {onBack && <button onClick={onBack} className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: '#F1F2EE' }}><ArrowLeft size={22} style={{ color: COLORS.ink }} /></button>}
      <h2 className="font-bold text-base" style={{ color: COLORS.ink }}>{title}</h2>
    </div>
  );
}

// ---------- EDITABLE LIST (used by all catalog editors) ----------
function EditableList({ title, items, setItems, onBack, note, readOnly }) {
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState('');
  function add() { const v = val.trim(); if (v && !items.includes(v)) { setItems([...items, v]); } setVal(''); setAdding(false); }
  return (
    <div className="flex flex-col h-full">
      <Header title={title} onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        {note && <div className="rounded-xl p-3 mb-4 flex items-start gap-2" style={{ background: COLORS.paperTint }}><AlertCircle size={14} style={{ color: COLORS.mutedLight, marginTop: 1 }} /><p className="text-xs" style={{ color: COLORS.muted }}>{note}</p></div>}
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${COLORS.line}` }}>
          {items.map((it, i) => (
            <div key={i}>
              <div className="flex items-center gap-3 px-4 py-3" style={{ background: COLORS.white }}>
                <span className="flex-1 text-sm" style={{ color: COLORS.ink }}>{it}</span>
                {!readOnly && <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="rounded-full flex items-center justify-center" style={{ width: 28, height: 28, background: '#FDECEC' }}><Trash2 size={14} style={{ color: COLORS.red }} /></button>}
              </div>
              {i < items.length - 1 && <div style={{ height: 1, background: COLORS.line }} />}
            </div>
          ))}
        </div>

        {!readOnly && (adding ? (
          <div className="mt-3 flex items-center gap-2">
            <input autoFocus value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Type a name…" className="flex-1 rounded-xl px-3 py-3 text-sm outline-none" style={{ border: `1px solid ${COLORS.blue}`, color: COLORS.ink }} />
            <button onClick={add} className="rounded-xl px-4 py-3 text-sm font-bold text-white" style={{ background: COLORS.green }}>Add</button>
            <button onClick={() => { setAdding(false); setVal(''); }} className="rounded-xl px-3 py-3" style={{ background: '#F1F2EE' }}><X size={16} style={{ color: COLORS.ink }} /></button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="mt-3 w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-1.5" style={{ background: COLORS.blueTint, color: COLORS.blue }}><Plus size={16} /> Add new</button>
        ))}
      </div>
    </div>
  );
}

// ---------- CATALOG HUB ----------
function CatalogHub({ catalog, onOpen, onBack }) {
  const entries = [
    ['cylinderBrands', 'Cylinder brands', `${catalog.cylinderBrands.length} brands`, <Package2 size={18} style={{ color: COLORS.blue }} />],
    ['cylinderSizes', 'Cylinder sizes', catalog.cylinderSizes.join(', '), <Boxes size={18} style={{ color: COLORS.blue }} />],
    ['airtimeSuppliers', 'Airtime suppliers', catalog.airtimeSuppliers.join(', '), <Package2 size={18} style={{ color: COLORS.green }} />],
    ['airtimeDenoms', 'Airtime denominations', catalog.airtimeDenoms.join(', '), <Boxes size={18} style={{ color: COLORS.green }} />],
    ['burnerBrands', 'Burner brands', `${catalog.burnerBrands.length} brands`, <Package2 size={18} style={{ color: COLORS.amber }} />],
    ['cookerTypes', 'Cooker types', `${catalog.cookerTypes.length} types`, <Package2 size={18} style={{ color: COLORS.amber }} />],
  ];
  return (
    <div className="flex flex-col h-full">
      <Header title="Catalog" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        <div className="rounded-xl p-3 mb-4 flex items-start gap-2" style={{ background: COLORS.paperTint }}><AlertCircle size={14} style={{ color: COLORS.mutedLight, marginTop: 1 }} /><p className="text-xs" style={{ color: COLORS.muted }}>What you sell. Editing here changes the options that appear when adding a sale. Airtime is always auto-priced at 95% of face value.</p></div>
        <GroupCard>
          {entries.map(([key, label, sub, icon], i) => (
            <div key={key}>
              <Row icon={icon} label={label} sub={sub} onClick={() => onOpen(key, label)} />
              {i < entries.length - 1 && <Divider />}
            </div>
          ))}
        </GroupCard>
      </div>
    </div>
  );
}

// ---------- OPENING COUNT / STOCK SETUP (per brand + size) ----------
function StockSetup({ catalog, onBack }) {
  const [mode, setMode] = useState('empties'); // empties | full
  // counts[brand] = { emptyBig, emptySmall, fullBig, fullSmall }
  const [counts, setCounts] = useState(() => Object.fromEntries(catalog.cylinderBrands.map(b => [b, { emptyBig: 0, emptySmall: 0, fullBig: 0, fullSmall: 0 }])));
  const [saved, setSaved] = useState(false);
  const [alreadySet] = useState(true); // demo: pretend an opening count exists → show recount framing

  const bigKey = mode === 'empties' ? 'emptyBig' : 'fullBig';
  const smallKey = mode === 'empties' ? 'emptySmall' : 'fullSmall';
  function setC(brand, key, v) { setCounts(c => ({ ...c, [brand]: { ...c[brand], [key]: Math.max(0, v) } })); }

  const filledBrands = catalog.cylinderBrands.filter(b => counts[b][bigKey] > 0 || counts[b][smallKey] > 0);
  const total = catalog.cylinderBrands.reduce((s, b) => s + counts[b][bigKey] + counts[b][smallKey], 0);

  return (
    <div className="flex flex-col h-full">
      <Header title={alreadySet ? 'Recount stock' : 'Opening stock count'} onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        <div className="rounded-xl p-3 mb-4 flex items-start gap-2" style={{ background: COLORS.amberTint }}>
          <AlertCircle size={14} style={{ color: COLORS.amber, marginTop: 1 }} />
          <p className="text-xs" style={{ color: COLORS.amber }}>
            {alreadySet
              ? "You've set an opening count before. Entering a recount here adds a correction — it never erases what you've already recorded. Old sales and refills stay exactly as they were; only the totals adjust to match reality."
              : 'Set this ONCE when you start, to record what you already have. After that the app tracks changes automatically.'}
          </p>
        </div>

        {/* empties / full toggle */}
        <div className="flex rounded-xl p-1 mb-4" style={{ background: '#E4E7DF' }}>
          {[['empties', 'Empties on hand'], ['full', 'Full stock']].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ background: mode === k ? COLORS.white : 'transparent', color: mode === k ? COLORS.ink : COLORS.muted }}>{l}</button>
          ))}
        </div>

        <p className="text-xs mb-3 px-1" style={{ color: COLORS.mutedLight }}>
          {mode === 'empties'
            ? 'Empty cylinders sitting in your shop now, waiting to go for refill. Count empties only here — full ones go under Full stock.'
            : 'Only cylinders that are full and ready to sell in your shop now. Don\u2019t count empties, and don\u2019t count any cylinders already sent to the refiller.'} Only fill the brands you actually hold — leave the rest at zero.
        </p>

        {catalog.cylinderBrands.map(b => {
          const active = counts[b][bigKey] > 0 || counts[b][smallKey] > 0;
          return (
            <div key={b} className="rounded-2xl p-4 mb-2.5" style={{ background: active ? COLORS.blueTint : COLORS.white, border: `1.5px solid ${active ? COLORS.blue : COLORS.line}` }}>
              <p className="text-sm font-bold mb-3" style={{ color: COLORS.ink }}>{b}</p>
              {[['Big', bigKey], ['Small', smallKey]].map(([label, key]) => (
                <div key={key} className={`flex items-center justify-between ${label === 'Big' ? 'mb-2.5' : ''}`}>
                  <span className="text-sm" style={{ color: COLORS.muted }}>{label}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setC(b, key, counts[b][key] - 1)} className="rounded-full flex items-center justify-center" style={{ width: 32, height: 32, background: '#F1F2EE', border: `1px solid ${COLORS.line}` }}><Minus size={15} style={{ color: COLORS.ink }} /></button>
                    <span className="font-bold text-base w-7 text-center" style={{ color: COLORS.ink }}>{counts[b][key]}</span>
                    <button onClick={() => setC(b, key, counts[b][key] + 1)} className="rounded-full flex items-center justify-center" style={{ width: 32, height: 32, background: COLORS.blue }}><Plus size={15} color="white" /></button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        <div className="rounded-2xl p-4 mt-3 flex items-center justify-between" style={{ background: COLORS.paperTint }}>
          <span className="text-sm font-semibold" style={{ color: COLORS.muted }}>{mode === 'empties' ? 'Total empties' : 'Total full stock'} · {filledBrands.length} brand{filledBrands.length === 1 ? '' : 's'}</span>
          <span className="font-bold text-xl" style={{ color: COLORS.ink }}>{total}</span>
        </div>
      </div>
      <div className="px-5 py-3" style={{ borderTop: `1px solid ${COLORS.line}` }}>
        <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800); }} className="w-full rounded-xl py-3.5 text-sm font-bold text-white" style={{ background: saved ? COLORS.green : COLORS.ink }}>{saved ? '✓ Saved' : (alreadySet ? 'Save recount' : 'Save opening counts')}</button>
      </div>
    </div>
  );
}

// ---------- REMINDERS ----------
function RemindersSettings({ onBack }) {
  const [on, setOn] = useState(true);
  const [hour, setHour] = useState(9);
  return (
    <div className="flex flex-col h-full">
      <Header title="Reminders" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        <div className="rounded-xl p-3 mb-4 flex items-start gap-2" style={{ background: COLORS.paperTint }}><AlertCircle size={14} style={{ color: COLORS.mutedLight, marginTop: 1 }} /><p className="text-xs" style={{ color: COLORS.muted }}>Reminders are for your own follow-up — they never message the customer. They fire on this phone even with no internet.</p></div>
        <GroupCard>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: COLORS.white }}>
            <div className="rounded-xl flex items-center justify-center" style={{ width: 38, height: 38, background: COLORS.paperTint }}><Bell size={18} style={{ color: COLORS.amber }} /></div>
            <div className="flex-1"><p className="text-sm font-semibold" style={{ color: COLORS.ink }}>Debt & refill reminders</p><p className="text-xs" style={{ color: COLORS.mutedLight }}>{on ? 'On' : 'Off'}</p></div>
            <button onClick={() => setOn(!on)} className="rounded-full transition-all" style={{ width: 48, height: 28, background: on ? COLORS.green : '#C9CDC3', position: 'relative' }}>
              <span className="rounded-full bg-white absolute top-1" style={{ width: 22, height: 22, left: on ? 22 : 4, transition: 'left 0.15s' }} />
            </button>
          </div>
        </GroupCard>

        {on && (
          <>
            <SectionLabel>Reminder time</SectionLabel>
            <div className="rounded-2xl p-4" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Clock size={16} style={{ color: COLORS.muted }} /><span className="text-sm" style={{ color: COLORS.ink }}>Time of day</span></div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setHour(Math.max(5, hour - 1))} className="rounded-full flex items-center justify-center" style={{ width: 32, height: 32, background: '#F1F2EE', border: `1px solid ${COLORS.line}` }}><Minus size={15} style={{ color: COLORS.ink }} /></button>
                  <span className="font-bold text-base w-16 text-center" style={{ color: COLORS.ink }}>{hour}:00 {hour < 12 ? 'AM' : 'PM'}</span>
                  <button onClick={() => setHour(Math.min(20, hour + 1))} className="rounded-full flex items-center justify-center" style={{ width: 32, height: 32, background: COLORS.blue }}><Plus size={15} color="white" /></button>
                </div>
              </div>
              <p className="text-xs mt-3" style={{ color: COLORS.mutedLight }}>The day-before heads-up and due-day reminder both fire at this time. The 7-day debt logic itself doesn't change.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- BACKUP & STORAGE ----------
function BackupSettings({ onBack }) {
  const [backing, setBacking] = useState(false);
  const [lastBackup, setLastBackup] = useState('2 hours ago');
  const [freed, setFreed] = useState(false);
  function backupNow() { setBacking(true); setTimeout(() => { setBacking(false); setLastBackup('just now'); }, 1400); }
  return (
    <div className="flex flex-col h-full">
      <Header title="Backup & storage" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        <SectionLabel>Backup</SectionLabel>
        <div className="rounded-2xl p-4 mb-4" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
          <div className="flex items-center gap-2 mb-1"><Cloud size={16} style={{ color: COLORS.green }} /><span className="text-sm font-semibold" style={{ color: COLORS.ink }}>Everything is backed up</span></div>
          <p className="text-xs mb-3" style={{ color: COLORS.mutedLight }}>Last backup: {lastBackup}. Your records save to this phone first, then copy to the cloud automatically when you have internet.</p>
          <button onClick={backupNow} disabled={backing} className="w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-1.5" style={{ background: COLORS.blueTint, color: COLORS.blue }}><CloudUpload size={16} /> {backing ? 'Backing up…' : 'Back up now'}</button>
        </div>

        <SectionLabel>Photo storage</SectionLabel>
        <div className="rounded-2xl p-4" style={{ background: COLORS.white, border: `1px solid ${COLORS.line}` }}>
          <div className="flex items-center justify-between mb-1"><span className="text-sm font-semibold" style={{ color: COLORS.ink }}>Photos on this phone</span><span className="text-sm font-bold" style={{ color: COLORS.ink }}>212 MB</span></div>
          <p className="text-xs mb-3" style={{ color: COLORS.mutedLight }}>Receipt & cylinder photos. You can clear the ones already backed up to free space — they stay safe in the cloud and viewable when you have internet.</p>
          <div className="rounded-xl p-3 mb-3 flex items-start gap-2" style={{ background: COLORS.greenTint }}><Check size={14} style={{ color: COLORS.green, marginTop: 1 }} /><p className="text-xs" style={{ color: COLORS.green }}>198 MB is backed up and safe to clear. 14 MB not yet backed up will be kept.</p></div>
          <button onClick={() => { setFreed(true); setTimeout(() => setFreed(false), 1800); }} className="w-full rounded-xl py-3 text-sm font-bold flex items-center justify-center gap-1.5" style={{ background: freed ? COLORS.greenTint : '#FDECEC', color: freed ? COLORS.green : COLORS.red }}><Trash2 size={16} /> {freed ? '✓ Freed 198 MB' : 'Clear backed-up photos (198 MB)'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- COMPANY CODES (read-only reference) ----------
function CompanyCodes({ onBack }) {
  return (
    <div className="flex flex-col h-full">
      <Header title="Refilling company codes" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
        <div className="rounded-xl p-3 mb-4 flex items-start gap-2" style={{ background: COLORS.paperTint }}><AlertCircle size={14} style={{ color: COLORS.mutedLight, marginTop: 1 }} /><p className="text-xs" style={{ color: COLORS.muted }}>Each refilling company gets a short code, used in batch IDs like KGD-11JUL26-01. This is just a reference so you can read any batch ID.</p></div>
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${COLORS.line}` }}>
          {seedCompanyCodes.map((c, i) => (
            <div key={c.code}>
              <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: COLORS.white }}>
                <span className="rounded-lg px-2.5 py-1 text-sm font-bold" style={{ background: COLORS.blueTint, color: COLORS.blue }}>{c.code}</span>
                <span className="text-sm" style={{ color: COLORS.ink }}>{c.name}</span>
              </div>
              {i < seedCompanyCodes.length - 1 && <div style={{ height: 1, background: COLORS.line }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- MAIN SETTINGS ----------
function SettingsHome({ catalog, onNav }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-5 pb-2"><h1 className="font-bold text-2xl" style={{ color: COLORS.ink }}>Settings</h1></div>
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-8">
        <SectionLabel>Your shop</SectionLabel>
        <GroupCard>
          <Row icon={<Package2 size={18} style={{ color: COLORS.blue }} />} label="Catalog" sub="What you sell — brands, sizes, airtime" onClick={() => onNav('catalog')} />
          <Divider />
          <Row icon={<Boxes size={18} style={{ color: COLORS.amber }} />} label="Opening stock count" sub="One-time setup of what you already have" onClick={() => onNav('stock')} />
          <Divider />
          <Row icon={<Building2 size={18} style={{ color: COLORS.blue }} />} label="Refilling company codes" sub="Reference for reading batch IDs" onClick={() => onNav('codes')} />
        </GroupCard>

        <SectionLabel>App</SectionLabel>
        <GroupCard>
          <Row icon={<Bell size={18} style={{ color: COLORS.amber }} />} label="Reminders" sub="On · 9:00 AM" onClick={() => onNav('reminders')} />
          <Divider />
          <Row icon={<Cloud size={18} style={{ color: COLORS.green }} />} label="Backup & storage" sub="Backed up 2 hours ago · free up space" onClick={() => onNav('backup')} />
        </GroupCard>

        <SectionLabel>This device</SectionLabel>
        <GroupCard>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: COLORS.white }}>
            <div className="rounded-xl flex items-center justify-center" style={{ width: 38, height: 38, background: COLORS.paperTint }}><Smartphone size={18} style={{ color: COLORS.muted }} /></div>
            <div className="flex-1"><p className="text-sm font-semibold" style={{ color: COLORS.ink }}>This phone: Grace</p><p className="text-xs" style={{ color: COLORS.mutedLight }}>Set once at first launch · every entry logs as Grace</p></div>
          </div>
        </GroupCard>
        <p className="text-center text-xs mt-2" style={{ color: COLORS.mutedLight }}>BMG Shop App · v1.0</p>
      </div>
    </div>
  );
}

function PhoneFrame({ children }) {
  return (<div className="overflow-hidden relative" style={{ width: 380, height: 780, background: COLORS.paper, borderRadius: 40, border: '10px solid #16231F', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}><div className="flex items-center justify-between px-6 pt-3 pb-1 text-xs font-semibold" style={{ color: COLORS.ink }}><span>9:41</span><span>●●●</span></div><div className="relative" style={{ height: 'calc(100% - 28px)' }}>{children}</div></div>);
}

export default function App() {
  const [catalog, setCatalog] = useState(seedCatalog);
  const [nav, setNav] = useState({ screen: 'home' });

  function setListKey(key, items) { setCatalog(c => ({ ...c, [key]: items })); }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 p-6" style={{ background: '#DCE0DA' }}>
      <PhoneFrame>
        {nav.screen === 'home' && <SettingsHome catalog={catalog} onNav={(s) => setNav({ screen: s })} />}
        {nav.screen === 'catalog' && <CatalogHub catalog={catalog} onBack={() => setNav({ screen: 'home' })} onOpen={(key, label) => setNav({ screen: 'list', key, label })} />}
        {nav.screen === 'list' && <EditableList title={nav.label} items={catalog[nav.key]} setItems={(items) => setListKey(nav.key, items)} onBack={() => setNav({ screen: 'catalog' })} note={nav.key === 'airtimeDenoms' ? 'Face values in shillings. Airtime always sells at 95% of face value.' : null} />}
        {nav.screen === 'stock' && <StockSetup catalog={catalog} onBack={() => setNav({ screen: 'home' })} />}
        {nav.screen === 'codes' && <CompanyCodes onBack={() => setNav({ screen: 'home' })} />}
        {nav.screen === 'reminders' && <RemindersSettings onBack={() => setNav({ screen: 'home' })} />}
        {nav.screen === 'backup' && <BackupSettings onBack={() => setNav({ screen: 'home' })} />}
      </PhoneFrame>
      <p className="text-xs text-center max-w-xs" style={{ color: '#5b6660' }}>
        Settings: catalog editor (tap any list to add/remove), one-time opening stock count, company-code reference, reminder on/off + time, backup status + free-up-space, and this-device name.
      </p>
    </div>
  );
}
```
-e 
---

-e 
# END OF MASTER BUILD SPECIFICATION


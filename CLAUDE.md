# BMG Shop App

Digital replacement for a paper credit-notebook used by a small Kenyan retail
shop (gas cylinders, burners, cookers, airtime). **#1 job: track informal
customer debt accurately** — money owed AND unreturned cylinder empties.
Record-keeper only, never moves money. Offline-first is non-negotiable.

Built for one client now ("Edd's" client, a Kenyan duka owner), with a
reusable core so 1–2 more shops can be onboarded later — manually, not
self-serve SaaS.

**Full spec:** [docs/BMG-MASTER-BUILD-SPEC.md](docs/BMG-MASTER-BUILD-SPEC.md)
(4,500+ lines / ~103k tokens — do NOT read it in full each session). This
CLAUDE.md is the map. Jump to the exact section below with `Read` +
`offset`/`limit`, or `Grep` for a heading, rather than reading the whole file.

**Expo version pin:** see [AGENTS.md](AGENTS.md) — this project targets Expo
v57. Read the versioned docs at https://docs.expo.dev/versions/v57.0.0/
before writing Expo/RN code; APIs move fast between versions, don't assume
older-version patterns. The official Expo Claude plugin is enabled
(`.claude/settings.json`) — prefer it for Expo-specific scaffolding/config
questions over general knowledge.

## Spec file map (line numbers, so you can jump straight there)

| Lines | Content |
|---|---|
| 1–~425 | Part A — orientation: what the app is, tech stack, global rules G1–G8, SECURITY §5, open decisions |
| ~225–~420 | Part B — technical architecture (`00-tech-architecture.md`): schema, offline model, sync, multi-user, distribution |
| ~430–~750 | Part C §1 — Home/Sales section spec (customer tab wall, add-sale flow, cart pattern) |
| ~755–~1000 | Part C §2 — Debts section spec (money owed / empties owed, repayment flow, reminders) |
| ~1005–~1170 | Part C §3 — Sales Record section spec (global sale log) |
| ~1175–~1420 | Part C §4 — Refilling section spec (supplier batches, shared stock ledger, RETRO-NOTES §10) |
| ~1425–~1610 | Part C §5 — Reports/KPIs section spec (calculation definitions) |
| ~1615–~1775 | Part C §6 — Settings/Catalog section spec (catalog editor, opening stock count) |
| ~1780–end | Part D — JSX design mockups (web/React, visual reference only, NOT shipped code) — see below |

Line numbers shifted slightly (~10–15 lines) after the security-section edit
below; use `Grep -n "^## "` / `Grep -n "^# "` on the spec file if a number is
off, rather than assuming it's exact.

### Part D mockup sub-index (jsx files, visual blueprint only)
Search the spec for `## Mockup —` to get exact current line numbers per file
(`bmg-home-redesign.jsx`, `bmg-debts-section.jsx`, `bmg-sales-record.jsx`,
`bmg-refilling-section.jsx`, `bmg-reports-section.jsx`,
`bmg-settings-section.jsx`). Only open the relevant slice when actually
implementing that section's UI and the prose leaves a visual detail
ambiguous — these are React/Tailwind/lucide-react web prototypes, ~90%
fidelity target, NOT code that ships. Charts in the Reports mockup are
hand-drawn placeholders to be rebuilt with a real RN chart library.

**Priority if parts conflict:** SECURITY (Part A §5) + global rules win over
older text > a later section's RETRO-NOTE wins over the earlier spec it
amends > tech architecture wins on data/schema/sync > mockups win on visual
detail.

---

## Tech stack (LOCKED — do not re-debate)

- **React Native + Expo (v57), Android-first.** No web libraries ship.
- **Local DB: expo-sqlite** — on-device source of truth, every write succeeds
  offline immediately.
- **Backend: Supabase** (Postgres) — cloud backup + multi-device sync only,
  reached via anon/public key. Service-role key NEVER ships in the client.
- **Charts:** react-native-gifted-charts or victory-native (pick one, stay
  consistent).
- **Notifications:** expo-notifications, local/on-device only, no push server.
- **Photos:** expo-file-system locally + Supabase Storage for backup. Never
  store image bytes in the DB — only a path/URL reference.
- **Distribution:** EAS Build → **`.apk`** (not `.aab`), sideloaded. Not the
  Play Store.

## Global rules (apply everywhere — see spec Part A §4 for G1–G8 in full)

- **G1 — Balances are ALWAYS calculated from event history, never stored.**
  Central integrity rule. Money owed = credit − repayments. Empties owed =
  taken − returned. Full stock = opening + returned-from-refill + manual-add
  − sold.
- **G2** — one shared stock/empties event ledger feeds Debts, Refilling,
  Reports, stock. Event types: `opening-count`, `received`, `sent`,
  `returned-from-refill`, `sold`, `manual-add`.
- **G3** — each credit sale is its own debt, fixed 7-day deadline from sale
  date, never resets on partial payment.
- **G4** — history is immutable, except a sale's free-text note (editable).
- **G5** — append-only, no in-app delete for anyone. Deletion is
  developer-only, directly in Supabase.
- **G6** — every sale/repayment/return auto-attributes to the logged-in
  device's staff member, zero extra taps.
- **G7** — ship ONLY the real catalog (below) as seed data. Never hardcode
  mockup placeholder values (names, timestamps, demo sales/customers).
- **G8** — offline never blocks. Optional things (receipt photos) never
  block a save.

## Security (spec Part A §5)

- **No app-entry lock.** A PIN/password lock was drafted and then explicitly
  rejected by Edd (2026-08-23) — do not build a lock screen. First launch is
  just the name picker; no login, no passwords, no per-device auth.
- **Supabase RLS** must be enabled AND tested on every table, keyed on
  `business_id`. No secrets in the APK — only the anon key ships.
- **PII minimization**: customer records are name + debt only (no phone
  numbers). Deliberate exception: Refilling stores supplier company/director/
  phone (businesses she must call).
- Local DB encryption (SQLCipher) is an optional future hardening item, not
  required for MVP — do not add it without asking.

## The real catalog (the only seed data — ships pre-loaded, editable in Settings)

- **Cylinder brands:** K-Gas, Total Gas, Afrigas, Pro Gas, Sea Gas, Rubis,
  Kobil, National Oil, G-Gas, Gold Gas, Others. **Sizes:** Small, Big.
- **Airtime:** Safaricom, Airtel. Denominations 10/20/50/100. Price = always
  95% of face value, auto-computed, no price box.
- **Burner brands:** Skytec, PineGas, Orgaz, Cosco.
- **Cooker types:** Mini-cylinder grill, Double burner stove.

Everything else in the spec/mockups (names, timestamps, sample customers,
history, MB figures) is placeholder — must NEVER be hardcoded into the app.

## Build order (six sections; later specs contain RETRO-NOTES that amend earlier ones — apply them)

1. Home/Sales — customer tab wall + add-sale flow (the core loop)
2. Debts — money owed / empties owed, repayments, reminders
3. Sales Record — global read-only sale log
4. Refilling — supplier batches, introduces the shared stock ledger (adds a
   `sold` event requirement back onto Home/Sales — see spec §10 RETRO-NOTE
   in the Refilling section)
5. Reports/KPIs — pure read-time computation over existing data, no new capture
6. Settings/Catalog — catalog editor + opening-stock cold-start seeding +
   backup/storage controls

## Visual language (spec Part C §1 "Home/Sales" — applies app-wide)

Colors: paper `#EEF0EC`, ink `#16231F`, blue `#2B6CB5` (primary actions),
amber `#C2540B` (owed/warning, never red-alarm), green `#2F7A4D` (paid/save),
line `#C9CDC3`, muted `#586159`. Money always `KSh 2,200` format. Touch
targets ≥44×44px, filled background, never a bare icon. Offline/sync state
shown calm and informational, never a red alarm — offline is this app's
normal state.

## Open / deferred decisions (do not silently pick — flag and ask)

RN typography (fonts not locked) · airtime 0.95 rate editability · "due soon"
window (≤2 days) · reminder time sync-or-not · same-morning reminder stacking
vs daily roll-up · catalog item soft-hide vs hard-delete on removal.

**Resolved (2026-08-23):** no app-entry PIN/password lock (name-picker only,
no login) · an overdue unreturned empty never converts to a money charge.

**Resolved while building Home/Sales:**
- **Bottom nav is FLAT** — all six sections directly tappable, no "More"
  overflow. Labels abbreviate ("Sales", "Refill") to fit six across.
- **Tunables live in `src/config/tunables.ts`** (low-stock threshold = 2,
  recent-brand count = 3, receipt photo quality = 0.8) so Settings can reach
  them later. Photo compression took the spec's own "light compression"
  middle path — one constant, change it if Edd wants pristine originals.
- **Tab "access frequency" = count of that customer's sales**, derived at read
  time (never a stored counter, G1) — the option Part B §8 allows.
- **`stock_events` carries a `scope` column** (`full` | `empty`), because
  `opening-count` and `manual-add` are the only event types that can mean
  either pile and the row must say which derived quantity it feeds.
- **Airtime packs/singles are not persisted** — `sale_items` records the card
  count, and 1 pack vs 10 singles is the same 10 cards at the same price. The
  breakdown is cart-only, matching the Part B §8 schema.

---

## WHO I'M WORKING WITH — teach, don't just deliver (2026-08-24)

Edd is a **first-year computer science student**, still learning, and is
deliberately using this build as a learning opportunity. **Explain everything
as you go.** Treat it as lecturer→student, not contractor→client.

**Explain the ENGINEERING, not the app's features.** He already knows what the
app should do (he wrote the spec). What he wants is the *why* underneath:
- Why this technology/library rather than an alternative — what problem does
  it solve, what breaks without it.
- Why the code is structured this way — why a shared ledger table instead of
  stored counts, why one code path for add-and-edit, why UUIDs not
  auto-increment ints.
- Framing to use: *"we are inventing mobile apps — why does this thing exist
  and why does it matter?"* Concepts over recipes.
- When a decision has a trade-off, name both sides and say which we chose and
  why. When something fails, explain the *layer* it failed at (app code vs
  bundler vs network vs device) — he found that framing useful.

**Cost management:** explanations cost output tokens, so keep them tied to
what we are actually doing right now. Explain decisions as they arise; don't
deliver unprompted generic lectures. If he says "just do it", go quiet and
build. If he asks "why", go deeper.

**Work interactively with him present** — he explicitly prefers this over
scheduled/overnight cloud runs, because unattended runs teach him nothing and
the failures land on him in the morning.

---

## KNOWN BUGS — deferred on purpose, do not lose these

- **A customer's statement silently truncates at 500 events.**
  `listCustomerSales` passes `limit = 500`, so anything older simply is not
  returned and nothing says so. Harmless for a named customer; the **Quick
  Sale** tab collects every walk-in, so at ~10/day it hits the ceiling in under
  two months and then quietly hides history. Same class of fault as the
  "Fully paid" bug: silent data loss on a record.
  **Fix:** paginate the statement the way Sales Record and the Debts record
  already do. Needs a SQL `UNION ALL` over sales + repayments + empty_returns
  (the pattern in `listMoneyLedger`), because the three are currently merged
  and sorted in JS and cannot be paged per-source. ~30–40 min.
  Deferred by Edd on 2026-09-15 to finish the remaining sections first.

## Working conventions for this project

- Git repo initialized during Expo scaffolding (2026-08-23). Built so far:
  Home/Sales, Debts (incl. the record and reminders), Sales Record, Refilling,
  Reports. Still a placeholder: Settings.
- **Where Reports lives:** `src/reports/kpis.ts` (pure KPI arithmetic, heavily
  tested), `src/db/queries/reports.ts` (read-only SELECTs — Reports never
  writes), `src/components/charts/*`, `src/screens/reports/ReportsScreen.tsx`.
  **Chart library decision (resolved 2026-09-19, closes a spec OPEN item):**
  NO charting library. Both candidates (gifted-charts, victory-native) pull in
  a native module, which forces a fresh build on every phone before the app
  will launch at all. Charts are plain Views. Revisit only if curves,
  animation or pie slices are actually wanted.
- **SQL is verified by running it**, not by reading it — see the `node:sqlite`
  harnesses used for the refilling record and Reports queries. That caught a
  `GROUP BY` resolving to a real column instead of the intended alias. Node 22
  ships `node:sqlite`, so this needs no dependency.
- **Where Refilling lives:** `src/db/queries/refilling.ts` (data),
  `src/refilling/*` (pure: `ids.ts` company/batch codes, `batchDraft.ts` the
  send/return grid, `reminders.ts` day-3/day-7 timing),
  `src/screens/refilling/*` (six screens). Photos go through
  `src/lib/photos.ts` + `src/components/PhotoSlot.tsx` (cap 3).
  **Settings still owes Refilling** a company-code reference list
  ("KGD = K-Gas Depot", spec §4 §3/§6).
- **Where Home/Sales lives:** `src/db/queries/*` (data), `src/sales/*` (cart
  types + the single picker-state → cart-line builders), `src/screens/*`
  (Home, AddSale, Payment, CustomerHistory, StaffPicker),
  `src/screens/pickers/*` (the three commodity picker shapes),
  `src/components/*` (shared UI). Editing a cart line goes through the SAME
  builders as adding — don't add a second path.
- When a spec section has a RETRO-NOTE amending an earlier section (e.g.
  Refilling §10 adds a `sold` event requirement to Home/Sales), treat the
  RETRO-NOTE as binding even though it lives in a later section.
- Never invent seed data beyond the catalog above. Never hardcode a mockup
  placeholder (name, date, amount) into real app code.

## Tips for using Claude Code on this project (first-time user)

- **This file is read automatically** at the start of every session — that's
  why it's kept short. Keep it that way: if you add durable facts/decisions,
  add them here in a line or two, not as a giant paste. Large reference
  material (like the master spec) belongs in `docs/`, linked from here.
- **Don't paste the whole spec into chat.** Reference it by section name
  ("build the Debts section per the spec") — Claude will jump to the right
  lines using the table above instead of re-reading everything, which saves
  a large chunk of usage per message.
- **Use `/clear` between unrelated tasks** (e.g. finishing Home/Sales and
  starting Debts) to drop unneeded conversation history and start the next
  task with a clean, cheap context window. Don't `/clear` mid-task.
- **Plan mode** is worth using for anything bigger than a small edit — ask
  Claude to plan first, review the plan, then approve execution. Cheaper
  than letting it go straight to code and course-correcting after.
- **One section at a time.** Given the build order above, ask for one
  section fully built (and lightly tested) before starting the next, rather
  than requesting the whole app in one prompt — easier to review, easier to
  catch spec drift early.
- **Point at line numbers/files, not vibes.** "Per spec Debts §4–5" gets a
  more accurate result than "you know, the batch thing."
- Costs scale with context read, not just output — the biggest lever you
  have is avoiding unnecessary re-reads of this repo and the spec file, which
  is exactly what the line-number map above is for.

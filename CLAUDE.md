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
window (≤2 days) and low-stock threshold (≤2) — both tunable · reminder time
sync-or-not · same-morning reminder stacking vs daily roll-up · photo
compression level · catalog item soft-hide vs hard-delete on removal ·
bottom-nav grouping (6 sections likely needs a "More" overflow).

**Resolved (2026-08-23):** no app-entry PIN/password lock (name-picker only,
no login) · an overdue unreturned empty never converts to a money charge.

---

## Working conventions for this project

- Git repo initialized during Expo scaffolding (2026-08-23). Nothing
  committed yet beyond the scaffold — review with `git status` before the
  first real commit.
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

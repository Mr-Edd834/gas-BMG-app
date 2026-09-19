# BMG Shop App — what is left until launch

Launch = the app is on the client's phone (and her two staff phones), holding
real customer debt, with her paper notebook retired.

Written 2026-09-19. Status of the build at that date: Home/Sales, Debts, Sales
Record and Refilling are built and working on a device. Reports and Settings
are not. There is no backend.

Items are marked:

- **BLOCKER** — launching without it risks losing or corrupting real data.
- **NEEDED** — launch is incomplete or embarrassing without it.
- **LATER** — genuinely fine to ship without; do not let it delay launch.

---

## 1. Finish the app

| | Item | Notes |
|---|---|---|
| NEEDED | **Reports / KPIs (spec §5)** | Pure read-time computation over data already captured. No new capture, no schema change. |
| **BLOCKER** | **Settings / Catalog (spec §6)** | Blocker because of one part: the **opening stock count**. Full stock is derived from events (G1), so with no opening count every stock figure in the app starts life wrong. The catalog editor and storage controls are only NEEDED. |
| NEEDED | Company-code reference list in Settings | "KGD = K-Gas Depot" (Refilling spec §3/§6), so any batch ID can be decoded later. Owed to Refilling. |

## 2. Known bugs, deliberately deferred

| | Item | Notes |
|---|---|---|
| NEEDED | **Statement truncates at 500 events** | `listCustomerSales` passes `limit = 500` and says nothing when it hits it. Harmless per named customer; the **Quick Sale** tab collects every walk-in and reaches the ceiling in under two months at ~10/day, then quietly hides history. Fix is the `UNION ALL` pattern now used in `listCompanyRecord`. ~30–40 min. |
| LATER | Debts queries load everything into memory | Fine at one duka's scale. Revisit only if it gets slow. |

## 3. Backend — the largest remaining piece, and the largest risk

Nothing here exists yet beyond a configured client. This is the item that has
already bitten once: test data was lost switching phones, because the phone
*is* the only copy.

| | Item | Notes |
|---|---|---|
| **BLOCKER** | Supabase schema mirroring the local tables | Keyed on `business_id` throughout. |
| **BLOCKER** | **RLS enabled AND tested on every table** | Enabled-but-untested is the classic failure. Test it by trying to read another `business_id` with the anon key and confirming it returns nothing. |
| **BLOCKER** | Sync engine: push, pull, conflict rule | Append-only history makes this far easier than general sync — rows are inserted, not mutated. The sale note (G4) is the one editable field and needs a last-write-wins rule. |
| **BLOCKER** | Photo upload to Supabase Storage | Photos are currently **one copy, on one phone**. A lost phone loses every piece of receipt and cylinder evidence in the business. |
| **BLOCKER** | Restore actually tested | An untested backup is not a backup. Wipe a test device, restore, confirm the debts match. |
| NEEDED | Anon key shipped via `EXPO_PUBLIC_*`, service-role key never | Already the design in `src/lib/supabase.ts`. Keep it that way. |
| NEEDED | Sync status visible in the UI | Calm and informational, never a red alarm — offline is this app's normal state (G8). |

## 4. Data hygiene before go-live — ORDER MATTERS

| | Item | Notes |
|---|---|---|
| **BLOCKER** | **Wipe test data BEFORE the first sync, not after** | Uninstall the app (or clear app data) on every device. That deletes the SQLite file and the photo folder; a fresh install starts empty with the seeded catalog. **If sync is switched on while test data is present, the first push seeds the production database with fake customers and fake debts** — and removing it then means hand-written SQL in the Supabase dashboard, because there is no in-app delete for anyone (G5). |
| **BLOCKER** | Real opening stock count, entered with her | Full and empty counts per brand and size, on the day she starts. Everything stock-related is derived from this. |
| NEEDED | Confirm the catalog against her actual shelves | Brands, sizes, burner and cooker names, airtime denominations. Ship only what she really sells (G7). |
| NEEDED | Confirm the 95% airtime rate is still current | Hardcoded as `AIRTIME_RATE`. |

## 5. Getting it onto the phones

| | Item | Notes |
|---|---|---|
| **BLOCKER** | `preview`-profile APK, not the `development` one | The development build streams JavaScript from a laptop and is useless in her shop. `eas build --profile preview --platform android`. |
| NEEDED | Install on all three phones, each picks its staff name once | G6 attributes every record to whoever's phone it is. |
| NEEDED | Icon and splash checked on a real device | Assets exist in `assets/`; nobody has looked at them on a phone. |
| NEEDED | A plan for shipping updates | Sideloaded, so there is no store to push through. Decide now how she gets version 1.1 — a WhatsApp link, a cable, a visit. |
| LATER | Android permission strings reviewed | Camera and photo strings are written; `permissions: []` is empty and Expo infers them. Check what the APK actually requests. |

## 6. Before anyone relies on it

| | Item | Notes |
|---|---|---|
| **BLOCKER** | **She uses it, in her shop, for a day, with you there** | Nobody but the builder has ever touched this app. Every assumption in it is untested against the person it is for. Run a day in parallel with the paper notebook and compare the two at closing. |
| NEEDED | Deliberately test the ugly paths | No signal. Phone full. App killed mid-sale. Two phones recording at once. Battery dies during a photo. |
| NEEDED | Agree what happens when it is wrong | History is immutable and there is no in-app delete. She needs to know the fix for a mistyped sale is a correcting entry, not an edit — and that you are the only one who can remove anything. |

## 7. Project hygiene

| | Item | Notes |
|---|---|---|
| NEEDED | **Make the repo private** | It is public. It contains a client's business processes, her pricing and her operating detail. No secrets are committed, so this is a client-confidentiality issue rather than a security one — which does not make it fine. |
| NEEDED | A human README | `CLAUDE.md` serves Claude. Nothing tells a person how to run this project. |
| LATER | Widen the test suite | 103 tests cover debt arithmetic, IDs, the cart's walk-away rules and the refill grid — the highest-consequence logic. Nothing covers the queries. |
| LATER | Local DB encryption (SQLCipher) | Optional hardening. Do not add without asking — it changes the native build. |

---

## The short version

Four things genuinely stand between here and a shop running on this app:

1. **Settings**, for the opening stock count.
2. **The backend**, so the business does not live on one droppable phone.
3. **Wipe the test data before the first sync**, in that order.
4. **A real day in her shop, with you standing there.**

Reports, the statement pagination and every LATER item can follow a working
launch. None of them can lose her data; the four above all can.

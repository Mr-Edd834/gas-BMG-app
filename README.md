# BMG Shop App

An Android app that replaces the paper credit-notebook in a small Kenyan duka
selling gas cylinders, burners, cookers and airtime.

Its first job is tracking informal customer debt accurately — both **money
owed** and **unreturned cylinder empties**. It is a record-keeper. It never
moves money, has no payment integration, and never messages a customer.

It works fully offline. That is not a feature for emergencies; it is the
normal condition the app is designed around.

---

## Running it

You need [Node.js](https://nodejs.org) 22+ and an Android phone.

```bash
npm install
npm run dev
```

`npm run dev` starts the bundler and prints the address to open on the phone —
something like `exp://192.168.1.4:8081`. It works out your laptop's real
network address itself and skips virtual adapters (WSL, Hyper-V), which
otherwise make Expo advertise an address the phone cannot reach.

The phone must be on **the same Wi-Fi** as the laptop. A new network means a
new address, so re-run `npm run dev` after switching.

The phone needs the **development build** installed (not Expo Go — the app
uses native modules Expo Go does not carry). Build one with:

```bash
eas build --profile development --platform android
```

### Checks

```bash
npm test                            # 177 unit tests of the app's arithmetic
node tests/check-statement-sql.mjs  # statement pagination, against real SQLite
node tests/check-reports-sql.mjs    # the Reports queries
node tests/check-refilling-sql.mjs  # the refilling record
node tests/check-import-cycles.mjs  # circular imports, which tsc cannot see
npx tsc --noEmit                    # types
```

The SQL checks read the queries **out of the source files** and run them
against an in-memory database, so they cannot drift into testing a query the
app no longer uses. They have already caught a real bug that reading the code
did not.

---

## How it is built

- **React Native + Expo (SDK 57)**, Android-first, TypeScript.
- **expo-sqlite** on the phone is the source of truth. Every write succeeds
  offline, immediately.
- **Supabase** is cloud backup and multi-device sync only — *not yet built*.
- Distributed as a sideloaded **`.apk`**. Not the Play Store.

### The one rule that explains the rest

**Balances are never stored. They are always calculated from history.**

There is no "amount owed" column anywhere. What a customer owes is the sum of
what they took minus what they paid, worked out at the moment you look. Same
for empties, same for stock.

This costs a little speed and buys the thing the paper notebook could not
have: two numbers can never disagree, because there is only ever one number,
and it is derived from events that actually happened.

It follows from that rule that **history is never edited and nothing is ever
deleted in the app**. A mistake is corrected by recording a correction — see
[docs/FIXING-MISTAKES.md](docs/FIXING-MISTAKES.md).

### Where things live

```
src/
  db/
    schema.ts        every table, created on open (CREATE TABLE IF NOT EXISTS)
    client.ts        the one database handle — statements are queued here
    queries/         all SQL, one file per section
  debts/  refilling/  reports/  settings/  sales/
                     pure logic: no React, no Expo, no database, so it can
                     be tested on a laptop with no phone attached
  screens/           one folder per section
  components/        shared UI
  lib/               formatting, photos, reminders, errors
docs/                the spec, the launch checklist, and these guides
tests/               the test suite and the SQL harnesses
```

The split between `src/<section>/` and `src/screens/<section>/` is the
important one: **the decision goes in the pure file, the pixels go in the
screen.** Deciding how many days a debt took to clear is arithmetic and gets
tested; drawing it is not.

---

## Documentation

| File | What it is |
|---|---|
| [docs/BMG-MASTER-BUILD-SPEC.md](docs/BMG-MASTER-BUILD-SPEC.md) | The full specification — what every screen does and why. 4,500 lines. |
| [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md) | What is left before a real shop can use this, graded by what can actually lose data. |
| [docs/SHIPPING-UPDATES.md](docs/SHIPPING-UPDATES.md) | How a new version reaches phones with no app store. |
| [docs/FIXING-MISTAKES.md](docs/FIXING-MISTAKES.md) | What to do when a record is wrong. |
| [docs/SECURITY-AND-PRODUCTION-AUDIT.md](docs/SECURITY-AND-PRODUCTION-AUDIT.md) | Audit against a production-readiness checklist. |
| [CLAUDE.md](CLAUDE.md) | Working notes for Claude Code. Written for the tool, not for a person. |

---

## Status

All six sections are built: Home/Sales, Debts, Sales Record, Refilling,
Reports, Settings.

**There is no backend yet.** Every record lives on one phone and nowhere else.
That is the largest remaining risk and the top item on the launch checklist.

Built by [@Mr-Edd834](https://github.com/Mr-Edd834) for one shop, with a
reusable core so another can be onboarded by editing the catalog in Settings
rather than by editing code.

# Security & Production Audit — BMG Shop App

Audited 2026-09-14 against two guides Edd supplied:
*Prototype vs. Production Checklist* and *The Security Prompt Pack* (teknical.ai).

Verdicts are **PASS**, **FAIL**, **OPEN** (not built yet, will matter later),
or **N/A** (genuinely does not apply — with the reason stated).

---

## 0. How to read this — the one idea that makes checklists useful

Both guides are written for a **web app**: a server on the internet, a login
screen, a browser, a database reachable over the network. Most of their advice
assumes that shape.

This app is a different shape:

| | Their assumption | This app |
|---|---|---|
| Where code runs | A server you own | One Android phone, sideloaded |
| Who can reach it | Anyone with the URL | Whoever physically holds the phone |
| Login | Required | Deliberately none (spec decision) |
| Database | Over the network | A file inside the app's private sandbox |
| Attacker | Anyone on the internet | Someone holding the phone |

**The principle: a control is worth adding only if it blocks a threat that can
actually reach you.** Rate limiting exists to stop someone hammering a public
endpoint — there is no public endpoint here. CSRF protection defends a browser
session — there is no browser and no session. Adding those wouldn't make this
app safer; it would add code that can break, defending nothing.

That reasoning — *what is the actual threat model?* — is the skill. The
checklist is just a prompt to apply it. Ticking boxes that don't apply is
security theatre, and it's worse than skipping them, because it feels like
progress.

**So the honest question isn't "did we tick all 24 sections?" It's "what can
actually go wrong for a duka owner in Kenya with this app on her phone?"**

The real answer, in order:

1. **Her phone dies and the ledger dies with it.** ← by far the biggest risk
2. **The app records a debt wrongly, or loses one.** ← happened; fixed today
3. Someone picks up her unlocked phone and reads/alters records
4. Later, when Supabase is wired in: one shop reading another shop's data

Note that #1 and #2 are *not security* items at all — they're correctness and
durability. The guides are weighted toward internet-facing attack, which is
the least of this app's problems. That's not a flaw in the guides; it's what
happens when you apply a general checklist to a specific product.

---

## 1. Authentication & Access Control — **N/A by design**

**Verdict: N/A.** Spec Part A §5: no login, no passwords, no accounts. A PIN
lock was drafted and explicitly rejected (2026-08-23).

Every sub-item — password hashing, session expiry, OAuth, forgot-password,
2FA, IDOR checks, rate limiting on login — presupposes accounts that don't
exist. There is no user to impersonate and no session to steal.

**Why this is a defensible choice, not laziness:** the phone is one staff
member's, permanently. Authentication answers "are you who you claim?" — a
question with no meaning when there's exactly one person and no remote access.
What *does* protect the data is the phone's own lock screen, which is the OS's
job and better done there than reimplemented badly in an app.

**The residual risk, stated honestly:** someone who picks up an unlocked phone
can read and add records. Accepted — it is the same exposure as the paper
notebook this replaces, and the notebook could also be stolen or burned. If
that ever becomes unacceptable, the fix is a device lock screen, not app auth.

---

## 2. Secrets & Environment Variables — **PASS**

| Check | Result |
|---|---|
| No hardcoded keys in source | **PASS** — grep for key patterns across `src/`, `App.tsx`, `app.json`: none |
| `.env` in `.gitignore` | **PASS** |
| `.env` ever committed | **PASS** — `git log --all --full-history -- .env` is empty |
| `.env.example` documents needed vars | **PASS** |
| Only public keys client-side | **PASS** — `src/lib/supabase.ts` reads `EXPO_PUBLIC_*` only; a comment forbids the service-role key |

**The one nuance worth understanding:** the guides say "no secrets in frontend
code." A mobile app is *entirely* frontend. Anything shipped in the APK can be
extracted by unzipping it — obfuscation doesn't change this.

So the Supabase **anon key will ship in the APK, and that is correct and
expected**. It is designed to be public. What makes it safe is not secrecy —
it's Row Level Security (§4 below). The anon key is a *name badge*, not a
*key*: it says who you claim to be, and RLS decides what that identity may
touch. Ship the badge; never ship the master key.

---

## 3. Data & Database — **PASS on integrity, OPEN on durability**

| Check | Result |
|---|---|
| Parameterised queries (no SQL injection) | **PASS** — every query in `src/db/` uses `?` placeholders |
| Appropriate data types | **PASS** |
| Indexes on filtered/sorted columns | **PASS** — `sales(sold_at)`, `sales(customer_id)`, `sale_items(sale_id)`, `catalog_items(kind)`, two on `stock_events` |
| Constraints enforced at DB level | **PASS** — `CHECK` on `commodity_type`, `event_type`, `scope`; `NOT NULL` throughout; FKs with `PRAGMA foreign_keys = ON` |
| No test/dummy data seeded | **PASS** — only the real catalog ships (G7) |
| **Automated backups** | **OPEN — the single biggest risk in the project** |
| Backup restore tested | **OPEN** — nothing to restore from yet |
| Row-level security | **OPEN** — Supabase not wired up yet |

**On SQL injection specifically**, since the guides stress it: the one place
that *looks* risky is `listCustomerSales`, which builds `IN (?,?,?)` by string
concatenation. It's safe — only the *placeholder count* is interpolated, never
a value; every actual value goes through a parameter slot. That's the correct
pattern for a variable-length `IN`. Worth recognising the difference: building
SQL *structure* from your own code is fine, building it from *user input* is
the vulnerability.

### The durability gap — read this part twice

Right now the entire shop ledger exists as **one SQLite file on one phone,
with no copy anywhere.** Phone lost, stolen, dropped in water, factory-reset,
or app uninstalled → every sale, every debt, gone permanently.

Your spec calls data loss "business-ending." It currently has nothing
protecting against it. This outranks every security item in both PDFs: an
attacker reading her debt records is embarrassing, but losing them ends the
business relationship. **Supabase sync is not a "nice to have later" — it is
the highest-value work remaining.**

---

## 4. Row Level Security (Supabase) — **OPEN, and the one that will matter most**

Not yet applicable — no Supabase connection exists. Recorded here because when
sync is built, this becomes the #1 security control in the whole project.

Requirements when that work starts (spec Part A §5.2):
- RLS **enabled on every table**, keyed on `business_id`
- Policies **tested by actually attempting cross-shop access** and confirming
  it's blocked — "RLS is enabled" is not evidence, a failed cross-tenant read is
- Storage bucket policies aligned to `business_id`; no world-readable photo URLs
- The anon key's role limited to exactly the CRUD the app needs

**Why this carries the whole weight:** with a public anon key shipped in every
APK, RLS is the *only* thing standing between shop A and shop B's data. If it's
misconfigured, anyone who unzips the APK can read every shop's records. Get
this wrong and nothing else matters; get it right and the public key is a
non-issue.

---

## 5. Error Handling & Screen States — **FAIL (partially fixed today)**

This is where real defects were found, and where the guides earned their keep.

**Fixed today:**
- `PaymentScreen` swallowed save failures — logged to a console nobody can read,
  reset the button, and looked identical to success. For a debt ledger that is
  the worst possible failure: she believes a credit sale is recorded and it
  isn't. Now states plainly that nothing was saved, and shows the reason.

**Still outstanding — same pattern, other screens:**

| File | Problem |
|---|---|
| `HomeScreen.tsx` | On load failure does `setTabs([])` → renders **"No customer tabs yet."** A database fault is displayed as *"you have no customers."* Worst of the group. |
| `CustomerHistoryScreen.tsx` | Load failure silent; **note save failure silent** — she edits a note, it looks saved, it isn't |
| `AddSaleScreen.tsx` | Catalog load failure silent — pickers would appear empty with no explanation |
| `StaffPickerScreen.tsx` | Roster read and name save failures both silent |

**The principle:** an error state and an empty state are *different facts*, and
collapsing them is a lie the UI tells. "There is nothing" and "I could not find
out" must never look the same — especially here, where "nothing" is a plausible
real answer and she has no way to tell she's being misinformed.

**Other states:** loading indicators present on 4 screens (**PASS**); empty
states present and well-worded (**PASS**); offline correctly *not* treated as
an error, per G8 (**PASS** — and notably better than the guides suggest, which
assume offline is exceptional; here it's normal).

**Console statements:** 10 remain. The guides say strip them for production.
**Partially disagree, deliberately:** all 10 are `console.error`/`warn` on real
fault paths, and in a sideloaded APK with no crash reporting they're the only
diagnostic trail that exists. The right fix is not deletion — it's making the
*user-visible* half honest (above), and later routing these to a log the
developer can retrieve. Deleting them would remove the only evidence a fault
ever happened.

---

## 6. Dependencies — **PASS in effect, with a caveat worth understanding**

`npm audit`: **19 vulnerabilities (18 moderate, 1 high)**.

Before reacting to that number, look at *where* they are: `@expo/cli`,
`@expo/config`, `@expo/metro-config`, `@expo/prebuild-config`, `@expo/ngrok`,
`@react-navigation/*` build paths.

**Every one is build-time tooling that runs on Edd's laptop — none ships in the
APK or runs on the client's phone.** The "high" is `js-yaml` (CPU exhaustion
parsing hostile YAML); it parses *our own* config files during a build. For it
to be exploited, an attacker would need to already control the build machine —
at which point they have far better options.

**The lesson:** severity ratings are context-free; risk is not. The same CVE is
critical in an internet-facing server and irrelevant in a local build tool. Read
*where it runs* before reacting to the colour of the label.

**Actions:** `npm audit fix` for the safe `js-yaml` fix — worth doing. Do **not**
run `npm audit fix --force`: it proposes downgrading to **expo@46**, which would
break the entire SDK 57 project to fix a dev-only issue. That is the checklist
actively leading you into a worse position if followed blindly.

| Check | Result |
|---|---|
| Lock file committed | **PASS** — `package-lock.json` tracked |
| Versions pinned/ranged sanely | **PASS** — Expo-managed compatible ranges |
| No packages from Git URLs/tarballs | **PASS** |

---

## 7. Version Control & Code Quality — **PASS**

| Check | Result |
|---|---|
| Code in Git, pushed to GitHub | **PASS** |
| `.gitignore` correct (env, node_modules, build artifacts, APKs) | **PASS** |
| No secrets in history | **PASS** — verified |
| Clear commit messages | **PASS** |
| No large binaries committed | **PASS** — `*.apk` ignored |
| No commented-out code / TODO-as-bug | **PASS** — grep found none |
| README exists | **FAIL** — none. `CLAUDE.md` serves Claude, not a human contributor |
| Main branch always deployable | **PASS** so far |

**Open risk not in the guides:** the repo is **public**. The spec in `docs/`
describes the client's business operations in detail — her credit exposure,
supplier relationships, revenue leakage. That's a real person's commercial
information, published without her knowledge. Flagged on 2026-08-23; still
public. Making it private costs nothing and closes it.

---

## 8. Testing & QA — **FAIL (improving)**

| Check | Result |
|---|---|
| Typecheck clean | **PASS** — `tsc --noEmit` |
| Bundles for Android | **PASS** |
| Pricing logic verified | **PASS** — airtime checked against all 5 client examples, 2,600 combinations |
| **Tested on a real device** | **PARTIAL** — started 2026-09-14; already found 2 real bugs |
| Tested with realistic data | **FAIL** |
| Someone other than the builder used it | **FAIL** — the client has not seen it |
| Automated tests | **FAIL** — none exist |

**The most valuable lesson in this whole audit:** the overnight build passed
typecheck, bundled cleanly, and unit-tested pricing across 2,600 cases — and
still shipped a bug that told a shopkeeper a debt was fully paid. Five minutes
on a real phone found what 25 minutes of machine verification could not.

Machine verification proves the code *runs*. Only a human doing the real task
proves it's *right*. Both matter; neither substitutes for the other.

---

## 9. Sections that genuinely do not apply — **N/A, with reasons**

Stated explicitly so it's clear they were considered, not skipped.

| Guide section | Why N/A here |
|---|---|
| Frontend vs backend validation | No backend to bypass. Validation runs in the only place that exists. *When Supabase lands, DB constraints become the "backend" check — already in place.* |
| XSS / CSRF / injection via forms | No browser, no DOM, no cookies. React Native renders native views; there is no `innerHTML` to inject into. SQL injection is covered and passing. |
| HTTPS, HSTS, mixed content, security headers, CORS | No web server and no browser. App↔Supabase will use HTTPS by Supabase default when built. |
| Rate limiting / brute force | No public endpoint, no login. |
| File upload security | Receipt photos come from the device camera via the OS picker — not an untrusted upload from a stranger. Type/size are bounded by the OS. |
| Cookies, sessions, tokens | None exist. |
| Hosting / CI-CD / custom domain / CDN | Distribution is a sideloaded APK, by spec. Not a hosted site. |
| Cookie consent / GDPR | Kenyan shop, Kenyan client. DPA 2019 applies instead — addressed in §10. |

---

## 10. Privacy & Kenyan Data Protection Act 2019 — **PASS**

| Check | Result |
|---|---|
| Minimal PII collected | **PASS** — customers are a name + their transactions. No phone, no address, no ID |
| Deliberate exceptions documented | **PASS** — supplier company/director/phone (businesses she must call), per spec |
| No PII in logs | **PASS** — the 10 console statements log error objects, never customer records |
| Data deletion on request | **PASS by design** — developer-side in Supabase (G5 forbids in-app delete) |
| Microphone permission removed | **PASS** — `expo-image-picker` had pulled in `RECORD_AUDIO`; stripped 2026-08-24 |

**Worth noticing:** PII minimisation here wasn't a compliance exercise bolted
on afterwards — the spec designed it in from the start by asking "what did the
paper notebook actually hold?" The cheapest way to protect personal data is to
never collect it. Every field you don't store is a field that can't leak, can't
be subpoenaed, and needs no deletion process.

---

## Findings, in priority order

### Critical — fixed today
1. ~~Sale history showed **"Fully paid" on unpaid debts** and understated sale
   totals; the shortfall was erased entirely~~ → total and owed now derived
   from line items (commit `8f38ff6`)

### High — outstanding
2. **No cloud backup.** One phone, one file, no copy. Data loss is
   business-ending per the spec and nothing currently prevents it.
3. **Error states rendering as empty states** — `HomeScreen` especially: a DB
   failure reads as "No customer tabs yet."
4. **Silent failure on note save** (`CustomerHistoryScreen`) — edit looks saved,
   isn't.

### Medium
5. **Repo is public** with the client's business spec in it.
6. **RLS design + testing** before any real sync work (blocks #2).
7. `npm audit fix` for `js-yaml`. **Never** `--force`.

### Low
8. No README for a human.
9. No automated tests around debt arithmetic — the highest-consequence logic,
   and the place a regression would be least visible.

### Fixed today, lower severity
- Tab bar colliding with Android 3-button navigation (`91442dd`)
- Payment save failing silently (`91442dd`)

---

## What "production ready" means for *this* app

Ignore the generic definition. For a duka owner in Kenya, shipping means:

1. **Her data survives losing the phone** → Supabase sync + verified restore
2. **Every number is right, every time** → derived balances, tested arithmetic
3. **It never blocks her at the counter** → offline-first (already true)
4. **She can use it without being taught twice** → real usability testing with her
5. **Failures announce themselves** → no silent errors anywhere

Items 1, 2 and 5 have known gaps. Item 4 hasn't started. That's the honest
distance between here and live — and none of it is on the PDFs' front page.

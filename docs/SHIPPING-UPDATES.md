# Shipping an update

There is no app store here. The app is sideloaded, so nothing reaches a phone
unless someone puts it there. That is a deliberate trade — no review delays,
no store account, no policy risk — and the cost is that updating is a thing
you do on purpose.

This is how.

---

## The short version

```bash
# 1. bump the version in app.json
# 2. build
eas build --profile preview --platform android
# 3. send her the link EAS prints
# 4. she taps it, downloads, installs over the top
```

Installing over the top **keeps her data**. Android treats it as an upgrade,
not a fresh install, so the database and photos survive. This only holds while
the signing key stays the same, which EAS handles for you as long as you keep
using the same EAS project.

---

## Before you build

**Bump `version` in `app.json`.** Not optional. It is how you and she can tell
which build a phone is running when something is wrong, and "which version are
you on?" is the first question of every bug report you will ever get.

```json
{ "expo": { "version": "1.1.0" } }
```

Use the middle number for changes she would notice, the last for fixes.

**Run the checks.** They take under a minute and they have each caught
something real:

```bash
npm test && npx tsc --noEmit && node tests/check-import-cycles.mjs
```

**Use the `preview` profile, never `development`.** The development build
streams its JavaScript from your laptop and is useless in a shop. `preview`
compiles the JavaScript into the APK, so it runs standalone. The difference is
in `eas.json`; it is the single easiest mistake to make here.

---

## Getting it onto the phones

EAS prints a link when the build finishes. Open it on the phone, download,
install. Android will warn about installing from an unknown source — that
warning is expected and she should accept it. It is worth telling her this in
advance, because the warning is alarming if it arrives unannounced.

A link over WhatsApp is the practical way. It has one property that matters:
you can send it to all three phones at once and they can install whenever they
are free, rather than you touching each phone.

### If a database change is involved

New tables are safe and need nothing: `schema.ts` runs every `CREATE TABLE IF
NOT EXISTS` each time the app opens, so a new table appears on first launch of
the new version.

**Changing or removing an existing column is not covered by that**, and there
is no migration system in this project yet. If you ever need one, write it
before you build, and test it by installing over a copy of a real database —
never by hoping.

---

## After you ship

**Ask her to confirm it opened.** An install that fails leaves the old version
running, which looks like nothing happened — she will not report it.

**Check the version line** in Settings, at the bottom. That is what it is for.

**Keep the previous APK.** EAS artifacts expire — they are a cache, not an
archive, and you have already been bitten by that once. Download the APK and
keep it somewhere of your own. If a new version misbehaves in her shop, being
able to put the last working one back within minutes is worth the few
megabytes.

---

## The rhythm worth aiming for

Batch changes. Every update costs her a download, an install, and a small
moment of doubt about whether her records survived. Three fixes in one
Saturday update is a better trade than three updates in a week, and it gives
you time to test properly rather than shipping straight from a fix.

The exception is anything that loses or corrupts data. Ship that immediately.

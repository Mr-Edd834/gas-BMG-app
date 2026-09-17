// Tests for the arithmetic that decides how much money a customer owes.
//
// Why this file exists: an error here is invisible and expensive. A wrong
// colour is obvious the moment anyone looks; a debt that silently reads KSh 0
// looks exactly like a settled account, and nobody finds out until the money
// is gone. This is the highest-consequence logic in the app, so it is the one
// part with tests.
//
// It tests the REAL module rather than a copy of the rules. That distinction
// matters: a test that re-implements the logic it checks will happily keep
// passing while the actual app breaks. To do that without adding a test
// framework, tsc compiles the sources to CommonJS in a temp folder first and
// the test requires that — see `npm test`.
//
// Run:  npm test

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const rules = require(path.join(here, "..", ".test-build", "debts", "rules.js"));
const ids = require(path.join(here, "..", ".test-build", "refilling", "ids.js"));
const walk = require(path.join(here, "..", ".test-build", "sales", "walkAway.js"));
const draft = require(path.join(here, "..", ".test-build", "refilling", "batchDraft.js"));
const refillReminders = require(path.join(here, "..", ".test-build", "refilling", "reminders.js"));

const {
  saleGoodsTotal,
  debtPrincipal,
  debtOutstanding,
  emptiesOutstanding,
  deadlineFor,
  urgencyOf,
  mostUrgent,
  needsCollecting,
} = rules;

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
  } else {
    failures.push(`${name}\n    got:      ${JSON.stringify(actual)}\n    expected: ${JSON.stringify(expected)}`);
  }
}

// ---------------------------------------------------------------------------
// The bug found on a real phone, 2026-09-14: partial cash paid, credit box
// left blank. The sale history read "Fully paid" and the debt vanished.
// These four lines are the regression guard for it.
// ---------------------------------------------------------------------------
const oneCylinder = [{ qty: 1, unitPrice: 1000 }];
check("goods worth 1000", saleGoodsTotal(oneCylinder), 1000);
check("600 cash against 1000 of goods leaves 400 owed", debtPrincipal(oneCylinder, 600), 400);
check("paying in full owes nothing", debtPrincipal(oneCylinder, 1000), 0);
check("over-payment never becomes a negative debt", debtPrincipal(oneCylinder, 1200), 0);
check("no cash at all owes the lot", debtPrincipal(oneCylinder, 0), 1000);

// A basket, including airtime priced by the 95% rule (10 cards x KSh 9.5 = 95)
const basket = [
  { qty: 2, unitPrice: 1500 },
  { qty: 10, unitPrice: 9.5 },
];
check("multi-line basket totals 3095", saleGoodsTotal(basket), 3095);
check("2000 cash on that basket leaves 1095", debtPrincipal(basket, 2000), 1095);
check("empty sale is worth nothing", saleGoodsTotal([]), 0);

// ---------------------------------------------------------------------------
// Repayments. Spec Part C §2 §2: installments are separate dated events, and
// the balance is recomputed from all of them rather than decremented in place.
// ---------------------------------------------------------------------------
check("a debt with no repayments is untouched", debtOutstanding(400, []), 400);
check("a partial payment reduces it", debtOutstanding(400, [{ amount: 150 }]), 250);
check("three installments clear it exactly",
  debtOutstanding(400, [{ amount: 150 }, { amount: 150 }, { amount: 100 }]), 0);
check("paying more than owed clamps at zero",
  debtOutstanding(400, [{ amount: 500 }]), 0);
check("order of installments does not matter",
  debtOutstanding(400, [{ amount: 100 }, { amount: 300 }]),
  debtOutstanding(400, [{ amount: 300 }, { amount: 100 }]));

// ---------------------------------------------------------------------------
// Empties. Independent of money (spec §1) and settled by carrying metal back.
// ---------------------------------------------------------------------------
check("buy 3, hand back 2 at the counter, 1 owed", emptiesOutstanding(3, 2, []), 1);
check("that last one returned later, 0 owed", emptiesOutstanding(3, 2, [{ qty: 1 }]), 0);
check("buy 3, hand back none, 3 owed", emptiesOutstanding(3, 0, []), 3);
check("a null at-sale count means none were handed back", emptiesOutstanding(3, null, []), 3);
check("several partial returns add up", emptiesOutstanding(5, 1, [{ qty: 1 }, { qty: 2 }]), 1);
check("returning more than taken clamps at zero", emptiesOutstanding(3, 3, [{ qty: 2 }]), 0);

// ---------------------------------------------------------------------------
// Deadlines. G3: 7 days from the sale, fixed, and NEVER reset by a payment.
// ---------------------------------------------------------------------------
const sold = "2026-09-01T10:00:00.000Z";
check("deadline is 7 days after the sale",
  deadlineFor(sold).toISOString().slice(0, 10), "2026-09-08");
check("the day of the sale is on track",
  urgencyOf(sold, new Date("2026-09-01T12:00:00Z")), "on-track");
check("four days in is still on track",
  urgencyOf(sold, new Date("2026-09-05T12:00:00Z")), "on-track");
check("two days before the deadline is due soon",
  urgencyOf(sold, new Date("2026-09-06T12:00:00Z")), "due-soon");
check("the day before is due soon",
  urgencyOf(sold, new Date("2026-09-07T12:00:00Z")), "due-soon");
check("the deadline itself is overdue",
  urgencyOf(sold, new Date("2026-09-08T12:00:00Z")), "overdue");
check("a month later is still overdue",
  urgencyOf(sold, new Date("2026-10-01T12:00:00Z")), "overdue");

// G3 explicitly: a partial payment must not move the deadline.
const deadlineBefore = deadlineFor(sold).toISOString();
debtOutstanding(400, [{ amount: 200 }]);
check("a repayment does not move the deadline",
  deadlineFor(sold).toISOString(), deadlineBefore);

// ---------------------------------------------------------------------------
// A customer card wears their worst debt's dot (spec §7).
// ---------------------------------------------------------------------------
check("worst of a mixed set wins",
  mostUrgent(["on-track", "overdue", "due-soon"]), "overdue");
check("due-soon beats on-track", mostUrgent(["on-track", "due-soon"]), "due-soon");
check("all clear stays clear", mostUrgent(["on-track", "on-track"]), "on-track");
check("no debts at all is on track", mostUrgent([]), "on-track");
check("overdue needs collecting", needsCollecting("overdue"), true);
check("due soon needs collecting", needsCollecting("due-soon"), true);
check("on track does not", needsCollecting("on-track"), false);

// ---------------------------------------------------------------------------
// Refilling identifiers (spec Part C §4 §6). These are read aloud off a paper
// receipt and matched by eye, so getting them subtly wrong is expensive.
// ---------------------------------------------------------------------------
const { deriveCompanyCode, uniqueCompanyCode, batchDatePart, buildBatchCode } = ids;

check("initials of a hyphenated name", deriveCompanyCode("K-Gas Depot"), "KGD");
check("dots and slashes separate words too", deriveCompanyCode("K.Gas / Depot"), "KGD");
check("ampersand separates", deriveCompanyCode("Gas & Go Refills"), "GGR");
check("comma separates", deriveCompanyCode("Total Gas, Nairobi"), "TGN");
check("a single word takes three letters", deriveCompanyCode("Afrigas"), "AFR");
check("two words give two letters", deriveCompanyCode("Sea Gas"), "SG");
check("never more than three letters", deriveCompanyCode("Total Gas Depot Kenya"), "TGD");
check("an empty name still yields a code", deriveCompanyCode(""), "REF");

check("a free code is used as-is", uniqueCompanyCode("K-Gas Depot", ["AFR"]), "KGD");
check("a clash appends a digit", uniqueCompanyCode("Thika Gas Dealers", ["TGD"]), "TGD2");
check("and keeps counting", uniqueCompanyCode("Thika Gas Dealers", ["TGD", "TGD2"]), "TGD3");
check("clash check ignores case", uniqueCompanyCode("K-Gas Depot", ["kgd"]), "KGD2");

check("letter month, never numeric", batchDatePart(new Date(2026, 6, 11)), "11JUL26");
check("day is zero-padded", batchDatePart(new Date(2026, 0, 5)), "05JAN26");
check("december", batchDatePart(new Date(2026, 11, 31)), "31DEC26");

check("full batch id", buildBatchCode("KGD", new Date(2026, 6, 11), 0), "KGD-11JUL26-01");
check("second load the same day", buildBatchCode("KGD", new Date(2026, 6, 11), 1), "KGD-11JUL26-02");
check("tenth load the same day", buildBatchCode("KGD", new Date(2026, 6, 11), 9), "KGD-11JUL26-10");

// ---------------------------------------------------------------------------
// Walking away from an open picker (the add-sale flow). Found on a real phone
// 2026-09-17: fill in cylinders, tap Airtime without pressing Add, and every
// cylinder entry was gone. These decide whether typed-in sales are kept.
// ---------------------------------------------------------------------------
const { statusOfLines, resolveWalkAway, withRestored } = walk;

const priced = (key, price = 1500) => ({
  key, commodity: "cylinder", label: `K-Gas · ${key}`, brandOrSupplier: "K-Gas",
  sizeOrDenomination: "Big", qty: 1, unitPrice: price, isAutoPriced: false,
  emptiesReturned: 0, packs: null, singles: null,
});
const airtime = (key) => ({
  key, commodity: "airtime", label: "Safaricom 10 airtime", brandOrSupplier: "Safaricom",
  sizeOrDenomination: "10", qty: 10, unitPrice: 9.5, isAutoPriced: true,
  emptiesReturned: null, packs: 1, singles: 0,
});

check("no lines is empty", statusOfLines([]), "empty");
check("a priced line is ready", statusOfLines([priced("a")]), "ready");
check("a line with no price is incomplete", statusOfLines([priced("a", 0)]), "incomplete");
check("one unpriced line makes the whole draft incomplete",
  statusOfLines([priced("a"), priced("b", 0)]), "incomplete");
check("airtime is exempt from the price rule", statusOfLines([airtime("t")]), "ready");

const fresh = (commodity) => ({ commodity, editing: null });
const draftState = { brand: "K-Gas", sizes: {} };

// THE bug: a finished picker walked away from must land in the cart.
{
  const r = resolveWalkAway({
    open: fresh("cylinder"), lines: [priced("a")], state: draftState,
    cart: [], drafts: {},
  });
  check("walking away from a finished picker adds it", r.cart.map((l) => l.key), ["a"]);
  check("and leaves no draft behind", r.drafts, {});
}
{
  const r = resolveWalkAway({
    open: fresh("cylinder"), lines: [priced("a", 0)], state: draftState,
    cart: [], drafts: {},
  });
  check("an unfinished picker is NOT added (no silent zero price)", r.cart, []);
  check("but its entries are kept as a draft", r.drafts, { cylinder: draftState });
}
{
  const r = resolveWalkAway({
    open: fresh("cylinder"), lines: [], state: draftState,
    cart: [priced("x")], drafts: { cylinder: draftState },
  });
  check("an emptied picker clears its old draft", r.drafts, {});
  check("and leaves the cart alone", r.cart.map((l) => l.key), ["x"]);
}
{
  const r = resolveWalkAway({
    open: fresh("cylinder"), lines: [priced("a")], state: draftState,
    cart: [priced("x")], drafts: {},
  });
  check("an auto-added picker goes AFTER existing lines", r.cart.map((l) => l.key), ["x", "a"]);
}
{
  const r = resolveWalkAway({
    open: fresh("airtime"), lines: [airtime("t")], state: { supplier: "Safaricom", denoms: {} },
    cart: [], drafts: { cylinder: draftState },
  });
  check("resolving airtime keeps a cylinder draft untouched", r.drafts, { cylinder: draftState });
}
{
  const r = resolveWalkAway({ open: null, lines: [], state: null, cart: [priced("x")], drafts: {} });
  check("nothing open changes nothing", r.cart.map((l) => l.key), ["x"]);
}

// Edits: never lose a line the sale already had.
{
  const original = priced("orig");
  const cartWithout = [priced("x"), priced("y")];
  const editing = { line: original, index: 1 };

  const ok = resolveWalkAway({
    open: { commodity: "cylinder", editing }, lines: [priced("edited", 2000)],
    state: draftState, cart: cartWithout, drafts: {},
  });
  check("a finished edit is kept, in its original place",
    ok.cart.map((l) => l.key), ["x", "edited", "y"]);

  const broken = resolveWalkAway({
    open: { commodity: "cylinder", editing }, lines: [priced("edited", 0)],
    state: draftState, cart: cartWithout, drafts: {},
  });
  check("an unfinished edit puts the ORIGINAL back, unchanged",
    broken.cart.map((l) => l.key), ["x", "orig", "y"]);
  check("and does not become a draft", broken.drafts, {});

  const emptied = resolveWalkAway({
    open: { commodity: "cylinder", editing }, lines: [],
    state: draftState, cart: cartWithout, drafts: {},
  });
  check("an emptied edit also restores the original",
    emptied.cart.map((l) => l.key), ["x", "orig", "y"]);
}

check("withRestored with nothing out for edit is a no-op",
  withRestored([priced("x")], null).map((l) => l.key), ["x"]);
check("withRestored puts a line back at index 0",
  withRestored([priced("x")], { line: priced("o"), index: 0 }).map((l) => l.key), ["o", "x"]);

// ---------------------------------------------------------------------------
// REFILLING — the send/return grid (src/refilling/batchDraft.ts)
//
// This is the arithmetic that decides how many cylinders left the shop and how
// many came back. It feeds the shared stock ledger, so an error here does not
// just look wrong on one screen — it permanently skews full stock and empties
// in hand for every screen that derives from them.
// ---------------------------------------------------------------------------
const {
  countKey,
  countAt,
  setCount,
  draftLines,
  totalCylinders,
  brandTouched,
  saveBlockedBecause,
} = draft;

check("an untouched cell reads zero", countAt({}, "K-Gas", "Big"), 0);
check("setting a cell stores it under brand|size",
  setCount({}, "K-Gas", "Big", 3), { "K-Gas|Big": 3 });
check("setting back to zero removes the cell rather than storing a zero",
  setCount({ "K-Gas|Big": 3 }, "K-Gas", "Big", 0), {});
check("a negative is clamped to zero, not stored",
  setCount({}, "K-Gas", "Big", -2), {});
check("setCount never mutates the map it was given", (() => {
  const before = { "K-Gas|Big": 1 };
  setCount(before, "K-Gas", "Big", 5);
  return before;
})(), { "K-Gas|Big": 1 });

// The cap is the whole safety of a partial return: returning more than went
// out would drive "still out" negative and inflate full stock forever.
check("a return is capped at what is still out",
  setCount({}, "K-Gas", "Big", 9, 4), { "K-Gas|Big": 4 });
check("a return at exactly the cap is allowed",
  setCount({}, "K-Gas", "Big", 4, 4), { "K-Gas|Big": 4 });
check("a cap of zero blocks the cell entirely",
  setCount({}, "K-Gas", "Big", 3, 0), {});

check("draft lines drop zeroes and sort by brand then size",
  draftLines({ "Total Gas|Small": 2, "Afrigas|Big": 1, "Afrigas|Small": 0 }),
  [
    { brand: "Afrigas", size: "Big", qty: 1 },
    { brand: "Total Gas", size: "Small", qty: 2 },
  ]);
check("the total adds every size of every brand",
  totalCylinders({ "K-Gas|Big": 2, "K-Gas|Small": 1, "Afrigas|Big": 4 }), 7);
check("an empty grid totals zero", totalCylinders({}), 0);

check("a brand with any size set counts as touched",
  brandTouched({ "K-Gas|Small": 1 }, "K-Gas"), true);
check("a brand left at zero is not touched",
  brandTouched({ "K-Gas|Big": 0 }, "K-Gas"), false);
// A prefix match would light up "Gold Gas" when only "Gold" was set.
check("a brand whose name prefixes another is not touched by it",
  brandTouched({ "Gold Gas|Big": 2 }, "Gold"), false);
check("a brand-name separator inside the key does not confuse the match",
  brandTouched({ "K-Gas|Big": 2 }, "K-Gas"), true);
check("countKey is the format the rest of the module assumes",
  countKey("K-Gas", "Big"), "K-Gas|Big");

// The save rule, and — just as important — the REASON, which the screen shows
// as a line of amber text. A disabled button with no explanation is the thing
// people tap repeatedly and then give up on.
check("no cylinders blocks the save",
  saveBlockedBecause({ counts: {}, cylinderPhotos: ["a.jpg"] }), "no-cylinders");
check("no photo blocks the save",
  saveBlockedBecause({ counts: { "K-Gas|Big": 1 }, cylinderPhotos: [] }), "no-photo");
check("missing cylinders is reported before a missing photo",
  saveBlockedBecause({ counts: {}, cylinderPhotos: [] }), "no-cylinders");
check("cylinders plus a photo is allowed",
  saveBlockedBecause({ counts: { "K-Gas|Big": 1 }, cylinderPhotos: ["a.jpg"] }), null);

// ---------------------------------------------------------------------------
// REFILLING — batch reminders (src/refilling/reminders.ts)
// ---------------------------------------------------------------------------
const { refillNudges, refillNudgeCopy } = refillReminders;

{
  const sent = new Date(2026, 6, 11, 16, 30); // 11 July 2026, 4:30pm
  const justAfter = new Date(2026, 6, 11, 17, 0);
  const nudges = refillNudges(sent, justAfter);

  check("a fresh batch gets both the check and the overdue nudge",
    nudges.map((n) => n.kind), ["check", "overdue"]);
  check("the check lands three days later", nudges[0].at.getDate(), 14);
  check("the overdue nudge lands seven days later", nudges[1].at.getDate(), 18);
  // Not "72 hours to the minute" — a 4:30pm batch must not ring at 4:30pm, in
  // the middle of the evening rush.
  check("both fire at the reminder hour, not the hour it was sent",
    [nudges[0].at.getHours(), nudges[1].at.getHours()], [9, 9]);
  check("and on the minute", nudges[0].at.getMinutes(), 0);
}
{
  const sent = new Date(2026, 6, 11, 16, 30);
  const day5 = new Date(2026, 6, 16, 12, 0);
  check("a nudge already in the past is dropped, the later one survives",
    refillNudges(sent, day5).map((n) => n.kind), ["overdue"]);
  const day9 = new Date(2026, 6, 20, 12, 0);
  check("a long-overdue batch schedules nothing new",
    refillNudges(sent, day9), []);
}
check("a batch sent across a month boundary rolls the date over",
  refillNudges(new Date(2026, 6, 30, 8, 0), new Date(2026, 6, 30, 9, 0))[0].at.getMonth(),
  7);
check("an unreadable timestamp yields no reminders rather than throwing",
  refillNudges("not a date"), []);

check("the check nudge names the company and what is still out",
  refillNudgeCopy({ kind: "check", companyName: "K-Gas Depot", batchCode: "KGD-11JUL26-01", stillOut: 4 }),
  { title: "Check on K-Gas Depot", body: "4 cylinders still out on batch KGD-11JUL26-01." });
check("one cylinder is not called cylinders",
  refillNudgeCopy({ kind: "overdue", companyName: "Afrigas", batchCode: "AFR-01AUG26-02", stillOut: 1 }).body,
  "Batch AFR-01AUG26-02: 1 cylinder still not back.");

// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.log(`\n${failures.length} FAILED:\n`);
  for (const f of failures) console.log(`  ✖ ${f}\n`);
  console.log(`${pass} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✔ ${pass} passed`);

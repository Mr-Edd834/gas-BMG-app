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
if (failures.length > 0) {
  console.log(`\n${failures.length} FAILED:\n`);
  for (const f of failures) console.log(`  ✖ ${f}\n`);
  console.log(`${pass} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✔ ${pass} passed`);

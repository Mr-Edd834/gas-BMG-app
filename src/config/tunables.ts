// Values the spec deliberately left tunable rather than locked. They live here
// (not buried in a component) so Settings can surface them later without a
// hunt — same reasoning as AIRTIME_RATE in src/catalog/seed.ts.

// Low-stock warning threshold, spec Part C §1 §7b: "at/below a small threshold
// (tunable; default e.g. ≤2)". Purely informational — it MUST NEVER block a
// sale, and selling into negative stock stays allowed.
export const LOW_STOCK_THRESHOLD = 2;

// How many cylinder brands float to the top of the picker as "recent"
// (spec Part C §1 §5, "Recently-used brands float to the top").
export const RECENT_BRAND_COUNT = 3;

// Receipt photo compression, spec Part C §3 §6 — an explicitly OPEN decision
// ("full original" vs "light compression" vs something between), which that
// spec also calls "a tunable parameter, not an architecture change".
// Set to the middle path it describes: the receipt stays legible, files stay
// a few hundred KB, so sync is fast on poor signal and local storage fills
// slowly. Change this one number if Edd wants pristine originals instead.
export const RECEIPT_PHOTO_QUALITY = 0.8;

// How long a credit sale has before it is due, spec Part C §2 §2 (G3). This is
// LOCKED at one week by the spec, not a preference — it is here so the number
// appears exactly once rather than being retyped in the debt list, the record
// and the reminder scheduler, where the three could drift apart.
export const DEBT_DEADLINE_DAYS = 7;

// "Due soon" window, spec Part C §2 §7 — explicitly OPEN and "a one-line
// change" if the client wants 1 or 3 days instead. Days BEFORE the deadline at
// which a debt starts showing an amber dot.
export const DUE_SOON_DAYS = 2;

// Reports, spec Part C §5 §7 (all three explicitly flagged tunable there).
// SLOW_PAYER_DAYS is the average days-to-clear at which a customer's settle
// speed is worth noticing. It describes a habit, and it never advises: the
// screen flags the number, it does not suggest refusing anyone credit.
export const SLOW_PAYER_DAYS = 14;
export const TOP_DEBTORS_LIMIT = 5;
export const PRODUCT_RANK_LIMIT = 5;

// Refill batch reminders, spec Part C §4 §8: a "check on these" nudge three
// days after a batch is sent, then an overdue nudge at seven. Unlike a debt
// deadline these are not a promise anyone made — no refiller agreed to three
// days — they are just when it is worth asking. That is why they live here as
// tunables rather than in the reminder code as constants.
export const REFILL_CHECK_DAYS = 3;
export const REFILL_OVERDUE_DAYS = 7;

// Reminder time of day, spec Part C §2 §8: "a fixed set time each day —
// default 09:00", chosen as a calm morning slot before the day's rush.
// Settings will later let her change the hour; the day-6/day-7 schedule logic
// itself is locked and NOT user-controllable.
export const REMINDER_HOUR = 9;

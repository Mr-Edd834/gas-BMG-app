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

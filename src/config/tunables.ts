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

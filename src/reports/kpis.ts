// The arithmetic behind every figure in Reports (spec Part C §5 §4).
//
// Pure: no React, no Expo, no database. Reports is a lens over records that
// already exist — it captures nothing — so all of it reduces to "given these
// rows, what is the number?". That makes it the most testable section in the
// app, and the one where a silent error is hardest to notice: a wrong debt
// shows up when someone argues about it, but a wrong KPI just quietly
// misinforms her about her own business, forever.
//
// Two rules run through the whole file:
//   - A number that cannot be computed is `null`, never 0. "No settled debts
//     yet" and "settles in 0 days" are opposite facts (spec §4.6), and
//     rendering them the same way is a lie the screen tells for free.
//   - Nothing here advises. Every function answers "what happened", never
//     "what should she do" (spec §1).

export type Range = "today" | "week" | "month";

export interface Bounds {
  start: Date;
  end: Date;
}

export interface Bucket {
  label: string;
  start: Date;
  end: Date;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

/**
 * Monday-based weekday index (0 = Monday … 6 = Sunday).
 *
 * JavaScript's `getDay()` puts Sunday at 0, which would make Sunday the first
 * column of "busiest days" — wrong for a Kenyan duka's trading week, and
 * wrong for how anyone here reads a week.
 */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() - weekdayIndex(out));
  return out;
}

/** The window a ranged KPI covers. Calendar periods, not rolling windows. */
export function rangeBounds(range: Range, now: Date = new Date()): Bounds {
  if (range === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (range === "week") {
    return { start: startOfWeek(now), end: endOfDay(now) };
  }
  const start = startOfDay(now);
  start.setDate(1);
  return { start, end: endOfDay(now) };
}

/**
 * The buckets a trend is drawn over: days across a week, weeks across a month.
 *
 * "Today" deliberately falls back to the week's buckets (spec §4.3) — a single
 * day has no shape, and a one-point trend line is a number pretending to be a
 * chart. The screen says so rather than silently showing something else.
 *
 * Buckets stop at today: a week viewed on Tuesday has two buckets, not seven
 * with five empty ones. Five empty future days would drag a credit-reliance
 * average toward nothing and read as a collapse in trade.
 */
export function bucketsFor(range: Range, now: Date = new Date()): Bucket[] {
  if (range === "month") {
    const { start } = rangeBounds("month", now);
    const buckets: Bucket[] = [];
    let cursor = new Date(start);
    let index = 1;
    while (cursor <= now) {
      const bucketEnd = new Date(cursor);
      bucketEnd.setDate(bucketEnd.getDate() + 6);
      buckets.push({
        label: `Week ${index}`,
        start: new Date(cursor),
        end: endOfDay(bucketEnd < now ? bucketEnd : now),
      });
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 7);
      index += 1;
    }
    return buckets;
  }

  // Both "today" and "week" draw the week's days.
  const start = startOfWeek(now);
  const buckets: Bucket[] = [];
  for (let i = 0; i <= weekdayIndex(now); i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    buckets.push({
      label: DAY_LABELS[i],
      start: startOfDay(day),
      end: endOfDay(day),
    });
  }
  return buckets;
}

export function isWithin(at: string | Date, bounds: Bounds): boolean {
  const t = typeof at === "string" ? new Date(at) : at;
  return t >= bounds.start && t <= bounds.end;
}

// ---------------------------------------------------------------------------
// Credit reliance (spec §4.3)
// ---------------------------------------------------------------------------

export interface SaleTotals {
  at: string;
  total: number;
  credit: number;
}

export interface ReliancePoint {
  label: string;
  // null, not 0: a day with no trade has no credit share. Plotting it as 0%
  // would draw a reassuring dip on exactly the days she sold nothing.
  percent: number | null;
  total: number;
}

export type Severity = "low" | "watch" | "high";

/**
 * Severity of a credit share (spec §4.3): <30% low, 30–40% watch, ≥40% high.
 *
 * Named by severity rather than by colour so the thresholds survive a redesign,
 * and so this file never has an opinion about pixels.
 */
export function relianceSeverity(percent: number): Severity {
  if (percent < 30) return "low";
  if (percent < 40) return "watch";
  return "high";
}

export function creditReliance(
  sales: SaleTotals[],
  buckets: Bucket[]
): { points: ReliancePoint[]; average: number | null } {
  const points = buckets.map((bucket) => {
    let total = 0;
    let credit = 0;
    for (const sale of sales) {
      if (!isWithin(sale.at, bucket)) continue;
      total += sale.total;
      credit += sale.credit;
    }
    return {
      label: bucket.label,
      total,
      percent: total > 0 ? (credit / total) * 100 : null,
    };
  });

  // The average spans only buckets that actually traded. Including empty days
  // as zeroes would make a shop that closed on Sunday look like it reduced its
  // credit exposure.
  const traded = points.filter((p) => p.percent !== null) as {
    percent: number;
  }[];
  const average =
    traded.length === 0
      ? null
      : traded.reduce((sum, p) => sum + p.percent, 0) / traded.length;

  return { points, average };
}

// ---------------------------------------------------------------------------
// Slow payers — signal 1, historical settle speed (spec §4.6)
// ---------------------------------------------------------------------------

export interface DebtHistory {
  takenAt: string;
  principal: number;
  repayments: { at: string; amount: number }[];
}

/** Whole calendar days between two instants. */
export function dayGap(from: string | Date, to: string | Date): number {
  const a = startOfDay(typeof from === "string" ? new Date(from) : from);
  const b = startOfDay(typeof to === "string" ? new Date(to) : to);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * How many days one debt took to clear, or null if it never did.
 *
 * Measured to the payment that brings the balance to ZERO — the final
 * instalment — not to each partial along the way (spec §4.6). A debt half-paid
 * on day 2 and finished on day 30 took thirty days; counting the day-2 payment
 * would report it as fast, which is the opposite of the truth she needs.
 *
 * Calendar days, not elapsed hours: a debt taken Monday afternoon and settled
 * Wednesday morning is two days to a person, and 1.7 to a subtraction.
 */
export function daysToClear(debt: DebtHistory): number | null {
  if (debt.principal <= 0) return null;

  const ordered = [...debt.repayments].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );

  let paid = 0;
  for (const payment of ordered) {
    paid += payment.amount;
    // `>=` rather than `===`: an overpayment still settles the debt, and a
    // rounding difference of one shilling must not leave a cleared debt
    // counted as open forever.
    if (paid >= debt.principal) return Math.max(0, dayGap(debt.takenAt, payment.at));
  }
  return null;
}

export interface SettleSpeed {
  // null means "no settled debts yet" — a real and common answer in the app's
  // first weeks, and NOT the same as settling instantly (spec §4.6).
  avgDays: number | null;
  settledCount: number;
}

/**
 * A customer's average days-to-clear across their settled debts.
 *
 * A simple mean, each settled debt counting once regardless of size (locked by
 * the spec). Weighting by amount would let one large slow debt brand an
 * otherwise reliable customer, when what she is judging is a habit, not a sum.
 *
 * Open debts are excluded: you cannot measure how long something took to
 * finish while it is still going.
 */
export function settleSpeed(debts: DebtHistory[]): SettleSpeed {
  const settled = debts
    .map(daysToClear)
    .filter((days): days is number => days !== null);

  if (settled.length === 0) return { avgDays: null, settledCount: 0 };
  return {
    avgDays: settled.reduce((sum, d) => sum + d, 0) / settled.length,
    settledCount: settled.length,
  };
}

// ---------------------------------------------------------------------------
// Rankings (spec §4.7) and busiest days (spec §4.8)
// ---------------------------------------------------------------------------

export interface ProductTotals {
  label: string;
  qty: number;
  revenue: number;
}

export type Metric = "qty" | "revenue";
export type Direction = "best" | "slow";

/**
 * Best sellers and slow movers.
 *
 * `catalogLabels` matters more than it looks. Sales data only contains things
 * that SOLD, so ranking it from the bottom finds the least-sold item that
 * still sold at least once — while the genuinely slowest mover, the stock that
 * shifted nothing all month, is invisible precisely because it generated no
 * rows. Passing the catalog zero-fills those back in, so "slow" means slow.
 */
export function rankProducts(
  sold: ProductTotals[],
  options: {
    metric: Metric;
    direction: Direction;
    limit: number;
    catalogLabels?: string[];
  }
): ProductTotals[] {
  const byLabel = new Map(sold.map((p) => [p.label, p]));

  if (options.direction === "slow" && options.catalogLabels) {
    for (const label of options.catalogLabels) {
      if (!byLabel.has(label)) {
        byLabel.set(label, { label, qty: 0, revenue: 0 });
      }
    }
  }

  const rows = [...byLabel.values()].sort((a, b) => {
    const diff = b[options.metric] - a[options.metric];
    // A stable tiebreak, so two products on equal quantity do not swap places
    // between renders and make the list look like it is changing.
    return diff !== 0 ? diff : a.label.localeCompare(b.label);
  });

  const picked =
    options.direction === "best"
      ? rows.slice(0, options.limit)
      : rows.slice(-options.limit).reverse();

  return picked;
}

export interface DayCount {
  label: string;
  count: number;
}

/**
 * Sales per day of the week within the range (spec §4.8).
 *
 * All seven days are always returned, including the quiet ones — a missing
 * Sunday and a Sunday with no trade look identical on a chart that only plots
 * what exists, and only one of them is true.
 */
export function busiestDays(sales: { at: string }[]): DayCount[] {
  const counts = new Array(7).fill(0);
  for (const sale of sales) {
    counts[weekdayIndex(new Date(sale.at))] += 1;
  }
  return DAY_LABELS.map((label, i) => ({ label, count: counts[i] }));
}

/** The share each slice takes of a whole, for the debt-by-commodity bar. */
export function shareOf(value: number, total: number): number {
  return total <= 0 ? 0 : (value / total) * 100;
}

// ---------------------------------------------------------------------------
// Borrowing volume, and the borrowing-vs-repayment picture
// ---------------------------------------------------------------------------

/**
 * How much credit one customer took within a window.
 *
 * This is deliberately NOT "what they owe now". A customer who takes 30,000/-
 * on credit every month and clears it perfectly never appears in the Debts
 * tab at all — and is still the largest credit exposure in the business. What
 * they currently owe is a collections question and the Debts section answers
 * it; how heavily they lean on credit is a pattern over time, which is the
 * only kind of question Reports exists to answer.
 */
export function creditTakenWithin(
  debts: DebtHistory[],
  bounds: Bounds
): { amount: number; count: number } {
  let amount = 0;
  let count = 0;
  for (const debt of debts) {
    if (!isWithin(debt.takenAt, bounds)) continue;
    amount += debt.principal;
    count += 1;
  }
  return { amount, count };
}

/**
 * The middle value, used as the dividing line on the borrowing chart.
 *
 * A median rather than a mean, because one customer who borrows ten times more
 * than anyone else would drag a mean above almost every real data point and
 * leave the "borrows a lot" half of the chart containing only them. The median
 * splits the customers she actually has, which is the comparison she is making.
 */
export function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type Quadrant =
  | "reliable-big"
  | "risky-big"
  | "reliable-small"
  | "risky-small";

/**
 * Which corner of the borrowing-vs-repayment chart a customer falls in.
 *
 * The whole value of plotting these two facts together is that neither one
 * alone identifies the customers that matter. Borrowing a lot is not a
 * problem — it is the business working. Paying slowly on a small balance is
 * an irritation. The two at once is the actual exposure, and on a chart it is
 * simply the top-right corner, with no score to interpret.
 *
 * Descriptive, never advisory (spec §1): these names describe where a point
 * sits. The app never suggests refusing anyone credit.
 */
export function quadrantOf(
  point: { credit: number; avgDays: number },
  thresholds: { credit: number; days: number }
): Quadrant {
  const big = point.credit >= thresholds.credit;
  const slow = point.avgDays >= thresholds.days;
  if (big) return slow ? "risky-big" : "reliable-big";
  return slow ? "risky-small" : "reliable-small";
}

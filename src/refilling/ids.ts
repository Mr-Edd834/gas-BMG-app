// Human-readable identifiers for refilling (spec Part C §4 §6).
//
// These exist because a batch's returns arrive scattered over days or weeks,
// and something has to tie a Tuesday delivery back to the pile that left the
// previous Wednesday. A UUID would do that for the database and be useless to
// a person — she is reading a paper receipt from a lorry driver, out loud,
// over a phone call. So the ID is built to be spoken and matched by eye.

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/**
 * A company's short code, derived from its name: "K-Gas Depot" → "KGD".
 *
 * Initials of the first two or three words, so it reads as an abbreviation of
 * something rather than a random string. Falls back to the first letters of a
 * single-word name ("Afrigas" → "AFR") so every company gets a code without
 * asking her to invent one — a field she would have to think about is a field
 * that slows down a task she does while a lorry waits.
 */
export function deriveCompanyCode(name: string): string {
  // Split on every character a business name uses to join words, not just
  // whitespace: "K-Gas Depot", "K.Gas/Depot" and "K Gas & Depot" are the same
  // company written three ways and must all reduce to KGD. Missing one of
  // these silently produces a different code for the same name.
  const words = name
    .split(/[\s\-_/.,&]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter((w) => w.length > 0);

  if (words.length === 0) return "REF";

  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase().padEnd(2, "X");
  }

  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * Makes a derived code unique against the codes already in use.
 *
 * Two companies can easily reduce to the same initials ("Total Gas Depot" and
 * "Thika Gas Dealers" are both TGD), and a duplicated code would make batch IDs
 * ambiguous — which defeats the only reason they exist. A digit is appended
 * rather than re-deriving from a different part of the name, so the code still
 * visibly belongs to the company it came from.
 */
export function uniqueCompanyCode(name: string, taken: string[]): string {
  const base = deriveCompanyCode(name);
  const used = new Set(taken.map((c) => c.toUpperCase()));
  if (!used.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}${Date.now() % 1000}`;
}

/**
 * The date half of a batch ID: 11 July 2026 → "11JUL26".
 *
 * A letter month on purpose. "11/07/26" is read as 11 July by her and as
 * 7 November by half the internet, and a refilling receipt is exactly the kind
 * of document that gets read by someone other than the person who wrote it.
 */
export function batchDatePart(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mon = MONTHS[date.getMonth()];
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mon}${yy}`;
}

/**
 * A full batch ID: CODE-DDMMMYY-NN, e.g. "KGD-11JUL26-01".
 *
 * Company first, because "whose batch is this?" is the first question asked
 * about one — it reads left to right like a sentence: K-Gas Depot, 11 July,
 * batch 01. `sameDayCount` is how many batches already went to this company
 * today, so a second load on the same afternoon is -02 rather than a collision.
 */
export function buildBatchCode(
  companyCode: string,
  date: Date,
  sameDayCount: number
): string {
  const seq = String(sameDayCount + 1).padStart(2, "0");
  return `${companyCode}-${batchDatePart(date)}-${seq}`;
}

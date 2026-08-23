// Money is always displayed as "KSh <comma-grouped>" — spec Part C §1 "Home/Sales" §1.
//
// The grouping is done by hand rather than via toLocaleString/Intl: this is a
// hard app-wide display rule, and whether a given Hermes/Android build ships
// full Intl data is not something this app should depend on. A plain string
// walk gives the same answer on every device.
function groupThousands(digits: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    // Insert a separator before every group of three counted from the right.
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return out;
}

export function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return "KSh 0";
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `KSh ${sign}${groupThousands(String(Math.abs(rounded)))}`;
}

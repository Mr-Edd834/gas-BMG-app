// Money is always displayed as "KSh <comma-grouped>" — spec Part C §1 "Home/Sales" §1.
export function formatMoney(amount: number): string {
  const rounded = Math.round(amount);
  return `KSh ${rounded.toLocaleString("en-KE")}`;
}

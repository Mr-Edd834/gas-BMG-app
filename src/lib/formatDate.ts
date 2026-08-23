// Date/time rendering. The spec fixes one timestamp format app-wide
// (spec Part C §1 §3): `DD/MM/YYYY · h:mm AM/PM`.

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const hours24 = d.getHours();
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${pad(d.getMinutes())} ${suffix}`;
}

// The canonical stamp used on tab cards, sale cards and the "Logged by" footer.
export function formatDateTime(iso: string | Date): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

// The Home screen's date line — small uppercase, today's real date
// (spec Part C §1 §3). Never a hardcoded placeholder date (G7).
export function formatDateLine(date: Date = new Date()): string {
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const day = date.getDate();
  const month = date.toLocaleDateString("en-GB", { month: "long" });
  return `${weekday}, ${day} ${month} ${date.getFullYear()}`.toUpperCase();
}

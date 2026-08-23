import { PlaceholderScreen } from "./PlaceholderScreen";

// The five sections after Home/Sales in the build order (CLAUDE.md). Each
// summary is the section's own one-line purpose from its spec, so the nav is
// honest about what will live here — no invented figures, no demo content.

export function DebtsScreen() {
  return (
    <PlaceholderScreen
      title="Debts"
      buildOrder={2}
      summary="Money owed and empties owed, repayments and reminders."
    />
  );
}

export function SalesRecordScreen() {
  return (
    <PlaceholderScreen
      title="Sales Record"
      buildOrder={3}
      summary="The global, read-only log of every sale."
    />
  );
}

export function RefillingScreen() {
  return (
    <PlaceholderScreen
      title="Refilling"
      buildOrder={4}
      summary="Supplier companies, batches sent for refilling, and returns."
    />
  );
}

export function ReportsScreen() {
  return (
    <PlaceholderScreen
      title="Reports"
      buildOrder={5}
      summary="KPIs computed at read time from the sales and stock history."
    />
  );
}

export function SettingsScreen() {
  return (
    <PlaceholderScreen
      title="Settings"
      buildOrder={6}
      summary="Catalog editor, opening stock count, and storage controls."
    />
  );
}

import { PlaceholderScreen } from "./PlaceholderScreen";

// The sections still to be built, in build order (CLAUDE.md). Each summary is
// the section's own one-line purpose from its spec, so the nav is honest about
// what will live here — no invented figures, no demo content.
//
// Built sections have left this file: Debts is in ./debts/DebtsScreen, Sales
// Record is in ./salesRecord/SalesRecordScreen, and Refilling is in
// ./refilling/RefillingScreen.

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

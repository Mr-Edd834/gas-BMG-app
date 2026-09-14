import { StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";
import type { Urgency } from "../debts/rules";

// Urgency as a small coloured dot (spec Part C §2 §7).
//
// The spec explicitly REMOVED per-row day counts ("3d overdue") as clutter and
// replaced them with this. The reasoning is worth keeping: at a counter she
// needs to know who to chase, not to read arithmetic. A dot answers that in
// peripheral vision, and a wall of them sorts itself visually without being
// read at all. Do not reintroduce countdown text.
//
// Red is used here — the one place the app allows it — because a passed
// deadline is a fact, not a mood. Money merely owed stays amber throughout.
export function StatusDot({ urgency }: { urgency: Urgency }) {
  if (urgency === "on-track") {
    // Deliberately nothing. An absent dot IS the "on track" state: marking
    // every healthy row would make the urgent ones stop standing out, which
    // is the entire job of this control.
    return <View style={styles.spacer} />;
  }
  return (
    <View
      accessibilityLabel={urgency === "overdue" ? "Overdue" : "Due soon"}
      style={[
        styles.dot,
        urgency === "overdue" ? styles.overdue : styles.dueSoon,
      ]}
    />
  );
}

const SIZE = 9;

const styles = StyleSheet.create({
  // Keeps names aligned whether or not a row has a dot, so the column of
  // names stays straight and the dots read as a column of their own.
  spacer: {
    width: SIZE,
    height: SIZE,
  },
  dot: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  overdue: {
    backgroundColor: colors.overpaid,
  },
  dueSoon: {
    backgroundColor: colors.amber,
  },
});

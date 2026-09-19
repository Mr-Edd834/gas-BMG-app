import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";

// A column chart, built from Views rather than from a charting library.
//
// The spec leaves the chart library open ("resolve at build"). Resolved: no
// library. Every candidate — gifted-charts, victory-native — depends on a
// NATIVE module (react-native-svg, Skia), and a native dependency means every
// phone needs a fresh build before the app will even launch. For three small
// column charts over at most seven points, that is a permanent cost for no
// visible gain: a bar is a rectangle, and a rectangle is a View with a height.
//
// SVG would earn its place the moment this needs smooth curves, animated
// transitions, pie slices or pinch-zoom. None of those are in this spec. If
// they arrive, swap this component out — the screens only pass it data, so
// nothing else has to change.

export interface Bar {
  label: string;
  // null means "no data for this bucket", which is NOT zero. A day the shop
  // did not trade has no credit-reliance figure at all, and drawing it as a
  // zero-height bar would read as "a day with no credit", the opposite of the
  // truth (spec §4.3).
  value: number | null;
  // Overrides the bar colour for per-bar severity.
  tone?: string;
}

export function BarChart({
  bars,
  height = 120,
  tone = colors.blue,
  formatValue,
  emptyLabel = "No sales in this period",
}: {
  bars: Bar[];
  height?: number;
  tone?: string;
  formatValue?: (value: number) => string;
  emptyLabel?: string;
}) {
  const values = bars
    .map((b) => b.value)
    .filter((v): v is number => v !== null);

  if (values.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  // Scaled to the tallest bar, not to a fixed ceiling, so a quiet week still
  // shows its own shape rather than a row of stubs.
  const peak = Math.max(...values);

  return (
    <View>
      <View style={[styles.plot, { height }]}>
        {bars.map((bar) => {
          const hasValue = bar.value !== null;
          // A real zero still draws a visible sliver, so "sold nothing" and
          // "no data" stay distinguishable at a glance.
          const ratio = hasValue && peak > 0 ? (bar.value as number) / peak : 0;
          return (
            <View key={bar.label} style={styles.column}>
              {hasValue ? (
                <Text style={styles.value} numberOfLines={1}>
                  {formatValue
                    ? formatValue(bar.value as number)
                    : String(Math.round(bar.value as number))}
                </Text>
              ) : (
                <Text style={styles.noValue}>–</Text>
              )}
              <View style={styles.track}>
                {hasValue ? (
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${Math.max(3, ratio * 100)}%`,
                        backgroundColor: bar.tone ?? tone,
                      },
                    ]}
                  />
                ) : (
                  // An explicitly empty track, visibly different from a short
                  // bar: nothing was recorded here.
                  <View style={styles.missing} />
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.labels}>
        {bars.map((bar) => (
          <Text key={bar.label} style={styles.label} numberOfLines={1}>
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  column: { flex: 1, height: "100%", justifyContent: "flex-end", gap: 4 },
  track: { flex: 1, justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 4, minHeight: 3 },
  missing: {
    width: "100%",
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  value: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  noValue: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.mutedLight,
    textAlign: "center",
  },
  labels: { flexDirection: "row", gap: 6, marginTop: 6 },
  label: {
    flex: 1,
    fontSize: 10,
    color: colors.muted,
    textAlign: "center",
  },
  empty: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.mutedLight,
    paddingVertical: 12,
  },
});

import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { shareOf } from "../../reports/kpis";

// One horizontal bar split into slices — "what is owed for" (spec §5 §4.5).
//
// A stacked bar rather than a pie, deliberately. The question here is "is most
// of what I am owed tied up in cylinders?", which is a comparison of lengths
// against one whole. People read length accurately and angle badly, which is
// why a pie needs its numbers printed on it to be usable at all — and once the
// numbers carry the meaning, the picture is decoration.

export interface Slice {
  label: string;
  value: number;
  tone: string;
}

export function ProportionBar({
  slices,
  formatValue,
}: {
  slices: Slice[];
  formatValue: (value: number) => string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return <Text style={styles.empty}>Nothing is owed right now.</Text>;
  }

  const ranked = [...slices]
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {ranked.map((slice) => (
          <View
            key={slice.label}
            // flex, not a percentage width: a slice worth 0.4% of the total
            // still has to be visible enough to correspond to its row below.
            style={{ flex: slice.value, backgroundColor: slice.tone }}
          />
        ))}
      </View>

      <View style={styles.legend}>
        {ranked.map((slice) => (
          <View key={slice.label} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: slice.tone }]} />
            <Text style={styles.label} numberOfLines={1}>
              {slice.label}
            </Text>
            <Text style={styles.percent}>
              {Math.round(shareOf(slice.value, total))}%
            </Text>
            <Text style={styles.amount}>{formatValue(slice.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  bar: {
    flexDirection: "row",
    height: 16,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.neutral,
  },
  legend: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  label: { flex: 1, fontSize: 14, color: colors.ink },
  percent: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    minWidth: 38,
    textAlign: "right",
  },
  amount: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
    minWidth: 86,
    textAlign: "right",
  },
  empty: { fontSize: 13, lineHeight: 18, color: colors.mutedLight },
});

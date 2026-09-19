import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";

// A scatter plot with the two dividing lines drawn in.
//
// Why a scatter and not two ranked lists: borrowing volume and repayment speed
// only mean something TOGETHER. Borrowing a lot is not a problem — it is the
// business working. Paying slowly on a small balance is an irritation. The two
// at once is the actual exposure, and separated into two cards it has to be
// reconstructed in your head, one customer at a time.
//
// Plotted rather than scored, deliberately. A single "risk score" would be the
// app giving advice, which it never does (spec §5 §1). A position on a chart
// is a fact; what to do about it stays the shopkeeper's call.
//
// Views again, no SVG — see BarChart for the full reasoning. A dot is a small
// round View at an absolute position.

export interface Point {
  id: string;
  label: string;
  x: number;
  y: number;
  tone: string;
}

const PLOT_HEIGHT = 190;
const DOT = 12;

export function QuadrantChart({
  points,
  xThreshold,
  yThreshold,
  xAxisLabel,
  yAxisLabel,
  formatX,
  formatY,
  cornerLabel,
}: {
  points: Point[];
  xThreshold: number;
  yThreshold: number;
  xAxisLabel: string;
  yAxisLabel: string;
  formatX: (v: number) => string;
  formatY: (v: number) => string;
  // Names the corner that matters, so the chart says what it is for without
  // the reader having to infer it.
  cornerLabel: string;
}) {
  const [selected, setSelected] = useState<Point | null>(null);

  if (points.length === 0) {
    return (
      <Text style={styles.empty}>
        Nothing to plot yet — this fills in once customers have settled debts.
      </Text>
    );
  }

  // Axes are padded past the real maximum so a point never sits welded to the
  // edge where half the dot is clipped.
  const xMax = Math.max(...points.map((p) => p.x), xThreshold) * 1.15 || 1;
  const yMax = Math.max(...points.map((p) => p.y), yThreshold) * 1.15 || 1;

  const xPos = (v: number) => `${Math.min(96, (v / xMax) * 100)}%`;
  // Inverted: slower is further UP, because "high" reading as "worse" is the
  // convention every chart reader already has.
  const yPos = (v: number) => `${Math.min(96, 100 - (v / yMax) * 100)}%`;

  return (
    <View style={styles.wrap}>
      <View style={styles.plotRow}>
        <Text style={styles.yAxis} numberOfLines={2}>
          {yAxisLabel}
        </Text>

        <View style={[styles.plot, { height: PLOT_HEIGHT }]}>
          {/* The two dividing lines. Everything above and right of their
              crossing is the corner that matters. */}
          <View style={[styles.hLine, { top: yPos(yThreshold) as never }]} />
          <View style={[styles.vLine, { left: xPos(xThreshold) as never }]} />

          <View
            style={[
              styles.corner,
              { left: xPos(xThreshold) as never, top: 0 },
            ]}
          >
            <Text style={styles.cornerText} numberOfLines={2}>
              {cornerLabel}
            </Text>
          </View>

          {points.map((point) => (
            <Pressable
              key={point.id}
              accessibilityRole="button"
              accessibilityLabel={`${point.label}: ${formatX(point.x)}, ${formatY(point.y)}`}
              onPress={() =>
                setSelected((current) =>
                  current?.id === point.id ? null : point
                )
              }
              hitSlop={10}
              style={[
                styles.dot,
                {
                  left: xPos(point.x) as never,
                  top: yPos(point.y) as never,
                  backgroundColor: point.tone,
                  borderColor:
                    selected?.id === point.id ? colors.ink : colors.white,
                },
              ]}
            />
          ))}
        </View>
      </View>

      <Text style={styles.xAxis}>{xAxisLabel} →</Text>

      {/* Tapping a dot names it. Labelling every dot would be unreadable at
          this size, and leaving them all anonymous would make the chart
          pretty and useless. */}
      <View style={styles.readout}>
        {selected ? (
          <Text style={styles.readoutText}>
            <Text style={styles.readoutName}>{selected.label}</Text>
            {` · ${formatX(selected.x)} taken · ${formatY(selected.y)} to clear`}
          </Text>
        ) : (
          <Text style={styles.readoutHint}>
            Tap a dot to see whose it is.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  plotRow: { flexDirection: "row", gap: 6 },
  yAxis: {
    width: 58,
    fontSize: 10,
    lineHeight: 13,
    color: colors.muted,
    textAlign: "right",
    alignSelf: "flex-start",
  },
  plot: {
    flex: 1,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    position: "relative",
    overflow: "hidden",
  },
  hLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.line,
  },
  vLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.line,
  },
  corner: {
    position: "absolute",
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  cornerText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: colors.amber,
    textAlign: "right",
  },
  dot: {
    position: "absolute",
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    marginLeft: -DOT / 2,
    marginTop: -DOT / 2,
  },
  xAxis: {
    fontSize: 10,
    color: colors.muted,
    textAlign: "right",
    marginRight: 4,
  },
  readout: {
    minHeight: 32,
    justifyContent: "center",
    backgroundColor: colors.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  readoutText: { fontSize: 12, color: colors.ink },
  readoutName: { fontWeight: "700" },
  readoutHint: { fontSize: 12, color: colors.mutedLight },
  empty: { fontSize: 13, lineHeight: 18, color: colors.mutedLight },
});

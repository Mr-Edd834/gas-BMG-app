import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { AccountEvent } from "../db/queries/ledger";
import { formatDate, formatDateTime } from "../lib/formatDate";
import { formatMoney } from "../lib/formatMoney";
import { colors } from "../theme/colors";
import { cardRadius } from "../theme/layout";

// A repayment or an empty return on a customer's statement.
//
// Sales are rendered by SaleHistoryCard, which handles expanding, line items,
// photos and the editable note. This covers the two event kinds that are NOT
// sales, so the statement reads as one timeline.
//
// Each names what it settled. That reference is the point: "KSh 500 on the
// 15th" is a number, while "KSh 500 against the two K-Gas Bigs taken on the
// 14th" is evidence about a specific transaction — which is what is needed the
// moment a customer disputes one.
//
// TWO dates appear on every card and they mean different things, so each is
// labelled rather than left to be inferred. Unlabelled, they were read as two
// copies of the same date — and on a same-day repayment they genuinely look
// identical, which made the screen impossible to trust.
export function StatementEvent({ event }: { event: AccountEvent }) {
  if (event.kind === "sale") return null;

  const isMoney = event.kind === "repayment";
  // Money back and cylinders back are different colours on purpose. Both are
  // "in", but they settle different obligations, and at a glance down a
  // statement she is usually looking for one or the other — not both.
  const tone = isMoney
    ? {
        bg: colors.greenBg,
        border: colors.green,
        accent: colors.green,
      }
    : {
        bg: colors.blueBg,
        border: colors.blue,
        accent: colors.blue,
      };

  return (
    <View
      style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}
    >
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={isMoney ? "cash-outline" : "cube-outline"}
            size={14}
            color={tone.accent}
          />
        </View>
        <Text style={styles.what}>
          {isMoney ? "Repayment" : "Empties returned"}
        </Text>
        <Text style={[styles.value, { color: tone.accent }]}>
          {isMoney
            ? formatMoney(event.amount)
            : `${event.qty} ${event.qty === 1 ? "empty" : "empties"}`}
        </Text>
      </View>

      {/* WHICH sale this settled, and when THAT was taken. */}
      <Text style={styles.against}>
        {isMoney
          ? `For: ${event.againstDescription}`
          : `For: ${event.brand} · ${event.size}`}
      </Text>
      <Text style={styles.againstDate}>
        Taken {formatDate(event.againstSoldAt)}
      </Text>

      {/* When the money or the cylinders actually came back. Explicitly
          labelled so it cannot be mistaken for the line above. */}
      <View style={[styles.settled, { borderTopColor: tone.border }]}>
        <Text style={[styles.settledLabel, { color: tone.accent }]}>
          {isMoney ? "PAID" : "RETURNED"}
        </Text>
        <Text style={styles.settledWhen}>{formatDateTime(event.at)}</Text>
      </View>

      {event.staffName ? (
        <Text style={styles.quiet}>Logged by {event.staffName}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Inset from the sale cards it sits between, so the timeline reads as two
  // directions at a glance rather than one undifferentiated list.
  card: {
    borderWidth: 1,
    borderRadius: cardRadius,
    padding: 14,
    marginLeft: 16,
    gap: 3,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  what: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.ink },
  value: { fontSize: 16, fontWeight: "700" },
  against: { fontSize: 13, lineHeight: 18, color: colors.ink, marginTop: 2 },
  againstDate: { fontSize: 12, color: colors.mutedLight },
  settled: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 8,
  },
  settledLabel: { fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  settledWhen: { fontSize: 13, fontWeight: "600", color: colors.ink },
  quiet: { fontSize: 12, color: colors.mutedLight, marginTop: 2 },
});

import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { AccountEvent } from "../db/queries/ledger";
import { formatDate, formatDateTime } from "../lib/formatDate";
import { formatMoney } from "../lib/formatMoney";
import { colors } from "../theme/colors";
import { cardRadius } from "../theme/layout";

// A repayment or an empty return on a customer's statement.
//
// Sales are rendered by SaleHistoryCard, which already handles expanding,
// line items, photos and the editable note. This covers the two event kinds
// that are NOT sales, so the statement reads as one timeline.
//
// Each one names what it settled. That reference is the entire point: "KSh 500
// on the 15th" is a number, while "KSh 500 against the two K-Gas Bigs taken on
// the 14th" is evidence about a specific transaction — which is what is needed
// the moment a customer disputes one.
export function StatementEvent({ event }: { event: AccountEvent }) {
  if (event.kind === "sale") return null;

  const isMoney = event.kind === "repayment";

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <Ionicons name="arrow-down" size={15} color={colors.green} />
        </View>
        <Text style={styles.what}>
          {isMoney ? "Repayment" : "Empties returned"}
        </Text>
        <Text style={styles.value}>
          {isMoney
            ? formatMoney(event.amount)
            : `${event.qty} ${event.qty === 1 ? "empty" : "empties"}`}
        </Text>
      </View>

      {/* What it was against — never omitted, never truncated. */}
      <Text style={styles.against}>
        {isMoney
          ? `against ${event.againstDescription}`
          : `${event.brand} · ${event.size}`}
        {" — taken "}
        {formatDate(event.againstSoldAt)}
      </Text>

      <View style={styles.meta}>
        <View style={styles.tag}>
          <Text style={styles.tagText}>
            {isMoney ? "paid" : "returned"}
          </Text>
        </View>
        {event.staffName ? (
          <Text style={styles.quiet}>by {event.staffName}</Text>
        ) : null}
        <Text style={styles.quiet}>{formatDateTime(event.at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Tinted green and inset slightly, so money coming back is visually distinct
  // from the white sale cards it sits between — the timeline reads as two
  // directions at a glance rather than one undifferentiated list.
  card: {
    backgroundColor: colors.greenBg,
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: cardRadius,
    padding: 14,
    marginLeft: 16,
    gap: 4,
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
  value: { fontSize: 16, fontWeight: "700", color: colors.green },
  against: { fontSize: 13, lineHeight: 18, color: colors.mutedLight },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  tag: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { fontSize: 11, fontWeight: "700", color: colors.green },
  quiet: { fontSize: 12, color: colors.mutedLight },
});

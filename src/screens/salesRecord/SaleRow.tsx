import { Image, StyleSheet, Text, View } from "react-native";
import { debtPrincipal, saleGoodsTotal } from "../../debts/rules";
import { formatDateTime } from "../../lib/formatDate";
import { formatMoney } from "../../lib/formatMoney";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";
import type { SaleRecord } from "../../db/queries/sales";

// One sale in the global record (spec Part C §3 §2-3).
//
// Everything is on the row — nothing behind a tap. The client asked for all
// eight fields visible AND an uncrowded feel, which sounds contradictory until
// you stop putting them on one line. Three lines of decreasing weight resolve
// it: name and total anchor the scan, the items sit under them, and the quiet
// metadata takes the third line. The eye reads down the left edge for "who",
// down the right for "how much", and only stops on line three when it needs to.
//
// Read-only, unlike the per-customer history: a sale's note is editable there
// and nowhere else (spec §1, §5).
export function SaleRow({ sale }: { sale: SaleRecord }) {
  const total = saleGoodsTotal(sale.items);
  // Derived, like everywhere else — never read from the stored credit column.
  const owed = debtPrincipal(sale.items, sale.cashAmount);
  const items = sale.items.map((i) => `${i.label} ×${i.qty}`).join(", ");

  return (
    <View style={styles.card}>
      {/* LINE 1 — the scan anchor. */}
      <View style={styles.line1}>
        <View style={styles.whoWrap}>
          <Text style={styles.who} numberOfLines={1}>
            {sale.customerName}
          </Text>
          {sale.isQuickSale && (
            <View style={styles.quickChip}>
              <Text style={styles.quickChipText}>quick</Text>
            </View>
          )}
        </View>
        <Text style={styles.total}>{formatMoney(total)}</Text>
      </View>

      {/* LINE 2 — what was bought, wrapping freely rather than truncating. */}
      <Text style={styles.items}>{items}</Text>

      {/* LINE 3 — quiet metadata, wrapping as one row. */}
      <View style={styles.meta}>
        {owed > 0 ? (
          <Text style={styles.metaCredit}>
            {formatMoney(sale.cashAmount)} cash · {formatMoney(owed)} credit
          </Text>
        ) : (
          <Text style={styles.metaPaid}>Paid in full (cash)</Text>
        )}
        <Text style={styles.metaQuiet}>by {sale.staffName}</Text>
        <Text style={styles.metaQuiet}>{formatDateTime(sale.soldAt)}</Text>
      </View>

      {/* Note and photo appear ONLY when they exist, so the common sale stays
          three clean lines and the rare one carries its extras without
          bloating every row above it. */}
      {(sale.note || sale.receiptPhotoLocalPath) && (
        <View style={styles.extras}>
          {sale.note && (
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>{sale.note}</Text>
            </View>
          )}
          {sale.receiptPhotoLocalPath && (
            <Image
              source={{ uri: sale.receiptPhotoLocalPath }}
              style={styles.thumb}
              accessibilityLabel="Receipt photo"
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 4,
  },
  line1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  whoWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  who: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    flexShrink: 1,
  },
  quickChip: {
    backgroundColor: colors.blueBg,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  quickChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.blue,
  },
  total: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  items: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.mutedLight,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  metaCredit: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.amber,
  },
  metaPaid: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.green,
  },
  metaQuiet: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  extras: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 6,
  },
  noteBox: {
    flex: 1,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.ink,
  },
  // A thumbnail, not a block — most rows have no photo and the ones that do
  // should not dominate the list (spec §3).
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.neutral,
  },
});

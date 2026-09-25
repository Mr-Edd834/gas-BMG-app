import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PhotoViewer } from "../../components/PhotoViewer";
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
export function SaleRow({
  sale,
  onFix,
}: {
  sale: SaleRecord;
  // Absent on screens where correcting makes no sense.
  onFix?: (sale: SaleRecord) => void;
}) {
  const cancelled = sale.cancelledBy !== null;
  const [open, setOpen] = useState(false);
  const total = saleGoodsTotal(sale.items);
  // Derived, like everywhere else — never read from the stored credit column.
  const owed = debtPrincipal(sale.items, sale.cashAmount);
  const items = sale.items.map((i) => `${i.label} ×${i.qty}`).join(", ");

  return (
    <View style={[styles.card, cancelled && styles.cardCancelled]}>
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
        <Text style={[styles.total, cancelled && styles.struck]}>
          {formatMoney(total)}
        </Text>
      </View>

      {/* LINE 2 — what was bought, wrapping freely rather than truncating. */}
      <Text style={[styles.items, cancelled && styles.struck]}>{items}</Text>

      {/* The crossed-out line IS the evidence — it says what was first
          written, and that it was caught. Hiding it would leave the book
          unable to explain itself. */}
      {cancelled && (
        <View style={styles.cancelBanner}>
          <Text style={styles.cancelTitle}>Cancelled — recorded wrongly</Text>
          <Text style={styles.cancelBody}>
            {sale.cancelledBy?.replacementSaleId
              ? "Replaced by the corrected sale."
              : "No replacement was recorded."}
            {sale.cancelledBy?.staffName
              ? ` Fixed by ${sale.cancelledBy.staffName}.`
              : ""}
          </Text>
        </View>
      )}

      {sale.replaces && (
        <View style={styles.replacesBanner}>
          <Text style={styles.replacesText}>
            This is the correction — it replaces the cancelled sale.
          </Text>
        </View>
      )}

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

      {/* Correcting a sale is rare and consequential, so it sits one tap
          back: a quiet ⋯ on the row opens it. Visible enough that she can
          find it without being told twice, quiet enough that it is never
          the thing her thumb lands on while scrolling the day's takings. */}
      {onFix && !cancelled && (
        <View style={styles.moreRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              open
                ? "Hide options for this sale"
                : `Options for ${sale.customerName}'s sale`
            }
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            hitSlop={10}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          >
            <Ionicons
              name={open ? "chevron-up" : "ellipsis-horizontal"}
              size={16}
              color={colors.muted}
            />
          </Pressable>

          {open && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Fix this sale for ${sale.customerName}`}
              onPress={() => onFix(sale)}
              style={({ pressed }) => [styles.fix, pressed && styles.pressed]}
            >
              <Text style={styles.fixLabel}>Fix this sale</Text>
            </Pressable>
          )}
        </View>
      )}

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
            <PhotoViewer uri={sale.receiptPhotoLocalPath} size={48} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardCancelled: { opacity: 0.85, borderColor: colors.amber },
  struck: { textDecorationLine: "line-through", color: colors.mutedLight },
  cancelBanner: {
    backgroundColor: colors.amberBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
    gap: 2,
  },
  cancelTitle: { fontSize: 12, fontWeight: "800", color: colors.amber },
  cancelBody: { fontSize: 11, lineHeight: 16, color: colors.muted },
  replacesBanner: {
    backgroundColor: colors.greenBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  replacesText: { fontSize: 11, fontWeight: "700", color: colors.green },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  more: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neutral,
  },
  // The one deliberately alarming control in the app. Everything else is
  // amber at worst, because owing money is normal and never an error. This is
  // different: it cancels a record. Red says think first — and it is behind
  // the ⋯, so nothing about it is reached by accident.
  fix: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.overpaidBg,
    borderWidth: 1,
    borderColor: colors.overpaid,
  },
  fixLabel: { fontSize: 12, fontWeight: "800", color: colors.overpaid },
  pressed: { opacity: 0.6 },
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
});

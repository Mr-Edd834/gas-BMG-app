import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatMoney } from "../lib/formatMoney";
import { lineTotal, type CartLine } from "../sales/types";
import { colors } from "../theme/colors";
import { cardRadius, touchTarget } from "../theme/layout";

// Describes the line under its label: how airtime was counted out, or
// quantity × unit price, plus the empties count for cylinders.
function detailFor(line: CartLine): string {
  if (line.commodity === "airtime") {
    const parts: string[] = [];
    const packs = line.packs ?? 0;
    const singles = line.singles ?? 0;
    if (packs > 0) parts.push(`${packs} pack${packs === 1 ? "" : "s"}`);
    if (singles > 0) parts.push(`${singles} single${singles === 1 ? "" : "s"}`);
    parts.push(`${line.qty} card${line.qty === 1 ? "" : "s"}`);
    return parts.join(" · ");
  }

  const base = `×${line.qty} · ${formatMoney(line.unitPrice)} each`;
  if (line.commodity === "cylinder" && line.emptiesReturned !== null) {
    return `${base} · ${line.emptiesReturned}/${line.qty} empties back`;
  }
  return base;
}

// One item in the basket (spec Part C §1 §5, "Cart line").
//
// Two distinct actions, deliberately separate: tapping the line EDITS it (the
// line is pulled back out and its picker reopens pre-filled), while the ✗
// deletes it outright. Nothing here is written to the DB yet, so neither is
// destructive to any record — which is why neither asks for a confirmation.
export function CartLineCard({
  line,
  onEdit,
  onRemove,
}: {
  line: CartLine;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${line.label}`}
        onPress={onEdit}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <Text style={styles.label} numberOfLines={1}>
          {line.label}
        </Text>
        <Text style={styles.detail}>{detailFor(line)}</Text>
        <Text style={styles.editHint}>Tap to edit</Text>
      </Pressable>

      <View style={styles.right}>
        <Text style={styles.total}>
          {formatMoney(lineTotal(line.qty, line.unitPrice))}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${line.label} from this sale`}
          onPress={onRemove}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={18} color={colors.mutedLight} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
  },
  main: {
    flex: 1,
    minHeight: touchTarget,
    justifyContent: "center",
    gap: 2,
    paddingRight: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  detail: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  editHint: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.blue,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  total: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  remove: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F2EE",
  },
});

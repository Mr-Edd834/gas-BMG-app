import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CustomerTab } from "../db/queries/customers";
import { formatDateTime } from "../lib/formatDate";
import { colors } from "../theme/colors";
import { cardRadius, touchTarget } from "../theme/layout";
import { StatusChip } from "./StatusChip";

// A customer tab card (spec Part C §1 §3).
//
// What this card deliberately does NOT show: any owed amount, and any styling
// that changes with paid/unpaid status. Tabs never disappear and never turn
// red — debt lives in the Debts section, and Home answers only "whose account
// do I want, and let me act on it fast."
export function CustomerTabCard({
  tab,
  onViewHistory,
  onAddSale,
}: {
  tab: CustomerTab;
  onViewHistory: () => void;
  onAddSale: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {tab.name}
          </Text>
          {/* Only the pinned Quick Sale tab is a walk-in. */}
          {tab.isQuickSale && <StatusChip tone="blue" label="walk-in" />}
        </View>

        <Text style={styles.lastItem} numberOfLines={1}>
          {/* Empty until a real sale exists — never a placeholder purchase (G7). */}
          {tab.lastItemSummary ?? "No sales yet"}
        </Text>

        {tab.lastSoldAt && (
          <View style={styles.timeRow}>
            <Ionicons
              name="time-outline"
              size={12}
              color={colors.mutedLight}
            />
            <Text style={styles.time}>{formatDateTime(tab.lastSoldAt)}</Text>
          </View>
        )}
      </View>

      {/* Footer: two equal buttons split by a divider. */}
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View statement for ${tab.name}`}
          onPress={onViewHistory}
          style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}
        >
          <Text style={styles.viewLabel}>View statement</Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add a sale for ${tab.name}`}
          onPress={onAddSale}
          style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}
        >
          <Text style={styles.addLabel}>Add sale +</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    overflow: "hidden",
  },
  body: {
    padding: 14,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
  },
  lastItem: {
    fontSize: 13,
    color: colors.mutedLight,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  time: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  footer: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  footerButton: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  pressed: {
    backgroundColor: colors.neutral,
  },
  divider: {
    width: 1,
    backgroundColor: colors.line,
  },
  viewLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  addLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.blue,
  },
});

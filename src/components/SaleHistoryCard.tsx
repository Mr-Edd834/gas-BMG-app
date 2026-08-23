import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SaleRecord } from "../db/queries/sales";
import { formatDateTime } from "../lib/formatDate";
import { formatMoney } from "../lib/formatMoney";
import { lineTotal } from "../sales/types";
import { colors } from "../theme/colors";
import { cardRadius, touchTarget } from "../theme/layout";
import { StatusChip } from "./StatusChip";

// One past sale (spec Part C §1 §6). View-only for money and items.
//
// EVERYTHING here is frozen except the note. The sale's financial facts must
// stay immutable because the debt balance is calculated from them (G1/G4) —
// corrections are made with a new adjusting entry, never by rewriting history.
// The note is a deliberate, isolated exception: it is a memo, it feeds no
// calculation. Do not extend editing to any other field by pattern-matching
// what the note does here.
export function SaleHistoryCard({
  sale,
  expanded,
  onToggle,
  onSaveNote,
}: {
  sale: SaleRecord;
  expanded: boolean;
  onToggle: () => void;
  onSaveNote: (note: string) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(sale.note ?? "");

  const total = sale.cashAmount + sale.creditAmount;
  const summary = sale.items
    .map((item) => `${item.label} ×${item.qty}`)
    .join(", ");

  function beginEditing() {
    setDraft(sale.note ?? "");
    setEditingNote(true);
  }

  function finishEditing() {
    setEditingNote(false);
    if (draft.trim() !== (sale.note ?? "").trim()) {
      onSaveNote(draft);
    }
  }

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Sale of ${formatMoney(total)} on ${formatDateTime(sale.soldAt)}`}
        onPress={onToggle}
        style={({ pressed }) => [styles.collapsed, pressed && styles.pressed]}
      >
        <View style={styles.topRow}>
          <Text style={styles.when}>{formatDateTime(sale.soldAt)}</Text>
          <Text style={styles.total}>{formatMoney(total)}</Text>
        </View>

        <Text style={styles.summary} numberOfLines={2}>
          {summary}
        </Text>

        <View style={styles.chipRow}>
          {sale.creditAmount > 0 ? (
            <StatusChip
              tone="amber"
              label={`${formatMoney(sale.creditAmount)} credit`}
            />
          ) : (
            <StatusChip tone="green" label="Fully paid" />
          )}
          {sale.receiptPhotoLocalPath && (
            <Ionicons
              name="camera-outline"
              size={13}
              color={colors.mutedLight}
            />
          )}
          {sale.note && (
            <Ionicons
              name="document-text-outline"
              size={13}
              color={colors.mutedLight}
            />
          )}
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.expanded}>
          {sale.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemLabel}>
                {item.label} ×{item.qty}
                {item.emptiesReturned !== null &&
                  ` · ${item.emptiesReturned}/${item.qty} empties back`}
              </Text>
              <Text style={styles.itemTotal}>
                {formatMoney(lineTotal(item.qty, item.unitPrice))}
              </Text>
            </View>
          ))}

          <View style={styles.splitBlock}>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>Cash</Text>
              <Text style={styles.splitValue}>
                {formatMoney(sale.cashAmount)}
              </Text>
            </View>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>Credit</Text>
              <Text style={styles.splitValue}>
                {formatMoney(sale.creditAmount)}
              </Text>
            </View>
          </View>

          {/* The note can always be edited OR added, whether or not one
              existed originally. */}
          {editingNote ? (
            <View style={styles.noteEditor}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a note…"
                placeholderTextColor={colors.mutedLight}
                accessibilityLabel="Sale note"
                multiline
                autoFocus
                style={styles.noteInput}
              />
              <Pressable
                accessibilityRole="button"
                onPress={finishEditing}
                style={({ pressed }) => [
                  styles.noteDone,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.noteDoneLabel}>Done</Text>
              </Pressable>
            </View>
          ) : sale.note ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit this sale's note"
              onPress={beginEditing}
              style={({ pressed }) => [
                styles.noteBox,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.noteText}>{sale.note}</Text>
              <Text style={styles.noteAction}>Edit note</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={beginEditing}
              style={({ pressed }) => [
                styles.addNote,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={13}
                color={colors.blue}
              />
              <Text style={styles.noteAction}>Add a note</Text>
            </Pressable>
          )}

          {sale.receiptPhotoLocalPath && (
            <Image
              source={{ uri: sale.receiptPhotoLocalPath }}
              style={styles.photo}
              resizeMode="cover"
              accessibilityLabel="Receipt photo for this sale"
            />
          )}

          <Text style={styles.loggedBy}>Logged by {sale.staffName}</Text>
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
    borderRadius: 16,
    overflow: "hidden",
  },
  collapsed: {
    padding: 14,
    gap: 5,
  },
  pressed: {
    opacity: 0.8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  when: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  total: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  summary: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  expanded: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 8,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  splitBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    gap: 4,
  },
  splitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  splitLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  splitValue: {
    fontSize: 12,
    color: colors.ink,
  },
  noteEditor: {
    gap: 8,
  },
  noteInput: {
    minHeight: 68,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: "top",
  },
  noteDone: {
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#F1F2EE",
  },
  noteDoneLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  noteBox: {
    backgroundColor: "#F6F8F4",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: touchTarget,
    justifyContent: "center",
    gap: 4,
  },
  noteText: {
    fontSize: 13,
    color: colors.ink,
  },
  addNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: touchTarget,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F6F8F4",
  },
  noteAction: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.blue,
  },
  photo: {
    width: "100%",
    height: 160,
    borderRadius: cardRadius,
    backgroundColor: "#F1F2EE",
  },
  loggedBy: {
    fontSize: 12,
    color: colors.mutedLight,
  },
});

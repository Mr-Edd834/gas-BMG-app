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
import {
  debtPrincipal,
  emptiesOutstanding,
  saleGoodsTotal,
} from "../debts/rules";
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

  // A sale's value is what the GOODS were worth — the sum of its immutable
  // line items. It is deliberately NOT cash + credit: those are two numbers a
  // human typed, and if they don't add up to the goods (she enters KSh 600
  // cash against a KSh 1,000 sale and leaves credit blank) then deriving the
  // total from them understates the sale AND silently erases the debt.
  // Items are the fact; the payment split is the claim about the fact.
  // Both come from src/debts/rules.ts — the SAME functions the Debts section
  // uses. Not a copy of the arithmetic: literally the same code, so this card
  // and the Debts screen cannot drift into disagreeing about one sale.
  const itemsTotal = saleGoodsTotal(sale.items);

  // Still owed, DERIVED (G1) rather than read from the stored credit_amount.
  // Deriving it makes "goods worth more than the cash received" structurally
  // impossible to render as "Fully paid" — the failure that loses real money
  // in a book this app exists to replace.
  const owed = debtPrincipal(sale.items, sale.cashAmount);

  // A sale whose recorded payment doesn't reconcile against its goods. Shown
  // explicitly rather than hidden, because the gap is exactly where money goes
  // missing, and history is immutable — the fix is a new entry, never a rewrite.
  const unreconciled = sale.cashAmount + sale.creditAmount !== itemsTotal;

  // Cylinders are the only commodity that leaves an empty behind. Money owed
  // and empties owed are tracked separately and never summed (spec Part C §2
  // §1): a customer can be square on cash and still be holding six cylinders,
  // and only one of those is settled by paying.
  const cylinderItems = sale.items.filter((i) => i.commodityType === "cylinder");
  const emptiesOwed = cylinderItems.reduce(
    (sum, i) =>
      sum +
      emptiesOutstanding(i.qty, i.emptiesReturned, [
        { qty: i.emptiesReturnedLater },
      ]),
    0
  );
  const hasCylinders = cylinderItems.length > 0;

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
        accessibilityLabel={`Sale of ${formatMoney(itemsTotal)} on ${formatDateTime(sale.soldAt)}`}
        onPress={onToggle}
        style={({ pressed }) => [styles.collapsed, pressed && styles.pressed]}
      >
        <View style={styles.topRow}>
          <Text style={styles.when}>{formatDateTime(sale.soldAt)}</Text>
          <Text style={styles.total}>{formatMoney(itemsTotal)}</Text>
        </View>

        <Text style={styles.summary} numberOfLines={2}>
          {summary}
        </Text>

        <View style={styles.chipRow}>
          {owed > 0 ? (
            <StatusChip tone="amber" label={`${formatMoney(owed)} credit`} />
          ) : (
            <StatusChip tone="green" label="Fully paid" />
          )}
          {/* Visible without expanding, because "did they bring the cylinders
              back?" is a question she asks at the same moment as "did they
              pay?" — burying it one tap down meant it was never checked. */}
          {hasCylinders &&
            (emptiesOwed > 0 ? (
              <StatusChip
                tone="amber"
                label={`${emptiesOwed} ${emptiesOwed === 1 ? "empty" : "empties"} owed`}
              />
            ) : (
              <StatusChip tone="green" label="Empties back" />
            ))}
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

          {/* The card was tappable but said nothing about it, so the detail
              underneath was never found. A chevron is the affordance: pointing
              down it reads as "there is more below"; flipped up it reads as
              "this closes". It is decorative only — the whole card is still
              the tap target, since a 13px arrow would be a miserable thing to
              hit at a counter (44px minimum, spec §1). */}
          <View style={styles.chevron}>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.muted}
            />
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.expanded}>
          {sale.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemLabel}>
                {item.label} ×{item.qty}
                {item.commodityType === "cylinder" &&
                  ` · ${
                    (item.emptiesReturned ?? 0) + item.emptiesReturnedLater
                  } of ${item.qty} empties back`}
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
            {unreconciled && (
              // Stated plainly instead of quietly reconciled for her. The app
              // cannot know whether the cash figure or the credit figure was
              // the mistake, and guessing would invent a fact. What it CAN say
              // truthfully is that the recorded payment does not match the
              // goods — and the amber chip above already counts the shortfall
              // as owed, so the money is never lost while she sorts it out.
              <Text style={styles.mismatch}>
                Recorded payment ({formatMoney(sale.cashAmount + sale.creditAmount)})
                doesn't match the goods ({formatMoney(itemsTotal)}). The
                difference is shown as owed.
              </Text>
            )}
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
  // marginLeft: "auto" pushes the chevron to the far right whatever chips sit
  // beside it, so it stays in the same place on every card and the eye learns
  // one position rather than hunting for it.
  chevron: {
    marginLeft: "auto",
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
  mismatch: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.amber,
    marginTop: 4,
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
    backgroundColor: colors.neutral,
  },
  noteDoneLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  noteBox: {
    backgroundColor: colors.surfaceSoft,
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
    backgroundColor: colors.surfaceSoft,
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
    backgroundColor: colors.neutral,
  },
  loggedBy: {
    fontSize: 12,
    color: colors.mutedLight,
  },
});

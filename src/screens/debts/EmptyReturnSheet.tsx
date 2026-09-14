import { useCallback, useState, useEffect } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/Buttons";
import { Stepper } from "../../components/Stepper";
import { formatDate } from "../../lib/formatDate";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";
import type { EmptiesBatch } from "../../db/queries/debts";

// Tick off empties coming back against ONE batch (spec Part C §2 §5).
//
// A Stepper rather than a text field, because the quantities are small and
// countable — she is looking at a handful of cylinders on the floor, not
// typing a figure. It is capped at what is still out, so recording more
// returns than were ever taken is not possible rather than merely discouraged.
export function EmptyReturnSheet({
  visible,
  batch,
  customerName,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  batch: EmptiesBatch | null;
  customerName: string;
  onCancel: () => void;
  onConfirm: (qty: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [qty, setQty] = useState(0);

  // Opening the sheet for a different batch must not carry the previous
  // batch's count across.
  useEffect(() => {
    if (visible) setQty(0);
  }, [visible, batch?.saleItemId]);

  const close = useCallback(() => {
    setQty(0);
    onCancel();
  }, [onCancel]);

  const confirm = useCallback(() => {
    if (qty <= 0) return;
    onConfirm(qty);
    setQty(0);
  }, [qty, onConfirm]);

  if (!batch) return null;

  const remaining = batch.outstanding - qty;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close} />

      <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={styles.grabber} />

          <Text style={styles.heading}>Tick off returned empties</Text>

          <View style={styles.batchCard}>
            <Text style={styles.batchWho}>{customerName}</Text>
            <Text style={styles.batchWhat}>
              {batch.brand} · {batch.size}
            </Text>
            <Text style={styles.batchWhen}>Taken {formatDate(batch.soldAt)}</Text>
            <View style={styles.outRow}>
              <Text style={styles.outLabel}>Still out</Text>
              <Text style={styles.outValue}>
                {batch.outstanding} of {batch.taken}
              </Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>How many came back now?</Text>
          <View style={styles.stepperWrap}>
            {/* Capped at what is still out — partial returns are normal
                (spec §5), over-returns are impossible. */}
            <Stepper
              value={qty}
              onChange={setQty}
              min={0}
              max={batch.outstanding}
              label="empties returned now"
            />
          </View>

          {qty > 0 && (
            <Text
              style={[
                styles.feedback,
                remaining === 0 ? styles.feedbackGood : styles.feedbackAmber,
              ]}
              accessibilityLiveRegion="polite"
            >
              {remaining === 0
                ? "That is all of them back."
                : `${remaining} will still be out.`}
            </Text>
          )}

          <View style={styles.ruleNote}>
            <Text style={styles.ruleNoteText}>
              These cylinders go straight into your empties in hand, ready for
              the next refill collection.
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <PrimaryButton
              label="Confirm return"
              tone="green"
              disabled={qty <= 0}
              onPress={confirm}
              style={styles.save}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(22, 35, 31, 0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    backgroundColor: colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 12,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 12,
  },
  batchCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 2,
    marginBottom: 16,
  },
  batchWho: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  batchWhat: {
    fontSize: 13,
    color: colors.mutedLight,
  },
  batchWhen: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  outRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 8,
    paddingTop: 8,
  },
  outLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  outValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.amber,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 10,
  },
  stepperWrap: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    paddingVertical: 14,
  },
  feedback: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
  },
  feedbackGood: {
    color: colors.green,
  },
  feedbackAmber: {
    color: colors.amber,
  },
  ruleNote: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  ruleNoteText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.mutedLight,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  cancel: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.neutral,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  save: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});

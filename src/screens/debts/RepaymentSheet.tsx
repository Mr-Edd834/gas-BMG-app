import { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/Buttons";
import { deadlineFor } from "../../debts/rules";
import { formatDate } from "../../lib/formatDate";
import { formatMoney } from "../../lib/formatMoney";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";
import type { MoneyDebt } from "../../db/queries/debts";

// Log a repayment against ONE debt (spec Part C §2 §4).
//
// The whole design turns on that word "one". Because every credit sale carries
// its own fixed deadline (G3), "Musa paid 500" is not a recordable fact until
// you know which of Musa's debts it settles — the same 500 against his Monday
// debt or his Friday debt produces different collection behaviour afterwards.
// So the sheet always names the debt it is about and can never be opened
// against a customer in general.
export function RepaymentSheet({
  visible,
  debt,
  customerName,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  debt: MoneyDebt | null;
  customerName: string;
  onCancel: () => void;
  onConfirm: (amount: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [raw, setRaw] = useState("");

  const amount = useMemo(() => {
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [raw]);

  const owed = debt?.outstanding ?? 0;
  const overPaying = amount > owed;
  const remainder = Math.max(0, owed - amount);
  const canSave = amount > 0 && !overPaying;

  const close = useCallback(() => {
    setRaw("");
    onCancel();
  }, [onCancel]);

  const confirm = useCallback(() => {
    if (!canSave) return;
    onConfirm(amount);
    setRaw("");
  }, [canSave, amount, onConfirm]);

  if (!debt) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={close}
    >
      {/* Tapping the dimmed area behind the sheet closes it — nothing has been
          written yet, so there is nothing to lose by backing out. */}
      <Pressable style={styles.backdrop} onPress={close} />

      <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={styles.grabber} />

          <Text style={styles.heading}>Log a repayment</Text>

          {/* WHICH debt, always. Without this the sheet would be asking her to
              record a payment against an unnamed thing. */}
          <View style={styles.debtCard}>
            <Text style={styles.debtWho}>{customerName}</Text>
            <Text style={styles.debtWhat}>{debt.description}</Text>
            <Text style={styles.debtWhen}>
              Taken {formatDate(debt.soldAt)}
            </Text>
            <View style={styles.owedRow}>
              <Text style={styles.owedLabel}>Still owed on this debt</Text>
              <Text style={styles.owedValue}>{formatMoney(owed)}</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Amount paid now (KSh)</Text>
          <TextInput
            value={raw}
            onChangeText={setRaw}
            keyboardType="numeric"
            inputMode="numeric"
            placeholder="0"
            placeholderTextColor={colors.mutedLight}
            accessibilityLabel="Amount being repaid now"
            autoFocus
            style={styles.input}
          />

          {/* Live consequence of what she has typed, before she commits it.
              Partial payment is normal here, not an exception. */}
          {amount > 0 && !overPaying && (
            <Text
              style={[
                styles.feedback,
                remainder === 0 ? styles.feedbackGood : styles.feedbackAmber,
              ]}
              accessibilityLiveRegion="polite"
            >
              {remainder === 0
                ? "This clears the debt."
                : `${formatMoney(remainder)} will remain.`}
            </Text>
          )}

          {/* Blocked rather than warned: a repayment larger than the debt is
              always an error, and accepting it would make the customer look
              owed-to by the shop. */}
          {overPaying && (
            <Text style={[styles.feedback, styles.feedbackBad]}>
              More than is owed on this debt — check the amount.
            </Text>
          )}

          {/* The rule most likely to be misremembered at a counter, so it is
              stated at the moment it applies rather than left in a spec (G3). */}
          <View style={styles.ruleNote}>
            <Text style={styles.ruleNoteText}>
              Paying part of a debt does not extend its deadline. This one is
              still due on {formatDate(deadlineFor(debt.soldAt))}.
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              style={({ pressed }) => [
                styles.cancel,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <PrimaryButton
              label="Save repayment"
              tone="green"
              disabled={!canSave}
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
  debtCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 2,
    marginBottom: 16,
  },
  debtWho: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  debtWhat: {
    fontSize: 13,
    color: colors.mutedLight,
  },
  debtWhen: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  owedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 8,
    paddingTop: 8,
  },
  owedLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  owedValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.amber,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 6,
  },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  feedback: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
  feedbackGood: {
    color: colors.green,
  },
  feedbackAmber: {
    color: colors.amber,
  },
  feedbackBad: {
    color: colors.overpaid,
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

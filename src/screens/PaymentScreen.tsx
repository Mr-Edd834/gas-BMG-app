import { Ionicons } from "@expo/vector-icons";
import { CommonActions } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../components/Buttons";
import { ScreenHeader } from "../components/ScreenHeader";
import { useToast } from "../components/Toast";
import { useReadyApp } from "../context/AppContext";
import { createCustomer } from "../db/queries/customers";
import { createSale } from "../db/queries/sales";
import { formatDateTime } from "../lib/formatDate";
import { formatMoney } from "../lib/formatMoney";
import { captureReceiptPhoto } from "../lib/receiptPhoto";
import type { RootStackParamList } from "../navigation/types";
import { cartTotal } from "../sales/types";
import { colors } from "../theme/colors";
import { cardRadius, touchTarget } from "../theme/layout";

const BOTTOM_BAR_PADDING = 16;

type Props = NativeStackScreenProps<RootStackParamList, "Payment">;

function parseAmount(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

// STEP 2 — payment (spec Part C §1 §5).
//
// DEVIATES FROM THE SPEC, deliberately, on Edd's instruction (2026-09-14).
// The spec has cash AND credit as two editable fields with a reconciliation
// strip between them. In real use that was worse than useless: two typed
// numbers can disagree with each other and with the goods, and the first time
// it happened a genuine debt was erased. It also asked the shopkeeper to do
// subtraction at a busy counter.
//
// Cash received is now the ONLY input. Credit is the remainder, computed and
// displayed. Split payment still works exactly as the spec intended — "paid
// some now, owes the rest" — she just no longer types the second half.
// The reconciliation strip is gone with it: when credit is derived, cash and
// credit always reconcile, so the strip could only ever say "correct".
export function PaymentScreen({ route, navigation }: Props) {
  const { businessId, staff } = useReadyApp();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { lines, customerId, customerName, newCustomerName } = route.params;

  const [cash, setCash] = useState("");
  const [note, setNote] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  // Non-null only when a save actually failed. Rendered near the save button
  // so the failure is impossible to miss.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => cartTotal(lines), [lines]);
  const cashPaid = parseAmount(cash);

  // Credit is DERIVED, never entered (see the block in the JSX for why).
  // Blank cash therefore means "paid nothing yet, all of it is owed", which is
  // the honest reading of an empty box — not zero debt.
  const onCredit = Math.max(0, total - cashPaid);

  // Cash beyond the value of the goods. A typo, not a negative debt.
  const overpaid = Math.max(0, cashPaid - total);

  // Optional, and structurally unable to block the save: it sets a path or it
  // doesn't, and Save sale never consults it (G8).
  const toggleReceiptPhoto = useCallback(async () => {
    if (photoPath !== null) {
      setPhotoPath(null);
      return;
    }
    setAttaching(true);
    try {
      const photo = await captureReceiptPhoto();
      setPhotoPath(photo?.localPath ?? null);
    } finally {
      setAttaching(false);
    }
  }, [photoPath]);

  const saveSale = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // A brand-new tab's customer row is created here, at save, so an
      // abandoned sale never leaves an empty tab behind on the wall.
      let targetCustomerId = customerId;
      if (targetCustomerId === null) {
        if (!newCustomerName) {
          setSaving(false);
          return;
        }
        const customer = await createCustomer(businessId, newCustomerName);
        targetCustomerId = customer.id;
      }

      await createSale({
        businessId,
        customerId: targetCustomerId,
        // Automatic attribution to this phone's staff member — zero extra
        // taps, and the timestamp is stamped inside createSale (G6).
        staffId: staff.id,
        lines,
        cashAmount: cashPaid,
        // Stored as the computed remainder, so this column can no longer
        // disagree with the goods. Every screen still DERIVES what is owed
        // from goods minus cash (src/debts/rules.ts) rather than trusting it —
        // this is a record of what happened, not the source of truth.
        creditAmount: onCredit,
        note: note.trim().length > 0 ? note.trim() : null,
        receiptPhotoLocalPath: photoPath,
      });

      // Straight back to the wall — routine actions take no confirmation taps.
      navigation.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: "Tabs" }] })
      );
      showToast("Sale saved");
    } catch (err) {
      // Reaching here means local storage itself failed, not that the phone
      // is offline — offline is this app's normal state and writes succeed
      // regardless (G8).
      //
      // This MUST surface to the user. A silent failure here is the worst
      // outcome the app can produce: she believes a credit sale was recorded,
      // the shop's records say otherwise, and the debt is simply lost. Showing
      // the real message also means a fault can be diagnosed from the counter
      // instead of needing a developer with a cable.
      console.error("[Payment] could not save the sale", err);
      const detail = err instanceof Error ? err.message : String(err);
      setSaveError(detail);
      showToast("Sale NOT saved — see the message below");
      setSaving(false);
    }
  }, [
    saving,
    customerId,
    newCustomerName,
    businessId,
    staff.id,
    lines,
    cashPaid,
    onCredit,
    note,
    photoPath,
    navigation,
    showToast,
  ]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Payment"
        subtitle={customerName}
        // Back returns to the build step with the cart exactly as it was.
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 140 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>TOTAL DUE</Text>
          <Text style={styles.totalValue}>{formatMoney(total)}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Paid in cash now (KSh)</Text>
          <TextInput
            value={cash}
            onChangeText={setCash}
            keyboardType="numeric"
            inputMode="numeric"
            placeholder="0"
            placeholderTextColor={colors.mutedLight}
            accessibilityLabel="Amount paid in cash now"
            style={styles.amountInput}
          />
        </View>

        {/* Credit is SHOWN, never typed.
            It used to be a second input, and that was a mistake: two numbers a
            human enters can disagree with each other and with the goods, which
            is exactly how a real debt got erased. There is only one thing the
            shopkeeper actually knows at the counter — how much cash is in her
            hand. Whatever the goods were worth beyond that IS the credit, so
            the app computes it rather than asking her to do subtraction while
            a customer waits. One input, no arithmetic, nothing to disagree. */}
        <View
          style={styles.creditBlock}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Remaining on credit, ${formatMoney(onCredit)}`}
        >
          <Text style={styles.creditLabel}>REMAINING ON CREDIT</Text>
          <Text style={styles.creditValue}>{formatMoney(onCredit)}</Text>
          <Text style={styles.creditHint}>
            {onCredit > 0
              ? "Owed after today. Due in one week."
              : "Nothing owed — paid in full."}
          </Text>
        </View>

        {/* The ONE case still worth interrupting for: more cash than the sale
            was worth. That is not a debt, it is a typo, and silently keeping
            it would overstate the day's takings. */}
        {overpaid > 0 && (
          <View style={styles.overpaid}>
            <Text style={styles.overpaidText}>
              That is {formatMoney(overpaid)} more than the sale came to —
              check the cash amount.
            </Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: photoPath !== null }}
          disabled={attaching}
          onPress={toggleReceiptPhoto}
          style={[
            styles.photoButton,
            photoPath !== null && styles.photoButtonAttached,
          ]}
        >
          <Ionicons
            name={photoPath !== null ? "checkmark" : "camera-outline"}
            size={16}
            color={photoPath !== null ? colors.green : colors.mutedLight}
          />
          <Text
            style={[
              styles.photoLabel,
              photoPath !== null && styles.photoLabelAttached,
            ]}
          >
            {attaching
              ? "Opening camera…"
              : photoPath !== null
                ? "Receipt photo attached"
                : "Attach receipt photo (optional)"}
          </Text>
        </Pressable>

        {photoPath !== null && (
          <Image
            source={{ uri: photoPath }}
            style={styles.photoPreview}
            resizeMode="cover"
            accessibilityLabel="Attached receipt photo"
          />
        )}

        <View style={styles.field}>
          <View style={styles.noteLabelRow}>
            <Ionicons
              name="document-text-outline"
              size={12}
              color={colors.mutedLight}
            />
            <Text style={styles.fieldLabel}>Note (optional)</Text>
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Anything worth remembering about this sale…"
            placeholderTextColor={colors.mutedLight}
            accessibilityLabel="Note about this sale"
            multiline
            numberOfLines={3}
            style={styles.noteInput}
          />
        </View>
      </ScrollView>

      {/* Android draws Back/Home/Recents INSIDE the app window, so a bar
          pinned to bottom: 0 sits underneath them on a 3-button phone. Padding
          by the device's reported inset lifts the button clear while the bar's
          background still fills the strip behind the system keys. */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: BOTTOM_BAR_PADDING + insets.bottom },
        ]}
      >
        {/* Shown ONLY when a save genuinely failed. This is not the calm
            offline notice (G8) — offline saves succeed and say nothing. This
            means the record was not written, so it is stated plainly. */}
        {saveError !== null && (
          <View style={styles.saveError}>
            <Text style={styles.saveErrorTitle}>
              This sale was NOT saved. Nothing was recorded.
            </Text>
            <Text style={styles.saveErrorDetail}>{saveError}</Text>
          </View>
        )}
        {/* Never gated on the reconciliation strip: the strip informs, and a
            sale that doesn't add up is hers to fix, not the app's to refuse. */}
        <PrimaryButton
          label={saving ? "Saving…" : "Save sale"}
          tone="green"
          disabled={saving}
          onPress={saveSale}
        />
        <Text style={styles.attribution}>
          Logged by {staff.name} · {formatDateTime(new Date())}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  saveError: {
    backgroundColor: colors.overpaidBg,
    borderColor: colors.overpaid,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 4,
  },
  saveErrorTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.overpaid,
  },
  saveErrorDetail: {
    fontSize: 12,
    color: colors.ink,
    lineHeight: 16,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    padding: 20,
    paddingBottom: 140,
    gap: 14,
  },
  totalCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    gap: 4,
  },
  totalLabel: {
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: "600",
    color: colors.muted,
  },
  totalValue: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.ink,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  amountInput: {
    minHeight: touchTarget + 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  creditBlock: {
    backgroundColor: colors.amberBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  creditLabel: {
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "700",
    color: colors.amber,
  },
  creditValue: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.amber,
  },
  creditHint: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  overpaid: {
    backgroundColor: colors.overpaidBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  overpaidText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: colors.overpaid,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: touchTarget,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    paddingVertical: 12,
  },
  photoButtonAttached: {
    borderColor: colors.green,
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedLight,
  },
  photoLabelAttached: {
    color: colors.green,
  },
  photoPreview: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.neutral,
  },
  noteLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  noteInput: {
    minHeight: 80,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: "top",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    // paddingBottom is applied inline where the safe-area inset is known.
    // Do not put a fixed value back here.
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 8,
  },
  attribution: {
    fontSize: 12,
    color: colors.mutedLight,
    textAlign: "center",
  },
});

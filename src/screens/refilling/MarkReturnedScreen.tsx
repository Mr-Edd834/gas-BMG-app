import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  bottomBarPadding,
  useKeyboardInset,
} from "../../lib/useKeyboardInset";
import { PrimaryButton } from "../../components/Buttons";
import { LoadError } from "../../components/LoadError";
import { PhotoSlot } from "../../components/PhotoSlot";
import { ScreenHeader } from "../../components/ScreenHeader";
import { Stepper } from "../../components/Stepper";
import { useToast } from "../../components/Toast";
import { useReadyApp } from "../../context/AppContext";
import {
  loadBatch,
  recordRefillReturn,
  type RefillBatch,
} from "../../db/queries/refilling";
import { syncReminders } from "../../lib/reminders";
import type { RootStackParamList } from "../../navigation/types";
import {
  countAt,
  draftLines,
  saveBlockedBecause,
  setCount,
  totalCylinders,
  type CountMap,
} from "../../refilling/batchDraft";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "MarkReturned">;

// Recording what came back (spec Part C §4 §5).
//
// Partial returns are first-class, not an edge case: a refiller sends back
// what is ready and keeps the rest, so the common case is several returns
// against one batch over days. Each steppers' ceiling is what that exact
// brand-and-size still has out, because returning more than left would write a
// negative into the ledger and quietly corrupt full-stock forever after.
export function MarkReturnedScreen() {
  const { businessId, staff } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const { batchId } = useRoute<Route>().params;
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const { showToast } = useToast();

  const [batch, setBatch] = useState<RefillBatch | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [counts, setCounts] = useState<CountMap>({});
  const [cylinderPhotos, setCylinderPhotos] = useState<string[]>([]);
  const [receiptPhotos, setReceiptPhotos] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBatch(businessId, batchId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setLoadError("This batch is no longer in the records.");
          return;
        }
        setBatch(row);
        setLoadError(null);
      })
      .catch((err) => {
        console.error("[MarkReturned] could not load the batch", err);
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, batchId, attempt]);

  const stillOut = useMemo(
    () => (batch ? batch.lines.filter((l) => l.out > 0) : []),
    [batch]
  );
  const total = useMemo(() => totalCylinders(counts), [counts]);
  const blocked = saveBlockedBecause({ counts, cylinderPhotos });

  async function confirm() {
    if (!batch || blocked || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await recordRefillReturn({
        businessId,
        batchId,
        staffId: staff.id,
        lines: draftLines(counts).map((l) => ({
          brand: l.brand,
          size: l.size,
          qty: l.qty,
        })),
        note: note.trim() ? note.trim() : null,
        cylinderPhotoPaths: cylinderPhotos,
        receiptPhotoPaths: receiptPhotos,
      });

      void syncReminders(businessId).catch((err) =>
        console.warn("[MarkReturned] could not refresh reminders", err)
      );

      showToast(
        `${total} ${total === 1 ? "cylinder" : "cylinders"} back from ${batch.companyName}`
      );
      navigation.goBack();
    } catch (err) {
      console.error("[MarkReturned] could not save the return", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  if (loadError !== null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader title="Mark as returned" onBack={() => navigation.goBack()} />
        <View style={styles.pad}>
          <LoadError
            what="this batch"
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (batch === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader title="Mark as returned" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Mark as returned"
        subtitle={`${batch.batchCode} · ${batch.companyName}`}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lead}>
            Count only what has actually come back. The rest stays out and this
            batch stays open.
          </Text>

          {stillOut.map((line) => {
            const value = countAt(counts, line.brand, line.size);
            return (
              <View
                key={`${line.brand}|${line.size}`}
                style={[styles.lineCard, value > 0 && styles.lineCardOn]}
              >
                <View style={styles.lineText}>
                  <Text style={styles.lineName}>
                    {line.brand} · {line.size}
                  </Text>
                  <Text style={styles.lineOut}>
                    {line.out} still out of {line.sent}
                  </Text>
                </View>
                <Stepper
                  value={value}
                  max={line.out}
                  label={`${line.brand} ${line.size} returned`}
                  onChange={(next) =>
                    setCounts((current) =>
                      setCount(current, line.brand, line.size, next, line.out)
                    )
                  }
                />
              </View>
            );
          })}

          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Coming back now</Text>
            <Text style={styles.totalValue}>
              {total} {total === 1 ? "cylinder" : "cylinders"}
            </Text>
            <Text style={styles.totalNote}>
              These go straight into your full stock.
            </Text>
          </View>

          <PhotoSlot
            label="Photo of the cylinders returned"
            hint="What actually came off the lorry."
            required
            paths={cylinderPhotos}
            onChange={setCylinderPhotos}
          />

          <PhotoSlot
            label="Photo of the receipt"
            nudge="Strongly recommended — this is your own proof."
            required={false}
            paths={receiptPhotos}
            onChange={setReceiptPhotos}
          />

          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>Note (optional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Anything about this delivery"
              placeholderTextColor={colors.mutedLight}
              accessibilityLabel="Note about this delivery"
              multiline
              style={styles.noteInput}
            />
          </View>

          {saveError ? (
            <Text style={styles.error}>
              Could not save this delivery: {saveError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.bar, bottomBarPadding(keyboard, insets.bottom)]}>
          {blocked === "no-cylinders" && (
            <Text style={styles.blocked}>
              Set how many came back before confirming.
            </Text>
          )}
          {blocked === "no-photo" && (
            <Text style={styles.blocked}>
              A photo of the returned cylinders is needed before confirming.
            </Text>
          )}
          <PrimaryButton
            label={saving ? "Saving…" : "Confirm delivery"}
            tone="green"
            disabled={blocked !== null || saving}
            onPress={confirm}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  pad: { paddingHorizontal: 20 },
  content: { padding: 20, gap: 12 },
  lead: { fontSize: 13, lineHeight: 18, color: colors.muted },
  lineCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 10,
  },
  lineCardOn: { borderColor: colors.green, backgroundColor: colors.greenBg },
  lineText: { flex: 1, gap: 2 },
  lineName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  lineOut: { fontSize: 12, color: colors.muted },
  totalCard: {
    backgroundColor: colors.ink,
    borderRadius: cardRadius,
    padding: 16,
    gap: 2,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.line,
  },
  totalValue: { fontSize: 26, fontWeight: "800", color: colors.white },
  totalNote: { fontSize: 12, color: colors.line, marginTop: 2 },
  noteCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 8,
  },
  noteLabel: { fontSize: 14, fontWeight: "700", color: colors.ink },
  noteInput: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    textAlignVertical: "top",
  },
  bar: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  blocked: { fontSize: 12, fontWeight: "600", color: colors.amber },
  error: { fontSize: 13, lineHeight: 18, color: colors.amber },
});

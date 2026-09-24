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
import { loadCatalog } from "../../db/queries/catalog";
import { createBatch } from "../../db/queries/refilling";
import { loadEmptyStockMap, stockKey } from "../../db/queries/stock";
import { syncReminders } from "../../lib/reminders";
import type { RootStackParamList } from "../../navigation/types";
import {
  brandTouched,
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
type Route = RouteProp<RootStackParamList, "SendBatch">;

interface Ready {
  brands: string[];
  sizes: string[];
  emptiesInHand: Map<string, number>;
}

// Sending cylinders = creating a batch (spec Part C §4 §4).
//
// ALL brands on ONE page, each with its own per-size steppers. The spec calls
// this out as iterated-hard and locked: do NOT replace it with an
// "add one brand at a time" picker. The reason is physical — she is standing
// over a pile she has just counted, and a picker would make her re-enter the
// flow once per brand while a lorry waits. One page means one pass down the
// list.
export function SendBatchScreen() {
  const { businessId, staff } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const { companyId, companyName, companyCode } = useRoute<Route>().params;
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const { showToast } = useToast();

  const [ready, setReady] = useState<Ready | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [counts, setCounts] = useState<CountMap>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCatalog(businessId), loadEmptyStockMap(businessId)])
      .then(([catalog, emptiesInHand]) => {
        if (cancelled) return;
        setReady({
          brands: catalog.cylinderBrands,
          sizes: catalog.cylinderSizes,
          emptiesInHand,
        });
        setLoadError(null);
      })
      .catch((err) => {
        console.error("[SendBatch] could not load the catalog", err);
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, attempt]);

  const total = useMemo(() => totalCylinders(counts), [counts]);
  const blocked = saveBlockedBecause({ counts, cylinderPhotos: photos });

  async function save() {
    if (blocked || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { batchCode } = await createBatch({
        businessId,
        companyId,
        companyCode,
        staffId: staff.id,
        lines: draftLines(counts).map((l) => ({
          brand: l.brand,
          size: l.size,
          qty: l.qty,
        })),
        note: note.trim() ? note.trim() : null,
        photoPaths: photos,
      });

      // The batch is already saved at this point. Reminders are scheduled
      // after, and deliberately not awaited into the success path — a phone
      // that refused notification permission must still be able to send a
      // batch (G8).
      void syncReminders(businessId).catch((err) =>
        console.warn("[SendBatch] could not refresh reminders", err)
      );

      showToast(`Batch ${batchCode} sent`);
      navigation.goBack();
    } catch (err) {
      console.error("[SendBatch] could not save the batch", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  if (loadError !== null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader
          title="Send cylinders"
          subtitle={companyName}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.pad}>
          <LoadError
            what="the cylinder brands"
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (ready === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader
          title="Send cylinders"
          subtitle={companyName}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Send cylinders"
        subtitle={`${companyName} · ${companyCode}`}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lead}>
            Set counts on whatever is actually going. Brands left at zero are
            ignored.
          </Text>

          {ready.brands.map((brand) => {
            const touched = brandTouched(counts, brand);
            return (
              <View
                key={brand}
                style={[styles.brandCard, touched && styles.brandCardOn]}
              >
                <Text style={[styles.brandName, touched && styles.brandNameOn]}>
                  {brand}
                </Text>

                {ready.sizes.map((size) => {
                  const inHand = ready.emptiesInHand.get(stockKey(brand, size)) ?? 0;
                  return (
                    <View key={size} style={styles.sizeRow}>
                      <View style={styles.sizeLabels}>
                        <Text style={styles.sizeName}>{size}</Text>
                        {/* Informational only — she may send more than the
                            book thinks she holds, exactly as a sale may go
                            into negative stock. A count that blocks her is a
                            count that gets worked around on paper. */}
                        <Text style={styles.inHand}>
                          {inHand} in hand
                        </Text>
                      </View>
                      <Stepper
                        value={countAt(counts, brand, size)}
                        label={`${brand} ${size}`}
                        onChange={(next) =>
                          setCounts((current) =>
                            setCount(current, brand, size, next)
                          )
                        }
                      />
                    </View>
                  );
                })}
              </View>
            );
          })}

          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Going to {companyName}</Text>
            <Text style={styles.totalValue}>
              {total} {total === 1 ? "cylinder" : "cylinders"}
            </Text>
          </View>

          <PhotoSlot
            label="Photo of the cylinders"
            hint="Proof of what left the shop, before it leaves."
            required
            paths={photos}
            onChange={setPhotos}
          />

          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>Note (optional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Driver, lorry, anything worth remembering"
              placeholderTextColor={colors.mutedLight}
              accessibilityLabel="Note about this batch"
              multiline
              style={styles.noteInput}
            />
          </View>

          {saveError ? (
            <Text style={styles.error}>
              Could not save this batch: {saveError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.bar, bottomBarPadding(keyboard, insets.bottom)]}>
          {blocked === "no-cylinders" && (
            <Text style={styles.blocked}>
              Set at least one cylinder before saving.
            </Text>
          )}
          {blocked === "no-photo" && (
            <Text style={styles.blocked}>
              A photo of the cylinders is needed before saving.
            </Text>
          )}
          <PrimaryButton
            label={saving ? "Saving…" : "Save batch"}
            tone="green"
            disabled={blocked !== null || saving}
            onPress={save}
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
  brandCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 8,
  },
  // A touched brand is visibly different, so her selection is readable in one
  // glance down a list of eleven (spec §4).
  brandCardOn: {
    borderColor: colors.blue,
    backgroundColor: colors.blueBg,
  },
  brandName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  brandNameOn: { color: colors.blue },
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sizeLabels: { gap: 1 },
  sizeName: { fontSize: 14, fontWeight: "600", color: colors.ink },
  inHand: { fontSize: 11, color: colors.mutedLight },
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

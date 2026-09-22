import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/Buttons";
import { LoadError } from "../../components/LoadError";
import { ScreenHeader } from "../../components/ScreenHeader";
import { Stepper } from "../../components/Stepper";
import { useToast } from "../../components/Toast";
import { useReadyApp } from "../../context/AppContext";
import { loadCatalog } from "../../db/queries/catalog";
import { hasOpeningCount, writeStockCount } from "../../db/queries/settings";
import {
  loadEmptyStockMap,
  loadFullStockMap,
  stockKey,
} from "../../db/queries/stock";
import type { RootStackParamList } from "../../navigation/types";
import {
  brandTouched,
  countAt,
  setCount,
  type CountMap,
} from "../../refilling/batchDraft";
import {
  countedTotal,
  filledBrandCount,
  openingWrites,
  prefillFrom,
  recountAdjustments,
} from "../../settings/openingStock";
import type { StockScope } from "../../types/db";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// OPENING STOCK COUNT (spec Part C §6 §3) — the cold-start solver.
//
// Why this screen is the one thing that genuinely blocks launch: balances in
// this app are never stored, only derived from events (G1). On the day she
// starts using it, the shop already has full cylinders on the shelf and
// empties in the yard from before the app existed — and no event says so. With
// no starting event every count reads zero, and every stock figure the app
// ever shows after that is wrong by exactly the amount she started with.
//
// It lives in Settings rather than Refilling because it is starting-truth:
// shop-wide, rare, and not part of any day's trading.
export function OpeningStockScreen() {
  const { businessId, staff } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [scope, setScope] = useState<StockScope>("full");
  const [catalog, setCatalog] = useState<{
    brands: string[];
    sizes: string[];
  } | null>(null);
  const [current, setCurrent] = useState<Map<string, number>>(new Map());
  const [alreadyCounted, setAlreadyCounted] = useState(false);
  const [counts, setCounts] = useState<CountMap>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Reloaded whenever the pile changes, because the two scopes have entirely
  // separate histories: she may have counted her full stock weeks ago and
  // never counted empties at all.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadCatalog(businessId),
      scope === "full"
        ? loadFullStockMap(businessId)
        : loadEmptyStockMap(businessId),
      hasOpeningCount(businessId, scope),
    ])
      .then(([cat, map, counted]) => {
        if (cancelled) return;
        setCatalog({ brands: cat.cylinderBrands, sizes: cat.cylinderSizes });
        setCurrent(map);
        setAlreadyCounted(counted);
        // A FIRST count starts empty. A RECOUNT starts from what the records
        // already say — see prefillFrom for why starting a recount at zero
        // would quietly wipe every brand she did not bother to check.
        setCounts(counted ? prefillFrom(map) : {});
        setLoadError(null);
      })
      .catch((err) => {
        console.error("[OpeningStock] could not load", err);
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, scope, attempt]);

  const total = useMemo(() => countedTotal(counts), [counts]);
  const brandsFilled = useMemo(() => filledBrandCount(counts), [counts]);

  const writes = useMemo(
    () =>
      alreadyCounted
        ? recountAdjustments(counts, current)
        : openingWrites(counts),
    [alreadyCounted, counts, current]
  );

  async function save() {
    if (saving || writes.length === 0) return;
    setSaving(true);
    try {
      await writeStockCount({
        businessId,
        scope,
        staffId: staff.id,
        mode: alreadyCounted ? "recount" : "opening",
        writes,
        note: alreadyCounted ? "Recount" : "Opening count",
      });
      showToast(
        alreadyCounted
          ? `${writes.length} ${writes.length === 1 ? "correction" : "corrections"} recorded`
          : `Opening count saved — ${total} cylinders`
      );
      navigation.goBack();
    } catch (err) {
      console.error("[OpeningStock] could not save", err);
      showToast("Could not save the count");
      setSaving(false);
    }
  }

  if (loadError !== null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader
          title="Opening stock count"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.pad}>
          <LoadError
            what="your stock counts"
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (catalog === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader
          title="Opening stock count"
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
        title={alreadyCounted ? "Recount stock" : "Opening stock count"}
        subtitle={alreadyCounted ? "Adds a correction" : "Your starting numbers"}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.toggleRow}>
        {(["full", "empty"] as StockScope[]).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: scope === option }}
            onPress={() => setScope(option)}
            style={[styles.toggle, scope === option && styles.toggleOn]}
          >
            <Text
              style={[
                styles.toggleLabel,
                scope === option && styles.toggleLabelOn,
              ]}
            >
              {option === "full" ? "Full stock" : "Empties on hand"}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        {/* The spec requires this wording on screen, and it is load-bearing:
            counting the same cylinder into two buckets, or counting one that
            is already at a refiller, produces stock that does not exist. */}
        <View style={styles.explain}>
          <Text style={styles.explainTitle}>
            {scope === "full"
              ? "Count only cylinders that are full and ready to sell, in the shop right now."
              : "Count only empty cylinders sitting in the shop right now, waiting to go for refilling."}
          </Text>
          <Text style={styles.explainBody}>
            {scope === "full"
              ? "Not empties. Not cylinders you have already sent to a refiller."
              : "Not full ones. Not cylinders already sent to a refiller."}
          </Text>
          <Text style={styles.explainBody}>
            Cylinders already at a refiller go in neither — they are counted
            when that batch comes back, and counting them here would count them
            twice.
          </Text>
        </View>

        {alreadyCounted && (
          // The spec's answer to "what if my first count was wrong": this is a
          // recount that files a correction, not an edit of what was recorded.
          <View style={styles.recountCard}>
            <Ionicons name="repeat" size={16} color={colors.blue} />
            <Text style={styles.recountText}>
              You have counted this before, so the numbers below are what your
              records currently say. Change only what is actually different —
              saving files a correction and leaves your old records untouched.
            </Text>
          </View>
        )}

        {catalog.brands.map((brand) => {
          const touched = brandTouched(counts, brand);
          return (
            <View
              key={brand}
              style={[styles.brandCard, touched && styles.brandCardOn]}
            >
              <Text style={[styles.brandName, touched && styles.brandNameOn]}>
                {brand}
              </Text>
              {catalog.sizes.map((size) => {
                const now = current.get(stockKey(brand, size)) ?? 0;
                const counted = countAt(counts, brand, size);
                const delta = counted - now;
                return (
                  <View key={size} style={styles.sizeRow}>
                    <View style={styles.sizeLabels}>
                      <Text style={styles.sizeName}>{size}</Text>
                      {alreadyCounted && delta !== 0 && (
                        <Text style={styles.delta}>
                          records say {now} · {delta > 0 ? "+" : ""}
                          {delta}
                        </Text>
                      )}
                    </View>
                    <Stepper
                      value={counted}
                      label={`${brand} ${size}`}
                      onChange={(next) =>
                        setCounts((c) => setCount(c, brand, size, next))
                      }
                    />
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>
            {scope === "full" ? "Full cylinders counted" : "Empties counted"}
          </Text>
          <Text style={styles.totalValue}>{total}</Text>
          <Text style={styles.totalNote}>
            across {brandsFilled} {brandsFilled === 1 ? "brand" : "brands"}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: 12 + insets.bottom }]}>
        {writes.length === 0 ? (
          <Text style={styles.blocked}>
            {alreadyCounted
              ? "Nothing is different from what your records already say."
              : "Set a count on at least one brand."}
          </Text>
        ) : (
          <Text style={styles.ready}>
            {alreadyCounted
              ? `${writes.length} ${writes.length === 1 ? "line" : "lines"} will be corrected.`
              : `${writes.length} ${writes.length === 1 ? "line" : "lines"} will be recorded as your starting stock.`}
          </Text>
        )}
        <PrimaryButton
          label={
            saving
              ? "Saving…"
              : alreadyCounted
                ? "Save correction"
                : "Save opening count"
          }
          tone="green"
          disabled={writes.length === 0 || saving}
          onPress={save}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  pad: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  toggle: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.neutral,
    borderWidth: 1,
    borderColor: colors.line,
  },
  toggleOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  toggleLabel: { fontSize: 14, fontWeight: "700", color: colors.ink },
  toggleLabelOn: { color: colors.white },
  explain: {
    backgroundColor: colors.amberBg,
    borderRadius: cardRadius,
    padding: 14,
    gap: 5,
  },
  explainTitle: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.ink },
  explainBody: { fontSize: 12, lineHeight: 18, color: colors.muted },
  recountCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.blueBg,
    borderRadius: cardRadius,
    padding: 12,
  },
  recountText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.ink },
  brandCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 8,
  },
  brandCardOn: { borderColor: colors.blue, backgroundColor: colors.blueBg },
  brandName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  brandNameOn: { color: colors.blue },
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sizeLabels: { gap: 1 },
  sizeName: { fontSize: 14, fontWeight: "600", color: colors.ink },
  delta: { fontSize: 11, fontWeight: "700", color: colors.amber },
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
  totalValue: { fontSize: 28, fontWeight: "800", color: colors.white },
  totalNote: { fontSize: 12, color: colors.line },
  bar: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  blocked: { fontSize: 12, fontWeight: "600", color: colors.amber },
  ready: { fontSize: 12, fontWeight: "600", color: colors.green },
});

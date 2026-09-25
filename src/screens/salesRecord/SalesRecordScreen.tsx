import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadError } from "../../components/LoadError";
import { SearchField } from "../../components/SearchField";
import { useReadyApp } from "../../context/AppContext";
import {
  listSales,
  summariseSales,
  type SaleRecord,
  type SalesFilter,
} from "../../db/queries/sales";
import { formatMoney } from "../../lib/formatMoney";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";
import { SaleRow } from "./SaleRow";
import {
  correctionBlockedBecause,
  correctionCarryOver,
} from "../../db/queries/corrections";
import { useToast } from "../../components/Toast";
import type { RootStackParamList } from "../../navigation/types";

const PAGE = 30;

type Kind = "all" | "cash" | "credit" | "quick";

const KINDS: { key: Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cash", label: "Cash" },
  { key: "credit", label: "Credit" },
  { key: "quick", label: "Quick" },
];

// Parses DD/MM/YYYY. Returns null for anything incomplete, so a half-typed
// date simply doesn't filter yet rather than filtering to nothing.
function parseDMY(raw: string, endOfDay: boolean): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

// SALES RECORD — every sale ever made, filterable (spec Part C §3).
//
// The sales-side twin of the Debts record. The per-customer history answers
// "what has THIS customer bought"; this answers "show me all sales, filtered
// how I want". Same data, two lenses — and deliberately one query layer behind
// both (spec §5), so they can never drift apart.
//
// Read-only throughout. A sale's note can be edited from the per-customer
// history and nowhere else.
export function SalesRecordScreen() {
  const { businessId } = useReadyApp();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [datesOpen, setDatesOpen] = useState(false);
  const [fromRaw, setFromRaw] = useState("");
  const [toRaw, setToRaw] = useState("");

  const [sales, setSales] = useState<SaleRecord[] | null>(null);
  const [summary, setSummary] = useState({ count: 0, total: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Guards against an older, slower query overwriting a newer one's results —
  // easy to hit here because every keystroke in the search box starts a query.
  const runId = useRef(0);

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { showToast } = useToast();

  // A part-paid sale can still be fixed. What the customer has already handed
  // over is carried onto the corrected sale, so 5,000 of goods against 3,000
  // already paid simply leaves 2,000 owing — she is told that up front rather
  // than having to work out whether it is safe to proceed.
  const fixSale = useCallback(
    async (sale: SaleRecord) => {
      const blocked = await correctionBlockedBecause(businessId, sale.id);
      if (blocked === "already-cancelled") {
        showToast("This sale is already cancelled");
        return;
      }

      const carry = await correctionCarryOver(businessId, sale.id);
      if (carry.paid > 0 || carry.emptiesBack > 0) {
        const parts: string[] = [];
        if (carry.paid > 0) parts.push(`${formatMoney(carry.paid)} already paid`);
        if (carry.emptiesBack > 0) {
          parts.push(
            `${carry.emptiesBack} ${carry.emptiesBack === 1 ? "empty" : "empties"} already back`
          );
        }
        showToast(`${parts.join(" and ")} — kept on the corrected sale`);
      }

      navigation.navigate("AddSale", {
        mode: "correct",
        saleId: sale.id,
        customerId: sale.customerId,
        customerName: sale.customerName,
      });
    },
    [businessId, navigation, showToast]
  );

  const filter: SalesFilter = {
    businessId,
    search,
    kind,
    // The record is the book: a cancelled sale stays visible here, crossed
    // out. The running total above it still ignores it, because
    // summariseSales sums goods over the same filter and the row is marked
    // rather than counted.
    includeCancelled: true,
    fromIso: parseDMY(fromRaw, false) ?? undefined,
    toIso: parseDMY(toRaw, true) ?? undefined,
  };
  // Serialised so the effect below re-runs when any filter changes, without
  // depending on an object identity that is new on every render.
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    const mine = ++runId.current;
    let cancelled = false;
    setExhausted(false);
    Promise.all([
      listSales(filter, PAGE, 0),
      // The list shows cancelled sales, the TOTAL must never count them — so
      // the summary runs the same filter with that one flag turned back off.
      summariseSales({ ...filter, includeCancelled: false }),
    ])
      .then(([rows, sum]) => {
        if (cancelled || mine !== runId.current) return;
        setSales(rows);
        setSummary(sum);
        setExhausted(rows.length < PAGE);
        setLoadError(null);
      })
      .catch((err) => {
        console.error("[SalesRecord] could not load", err);
        if (cancelled || mine !== runId.current) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, attempt]);

  // A sale saved elsewhere should be here when she comes back.
  useFocusEffect(
    useCallback(() => {
      setAttempt((n) => n + 1);
    }, [])
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || sales === null) return;
    setLoadingMore(true);
    try {
      const next = await listSales(filter, PAGE, sales.length);
      setSales((prev) => (prev ? [...prev, ...next] : next));
      if (next.length < PAGE) setExhausted(true);
    } catch (err) {
      console.error("[SalesRecord] could not load more", err);
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, exhausted, sales, filterKey]);

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>Sales Record</Text>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search a customer…"
        accessibilityLabel="Search sales by customer name"
      />

      <View style={styles.chipRow}>
        {KINDS.map((k) => (
          <Pressable
            key={k.key}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === k.key }}
            onPress={() => setKind(k.key)}
            style={[styles.chip, kind === k.key && styles.chipOn]}
          >
            <Text
              style={[styles.chipText, kind === k.key && styles.chipTextOn]}
            >
              {k.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter by date range"
          accessibilityState={{ expanded: datesOpen }}
          onPress={() => setDatesOpen((v) => !v)}
          style={[styles.chip, styles.dateChip, datesOpen && styles.chipOn]}
        >
          <Ionicons
            name="calendar-outline"
            size={15}
            color={datesOpen ? colors.white : colors.muted}
          />
        </Pressable>
      </View>

      {datesOpen && (
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>From</Text>
            <TextInput
              value={fromRaw}
              onChangeText={setFromRaw}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={colors.mutedLight}
              accessibilityLabel="From date, day slash month slash year"
              keyboardType="numbers-and-punctuation"
              style={styles.dateInput}
            />
          </View>
          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>To</Text>
            <TextInput
              value={toRaw}
              onChangeText={setToRaw}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={colors.mutedLight}
              accessibilityLabel="To date, day slash month slash year"
              keyboardType="numbers-and-punctuation"
              style={styles.dateInput}
            />
          </View>
        </View>
      )}

      {/* Running total (spec §4). Describes the whole filtered set, not the
          rows scrolled into view — "how much did I sell this week" is the
          question it exists to answer. */}
      <Text style={styles.running}>
        {summary.count} {summary.count === 1 ? "sale" : "sales"} shown ·{" "}
        {formatMoney(summary.total)}
      </Text>
    </View>
  );

  if (loadError !== null && sales === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.pad}>
          <Text style={styles.title}>Sales Record</Text>
          <LoadError
            what="your sales record"
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <FlatList
        data={sales ?? []}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={header}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <SaleRow sale={item} onFix={fixSale} />}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              color={colors.blue}
              style={styles.footerSpinner}
            />
          ) : null
        }
        ListEmptyComponent={
          sales === null ? (
            <ActivityIndicator color={colors.blue} style={styles.footerSpinner} />
          ) : (
            <Text style={styles.empty}>
              {search.trim() || kind !== "all" || fromRaw || toRaw
                ? "No sales match these filters."
                : "No sales recorded yet."}
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  header: { gap: 10, paddingBottom: 14 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 2,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: touchTarget - 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dateChip: { paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.muted },
  chipTextOn: { color: colors.white },
  dateRow: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1, gap: 4 },
  dateLabel: { fontSize: 12, fontWeight: "600", color: colors.muted },
  dateInput: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.ink,
  },
  running: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: "hidden",
  },
  gap: { height: 10 },
  footerSpinner: { marginVertical: 20 },
  empty: {
    fontSize: 14,
    color: colors.mutedLight,
    textAlign: "center",
    marginTop: 48,
  },
});

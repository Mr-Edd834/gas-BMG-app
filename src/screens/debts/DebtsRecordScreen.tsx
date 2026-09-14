import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadError } from "../../components/LoadError";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SearchField } from "../../components/SearchField";
import { useReadyApp } from "../../context/AppContext";
import {
  listEmptiesLedger,
  listMoneyLedger,
  type LedgerEntry,
} from "../../db/queries/ledger";
import { formatDateTime } from "../../lib/formatDate";
import { formatMoney } from "../../lib/formatMoney";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "DebtsRecord">;

const PAGE = 40;

// THE RECORD — every event, both directions, interleaved by time (spec §6).
//
// The spec calls this the most-misread part of the section, so to be explicit
// about what it is NOT: it is not grouped by customer, and it is not a list of
// debts. It is the true sequence of what happened. Musa's Tuesday credit sits
// between two of Wanjiru's repayments if that is the order in which they
// occurred, because the whole value of a record is that it preserves sequence.
export function DebtsRecordScreen({ route, navigation }: Props) {
  const { businessId } = useReadyApp();
  const insets = useSafeAreaInsets();
  const view = route.params.view;

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<LedgerEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const runId = useRef(0);

  const fetchPage = useCallback(
    (offset: number) =>
      view === "money"
        ? listMoneyLedger(businessId, search, PAGE, offset)
        : listEmptiesLedger(businessId, search, PAGE, offset),
    [view, businessId, search]
  );

  useEffect(() => {
    const mine = ++runId.current;
    let cancelled = false;
    setExhausted(false);
    fetchPage(0)
      .then((page) => {
        if (cancelled || mine !== runId.current) return;
        setRows(page);
        setExhausted(page.length < PAGE);
        setLoadError(null);
      })
      .catch((err) => {
        console.error("[DebtsRecord] could not load", err);
        if (cancelled || mine !== runId.current) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || rows === null) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(rows.length);
      setRows((prev) => (prev ? [...prev, ...next] : next));
      if (next.length < PAGE) setExhausted(true);
    } catch (err) {
      console.error("[DebtsRecord] could not load more", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, exhausted, rows, fetchPage]);

  const isMoney = view === "money";

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={isMoney ? "Money record" : "Empties record"}
        subtitle="Everything, newest first"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.searchWrap}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search a customer…"
          accessibilityLabel="Search the record by customer name"
        />
      </View>

      {loadError !== null && rows === null ? (
        <View style={styles.pad}>
          <LoadError
            what="the record"
            detail={loadError}
            onRetry={() => setSearch((s) => s)}
          />
        </View>
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 24 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <Row entry={item} isMoney={isMoney} />}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.blue} style={styles.spinner} />
            ) : null
          }
          ListEmptyComponent={
            rows === null ? (
              <ActivityIndicator color={colors.blue} style={styles.spinner} />
            ) : (
              <Text style={styles.empty}>
                {search.trim()
                  ? "Nothing matches that name."
                  : isMoney
                    ? "No credit or repayments recorded yet."
                    : "No empties taken or returned yet."}
              </Text>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

// One event. Multi-line BY DESIGN (spec §6): a long commodity description must
// never push the date and time off the screen, which is exactly what happens
// when this is squeezed onto one truncating line.
function Row({ entry, isMoney }: { entry: LedgerEntry; isMoney: boolean }) {
  const out = entry.direction === "out";
  return (
    <View style={styles.row}>
      {/* Line 1 — direction, who, and how much. */}
      <View style={styles.rowTop}>
        <Ionicons
          name={out ? "arrow-up" : "arrow-down"}
          size={15}
          color={out ? colors.amber : colors.green}
        />
        <Text style={styles.rowWho} numberOfLines={1}>
          {entry.customerName}
        </Text>
        <Text style={[styles.rowValue, out ? styles.outValue : styles.inValue]}>
          {isMoney
            ? formatMoney(entry.value)
            : `${entry.value} ${entry.value === 1 ? "empty" : "empties"}`}
        </Text>
      </View>

      {/* Line 2 — what it was. Wraps freely; never clipped. */}
      <Text style={styles.rowDetail}>{entry.detail}</Text>

      {/* Line 3 — the tag and the full date AND time. */}
      <View style={styles.rowMeta}>
        <View style={[styles.tag, out ? styles.tagOut : styles.tagIn]}>
          <Text style={[styles.tagText, out ? styles.tagTextOut : styles.tagTextIn]}>
            {entry.tag}
          </Text>
        </View>
        {entry.staffName ? (
          <Text style={styles.rowQuiet}>by {entry.staffName}</Text>
        ) : null}
        <Text style={styles.rowQuiet}>{formatDateTime(entry.at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 10 },
  pad: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 20 },
  gap: { height: 10 },
  spinner: { marginVertical: 20 },
  row: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 4,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowWho: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.ink },
  rowValue: { fontSize: 16, fontWeight: "700" },
  outValue: { color: colors.amber },
  inValue: { color: colors.green },
  rowDetail: { fontSize: 13, lineHeight: 18, color: colors.mutedLight },
  rowMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagOut: { backgroundColor: colors.amberBg },
  tagIn: { backgroundColor: colors.greenBg },
  tagText: { fontSize: 11, fontWeight: "700" },
  tagTextOut: { color: colors.amber },
  tagTextIn: { color: colors.green },
  rowQuiet: { fontSize: 12, color: colors.mutedLight },
  empty: {
    fontSize: 14,
    color: colors.mutedLight,
    textAlign: "center",
    marginTop: 48,
  },
});

import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadError } from "../components/LoadError";
import { describeError } from "../lib/errors";
import { SaleHistoryCard } from "../components/SaleHistoryCard";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatementEvent } from "../components/StatementEvent";
import { useReadyApp } from "../context/AppContext";
import { loadCustomerAccount, type AccountEvent } from "../db/queries/ledger";
import { updateSaleNote } from "../db/queries/sales";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import { cardRadius } from "../theme/layout";

type Props = NativeStackScreenProps<RootStackParamList, "CustomerHistory">;

// Events per page. Big enough that a normal customer's whole account arrives
// in one read, small enough that the Quick Sale tab — which collects every
// walk-in the shop ever makes — stays instant after years of trading.
const PAGE = 40;

// ONE CUSTOMER'S STATEMENT — everything that has passed between the shop and
// this person, newest first.
//
// This screen has this shape because of a real scenario: a customer takes
// cylinders on credit twice, then claims to have sent M-Pesa for the first.
// Answering that by cross-referencing the sales record against the debts
// record means two screens of hunting in front of a sceptical customer, and it
// reads as evasion even when the shop is right.
//
// One timeline answers it instead — what they took, what came back, when, with
// every payment naming the sale it settled. The absence of a third payment
// becomes visible in context rather than asserted from elsewhere. She can hand
// the phone over.
//
// Deviates from spec Part C §1 §6, which scopes this screen to sales only, on
// Edd's instruction (2026-09-14). The note remains the one editable thing
// here; repayments and returns are immutable like all history (G4/G5).
export function CustomerHistoryScreen({ route, navigation }: Props) {
  const { businessId } = useReadyApp();
  const insets = useSafeAreaInsets();
  const { customerId, customerName } = route.params;

  const [events, setEvents] = useState<AccountEvent[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Reloads on focus, so a repayment logged over in Debts appears here the
  // moment she comes back.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setExhausted(false);
      loadCustomerAccount(businessId, customerId, PAGE, 0)
        .then((account) => {
          if (cancelled) return;
          setEvents(account.events);
          setExhausted(account.events.length < PAGE);
          setLoadError(null);
        })
        .catch((err) => {
          console.error("[Statement] could not load", err);
          if (cancelled) return;
          // Never setEvents([]) — an empty statement is a real answer for a new
          // tab, so a failed read must not borrow that message.
          setLoadError(err instanceof Error ? err.message : String(err));
        });
      return () => {
        cancelled = true;
      };
    }, [businessId, customerId, attempt])
  );

  // Older history arrives as she scrolls. Nothing is ever hidden behind a
  // ceiling — the page simply has not been asked for yet.
  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || events === null) return;
    setLoadingMore(true);
    try {
      const next = await loadCustomerAccount(
        businessId,
        customerId,
        PAGE,
        events.length
      );
      setEvents((prev) => (prev ? [...prev, ...next.events] : next.events));
      if (next.events.length < PAGE) setExhausted(true);
    } catch (err) {
      console.error("[Statement] could not load more", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, exhausted, events, businessId, customerId]);

  const saveNote = useCallback(async (saleId: string, note: string) => {
    const trimmed = note.trim();
    let previous: string | null = null;
    setEvents((prev) =>
      prev === null
        ? prev
        : prev.map((e) => {
            if (e.kind !== "sale" || e.sale.id !== saleId) return e;
            previous = e.sale.note;
            return {
              ...e,
              sale: { ...e.sale, note: trimmed.length > 0 ? trimmed : null },
            };
          })
    );
    try {
      await updateSaleNote(saleId, note);
      setNoteError(null);
    } catch (err) {
      console.error("[Statement] could not save the note", err);
      // Roll the optimistic update back rather than leave a note on screen
      // that was never written to the database.
      setEvents((prev) =>
        prev === null
          ? prev
          : prev.map((e) =>
              e.kind === "sale" && e.sale.id === saleId
                ? { ...e, sale: { ...e.sale, note: previous } }
                : e
            )
      );
      setNoteError(
        `That note was not saved. ${describeError(err).friendly}`
      );
    }
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={customerName}
        subtitle="Statement"
        onBack={() => navigation.goBack()}
      />

      {noteError !== null && <Text style={styles.noteError}>{noteError}</Text>}

      {loadError !== null && events === null ? (
        <View style={styles.errorPad}>
          <LoadError
            what={`${customerName}'s statement`}
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      ) : events === null ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={events}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.blue} style={styles.moreSpinner} />
            ) : null
          }
          keyExtractor={(e) => `${e.kind}:${e.id}`}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 20 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            item.kind === "sale" ? (
              <SaleHistoryCard
                sale={item.sale}
                expanded={expandedId === item.sale.id}
                onToggle={() =>
                  setExpandedId((cur) =>
                    cur === item.sale.id ? null : item.sale.id
                  )
                }
                onSaveNote={(note) => saveNote(item.sale.id, note)}
              />
            ) : (
              <StatementEvent event={item} />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          ListEmptyComponent={
            <Text style={styles.empty}>Nothing recorded yet.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  moreSpinner: { marginVertical: 16 },
  screen: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20 },
  errorPad: { paddingHorizontal: 20 },
  gap: { height: 12 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    marginBottom: 14,
  },
  summaryHalf: { flex: 1, gap: 2 },
  summaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: colors.line,
    marginHorizontal: 12,
  },
  summaryLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: "700",
    color: colors.muted,
  },
  summaryValue: { fontSize: 18, fontWeight: "700" },
  owed: { color: colors.amber },
  clear: { color: colors.green },
  noteError: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.amber,
    backgroundColor: colors.amberBg,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  empty: {
    fontSize: 14,
    color: colors.mutedLight,
    textAlign: "center",
    marginTop: 64,
  },
});

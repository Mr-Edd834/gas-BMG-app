import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadError } from "../components/LoadError";
import { SaleHistoryCard } from "../components/SaleHistoryCard";
import { ScreenHeader } from "../components/ScreenHeader";
import { useReadyApp } from "../context/AppContext";
import {
  listCustomerSales,
  updateSaleNote,
  type SaleRecord,
} from "../db/queries/sales";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "CustomerHistory">;

// VIEW PREVIOUS SALES — one customer's history (spec Part C §1 §6).
//
// Reached from any tab, including the pinned Quick Sale tab, where it shows
// every quick sale ever made (they all share that one customer row).
export function CustomerHistoryScreen({ route, navigation }: Props) {
  const { businessId } = useReadyApp();
  const { customerId, customerName } = route.params;

  const [sales, setSales] = useState<SaleRecord[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Separate from an empty list: "no sales yet" is true of every new tab,
  // so a failed read must not borrow that message.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listCustomerSales(businessId, customerId)
      .then((rows) => {
        if (cancelled) return;
        setSales(rows);
        setLoadError(null);
      })
      .catch((err) => {
        console.error("[History] could not load sales", err);
        if (cancelled) return;
        // Not setSales([]) — that rendered a fault as "No sales recorded yet."
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, customerId, attempt]);

  // The only write this screen can make. It updates the note column and
  // nothing else — see the rule in SaleHistoryCard and updateSaleNote.
  const saveNote = useCallback(async (saleId: string, note: string) => {
    const trimmed = note.trim();
    // Remember what was on screen before, so a failed write can be undone.
    let previous: string | null = null;
    // Optimistic: the local write is immediate and offline-safe, so showing
    // the new note straight away is honest, not a guess (G8).
    setSales((prev) => {
      if (prev === null) return prev;
      return prev.map((sale) => {
        if (sale.id !== saleId) return sale;
        previous = sale.note;
        return { ...sale, note: trimmed.length > 0 ? trimmed : null };
      });
    });
    try {
      await updateSaleNote(saleId, note);
      setNoteError(null);
    } catch (err) {
      console.error("[History] could not save the note", err);
      // An optimistic update that is never corrected becomes a lie: the note
      // sits on screen looking saved while the database has the old value,
      // and she finds out only when it disappears on a later visit. Put the
      // real value back and say what happened.
      setSales((prev) =>
        prev === null
          ? prev
          : prev.map((sale) =>
              sale.id === saleId ? { ...sale, note: previous } : sale
            )
      );
      setNoteError(
        `That note was not saved: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={customerName}
        subtitle="Previous sales"
        onBack={() => navigation.goBack()}
      />

      {noteError !== null && (
        <Text style={styles.noteError}>{noteError}</Text>
      )}

      {loadError !== null && sales === null ? (
        <View style={styles.errorPad}>
          <LoadError
            what={`${customerName}'s previous sales`}
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      ) : sales === null ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(sale) => sale.id}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <SaleHistoryCard
              sale={item}
              expanded={expandedId === item.id}
              onToggle={() =>
                setExpandedId((current) =>
                  current === item.id ? null : item.id
                )
              }
              onSaveNote={(note) => saveNote(item.id, note)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          ListEmptyComponent={
            // A brand-new tab, or Quick Sale before any use.
            <Text style={styles.empty}>No sales recorded yet.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 20,
  },
  errorPad: {
    paddingHorizontal: 20,
  },
  noteError: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.amber,
    backgroundColor: colors.amberBg,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  gap: {
    height: 12,
  },
  empty: {
    fontSize: 14,
    color: colors.mutedLight,
    textAlign: "center",
    marginTop: 64,
  },
});

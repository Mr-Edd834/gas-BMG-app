import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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

  useEffect(() => {
    let cancelled = false;
    listCustomerSales(businessId, customerId)
      .then((rows) => {
        if (!cancelled) setSales(rows);
      })
      .catch((err) => {
        console.error("[History] could not load sales", err);
        if (!cancelled) setSales([]);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, customerId]);

  // The only write this screen can make. It updates the note column and
  // nothing else — see the rule in SaleHistoryCard and updateSaleNote.
  const saveNote = useCallback(async (saleId: string, note: string) => {
    const trimmed = note.trim();
    // Optimistic: the local write is immediate and offline-safe, so showing
    // the new note straight away is honest, not a guess (G8).
    setSales((prev) =>
      prev === null
        ? prev
        : prev.map((sale) =>
            sale.id === saleId
              ? { ...sale, note: trimmed.length > 0 ? trimmed : null }
              : sale
          )
    );
    try {
      await updateSaleNote(saleId, note);
    } catch (err) {
      console.error("[History] could not save the note", err);
    }
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={customerName}
        subtitle="Previous sales"
        onBack={() => navigation.goBack()}
      />

      {sales === null ? (
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

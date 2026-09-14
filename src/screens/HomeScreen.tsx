import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "../components/Buttons";
import { CustomerTabCard } from "../components/CustomerTabCard";
import { LoadError } from "../components/LoadError";
import { SearchField } from "../components/SearchField";
import { useReadyApp } from "../context/AppContext";
import { listCustomerTabs, type CustomerTab } from "../db/queries/customers";
import { formatDateLine } from "../lib/formatDate";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// HOME — the customer-tab wall (spec Part C §1 §3).
//
// Not a dashboard: no KPIs, no debt totals, no chart. One question only —
// "whose account do I want, and let me act on it fast."
export function HomeScreen() {
  const { businessId, staff } = useReadyApp();
  const navigation = useNavigation<Nav>();

  const [tabs, setTabs] = useState<CustomerTab[] | null>(null);
  // Distinct from "tabs is an empty array". An empty wall is a real, ordinary
  // answer on a new install; a failed read is a fault. Collapsing the two
  // would tell her every customer had vanished.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");

  // Reloads on every focus, so a tab's frequency ranking, last item and
  // timestamp are correct the moment we return from saving a sale.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listCustomerTabs(businessId)
        .then((rows) => {
          if (cancelled) return;
          setTabs(rows);
          setLoadError(null);
        })
        .catch((err) => {
          console.error("[Home] could not load the tab wall", err);
          if (cancelled) return;
          // Deliberately does NOT set tabs to [] — that is what made a
          // database fault render as "No customer tabs yet."
          setLoadError(err instanceof Error ? err.message : String(err));
        });
      return () => {
        cancelled = true;
      };
    }, [businessId, attempt])
  );

  // Live filter by name (spec §3). Quick Sale stays visible whenever it
  // matches, and the list is already sorted frequency-first by the query.
  const visibleTabs = useMemo(() => {
    if (!tabs) return [];
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) return tabs;
    return tabs.filter((tab) => tab.name.toLowerCase().includes(needle));
  }, [tabs, search]);

  const openHistory = useCallback(
    (tab: CustomerTab) =>
      navigation.navigate("CustomerHistory", {
        customerId: tab.id,
        customerName: tab.name,
      }),
    [navigation]
  );

  const openAddSale = useCallback(
    (tab: CustomerTab) =>
      // Pre-bound to this customer — the flow skips the name step entirely.
      navigation.navigate("AddSale", {
        mode: "existing",
        customerId: tab.id,
        customerName: tab.name,
      }),
    [navigation]
  );

  const header = (
    <View style={styles.header}>
      {/* Today's real date — never a hardcoded one (G7). */}
      <Text style={styles.dateLine}>{formatDateLine()}</Text>
      {/* The staff member on THIS phone, not the customer. */}
      <Text style={styles.greeting}>Habari, {staff.name}</Text>

      <View style={styles.headerControls}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search a customer…"
          accessibilityLabel="Search customer tabs by name"
        />
        {/* The ONLY way to create a customer tab, and a text button by
            design — not a floating "+" icon (spec §3). */}
        <PrimaryButton
          label="Add new tab +"
          tone="ink"
          onPress={() => navigation.navigate("AddSale", { mode: "new-tab" })}
        />
      </View>
    </View>
  );

  // The read failed and we have nothing trustworthy to show. The header still
  // renders so the screen stays recognisable and she can still search or add.
  if (loadError !== null && tabs === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.errorPad}>
          {header}
          <LoadError
            what="your customer tabs"
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (tabs === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <FlatList
        data={visibleTabs}
        keyExtractor={(tab) => tab.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <CustomerTabCard
            tab={item}
            onViewHistory={() => openHistory(item)}
            onAddSale={() => openAddSale(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search.trim().length > 0
              ? "No tab matches that name."
              : "No customer tabs yet."}
          </Text>
        }
      />
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  errorPad: {
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 16,
  },
  dateLine: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "600",
    color: colors.muted,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
    marginTop: 4,
  },
  headerControls: {
    marginTop: 16,
    gap: 10,
  },
  gap: {
    height: 12,
  },
  empty: {
    fontSize: 14,
    color: colors.mutedLight,
    textAlign: "center",
    marginTop: 32,
  },
});

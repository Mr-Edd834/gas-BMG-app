import { Ionicons } from "@expo/vector-icons";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/Buttons";
import { LoadError } from "../../components/LoadError";
import { ScreenHeader } from "../../components/ScreenHeader";
import { StatusChip } from "../../components/StatusChip";
import { useReadyApp } from "../../context/AppContext";
import {
  listBatches,
  loadCompany,
  type RefillBatch,
} from "../../db/queries/refilling";
import { formatDateTime } from "../../lib/formatDate";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "RefillCompany">;

interface Loaded {
  code: string;
  director: string;
  phone: string;
  batches: RefillBatch[];
}

// One company's page (spec Part C §4 §2): its current batches, a way to send
// more, and the permanent record of what has come back.
export function RefillCompanyScreen() {
  const { businessId } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const { companyId, companyName } = useRoute<Route>().params;
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Re-read on focus rather than once on mount: sending a batch and marking
  // one returned both happen on screens pushed on top of this one, and coming
  // back to a stale "still out" count is the one thing this page must not do.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([
        loadCompany(businessId, companyId),
        listBatches(businessId, companyId, true),
      ])
        .then(([company, batches]) => {
          if (cancelled) return;
          if (!company) {
            setLoadError("This company is no longer in the records.");
            return;
          }
          setData({
            code: company.code,
            director: company.director,
            phone: company.phone,
            batches,
          });
          setLoadError(null);
        })
        .catch((err) => {
          console.error("[RefillCompany] could not load", err);
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : String(err));
          }
        });
      return () => {
        cancelled = true;
      };
    }, [businessId, companyId, attempt])
  );

  if (loadError !== null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader title={companyName} onBack={() => navigation.goBack()} />
        <View style={styles.pad}>
          <LoadError
            what={`${companyName}'s batches`}
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (data === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader title={companyName} onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  const totalOut = data.batches.reduce((sum, b) => sum + b.totalOut, 0);

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Still with them</Text>
        <Text style={styles.summaryValue}>
          {totalOut} {totalOut === 1 ? "cylinder" : "cylinders"}
        </Text>
        <Text style={styles.summaryWho}>
          {data.director} · {data.phone}
        </Text>
      </View>

      <PrimaryButton
        label="Send cylinders +"
        tone="blue"
        onPress={() =>
          navigation.navigate("SendBatch", {
            companyId,
            companyName,
            companyCode: data.code,
          })
        }
      />
      <PrimaryButton
        label="View deliveries record"
        tone="ink"
        onPress={() =>
          navigation.navigate("DeliveriesRecord", { companyId, companyName })
        }
      />

      <Text style={styles.sectionTitle}>Current batches</Text>
      <Text style={styles.sectionNote}>
        A batch stays here until every cylinder in it is back.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={companyName}
        subtitle={data.code}
        onBack={() => navigation.goBack()}
      />
      <FlatList
        data={data.batches}
        keyExtractor={(b) => b.id}
        ListHeaderComponent={header}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Batch ${item.batchCode}, ${item.totalOut} of ${item.totalSent} still out`}
            onPress={() => navigation.navigate("RefillBatch", { batchId: item.id })}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.batchCode}>{item.batchCode}</Text>
              <StatusChip
                tone={item.totalOut === item.totalSent ? "amber" : "blue"}
                label={
                  item.totalOut === item.totalSent
                    ? "None back yet"
                    : `${item.totalSent - item.totalOut} back`
                }
              />
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </View>

            <Text style={styles.out}>
              {item.totalOut} of {item.totalSent} still out
            </Text>

            {/* The brand breakdown as separate pills, never one cramped comma
                line — she is matching this against a physical pile. */}
            <View style={styles.pills}>
              {item.lines.map((line) => (
                <View
                  key={`${line.brand}|${line.size}`}
                  style={[styles.pill, line.out === 0 && styles.pillDone]}
                >
                  <Text
                    style={[styles.pillText, line.out === 0 && styles.pillTextDone]}
                  >
                    {line.brand} {line.size} · {line.returned}/{line.sent}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.sent}>Sent {formatDateTime(item.sentAt)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing is out with {companyName} right now. Everything sent has
            come back.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  pad: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  headerBlock: { gap: 10, paddingBottom: 14 },
  summary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 16,
    gap: 2,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
  },
  summaryValue: { fontSize: 28, fontWeight: "800", color: colors.ink },
  summaryWho: { fontSize: 12, color: colors.mutedLight, marginTop: 4 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    marginTop: 10,
  },
  sectionNote: { fontSize: 12, color: colors.mutedLight },
  gap: { height: 12 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 6,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  batchCode: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.ink,
  },
  out: { fontSize: 15, fontWeight: "700", color: colors.amber },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    backgroundColor: colors.amberBg,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pillDone: { backgroundColor: colors.greenBg },
  pillText: { fontSize: 12, fontWeight: "600", color: colors.amber },
  pillTextDone: { color: colors.green },
  sent: { fontSize: 12, color: colors.mutedLight },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedLight,
    textAlign: "center",
    marginTop: 24,
  },
  pressed: { opacity: 0.7 },
});

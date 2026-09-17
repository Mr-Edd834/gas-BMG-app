import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
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
import { useReadyApp } from "../../context/AppContext";
import { listCompanies, type RefillCompany } from "../../db/queries/refilling";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// REFILLING — a wall of company tabs (spec Part C §4 §2).
//
// Deliberately the same shape as the Home customer wall: this is the supply
// side of the same idea, and she should not have to learn a second navigation
// pattern for it. Tap a company to see its batches; "Add new +" makes one.
export function RefillingScreen() {
  const { businessId } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [companies, setCompanies] = useState<RefillCompany[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listCompanies(businessId)
        .then((rows) => {
          if (cancelled) return;
          setCompanies(rows);
          setLoadError(null);
        })
        .catch((err) => {
          console.error("[Refilling] could not load companies", err);
          if (cancelled) return;
          setLoadError(err instanceof Error ? err.message : String(err));
        });
      return () => {
        cancelled = true;
      };
    }, [businessId, attempt])
  );

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>Refilling</Text>
      <Text style={styles.sub}>
        Empties you have sent out, and what has come back full.
      </Text>
      <PrimaryButton
        label="Add new +"
        tone="ink"
        onPress={() => navigation.navigate("CreateCompany")}
      />
    </View>
  );

  if (loadError !== null && companies === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.pad}>
          <Text style={styles.title}>Refilling</Text>
          <LoadError
            what="your refilling companies"
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (companies === null) {
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
        data={companies}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.cylindersOut} cylinders still out`}
            onPress={() =>
              navigation.navigate("RefillCompany", {
                companyId: item.id,
                companyName: item.name,
              })
            }
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.cardTop}>
              <View style={styles.codeChip}>
                <Text style={styles.codeText}>{item.code}</Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </View>

            <Text style={styles.who}>
              {item.director} · {item.phone}
            </Text>

            {/* What is actually at stake with this company right now. Zero is
                stated rather than hidden, so "nothing out" is a real answer
                rather than an absent line. */}
            <View style={styles.statusRow}>
              {item.cylindersOut > 0 ? (
                <Text style={styles.out}>
                  {item.cylindersOut} still out · {item.openBatches}{" "}
                  {item.openBatches === 1 ? "batch" : "batches"}
                </Text>
              ) : (
                <Text style={styles.clear}>Nothing out with them</Text>
              )}
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No refilling companies yet. Add the one you send your empties to.
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
  content: { paddingHorizontal: 20, paddingTop: 12 },
  header: { gap: 10, paddingBottom: 16 },
  title: { fontSize: 26, fontWeight: "700", color: colors.ink },
  sub: { fontSize: 13, lineHeight: 18, color: colors.muted },
  gap: { height: 12 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 4,
    minHeight: touchTarget,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  codeChip: {
    backgroundColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  codeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: colors.white,
  },
  name: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.ink },
  who: { fontSize: 12, color: colors.mutedLight },
  statusRow: { marginTop: 4 },
  out: { fontSize: 13, fontWeight: "700", color: colors.amber },
  clear: { fontSize: 13, fontWeight: "600", color: colors.green },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedLight,
    textAlign: "center",
    marginTop: 40,
  },
  pressed: { opacity: 0.7 },
});

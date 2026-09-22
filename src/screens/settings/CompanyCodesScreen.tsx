import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadError } from "../../components/LoadError";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useReadyApp } from "../../context/AppContext";
import { listCompanies, type RefillCompany } from "../../db/queries/refilling";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// The code reference list (spec Part C §6 §4, owed to Refilling §6).
//
// Read-only on purpose. Codes are generated when a company is created and are
// baked into every batch ID ever issued to that company — `KGD-11JUL26-01`
// means nothing if KGD can be renamed afterwards. This screen exists so a
// batch number written on a paper receipt months ago can still be decoded.
export function CompanyCodesScreen() {
  const { businessId } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [companies, setCompanies] = useState<RefillCompany[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listCompanies(businessId)
      .then((rows) => {
        if (!cancelled) {
          setCompanies(rows);
          setLoadError(null);
        }
      })
      .catch((err) => {
        console.error("[CompanyCodes] could not load", err);
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, attempt]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Refilling company codes"
        subtitle="For reading batch numbers"
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        <Text style={styles.lead}>
          Every batch you send gets a number like{" "}
          <Text style={styles.mono}>KGD-11JUL26-01</Text> — the company's code,
          the date it went, then which batch of that day. This is what the
          letters mean.
        </Text>

        {loadError !== null ? (
          <LoadError
            what="your company codes"
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : companies === null ? (
          <ActivityIndicator color={colors.blue} style={styles.spinner} />
        ) : companies.length === 0 ? (
          <Text style={styles.empty}>
            No refilling companies yet. Codes appear here as you add them in the
            Refilling tab.
          </Text>
        ) : (
          <View style={styles.card}>
            {companies.map((company, index) => (
              <View
                key={company.id}
                style={[
                  styles.row,
                  index < companies.length - 1 && styles.rowDivider,
                ]}
              >
                <View style={styles.codeChip}>
                  <Text style={styles.codeText}>{company.code}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.name}>{company.name}</Text>
                  <Text style={styles.who}>
                    {company.director} · {company.phone}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footnote}>
          Codes cannot be changed. Every batch number already written down
          depends on them staying the same.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  lead: { fontSize: 13, lineHeight: 19, color: colors.muted },
  mono: { fontWeight: "800", color: colors.ink, letterSpacing: 0.5 },
  spinner: { marginVertical: 24 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  codeChip: {
    backgroundColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 52,
    alignItems: "center",
  },
  codeText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.white,
  },
  rowText: { flex: 1, gap: 1 },
  name: { fontSize: 15, fontWeight: "700", color: colors.ink },
  who: { fontSize: 12, color: colors.mutedLight },
  empty: { fontSize: 14, lineHeight: 20, color: colors.mutedLight },
  footnote: { fontSize: 12, lineHeight: 17, color: colors.mutedLight },
});

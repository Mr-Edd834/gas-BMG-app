import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadError } from "../../components/LoadError";
import { PhotoViewer } from "../../components/PhotoViewer";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useReadyApp } from "../../context/AppContext";
import { listDeliveries, type DeliveryRecord } from "../../db/queries/refilling";
import { formatDate, formatTime } from "../../lib/formatDate";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "DeliveriesRecord">;

const PAGE = 30;

// Every return ever made to one company (spec Part C §4 §9).
//
// Read-only and append-only, with no edit and no delete for anyone — the same
// rule as the Debts record, for the same reason: a record only settles an
// argument if it cannot have been quietly changed afterwards, and with three
// equal-permission phones an in-app delete is a delete for everyone.
//
// Paged rather than loaded whole, because this list only grows: a company she
// uses weekly reaches hundreds of entries in a couple of years, and a screen
// that reads all of them gets slower every month it is used.
export function DeliveriesRecordScreen() {
  const { businessId } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const { companyId, companyName } = useRoute<Route>().params;
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<DeliveryRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setExhausted(false);
    listDeliveries(businessId, companyId, PAGE, 0)
      .then((page) => {
        if (cancelled) return;
        setRows(page);
        setExhausted(page.length < PAGE);
        setLoadError(null);
      })
      .catch((err) => {
        console.error("[DeliveriesRecord] could not load", err);
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, companyId, attempt]);

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || rows === null) return;
    setLoadingMore(true);
    try {
      const next = await listDeliveries(businessId, companyId, PAGE, rows.length);
      setRows((prev) => (prev ? [...prev, ...next] : next));
      if (next.length < PAGE) setExhausted(true);
    } catch (err) {
      console.error("[DeliveriesRecord] could not load more", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, exhausted, rows, businessId, companyId]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Deliveries record"
        subtitle={`${companyName} · newest first`}
        onBack={() => navigation.goBack()}
      />

      {loadError !== null && rows === null ? (
        <View style={styles.pad}>
          <LoadError
            what={`${companyName}'s deliveries`}
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
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
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <Entry entry={item} companyName={companyName} />
          )}
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
                Nothing has come back from {companyName} yet. Every delivery you
                record will stay here for good.
              </Text>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function Entry({
  entry,
  companyName,
}: {
  entry: DeliveryRecord;
  companyName: string;
}) {
  const cylinders = entry.photos.filter((p) => p.kind === "cylinder");
  const receipts = entry.photos.filter((p) => p.kind === "receipt");

  return (
    <View style={styles.card}>
      {/* The batch ID is the anchor of the whole record: it is what ties this
          Tuesday delivery back to the pile that left last Wednesday, even when
          four other deliveries happened in between. */}
      <View style={styles.banner}>
        <Text style={styles.batchCode}>{entry.batchCode}</Text>
        <Text style={styles.company}>{companyName}</Text>
      </View>

      <Section label="Returned">
        <View style={styles.slots}>
          {entry.lines.map((line) => (
            <View key={`${line.brand}|${line.size}`} style={styles.slot}>
              <Text style={styles.slotBrand}>{line.brand}</Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  {line.size} · {line.qty}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Section>

      <Section label="When">
        <Text style={styles.when}>
          {formatDate(entry.returnedAt)} · {formatTime(entry.returnedAt)}
        </Text>
        {entry.staffName ? (
          <Text style={styles.meta}>Recorded by {entry.staffName}</Text>
        ) : null}
      </Section>

      {entry.note ? (
        <Section label="Note">
          <Text style={styles.note}>{entry.note}</Text>
        </Section>
      ) : null}

      <Section label="Photos">
        <View style={styles.thumbs}>
          {cylinders.map((photo) => (
            <PhotoViewer
              key={photo.id}
              uri={photo.localPath}
              size={64}
              accessibilityLabel="Photo of the cylinders returned"
            />
          ))}
          {receipts.map((photo) => (
            <PhotoViewer
              key={photo.id}
              uri={photo.localPath}
              size={64}
              accessibilityLabel="Photo of the receipt"
            />
          ))}
        </View>
        {/* Stated rather than left blank: "no receipt was taken" is a fact
            worth knowing when this entry is being used to settle something. */}
        {receipts.length === 0 ? (
          <Text style={styles.meta}>No receipt photo</Text>
        ) : null}
      </Section>
    </View>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  gap: { height: 12 },
  spinner: { marginVertical: 20 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 10,
  },
  banner: {
    backgroundColor: colors.greenBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  batchCode: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.green,
  },
  company: { fontSize: 12, color: colors.muted, marginTop: 1 },
  section: { gap: 4 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
    textTransform: "uppercase",
  },
  slots: { gap: 8 },
  slot: { flexDirection: "row", alignItems: "center", gap: 8 },
  slotBrand: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.ink },
  pill: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { fontSize: 13, fontWeight: "700", color: colors.ink },
  when: { fontSize: 14, fontWeight: "600", color: colors.ink },
  meta: { fontSize: 12, color: colors.mutedLight },
  note: { fontSize: 14, lineHeight: 20, color: colors.ink },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedLight,
    textAlign: "center",
    marginTop: 40,
  },
});

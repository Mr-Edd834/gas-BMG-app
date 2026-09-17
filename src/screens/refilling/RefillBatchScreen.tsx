import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/Buttons";
import { LoadError } from "../../components/LoadError";
import { PhotoViewer } from "../../components/PhotoViewer";
import { ScreenHeader } from "../../components/ScreenHeader";
import { StatusChip } from "../../components/StatusChip";
import { useReadyApp } from "../../context/AppContext";
import {
  listBatchReturns,
  loadBatch,
  loadPhotos,
  type BatchLine,
  type RecordEntry,
  type RefillBatch,
} from "../../db/queries/refilling";
import { formatDateTime } from "../../lib/formatDate";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "RefillBatch">;

interface Loaded {
  batch: RefillBatch;
  photos: { id: string; kind: "cylinder" | "receipt"; localPath: string }[];
  returns: RecordEntry[];
}

// One batch's own screen (spec Part C §4 §5) — a batch carries a status, a
// per-brand breakdown, what it was sent with, and every return made against
// it, which is more than fits inside a list row.
export function RefillBatchScreen() {
  const { businessId } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const { batchId } = useRoute<Route>().params;
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([
        loadBatch(businessId, batchId),
        loadPhotos("batch", batchId),
        listBatchReturns(businessId, batchId),
      ])
        .then(([batch, photos, returns]) => {
          if (cancelled) return;
          if (!batch) {
            setLoadError("This batch is no longer in the records.");
            return;
          }
          setData({ batch, photos, returns });
          setLoadError(null);
        })
        .catch((err) => {
          console.error("[RefillBatch] could not load", err);
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : String(err));
          }
        });
      return () => {
        cancelled = true;
      };
    }, [businessId, batchId, attempt])
  );

  if (loadError !== null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader title="Batch" onBack={() => navigation.goBack()} />
        <View style={styles.pad}>
          <LoadError
            what="this batch"
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
        <ScreenHeader title="Batch" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  const { batch, photos, returns } = data;
  const allBack = batch.totalOut === 0;

  // Grouped per brand so each brand gets its own card with its sizes as
  // separate tiles — never one cramped "K-Gas: 2 Big | Afrigas: 3 Big" line.
  const byBrand = new Map<string, BatchLine[]>();
  for (const line of batch.lines) {
    byBrand.set(line.brand, [...(byBrand.get(line.brand) ?? []), line]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={batch.batchCode}
        subtitle={batch.companyName}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        <View style={[styles.banner, allBack ? styles.bannerDone : styles.bannerOut]}>
          <Text style={[styles.bannerValue, allBack && styles.bannerValueDone]}>
            {allBack
              ? "All back"
              : `${batch.totalOut} of ${batch.totalSent} still out`}
          </Text>
          <StatusChip
            tone={allBack ? "green" : "amber"}
            label={allBack ? "Closed" : "Waiting on them"}
          />
        </View>

        <Text style={styles.sectionTitle}>What went</Text>
        {[...byBrand.entries()].map(([brand, lines]) => (
          <View key={brand} style={styles.brandCard}>
            <Text style={styles.brandName}>{brand}</Text>
            <View style={styles.tiles}>
              {lines.map((line) => (
                <View
                  key={line.size}
                  style={[styles.tile, line.out === 0 && styles.tileDone]}
                >
                  <Text style={styles.tileSize}>{line.size}</Text>
                  <Text style={styles.tileCount}>
                    {line.returned}/{line.sent}
                  </Text>
                  <Text
                    style={[styles.tileState, line.out === 0 && styles.tileStateDone]}
                  >
                    {line.out === 0 ? "all back" : `${line.out} still out`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>When sent</Text>
        <View style={styles.card}>
          <Text style={styles.when}>{formatDateTime(batch.sentAt)}</Text>
          {batch.staffName ? (
            <Text style={styles.meta}>Recorded by {batch.staffName}</Text>
          ) : null}
          {batch.note ? (
            <View style={styles.noteBlock}>
              <Text style={styles.noteLabel}>Note</Text>
              <Text style={styles.noteText}>{batch.note}</Text>
            </View>
          ) : null}
          {photos.length > 0 ? (
            <View style={styles.thumbs}>
              {photos.map((photo) => (
                <PhotoViewer
                  key={photo.id}
                  uri={photo.localPath}
                  size={64}
                  accessibilityLabel="Photo of the cylinders sent"
                />
              ))}
            </View>
          ) : (
            <Text style={styles.meta}>No photo was saved with this batch.</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Returns so far</Text>
        {returns.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.meta}>
              Nothing has come back from this batch yet.
            </Text>
          </View>
        ) : (
          returns.map((entry) => (
            <View key={entry.id} style={styles.returnCard}>
              <Text style={styles.returnWhen}>{formatDateTime(entry.at)}</Text>
              <View style={styles.pills}>
                {entry.lines.map((line) => (
                  <View key={`${line.brand}|${line.size}`} style={styles.pill}>
                    <Text style={styles.pillText}>
                      {line.brand} {line.size} · {line.qty}
                    </Text>
                  </View>
                ))}
              </View>
              {entry.note ? (
                <Text style={styles.noteText}>{entry.note}</Text>
              ) : null}
              {entry.staffName ? (
                <Text style={styles.meta}>Recorded by {entry.staffName}</Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: 12 + insets.bottom }]}>
        {allBack ? (
          <Text style={styles.closedNote}>
            Every cylinder in this batch is back. It stays in the deliveries
            record for good.
          </Text>
        ) : (
          <PrimaryButton
            label="Mark as returned"
            tone="green"
            onPress={() => navigation.navigate("MarkReturned", { batchId })}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  pad: { paddingHorizontal: 20 },
  content: { padding: 20, gap: 10 },
  banner: {
    borderRadius: cardRadius,
    padding: 16,
    gap: 8,
    alignItems: "flex-start",
  },
  bannerOut: { backgroundColor: colors.amberBg },
  bannerDone: { backgroundColor: colors.greenBg },
  bannerValue: { fontSize: 22, fontWeight: "800", color: colors.amber },
  bannerValueDone: { color: colors.green },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: colors.muted,
    marginTop: 10,
    textTransform: "uppercase",
  },
  brandCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 10,
  },
  brandName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  tiles: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    backgroundColor: colors.amberBg,
    borderRadius: 10,
    padding: 12,
    gap: 2,
  },
  tileDone: { backgroundColor: colors.greenBg },
  tileSize: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
    textTransform: "uppercase",
  },
  tileCount: { fontSize: 20, fontWeight: "800", color: colors.ink },
  tileState: { fontSize: 12, fontWeight: "600", color: colors.amber },
  tileStateDone: { color: colors.green },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 8,
  },
  when: { fontSize: 15, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 12, color: colors.mutedLight },
  noteBlock: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  noteLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
  },
  noteText: { fontSize: 14, lineHeight: 20, color: colors.ink },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  returnCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: colors.line,
    borderLeftColor: colors.green,
    borderRadius: cardRadius,
    padding: 14,
    gap: 6,
  },
  returnWhen: { fontSize: 14, fontWeight: "700", color: colors.ink },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    backgroundColor: colors.greenBg,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pillText: { fontSize: 12, fontWeight: "600", color: colors.green },
  bar: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  closedNote: { fontSize: 13, lineHeight: 18, color: colors.muted },
});

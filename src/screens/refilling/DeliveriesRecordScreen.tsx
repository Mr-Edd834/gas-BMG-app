import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadError } from "../../components/LoadError";
import { PhotoViewer } from "../../components/PhotoViewer";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useReadyApp } from "../../context/AppContext";
import { listCompanyRecord, type RecordEntry } from "../../db/queries/refilling";
import { formatDate, formatTime } from "../../lib/formatDate";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "DeliveriesRecord">;

const PAGE = 30;

// Everything that has moved between the shop and one company, both
// directions, newest first (spec Part C §4 §9, widened to include sends).
//
// The spec originally scoped this to return events only. That left the send
// reachable solely while its batch was open, so the cylinder photo — the proof
// of what LEFT the shop — went dark the moment the last cylinder came back,
// which is roughly when someone is most likely to argue about it. Both
// directions now land here, and a send appears the instant it is saved.
//
// Read-only and append-only, like the Debts record and for the same reason: a
// record only settles an argument if it cannot have been quietly changed, and
// with three equal-permission phones an in-app delete is a delete for everyone.
//
// Paged rather than loaded whole, because this list only grows: a company she
// uses weekly reaches hundreds of entries in a couple of years, and a screen
// that reads all of them gets slower every month it is used.
export function DeliveriesRecordScreen() {
  const { businessId } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const { companyId, companyName } = useRoute<Route>().params;
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<RecordEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // On focus, not just on mount: a send recorded two screens away must be
  // here when she navigates back, without a restart.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setExhausted(false);
      listCompanyRecord(businessId, companyId, PAGE, 0)
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
    }, [businessId, companyId, attempt])
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || rows === null) return;
    setLoadingMore(true);
    try {
      const next = await listCompanyRecord(
        businessId,
        companyId,
        PAGE,
        rows.length
      );
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
        subtitle={`${companyName} · sent and returned, newest first`}
        onBack={() => navigation.goBack()}
      />

      {/* A key at the top, so the two colours are readable the first time
          rather than inferred. */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchSent]} />
          <Text style={styles.legendText}>Sent out</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchBack]} />
          <Text style={styles.legendText}>Came back</Text>
        </View>
      </View>

      {loadError !== null && rows === null ? (
        <View style={styles.pad}>
          <LoadError
            what={`${companyName}'s record`}
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      ) : (
        <FlatList
          data={rows ?? []}
          // The kind is part of the key: a batch id and a return id are
          // different UUIDs today, but a key that would break if that ever
          // stopped being true is a key worth making explicit.
          keyExtractor={(r) => `${r.kind}:${r.id}`}
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
                Nothing has moved between you and {companyName} yet. Every batch
                you send and every delivery you record stays here for good.
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
  entry: RecordEntry;
  companyName: string;
}) {
  // Amber for leaving, green for back. The same pair used everywhere else in
  // the app — amber is "out, still owed to you", green is "settled" — so the
  // colours mean here exactly what they mean on a debt card. Colour is never
  // the only signal: the chip spells it out for anyone reading in sunlight or
  // with colour-blindness.
  const sent = entry.kind === "sent";
  const total = entry.lines.reduce((sum, l) => sum + l.qty, 0);
  const cylinders = `${total} ${total === 1 ? "cylinder" : "cylinders"}`;
  const cylinderPhotos = entry.photos.filter((p) => p.kind === "cylinder");
  const receiptPhotos = entry.photos.filter((p) => p.kind === "receipt");

  return (
    <View style={[styles.card, sent ? styles.cardSent : styles.cardBack]}>
      {/* The batch ID is the anchor of the whole record: it is what ties a
          Tuesday delivery back to the pile that left last Wednesday, even when
          four other movements happened in between. */}
      <View style={[styles.banner, sent ? styles.bannerSent : styles.bannerBack]}>
        <View style={styles.bannerTop}>
          <Text style={[styles.batchCode, sent ? styles.textSent : styles.textBack]}>
            {entry.batchCode}
          </Text>
          <View style={[styles.chip, sent ? styles.chipSent : styles.chipBack]}>
            <Text style={[styles.chipText, sent ? styles.textSent : styles.textBack]}>
              {sent ? "SENT OUT" : "CAME BACK"}
            </Text>
          </View>
        </View>
        <Text style={styles.company}>
          {sent ? `${cylinders} to ${companyName}` : `${cylinders} from ${companyName}`}
        </Text>
      </View>

      <Section label={sent ? "Sent" : "Returned"}>
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

      {/* The date is labelled with WHICH event it belongs to, not just
          "When". A returned entry carries its batch's code, and a bare date
          beside a code that contains a different date invites exactly one
          misreading: that this is when the cylinders left. It is not — a
          returned row's timestamp is `returned_at`, the moment they came
          back. The label now says so out loud. */}
      <Section label={sent ? "When it left" : "When it came back"}>
        <Text style={styles.when}>
          {formatDate(entry.at)} · {formatTime(entry.at)}
        </Text>
        {entry.staffName ? (
          <Text style={styles.meta}>Recorded by {entry.staffName}</Text>
        ) : null}
      </Section>

      {/* The note gets a filled surface of its own rather than a heading and
          bare text. It is the one free-text thing on the card — everything
          else is a number, a date or a name — so it has to read as a quoted
          remark, not as more body copy. Same tinted box the sale cards, the
          per-customer statement and the batch page use, because "someone
          wrote this by hand" should look identical everywhere in the app. */}
      {entry.note ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>NOTE</Text>
          <Text style={styles.note}>{entry.note}</Text>
        </View>
      ) : null}

      <Section label="Photos">
        <View style={styles.thumbs}>
          {cylinderPhotos.map((photo) => (
            <PhotoViewer
              key={photo.id}
              uri={photo.localPath}
              size={64}
              accessibilityLabel={
                sent
                  ? "Photo of the cylinders sent"
                  : "Photo of the cylinders returned"
              }
            />
          ))}
          {receiptPhotos.map((photo) => (
            <PhotoViewer
              key={photo.id}
              uri={photo.localPath}
              size={64}
              accessibilityLabel="Photo of the receipt"
            />
          ))}
        </View>
        {/* Stated rather than left blank: "no receipt was taken" is a fact
            worth knowing when this entry is being used to settle something.
            A send has no receipt to take, so it is not asked about. */}
        {!sent && receiptPhotos.length === 0 ? (
          <Text style={styles.meta}>No receipt photo</Text>
        ) : null}
        {cylinderPhotos.length === 0 ? (
          <Text style={styles.meta}>No photo of the cylinders</Text>
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
  content: { paddingHorizontal: 20, paddingTop: 12 },
  gap: { height: 12 },
  spinner: { marginVertical: 20 },
  legend: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  swatchSent: { backgroundColor: colors.amber },
  swatchBack: { backgroundColor: colors.green },
  legendText: { fontSize: 12, fontWeight: "600", color: colors.muted },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    // The spine of colour down the left edge is what makes the two kinds
    // separable while scrolling fast, without reading a word.
    borderLeftWidth: 5,
    borderRadius: cardRadius,
    padding: 14,
    gap: 10,
  },
  cardSent: { borderLeftColor: colors.amber },
  cardBack: { borderLeftColor: colors.green },
  banner: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  bannerSent: { backgroundColor: colors.amberBg },
  bannerBack: { backgroundColor: colors.greenBg },
  bannerTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  batchCode: { flex: 1, fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  textSent: { color: colors.amber },
  textBack: { color: colors.green },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  chipSent: { borderColor: colors.amber },
  chipBack: { borderColor: colors.green },
  chipText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  company: { fontSize: 12, color: colors.muted },
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
  noteBox: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  noteLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
  },
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

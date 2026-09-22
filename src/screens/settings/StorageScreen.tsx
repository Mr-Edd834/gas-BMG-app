import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/Buttons";
import { ScreenHeader } from "../../components/ScreenHeader";
import { isSupabaseConfigured } from "../../lib/supabase";
import { formatBytes, photoStorage, type PhotoStorage } from "../../lib/photos";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Backup & storage (spec Part C §6 §6).
//
// This screen is where "no fabricated numbers" stops being a style rule and
// starts being a safety one. The spec's mockup shows a backup "2 hours ago"
// and "212 MB" of photos — both placeholder. Cloud backup does not exist yet,
// and a screen that implied it did would be the single most harmful lie this
// app could tell: she would stop worrying about a risk she is fully exposed
// to. So while the backend is unbuilt, this screen says so plainly.
//
// The photo figure, by contrast, is measured from the filesystem — because it
// is a number she might act on.
export function StorageScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [photos, setPhotos] = useState<PhotoStorage | null>(null);

  useEffect(() => {
    let cancelled = false;
    photoStorage()
      .then((stats) => {
        if (!cancelled) setPhotos(stats);
      })
      .catch((err) => {
        console.warn("[Storage] could not measure photos", err);
        if (!cancelled) setPhotos({ count: 0, bytes: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Backup & storage"
        subtitle="Where your records are kept"
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        {isSupabaseConfigured ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cloud backup</Text>
            <Text style={styles.body}>
              Everything is saved on this phone first, and copied to the cloud
              automatically whenever you have internet. You do not need to do
              anything.
            </Text>
          </View>
        ) : (
          // Stated as plainly as it can be. This is the top risk on the
          // project's own launch checklist, and the person carrying it should
          // be told, not reassured.
          <View style={styles.warnCard}>
            <View style={styles.warnHead}>
              <Ionicons name="warning" size={18} color={colors.amber} />
              <Text style={styles.warnTitle}>
                Cloud backup is not set up yet
              </Text>
            </View>
            <Text style={styles.body}>
              Right now every sale, debt and photo lives on this phone and
              nowhere else. If this phone is lost, broken or wiped, the records
              go with it.
            </Text>
            <Text style={styles.body}>
              Nothing you do in the app can cause that, and nothing is wrong
              with what is saved. It simply has no second copy yet.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Photos on this phone</Text>
          {photos === null ? (
            <ActivityIndicator color={colors.blue} style={styles.spinner} />
          ) : (
            <>
              <Text style={styles.bigValue}>{formatBytes(photos.bytes)}</Text>
              <Text style={styles.body}>
                {photos.count === 0
                  ? "No photos saved yet."
                  : `${photos.count} ${photos.count === 1 ? "photo" : "photos"} — receipts, and photos of cylinders going out and coming back.`}
              </Text>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Free up space</Text>
          <Text style={styles.body}>
            Photos can only be removed from this phone once they are safely in
            the cloud — and cleared photos stay viewable whenever you have
            internet.
          </Text>
          {/* The hard guardrail from Sales Record §6, and today it bites all
              the way: with no cloud, not one photo is backed up, so not one
              photo can be cleared. The button is disabled and says why, rather
              than being hidden as though the feature did not exist. */}
          <Text style={styles.blocked}>
            Nothing can be cleared yet — none of these photos have a second
            copy anywhere.
          </Text>
          <PrimaryButton
            label="Clear backed-up photos"
            tone="ink"
            disabled
            onPress={() => {}}
          />
        </View>

        <Text style={styles.footnote}>
          Sync cannot be switched off. It is automatic by design, so a phone can
          never quietly stop backing up a business without anyone noticing.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 8,
  },
  warnCard: {
    backgroundColor: colors.amberBg,
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: cardRadius,
    padding: 14,
    gap: 8,
  },
  warnHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  warnTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.amber },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  body: { fontSize: 13, lineHeight: 19, color: colors.muted },
  bigValue: { fontSize: 26, fontWeight: "800", color: colors.ink },
  blocked: { fontSize: 12, fontWeight: "600", color: colors.amber },
  spinner: { alignSelf: "flex-start", marginVertical: 6 },
  footnote: { fontSize: 12, lineHeight: 17, color: colors.mutedLight },
});

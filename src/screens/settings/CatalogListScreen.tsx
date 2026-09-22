import { Ionicons } from "@expo/vector-icons";
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../../components/Buttons";
import { LoadError } from "../../components/LoadError";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useToast } from "../../components/Toast";
import { useReadyApp } from "../../context/AppContext";
import {
  addCatalogEntry,
  hideCatalogEntry,
  listCatalogEntries,
  restoreCatalogEntry,
  type CatalogEntry,
} from "../../db/queries/settings";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "CatalogList">;

// Add and remove entries in one catalog list (spec Part C §6 §2).
//
// "Remove" hides; it never deletes. That resolves an open item in the spec,
// and the reasoning is in `hideCatalogEntry` — deleting would be safe for the
// records but unrecoverable for her, and nothing else in this app can be
// destroyed by a single tap.
export function CatalogListScreen() {
  const { businessId } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const { kind, title, note } = useRoute<Route>().params;
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const isDenominations = kind === "airtime_denomination";

  const reload = useCallback(async () => {
    const rows = await listCatalogEntries(businessId, kind);
    setEntries(rows);
    setLoadError(null);
  }, [businessId, kind]);

  useEffect(() => {
    let cancelled = false;
    listCatalogEntries(businessId, kind)
      .then((rows) => {
        if (!cancelled) {
          setEntries(rows);
          setLoadError(null);
        }
      })
      .catch((err) => {
        console.error("[CatalogList] could not load", err);
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, kind, attempt]);

  const trimmed = draft.trim();
  // Denominations are numbers everywhere else in the app — the airtime price
  // is worked out from the face value — so a non-numeric entry here would
  // produce an option that cannot be priced.
  const valid =
    trimmed.length > 0 &&
    (!isDenominations || (/^\d+$/.test(trimmed) && Number(trimmed) > 0));

  async function add() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await addCatalogEntry(businessId, kind, trimmed);
      setDraft("");
      await reload();
      showToast(`${trimmed} added`);
    } catch (err) {
      console.error("[CatalogList] could not add", err);
      showToast("Could not add that");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(entry: CatalogEntry) {
    if (busy) return;
    setBusy(true);
    try {
      if (entry.active) {
        await hideCatalogEntry(entry.id);
        showToast(`${entry.value} hidden`);
      } else {
        await restoreCatalogEntry(entry.id);
        showToast(`${entry.value} back`);
      }
      await reload();
    } catch (err) {
      console.error("[CatalogList] could not change", err);
      showToast("Could not change that");
    } finally {
      setBusy(false);
    }
  }

  if (loadError !== null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader title={title} onBack={() => navigation.goBack()} />
        <View style={styles.pad}>
          <LoadError
            what={title.toLowerCase()}
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

  const active = entries?.filter((e) => e.active) ?? [];
  const hidden = entries?.filter((e) => !e.active) ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={title}
        subtitle={`${active.length} in use`}
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 24 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {note ? (
            <View style={styles.noteCard}>
              <Ionicons
                name="information-circle"
                size={16}
                color={colors.blue}
              />
              <Text style={styles.noteText}>{note}</Text>
            </View>
          ) : null}

          {entries === null ? (
            <ActivityIndicator color={colors.blue} style={styles.spinner} />
          ) : (
            <>
              <View style={styles.card}>
                {active.length === 0 ? (
                  <Text style={styles.empty}>
                    Nothing here yet. Add the first one below.
                  </Text>
                ) : (
                  active.map((entry, index) => (
                    <View
                      key={entry.id}
                      style={[
                        styles.row,
                        index < active.length - 1 && styles.rowDivider,
                      ]}
                    >
                      <Text style={styles.value}>
                        {isDenominations ? `KSh ${entry.value}` : entry.value}
                      </Text>
                      {entry.usedInHistory && (
                        <Text style={styles.usedTag}>in past sales</Text>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${entry.value}`}
                        disabled={busy}
                        onPress={() => toggle(entry)}
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.action,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.actionLabel}>Remove</Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </View>

              {/* Hidden entries stay visible here, which is the whole point of
                  hiding rather than deleting: a mistaken tap is one tap to
                  undo, and a seasonal brand can come back without being
                  retyped. */}
              {hidden.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Removed</Text>
                  <View style={styles.card}>
                    {hidden.map((entry, index) => (
                      <View
                        key={entry.id}
                        style={[
                          styles.row,
                          index < hidden.length - 1 && styles.rowDivider,
                        ]}
                      >
                        <Text style={[styles.value, styles.valueHidden]}>
                          {isDenominations ? `KSh ${entry.value}` : entry.value}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Bring back ${entry.value}`}
                          disabled={busy}
                          onPress={() => toggle(entry)}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.action,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[styles.actionLabel, styles.actionRestore]}
                          >
                            Bring back
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.hiddenNote}>
                    Removed options no longer appear when adding a sale. Every
                    sale that already used one still shows it, exactly as it was
                    recorded.
                  </Text>
                </>
              )}
            </>
          )}
        </ScrollView>

        <View style={[styles.bar, { paddingBottom: 12 + insets.bottom }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={isDenominations ? "Face value, e.g. 50" : `Add to ${title.toLowerCase()}`}
            placeholderTextColor={colors.mutedLight}
            accessibilityLabel={`New entry for ${title}`}
            autoCapitalize={isDenominations ? "none" : "words"}
            keyboardType={isDenominations ? "number-pad" : "default"}
            style={styles.input}
            onSubmitEditing={add}
          />
          <PrimaryButton
            label="Add"
            tone="green"
            disabled={!valid || busy}
            onPress={add}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  pad: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  spinner: { marginVertical: 24 },
  noteCard: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.blueBg,
    borderRadius: cardRadius,
    padding: 12,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.ink },
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
    gap: 10,
    minHeight: touchTarget,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  value: { flex: 1, fontSize: 15, color: colors.ink },
  valueHidden: { color: colors.mutedLight, textDecorationLine: "line-through" },
  usedTag: { fontSize: 10, color: colors.mutedLight },
  action: { paddingHorizontal: 8, paddingVertical: 6 },
  actionLabel: { fontSize: 13, fontWeight: "700", color: colors.amber },
  actionRestore: { color: colors.blue },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.muted,
    textTransform: "uppercase",
    marginTop: 6,
  },
  hiddenNote: { fontSize: 12, lineHeight: 17, color: colors.mutedLight },
  empty: { fontSize: 13, color: colors.mutedLight, padding: 14 },
  bar: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  input: {
    flex: 1,
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.ink,
  },
  pressed: { opacity: 0.6 },
});

import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useToast } from "../../components/Toast";
import { useReadyApp } from "../../context/AppContext";
import { setPref } from "../../db/queries/settings";
import {
  REMINDERS_ENABLED_KEY,
  REMINDER_HOUR_KEY,
  reminderHour,
  remindersEnabled,
  syncReminders,
} from "../../lib/reminders";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Reminder controls (spec Part C §6 §5).
//
// What she controls: whether reminders arrive, and at what hour. What she
// deliberately cannot control is the SCHEDULE — day-6 and day-7 for a debt,
// day-3 and day-7 for a refill batch. Those come from the debt rules
// themselves, and exposing them would let a reminder be quietly tuned until
// it never usefully fires, which is worse than switching it off honestly.
export function RemindersScreen() {
  const { businessId } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [hour, setHour] = useState(9);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([remindersEnabled(), reminderHour()])
      .then(([on, h]) => {
        if (cancelled) return;
        setEnabled(on);
        setHour(h);
      })
      .catch((err) => console.warn("[Reminders] could not read prefs", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Every change rebuilds the whole schedule immediately. The alternative —
  // applying it at next launch — means she turns reminders off, gets one at
  // 09:00 tomorrow anyway, and stops trusting the switch.
  async function apply(nextEnabled: boolean, nextHour: number) {
    setBusy(true);
    try {
      await setPref(REMINDERS_ENABLED_KEY, nextEnabled ? "true" : "false");
      await setPref(REMINDER_HOUR_KEY, String(nextHour));
      await syncReminders(businessId);
    } catch (err) {
      console.error("[Reminders] could not apply", err);
      showToast("Could not save that");
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader title="Reminders" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  const label = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour >= 12 ? "PM" : "AM"}`;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Reminders"
        subtitle="For your own follow-up"
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.rowTitle}>Reminders on</Text>
              <Text style={styles.rowSub}>
                For debts coming due, and for cylinders still out with a
                refiller.
              </Text>
            </View>
            <Switch
              value={enabled}
              disabled={busy}
              onValueChange={(next) => {
                setEnabled(next);
                void apply(next, hour);
              }}
              trackColor={{ true: colors.green, false: colors.line }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        {enabled && (
          <View style={styles.card}>
            <Text style={styles.rowTitle}>What time they arrive</Text>
            <Text style={styles.rowSub}>
              A calm morning slot, before the day gets busy.
            </Text>
            <View style={styles.hourRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Earlier"
                disabled={busy || hour <= 5}
                onPress={() => {
                  const next = hour - 1;
                  setHour(next);
                  void apply(true, next);
                }}
                style={({ pressed }) => [
                  styles.hourButton,
                  (busy || hour <= 5) && styles.hourDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.hourGlyph}>−</Text>
              </Pressable>
              <Text style={styles.hourValue}>{label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Later"
                disabled={busy || hour >= 21}
                onPress={() => {
                  const next = hour + 1;
                  setHour(next);
                  void apply(true, next);
                }}
                style={({ pressed }) => [
                  styles.hourButton,
                  styles.hourPlus,
                  (busy || hour >= 21) && styles.hourDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.hourGlyph, styles.hourGlyphPlus]}>+</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* These three notes are required on screen by the spec, and each one
            heads off a real misunderstanding about what reminders are. */}
        <View style={styles.notes}>
          <Note text="Reminders are for you. Nothing is ever sent to a customer." />
          <Note text="They work with no internet — your phone holds the schedule itself, and they arrive even if the app is closed." />
          <Note text="Changing the time changes only when they arrive. A debt is still due seven days after it was taken, and a batch is still checked on day three." />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Note({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <View style={styles.bullet} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 6,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  switchText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  rowSub: { fontSize: 12, lineHeight: 18, color: colors.mutedLight },
  hourRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    marginTop: 8,
  },
  hourButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neutral,
    borderWidth: 1,
    borderColor: colors.line,
  },
  hourPlus: { backgroundColor: colors.blue, borderColor: colors.blue },
  hourDisabled: { opacity: 0.4 },
  hourGlyph: { fontSize: 22, fontWeight: "700", color: colors.ink },
  hourGlyphPlus: { color: colors.white },
  hourValue: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.ink,
    minWidth: 110,
    textAlign: "center",
  },
  notes: { gap: 10, paddingHorizontal: 2 },
  note: { flexDirection: "row", gap: 8 },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.muted,
    marginTop: 7,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted },
  pressed: { opacity: 0.7 },
});

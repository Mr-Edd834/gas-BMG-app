import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "../components/Buttons";
import { useApp } from "../context/AppContext";
import { addStaff, listStaff } from "../db/queries/identity";
import { colors } from "../theme/colors";
import { cardRadius, touchTarget } from "../theme/layout";
import type { Staff } from "../types/db";

// First launch, once per phone (spec Part B §5, Part C §1 §2).
//
// This is the ENTIRE entry experience. There is no PIN, no password and no
// login — that was drafted and explicitly rejected (CLAUDE.md, Security).
// The phone learns its person here and never asks again, which is what lets
// every later sale attribute itself with zero extra taps (G6).
//
// The roster starts EMPTY on a brand-new install (G7 — no seeded staff names
// ever ship), so the "add your name" path below is the normal first path, not
// an edge case. Later phones will find the roster already populated once
// Supabase sync brings the other devices' names down.
export function StaffPickerScreen() {
  const { businessId, chooseStaff } = useApp();
  const [roster, setRoster] = useState<Staff[] | null>(null);
  const [typedName, setTypedName] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  // This screen is the very first thing a new phone shows. If storage is
  // broken here, every later screen will fail too — saying so now beats
  // letting her name a phone that cannot remember the name.
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    listStaff(businessId)
      .then((rows) => {
        if (cancelled) return;
        setRoster(rows);
        // Nobody on the roster yet — go straight to the name field rather
        // than showing an empty list she has to tap past.
        setAddingNew(rows.length === 0);
      })
      .catch((err) => {
        console.error("[StaffPicker] could not read the roster", err);
        if (cancelled) return;
        // Falling back to the name field is still the right move — she can
        // only proceed by naming this phone — but the fault is surfaced so a
        // broken database doesn't masquerade as a brand-new install.
        setRoster([]);
        setAddingNew(true);
        setSaveError(
          `Could not read the staff list: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const pick = useCallback(
    async (staff: Staff) => {
      setSaving(true);
      try {
        await chooseStaff(staff);
      } finally {
        setSaving(false);
      }
    },
    [chooseStaff]
  );

  const addAndPick = useCallback(async () => {
    if (!businessId) return;
    const name = typedName.trim();
    if (name.length === 0) return;
    setSaving(true);
    try {
      const staff = await addStaff(businessId, name);
      await chooseStaff(staff);
    } catch (err) {
      console.error("[StaffPicker] could not save the name", err);
      setSaveError(
        `Could not save that name: ${err instanceof Error ? err.message : String(err)}`
      );
      setSaving(false);
    }
  }, [businessId, typedName, chooseStaff]);

  if (roster === null) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Whose phone is this?</Text>
        <Text style={styles.sub}>
          Pick your name once. Every sale you log will be recorded under it.
        </Text>

        {saveError !== null && (
          <Text style={styles.saveError}>{saveError}</Text>
        )}

        {!addingNew && (
          <View style={styles.list}>
            {roster.map((staff) => (
              <Pressable
                key={staff.id}
                accessibilityRole="button"
                disabled={saving}
                onPress={() => pick(staff)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={styles.rowText}>{staff.name}</Text>
              </Pressable>
            ))}

            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => setAddingNew(true)}
              style={({ pressed }) => [
                styles.secondaryRow,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryText}>
                That&apos;s not me — add my name
              </Text>
            </Pressable>
          </View>
        )}

        {addingNew && (
          <View style={styles.list}>
            <TextInput
              value={typedName}
              onChangeText={setTypedName}
              placeholder="Your name"
              placeholderTextColor={colors.mutedLight}
              accessibilityLabel="Your name"
              autoFocus
              autoCapitalize="words"
              style={styles.input}
              onSubmitEditing={addAndPick}
              returnKeyType="done"
            />
            <PrimaryButton
              label={saving ? "Saving…" : "That's me"}
              tone="ink"
              disabled={saving || typedName.trim().length === 0}
              onPress={addAndPick}
            />
            {roster.length > 0 && (
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => setAddingNew(false)}
                style={({ pressed }) => [
                  styles.secondaryRow,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryText}>Back to the name list</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
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
  content: {
    padding: 24,
    paddingTop: 48,
    gap: 8,
  },
  heading: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
  },
  sub: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 16,
  },
  saveError: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.amber,
    backgroundColor: colors.amberBg,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  list: {
    gap: 10,
  },
  row: {
    minHeight: touchTarget + 8,
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
  },
  pressed: {
    opacity: 0.8,
  },
  rowText: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.ink,
  },
  secondaryRow: {
    minHeight: touchTarget,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    backgroundColor: colors.neutral,
    borderRadius: cardRadius,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.blue,
  },
  input: {
    minHeight: touchTarget + 8,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    fontSize: 17,
    color: colors.ink,
  },
});

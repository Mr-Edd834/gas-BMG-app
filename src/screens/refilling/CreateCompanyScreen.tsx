import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  bottomBarPadding,
  useKeyboardInset,
} from "../../lib/useKeyboardInset";
import { PrimaryButton } from "../../components/Buttons";
import { ErrorNote } from "../../components/ErrorNote";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useToast } from "../../components/Toast";
import { useReadyApp } from "../../context/AppContext";
import { createCompany, listCompanyCodes } from "../../db/queries/refilling";
import type { RootStackParamList } from "../../navigation/types";
import { uniqueCompanyCode } from "../../refilling/ids";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// One page, three mandatory fields (spec Part C §4 §3).
//
// All three are required because each has a job: the name identifies the
// company, and the director plus phone are how she chases a batch that has not
// come back. This is the deliberate exception to the app's PII-minimisation
// rule (CLAUDE.md, Security) — customers are name-only, suppliers are
// businesses she must be able to ring.
export function CreateCompanyScreen() {
  const { businessId } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [director, setDirector] = useState("");
  const [phone, setPhone] = useState("");
  const [takenCodes, setTakenCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Loaded so the preview can show the code she will ACTUALLY get, collisions
  // included. Showing "TGD" and then storing "TGD2" would teach her a batch ID
  // that does not exist.
  useEffect(() => {
    let cancelled = false;
    listCompanyCodes(businessId)
      .then((codes) => {
        if (!cancelled) setTakenCodes(codes);
      })
      .catch((err) => console.warn("[CreateCompany] could not read codes", err));
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const trimmedName = name.trim();
  const previewCode = useMemo(
    () => (trimmedName ? uniqueCompanyCode(trimmedName, takenCodes) : null),
    [trimmedName, takenCodes]
  );

  const complete =
    trimmedName.length > 0 &&
    director.trim().length > 0 &&
    phone.trim().length > 0;

  async function save() {
    if (!complete || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createCompany({
        businessId,
        name: trimmedName,
        director,
        phone,
      });
      showToast(`${trimmedName} added as ${created.code}`);
      navigation.replace("RefillCompany", {
        companyId: created.id,
        companyName: trimmedName,
      });
    } catch (err) {
      console.error("[CreateCompany] could not save", err);
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="New refilling company"
        subtitle="All three details are needed"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Field
            label="Company name"
            value={name}
            onChange={setName}
            placeholder="e.g. K-Gas Depot"
            autoCapitalize="words"
          />

          {/* The code is derived, never typed — a field she would have to
              invent is a field that slows down a job done while a lorry waits.
              It is shown live so the batch IDs she will read out later are
              never a surprise. */}
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Their short code</Text>
            {previewCode ? (
              <>
                <Text style={styles.codePreview}>{previewCode}</Text>
                <Text style={styles.codeHint}>
                  Batches to them will be numbered like{" "}
                  <Text style={styles.codeInline}>{previewCode}-11JUL26-01</Text>{" "}
                  — their code, the date, then which batch of that day.
                </Text>
              </>
            ) : (
              <Text style={styles.codeWaiting}>
                Type the company name and the code appears here.
              </Text>
            )}
          </View>

          <Field
            label="Director"
            value={director}
            onChange={setDirector}
            placeholder="Who you deal with"
            autoCapitalize="words"
          />
          <Field
            label="Director's phone"
            value={phone}
            onChange={setPhone}
            placeholder="07…"
            keyboardType="phone-pad"
          />

          {saveError ? (
            <ErrorNote
              title={`Could not save this company`}
              error={saveError}
            />
          ) : null}
        </ScrollView>

        <View style={[styles.bar, bottomBarPadding(keyboard, insets.bottom)]}>
          {!complete && (
            <Text style={styles.blocked}>
              Fill in all three before creating the company.
            </Text>
          )}
          <PrimaryButton
            label={saving ? "Saving…" : "Create company"}
            tone="green"
            disabled={!complete || saving}
            onPress={save}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoCapitalize = "none",
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  autoCapitalize?: "none" | "words";
  keyboardType?: "default" | "phone-pad";
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.requiredTag}>REQUIRED</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedLight}
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  content: { padding: 20, gap: 16 },
  field: { gap: 6 },
  fieldHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.ink },
  requiredTag: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.amber,
  },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  codeCard: {
    backgroundColor: colors.blueBg,
    borderRadius: cardRadius,
    padding: 14,
    gap: 6,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.blue,
  },
  codePreview: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 3,
    color: colors.ink,
  },
  codeHint: { fontSize: 12, lineHeight: 18, color: colors.muted },
  codeInline: { fontWeight: "700", color: colors.ink },
  codeWaiting: { fontSize: 13, color: colors.muted },
  bar: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  blocked: { fontSize: 12, color: colors.amber, fontWeight: "600" },
  error: { fontSize: 13, lineHeight: 18, color: colors.amber },
});

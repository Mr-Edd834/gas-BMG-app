import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { captureRefillPhoto } from "../lib/photos";
import { colors } from "../theme/colors";
import { cardRadius, touchTarget } from "../theme/layout";
import { PhotoViewer } from "./PhotoViewer";

// Up to three photos for one purpose (spec Part C §4 §7).
//
// Three is a deliberate limit, not a technical one. On unreliable connectivity
// each photo costs sync time and data bundle and fills the phone faster, while
// three still covers a couple of angles plus a retake. A cap also keeps the
// "free up space" job in Settings a rare chore rather than a routine one.
export const PHOTO_CAP = 3;

export function PhotoSlot({
  label,
  hint,
  nudge,
  required,
  paths,
  onChange,
}: {
  label: string;
  hint?: string;
  // A bold line for an OPTIONAL photo that should still be taken — the receipt
  // on a refill return (spec Part C §4 §5). It is not required, because a
  // driver who arrives without a receipt must not be able to stop her
  // recording the delivery; but it is the piece of paper that settles an
  // argument later, so the ask is deliberately loud.
  nudge?: string;
  // A required slot says so on screen; the save button enforces it. Saying it
  // here as well means she finds out before tapping save, not after.
  required: boolean;
  paths: string[];
  onChange: (paths: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const full = paths.length >= PHOTO_CAP;

  const add = useCallback(async () => {
    if (busy || full) return;
    setBusy(true);
    try {
      const photo = await captureRefillPhoto();
      if (photo) onChange([...paths, photo.localPath]);
    } finally {
      setBusy(false);
    }
  }, [busy, full, paths, onChange]);

  const removeAt = useCallback(
    (index: number) => onChange(paths.filter((_, i) => i !== index)),
    [paths, onChange]
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={required ? styles.required : styles.optional}>
          {required ? "REQUIRED" : "OPTIONAL"}
        </Text>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {nudge ? <Text style={styles.nudge}>{nudge}</Text> : null}

      <View style={styles.row}>
        {paths.map((path, index) => (
          <View key={path} style={styles.thumbWrap}>
            <PhotoViewer uri={path} size={72} accessibilityLabel={label} />
            {/* Removable up to the moment of saving — after that the record is
                append-only and photos are part of it (G5). */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
              onPress={() => removeAt(index)}
              hitSlop={8}
              style={styles.remove}
            >
              <Ionicons name="close" size={13} color={colors.white} />
            </Pressable>
          </View>
        ))}

        {!full && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add a photo for ${label}`}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={add}
            style={({ pressed }) => [styles.add, pressed && styles.pressed]}
          >
            <Ionicons
              name={busy ? "hourglass-outline" : "camera-outline"}
              size={20}
              color={colors.blue}
            />
            <Text style={styles.addLabel}>
              {paths.length === 0 ? "Add" : "Add more"}
            </Text>
          </Pressable>
        )}
      </View>

      {full && (
        <Text style={styles.capNote}>
          {PHOTO_CAP} photos is the limit — remove one to add another.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: { fontSize: 14, fontWeight: "700", color: colors.ink },
  required: { fontSize: 10, fontWeight: "700", letterSpacing: 1, color: colors.amber },
  optional: { fontSize: 10, fontWeight: "700", letterSpacing: 1, color: colors.mutedLight },
  hint: { fontSize: 12, lineHeight: 17, color: colors.mutedLight },
  nudge: { fontSize: 12, lineHeight: 17, fontWeight: "700", color: colors.amber },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  thumbWrap: { position: "relative" },
  remove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
  add: {
    minHeight: touchTarget,
    minWidth: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.blue,
    backgroundColor: colors.blueBg,
    paddingHorizontal: 10,
  },
  addLabel: { fontSize: 11, fontWeight: "700", color: colors.blue },
  capNote: { fontSize: 11, color: colors.mutedLight },
  pressed: { opacity: 0.7 },
});

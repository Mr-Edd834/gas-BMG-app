import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { describeError } from "../lib/errors";
import { colors } from "../theme/colors";
import { cardRadius, touchTarget } from "../theme/layout";

// One error, two readings (see src/lib/errors.ts).
//
// The plain sentence is always visible. The original text — class names, SQL,
// stack — sits behind "Technical details", closed by default. That is not
// merely tidier:
//
//   - She can read what happened and what to do, at a counter, quickly.
//   - The app stops volunteering how it is built to anyone holding the phone.
//   - The detail is still THERE. This APK is sideloaded with no crash
//     reporting, so that text is the only evidence a fault ever leaves behind,
//     and throwing it away to look polished would make every future bug harder
//     to find than it needs to be.
//
// Hidden, not deleted, is the whole idea.
export function ErrorNote({
  title,
  error,
  tone = "amber",
}: {
  title: string;
  error: unknown;
  tone?: "amber" | "plain";
}) {
  const [open, setOpen] = useState(false);
  const { friendly, technical } = describeError(error);

  return (
    <View style={[styles.wrap, tone === "amber" && styles.amber]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.friendly}>{friendly}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          open ? "Hide technical details" : "Show technical details"
        }
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <Text style={styles.toggleLabel}>
          {open ? "Hide technical details" : "Technical details"}
        </Text>
      </Pressable>

      {open && (
        <ScrollView
          style={styles.detailBox}
          contentContainerStyle={styles.detailContent}
          nestedScrollEnabled
        >
          {/* Selectable so it can be copied and sent on, which is the only
              reason it is kept at all. */}
          <Text selectable style={styles.detailText}>
            {technical}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: cardRadius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 14,
    gap: 6,
  },
  amber: { backgroundColor: colors.amberBg, borderColor: colors.amber },
  title: { fontSize: 15, fontWeight: "700", color: colors.amber },
  friendly: { fontSize: 13, lineHeight: 19, color: colors.ink },
  toggle: {
    minHeight: touchTarget - 12,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textDecorationLine: "underline",
  },
  detailBox: {
    maxHeight: 180,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  detailContent: { padding: 10 },
  detailText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.mutedLight,
  },
  pressed: { opacity: 0.6 },
});

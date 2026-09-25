import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { cardRadius, touchTarget } from "../theme/layout";

// The app's own "are you sure?".
//
// `Alert.alert` was the obvious thing and it looks like the operating system,
// not like this app — different typeface, different spacing, a blue nobody
// chose. That matters more than vanity here: the moments this appears are the
// consequential ones, and a dialog that looks like it came from somewhere else
// reads as a system warning to be dismissed rather than a question from the
// book she is keeping.
//
// Deliberately rare. Routine work takes zero confirmation taps (spec Part C
// §1), because a prompt on every save is a prompt nobody reads by the end of
// the first week — including the one that mattered.
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = "Go back",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  // "danger" for anything that cancels or replaces a record; "normal" for a
  // question that simply wants a moment's thought.
  tone?: "danger" | "normal";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const accent = tone === "danger" ? colors.overpaid : colors.blue;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's back gesture must cancel, never confirm.
      onRequestClose={onCancel}
    >
      {/* Tapping the dim area backs out — the safe direction. */}
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel="Close without saving"
        onPress={onCancel}
      >
        {/* Swallows taps so a press inside the card never dismisses it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={[styles.accent, { backgroundColor: accent }]} />

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                styles.cancel,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: accent },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.confirmLabel}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(22, 35, 31, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.paper,
    borderRadius: cardRadius + 4,
    padding: 20,
    gap: 10,
    overflow: "hidden",
  },
  // A short colour bar rather than an icon: it carries the tone without
  // borrowing a warning triangle from the operating system.
  accent: { height: 4, width: 44, borderRadius: 2, marginBottom: 2 },
  title: { fontSize: 19, fontWeight: "800", color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.muted },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  button: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  cancel: {
    backgroundColor: colors.neutral,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cancelLabel: { fontSize: 15, fontWeight: "700", color: colors.ink },
  confirmLabel: { fontSize: 15, fontWeight: "700", color: colors.white },
  pressed: { opacity: 0.85 },
});

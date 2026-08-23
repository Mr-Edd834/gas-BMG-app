import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";

// Chrome shared by all three commodity pickers. They open INLINE on the build
// screen (spec Part C §1 §5) — never as a separate page — so the whole basket
// is built in one view with no navigating back and forth.
export function PickerShell({
  children,
  isEditing,
  canCommit,
  priceMissing,
  onCancel,
  onCommit,
}: {
  children: ReactNode;
  isEditing: boolean;
  canCommit: boolean;
  priceMissing: boolean;
  onCancel: () => void;
  onCommit: () => void;
}) {
  return (
    <View style={styles.shell}>
      {children}

      {/* Price-required validation (spec §5, RULE). The button is disabled
          rather than the save being silently rejected, and this line says
          why — so it is impossible to log a sale at a silent zero price.
          Airtime never reaches here: it is auto-priced and exempt. */}
      {priceMissing && (
        <Text style={styles.helper}>
          Add a price for each item before continuing.
        </Text>
      )}

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
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCommit }}
          disabled={!canCommit}
          onPress={onCommit}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: canCommit ? colors.green : colors.mutedLight,
            },
            pressed && canCommit && styles.pressed,
          ]}
        >
          <Text style={styles.commitLabel}>
            {isEditing ? "Save changes" : "Add to sale"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "#F6F8F4",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  helper: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.amber,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: cardRadius,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancel: {
    backgroundColor: "#F1F2EE",
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: {
    opacity: 0.85,
  },
  cancelLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  commitLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.white,
  },
});

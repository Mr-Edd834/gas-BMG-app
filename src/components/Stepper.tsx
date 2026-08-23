import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { stepperCircle, touchTarget } from "../theme/layout";

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  // Screen-reader label, e.g. "Big cylinders" — the +/- circles are visual.
  label?: string;
}

// `[ − ] value [ + ]` — spec Part C §1 §1 (Shared components). Minus is a
// neutral circle, plus is blue. Used everywhere a quantity is set.
//
// The circles are 32px as specced but sit inside a 44px hit area (Pressable
// hitSlop), so the interaction rule "touch targets ≥ 44×44px" holds without
// making the control visually heavier than the design.
export function Stepper({ value, onChange, min = 0, max, label }: Props) {
  const canDecrement = value > min;
  const canIncrement = max === undefined || value < max;
  const slop = (touchTarget - stepperCircle) / 2;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `Decrease ${label}` : "Decrease"}
        hitSlop={slop}
        disabled={!canDecrement}
        onPress={() => onChange(value - 1)}
        style={({ pressed }) => [
          styles.circle,
          styles.minus,
          !canDecrement && styles.disabled,
          pressed && canDecrement && styles.pressed,
        ]}
      >
        <Text style={[styles.minusGlyph, !canDecrement && styles.disabledGlyph]}>
          −
        </Text>
      </Pressable>

      <Text style={styles.value} accessibilityLabel={label}>
        {value}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `Increase ${label}` : "Increase"}
        hitSlop={slop}
        disabled={!canIncrement}
        onPress={() => onChange(value + 1)}
        style={({ pressed }) => [
          styles.circle,
          styles.plus,
          !canIncrement && styles.disabled,
          pressed && canIncrement && styles.pressed,
        ]}
      >
        <Text style={[styles.plusGlyph, !canIncrement && styles.disabledGlyph]}>
          +
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  circle: {
    width: stepperCircle,
    height: stepperCircle,
    borderRadius: stepperCircle / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  minus: {
    backgroundColor: colors.neutral,
    borderWidth: 1,
    borderColor: colors.line,
  },
  plus: {
    backgroundColor: colors.blue,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
  minusGlyph: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  plusGlyph: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.white,
  },
  disabledGlyph: {
    color: colors.mutedLight,
  },
  value: {
    minWidth: 22,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
});

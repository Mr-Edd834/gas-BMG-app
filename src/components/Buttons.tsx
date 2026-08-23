import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { colors } from "../theme/colors";
import { touchTarget } from "../theme/layout";

type Tone = "ink" | "blue" | "green" | "neutral";

const toneBackground: Record<Tone, string> = {
  ink: colors.ink,
  blue: colors.blue,
  green: colors.green,
  neutral: "#F1F2EE",
};

const toneText: Record<Tone, string> = {
  ink: colors.white,
  blue: colors.white,
  green: colors.white,
  neutral: colors.ink,
};

interface Props {
  label: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
}

// Full-width filled button. Every button in this app has a visible background
// fill and clears 44px, per the interaction rules (spec Part C §1 §1) — there
// are no bare-icon or text-in-whitespace tap targets.
//
// A disabled button keeps its shape and goes mutedLight rather than
// disappearing, so the reason for it being disabled (the amber helper line
// beside it) has something to explain.
export function PrimaryButton({
  label,
  onPress,
  tone = "blue",
  disabled = false,
  style,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? colors.mutedLight : toneBackground[tone] },
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, { color: toneText[tone] }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
  },
});

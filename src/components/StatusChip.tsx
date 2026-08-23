import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

// Small rounded pill — amber for owed, green for paid (spec Part C §1 §1).
// Amber is the warning colour app-wide; there is deliberately no alarm-red
// variant, because owing money is normal in a credit notebook, not an error.
export function StatusChip({
  tone,
  label,
}: {
  tone: "amber" | "green" | "blue";
  label: string;
}) {
  return (
    <View style={[styles.chip, styles[`${tone}Bg`]]}>
      <Text style={[styles.text, styles[`${tone}Text`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
  amberBg: { backgroundColor: colors.amberBg },
  greenBg: { backgroundColor: colors.greenBg },
  blueBg: { backgroundColor: colors.blueBg },
  amberText: { color: colors.amber },
  greenText: { color: colors.green },
  blueText: { color: colors.blue },
});

import { StyleSheet, TextInput } from "react-native";
import { colors } from "../theme/colors";

// The price box she types into. Cylinders, burners and cookers all use it —
// prices vary and there is no preset (spec Part C §1 §5). Airtime deliberately
// has NO price box: it is auto-priced at 95% of face value.
export function PriceInput({
  value,
  onChangeText,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (next: string) => void;
  accessibilityLabel: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      // Kenyan prices are whole shillings; a numeric pad is faster at a
      // counter than the full keyboard.
      keyboardType="numeric"
      inputMode="numeric"
      placeholder="0"
      placeholderTextColor={colors.mutedLight}
      accessibilityLabel={accessibilityLabel}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    width: 104,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: "right",
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    backgroundColor: colors.white,
  },
});

import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "../theme/colors";
import { cardBorderWidth, cardPadding, cardRadius } from "../theme/layout";

// White surface, 1px line border, 12–16px radius, 12–20px padding
// (spec Part C §1 §1, Shared components).
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: cardBorderWidth,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: cardPadding,
  },
});

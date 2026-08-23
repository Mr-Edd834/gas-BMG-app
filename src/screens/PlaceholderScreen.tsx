import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

// Stand-in for the five sections that are not built yet. Deliberately shows
// nothing but its own name and where it sits in the build order — a fake
// dashboard here would be placeholder data (G7) and would make the app look
// finished when it is not.
export function PlaceholderScreen({
  title,
  buildOrder,
  summary,
}: {
  title: string;
  buildOrder: number;
  summary: string;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.summary}>{summary}</Text>
        <Text style={styles.note}>Section {buildOrder} of 6 — not built yet.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  summary: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  note: {
    fontSize: 12,
    color: colors.mutedLight,
    marginTop: 8,
  },
});

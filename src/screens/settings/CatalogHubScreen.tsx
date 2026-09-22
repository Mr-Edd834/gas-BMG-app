import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/ScreenHeader";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// The catalog hub (spec Part C §6 §2) — six editable lists.
//
// This is the reuse engine of the whole project. Nothing in the app hardcodes
// a brand: the pickers read these lists at runtime, so onboarding a second
// shop is changing this catalog rather than changing code. That is why the
// lists are data in a table and not a constant in a source file.
//
// What it deliberately does NOT do is add new commodity TYPES. Cylinders,
// airtime, burners and cookers each have their own picker shape and their own
// pricing rules — airtime is auto-priced, cylinders carry empties — so a new
// type is a code change, not a settings change. Pretending otherwise with a
// generic "add category" button would produce a type the rest of the app
// cannot actually handle.
const LISTS: {
  kind: string;
  title: string;
  sub: string;
  note?: string;
}[] = [
  {
    kind: "cylinder_brand",
    title: "Cylinder brands",
    sub: "K-Gas, Total Gas, Afrigas…",
  },
  {
    kind: "cylinder_size",
    title: "Cylinder sizes",
    sub: "Small, Big",
    note: "Sizes appear against every cylinder brand. Changing them affects how stock is counted, so change them rarely.",
  },
  {
    kind: "airtime_supplier",
    title: "Airtime suppliers",
    sub: "Safaricom, Airtel",
  },
  {
    kind: "airtime_denomination",
    title: "Airtime denominations",
    sub: "Face value in KSh",
    note: "Airtime is always priced at 95% of face value, worked out automatically. There is no price box for airtime anywhere in the app.",
  },
  { kind: "burner_brand", title: "Burner brands", sub: "Skytec, PineGas…" },
  {
    kind: "cooker_option",
    title: "Cooker types",
    sub: "Mini-cylinder grill, Double burner stove",
  },
];

export function CatalogHubScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Catalog"
        subtitle="What appears when you add a sale"
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        <Text style={styles.lead}>
          These are the options your staff pick from. Removing one hides it from
          future sales — past sales are never changed.
        </Text>

        <View style={styles.card}>
          {LISTS.map((list, index) => (
            <Pressable
              key={list.kind}
              accessibilityRole="button"
              accessibilityLabel={`${list.title}. ${list.sub}`}
              onPress={() =>
                navigation.navigate("CatalogList", {
                  kind: list.kind,
                  title: list.title,
                  note: list.note,
                })
              }
              style={({ pressed }) => [
                styles.row,
                index < LISTS.length - 1 && styles.rowDivider,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{list.title}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {list.sub}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  lead: { fontSize: 13, lineHeight: 19, color: colors.muted },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: touchTarget + 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  rowSub: { fontSize: 12, color: colors.mutedLight },
  pressed: { opacity: 0.6 },
});

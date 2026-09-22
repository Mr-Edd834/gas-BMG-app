import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useReadyApp } from "../../context/AppContext";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type IconName = keyof typeof Ionicons.glyphMap;

// SETTINGS (spec Part C §6) — three blocks: the shop, the app, this device.
//
// Deliberately lean, and the exclusions are as deliberate as the contents.
// There is no login or password (there is none in this app at all), no
// business profile or theming (scope creep — a notebook does not need a logo),
// and no sync on/off switch. That last one is the interesting omission: sync
// is automatic and invisible by design, and a switch to turn it off is a
// switch to silently stop backing up a business, discovered only when a phone
// is lost. Do not add these.
export function SettingsScreen() {
  const { staff } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        <Text style={styles.title}>Settings</Text>

        <Block label="Your shop">
          <Row
            icon="list"
            title="Catalog"
            sub="What appears in the add-sale screens"
            onPress={() => navigation.navigate("CatalogHub")}
          />
          <Row
            icon="cube"
            title="Opening stock count"
            sub="What is on the shelf and in the yard right now"
            onPress={() => navigation.navigate("OpeningStock")}
          />
          <Row
            icon="pricetag"
            title="Refilling company codes"
            sub="What the letters on a batch number mean"
            onPress={() => navigation.navigate("CompanyCodes")}
            last
          />
        </Block>

        <Block label="App">
          <Row
            icon="notifications"
            title="Reminders"
            sub="Whether they arrive, and at what time"
            onPress={() => navigation.navigate("Reminders")}
          />
          <Row
            icon="cloud-upload"
            title="Backup & storage"
            sub="Where your records are kept"
            onPress={() => navigation.navigate("Storage")}
            last
          />
        </Block>

        <Block label="This device">
          {/* Informational only. There is deliberately no switch-user:
              phones are personal, and every record already logs itself to
              whoever this phone is (G6). */}
          <View style={styles.deviceRow}>
            <Ionicons name="person" size={18} color={colors.muted} />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>This phone: {staff.name}</Text>
              <Text style={styles.rowSub}>
                Everything recorded on this phone is logged as {staff.name}.
              </Text>
            </View>
          </View>
        </Block>

        <Text style={styles.version}>
          BMG Shop {Constants.expoConfig?.version ?? ""}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockLabel}>{label}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  title,
  sub,
  onPress,
  last = false,
}: {
  icon: IconName;
  title: string;
  sub: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivider,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.blue} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 20, paddingTop: 12, gap: 16 },
  title: { fontSize: 26, fontWeight: "700", color: colors.ink },
  block: { gap: 8 },
  blockLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.muted,
    textTransform: "uppercase",
  },
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
    minHeight: touchTarget + 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  rowSub: { fontSize: 12, lineHeight: 17, color: colors.mutedLight },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  version: {
    fontSize: 12,
    color: colors.mutedLight,
    textAlign: "center",
    marginTop: 4,
  },
  pressed: { opacity: 0.6 },
});

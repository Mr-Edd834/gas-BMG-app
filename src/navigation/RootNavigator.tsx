import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../components/Buttons";
import { useApp } from "../context/AppContext";
import { AddSaleScreen } from "../screens/AddSaleScreen";
import { CustomerHistoryScreen } from "../screens/CustomerHistoryScreen";
import { DebtsScreen } from "../screens/debts/DebtsScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { PaymentScreen } from "../screens/PaymentScreen";
import { SalesRecordScreen } from "../screens/salesRecord/SalesRecordScreen";
import { StaffPickerScreen } from "../screens/StaffPickerScreen";
import {
  RefillingScreen,
  ReportsScreen,
  SettingsScreen,
} from "../screens/placeholders";
import { colors } from "../theme/colors";
import type { RootStackParamList, TabParamList } from "./types";

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

type IconName = keyof typeof Ionicons.glyphMap;

// FLAT bottom nav: all six sections are directly tappable. The spec's open
// question about a "More" overflow (CLAUDE.md open items) is settled the other
// way here — six one-tap destinations, no overflow menu, because burying two
// sections behind an extra tap is exactly the friction this app exists to
// remove. Labels are abbreviated to fit six across; the accessibility label
// keeps each section's full name.
const TABS: {
  name: keyof TabParamList;
  label: string;
  fullName: string;
  icon: IconName;
}[] = [
  { name: "Home", label: "Home", fullName: "Home", icon: "home" },
  { name: "Debts", label: "Debts", fullName: "Debts", icon: "wallet" },
  {
    name: "SalesRecord",
    label: "Sales",
    fullName: "Sales Record",
    icon: "receipt",
  },
  {
    name: "Refilling",
    label: "Refill",
    fullName: "Refilling",
    icon: "swap-horizontal",
  },
  { name: "Reports", label: "Reports", fullName: "Reports", icon: "bar-chart" },
  { name: "Settings", label: "Settings", fullName: "Settings", icon: "cog" },
];

const TAB_SCREENS: Record<keyof TabParamList, React.ComponentType<object>> = {
  Home: HomeScreen,
  Debts: DebtsScreen,
  SalesRecord: SalesRecordScreen,
  Refilling: RefillingScreen,
  Reports: ReportsScreen,
  Settings: SettingsScreen,
};

// The bar's own content height, before any system UI is accounted for.
const TAB_BAR_CONTENT_HEIGHT = 62;
const TAB_BAR_BOTTOM_PADDING = 6;

function Tabs() {
  // Android draws the system navigation on top of the app window. With gesture
  // navigation that strip is a few px; with 3-button navigation it is ~48dp of
  // Back/Home/Recents sitting exactly where our tab icons are. A fixed bar
  // height therefore collides with the system buttons on precisely the phones
  // most of this shop's users have.
  //
  // useSafeAreaInsets reports how much of each edge the OS has claimed, so the
  // bar grows by that much and its contents sit above the system buttons. The
  // value is read at runtime, not hardcoded, because it differs per device and
  // changes if the user switches navigation style.
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: [
          styles.tabBar,
          {
            height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
            paddingBottom: TAB_BAR_BOTTOM_PADDING + insets.bottom,
          },
        ],
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        sceneStyle: styles.scene,
      }}
    >
      {TABS.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={TAB_SCREENS[tab.name]}
          options={{
            tabBarLabel: tab.label,
            tabBarAccessibilityLabel: tab.fullName,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={tab.icon} color={color} size={size} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.boot}>
      <Text style={styles.bootTitle}>The app could not open its records</Text>
      {/* Local storage failing is a genuine fault worth showing, unlike being
          offline, which is this app's normal state and never an error (G8). */}
      <Text style={styles.bootBody}>{message}</Text>
      <PrimaryButton label="Try again" tone="ink" onPress={onRetry} />
    </View>
  );
}

export function RootNavigator() {
  const { status, error, retry } = useApp();

  if (status === "loading") {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  if (status === "error") {
    return <BootError message={error ?? "Unknown problem."} onRetry={retry} />;
  }

  // One name, once per phone — then never again.
  if (status === "needs-identity") {
    return <StaffPickerScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        {/* The add-sale flow sits ABOVE the tabs rather than inside Home, so
            the bottom nav can't pull her out of a half-built sale. */}
        <Stack.Screen name="AddSale" component={AddSaleScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="CustomerHistory" component={CustomerHistoryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.white,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    // height and paddingBottom are applied in Tabs(), where the device's
    // bottom safe-area inset is known. Do not put a fixed height back here.
    paddingTop: 6,
  },
  tabItem: {
    paddingHorizontal: 0,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  scene: {
    backgroundColor: colors.paper,
  },
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    padding: 32,
    gap: 12,
  },
  bootTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  bootBody: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
});

import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { ensureSeeded } from "./src/db/seed";
import { colors } from "./src/theme/colors";

// Scaffold entry point: boots the local SQLite DB + real seed catalog offline
// (spec Part B §3, §9) and confirms it worked. No section screens/navigation
// are wired yet — those are built one section at a time per CLAUDE.md
// "Build order", starting with Home/Sales.
export default function App() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureSeeded()
      .then(() => setStatus("ready"))
      .catch((err) => {
        console.error("[App] seed failed", err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>BMG Shop App</Text>
      <Text style={styles.body}>
        {status === "loading" && "Setting up local database…"}
        {status === "ready" &&
          "Local DB ready + seed catalog loaded. Screens not built yet."}
        {status === "error" && `DB setup failed: ${error}`}
      </Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  body: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
});

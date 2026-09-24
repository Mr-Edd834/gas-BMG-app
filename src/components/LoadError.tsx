import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "./Buttons";
import { ErrorNote } from "./ErrorNote";
import { colors } from "../theme/colors";

// Shown when a screen could not READ its data.
//
// Why this component exists at all: "there is nothing" and "I could not find
// out" are different facts, and a screen that renders a failed load as an
// empty list tells the shopkeeper her customers are gone. Empty is a
// plausible real answer here — a new tab genuinely has no sales — so she has
// no way to tell she is being misinformed. Every read path therefore needs a
// state that is visibly NOT the empty state.
//
// This is deliberately NOT used for being offline. Offline is this app's
// normal condition and never an error (G8); local reads succeed with no
// signal. Reaching this component means local storage itself failed, which is
// a genuine fault worth interrupting for.
//
// The wording is hers, and the library's own message is folded away behind
// "Technical details" inside ErrorNote — present for whoever fixes it, absent
// from the screen she is standing in front of.
export function LoadError({
  what,
  detail,
  onRetry,
}: {
  // What could not be loaded, in her words: "your customer tabs".
  what: string;
  detail?: unknown;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <ErrorNote title={`Could not open ${what}`} error={detail} />

      <Text style={styles.reassure}>
        This is a problem reading the records on this phone — not a problem
        with the records themselves.
      </Text>

      {onRetry ? (
        <View style={styles.action}>
          <PrimaryButton label="Try again" tone="ink" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24, gap: 10 },
  reassure: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    paddingHorizontal: 2,
  },
  action: { marginTop: 2 },
});

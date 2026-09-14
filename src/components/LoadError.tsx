import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "./Buttons";
import { colors } from "../theme/colors";
import { cardRadius } from "../theme/layout";

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
export function LoadError({
  what,
  detail,
  onRetry,
}: {
  // What could not be loaded, in her words: "your customer tabs".
  what: string;
  // The underlying message. Shown rather than hidden because this app is
  // sideloaded with no crash reporting — if it breaks at the counter, this
  // line is the only evidence anyone will ever have.
  detail?: string | null;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Could not open {what}</Text>
      <Text style={styles.body}>
        Nothing is lost — this is a problem reading the records on this phone,
        not a problem with the records themselves.
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {onRetry ? (
        <View style={styles.action}>
          <PrimaryButton label="Try again" tone="ink" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.amberBg,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: cardRadius,
    padding: 16,
    marginTop: 24,
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.amber,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  detail: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.mutedLight,
  },
  action: {
    marginTop: 6,
  },
});

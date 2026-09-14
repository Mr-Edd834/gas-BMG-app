import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

// A receipt thumbnail that opens full-screen when tapped, and closes when
// tapped again.
//
// Why it matters beyond convenience: the receipt is evidence. A 48px square is
// enough to show that a photo EXISTS, but not to read what is written on it —
// and the moment anyone actually needs a receipt is the moment they are
// disagreeing about a sale. Being able to hold the phone up and show a legible
// receipt is the whole point of having taken it.
//
// The backdrop is dimmed rather than blurred: blur needs expo-blur, a native
// module, which would invalidate the current development build and force a
// fresh rebuild. Dim costs nothing and reads the same at this size.
export function PhotoViewer({
  uri,
  size = 48,
  // Overrides the square thumbnail — the per-customer history keeps its larger
  // full-width preview, the record list uses a small square beside the note.
  thumbStyle,
  accessibilityLabel = "Receipt photo",
}: {
  uri: string;
  size?: number;
  thumbStyle?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`${accessibilityLabel}. Tap to enlarge.`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          thumbStyle ? styles.blockWrap : null,
          pressed && styles.pressed,
        ]}
      >
        <Image
          source={{ uri }}
          style={thumbStyle ?? [styles.thumb, { width: size, height: size }]}
          resizeMode={thumbStyle ? "cover" : undefined}
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        // Lets the photo fill the screen edge to edge on Android rather than
        // being letterboxed by the system bars.
        statusBarTranslucent
      >
        {/* The whole backdrop is the dismiss target, not a small ✕ — she is
            likely holding the phone out to a customer, and any tap returning
            to the record is more forgiving than hunting for a close button. */}
        <Pressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          onPress={() => setOpen(false)}
        >
          <Image
            source={{ uri }}
            style={styles.full}
            resizeMode="contain"
            accessibilityLabel={accessibilityLabel}
          />
          <Text style={[styles.hint, { bottom: 24 + insets.bottom }]}>
            Tap anywhere to close
          </Text>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: {
    borderRadius: 8,
    backgroundColor: colors.neutral,
  },
  blockWrap: {
    width: "100%",
  },
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 16, 14, 0.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  full: {
    width: "100%",
    height: "100%",
  },
  hint: {
    position: "absolute",
    alignSelf: "center",
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
  },
});

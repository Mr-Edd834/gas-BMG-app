import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * How much of the screen the on-screen keyboard is currently covering.
 *
 * `KeyboardAvoidingView` is the obvious tool and it does not work here. On
 * Android it needs a `behavior`, and the common pattern of passing one only on
 * iOS leaves it doing nothing at all — which is exactly what happened: the
 * "Add" button on a pinned bottom bar sat underneath the keyboard, invisible
 * and untappable, so the only way to add a catalog entry was the keyboard's
 * own return key.
 *
 * That pattern used to be harmless because Android resized the app window when
 * the keyboard appeared. Under edge-to-edge — the default from React Native
 * 0.86 — the window no longer resizes that way, so a bar pinned to the bottom
 * stays pinned to the bottom, behind the keyboard.
 *
 * Measuring it in JavaScript sidesteps all of that. `Keyboard` is part of
 * React Native itself, so there is no native module and no new build: this
 * fix reaches the phone over Metro like any other code change.
 *
 * iOS listens to `will*` so the movement runs with the keyboard's animation;
 * Android only reliably reports `did*`.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (event) => {
      setInset(event.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}

/**
 * Padding for a bar pinned to the bottom of the screen.
 *
 * The keyboard's reported height is measured from the bottom of the screen and
 * so already covers the system navigation area. Adding the safe-area inset on
 * top of it would lift the bar too far and leave a gap, so the inset applies
 * only while the keyboard is down.
 */
export function bottomBarPadding(
  keyboardInset: number,
  safeAreaBottom: number,
  base = 12
): { paddingBottom: number; marginBottom: number } {
  return {
    paddingBottom: keyboardInset > 0 ? base : base + safeAreaBottom,
    marginBottom: keyboardInset,
  };
}

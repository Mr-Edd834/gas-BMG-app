// Visual language tokens — see docs/BMG-MASTER-BUILD-SPEC.md, Part C §1 "Home/Sales" §1.
// Muted tones are deliberately darkened for outdoor/shop-counter legibility.
// Do not lighten them back.
export const colors = {
  paper: "#EEF0EC",
  ink: "#16231F",
  blue: "#2B6CB5",
  amber: "#C2540B",
  green: "#2F7A4D",
  line: "#C9CDC3",
  muted: "#586159",
  mutedLight: "#525B53",
  white: "#FFFFFF",
  amberBg: "#FCEFE6",
  greenBg: "#EAF5EE",
} as const;

export type ColorToken = keyof typeof colors;

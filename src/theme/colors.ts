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
  blueBg: "#E6EEF8",

  // Neutral fill for secondary controls: the stepper's minus circle (this
  // exact value is named in the spec), the 44px back button, Cancel buttons,
  // and pressed states. Its job is to give every tap target a visible
  // background, since a bare icon in whitespace is not allowed.
  neutral: "#F1F2EE",

  // Slightly-tinted surface that sits ON a white card without reading as a
  // second card: the inline commodity pickers and the saved-note block.
  surfaceSoft: "#F6F8F4",

  // The ONE red-ish state in the app, used only for an over-payment on the
  // payment step — that is an arithmetic mistake to correct, not an
  // outstanding balance. Money owed is always amber, never alarm-red.
  overpaid: "#B4232A",
  overpaidBg: "#FDECEC",
} as const;

export type ColorToken = keyof typeof colors;

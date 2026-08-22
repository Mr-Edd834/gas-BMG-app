// Typography — OPEN decision, not locked (see spec Part A §6 / CLAUDE.md open items).
// Web mockups used Space Grotesk (display) / IBM Plex Sans (body); RN build uses the
// platform default sans until/unless custom fonts are wired in and confirmed with Edd.
// Until then, weight + size carry the hierarchy — do not silently add custom fonts.
export const fontFamily = {
  display: undefined, // platform default
  body: undefined, // platform default
} as const;

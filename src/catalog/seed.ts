// The REAL seed catalog — the only real client data (spec Part A §3, Part B §9).
// Ships pre-loaded on first launch; editable later in Settings (Part C §6).
// Do NOT add anything here beyond what the client actually gave us — no invented
// brands/suppliers/options, no placeholder demo values (see global rule G7).

export type CatalogKind =
  | "cylinder_brand"
  | "cylinder_size"
  | "airtime_supplier"
  | "airtime_denomination"
  | "burner_brand"
  | "cooker_option";

export interface SeedCatalogItem {
  kind: CatalogKind;
  value: string;
}

export const CYLINDER_BRANDS = [
  "K-Gas",
  "Total Gas",
  "Afrigas",
  "Pro Gas",
  "Sea Gas",
  "Rubis",
  "Kobil",
  "National Oil",
  "G-Gas",
  "Gold Gas",
  "Others",
] as const;

export const CYLINDER_SIZES = ["Small", "Big"] as const;

export const AIRTIME_SUPPLIERS = ["Safaricom", "Airtel"] as const;

// Face value in KSh. Actual sale price is always 95% of face value (see AIRTIME_RATE).
export const AIRTIME_DENOMINATIONS = [10, 20, 50, 100] as const;

// Fixed for now — deferred open item: whether this becomes Settings-editable
// (spec Part C §1 §5, Part C §6 §9). Store it here, not as a buried magic
// number, so Settings can reach it later without a schema change.
export const AIRTIME_RATE = 0.95;

export const BURNER_BRANDS = ["Skytec", "PineGas", "Orgaz", "Cosco"] as const;

export const COOKER_OPTIONS = [
  "Mini-cylinder grill",
  "Double burner stove",
] as const;

export const SEED_CATALOG_ITEMS: SeedCatalogItem[] = [
  ...CYLINDER_BRANDS.map((value) => ({ kind: "cylinder_brand" as const, value })),
  ...CYLINDER_SIZES.map((value) => ({ kind: "cylinder_size" as const, value })),
  ...AIRTIME_SUPPLIERS.map((value) => ({ kind: "airtime_supplier" as const, value })),
  ...AIRTIME_DENOMINATIONS.map((value) => ({
    kind: "airtime_denomination" as const,
    value: String(value),
  })),
  ...BURNER_BRANDS.map((value) => ({ kind: "burner_brand" as const, value })),
  ...COOKER_OPTIONS.map((value) => ({ kind: "cooker_option" as const, value })),
];

// Computes the auto-priced airtime total. Verified against client examples in
// spec Part C §1 §5 (AIRTIME picker): full pack of 10s = KSh 95, 5x20 = 95,
// 2x50 = 95, full pack of 20s = 190, full pack of 50s = 475.
export function computeAirtimePrice(
  denominationFaceValue: number,
  packs: number,
  singles: number
): number {
  const cards = packs * 10 + singles;
  return Math.round(cards * denominationFaceValue * AIRTIME_RATE);
}

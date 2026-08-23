import { getDb } from "../client";
import { AIRTIME_RATE } from "../../catalog/seed";

// The catalog is READ from the DB, never from the seed constants directly —
// the seed only pre-loads first launch, after which Settings can edit it
// (spec Part C §1 §0, Part C §6). Reading the table is what makes those edits
// show up here later without touching this section.

export interface Catalog {
  cylinderBrands: string[];
  cylinderSizes: string[];
  airtimeSuppliers: string[];
  airtimeDenominations: number[];
  burnerBrands: string[];
  cookerOptions: string[];
  // Fixed rule for now; sourced from one place so a future Settings toggle
  // (spec Part C §1 §5, OPEN item) has somewhere to write.
  airtimeRate: number;
}

async function valuesOfKind(
  businessId: string,
  kind: string
): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ value: string }>(
    `SELECT value FROM catalog_items
     WHERE business_id = ? AND kind = ? AND active = 1
     ORDER BY created_at ASC`,
    businessId,
    kind
  );
  return rows.map((r) => r.value);
}

export async function loadCatalog(businessId: string): Promise<Catalog> {
  const [
    cylinderBrands,
    cylinderSizes,
    airtimeSuppliers,
    airtimeDenominations,
    burnerBrands,
    cookerOptions,
  ] = await Promise.all([
    valuesOfKind(businessId, "cylinder_brand"),
    valuesOfKind(businessId, "cylinder_size"),
    valuesOfKind(businessId, "airtime_supplier"),
    valuesOfKind(businessId, "airtime_denomination"),
    valuesOfKind(businessId, "burner_brand"),
    valuesOfKind(businessId, "cooker_option"),
  ]);

  return {
    cylinderBrands,
    cylinderSizes,
    airtimeSuppliers,
    airtimeDenominations: airtimeDenominations
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n)),
    burnerBrands,
    cookerOptions,
    airtimeRate: AIRTIME_RATE,
  };
}

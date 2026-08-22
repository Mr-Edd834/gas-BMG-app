// TypeScript shapes matching src/db/schema.ts. Kept in sync manually — there's
// no ORM here (expo-sqlite is used directly), so if you add/change a column
// in schema.ts, update the matching interface here in the same change.

export interface Business {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  synced: 0 | 1;
}

export interface Staff {
  id: string;
  business_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  synced: 0 | 1;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  is_quick_sale: 0 | 1;
  created_at: string;
  updated_at: string;
  synced: 0 | 1;
}

export interface Sale {
  id: string;
  business_id: string;
  customer_id: string;
  staff_id: string;
  cash_amount: number;
  credit_amount: number;
  note: string | null;
  receipt_photo_local_path: string | null;
  receipt_photo_cloud_url: string | null;
  sold_at: string;
  created_at: string;
  updated_at: string;
  synced: 0 | 1;
}

export type CommodityType = "cylinder" | "airtime" | "burner" | "cooker";

export interface SaleItem {
  id: string;
  business_id: string;
  sale_id: string;
  commodity_type: CommodityType;
  label: string;
  brand_or_supplier: string | null;
  size_or_denomination: string | null;
  qty: number;
  unit_price: number;
  is_auto_priced: 0 | 1;
  empties_returned: number | null;
  created_at: string;
  updated_at: string;
  synced: 0 | 1;
}

export interface CatalogItem {
  id: string;
  business_id: string;
  kind: string;
  value: string;
  active: 0 | 1;
  created_at: string;
  updated_at: string;
  synced: 0 | 1;
}

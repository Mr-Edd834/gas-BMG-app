import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PriceInput } from "../../components/PriceInput";
import { SearchField } from "../../components/SearchField";
import { Stepper } from "../../components/Stepper";
import { LOW_STOCK_THRESHOLD } from "../../config/tunables";
import type { Catalog } from "../../db/queries/catalog";
import { stockKey } from "../../db/queries/stock";
import {
  buildCylinderLines,
  emptyCylinderSize,
  parsePrice,
  type CylinderPickerState,
} from "../../sales/buildLines";
import type { CartLine } from "../../sales/types";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";
import { PickerShell } from "./PickerShell";

interface Props {
  catalog: Catalog;
  // Full stock per brand+size, summed from the ledger. Informational only.
  stock: Map<string, number>;
  recentBrands: string[];
  initial: CylinderPickerState | null;
  onCommit: (lines: CartLine[]) => void;
  onCancel: () => void;
}

// CYLINDER picker (spec Part C §1 §5).
//
// Searchable brand list with recently-used floated to the top; picking a brand
// reveals BOTH size rows at 0, and each size independently grows a price box
// and an empties stepper once its quantity goes above zero.
export function CylinderPicker({
  catalog,
  stock,
  recentBrands,
  initial,
  onCommit,
  onCancel,
}: Props) {
  const [brandSearch, setBrandSearch] = useState("");
  const [state, setState] = useState<CylinderPickerState>(
    initial ?? { brand: null, sizes: {} }
  );

  const sizes = catalog.cylinderSizes;

  // Recently-used brands float to the top; everything else keeps catalog order.
  const orderedBrands = useMemo(() => {
    const needle = brandSearch.trim().toLowerCase();
    const matching = catalog.cylinderBrands.filter((brand) =>
      brand.toLowerCase().includes(needle)
    );
    const recentRank = new Map(recentBrands.map((b, i) => [b, i]));
    return [...matching].sort((a, b) => {
      const aRank = recentRank.get(a);
      const bRank = recentRank.get(b);
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;
      return 0;
    });
  }, [catalog.cylinderBrands, recentBrands, brandSearch]);

  function rowFor(size: string) {
    return state.sizes[size] ?? emptyCylinderSize;
  }

  function setRowField<K extends keyof typeof emptyCylinderSize>(
    size: string,
    field: K,
    value: (typeof emptyCylinderSize)[K]
  ) {
    setState((prev) => {
      const current = prev.sizes[size] ?? emptyCylinderSize;
      const next = { ...current, [field]: value };
      // Empties handed back can never exceed what was bought, so lowering the
      // quantity pulls the return count down with it.
      if (field === "qty") {
        next.returned = Math.min(next.returned, next.qty);
      }
      return { ...prev, sizes: { ...prev.sizes, [size]: next } };
    });
  }

  // Captured once so the size rows below narrow cleanly instead of asserting.
  const selectedBrand = state.brand;

  const rowsWithQty = sizes.filter((size) => rowFor(size).qty > 0);
  const hasQty = rowsWithQty.length > 0;
  const priceMissing = rowsWithQty.some(
    (size) => parsePrice(rowFor(size).price) <= 0
  );

  return (
    <PickerShell
      isEditing={initial !== null}
      canCommit={hasQty && !priceMissing}
      priceMissing={priceMissing}
      onCancel={onCancel}
      onCommit={() => onCommit(buildCylinderLines(state, sizes))}
    >
      <SearchField
        value={brandSearch}
        onChangeText={setBrandSearch}
        placeholder="Search brand…"
        accessibilityLabel="Search cylinder brands"
      />

      <ScrollView style={styles.brandList} nestedScrollEnabled>
        {orderedBrands.map((brand) => {
          const selected = state.brand === brand;
          const isRecent = recentBrands.includes(brand);
          return (
            <Pressable
              key={brand}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setState((prev) => ({ ...prev, brand }))}
              style={[styles.brandRow, selected && styles.brandRowSelected]}
            >
              <Text
                style={[styles.brandName, selected && styles.brandNameSelected]}
              >
                {brand}
              </Text>
              {isRecent && (
                <Text
                  style={[
                    styles.recent,
                    selected && styles.brandNameSelected,
                  ]}
                >
                  recent
                </Text>
              )}
            </Pressable>
          );
        })}
        {orderedBrands.length === 0 && (
          <Text style={styles.noBrands}>No brand matches that search.</Text>
        )}
      </ScrollView>

      {/* Both sizes appear together, each starting at 0 — she bumps only the
          size(s) actually sold. */}
      {selectedBrand !== null &&
        sizes.map((size) => {
          const row = rowFor(size);
          const owed = row.qty - row.returned;
          const allBack = owed <= 0;
          const onHand = stock.get(stockKey(selectedBrand, size));
          const lowStock =
            onHand !== undefined && onHand <= LOW_STOCK_THRESHOLD;

          return (
            <View key={size} style={styles.sizeCard}>
              <View style={styles.sizeHeader}>
                <View style={styles.sizeTitle}>
                  <Text style={styles.sizeName}>{size}</Text>
                  {/* Calm, non-blocking low-stock note (spec §7b). It informs
                      and nothing more — she can always sell, including into a
                      negative count, which honestly means an opening count or
                      a refill was never recorded. */}
                  {onHand !== undefined && (
                    <Text style={lowStock ? styles.stockLow : styles.stockCalm}>
                      {lowStock
                        ? `Low stock · ${onHand} left`
                        : `${onHand} in stock`}
                    </Text>
                  )}
                </View>
                <Stepper
                  value={row.qty}
                  min={0}
                  label={`${size} cylinders`}
                  onChange={(next) => setRowField(size, "qty", next)}
                />
              </View>

              {row.qty > 0 && (
                <>
                  <View style={styles.priceRow}>
                    {/* She types it — cylinder prices vary, so no preset. */}
                    <Text style={styles.fieldLabel}>Price each (KSh)</Text>
                    <PriceInput
                      value={row.price}
                      onChangeText={(next) => setRowField(size, "price", next)}
                      accessibilityLabel={`Price for each ${size} cylinder`}
                    />
                  </View>

                  {/* Exact count per size, so a partial return (buy 3, hand
                      back 2) lives on this one card. Whatever stays out
                      becomes a cylinder debt in the Debts section. */}
                  <View
                    style={[
                      styles.emptiesRow,
                      allBack ? styles.emptiesAllBack : styles.emptiesOwed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.emptiesLabel,
                        { color: allBack ? colors.green : colors.amber },
                      ]}
                    >
                      Empties {allBack ? "(all back)" : `(${owed} owed)`}
                    </Text>
                    <Stepper
                      value={row.returned}
                      min={0}
                      max={row.qty}
                      label={`${size} empties returned`}
                      onChange={(next) => setRowField(size, "returned", next)}
                    />
                  </View>
                </>
              )}
            </View>
          );
        })}
    </PickerShell>
  );
}

const styles = StyleSheet.create({
  brandList: {
    maxHeight: 168,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: touchTarget,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  brandRowSelected: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  brandName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  brandNameSelected: {
    color: colors.white,
  },
  recent: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  noBrands: {
    fontSize: 13,
    color: colors.mutedLight,
    paddingVertical: 8,
  },
  sizeCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 12,
    gap: 10,
  },
  sizeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sizeTitle: {
    flexShrink: 1,
    gap: 2,
  },
  sizeName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  stockCalm: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  stockLow: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.amber,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  fieldLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  emptiesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  emptiesOwed: {
    backgroundColor: colors.amberBg,
  },
  emptiesAllBack: {
    backgroundColor: colors.greenBg,
  },
  emptiesLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
});

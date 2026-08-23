import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stepper } from "../../components/Stepper";
import { computeAirtimePrice } from "../../catalog/seed";
import type { Catalog } from "../../db/queries/catalog";
import {
  airtimeCards,
  buildAirtimeLines,
  emptyAirtimeDenom,
  type AirtimePickerState,
} from "../../sales/buildLines";
import type { CartLine } from "../../sales/types";
import { formatMoney } from "../../lib/formatMoney";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";
import { PickerShell } from "./PickerShell";

interface Props {
  catalog: Catalog;
  initial: AirtimePickerState | null;
  onCommit: (lines: CartLine[]) => void;
  onCancel: () => void;
}

// AIRTIME picker (spec Part C §1 §5).
//
// Two steppers per denomination — Packs and Singles, where 1 pack = 10 cards —
// and NO price box anywhere: the price is always 95% of total face value,
// computed live. That rule is the reason this picker is exempt from the
// price-required validation the other two enforce.
export function AirtimePicker({ catalog, initial, onCommit, onCancel }: Props) {
  const [state, setState] = useState<AirtimePickerState>(
    initial ?? { supplier: null, denoms: {} }
  );

  function rowFor(denom: number) {
    return state.denoms[String(denom)] ?? emptyAirtimeDenom;
  }

  function setRowField(
    denom: number,
    field: "packs" | "singles",
    value: number
  ) {
    setState((prev) => {
      const current = prev.denoms[String(denom)] ?? emptyAirtimeDenom;
      return {
        ...prev,
        denoms: {
          ...prev.denoms,
          [String(denom)]: { ...current, [field]: value },
        },
      };
    });
  }

  const hasQty = catalog.airtimeDenominations.some(
    (denom) => airtimeCards(rowFor(denom)) > 0
  );

  return (
    <PickerShell
      isEditing={initial !== null}
      canCommit={state.supplier !== null && hasQty}
      // Auto-priced, so a missing price is impossible here by construction.
      priceMissing={false}
      onCancel={onCancel}
      onCommit={() =>
        onCommit(buildAirtimeLines(state, catalog.airtimeDenominations))
      }
    >
      <View style={styles.supplierRow}>
        {catalog.airtimeSuppliers.map((supplier) => {
          const selected = state.supplier === supplier;
          return (
            <Pressable
              key={supplier}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setState((prev) => ({ ...prev, supplier }))}
              style={[styles.supplier, selected && styles.supplierSelected]}
            >
              <Text
                style={[
                  styles.supplierLabel,
                  selected && styles.supplierLabelSelected,
                ]}
              >
                {supplier}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {state.supplier !== null &&
        catalog.airtimeDenominations.map((denom) => {
          const row = rowFor(denom);
          const cards = airtimeCards(row);
          const active = cards > 0;
          const price = computeAirtimePrice(denom, row.packs, row.singles);

          return (
            <View
              key={denom}
              style={[styles.denomCard, active && styles.denomCardActive]}
            >
              <View style={styles.denomHeader}>
                <Text style={styles.denomName}>{formatMoney(denom)}</Text>
                {/* The computed price shows live once anything is set. */}
                {active && (
                  <Text style={styles.denomPrice}>{formatMoney(price)}</Text>
                )}
              </View>

              <View style={styles.stepperRow}>
                <Text style={styles.stepperLabel}>Packs</Text>
                <Stepper
                  value={row.packs}
                  min={0}
                  label={`packs of ${denom} airtime`}
                  onChange={(next) => setRowField(denom, "packs", next)}
                />
              </View>

              <View style={styles.stepperRow}>
                <Text style={styles.stepperLabel}>Singles</Text>
                <Stepper
                  value={row.singles}
                  min={0}
                  label={`single ${denom} cards`}
                  onChange={(next) => setRowField(denom, "singles", next)}
                />
              </View>

              {active && (
                <Text style={styles.cards}>
                  {cards} card{cards === 1 ? "" : "s"} · auto-priced
                </Text>
              )}
            </View>
          );
        })}
    </PickerShell>
  );
}

const styles = StyleSheet.create({
  supplierRow: {
    flexDirection: "row",
    gap: 10,
  },
  supplier: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  supplierSelected: {
    backgroundColor: colors.blue,
    borderColor: colors.blue,
  },
  supplierLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  supplierLabelSelected: {
    color: colors.white,
  },
  denomCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 12,
    gap: 8,
  },
  denomCardActive: {
    borderColor: colors.blue,
  },
  denomHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  denomName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  denomPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.green,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  cards: {
    fontSize: 12,
    color: colors.mutedLight,
  },
});

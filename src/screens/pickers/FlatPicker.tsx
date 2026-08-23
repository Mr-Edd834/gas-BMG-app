import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PriceInput } from "../../components/PriceInput";
import { Stepper } from "../../components/Stepper";
import {
  buildFlatLines,
  emptyFlatOption,
  parsePrice,
  type FlatPickerState,
} from "../../sales/buildLines";
import type { CartLine } from "../../sales/types";
import { colors } from "../../theme/colors";
import { cardRadius } from "../../theme/layout";
import { PickerShell } from "./PickerShell";

interface Props {
  commodity: "burner" | "cooker";
  options: string[];
  initial: FlatPickerState | null;
  onCommit: (lines: CartLine[]) => void;
  onCancel: () => void;
}

// BURNER / COOKER picker (spec Part C §1 §5) — the flat shape: one row per
// option, a qty stepper starting at 0, and a price box that appears once the
// quantity does. No brand→variant step, because neither commodity has one.
export function FlatPicker({
  commodity,
  options,
  initial,
  onCommit,
  onCancel,
}: Props) {
  const [state, setState] = useState<FlatPickerState>(
    initial ?? { options: {} }
  );

  function rowFor(option: string) {
    return state.options[option] ?? emptyFlatOption;
  }

  function setRowField(
    option: string,
    field: "qty" | "price",
    value: number | string
  ) {
    setState((prev) => {
      const current = prev.options[option] ?? emptyFlatOption;
      return {
        ...prev,
        options: { ...prev.options, [option]: { ...current, [field]: value } },
      };
    });
  }

  const rowsWithQty = options.filter((option) => rowFor(option).qty > 0);
  const hasQty = rowsWithQty.length > 0;
  const priceMissing = rowsWithQty.some(
    (option) => parsePrice(rowFor(option).price) <= 0
  );

  return (
    <PickerShell
      isEditing={initial !== null}
      canCommit={hasQty && !priceMissing}
      priceMissing={priceMissing}
      onCancel={onCancel}
      onCommit={() => onCommit(buildFlatLines(commodity, state, options))}
    >
      {options.map((option) => {
        const row = rowFor(option);
        return (
          <View key={option} style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.name}>{option}</Text>
              <Stepper
                value={row.qty}
                min={0}
                label={option}
                onChange={(next) => setRowField(option, "qty", next)}
              />
            </View>

            {row.qty > 0 && (
              <View style={styles.priceRow}>
                <Text style={styles.fieldLabel}>Price each (KSh)</Text>
                <PriceInput
                  value={row.price}
                  onChangeText={(next) => setRowField(option, "price", next)}
                  accessibilityLabel={`Price for each ${option}`}
                />
              </View>
            )}
          </View>
        );
      })}

      {options.length === 0 && (
        <Text style={styles.noOptions}>
          Nothing in the catalog for this yet.
        </Text>
      )}
    </PickerShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 12,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
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
  noOptions: {
    fontSize: 13,
    color: colors.mutedLight,
  },
});

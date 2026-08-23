import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CartLineCard } from "../components/CartLineCard";
import { ScreenHeader } from "../components/ScreenHeader";
import { RECENT_BRAND_COUNT } from "../config/tunables";
import { useReadyApp } from "../context/AppContext";
import { loadCatalog, type Catalog } from "../db/queries/catalog";
import { listRecentCylinderBrands } from "../db/queries/sales";
import { loadFullStockMap } from "../db/queries/stock";
import { formatMoney } from "../lib/formatMoney";
import type { RootStackParamList } from "../navigation/types";
import {
  draftFromAirtimeLine,
  draftFromCylinderLine,
  draftFromFlatLine,
  type AirtimePickerState,
  type CylinderPickerState,
  type FlatPickerState,
} from "../sales/buildLines";
import { cartTotal, COMMODITIES, type CartLine } from "../sales/types";
import { colors } from "../theme/colors";
import { cardRadius, touchTarget } from "../theme/layout";
import type { CommodityType } from "../types/db";
import { AirtimePicker } from "./pickers/AirtimePicker";
import { CylinderPicker } from "./pickers/CylinderPicker";
import { FlatPicker } from "./pickers/FlatPicker";

type Props = NativeStackScreenProps<RootStackParamList, "AddSale">;

// What is currently open, and — if this is an edit — which line was pulled out
// of the cart to open it, so cancelling can put it back exactly as it was.
interface OpenPicker {
  commodity: CommodityType;
  cylinder: CylinderPickerState | null;
  airtime: AirtimePickerState | null;
  flat: FlatPickerState | null;
  editing: { line: CartLine; index: number } | null;
}

// Puts a line that is currently out for editing back where it came from,
// unchanged. Every way of ending an edit without committing routes through
// here — Cancel, opening another commodity, deleting a different line — so
// "cancelling an edit restores the original line unchanged (nothing lost)"
// holds on every exit path, not just the Cancel button.
function withRestored(cart: CartLine[], open: OpenPicker | null): CartLine[] {
  if (!open?.editing) return cart;
  const { line, index } = open.editing;
  return [...cart.slice(0, index), line, ...cart.slice(index)];
}

// STEP 1 — build the cart (spec Part C §1 §5).
//
// The whole basket is assembled on THIS one screen: a commodity button opens
// its picker inline, saving drops card(s) into the cart below it, and she can
// open another commodity without ever leaving. That is the point of the cart
// pattern — it removes the navigating back and forth between a picker screen
// and a list screen.
export function AddSaleScreen({ route, navigation }: Props) {
  const { businessId } = useReadyApp();
  const params = route.params;
  const isNewTab = params.mode === "new-tab";

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [stock, setStock] = useState<Map<string, number>>(new Map());
  const [recentBrands, setRecentBrands] = useState<string[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picker, setPicker] = useState<OpenPicker | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadCatalog(businessId),
      loadFullStockMap(businessId),
      listRecentCylinderBrands(businessId, RECENT_BRAND_COUNT),
    ])
      .then(([loadedCatalog, loadedStock, brands]) => {
        if (cancelled) return;
        setCatalog(loadedCatalog);
        setStock(loadedStock);
        setRecentBrands(brands);
      })
      .catch((err) => {
        console.error("[AddSale] could not load the catalog", err);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const openPicker = useCallback(
    (commodity: CommodityType) => {
      // Tapping the open commodity again closes it.
      if (picker && picker.commodity === commodity && !picker.editing) {
        setPicker(null);
        return;
      }
      // Walking away mid-edit is still a cancel: the line goes back untouched.
      setCart((prev) => withRestored(prev, picker));
      setPicker({
        commodity,
        cylinder: null,
        airtime: null,
        flat: null,
        editing: null,
      });
    },
    [picker]
  );

  // Tap a cart line to edit it: the line is pulled OUT of the cart and its
  // picker reopens pre-filled with all of its values. Saving re-adds it
  // through the very same builder the add path uses (see src/sales/buildLines),
  // so there is no second code path that can drift.
  //
  // Positions are resolved by line key against the restored cart, so a
  // pending edit being put back first can't shift the index of the line she
  // actually tapped.
  const editLine = useCallback(
    (line: CartLine) => {
      const base = withRestored(cart, picker);
      const index = base.findIndex((l) => l.key === line.key);
      if (index === -1) return;
      setCart(base.filter((l) => l.key !== line.key));
      setPicker({
        commodity: line.commodity,
        cylinder:
          line.commodity === "cylinder" ? draftFromCylinderLine(line) : null,
        airtime:
          line.commodity === "airtime" ? draftFromAirtimeLine(line) : null,
        flat:
          line.commodity === "burner" || line.commodity === "cooker"
            ? draftFromFlatLine(line)
            : null,
        editing: { line, index },
      });
    },
    [cart, picker]
  );

  const commitPicker = useCallback(
    (lines: CartLine[]) => {
      // On an edit the cart no longer holds the original line, so its old
      // index is exactly where the rebuilt line(s) belong.
      const at = picker?.editing?.index ?? null;
      setCart((prev) =>
        at === null
          ? [...prev, ...lines]
          : [...prev.slice(0, at), ...lines, ...prev.slice(at)]
      );
      setPicker(null);
    },
    [picker]
  );

  const cancelPicker = useCallback(() => {
    setCart((prev) => withRestored(prev, picker));
    setPicker(null);
  }, [picker]);

  // The ✗ on a line — an outright delete of an item that was never written to
  // the DB. History immutability (G5) starts at save, not here.
  const removeLine = useCallback(
    (key: string) => {
      setCart((prev) => withRestored(prev, picker).filter((l) => l.key !== key));
      setPicker(null);
    },
    [picker]
  );

  const total = cartTotal(cart);
  const nameMissing = isNewTab && customerName.trim().length === 0;

  const goToPayment = useCallback(() => {
    navigation.navigate("Payment", {
      lines: cart,
      customerId: params.mode === "existing" ? params.customerId : null,
      customerName:
        params.mode === "existing" ? params.customerName : customerName.trim(),
      newCustomerName: isNewTab ? customerName.trim() : null,
    });
  }, [navigation, cart, params, customerName, isNewTab]);

  if (!catalog) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        // Back from the build step cancels the whole sale (spec §5, Header).
        title={isNewTab ? "New tab" : `Sale · ${params.customerName}`}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          cart.length > 0 && styles.contentWithBar,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name field — shown ONLY when creating a new tab. The existing-tab
            flow is otherwise identical. */}
        {isNewTab && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Customer name</Text>
            <TextInput
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Who is this tab for?"
              placeholderTextColor={colors.mutedLight}
              accessibilityLabel="Customer name"
              autoCapitalize="words"
              style={styles.nameInput}
            />
          </View>
        )}

        <View style={styles.commodities}>
          {COMMODITIES.map((commodity) => {
            const active = picker?.commodity === commodity.key;
            return (
              <Pressable
                key={commodity.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => openPicker(commodity.key)}
                style={[
                  styles.commodityButton,
                  active && styles.commodityButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.commodityLabel,
                    active && styles.commodityLabelActive,
                  ]}
                >
                  {commodity.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {picker?.commodity === "cylinder" && (
          <CylinderPicker
            catalog={catalog}
            stock={stock}
            recentBrands={recentBrands}
            initial={picker.cylinder}
            onCommit={commitPicker}
            onCancel={cancelPicker}
          />
        )}

        {picker?.commodity === "airtime" && (
          <AirtimePicker
            catalog={catalog}
            initial={picker.airtime}
            onCommit={commitPicker}
            onCancel={cancelPicker}
          />
        )}

        {(picker?.commodity === "burner" || picker?.commodity === "cooker") && (
          <FlatPicker
            commodity={picker.commodity}
            options={
              picker.commodity === "burner"
                ? catalog.burnerBrands
                : catalog.cookerOptions
            }
            initial={picker.flat}
            onCommit={commitPicker}
            onCancel={cancelPicker}
          />
        )}

        {cart.length > 0 && (
          <View style={styles.cart}>
            <Text style={styles.cartHeading}>IN THIS SALE</Text>
            {cart.map((line) => (
              <CartLineCard
                key={line.key}
                line={line}
                onEdit={() => editLine(line)}
                onRemove={() => removeLine(line.key)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Running total + the move-to-payment button, visible only once the
          cart has something in it (spec §5). */}
      {cart.length > 0 && (
        <View style={styles.bottomBar}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total so far</Text>
            <Text style={styles.totalValue}>{formatMoney(total)}</Text>
          </View>

          {nameMissing && (
            <Text style={styles.helper}>
              Add a name for this tab before continuing.
            </Text>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: nameMissing }}
            disabled={nameMissing}
            onPress={goToPayment}
            style={({ pressed }) => [
              styles.payButton,
              nameMissing && styles.payButtonDisabled,
              pressed && !nameMissing && styles.pressed,
            ]}
          >
            <Text style={styles.payLabel}>Move to payment →</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 20,
    gap: 16,
  },
  contentWithBar: {
    paddingBottom: 140,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.mutedLight,
  },
  nameInput: {
    minHeight: touchTarget + 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  commodities: {
    flexDirection: "row",
    gap: 8,
  },
  commodityButton: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  commodityButtonActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  commodityLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
  commodityLabelActive: {
    color: colors.white,
  },
  cart: {
    gap: 8,
  },
  cartHeading: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "600",
    color: colors.muted,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 8,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  totalValue: {
    fontSize: 19,
    fontWeight: "700",
    color: colors.ink,
  },
  helper: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.amber,
  },
  payButton: {
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: cardRadius,
    backgroundColor: colors.green,
    paddingVertical: 12,
  },
  payButtonDisabled: {
    backgroundColor: colors.mutedLight,
  },
  pressed: {
    opacity: 0.85,
  },
  payLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },
});

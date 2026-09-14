import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CartLineCard } from "../components/CartLineCard";
import { LoadError } from "../components/LoadError";
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
  // Identifies this picker SESSION, not the commodity. Two consecutive
  // sessions can use the same picker component (edit a cylinder line, then
  // open the cylinder picker fresh), and without a changing key React would
  // reuse the mounted instance and carry the previous session's internal
  // state — and its values — into the new one. Used as the element key so
  // every session starts from its own `initial`.
  instanceId: number;
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
const BOTTOM_BAR_PADDING = 16;

export function AddSaleScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { businessId } = useReadyApp();
  const params = route.params;
  const isNewTab = params.mode === "new-tab";

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [stock, setStock] = useState<Map<string, number>>(new Map());
  const [recentBrands, setRecentBrands] = useState<string[]>([]);
  // Without this the catalog simply stayed null on failure and the screen sat
  // on its spinner forever, with no way to tell a slow read from a broken one.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [customerName, setCustomerName] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picker, setPicker] = useState<OpenPicker | null>(null);
  const nextInstanceId = useRef(0);

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
        setLoadError(null);
      })
      .catch((err) => {
        console.error("[AddSale] could not load the catalog", err);
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, attempt]);

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
        instanceId: nextInstanceId.current++,
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
        instanceId: nextInstanceId.current++,
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
    // Moving on mid-edit is another way of walking away from that edit, so the
    // pulled-out line comes back unchanged rather than being silently dropped
    // from the sale.
    const lines = withRestored(cart, picker);
    setCart(lines);
    setPicker(null);

    navigation.navigate("Payment", {
      lines,
      customerId: params.mode === "existing" ? params.customerId : null,
      customerName:
        params.mode === "existing" ? params.customerName : customerName.trim(),
      newCustomerName: isNewTab ? customerName.trim() : null,
    });
  }, [navigation, cart, picker, params, customerName, isNewTab]);

  // Without a catalog there is nothing to sell, so this is a hard stop rather
  // than a degraded screen — offering empty pickers would invite her to build
  // a sale that cannot be completed.
  if (!catalog && loadError !== null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader
          title={isNewTab ? "New tab" : `Sale · ${params.customerName}`}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.errorPad}>
          <LoadError
            what="what this shop sells"
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

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
        // The bottom inset is added to the SCROLLING content too, not just the
        // pinned bar. An open picker (airtime is the tallest — four
        // denominations with two steppers each) scrolls past the end of the
        // window, so without this its Cancel / Add to sale buttons come to
        // rest underneath Android's navigation keys and cannot be pressed.
        contentContainerStyle={[
          styles.content,
          cart.length > 0 && styles.contentWithBar,
          { paddingBottom: (cart.length > 0 ? 140 : 20) + insets.bottom },
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
            key={picker.instanceId}
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
            key={picker.instanceId}
            catalog={catalog}
            initial={picker.airtime}
            onCommit={commitPicker}
            onCancel={cancelPicker}
          />
        )}

        {(picker?.commodity === "burner" || picker?.commodity === "cooker") && (
          <FlatPicker
            key={picker.instanceId}
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
          cart has something in it (spec §5).

          paddingBottom includes the device's bottom safe-area inset: Android
          draws Back/Home/Recents inside the app window, so a bar pinned to
          bottom: 0 sits underneath them on a 3-button phone. */}
      {cart.length > 0 && (
        <View
          style={[
            styles.bottomBar,
            { paddingBottom: BOTTOM_BAR_PADDING + insets.bottom },
          ]}
        >
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
  errorPad: {
    paddingHorizontal: 20,
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
    // paddingBottom is applied inline where the safe-area inset is known.
    // Do not put a fixed value back here — it would be overridden anyway and
    // would only mislead the next person reading this.
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

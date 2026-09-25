import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { listRecentCylinderBrands, listSales } from "../db/queries/sales";
import { cartLinesFromSale } from "../sales/buildLines";
import { loadFullStockMap } from "../db/queries/stock";
import { formatMoney } from "../lib/formatMoney";
import type { RootStackParamList } from "../navigation/types";
import {
  buildAirtimeLines,
  buildCylinderLines,
  buildFlatLines,
  draftFromAirtimeLine,
  draftFromCylinderLine,
  draftFromFlatLine,
  type AirtimePickerState,
  type CylinderPickerState,
  type FlatPickerState,
} from "../sales/buildLines";
import { cartTotal, COMMODITIES, type CartLine } from "../sales/types";
import {
  resolveWalkAway,
  withRestored,
  type Drafts as WalkAwayDrafts,
} from "../sales/walkAway";
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


type AnyDraft = CylinderPickerState | AirtimePickerState | FlatPickerState;

// What each picker would produce right now, through the SAME builders its Add
// button uses — so an auto-saved line is identical to a manually added one.
function linesFromDraft(
  commodity: CommodityType,
  draft: AnyDraft,
  catalog: Catalog
): CartLine[] {
  switch (commodity) {
    case "cylinder":
      return buildCylinderLines(draft as CylinderPickerState, catalog.cylinderSizes);
    case "airtime":
      return buildAirtimeLines(
        draft as AirtimePickerState,
        catalog.airtimeDenominations
      );
    case "burner":
      return buildFlatLines("burner", draft as FlatPickerState, catalog.burnerBrands);
    case "cooker":
      return buildFlatLines("cooker", draft as FlatPickerState, catalog.cookerOptions);
  }
}

function initialOf(open: OpenPicker): AnyDraft | null {
  return open.cylinder ?? open.airtime ?? open.flat ?? null;
}

export type Drafts = WalkAwayDrafts<AnyDraft>;

/**
 * Walks away from the open picker. The DECISION — keep, draft, or discard —
 * lives in src/sales/walkAway.ts, where it is tested. This only builds the
 * lines that decision is made about.
 *
 * Every walk-away path, the running total and the Move-to-payment button all
 * go through here, so what the screen shows is exactly what would happen.
 */
function resolveOpenPicker(
  open: OpenPicker | null,
  live: AnyDraft | null,
  cart: CartLine[],
  drafts: Drafts,
  catalog: Catalog | null
): { cart: CartLine[]; drafts: Drafts } {
  if (!open || !catalog) return { cart, drafts };
  const state = live ?? initialOf(open);
  return resolveWalkAway<AnyDraft>({
    open: { commodity: open.commodity, editing: open.editing },
    lines: state ? linesFromDraft(open.commodity, state, catalog) : [],
    state,
    cart,
    drafts,
  });
}

const COMMODITY_NAMES: Record<CommodityType, string> = {
  cylinder: "cylinders",
  airtime: "airtime",
  burner: "burners",
  cooker: "cookers",
};

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
  const isCorrecting = params.mode === "correct";

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [stock, setStock] = useState<Map<string, number>>(new Map());
  const [recentBrands, setRecentBrands] = useState<string[]>([]);
  // Without this the catalog simply stayed null on failure and the screen sat
  // on its spinner forever, with no way to tell a slow read from a broken one.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [customerName, setCustomerName] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  // Fixing a sale: its lines come back into the cart so she edits what was
  // typed rather than retyping it from memory. Runs once — reseeding after
  // she has started changing things would throw her edits away.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (params.mode !== "correct" || seeded) return;
    let cancelled = false;
    listSales(
      { businessId, saleIds: [params.saleId], includeCancelled: true },
      1,
      0
    )
      .then((rows) => {
        if (cancelled || rows.length === 0) return;
        setCart(cartLinesFromSale(rows[0].items));
        setSeeded(true);
      })
      .catch((err) =>
        console.error("[AddSale] could not load the sale to correct", err)
      );
    return () => {
      cancelled = true;
    };
  }, [params, businessId, seeded]);
  const [picker, setPicker] = useState<OpenPicker | null>(null);
  const nextInstanceId = useRef(0);

  // What the open picker currently holds, reported by the picker as she types.
  // Tagged with the session it came from so a picker that is closing cannot
  // overwrite the one that just opened.
  const [live, setLive] = useState<{ instanceId: number; state: AnyDraft } | null>(
    null
  );
  // Unfinished entries per commodity, kept so reopening one restores them.
  const [drafts, setDrafts] = useState<Drafts>({});
  // Why Move to payment was refused, shown until she acts on it.
  const [blockedBy, setBlockedBy] = useState<CommodityType | null>(null);

  const openId = picker?.instanceId ?? -1;
  const onDraftChange = useCallback(
    (state: AnyDraft) => setLive({ instanceId: openId, state }),
    [openId]
  );
  const liveState =
    live && picker && live.instanceId === picker.instanceId ? live.state : null;

  // Everything below walks away from the open picker through this.
  const walkAway = useCallback(
    () => resolveOpenPicker(picker, liveState, cart, drafts, catalog),
    [picker, liveState, cart, drafts, catalog]
  );

  // The sale as it would stand if she moved on right now — the same answer the
  // walk-away gives, so the total and the payment button never disagree with
  // what actually happens when she taps it.
  const projected = useMemo(() => walkAway(), [walkAway]);

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

  // Opens a fresh picker for a commodity, restoring any unfinished draft.
  function freshSession(commodity: CommodityType, from: Drafts): OpenPicker {
    const draft = from[commodity] ?? null;
    return {
      instanceId: nextInstanceId.current++,
      commodity,
      cylinder: commodity === "cylinder" ? (draft as CylinderPickerState | null) : null,
      airtime: commodity === "airtime" ? (draft as AirtimePickerState | null) : null,
      flat:
        commodity === "burner" || commodity === "cooker"
          ? (draft as FlatPickerState | null)
          : null,
      editing: null,
    };
  }

  const openPicker = useCallback(
    (commodity: CommodityType) => {
      const next = walkAway();
      setCart(next.cart);
      setDrafts(next.drafts);
      setBlockedBy(null);

      // Tapping the open commodity again closes it — after saving what was in
      // it, exactly as switching to a different one would.
      if (picker && picker.commodity === commodity && !picker.editing) {
        setPicker(null);
        return;
      }
      setPicker(freshSession(commodity, next.drafts));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picker, walkAway]
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
      // Whatever was open is resolved first, so tapping a line never throws
      // away the picker she was halfway through.
      const next = walkAway();
      setDrafts(next.drafts);
      setBlockedBy(null);
      const base = next.cart;
      const index = base.findIndex((l) => l.key === line.key);
      if (index === -1) {
        setCart(base);
        setPicker(null);
        return;
      }
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
    [walkAway]
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
      // The draft for this commodity is now in the cart; nothing to restore.
      if (picker && !picker.editing) {
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[picker.commodity];
          return next;
        });
      }
      setBlockedBy(null);
      setPicker(null);
    },
    [picker]
  );

  // Cancel is an explicit "throw this away" — unlike walking off, which must
  // never lose anything. On a fresh picker it discards the entries AND the
  // saved draft; on an edit it puts the original line back untouched.
  const cancelPicker = useCallback(() => {
    setCart((prev) => withRestored(prev, picker?.editing ?? null));
    if (picker && !picker.editing) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[picker.commodity];
        return next;
      });
    }
    setBlockedBy(null);
    setPicker(null);
  }, [picker]);

  // The ✗ on a line — an outright delete of an item that was never written to
  // the DB. History immutability (G5) starts at save, not here.
  const removeLine = useCallback(
    (key: string) => {
      const next = walkAway();
      setDrafts(next.drafts);
      setCart(next.cart.filter((l) => l.key !== key));
      setPicker(null);
    },
    [walkAway]
  );

  // Shown from the projected sale, so a picker she has filled in counts even
  // before it is added — and the button appears without her pressing Add.
  const total = cartTotal(projected.cart);
  const hasBar = projected.cart.length > 0;
  const nameMissing = isNewTab && customerName.trim().length === 0;

  const goToPayment = useCallback(() => {
    const next = walkAway();
    setCart(next.cart);
    setDrafts(next.drafts);

    // An unfinished commodity must not vanish at the last step. Reopen it with
    // what she typed and say what it needs, rather than carrying on without it.
    const unfinished = (Object.keys(next.drafts) as CommodityType[])[0];
    if (unfinished) {
      setBlockedBy(unfinished);
      setPicker(freshSession(unfinished, next.drafts));
      return;
    }

    setBlockedBy(null);
    setPicker(null);
    navigation.navigate("Payment", {
      lines: next.cart,
      // Asked as "is this a new tab?" rather than "is this an existing one?".
      // The two-way version broke the moment a third mode existed: a
      // correction is not "existing", so it fell down the else branch, arrived
      // at the payment step with no customer, and hit a guard that returned
      // without a word — the Save button simply did nothing.
      customerId: params.mode === "new-tab" ? null : params.customerId,
      customerName:
        params.mode === "new-tab" ? customerName.trim() : params.customerName,
      newCustomerName: isNewTab ? customerName.trim() : null,
      correctingSaleId: params.mode === "correct" ? params.saleId : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, walkAway, params, customerName, isNewTab]);

  // Without a catalog there is nothing to sell, so this is a hard stop rather
  // than a degraded screen — offering empty pickers would invite her to build
  // a sale that cannot be completed.
  if (!catalog && loadError !== null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScreenHeader
          title={
            isCorrecting
              ? "Fix this sale"
              : isNewTab
                ? "New tab"
                : `Sale · ${params.customerName}`
          }
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
        title={
            isCorrecting
              ? "Fix this sale"
              : isNewTab
                ? "New tab"
                : `Sale · ${params.customerName}`
          }
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
          hasBar && styles.contentWithBar,
          { paddingBottom: (hasBar ? 140 : 20) + insets.bottom },
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
            // A held draft is otherwise invisible once she has moved on, so
            // the button carries a dot to say "there's something unfinished
            // in here" — the same affordance problem as the sale cards'
            // missing chevron.
            const hasDraft = !active && drafts[commodity.key] !== undefined;
            return (
              <Pressable
                key={commodity.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityHint={
                  hasDraft ? "Has unfinished entries waiting for a price" : undefined
                }
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
                {hasDraft && <View style={styles.draftDot} />}
              </Pressable>
            );
          })}
        </View>

        {blockedBy !== null && picker?.commodity === blockedBy && (
          <View style={styles.blocked}>
            <Text style={styles.blockedText}>
              Finish the {COMMODITY_NAMES[blockedBy]} before moving to payment —
              a price is missing. Or tap Cancel to leave them out.
            </Text>
          </View>
        )}

        {picker?.commodity === "cylinder" && (
          <CylinderPicker
            key={picker.instanceId}
            catalog={catalog}
            stock={stock}
            recentBrands={recentBrands}
            initial={picker.cylinder}
            isEditing={picker.editing !== null}
            onCommit={commitPicker}
            onCancel={cancelPicker}
            onDraftChange={onDraftChange}
          />
        )}

        {picker?.commodity === "airtime" && (
          <AirtimePicker
            key={picker.instanceId}
            catalog={catalog}
            initial={picker.airtime}
            isEditing={picker.editing !== null}
            onCommit={commitPicker}
            onCancel={cancelPicker}
            onDraftChange={onDraftChange}
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
            isEditing={picker.editing !== null}
            onCommit={commitPicker}
            onCancel={cancelPicker}
            onDraftChange={onDraftChange}
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

      {/* Running total + the move-to-payment button, visible once the sale
          would contain something (spec §5) — including a picker she has
          filled in but not added, since walking away now adds it anyway.

          paddingBottom includes the device's bottom safe-area inset: Android
          draws Back/Home/Recents inside the app window, so a bar pinned to
          bottom: 0 sits underneath them on a 3-button phone. */}
      {hasBar && (
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
  // Amber, the app's "something still owed" colour — an unfinished draft is
  // work she still owes the sale.
  draftDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.amber,
  },
  blocked: {
    backgroundColor: colors.amberBg,
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 10,
    padding: 12,
  },
  blockedText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: colors.amber,
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

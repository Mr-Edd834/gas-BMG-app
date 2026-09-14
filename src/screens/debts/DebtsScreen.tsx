import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadError } from "../../components/LoadError";
import { StatusDot } from "../../components/StatusDot";
import { useToast } from "../../components/Toast";
import { useReadyApp } from "../../context/AppContext";
import {
  listEmptiesDebts,
  listMoneyDebts,
  loadEmptiesInHand,
  recordEmptyReturn,
  recordRepayment,
  type CustomerEmptiesDebts,
  type CustomerMoneyDebts,
  type EmptiesBatch,
  type MoneyDebt,
} from "../../db/queries/debts";
import { needsCollecting } from "../../debts/rules";
import { formatDate } from "../../lib/formatDate";
import { formatMoney } from "../../lib/formatMoney";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";
import { EmptyReturnSheet } from "./EmptyReturnSheet";
import { RepaymentSheet } from "./RepaymentSheet";

type View2 = "money" | "empties";

// DEBTS — the collections cockpit (spec Part C §2).
//
// Two independent kinds of debt, never summed into one balance: a customer can
// be square on money and still be holding six cylinders. Merging them would
// hide exactly the distinction she acts on, since one is settled by paying and
// the other by carrying metal back to the shop.
export function DebtsScreen() {
  const { businessId, staff } = useReadyApp();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<View2>("money");
  const [money, setMoney] = useState<CustomerMoneyDebts[] | null>(null);
  const [empties, setEmpties] = useState<CustomerEmptiesDebts[] | null>(null);
  const [inHand, setInHand] = useState<{
    rows: { brand: string; size: string; qty: number }[];
    total: number;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [inHandOpen, setInHandOpen] = useState(false);

  const [repaying, setRepaying] = useState<{
    debt: MoneyDebt;
    customerId: string;
    customerName: string;
  } | null>(null);
  const [returning, setReturning] = useState<{
    batch: EmptiesBatch;
    customerId: string;
    customerName: string;
  } | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Reloads on focus AND after every write, because a balance here is not
  // stored anywhere — it is recomputed from the rows each time (G1). There is
  // no number to update in place, only a fresh calculation to run.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([
        listMoneyDebts(businessId),
        listEmptiesDebts(businessId),
        loadEmptiesInHand(businessId),
      ])
        .then(([m, e, h]) => {
          if (cancelled) return;
          setMoney(m);
          setEmpties(e);
          setInHand(h);
          setLoadError(null);
        })
        .catch((err) => {
          console.error("[Debts] could not load", err);
          if (cancelled) return;
          setLoadError(err instanceof Error ? err.message : String(err));
        });
      return () => {
        cancelled = true;
      };
    }, [businessId, attempt])
  );

  const toggleCard = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const saveRepayment = useCallback(
    async (amount: number) => {
      if (!repaying) return;
      const { debt, customerId } = repaying;
      setRepaying(null);
      try {
        await recordRepayment({
          businessId,
          saleId: debt.saleId,
          customerId,
          staffId: staff.id,
          amount,
        });
        showToast(`${formatMoney(amount)} recorded`);
        reload();
      } catch (err) {
        console.error("[Debts] could not save the repayment", err);
        showToast("NOT saved — the repayment was not recorded");
      }
    },
    [repaying, businessId, staff.id, showToast, reload]
  );

  const saveReturn = useCallback(
    async (qty: number) => {
      if (!returning) return;
      const { batch, customerId } = returning;
      setReturning(null);
      try {
        await recordEmptyReturn({
          businessId,
          saleItemId: batch.saleItemId,
          customerId,
          staffId: staff.id,
          brand: batch.brand,
          size: batch.size,
          qty,
        });
        showToast(`${qty} ${qty === 1 ? "empty" : "empties"} returned`);
        reload();
      } catch (err) {
        console.error("[Debts] could not save the return", err);
        showToast("NOT saved — the return was not recorded");
      }
    },
    [returning, businessId, staff.id, showToast, reload]
  );

  const loading = money === null || empties === null;

  if (loadError !== null && loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.pad}>
          <Text style={styles.title}>Debts</Text>
          <LoadError what="your debts" detail={loadError} onRetry={reload} />
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  const moneyTotal = money.reduce((s, c) => s + c.totalOutstanding, 0);
  const emptiesTotal = empties.reduce((s, c) => s + c.totalOutstanding, 0);

  // "Needs collecting" pinned above "On track" (spec §4). The split is the
  // whole point of this screen: it answers "who do I chase today" without her
  // reading a single number.
  const moneyUrgent = money.filter((c) => needsCollecting(c.urgency));
  const moneyOk = money.filter((c) => !needsCollecting(c.urgency));
  const emptiesUrgent = empties.filter((c) => needsCollecting(c.urgency));
  const emptiesOk = empties.filter((c) => !needsCollecting(c.urgency));

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        <Text style={styles.title}>Debts</Text>

        <View style={styles.toggle}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: view === "money" }}
            onPress={() => setView("money")}
            style={[styles.toggleHalf, view === "money" && styles.toggleOn]}
          >
            <Text
              style={[
                styles.toggleLabel,
                view === "money" && styles.toggleLabelOn,
              ]}
            >
              Money owed
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: view === "empties" }}
            onPress={() => setView("empties")}
            style={[styles.toggleHalf, view === "empties" && styles.toggleOn]}
          >
            <Text
              style={[
                styles.toggleLabel,
                view === "empties" && styles.toggleLabelOn,
              ]}
            >
              Empties owed
            </Text>
          </Pressable>
        </View>

        <Text style={styles.summary}>
          {view === "money"
            ? `${formatMoney(moneyTotal)} outstanding`
            : `${emptiesTotal} ${emptiesTotal === 1 ? "empty" : "empties"} out`}
        </Text>

        {view === "money" ? (
          <>
            {money.length === 0 ? (
              <Text style={styles.empty}>Nobody owes money right now.</Text>
            ) : (
              <>
                <Section
                  title="Needs collecting"
                  count={moneyUrgent.length}
                  hide={moneyUrgent.length === 0}
                >
                  {moneyUrgent.map((c) => (
                    <MoneyCard
                      key={c.customerId}
                      customer={c}
                      open={expanded.has(c.customerId)}
                      onToggle={() => toggleCard(c.customerId)}
                      onRepay={(debt) =>
                        setRepaying({
                          debt,
                          customerId: c.customerId,
                          customerName: c.customerName,
                        })
                      }
                    />
                  ))}
                </Section>
                <Section
                  title="On track"
                  count={moneyOk.length}
                  hide={moneyOk.length === 0}
                >
                  {moneyOk.map((c) => (
                    <MoneyCard
                      key={c.customerId}
                      customer={c}
                      open={expanded.has(c.customerId)}
                      onToggle={() => toggleCard(c.customerId)}
                      onRepay={(debt) =>
                        setRepaying({
                          debt,
                          customerId: c.customerId,
                          customerName: c.customerName,
                        })
                      }
                    />
                  ))}
                </Section>
              </>
            )}
          </>
        ) : (
          <>
            {/* Deliberately small and collapsed (spec §5): this is context for
                when the refill supplier arrives, not the subject of the screen.
                It is also the OPPOSITE pile to the list below — empties she
                physically holds, versus empties customers still owe her. */}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: inHandOpen }}
              onPress={() => setInHandOpen((v) => !v)}
              style={styles.inHandBar}
            >
              <Ionicons name="cube-outline" size={15} color={colors.muted} />
              <Text style={styles.inHandLabel}>
                Empties in hand (for refill) — {inHand?.total ?? 0}
              </Text>
              <Ionicons
                name={inHandOpen ? "chevron-up" : "chevron-down"}
                size={15}
                color={colors.muted}
                style={styles.inHandChevron}
              />
            </Pressable>
            {inHandOpen && (
              <View style={styles.inHandDetail}>
                {(inHand?.rows.length ?? 0) === 0 ? (
                  <Text style={styles.inHandNone}>
                    None yet. Empties arrive here when a customer hands one over
                    at a sale, or brings one back later.
                  </Text>
                ) : (
                  inHand!.rows.map((r) => (
                    <View key={`${r.brand}|${r.size}`} style={styles.inHandRow}>
                      <Text style={styles.inHandRowLabel}>
                        {r.brand} · {r.size}
                      </Text>
                      <Text style={styles.inHandRowValue}>{r.qty}</Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {empties.length === 0 ? (
              <Text style={styles.empty}>Nobody owes empties right now.</Text>
            ) : (
              <>
                <Section
                  title="Needs collecting"
                  count={emptiesUrgent.length}
                  hide={emptiesUrgent.length === 0}
                >
                  {emptiesUrgent.map((c) => (
                    <EmptiesCard
                      key={c.customerId}
                      customer={c}
                      open={expanded.has(c.customerId)}
                      onToggle={() => toggleCard(c.customerId)}
                      onReturn={(batch) =>
                        setReturning({
                          batch,
                          customerId: c.customerId,
                          customerName: c.customerName,
                        })
                      }
                    />
                  ))}
                </Section>
                <Section
                  title="On track"
                  count={emptiesOk.length}
                  hide={emptiesOk.length === 0}
                >
                  {emptiesOk.map((c) => (
                    <EmptiesCard
                      key={c.customerId}
                      customer={c}
                      open={expanded.has(c.customerId)}
                      onToggle={() => toggleCard(c.customerId)}
                      onReturn={(batch) =>
                        setReturning({
                          batch,
                          customerId: c.customerId,
                          customerName: c.customerName,
                        })
                      }
                    />
                  ))}
                </Section>
              </>
            )}
          </>
        )}
      </ScrollView>

      <RepaymentSheet
        visible={repaying !== null}
        debt={repaying?.debt ?? null}
        customerName={repaying?.customerName ?? ""}
        onCancel={() => setRepaying(null)}
        onConfirm={saveRepayment}
      />
      <EmptyReturnSheet
        visible={returning !== null}
        batch={returning?.batch ?? null}
        customerName={returning?.customerName ?? ""}
        onCancel={() => setReturning(null)}
        onConfirm={saveReturn}
      />
    </SafeAreaView>
  );
}

function Section({
  title,
  count,
  hide,
  children,
}: {
  title: string;
  count: number;
  hide: boolean;
  children: React.ReactNode;
}) {
  if (hide) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title} ({count})
      </Text>
      {children}
    </View>
  );
}

function MoneyCard({
  customer,
  open,
  onToggle,
  onRepay,
}: {
  customer: CustomerMoneyDebts;
  open: boolean;
  onToggle: () => void;
  onRepay: (debt: MoneyDebt) => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.cardHead, pressed && styles.pressed]}
      >
        <StatusDot urgency={customer.urgency} />
        <View style={styles.cardWho}>
          <Text style={styles.cardName}>{customer.customerName}</Text>
          <Text style={styles.cardMeta}>
            {customer.debts.length}{" "}
            {customer.debts.length === 1 ? "debt" : "debts"}
          </Text>
        </View>
        <Text style={styles.cardTotal}>
          {formatMoney(customer.totalOutstanding)}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.muted}
        />
      </Pressable>

      {open &&
        customer.debts.map((debt) => (
          <View key={debt.saleId} style={styles.debtRow}>
            <View style={styles.debtTop}>
              <StatusDot urgency={debt.urgency} />
              <Text style={styles.debtDesc}>{debt.description}</Text>
            </View>
            <Text style={styles.debtWhen}>Taken {formatDate(debt.soldAt)}</Text>
            <View style={styles.debtAmounts}>
              <Text style={styles.debtOwed}>
                {formatMoney(debt.outstanding)}
              </Text>
              {debt.paid > 0 && (
                <Text style={styles.debtPaid}>
                  {formatMoney(debt.paid)} paid
                </Text>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => onRepay(debt)}
              style={({ pressed }) => [
                styles.rowAction,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.rowActionLabel}>
                Log repayment on this debt
              </Text>
            </Pressable>
          </View>
        ))}
    </View>
  );
}

function EmptiesCard({
  customer,
  open,
  onToggle,
  onReturn,
}: {
  customer: CustomerEmptiesDebts;
  open: boolean;
  onToggle: () => void;
  onReturn: (batch: EmptiesBatch) => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.cardHead, pressed && styles.pressed]}
      >
        <StatusDot urgency={customer.urgency} />
        <View style={styles.cardWho}>
          <Text style={styles.cardName}>{customer.customerName}</Text>
          <Text style={styles.cardMeta}>
            {customer.batches.length}{" "}
            {customer.batches.length === 1 ? "batch" : "batches"}
          </Text>
        </View>
        <View style={styles.flameWrap}>
          <Ionicons name="flame-outline" size={15} color={colors.amber} />
          <Text style={styles.cardTotal}>{customer.totalOutstanding}</Text>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.muted}
        />
      </Pressable>

      {open &&
        customer.batches.map((batch) => (
          <View key={batch.saleItemId} style={styles.debtRow}>
            <View style={styles.debtTop}>
              <StatusDot urgency={batch.urgency} />
              <Text style={styles.debtDesc}>
                {batch.brand} · {batch.size}
              </Text>
            </View>
            <Text style={styles.debtWhen}>Taken {formatDate(batch.soldAt)}</Text>
            <Text style={styles.debtOwed}>
              {batch.outstanding} out of {batch.taken}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => onReturn(batch)}
              style={({ pressed }) => [
                styles.rowAction,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.rowActionLabel}>
                Tick off returned empties
              </Text>
            </Pressable>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  pad: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 14,
  },
  toggle: {
    flexDirection: "row",
    backgroundColor: colors.neutral,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  toggleHalf: {
    flex: 1,
    minHeight: touchTarget - 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  toggleOn: { backgroundColor: colors.white },
  toggleLabel: { fontSize: 14, fontWeight: "600", color: colors.muted },
  toggleLabelOn: { color: colors.ink },
  summary: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.amber,
    marginTop: 12,
  },
  empty: {
    fontSize: 14,
    color: colors.mutedLight,
    textAlign: "center",
    marginTop: 48,
  },
  section: { marginTop: 18 },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  cardWho: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.mutedLight },
  cardTotal: { fontSize: 16, fontWeight: "700", color: colors.amber },
  flameWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  debtRow: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  debtTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  debtDesc: { flex: 1, fontSize: 14, color: colors.ink },
  debtWhen: { fontSize: 12, color: colors.mutedLight, marginLeft: 19 },
  debtAmounts: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginLeft: 19,
  },
  debtOwed: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.amber,
    marginLeft: 19,
  },
  debtPaid: { fontSize: 12, fontWeight: "600", color: colors.green },
  rowAction: {
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.blueBg,
    marginTop: 8,
  },
  rowActionLabel: { fontSize: 14, fontWeight: "700", color: colors.blue },
  inHandBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: touchTarget,
    marginTop: 14,
  },
  inHandLabel: { flex: 1, fontSize: 13, color: colors.muted },
  inHandChevron: { marginLeft: "auto" },
  inHandDetail: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  inHandRow: { flexDirection: "row", justifyContent: "space-between" },
  inHandRowLabel: { fontSize: 13, color: colors.ink },
  inHandRowValue: { fontSize: 13, fontWeight: "700", color: colors.ink },
  inHandNone: { fontSize: 12, lineHeight: 17, color: colors.mutedLight },
  pressed: { opacity: 0.7 },
});

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BarChart, type Bar } from "../../components/charts/BarChart";
import { ProportionBar } from "../../components/charts/ProportionBar";
import { LoadError } from "../../components/LoadError";
import {
  PRODUCT_RANK_LIMIT,
  SLOW_PAYER_DAYS,
  TOP_DEBTORS_LIMIT,
} from "../../config/tunables";
import { useReadyApp } from "../../context/AppContext";
import { loadCatalog } from "../../db/queries/catalog";
import {
  listEmptiesDebts,
  listMoneyDebts,
  type CustomerMoneyDebts,
} from "../../db/queries/debts";
import {
  loadDebtByCommodity,
  loadPayerHistories,
  loadProductTotals,
  loadSaleTotalsSince,
  type CommodityDebt,
  type PayerHistory,
  type ProductTotalRow,
  type ReportSale,
} from "../../db/queries/reports";
import { formatMoney } from "../../lib/formatMoney";
import type { RootStackParamList } from "../../navigation/types";
import {
  bucketsFor,
  busiestDays,
  creditReliance,
  isWithin,
  rangeBounds,
  rankProducts,
  relianceSeverity,
  settleSpeed,
  type Direction,
  type Metric,
  type Range,
} from "../../reports/kpis";
import { colors } from "../../theme/colors";
import { cardRadius, touchTarget } from "../../theme/layout";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const RANGES: { key: Range; label: string; phrase: string }[] = [
  { key: "today", label: "Today", phrase: "today" },
  { key: "week", label: "Week", phrase: "this week" },
  { key: "month", label: "Month", phrase: "this month" },
];

const COMMODITY_LABELS: Record<string, string> = {
  cylinder: "Cylinders",
  airtime: "Airtime",
  burner: "Burners",
  cooker: "Cookers",
};

const COMMODITY_TONES: Record<string, string> = {
  cylinder: colors.amber,
  airtime: colors.blue,
  burner: colors.green,
  cooker: colors.ink,
};

const SEVERITY_TONES = {
  low: colors.green,
  watch: colors.amber,
  high: colors.overpaid,
} as const;

interface Loaded {
  sales: ReportSale[];
  products: ProductTotalRow[];
  money: CustomerMoneyDebts[];
  emptiesOwed: number;
  commodityDebt: CommodityDebt[];
  payers: PayerHistory[];
  catalogLabels: string[];
}

// REPORTS (spec Part C §5) — a lens over records that already exist.
//
// Two rules the spec is emphatic about, and they are the reason this screen
// looks calmer than a dashboard usually does:
//
//   DESCRIPTIVE ONLY. It reports what happened and never advises. This app is
//   a record-keeper, not a consultant, and advice about a business we only
//   partially model would be confidently wrong — which costs more trust than
//   saying nothing ever earns.
//
//   NO FABRICATED NUMBERS. Every figure is derivable from her own records.
//   Profit is absent because cost prices are captured nowhere, and its absence
//   is stated in the footer rather than filled with an estimate.
export function ReportsScreen() {
  const { businessId } = useReadyApp();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [range, setRange] = useState<Range>("week");
  const [metric, setMetric] = useState<Metric>("qty");
  const [direction, setDirection] = useState<Direction>("best");
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const now = useMemo(() => new Date(), [attempt, range]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const bounds = rangeBounds(range, now);
      // The trend always draws the week's days, even in "today" and "month"
      // views, so sales are loaded from whichever start is EARLIER. In the
      // first days of a month the current week begins in the previous one,
      // and loading only from the 1st would silently drop those buckets.
      const weekStart = rangeBounds("week", now).start;
      const since = bounds.start < weekStart ? bounds.start : weekStart;

      Promise.all([
        loadSaleTotalsSince(businessId, since.toISOString()),
        loadProductTotals(
          businessId,
          bounds.start.toISOString(),
          bounds.end.toISOString()
        ),
        listMoneyDebts(businessId),
        listEmptiesDebts(businessId),
        loadDebtByCommodity(businessId),
        loadPayerHistories(businessId),
        loadCatalog(businessId),
      ])
        .then(([sales, products, money, empties, commodityDebt, payers, catalog]) => {
          if (cancelled) return;
          setData({
            sales,
            products,
            money,
            emptiesOwed: empties.reduce((sum, c) => sum + c.totalOutstanding, 0),
            commodityDebt,
            payers,
            // Zero-fills the slow-mover list, so stock that shifted nothing at
            // all can appear — it generates no sale rows and is otherwise
            // invisible precisely because it did not sell.
            catalogLabels: catalog.cylinderBrands.flatMap((brand) =>
              catalog.cylinderSizes.map((size) => `${brand} · ${size}`)
            ),
          });
          setLoadError(null);
        })
        .catch((err) => {
          console.error("[Reports] could not load", err);
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : String(err));
          }
        });
      return () => {
        cancelled = true;
      };
    }, [businessId, range, now])
  );

  const active = RANGES.find((r) => r.key === range) ?? RANGES[1];

  const view = useMemo(() => {
    if (!data) return null;
    const bounds = rangeBounds(range, now);

    const inRange = data.sales.filter((s) => isWithin(s.at, bounds));
    const revenue = inRange.reduce((sum, s) => sum + s.total, 0);

    const buckets = bucketsFor(range, now);
    const reliance = creditReliance(data.sales, buckets);

    const outstandingMoney = data.money.reduce(
      (sum, c) => sum + c.totalOutstanding,
      0
    );

    const debtors = data.money
      .slice()
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      .slice(0, TOP_DEBTORS_LIMIT);

    const standingByCustomer = new Map(
      data.money.map((c) => [c.customerId, c])
    );

    const payers = data.payers
      .map((payer) => {
        const speed = settleSpeed(payer.debts);
        const standing = standingByCustomer.get(payer.customerId);
        return {
          ...payer,
          ...speed,
          owesNow: standing?.totalOutstanding ?? 0,
          overdue: standing?.urgency === "overdue",
        };
      })
      // Customers who have never taken credit have nothing to say here.
      .filter((p) => p.settledCount > 0 || p.owesNow > 0)
      .sort((a, b) => {
        // Slowest settlers first; anyone with no history yet sinks to the
        // bottom rather than being ranked as if they were instant payers.
        if (a.avgDays === null && b.avgDays === null) return 0;
        if (a.avgDays === null) return 1;
        if (b.avgDays === null) return -1;
        return b.avgDays - a.avgDays;
      })
      .slice(0, TOP_DEBTORS_LIMIT);

    return {
      revenue,
      outstandingMoney,
      reliance,
      buckets,
      debtors,
      payers,
      ranked: rankProducts(data.products, {
        metric,
        direction,
        limit: PRODUCT_RANK_LIMIT,
        catalogLabels: direction === "slow" ? data.catalogLabels : undefined,
      }),
      days: busiestDays(inRange),
    };
  }, [data, range, now, metric, direction]);

  if (loadError !== null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.pad}>
          <Text style={styles.title}>Reports</Text>
          <LoadError
            what="your reports"
            detail={loadError}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!data || !view) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
        </View>
      </SafeAreaView>
    );
  }

  const relianceBars: Bar[] = view.reliance.points.map((p) => ({
    label: p.label,
    value: p.percent,
    tone:
      p.percent === null ? undefined : SEVERITY_TONES[relianceSeverity(p.percent)],
  }));

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom },
        ]}
      >
        <Text style={styles.title}>Reports</Text>

        <View style={styles.toggleRow}>
          {RANGES.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: range === option.key }}
              onPress={() => setRange(option.key)}
              style={[
                styles.toggle,
                range === option.key && styles.toggleOn,
              ]}
            >
              <Text
                style={[
                  styles.toggleLabel,
                  range === option.key && styles.toggleLabelOn,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* The two headline figures are on DIFFERENT CLOCKS, and the spec
            locks that: revenue follows the toggle, outstanding never does.
            Debt is a standing balance, not something that happens in a
            period — ranging it would either hide old unpaid debt or produce
            a meaningless number. Both are labelled so they can never be read
            as the same kind of thing, and outstanding legitimately exceeding
            a period's revenue is normal, not an error. */}
        <View style={styles.headlines}>
          <View style={[styles.headline, styles.headlineGreen]}>
            <Text style={styles.headlineLabel}>Revenue</Text>
            <Text style={[styles.headlineValue, { color: colors.green }]}>
              {formatMoney(view.revenue)}
            </Text>
            <Text style={styles.headlineWhen}>{active.phrase}</Text>
          </View>
          <View style={[styles.headline, styles.headlineAmber]}>
            <Text style={styles.headlineLabel}>Outstanding</Text>
            <Text style={[styles.headlineValue, { color: colors.amber }]}>
              {formatMoney(view.outstandingMoney)}
            </Text>
            <Text style={styles.headlineWhen}>owed now · all time</Text>
          </View>
        </View>
        <Text style={styles.emptiesLine}>
          {view.outstandingMoney > 0 || data.emptiesOwed > 0
            ? `${data.emptiesOwed} ${data.emptiesOwed === 1 ? "empty" : "empties"} also owed (all time)`
            : "Nothing owed to you right now."}
        </Text>

        {/* ---- Collections ---- */}
        <SectionHeading label="Collections" tone={colors.amber} />

        <Card>
          <CardTitle
            title="Credit reliance"
            sub={
              range === "today"
                ? "Shown across this week — a single day is not a trend"
                : `Share of sales taken on credit, ${active.phrase}`
            }
          />
          {view.reliance.average === null ? (
            <Text style={styles.quiet}>No sales recorded yet.</Text>
          ) : (
            <Text
              style={[
                styles.bigStat,
                { color: SEVERITY_TONES[relianceSeverity(view.reliance.average)] },
              ]}
            >
              {Math.round(view.reliance.average)}% on credit
            </Text>
          )}
          <BarChart
            bars={relianceBars}
            formatValue={(v) => `${Math.round(v)}%`}
            emptyLabel="No sales to measure yet."
          />
        </Card>

        <Card>
          <CardTitle title="Top debtors" sub="Owed right now · all time" />
          {view.debtors.length === 0 ? (
            <Text style={styles.quiet}>Nobody owes you money right now.</Text>
          ) : (
            view.debtors.map((debtor) => (
              <Pressable
                key={debtor.customerId}
                accessibilityRole="button"
                accessibilityLabel={`${debtor.customerName}, owes ${formatMoney(debtor.totalOutstanding)}`}
                onPress={() =>
                  navigation.navigate("CustomerHistory", {
                    customerId: debtor.customerId,
                    customerName: debtor.customerName,
                  })
                }
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={styles.rowName} numberOfLines={1}>
                  {debtor.customerName}
                </Text>
                {debtor.urgency === "overdue" && (
                  <Text style={styles.overdueTag}>overdue</Text>
                )}
                <Text style={styles.rowAmount}>
                  {formatMoney(debtor.totalOutstanding)}
                </Text>
                <Ionicons name="chevron-forward" size={15} color={colors.muted} />
              </Pressable>
            ))
          )}
        </Card>

        <Card>
          <CardTitle
            title="What it is owed for"
            sub="Cylinder debt also leaves empties out there"
          />
          <ProportionBar
            slices={data.commodityDebt.map((c) => ({
              label: COMMODITY_LABELS[c.commodity] ?? c.commodity,
              value: c.amount,
              tone: COMMODITY_TONES[c.commodity] ?? colors.muted,
            }))}
            formatValue={formatMoney}
          />
        </Card>

        <Card>
          <CardTitle
            title="Settle speed"
            sub="How long their finished debts took, and where they stand now"
          />
          {view.payers.length === 0 ? (
            <Text style={styles.quiet}>
              No credit history yet — this fills in as debts are settled.
            </Text>
          ) : (
            view.payers.map((payer) => (
              <View key={payer.customerId} style={styles.payer}>
                <View style={styles.payerTop}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {payer.customerName}
                  </Text>
                  <StandingPill owesNow={payer.owesNow} overdue={payer.overdue} />
                </View>
                {/* Two separate signals, never blended (spec §4.6): how fast
                    they have historically settled, and where they stand
                    today. A fast historical payer can be overdue this month
                    and a slow one can owe nothing — merging them into a
                    single score would hide exactly the distinction worth
                    acting on. */}
                <Text style={styles.payerMeta}>
                  {payer.avgDays === null ? (
                    <Text style={styles.noHistory}>No settled debts yet</Text>
                  ) : (
                    <Text
                      style={
                        payer.avgDays >= SLOW_PAYER_DAYS ? styles.slow : undefined
                      }
                    >
                      Usually {Math.round(payer.avgDays)} days to clear
                    </Text>
                  )}
                  {payer.settledCount > 0
                    ? ` · from ${payer.settledCount} settled`
                    : ""}
                  {` · ${payer.purchases} ${payer.purchases === 1 ? "purchase" : "purchases"}`}
                </Text>
              </View>
            ))
          )}
        </Card>

        {/* ---- Business health ---- */}
        <SectionHeading label="Business health" tone={colors.blue} />

        <Card>
          <CardTitle
            title={direction === "best" ? "Best sellers" : "Slow movers"}
            sub={`By ${metric === "qty" ? "units sold" : "revenue"}, ${active.phrase}`}
          />
          <View style={styles.smallToggles}>
            <MiniToggle
              options={[
                { key: "best", label: "Best" },
                { key: "slow", label: "Slow" },
              ]}
              value={direction}
              onChange={(v) => setDirection(v as Direction)}
            />
            <MiniToggle
              options={[
                { key: "qty", label: "Qty" },
                { key: "revenue", label: "Revenue" },
              ]}
              value={metric}
              onChange={(v) => setMetric(v as Metric)}
            />
          </View>
          {view.ranked.length === 0 ? (
            <Text style={styles.quiet}>Nothing sold {active.phrase}.</Text>
          ) : (
            view.ranked.map((product) => (
              <View key={product.label} style={styles.row}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {product.label}
                </Text>
                <Text style={styles.rowAmount}>
                  {metric === "qty"
                    ? `${product.qty} sold`
                    : formatMoney(product.revenue)}
                </Text>
              </View>
            ))
          )}
          {/* Both lenses are offered because they disagree, and the
              disagreement is the point: airtime sells constantly at low
              value, a big cylinder rarely at high value. Neither is profit. */}
        </Card>

        <Card>
          <CardTitle title="Busiest days" sub={`Sales per day, ${active.phrase}`} />
          <BarChart
            bars={view.days.map((d) => ({ label: d.label, value: d.count }))}
            emptyLabel={`No sales ${active.phrase}.`}
          />
        </Card>

        {/* The honest footer is a shipping requirement, not decoration
            (spec §6). It keeps "no fiction" visible in the UI itself. */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            These are revenue and cash-flow figures from your own records —
            not profit. What you paid for your stock is not recorded anywhere
            in this app, so profit cannot be worked out from it, and nothing
            here is a guess.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StandingPill({
  owesNow,
  overdue,
}: {
  owesNow: number;
  overdue: boolean;
}) {
  if (owesNow <= 0) {
    return (
      <View style={[styles.pill, { backgroundColor: colors.greenBg }]}>
        <Text style={[styles.pillText, { color: colors.green }]}>clear</Text>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: overdue ? colors.overpaidBg : colors.amberBg },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          { color: overdue ? colors.overpaid : colors.amber },
        ]}
      >
        {overdue ? "overdue now" : "owes now"} · {formatMoney(owesNow)}
      </Text>
    </View>
  );
}

function MiniToggle({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={styles.mini}>
      {options.map((option) => (
        <Pressable
          key={option.key}
          accessibilityRole="button"
          accessibilityState={{ selected: value === option.key }}
          onPress={() => onChange(option.key)}
          style={[styles.miniItem, value === option.key && styles.miniItemOn]}
        >
          <Text
            style={[
              styles.miniLabel,
              value === option.key && styles.miniLabelOn,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SectionHeading({ label, tone }: { label: string; tone: string }) {
  return (
    <View style={styles.heading}>
      <View style={[styles.headingAccent, { backgroundColor: tone }]} />
      <Text style={styles.headingLabel}>{label}</Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function CardTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={styles.cardTitle}>
      <Text style={styles.cardTitleText}>{title}</Text>
      <Text style={styles.cardSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  pad: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  title: { fontSize: 26, fontWeight: "700", color: colors.ink },
  toggleRow: { flexDirection: "row", gap: 8 },
  toggle: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.neutral,
    borderWidth: 1,
    borderColor: colors.line,
  },
  toggleOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  toggleLabel: { fontSize: 14, fontWeight: "700", color: colors.ink },
  toggleLabelOn: { color: colors.white },
  headlines: { flexDirection: "row", gap: 12 },
  headline: { flex: 1, borderRadius: cardRadius, padding: 14, gap: 2 },
  headlineGreen: { backgroundColor: colors.greenBg },
  headlineAmber: { backgroundColor: colors.amberBg },
  headlineLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.muted,
    textTransform: "uppercase",
  },
  headlineValue: { fontSize: 22, fontWeight: "800" },
  headlineWhen: { fontSize: 11, color: colors.muted },
  emptiesLine: { fontSize: 13, color: colors.muted },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  headingAccent: { width: 4, height: 18, borderRadius: 2 },
  headingLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.ink,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: cardRadius,
    padding: 14,
    gap: 10,
  },
  cardTitle: { gap: 2 },
  cardTitleText: { fontSize: 16, fontWeight: "700", color: colors.ink },
  cardSub: { fontSize: 12, color: colors.mutedLight },
  bigStat: { fontSize: 20, fontWeight: "800" },
  quiet: { fontSize: 13, lineHeight: 18, color: colors.mutedLight },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: touchTarget,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  rowName: { flex: 1, fontSize: 15, color: colors.ink },
  rowAmount: { fontSize: 15, fontWeight: "700", color: colors.ink },
  overdueTag: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.overpaid,
    textTransform: "uppercase",
  },
  payer: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  payerTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  payerMeta: { fontSize: 12, color: colors.muted },
  noHistory: { fontStyle: "italic", color: colors.mutedLight },
  slow: { fontWeight: "700", color: colors.amber },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: "700" },
  smallToggles: { flexDirection: "row", gap: 8 },
  mini: {
    flexDirection: "row",
    borderRadius: 8,
    backgroundColor: colors.neutral,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  miniItem: { paddingHorizontal: 12, paddingVertical: 8 },
  miniItemOn: { backgroundColor: colors.blue },
  miniLabel: { fontSize: 12, fontWeight: "700", color: colors.ink },
  miniLabelOn: { color: colors.white },
  footer: {
    backgroundColor: colors.neutral,
    borderRadius: cardRadius,
    padding: 14,
    marginTop: 8,
  },
  footerText: { fontSize: 12, lineHeight: 18, color: colors.muted },
  pressed: { opacity: 0.6 },
});

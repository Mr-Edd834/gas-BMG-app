import { getDb } from "../client";
import { liveSale, liveRepayment, liveEmptyReturn } from "./corrections";

import { debtPrincipal } from "../../debts/rules";
import { listSales, type SaleRecord } from "./sales";

// Two-directional histories: money and cylinders moving out to customers and
// coming back. Both are DERIVED from sales, repayments and empty_returns —
// there is no ledger table, because a ledger that is stored can disagree with
// the events it claims to summarise (G1).
//
// This file serves two screens with the same idea at different scopes:
//   - one customer's account (the dispute-settling view), and
//   - the global record the Debts spec §6 requires.

// ---------------------------------------------------------------------------
// ONE CUSTOMER'S ACCOUNT
// ---------------------------------------------------------------------------

export type AccountEvent =
  | {
      kind: "sale";
      id: string;
      at: string;
      sale: SaleRecord;
      goodsTotal: number;
      credit: number;
    }
  | {
      kind: "repayment";
      id: string;
      at: string;
      amount: number;
      staffName: string;
      // WHICH debt this paid. A repayment without its referent is just a
      // number on a day; with it, it is evidence about a specific sale.
      againstSaleId: string;
      againstDescription: string;
      againstSoldAt: string;
    }
  | {
      kind: "empty-return";
      id: string;
      at: string;
      qty: number;
      brand: string;
      size: string;
      staffName: string;
      againstSaleId: string;
      againstSoldAt: string;
    };

/**
 * Everything that has passed between the shop and one customer, newest first.
 *
 * This is the screen that settles an argument. A customer claiming they paid
 * is answered by showing the whole relationship in time order — what they
 * took, what came back, and when — rather than by asserting an absence from
 * another tab. The absence becomes visible in context.
 */
export async function loadCustomerAccount(
  businessId: string,
  customerId: string,
  limit = 40,
  offset = 0
): Promise<{ events: AccountEvent[] }> {
  const db = await getDb();

  // A cancelled sale is left out of the statement entirely — Edd's call, and
  // the right one: the Sales Record is where the crossed-out original is kept
  // for evidence, and a customer's own page is the one she hands across a
  // counter. Two versions of the same purchase on it would invite the exact
  // argument the page exists to end.
  //
  // It is filtered HERE, in the page query, rather than being dropped after
  // the rows come back. Dropping it later looked identical on screen and hid a
  // real fault: a page asking for 40 events that renders 37 makes the screen
  // read "fewer than a full page" as "that is the end of the history", so it
  // stops loading older entries. The same silent truncation this statement was
  // rewritten to get rid of.
  //
  // WHICH events belong on this page, decided in SQL across all three tables
  // at once.
  //
  // This replaces loading the customer's newest 500 sales and merging in
  // JavaScript. That version silently lost history: past the ceiling, older
  // events were simply absent and nothing said so. Harmless for a named
  // customer, fatal for the Quick Sale tab, which collects every walk-in and
  // would reach 500 in under two months and then quietly stop showing the
  // beginning of its own record.
  //
  // It has to be done in the database rather than by merging three JS arrays,
  // for the same reason the refilling record does: page one of a JS merge is
  // "the newest 40 sales AND the newest 40 repayments AND the newest 40
  // returns, interleaved", so a customer with 40 sales before their first
  // repayment could have that repayment fall outside every page. LIMIT/OFFSET
  // has to walk the true combined sequence.
  //
  // The id is a tiebreak, because a sale and the repayment settling it can
  // share a timestamp to the second, and an unstable sort under pagination
  // shows some rows twice and skips others.
  const page = await db.getAllAsync<{
    id: string;
    kind: "sale" | "repayment" | "empty-return";
    at: string;
  }>(
    `SELECT ev.id, ev.kind, ev.at FROM (
       SELECT s.id AS id, 'sale' AS kind, s.sold_at AS at
       FROM sales s
       WHERE s.business_id = ? AND s.customer_id = ?
         AND ${liveSale("s")}
       UNION ALL
       SELECT r.id, 'repayment', r.paid_at
       FROM repayments r
       WHERE r.business_id = ? AND r.customer_id = ?
         AND ${liveRepayment("r")}
       UNION ALL
       SELECT er.id, 'empty-return', er.returned_at
       FROM empty_returns er
       WHERE er.business_id = ? AND er.customer_id = ?
         AND ${liveEmptyReturn("er")}
     ) ev
     ORDER BY ev.at DESC, ev.id DESC
     LIMIT ? OFFSET ?`,
    businessId,
    customerId,
    businessId,
    customerId,
    businessId,
    customerId,
    limit,
    offset
  );

  if (page.length === 0) {
    return { events: [] };
  }

  const saleIds = page.filter((e) => e.kind === "sale").map((e) => e.id);
  const repaymentIds = page.filter((e) => e.kind === "repayment").map((e) => e.id);
  const returnIds = page.filter((e) => e.kind === "empty-return").map((e) => e.id);

  // Only this page's sales, still through the shared path so items, photos and
  // empties attach exactly as they do in the global record.
  const sales =
    saleIds.length === 0
      ? []
      : await listSales({ businessId, customerId, saleIds }, saleIds.length, 0);

  const repayments =
    repaymentIds.length === 0
      ? []
      : await db.getAllAsync<{
          id: string;
          amount: number;
          paid_at: string;
          sale_id: string;
          staff_name: string | null;
        }>(
          `SELECT r.id, r.amount, r.paid_at, r.sale_id, st.name AS staff_name
           FROM repayments r
           LEFT JOIN staff st ON st.id = r.staff_id
           WHERE r.id IN (${repaymentIds.map(() => "?").join(",")})`,
          ...repaymentIds
        );

  const returns =
    returnIds.length === 0
      ? []
      : await db.getAllAsync<{
          id: string;
          qty: number;
          returned_at: string;
          sale_id: string;
          brand: string | null;
          size: string | null;
          staff_name: string | null;
        }>(
          `SELECT er.id, er.qty, er.returned_at, si.sale_id,
                  si.brand_or_supplier AS brand, si.size_or_denomination AS size,
                  st.name AS staff_name
           FROM empty_returns er
           JOIN sale_items si ON si.id = er.sale_item_id
           LEFT JOIN staff st ON st.id = er.staff_id
           WHERE er.id IN (${returnIds.map(() => "?").join(",")})`,
          ...returnIds
        );

  // Description lookup, so a repayment or return can name the sale it settles.
  const describe = new Map<string, { description: string; soldAt: string }>();
  for (const s of sales) {
    describe.set(s.id, {
      description: s.items.map((i) => `${i.label} ×${i.qty}`).join(", "),
      soldAt: s.soldAt,
    });
  }

  // A repayment on this page usually settles a sale from an EARLIER page —
  // that is the normal case, since a debt is taken before it is paid. Without
  // this, every such row would read "a sale" instead of naming what was
  // bought, which is precisely the detail that settles an argument.
  const missing = [
    ...new Set(
      [...repayments.map((r) => r.sale_id), ...returns.map((r) => r.sale_id)]
    ),
  ].filter((id) => !describe.has(id));

  if (missing.length > 0) {
    const refs = await db.getAllAsync<{
      id: string;
      sold_at: string;
      description: string;
    }>(
      `SELECT s.id, s.sold_at,
              COALESCE(GROUP_CONCAT(i.label || ' x' || i.qty, ', '), '') AS description
       FROM sales s
       LEFT JOIN sale_items i ON i.sale_id = s.id
       WHERE s.id IN (${missing.map(() => "?").join(",")})
       GROUP BY s.id`,
      ...missing
    );
    for (const ref of refs) {
      describe.set(ref.id, {
        description: ref.description,
        soldAt: ref.sold_at,
      });
    }
  }

  const events: AccountEvent[] = [];

  for (const s of sales) {
    const goodsTotal = s.items.reduce(
      (sum, i) => sum + Math.round(i.qty * i.unitPrice),
      0
    );
    events.push({
      kind: "sale",
      id: s.id,
      at: s.soldAt,
      sale: s,
      goodsTotal,
      credit: debtPrincipal(s.items, s.cashAmount),
    });
  }

  for (const r of repayments) {
    const ref = describe.get(r.sale_id);
    events.push({
      kind: "repayment",
      id: r.id,
      at: r.paid_at,
      amount: r.amount,
      staffName: r.staff_name ?? "",
      againstSaleId: r.sale_id,
      againstDescription: ref?.description ?? "a sale",
      againstSoldAt: ref?.soldAt ?? r.paid_at,
    });
  }

  for (const er of returns) {
    const ref = describe.get(er.sale_id);
    events.push({
      kind: "empty-return",
      id: er.id,
      at: er.returned_at,
      qty: er.qty,
      brand: er.brand ?? "Unknown",
      size: er.size ?? "",
      staffName: er.staff_name ?? "",
      againstSaleId: er.sale_id,
      againstSoldAt: ref?.soldAt ?? er.returned_at,
    });
  }

  // Newest first. String compare is correct here because every timestamp is
  // stored as ISO-8601, which sorts lexicographically the same as it does
  // chronologically — one of the reasons that format was chosen.
  events.sort((a, b) => b.at.localeCompare(a.at));

  // Deliberately no running "owed" or "repaid so far" total.
  //
  // It used to return both, summed over every event it had loaded. Now that
  // this is one page, that sum would describe the page rather than the
  // customer — and a balance that silently means "of what has scrolled into
  // view" is worse than no balance at all. Edd had the summary removed from
  // this screen anyway; Debts is where a balance belongs, computed over
  // everything.
  return { events };
}

// ---------------------------------------------------------------------------
// THE GLOBAL RECORD (spec Part C §2 §6)
// ---------------------------------------------------------------------------

export type LedgerDirection = "out" | "in";

export interface LedgerEntry {
  id: string;
  at: string;
  direction: LedgerDirection;
  customerName: string;
  // Money in KSh, or a count of cylinders, depending on which ledger.
  value: number;
  // What it was, on its own line — commodity and quantity for a taking, the
  // sale being settled for a repayment or return. The spec requires this line
  // never be clipped, which is why rows are multi-line.
  detail: string;
  tag: string;
  staffName: string;
}

const GOODS_JOIN = `
  LEFT JOIN (
    SELECT sale_id, SUM(CAST(ROUND(qty * unit_price) AS INTEGER)) AS total
    FROM sale_items GROUP BY sale_id
  ) goods ON goods.sale_id = s.id`;

/**
 * Every credit taken and every repayment, interleaved strictly by time.
 *
 * NOT grouped by customer — the spec is emphatic about that, and the reason is
 * that the record's job is to show the true sequence of events. Musa's Tuesday
 * credit belongs between two of Wanjiru's payments if that is when it happened.
 *
 * The UNION happens in SQL rather than by merging two arrays in JS so that
 * pagination is correct: merging pages client-side would let an older event
 * from one source jump ahead of a newer one from the other.
 */
export async function listMoneyLedger(
  businessId: string,
  search: string,
  limit = 40,
  offset = 0
): Promise<LedgerEntry[]> {
  const db = await getDb();
  const like = `%${search.trim().toLowerCase()}%`;
  const filtered = search.trim().length > 0;

  const rows = await db.getAllAsync<{
    kind: string;
    id: string;
    at: string;
    customer_name: string;
    value: number;
    sale_id: string;
    staff_name: string | null;
  }>(
    `SELECT * FROM (
       SELECT 'credit-taken' AS kind, s.id AS id, s.sold_at AS at,
              c.name AS customer_name,
              (COALESCE(goods.total, 0) - s.cash_amount) AS value,
              s.id AS sale_id, st.name AS staff_name
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN staff st ON st.id = s.staff_id
       ${GOODS_JOIN}
       WHERE s.business_id = ? AND ${liveSale("s")}
         AND (COALESCE(goods.total, 0) - s.cash_amount) > 0
         AND (? = 0 OR LOWER(c.name) LIKE ?)
       UNION ALL
       SELECT 'repayment', r.id, r.paid_at, c.name, r.amount, r.sale_id,
              st.name
       FROM repayments r
       JOIN customers c ON c.id = r.customer_id
       LEFT JOIN staff st ON st.id = r.staff_id
       WHERE r.business_id = ? AND ${liveRepayment("r")}
         AND (? = 0 OR LOWER(c.name) LIKE ?)
     )
     ORDER BY at DESC
     LIMIT ? OFFSET ?`,
    businessId,
    filtered ? 1 : 0,
    like,
    businessId,
    filtered ? 1 : 0,
    like,
    limit,
    offset
  );

  const descriptions = await describeSales(
    db,
    rows.map((r) => r.sale_id)
  );

  return rows.map((r) => {
    const ref = descriptions.get(r.sale_id);
    const taken = r.kind === "credit-taken";
    return {
      id: `${r.kind}:${r.id}`,
      at: r.at,
      direction: taken ? "out" : "in",
      customerName: r.customer_name,
      value: r.value,
      detail: taken
        ? (ref?.description ?? "")
        : `against ${ref?.description ?? "a sale"}`,
      tag: taken ? "credit taken" : "repaid",
      staffName: r.staff_name ?? "",
    };
  });
}

/**
 * Every empty taken and every empty returned, interleaved by time.
 *
 * The "taken" side is the shortfall at the moment of sale — cylinders bought
 * minus any empty handed straight back over the counter.
 */
export async function listEmptiesLedger(
  businessId: string,
  search: string,
  limit = 40,
  offset = 0
): Promise<LedgerEntry[]> {
  const db = await getDb();
  const like = `%${search.trim().toLowerCase()}%`;
  const filtered = search.trim().length > 0;

  const rows = await db.getAllAsync<{
    kind: string;
    id: string;
    at: string;
    customer_name: string;
    value: number;
    brand: string | null;
    size: string | null;
    staff_name: string | null;
  }>(
    `SELECT * FROM (
       SELECT 'taken' AS kind, si.id AS id, s.sold_at AS at,
              c.name AS customer_name,
              (si.qty - COALESCE(si.empties_returned, 0)) AS value,
              si.brand_or_supplier AS brand,
              si.size_or_denomination AS size,
              st.name AS staff_name
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN staff st ON st.id = s.staff_id
       WHERE si.business_id = ? AND si.commodity_type = 'cylinder'
         AND ${liveSale("s")}
         AND (si.qty - COALESCE(si.empties_returned, 0)) > 0
         AND (? = 0 OR LOWER(c.name) LIKE ?)
       UNION ALL
       SELECT 'returned', er.id, er.returned_at, c.name, er.qty,
              si.brand_or_supplier, si.size_or_denomination, st.name
       FROM empty_returns er
       JOIN sale_items si ON si.id = er.sale_item_id
       JOIN customers c ON c.id = er.customer_id
       LEFT JOIN staff st ON st.id = er.staff_id
       WHERE er.business_id = ? AND ${liveEmptyReturn("er")}
         AND (? = 0 OR LOWER(c.name) LIKE ?)
     )
     ORDER BY at DESC
     LIMIT ? OFFSET ?`,
    businessId,
    filtered ? 1 : 0,
    like,
    businessId,
    filtered ? 1 : 0,
    like,
    limit,
    offset
  );

  return rows.map((r) => {
    const taken = r.kind === "taken";
    const what = `${r.brand ?? "Unknown"} · ${r.size ?? ""}`.trim();
    return {
      id: `${r.kind}:${r.id}`,
      at: r.at,
      direction: taken ? "out" : "in",
      customerName: r.customer_name,
      value: r.value,
      detail: taken ? `${what} cylinder` : `${what} brought back`,
      tag: taken ? "taken" : "returned",
      staffName: r.staff_name ?? "",
    };
  });
}

// Item summaries for a set of sales, used to give every ledger row its
// "what it was" line.
async function describeSales(
  db: Awaited<ReturnType<typeof getDb>>,
  saleIds: string[]
): Promise<Map<string, { description: string }>> {
  const unique = [...new Set(saleIds)].filter(Boolean);
  const out = new Map<string, { description: string }>();
  if (unique.length === 0) return out;

  const placeholders = unique.map(() => "?").join(",");
  const rows = await db.getAllAsync<{
    sale_id: string;
    label: string;
    qty: number;
  }>(
    `SELECT sale_id, label, qty FROM sale_items
     WHERE sale_id IN (${placeholders})
     ORDER BY created_at ASC`,
    ...unique
  );

  const bySale = new Map<string, string[]>();
  for (const r of rows) {
    const list = bySale.get(r.sale_id) ?? [];
    list.push(`${r.label} ×${r.qty}`);
    bySale.set(r.sale_id, list);
  }
  for (const [id, parts] of bySale) {
    out.set(id, { description: parts.join(", ") });
  }
  return out;
}

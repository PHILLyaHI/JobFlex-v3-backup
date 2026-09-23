// THE INVENTORY BOARD, READ ONCE (2026-09-22) — every derivation behind the
// roofing inventory redesign, shared by the desktop preview
// (roof-inventory.tsx, /dashboard/roof-estimator/board/claude) and its
// handheld twin (mobile-roof-inventory-claude, /mobile-roof-inventory-v1).
//
// Pure: no React, no server calls. It reads the same TradeBoardData +
// StockFacts the live board reads and answers the same questions the live
// board answers (trade-board.tsx, 2026-09-20) — the rules, the thresholds and
// the wording of every figure are lifted from there unchanged, so the redesign
// changes how the page looks and reads, never what it says. The writes stay in
// actions/inventory and actions/inventoryLink; the UIs call them directly.

import type { Route } from "next";
import type { BoardOrder, BoardProposal, BoardSupplier, TradeBoardData } from "@/lib/inventoryBoard";
import type { ItemFacts, NextLoad, StockFacts, StockMove } from "@/lib/inventoryDashboard";
import { groupByCategory } from "@/lib/inventoryCategories";
import { pickList, TRADES, type PickRow, type StockRow, type TradeId } from "@/lib/inventory";

// ── formatting ──────────────────────────────────────────────────────────────

export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const usdShort = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 10_000 ? `$${Math.round(n / 1000)}k` : usd(n));
export const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export function ago(iso: string): string {
  const m = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  if (m < 60 * 24 * 30) return `${Math.round(m / 60 / 24)}d ago`;
  return `${Math.round(m / 60 / 24 / 30)}mo ago`;
}
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", SENT: "Sent", VIEWED: "Viewed", ACCEPTED: "Sold", COMPLETED: "Completed", PAID: "Paid", DECLINED: "Declined" };
export const OPEN_STATUSES: ReadonlySet<string> = new Set(["DRAFT", "SENT", "VIEWED"]);

/** One vocabulary for every coloured mark on both builds. `none` = neutral ink. */
export type Tone = "bad" | "warn" | "ok" | "info" | "blue" | "none";

// ── one stock row ───────────────────────────────────────────────────────────

/** Where a row stands, most urgent first. */
export type RowState = "soldshort" | "low" | "short" | "reserved" | "stocked" | "empty";
export const STATE_ORDER: Record<RowState, number> = { soldshort: 0, low: 1, short: 2, reserved: 3, stocked: 4, empty: 5 };
export const NEEDS_ORDER: ReadonlySet<RowState> = new Set<RowState>(["soldshort", "low", "short"]);

export function stateOf(r: StockRow): RowState {
  if (r.available < 0) return "soldshort";
  if (r.low) return "low";
  if (r.short > 0) return "short";
  if (r.reserved > 0 || r.forecast > 0) return "reserved";
  if (r.onHand > 0) return "stocked";
  return "empty";
}

/** The status plate's words and tone. */
export function plateOf(r: StockRow, st: RowState): { text: string; tone: Tone } {
  if (st === "soldshort") return { text: `Short ${qty(-r.available)} for sold jobs`, tone: "bad" };
  if (st === "low") return { text: `Low · order ${r.suggestedOrder}`, tone: "warn" };
  if (st === "short") return { text: `Short ${qty(r.short)} if all sell`, tone: "warn" };
  if (st === "empty") return { text: "Not stocked", tone: "none" };
  return { text: "OK", tone: "ok" };
}

export type LedgerRow = {
  r: StockRow;
  st: RowState;
  /** On the shelf, nothing against it, nothing taken out in the window. */
  idle: boolean;
  fact: ItemFacts | undefined;
  /** Days the free stock lasts at the window's pace; null when there is no pace. */
  daysLeft: number | null;
};

/**
 * The stock bar as percentages of one scale: reserved (sold work) and free
 * split the on-hand, a deficit runs past it when sold work wants more than
 * the shelf holds, the forecast (open proposals) runs beyond that, and the
 * reorder line is a tick.
 */
export type StockBar = { reserved: number; free: number; freeLeft: number; deficit: number; deficitLeft: number; forecast: number; forecastLeft: number; line: number | null; freeWarn: boolean };
export function stockBar(r: StockRow, st: RowState): StockBar {
  const scale = Math.max(r.onHand, r.reserved + r.forecast, r.threshold, 1);
  const pct = (n: number) => Math.max(0, Math.min(100, (n / scale) * 100));
  const res = Math.min(r.reserved, r.onHand);
  const free = Math.max(0, r.available);
  const deficit = Math.max(0, r.reserved - r.onHand);
  const fcStart = Math.max(r.onHand, r.reserved);
  const fcBeyond = Math.max(0, r.reserved + r.forecast - fcStart);
  return {
    reserved: pct(res),
    free: pct(free),
    freeLeft: pct(res),
    deficit: pct(deficit),
    deficitLeft: pct(r.onHand),
    forecast: pct(fcBeyond),
    forecastLeft: pct(fcStart),
    line: r.threshold > 0 ? pct(r.threshold) : null,
    freeWarn: st === "low" || st === "short",
  };
}

// ── movements ───────────────────────────────────────────────────────────────

export function moveKind(m: StockMove): { label: string; tone: Tone; sign: string } {
  const sign = m.quantity > 0 ? "+" : m.quantity < 0 ? "−" : "";
  if (m.kind === "RECEIVED") return { label: "Received", tone: "ok", sign };
  if (m.kind === "PICKED") return { label: "Loaded", tone: "none", sign };
  if (m.kind === "USED") return { label: "Used", tone: "none", sign };
  if (m.kind === "RETURNED") return { label: "Returned", tone: "blue", sign };
  if (m.note === "Counted") return { label: "Counted", tone: "blue", sign };
  return { label: "Adjusted", tone: "none", sign };
}

// ── proposals ───────────────────────────────────────────────────────────────

/** What the shelf says about one proposal's materials. */
export function materialsOf(p: BoardProposal, rows: readonly StockRow[]): { text: string; tone: Tone } {
  if (!p.linked) return { text: "estimate only — nothing reserved", tone: "none" };
  if (p.status === "ACCEPTED" && p.loaded) return { text: "Loaded", tone: "ok" };
  if (!OPEN_STATUSES.has(p.status) && p.status !== "ACCEPTED") return { text: "—", tone: "none" };
  const pick = pickList(rows, p.lines);
  if (!pick.length) return { text: "no material lines", tone: "none" };
  const tracked = pick.filter((x) => x.itemId);
  const short = tracked.filter((x) => !x.enough).length;
  const untracked = pick.length - tracked.length;
  if (!tracked.length) return { text: `${plural(pick.length, "line")} · none tracked yet`, tone: "none" };
  if (p.status === "ACCEPTED") {
    if (short) return { text: `${short} of ${plural(pick.length, "line")} short`, tone: "bad" };
    return { text: `${plural(pick.length, "line")} on the shelf${untracked ? ` · ${untracked} untracked` : ""}`, tone: "ok" };
  }
  if (short) return { text: `${plural(pick.length, "line")} · ${short} short if it sells`, tone: "warn" };
  return { text: `${plural(pick.length, "line")} · shelf covers it`, tone: "ok" };
}

/** Sold first, then open, then done, then the ones not connected to the shelf. */
export const proposalRank = (p: BoardProposal) => (!p.linked ? 3 : p.status === "ACCEPTED" ? 0 : OPEN_STATUSES.has(p.status) ? 1 : 2);

export type ProposalTab = "ALL" | "OPEN" | "SOLD" | "DONE" | "OFF";
export function inProposalTab(p: BoardProposal, tab: ProposalTab): boolean {
  if (tab === "ALL") return true;
  if (tab === "OPEN") return p.linked && OPEN_STATUSES.has(p.status);
  if (tab === "SOLD") return p.linked && p.status === "ACCEPTED";
  if (tab === "DONE") return proposalRank(p) === 2;
  return !p.linked;
}
export const PROPOSAL_TABS: ReadonlyArray<{ id: ProposalTab; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "OPEN", label: "Open" },
  { id: "SOLD", label: "Sold" },
  { id: "DONE", label: "Done" },
  { id: "OFF", label: "Not connected" },
];

// ── the ledger's filters ────────────────────────────────────────────────────

export type StockFilter = "ALL" | "ORDER" | "RESERVED" | "STOCKED" | "IDLE" | "EMPTY";
export type LedgerView = "urgency" | "category";
export const STOCK_FILTERS: ReadonlyArray<{ id: StockFilter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "ORDER", label: "Needs ordering" },
  { id: "RESERVED", label: "On sold jobs" },
  { id: "STOCKED", label: "In stock" },
  { id: "IDLE", label: "Idle" },
  { id: "EMPTY", label: "Not stocked" },
];

export function inStockFilter(x: LedgerRow, f: StockFilter): boolean {
  if (f === "ALL") return true;
  if (f === "ORDER") return NEEDS_ORDER.has(x.st);
  if (f === "RESERVED") return x.r.reserved > 0;
  if (f === "STOCKED") return x.r.onHand > 0;
  if (f === "IDLE") return x.idle;
  return x.st === "empty";
}

/**
 * The rows a ledger shows for a filter, a search and a view. In the plain
 * list the untouched standard items (nothing on hand, nothing against them)
 * fold under one line until asked for; by shelf, the same rows sit under
 * category headers with urgency kept inside each.
 */
export function ledgerRows(board: Board, opts: { filter: StockFilter; query: string; view: LedgerView; showEmpty: boolean }) {
  const needle = opts.query.trim().toLowerCase();
  const matches = (x: LedgerRow) => !needle || x.r.name.toLowerCase().includes(needle) || (x.r.supplierName ?? "").toLowerCase().includes(needle);
  const listed = board.rows.filter((x) => inStockFilter(x, opts.filter) && matches(x));
  const folding = opts.filter === "ALL" && !needle && !opts.showEmpty;
  const folded = folding ? listed.filter((x) => x.st === "empty") : [];
  const shown = folding ? listed.filter((x) => x.st !== "empty") : listed;
  const sections: Array<{ label: string | null; items: LedgerRow[]; needs: number }> =
    opts.view === "category"
      ? groupByCategory(board.trade.id, shown, (x) => x.r.name).map((g) => ({ label: g.label, items: g.items, needs: g.items.filter((x) => NEEDS_ORDER.has(x.st)).length }))
      : [{ label: null, items: shown, needs: 0 }];
  /** True when the "hide the not-stocked items" line belongs under the list. */
  const canHideEmpty = opts.filter === "ALL" && !needle && opts.showEmpty && board.counts.empty > 0;
  return { sections, shown, folded, canHideEmpty, needle };
}

// ── the highlights ──────────────────────────────────────────────────────────

/** What a highlight's button does. The UI maps each kind to its handler. */
export type HighlightAction =
  | { kind: "scroll-order"; label: string; primary?: boolean }
  | { kind: "receive-order"; orderId: string; label: string; primary?: boolean }
  | { kind: "show-idle"; label: string; primary?: boolean }
  | { kind: "track-untracked"; label: string; primary?: boolean };

export type Highlight = {
  id: "next-truck" | "order-ready" | "no-supplier" | "delivery" | "idle" | "untracked";
  tone: Tone;
  /** A sprite id from the blueprint shell (`#i-…`). */
  icon: string;
  label: string;
  title: string;
  text: string;
  action?: HighlightAction;
  link?: { label: string; href: Route };
};

// ── the whole board ─────────────────────────────────────────────────────────

export type SupplierOrder = { supplierId: string; supplier: BoardSupplier | null; lines: StockRow[]; cost: number };

export type Board = {
  trade: { id: TradeId; label: string; noun: string };
  canWrite: boolean;
  /** Most urgent first, then by name. */
  rows: LedgerRow[];
  /** Rows under the reorder line or short — what "Order now" is made of. */
  needs: StockRow[];
  counts: { all: number; soldShort: number; low: number; short: number; stocked: number; reserved: number; empty: number; idle: number };
  idle: LedgerRow[];
  /** Σ on hand × last cost over the idle rows. */
  idleValue: number;
  /** "Order now", by supplier; lines with a zero suggestion are dropped. */
  bySupplier: SupplierOrder[];
  /** Lines to order with no supplier picked yet. */
  unassigned: StockRow[];
  /** What the whole "Order now" costs at last cost (0 = no costs on file). */
  orderCost: number;
  /** Supplier orders that can go out now (the supplier has an email). */
  readyOrders: SupplierOrder[];
  orders: BoardOrder[];
  /** Lines across the purchase orders on the way. */
  orderLines: number;
  /** The next sold job to load, with its pick list against the shelf. */
  next: { load: NextLoad; proposal: BoardProposal | undefined; pick: PickRow[]; short: PickRow[] } | null;
  /** At most four, most pressing first. Empty = all clear. */
  highlights: Highlight[];
  /**
   * The page's one headline — the single most important sentence about the
   * shelf. Derived from the same facts as the highlights; never new claims.
   */
  verdict: { tone: Tone; title: string; text: string };
  /** The four numbers, each with the live board's sub-line. */
  kpis: Array<{ id: "shelf" | "needs" | "way" | "load"; label: string; value: string; sub: string; tone: Tone }>;
  /** Shelf value at last cost and how complete it is. */
  value: { amount: number; valued: number; itemCount: number };
  proposals: BoardProposal[];
  proposalCounts: Record<ProposalTab, number>;
  supName: (id: string | null) => string;
};

export function readBoard(data: TradeBoardData, facts: StockFacts, canWrite: boolean): Board {
  const t = TRADES.find((x) => x.id === data.trade)!;
  const rows: LedgerRow[] = data.rows
    .map((r) => {
      const fact = facts.items[r.id];
      return {
        r,
        st: stateOf(r),
        idle: r.onHand > 0 && r.reserved === 0 && r.forecast === 0 && !((fact?.used ?? 0) > 0),
        fact,
        daysLeft: fact && fact.usedPerDay > 0 && r.available > 0 ? Math.round(r.available / fact.usedPerDay) : null,
      };
    })
    .sort((a, b) => STATE_ORDER[a.st] - STATE_ORDER[b.st] || a.r.name.localeCompare(b.r.name));

  const needs = rows.filter((x) => NEEDS_ORDER.has(x.st)).map((x) => x.r);
  const idle = rows.filter((x) => x.idle);
  const counts = {
    all: rows.length,
    soldShort: rows.filter((x) => x.st === "soldshort").length,
    low: rows.filter((x) => x.st === "low").length,
    short: rows.filter((x) => x.st === "short").length,
    stocked: rows.filter((x) => x.r.onHand > 0).length,
    reserved: rows.filter((x) => x.r.reserved > 0).length,
    empty: rows.filter((x) => x.st === "empty").length,
    idle: idle.length,
  };
  const cost = (r: StockRow) => r.suggestedOrder * (facts.items[r.id]?.lastCost ?? 0);
  const idleValue = idle.reduce((n, x) => n + x.r.onHand * (x.fact?.lastCost ?? 0), 0);
  const supName = (id: string | null) => data.suppliers.find((x) => x.id === id)?.name ?? "Supplier";

  // ── the purchase order, by supplier ──
  const groups = new Map<string, StockRow[]>();
  const unassigned: StockRow[] = [];
  for (const r of needs) {
    if (r.suggestedOrder <= 0) continue;
    if (!r.supplierId) unassigned.push(r);
    else groups.set(r.supplierId, [...(groups.get(r.supplierId) ?? []), r]);
  }
  const bySupplier: SupplierOrder[] = [...groups.entries()].map(([supplierId, lines]) => ({
    supplierId,
    supplier: data.suppliers.find((x) => x.id === supplierId) ?? null,
    lines,
    cost: lines.reduce((n, r) => n + cost(r), 0),
  }));
  const orderCost = needs.reduce((n, r) => n + cost(r), 0);
  const orderLines = data.orders.reduce((n, o) => n + o.lines.length, 0);
  const readyOrders = bySupplier.filter((g) => g.supplier?.email);

  // ── the next truck against the shelf ──
  const load = facts.nextLoads[0];
  const nextProposal = load ? data.proposals.find((p) => p.id === load.proposalId) : undefined;
  const nextPick = nextProposal ? pickList(data.rows, nextProposal.lines) : [];
  const nextShort = nextPick.filter((p) => p.itemId && !p.enough);
  const next = load ? { load, proposal: nextProposal, pick: nextPick, short: nextShort } : null;

  // ── the highlights: what to do now, most pressing first, at most four ──
  // The order buttons only scroll to controls a read-only role never gets, so
  // they are left off for that role; and none is primary — the verdict carries
  // the one blue button in the first viewport (2026-09-22).
  const hl: Highlight[] = [];
  if (load) {
    const when = load.startsAt ? dayOf(load.startsAt) : "no date yet";
    if (nextShort.length)
      hl.push({
        id: "next-truck",
        tone: "bad",
        icon: "i-jobs",
        label: "Next truck",
        title: "Next truck is short",
        text: `${load.title} · ${when} · short: ${nextShort
          .slice(0, 2)
          .map((x) => `${x.name} (need ${qty(x.quantity)}, have ${qty(x.onHand ?? 0)})`)
          .join(", ")}${nextShort.length > 2 ? ` and ${nextShort.length - 2} more` : ""}`,
        action: canWrite ? { kind: "scroll-order", label: "Order what's short" } : undefined,
        link: { label: "Open job", href: `/dashboard/jobs/${load.jobId}` as Route },
      });
    else
      hl.push({
        id: "next-truck",
        tone: "ok",
        icon: "i-jobs",
        label: "Next truck",
        title: "Next truck is covered",
        text: `${load.title} · ${when} · ${nextPick.length ? `${plural(nextPick.filter((x) => x.itemId).length, "line")} on the shelf` : "no material lines"}`,
        link: { label: "Open job", href: `/dashboard/jobs/${load.jobId}` as Route },
      });
  }
  if (readyOrders.length)
    hl.push({
      id: "order-ready",
      tone: "warn",
      icon: "i-send",
      label: "Order",
      title: "Order ready to send",
      text: `${readyOrders.map((g) => `${supName(g.supplierId)} · ${plural(g.lines.length, "line")}`).join(" · ")}${orderCost > 0 ? ` · about ${usdShort(orderCost)} at last cost` : ""}`,
      action: canWrite ? { kind: "scroll-order", label: "Review and send" } : undefined,
    });
  if (unassigned.length)
    hl.push({
      id: "no-supplier",
      tone: "warn",
      icon: "i-box",
      label: "Order",
      title: `${plural(unassigned.length, "item")} to order, no supplier`,
      text: unassigned.map((r) => r.name).slice(0, 3).join(", ") + (unassigned.length > 3 ? ` and ${unassigned.length - 3} more` : ""),
      action: canWrite ? { kind: "scroll-order", label: "Pick suppliers" } : undefined,
    });
  if (data.orders.length)
    hl.push({
      id: "delivery",
      tone: "info",
      icon: "i-clock",
      label: "Delivery",
      title: data.orders.length === 1 ? "On the way" : `${data.orders.length} orders on the way`,
      text: data.orders
        .slice(0, 2)
        .map((o) => `${o.supplier} · sent ${ago(o.sentAt)} · ${plural(o.lines.length, "line")}`)
        .join(" · "),
      action: canWrite && data.orders.length === 1 ? { kind: "receive-order", orderId: data.orders[0].id, label: "Received" } : undefined,
    });
  if (idle.length)
    hl.push({
      id: "idle",
      tone: "info",
      icon: "i-hourglass",
      label: "Idle stock",
      title: idleValue > 0 ? `${usd(idleValue)} sitting idle` : `${plural(idle.length, "item")} sitting idle`,
      text: `${idle.map((x) => x.r.name).slice(0, 3).join(", ")}${idle.length > 3 ? ` and ${idle.length - 3} more` : ""} — no job against ${idle.length === 1 ? "it" : "them"}, nothing taken out in ${facts.windowDays} days`,
      action: { kind: "show-idle", label: "Show idle" },
    });
  if (canWrite && data.untracked.length)
    hl.push({
      id: "untracked",
      tone: "info",
      icon: "i-file",
      label: "Proposals",
      title: `${plural(data.untracked.length, "proposal line")} not tracked`,
      text: data.untracked
        .slice(0, 3)
        .map((l) => l.name)
        .join(", ") + (data.untracked.length > 3 ? ` and ${data.untracked.length - 3} more` : ""),
      action: { kind: "track-untracked", label: `Add all ${data.untracked.length}` },
    });
  const highlights = hl.slice(0, 4);

  // ── the headline: one sentence, the most pressing fact ──
  const verdict: Board["verdict"] = counts.soldShort
    ? { tone: "bad", title: `${plural(counts.soldShort, "item")} short for sold jobs`, text: "Work already sold needs more than the shelf holds. Order now." }
    : nextShort.length && load
      ? { tone: "bad", title: "Next truck is short", text: `${load.title}${load.startsAt ? ` · ${dayOf(load.startsAt)}` : ""} · ${plural(nextShort.length, "line")} short` }
      : needs.length
        ? { tone: "warn", title: `${plural(needs.length, "item")} to order`, text: orderCost > 0 ? `About ${usdShort(orderCost)} at last cost` : unassigned.length ? `${plural(unassigned.length, "item")} with no supplier yet` : "No costs on file yet" }
        : rows.length === 0
          ? { tone: "none", title: "No stock tracked yet", text: `Add the ${t.label} estimator's standard items to start.` }
          : { tone: "ok", title: "The shelf covers the sold work", text: data.orders.length ? `${plural(data.orders.length, "order")} on the way` : "Nothing to order right now" };

  const soldShort = counts.soldShort;
  const kpis: Board["kpis"] = [
    {
      id: "shelf",
      label: "On the shelf",
      value: String(counts.stocked),
      sub: facts.valued > 0 ? `${usd(facts.value)} at last cost${facts.valued < facts.itemCount ? ` · ${facts.valued} of ${facts.itemCount} priced` : ""}` : `of ${plural(rows.length, "item")} · add last cost to see value`,
      tone: "none",
    },
    {
      id: "needs",
      label: "Needs ordering",
      value: String(needs.length),
      // "about $0 to order" read as free stock; with no costs on file, say so (2026-09-22).
      sub: soldShort ? `${soldShort} short for sold jobs` : needs.length ? (unassigned.length ? `${plural(unassigned.length, "item")} with no supplier yet` : orderCost > 0 ? `about ${usdShort(orderCost)} to order` : "no costs on file yet") : "all clear",
      tone: needs.length ? (soldShort ? "bad" : "warn") : "none",
    },
    {
      id: "way",
      label: "On the way",
      value: String(data.orders.length),
      sub: data.orders.length ? `${plural(orderLines, "line")} · ${[...new Set(data.orders.map((o) => o.supplier))].join(", ")}` : "nothing on order",
      tone: "none",
    },
    {
      id: "load",
      label: "To load",
      value: String(data.pipeline.sold),
      sub: load ? `${load.startsAt ? `${dayOf(load.startsAt)} · ` : ""}${nextShort.length ? `${nextShort.length} short · ` : nextPick.length ? "shelf covers it · " : ""}${load.title}` : "no sold jobs waiting",
      tone: nextShort.length ? "bad" : "none",
    },
  ];

  const proposals = [...data.proposals].sort((a, b) => proposalRank(a) - proposalRank(b));
  const proposalCounts = Object.fromEntries(PROPOSAL_TABS.map((x) => [x.id, proposals.filter((p) => inProposalTab(p, x.id)).length])) as Record<ProposalTab, number>;

  return {
    trade: t,
    canWrite,
    rows,
    needs,
    counts,
    idle,
    idleValue,
    bySupplier,
    unassigned,
    orderCost,
    readyOrders,
    orders: data.orders,
    orderLines,
    next,
    highlights,
    verdict,
    kpis,
    value: { amount: facts.value, valued: facts.valued, itemCount: facts.itemCount },
    proposals,
    proposalCounts,
    supName,
  };
}

/** The count a stock filter chip carries. */
export function filterCount(board: Board, f: StockFilter): number {
  if (f === "ALL") return board.counts.all;
  if (f === "ORDER") return board.needs.length;
  if (f === "RESERVED") return board.counts.reserved;
  if (f === "STOCKED") return board.counts.stocked;
  if (f === "IDLE") return board.counts.idle;
  return board.counts.empty;
}

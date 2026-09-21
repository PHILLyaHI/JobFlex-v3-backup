"use client";

// THE INVENTORY DASHBOARD (2026-09-20) — one component, three trades.
//
// Owner, first: "under each estimator … a board showing the proposals that
// belong to it and the inventory, what's been used, what's not, a warning
// that you need to add some inventory, who's your supplier, send them a PO."
// Then: "make kind of dashboard for inventory, smart." Then, later the same
// day: every proposal of the estimator on its board, and "more organized and
// understandable and friendly … with the highlights."
//
// The reads are lib/inventoryBoard (the shelf with the work counted against
// it, every proposal of the trade — stamped or recognized) and
// lib/inventoryDashboard (value, pace, history, the next loads); every write
// is a server action in actions/inventory and the page refreshes from the
// database after each one. Top to bottom the page answers:
//   · the four numbers — what is on the shelf and what it is worth, what
//     needs ordering, what is on the way, what is waiting to load and
//     whether the shelf covers the next truck;
//   · the highlights — up to four things to do now, each with its one
//     button: the next truck short, an order ready, a delivery to receive,
//     proposal lines not tracked, stock sitting idle;
//   · what to order now, by supplier, one tap to email it; items with no
//     supplier get one picked right there;
//   · the ledger — one row per item by urgency or by shelf (category), a
//     stock bar explained by a legend, the pace, receive / count / edit in
//     the row; untouched standard items fold under one line;
//   · what happened lately, the suppliers, and the trade's proposals — open,
//     sold and done — each saying whether the shelf covers it.

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { countStock, deleteInventoryItem, receivePurchaseOrder, receiveStock, seedTradeItems, sendPurchaseOrder, upsertInventoryItem, upsertSupplier } from "@/actions/inventory";
import { setProposalInventoryLink } from "@/actions/inventoryLink";
import type { BoardProposal, TradeBoardData } from "@/lib/inventoryBoard";
import type { ItemFacts, StockFacts, StockMove } from "@/lib/inventoryDashboard";
import { groupByCategory } from "@/lib/inventoryCategories";
import { pickList, TRADES, type StockRow } from "@/lib/inventory";
import s from "./trade-board.module.css";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const usdShort = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 10_000 ? `$${Math.round(n / 1000)}k` : usd(n));
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function ago(iso: string): string {
  const m = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  if (m < 60 * 24 * 30) return `${Math.round(m / 60 / 24)}d ago`;
  return `${Math.round(m / 60 / 24 / 30)}mo ago`;
}
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const STATUS: Record<string, string> = { DRAFT: "Draft", SENT: "Sent", VIEWED: "Viewed", ACCEPTED: "Sold", COMPLETED: "Completed", PAID: "Paid", DECLINED: "Declined" };
const OPEN = new Set(["DRAFT", "SENT", "VIEWED"]);

/** Where a row stands, most urgent first. */
type RowState = "soldshort" | "low" | "short" | "reserved" | "stocked" | "empty";
const ORDER: Record<RowState, number> = { soldshort: 0, low: 1, short: 2, reserved: 3, stocked: 4, empty: 5 };
const NEEDS = new Set<RowState>(["soldshort", "low", "short"]);
function stateOf(r: StockRow): RowState {
  if (r.available < 0) return "soldshort";
  if (r.low) return "low";
  if (r.short > 0) return "short";
  if (r.reserved > 0 || r.forecast > 0) return "reserved";
  if (r.onHand > 0) return "stocked";
  return "empty";
}
type Filter = "ALL" | "ORDER" | "RESERVED" | "STOCKED" | "IDLE" | "EMPTY";
type View = "urgency" | "category";
type PTab = "ALL" | "OPEN" | "SOLD" | "DONE" | "OFF";
type Row = { r: StockRow; st: RowState; idle: boolean };

function moveKind(m: StockMove): { label: string; cls: string; sign: string } {
  const sign = m.quantity > 0 ? "+" : m.quantity < 0 ? "−" : "";
  if (m.kind === "RECEIVED") return { label: "Received", cls: s.pOk, sign };
  if (m.kind === "PICKED") return { label: "Loaded", cls: s.pInk, sign };
  if (m.kind === "USED") return { label: "Used", cls: s.pInk, sign };
  if (m.kind === "RETURNED") return { label: "Returned", cls: s.pBlue, sign };
  if (m.note === "Counted") return { label: "Counted", cls: s.pBlue, sign };
  return { label: "Adjusted", cls: s.pNone, sign };
}

/** On hand split into reserved and free, the forecast and the reorder line drawn against it. */
function StockBar({ r, st }: { r: StockRow; st: RowState }) {
  const scale = Math.max(r.onHand, r.reserved + r.forecast, r.threshold, 1);
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / scale) * 100))}%`;
  const res = Math.min(r.reserved, r.onHand);
  const free = Math.max(0, r.available);
  const deficit = Math.max(0, r.reserved - r.onHand);
  const fcStart = Math.max(r.onHand, r.reserved);
  const fcBeyond = Math.max(0, r.reserved + r.forecast - fcStart);
  return (
    <>
      <div className={s.bar} aria-hidden="true">
        {res > 0 && <i className={s.bRes} style={{ left: 0, width: pct(res) }} />}
        {free > 0 && <i className={`${s.bFree}${st === "low" || st === "short" ? ` ${s.warn}` : ""}`} style={{ left: pct(res), width: pct(free) }} />}
        {deficit > 0 && <i className={s.bDeficit} style={{ left: pct(r.onHand), width: pct(deficit) }} />}
        {fcBeyond > 0 && <i className={s.bFc} style={{ left: pct(fcStart), width: pct(fcBeyond) }} />}
        {r.threshold > 0 && <b style={{ left: pct(r.threshold) }} title={`Reorder line: ${qty(r.threshold)}`} />}
      </div>
      <div className={s.barCap}>
        <b>{qty(free)}</b> free · {qty(r.reserved)} reserved · {qty(r.forecast)} forecast · line at {qty(r.threshold)}
      </div>
    </>
  );
}

function Plate({ r, st }: { r: StockRow; st: RowState }) {
  if (st === "soldshort") return <span className={`${s.plate} ${s.pShort}`}>Short {qty(-r.available)} for sold jobs</span>;
  if (st === "low") return <span className={`${s.plate} ${s.pLow}`}>Low · order {r.suggestedOrder}</span>;
  if (st === "short") return <span className={`${s.plate} ${s.pIf}`}>Short {qty(r.short)} if all sell</span>;
  if (st === "empty") return <span className={`${s.plate} ${s.pNone}`}>Not stocked</span>;
  return <span className={`${s.plate} ${s.pOk}`}>OK</span>;
}

type ItemPatch = { unit: string; reorderPoint: number | null; supplierId: string | null; supplierSku: string | null; lastCost: number | null };

function ItemEditor({ r, fact, suppliers, windowDays, pending, onSave, onDelete, onClose }: { r: StockRow; fact: ItemFacts | undefined; suppliers: TradeBoardData["suppliers"]; windowDays: number; pending: boolean; onSave: (p: ItemPatch) => void; onDelete: () => void; onClose: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <form
      className={s.editor}
      onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement).value;
        onSave({
          unit: g("unit").trim() || r.unit,
          reorderPoint: g("reorder") === "" ? null : Number(g("reorder")),
          supplierId: g("supplier") || null,
          supplierSku: g("sku").trim() || null,
          lastCost: g("cost") === "" ? null : Number(g("cost")),
        });
      }}
    >
      <div className={s.editorGrid}>
        <label className={s.fld}>
          <span className={s.lbl}>Unit</span>
          <input name="unit" className={s.in} defaultValue={r.unit} />
        </label>
        <label className={s.fld}>
          <span className={s.lbl}>Reorder at</span>
          <input name="reorder" className={s.in} type="number" step="any" min="0" defaultValue={r.reorderPoint ?? ""} placeholder={`next job · ${qty(r.threshold)}`} />
        </label>
        <label className={s.fld}>
          <span className={s.lbl}>Supplier</span>
          <select name="supplier" className={s.sel} defaultValue={r.supplierId ?? ""}>
            <option value="">—</option>
            {suppliers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className={s.fld}>
          <span className={s.lbl}>Supplier SKU</span>
          <input name="sku" className={s.in} defaultValue={r.supplierSku ?? ""} placeholder="optional" />
        </label>
        <label className={s.fld}>
          <span className={s.lbl}>Last cost per {r.unit}</span>
          <input name="cost" className={s.in} type="number" step="any" min="0" defaultValue={fact?.lastCost ?? ""} placeholder="0.00" />
        </label>
      </div>
      <div className={s.editorFoot}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Save
        </button>
        <button className={s.ghost} type="button" onClick={onClose}>
          Close
        </button>
        <span className={s.spacer} />
        {sure ? (
          <>
            <span className={s.sure}>Remove {r.name} and its history?</span>
            <button className={`btn ${s.sm}`} type="button" disabled={pending} onClick={onDelete}>
              Yes, remove
            </button>
            <button className={s.cancel} type="button" onClick={() => setSure(false)}>
              keep it
            </button>
          </>
        ) : (
          <button className={s.ghost} type="button" onClick={() => setSure(true)}>
            Remove item
          </button>
        )}
      </div>
      <div className={s.hist}>
        <span>
          Reorder line in force: <b>{qty(r.threshold)} {r.unit}</b>
          {r.reorderPoint == null ? " — the biggest job on the books" : ""}
        </span>
        {fact?.lastCountAt ? (
          <span>
            Last counted <b>{ago(fact.lastCountAt)}</b>
          </span>
        ) : (
          <span>Never counted</span>
        )}
        {fact && fact.used > 0 ? (
          <span>
            Used <b>{qty(fact.used)} {r.unit}</b> in {windowDays} days
          </span>
        ) : (
          <span>Nothing taken out in {windowDays} days</span>
        )}
        {fact && fact.received > 0 ? (
          <span>
            Received <b>{qty(fact.received)}</b> in {windowDays} days
          </span>
        ) : null}
        {fact?.lastMoveAt ? (
          <span>
            Last movement <b>{ago(fact.lastMoveAt)}</b>
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** What the shelf says about one proposal's materials. */
function materialsOf(p: BoardProposal, rows: readonly StockRow[]): { text: string; cls: string } {
  if (!p.linked) return { text: "estimate only — nothing reserved", cls: s.matNone };
  if (p.status === "ACCEPTED" && p.loaded) return { text: "Loaded", cls: s.matOk };
  if (!OPEN.has(p.status) && p.status !== "ACCEPTED") return { text: "—", cls: s.matNone };
  const pick = pickList(rows, p.lines);
  if (!pick.length) return { text: "no material lines", cls: s.matNone };
  const tracked = pick.filter((x) => x.itemId);
  const short = tracked.filter((x) => !x.enough).length;
  const untracked = pick.length - tracked.length;
  if (!tracked.length) return { text: `${plural(pick.length, "line")} · none tracked yet`, cls: s.matNone };
  if (p.status === "ACCEPTED") {
    if (short) return { text: `${short} of ${plural(pick.length, "line")} short`, cls: s.matBad };
    return { text: `${plural(pick.length, "line")} on the shelf${untracked ? ` · ${untracked} untracked` : ""}`, cls: s.matOk };
  }
  if (short) return { text: `${plural(pick.length, "line")} · ${short} short if it sells`, cls: s.matWarn };
  return { text: `${plural(pick.length, "line")} · shelf covers it`, cls: s.matOk };
}

type Anchor = "order" | "ledger";
type Highlight = { tone: "bad" | "warn" | "ok" | "info"; icon: string; label: string; title: string; text: string; action?: { label: string; run?: () => void; scroll?: Anchor; primary?: boolean }; link?: { label: string; href: Route } };

export function TradeBoard({ data, facts, canWrite }: { data: TradeBoardData; facts: StockFacts; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [view, setView] = useState<View>("urgency");
  const [ptab, setPtab] = useState<PTab>("ALL");
  const [q, setQ] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [countingId, setCountingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [supOpen, setSupOpen] = useState(false);
  const supRef = useRef<HTMLElement>(null);
  const trade = TRADES.find((t) => t.id === data.trade)!;

  const run = (work: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, done?: (r: Record<string, unknown>) => string) =>
    start(async () => {
      setError(null);
      const r = await work();
      if (!r.ok) setError(r.error ?? "Could not save");
      else {
        setNote(done ? done(r) : null);
        router.refresh();
      }
    });

  // ── the rows, most urgent first ──
  const rows = useMemo<Row[]>(
    () =>
      data.rows
        .map((r) => ({ r, st: stateOf(r), idle: r.onHand > 0 && r.reserved === 0 && r.forecast === 0 && !((facts.items[r.id]?.used ?? 0) > 0) }))
        .sort((a, b) => ORDER[a.st] - ORDER[b.st] || a.r.name.localeCompare(b.r.name)),
    [data.rows, facts.items],
  );
  const needs = rows.filter((x) => NEEDS.has(x.st)).map((x) => x.r);
  const soldShort = rows.filter((x) => x.st === "soldshort").length;
  const lowCount = rows.filter((x) => x.st === "low").length;
  const shortCount = rows.filter((x) => x.st === "short").length;
  const stocked = rows.filter((x) => x.r.onHand > 0).length;
  const reservedCount = rows.filter((x) => x.r.reserved > 0).length;
  const emptyCount = rows.filter((x) => x.st === "empty").length;
  const idle = rows.filter((x) => x.idle);
  const idleValue = idle.reduce((n, x) => n + x.r.onHand * (facts.items[x.r.id]?.lastCost ?? 0), 0);
  const supName = (id: string | null) => data.suppliers.find((x) => x.id === id)?.name ?? "Supplier";

  const needle = q.trim().toLowerCase();
  const inFilter = (x: Row) =>
    filter === "ALL" ? true : filter === "ORDER" ? NEEDS.has(x.st) : filter === "RESERVED" ? x.r.reserved > 0 : filter === "STOCKED" ? x.r.onHand > 0 : filter === "IDLE" ? x.idle : x.st === "empty";
  const matches = (x: Row) => !needle || x.r.name.toLowerCase().includes(needle) || (x.r.supplierName ?? "").toLowerCase().includes(needle);
  const listed = rows.filter((x) => inFilter(x) && matches(x));
  // In the plain list the untouched standard items fold under one line.
  const folding = filter === "ALL" && !needle && !showEmpty;
  const folded = folding ? listed.filter((x) => x.st === "empty") : [];
  const shown = folding ? listed.filter((x) => x.st !== "empty") : listed;
  // By shelf: the same rows under category headers, urgency kept within each.
  const sections: Array<{ label: string | null; items: Row[]; needs: number }> =
    view === "category" ? groupByCategory(data.trade, shown, (x) => x.r.name).map((g) => ({ label: g.label, items: g.items, needs: g.items.filter((x) => NEEDS.has(x.st)).length })) : [{ label: null, items: shown, needs: 0 }];

  // ── the purchase order, by supplier ──
  const bySupplier = new Map<string, StockRow[]>();
  const unassigned: StockRow[] = [];
  for (const r of needs) {
    if (r.suggestedOrder <= 0) continue;
    if (!r.supplierId) unassigned.push(r);
    else bySupplier.set(r.supplierId, [...(bySupplier.get(r.supplierId) ?? []), r]);
  }
  const orderCost = needs.reduce((n, r) => n + r.suggestedOrder * (facts.items[r.id]?.lastCost ?? 0), 0);
  const orderLines = data.orders.reduce((n, o) => n + o.lines.length, 0);
  const readyOrders = [...bySupplier.entries()].filter(([id]) => data.suppliers.find((x) => x.id === id)?.email);

  // ── the next truck against the shelf ──
  const next = facts.nextLoads[0];
  const nextProposal = next ? data.proposals.find((p) => p.id === next.proposalId) : undefined;
  const nextPick = nextProposal ? pickList(data.rows, nextProposal.lines) : [];
  const nextShortRows = nextPick.filter((p) => p.itemId && !p.enough);
  const nextShort = nextShortRows.length;

  // ── the highlights: what to do now, most pressing first, at most four ──
  const highlights: Highlight[] = [];
  if (next) {
    const when = next.startsAt ? dayOf(next.startsAt) : "no date yet";
    if (nextShort)
      highlights.push({
        tone: "bad",
        icon: "i-hardhat",
        label: "Next truck",
        title: "Next truck is short",
        text: `${next.title} · ${when} · short: ${nextShortRows
          .slice(0, 2)
          .map((x) => `${x.name} (need ${qty(x.quantity)}, have ${qty(x.onHand ?? 0)})`)
          .join(", ")}${nextShort > 2 ? ` and ${nextShort - 2} more` : ""}`,
        action: { label: "Order what's short", scroll: "order", primary: true },
        link: { label: "Open job", href: `/dashboard/jobs/${next.jobId}` as Route },
      });
    else
      highlights.push({
        tone: "ok",
        icon: "i-hardhat",
        label: "Next truck",
        title: "Next truck is covered",
        text: `${next.title} · ${when} · ${nextPick.length ? `${plural(nextPick.filter((x) => x.itemId).length, "line")} on the shelf` : "no material lines"}`,
        link: { label: "Open job", href: `/dashboard/jobs/${next.jobId}` as Route },
      });
  }
  if (readyOrders.length)
    highlights.push({
      tone: "warn",
      icon: "i-send",
      label: "Order",
      title: "Order ready to send",
      text: `${readyOrders.map(([id, list]) => `${supName(id)} · ${plural(list.length, "line")}`).join(" · ")}${orderCost > 0 ? ` · about ${usdShort(orderCost)} at last cost` : ""}`,
      action: { label: "Review and send", scroll: "order", primary: true },
    });
  if (unassigned.length)
    highlights.push({
      tone: "warn",
      icon: "i-box",
      label: "Order",
      title: `${plural(unassigned.length, "item")} to order, no supplier`,
      text: unassigned.map((r) => r.name).slice(0, 3).join(", ") + (unassigned.length > 3 ? ` and ${unassigned.length - 3} more` : ""),
      action: { label: "Pick suppliers", scroll: "order" },
    });
  if (data.orders.length)
    highlights.push({
      tone: "info",
      icon: "i-clock",
      label: "Delivery",
      title: data.orders.length === 1 ? "On the way" : `${data.orders.length} orders on the way`,
      text: data.orders
        .slice(0, 2)
        .map((o) => `${o.supplier} · sent ${ago(o.sentAt)} · ${plural(o.lines.length, "line")}`)
        .join(" · "),
      action: canWrite && data.orders.length === 1 ? { label: "Received", run: () => run(() => receivePurchaseOrder(data.orders[0].id), (r) => `${plural(Number(r.received), "line")} received onto the shelf.`) } : undefined,
    });
  if (idle.length)
    highlights.push({
      tone: "info",
      icon: "i-hourglass",
      label: "Idle stock",
      title: idleValue > 0 ? `${usd(idleValue)} sitting idle` : `${plural(idle.length, "item")} sitting idle`,
      text: `${idle.map((x) => x.r.name).slice(0, 3).join(", ")}${idle.length > 3 ? ` and ${idle.length - 3} more` : ""} — no job against ${idle.length === 1 ? "it" : "them"}, nothing taken out in ${facts.windowDays} days`,
      action: { label: "Show idle", run: () => setFilter("IDLE"), scroll: "ledger" },
    });
  if (canWrite && data.untracked.length)
    highlights.push({
      tone: "info",
      icon: "i-file",
      label: "Proposals",
      title: `${plural(data.untracked.length, "proposal line")} not tracked`,
      text: data.untracked
        .slice(0, 3)
        .map((l) => l.name)
        .join(", ") + (data.untracked.length > 3 ? ` and ${data.untracked.length - 3} more` : ""),
      action: {
        label: `Add all ${data.untracked.length}`,
        run: () =>
          run(
            async () => {
              let added = 0;
              for (const l of data.untracked) {
                const r = await upsertInventoryItem({ trade: data.trade, name: l.name, unit: l.unit ?? "each" });
                if (!r.ok) return r;
                added++;
              }
              return { ok: true, added };
            },
            (r) => `${plural(Number(r.added), "item")} now tracked at zero — receive what is on the shelf.`,
          ),
      },
    });
  const shownHighlights = highlights.slice(0, 4);

  const colSpan = canWrite ? 8 : 7;
  const chips: Array<{ id: Filter; label: string; n: number }> = [
    { id: "ALL", label: "All", n: rows.length },
    { id: "ORDER", label: "Needs ordering", n: needs.length },
    { id: "RESERVED", label: "On sold jobs", n: reservedCount },
    { id: "STOCKED", label: "In stock", n: stocked },
    { id: "IDLE", label: "Idle", n: idle.length },
    { id: "EMPTY", label: "Not stocked", n: emptyCount },
  ];

  // ── the trade's proposals: sold first, then open, then done ──
  const rank = (p: BoardProposal) => (!p.linked ? 3 : p.status === "ACCEPTED" ? 0 : OPEN.has(p.status) ? 1 : 2);
  const proposals = [...data.proposals].sort((a, b) => rank(a) - rank(b));
  const ptabs: Array<{ id: PTab; label: string; n: number }> = [
    { id: "ALL", label: "All", n: proposals.length },
    { id: "OPEN", label: "Open", n: proposals.filter((p) => p.linked && OPEN.has(p.status)).length },
    { id: "SOLD", label: "Sold", n: proposals.filter((p) => p.linked && p.status === "ACCEPTED").length },
    { id: "DONE", label: "Done", n: proposals.filter((p) => rank(p) === 2).length },
    { id: "OFF", label: "Not connected", n: proposals.filter((p) => !p.linked).length },
  ];
  const listedProposals = proposals.filter((p) => (ptab === "ALL" ? true : ptab === "OPEN" ? p.linked && OPEN.has(p.status) : ptab === "SOLD" ? p.linked && p.status === "ACCEPTED" : ptab === "DONE" ? rank(p) === 2 : !p.linked));
  const link = (p: BoardProposal, linked: boolean) => run(() => setProposalInventoryLink({ proposalId: p.id, linked, trade: data.trade }), () => (linked ? `${p.title} is connected to the inventory again.` : `${p.title} is an estimate only now — nothing reserved for it.`));

  const renderRow = ({ r, st }: Row) => {
    const fact = facts.items[r.id];
    const days = fact && fact.usedPerDay > 0 && r.available > 0 ? Math.round(r.available / fact.usedPerDay) : null;
    const counting = countingId === r.id;
    return (
      <Fragment key={r.id}>
        <tr className={st === "soldshort" ? s.rowShort : st === "low" || st === "short" ? s.rowLow : st === "empty" ? s.rowEmpty : undefined} data-stock-row={r.id} data-state={st}>
          <td>
            <span className={s.itemName}>{r.name}</span>
            <div className={s.itemSub}>
              per {r.unit}
              {days != null ? (
                <>
                  {" · "}
                  <span className={s.pace}>≈{days > 999 ? "a year+" : `${days} days`} at this pace</span>
                </>
              ) : null}
              {r.supplierName ? ` · ${r.supplierName}${r.supplierSku ? ` ${r.supplierSku}` : ""}` : " · no supplier"}
              {r.threshold > 0 ? ` · reorder at ${qty(r.threshold)}` : ""}
            </div>
          </td>
          <td className={s.tdStock}>
            <StockBar r={r} st={st} />
          </td>
          <td className={`num ${s.num}`} data-l="On hand">
            {r.onHand > 0 ? qty(r.onHand) : <span className={s.none}>0</span>}
          </td>
          <td className={`num ${s.num}`} data-l="Reserved">
            {r.reserved > 0 ? qty(r.reserved) : <span className={s.none}>—</span>}
          </td>
          <td className={`num ${s.num}`} data-l="Available">
            <b className={r.available < 0 ? s.neg : undefined}>{qty(r.available)}</b>
          </td>
          <td className={`num ${s.num}`} data-l="Forecast">
            {r.forecast > 0 ? qty(r.forecast) : <span className={s.none}>—</span>}
          </td>
          <td className={s.tdStatus}>
            <Plate r={r} st={st} />
          </td>
          {canWrite && (
            <td>
              <div className={s.acts}>
                <form
                  className={s.actForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = e.currentTarget;
                    const v = (f.elements.namedItem("qty") as HTMLInputElement).value;
                    if (v === "") return;
                    const n = Number(v);
                    if (counting) {
                      run(() => countStock(r.id, n), () => `${r.name} set to ${qty(n)} ${r.unit}.`);
                      setCountingId(null);
                    } else {
                      if (!n) return;
                      run(() => receiveStock(r.id, n), () => `${qty(n)} ${r.unit} of ${r.name} received.`);
                    }
                    f.reset();
                  }}
                >
                  <input name="qty" className={`${s.in} ${s.qty}`} type="number" step="any" min="0" placeholder={counting ? "on the shelf" : "+ qty"} aria-label={counting ? `Counted on the shelf, ${r.name}` : `Quantity of ${r.name} received`} />
                  <button className={`btn ${s.sm}`} type="submit" disabled={pending}>
                    {counting ? "Set count" : "Receive"}
                  </button>
                </form>
                {counting ? (
                  <button className={s.cancel} type="button" onClick={() => setCountingId(null)}>
                    cancel
                  </button>
                ) : (
                  <button className={s.ghost} type="button" onClick={() => setCountingId(r.id)}>
                    Count
                  </button>
                )}
                <button className={`${s.ghost}${openId === r.id ? ` ${s.on}` : ""}`} type="button" aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  Edit
                </button>
              </div>
            </td>
          )}
        </tr>
        {openId === r.id && (
          <tr>
            <td colSpan={colSpan} className={s.editorCell}>
              <ItemEditor
                r={r}
                fact={fact}
                suppliers={data.suppliers}
                windowDays={facts.windowDays}
                pending={pending}
                onClose={() => setOpenId(null)}
                onSave={(p) => {
                  run(() => upsertInventoryItem({ trade: data.trade, name: r.name, ...p }), () => `${r.name} saved.`);
                  setOpenId(null);
                }}
                onDelete={() => {
                  run(() => deleteInventoryItem(r.id), () => `${r.name} removed.`);
                  setOpenId(null);
                }}
              />
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className={s.w}>
      {/* PAGE HEAD */}
      <div className="page-head">
        <div>
          <div className="kicker">Warehouse · {trade.label}</div>
          <h1 className="page-title">{trade.label} inventory</h1>
        </div>
        {canWrite && (
          <div className={`page-actions ${s.headActs}`}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setSupOpen(true);
                requestAnimationFrame(() => supRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
              }}
            >
              Add supplier
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>
              <svg className="ic">
                <use href="#i-plus" />
              </svg>
              Add item
            </button>
          </div>
        )}
      </div>
      <p className={s.lede} data-lede>
        Stock for the {trade.label} estimator&apos;s proposals: what is on the shelf, what the sold jobs take, what the open ones would take, and what to order from whom. Every {trade.noun} proposal is here — open, sold and done.
      </p>

      {error && (
        <div role="alert" className={`${s.strip} ${s.stripErr}`}>
          {error}
          <button className={s.stripX} type="button" aria-label="Dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {note && !error && (
        <div role="status" className={`${s.strip} ${s.stripOk}`}>
          {note}
          <button className={s.stripX} type="button" aria-label="Dismiss" onClick={() => setNote(null)}>
            ×
          </button>
        </div>
      )}
      {canWrite && data.presets.missing > 0 && (
        <div className={`${s.strip} ${s.stripInfo}`} data-presets>
          <span>
            {data.rows.length === 0 ? (
              <>
                <b>Start with the {trade.label} estimator&apos;s own materials.</b> Every material it prices — {data.presets.total} items — goes on the list at zero, so proposals match by name. Then receive what you have.
              </>
            ) : (
              <>
                <b>
                  {data.presets.missing} of the estimator&apos;s {data.presets.total} standard items
                </b>{" "}
                are not on the list yet.
              </>
            )}
          </span>
          <button className={`btn ${s.presetsBtn}`} type="button" disabled={pending} onClick={() => run(() => seedTradeItems(data.trade), (r) => `${String(r.added)} standard ${trade.noun} items added — receive what is on the shelf.`)}>
            Add the {data.presets.missing} standard items
          </button>
        </div>
      )}

      {/* THE FOUR NUMBERS */}
      <div className={`kpi-grid ${s.mast}`} data-mast>
        <div className="kpi">
          <div className="kpi-lbl">On the shelf</div>
          <div className="kpi-val">{stocked}</div>
          <div className={s.kpiSub}>{facts.valued > 0 ? `${usd(facts.value)} at last cost${facts.valued < facts.itemCount ? ` · ${facts.valued} of ${facts.itemCount} priced` : ""}` : `of ${plural(rows.length, "item")} · add last cost to see value`}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Needs ordering</div>
          <div className={`kpi-val${needs.length ? (soldShort ? " " + s.kpiBad : " " + s.kpiWarn) : ""}`}>{needs.length}</div>
          <div className={`${s.kpiSub}${soldShort ? " " + s.kpiBad : ""}`}>
            {soldShort ? `${soldShort} short for sold jobs` : needs.length ? (unassigned.length ? `${plural(unassigned.length, "item")} with no supplier yet` : `about ${usdShort(orderCost)} to order`) : "all clear"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">On the way</div>
          <div className="kpi-val">{data.orders.length}</div>
          <div className={s.kpiSub}>{data.orders.length ? `${plural(orderLines, "line")} · ${[...new Set(data.orders.map((o) => o.supplier))].join(", ")}` : "nothing on order"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">To load</div>
          <div className={`kpi-val${nextShort ? " " + s.kpiBad : ""}`}>{data.pipeline.sold}</div>
          <div className={`${s.kpiSub}${nextShort ? " " + s.kpiBad : ""}`}>
            {next ? `${next.startsAt ? `${dayOf(next.startsAt)} · ` : ""}${nextShort ? `${nextShort} short · ` : nextPick.length ? "shelf covers it · " : ""}${next.title}` : "no sold jobs waiting"}
          </div>
        </div>
      </div>

      {/* THE HIGHLIGHTS */}
      <div className={s.hi} data-highlights>
        {shownHighlights.length === 0 ? (
          <div className={`${s.hiCard} ${s.hiOk}`}>
            <div className={s.hiHead}>
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              All clear
            </div>
            <div className={s.hiTitle}>Nothing to do right now</div>
            <div className={s.hiText}>The shelf covers the sold work, nothing is on order and nothing is waiting to load.</div>
          </div>
        ) : (
          shownHighlights.map((h, i) => (
            <div key={i} className={`${s.hiCard} ${h.tone === "bad" ? s.hiBad : h.tone === "warn" ? s.hiWarn : h.tone === "ok" ? s.hiOk : s.hiInfo}`}>
              <div className={s.hiHead}>
                <svg className="ic">
                  <use href={`#${h.icon}`} />
                </svg>
                {h.label}
              </div>
              <div className={s.hiTitle}>{h.title}</div>
              <div className={s.hiText}>{h.text}</div>
              {(h.action || h.link) && (
                <div className={s.hiAct}>
                  {h.action && (
                    <button
                      className={`btn${h.action.primary ? " btn-primary" : ""}`}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        h.action?.run?.();
                        if (h.action?.scroll) document.getElementById(h.action.scroll === "order" ? "tb-order" : "tb-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      {h.action.label}
                    </button>
                  )}
                  {h.link && (
                    <Link className={s.hiLink} href={h.link.href}>
                      {h.link.label} →
                    </Link>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ORDER NOW */}
      {needs.length > 0 && (
        <section className={`card ${s.panel}`} data-stock-alert data-po id="tb-order">
          <div className={s.panelHead}>
            <h2>Order now</h2>
            <span className={s.panelHint}>
              {plural(needs.length, "item")} · {orderCost > 0 ? `about ${usd(orderCost)} at last cost` : "no costs on file yet"}
            </span>
          </div>
          <p className={s.panelHint}>
            {soldShort ? <b>{plural(soldShort, "item is", "items are")} short for jobs already sold. </b> : null}
            {lowCount > 0 ? `${plural(lowCount, "item is", "items are")} under the reorder line. ` : ""}
            {shortCount > 0 ? `${shortCount} would run short if the open proposals sell. ` : ""}
            Quantities cover the sold and open work and keep the reorder line on the shelf.
          </p>
          {[...bySupplier.entries()].map(([supplierId, list]) => {
            const sup = data.suppliers.find((x) => x.id === supplierId);
            return (
              <div key={supplierId} className={s.grp}>
                <div className={s.grpHead}>
                  <b>{sup?.name ?? "Supplier"}</b>
                  {sup?.email ? <span>{sup.email}</span> : <span className={s.noMail}>no email on file — add one under Suppliers</span>}
                  {canWrite && (
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={pending || !sup?.email}
                      onClick={() => run(() => sendPurchaseOrder({ trade: data.trade, supplierId, lines: list.map((r) => ({ itemId: r.id, quantity: r.suggestedOrder })) }), (r) => `Purchase order emailed to ${String(r.to)} — ${plural(Number(r.count), "line")}.`)}
                    >
                      <svg className="ic">
                        <use href="#i-send" />
                      </svg>
                      Email order · {plural(list.length, "line")}
                    </button>
                  )}
                </div>
                <ul className={s.lines}>
                  {list.map((r) => (
                    <li key={r.id} className={s.line}>
                      <b>
                        {r.suggestedOrder} {r.unit}
                      </b>
                      <span>{r.name}</span>
                      {r.supplierSku ? <i>{r.supplierSku}</i> : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {unassigned.length > 0 && (
            <div className={s.grp}>
              <div className={s.grpHead}>
                <b>No supplier yet</b>
                <span>{plural(unassigned.length, "item")} to order and no one to send it to. Pick a supplier and the item joins that order.</span>
              </div>
              <ul className={s.lines}>
                {unassigned.map((r) => (
                  <li key={r.id} className={s.line}>
                    <b>
                      {r.suggestedOrder} {r.unit}
                    </b>
                    <span>{r.name}</span>
                    {canWrite && data.suppliers.length > 0 && (
                      <select
                        className={s.sel}
                        aria-label={`Supplier for ${r.name}`}
                        defaultValue=""
                        disabled={pending}
                        onChange={(e) => {
                          const id = e.target.value;
                          if (!id) return;
                          run(() => upsertInventoryItem({ trade: data.trade, name: r.name, unit: r.unit, reorderPoint: r.reorderPoint, supplierId: id, supplierSku: r.supplierSku ?? null, lastCost: facts.items[r.id]?.lastCost ?? null }), () => `${r.name} now comes from ${supName(id)}.`);
                        }}
                      >
                        <option value="">Supplier…</option>
                        {data.suppliers.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
              {data.suppliers.length === 0 && <p className={s.quiet}>Add a supplier below first.</p>}
            </div>
          )}
        </section>
      )}

      {/* ON THE WAY */}
      {data.orders.length > 0 && (
        <section className={`card ${s.panel}`} data-orders>
          <div className={s.panelHead}>
            <h2>On the way</h2>
            <span className={s.panelHint}>Purchase orders emailed and not yet received. One tap when the delivery lands puts every line on the shelf.</span>
          </div>
          {data.orders.map((o) => (
            <div key={o.id} className={s.orderRow}>
              <div className={s.orderMain}>
                <b>{o.supplier}</b> <span>· sent {ago(o.sentAt)}</span>
                <div className={s.orderLines}>{o.lines.map((l) => `${l.quantity} × ${l.name}`).join(" · ")}</div>
              </div>
              {canWrite && (
                <button className="btn" type="button" disabled={pending} onClick={() => run(() => receivePurchaseOrder(o.id), (r) => `${plural(Number(r.received), "line")} received onto the shelf.`)}>
                  <svg className="ic">
                    <use href="#i-check" />
                  </svg>
                  Received
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* THE LEDGER */}
      <section className={`card ${s.ledger}`} id="tb-ledger">
        <div className={s.toolbar}>
          <label className={s.search}>
            <svg className="ic">
              <use href="#i-search" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item or supplier" aria-label="Find an item" />
          </label>
          <div className="pchips" role="tablist" aria-label="Filter">
            {chips.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={filter === c.id} className={`pchip${filter === c.id ? " active" : ""}`} data-f={c.id} onClick={() => setFilter(c.id)}>
                {c.label} <b>{c.n}</b>
              </button>
            ))}
          </div>
          <div className={s.seg} role="group" aria-label="Order the list">
            <button type="button" className={view === "urgency" ? s.on : undefined} data-view="urgency" aria-pressed={view === "urgency"} onClick={() => setView("urgency")}>
              By urgency
            </button>
            <button type="button" className={view === "category" ? s.on : undefined} data-view="category" aria-pressed={view === "category"} onClick={() => setView("category")}>
              By shelf
            </button>
          </div>
        </div>
        <div className={s.legend} data-legend>
          <span>
            <i className={s.lgRes} />
            reserved for sold jobs
          </span>
          <span>
            <i className={s.lgFree} />
            free
          </span>
          <span>
            <i className={s.lgFc} />
            forecast if the open proposals sell
          </span>
          <span>
            <i className={s.lgTick} />
            reorder line
          </span>
        </div>

        {canWrite && addOpen && (
          <form
            className={s.addForm}
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement).value;
              const name = g("name").trim();
              if (!name) return;
              run(
                () =>
                  upsertInventoryItem({
                    trade: data.trade,
                    name,
                    unit: g("unit").trim() || "each",
                    onHand: Number(g("onHand")) || 0,
                    reorderPoint: g("reorder") === "" ? null : Number(g("reorder")),
                    supplierId: g("supplier") || null,
                    supplierSku: g("sku").trim() || null,
                    lastCost: g("cost") === "" ? null : Number(g("cost")),
                  }),
                () => `${name} added.`,
              );
              f.reset();
              setAddOpen(false);
            }}
          >
            <div className={s.formGrid}>
              <label className={s.fld}>
                <span className={s.lbl}>New item</span>
                <input name="name" className={s.in} placeholder="4x4 PT post, 8 ft" autoFocus />
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Unit</span>
                <input name="unit" className={s.in} placeholder="each" />
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>On hand</span>
                <input name="onHand" className={s.in} type="number" step="any" min="0" placeholder="0" />
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Reorder at</span>
                <input name="reorder" className={s.in} type="number" step="any" min="0" placeholder="next job" />
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Last cost</span>
                <input name="cost" className={s.in} type="number" step="any" min="0" placeholder="0.00" />
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Supplier</span>
                <select name="supplier" className={s.sel} defaultValue="">
                  <option value="">—</option>
                  {data.suppliers.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Supplier SKU</span>
                <input name="sku" className={s.in} placeholder="optional" />
              </label>
              <button className="btn btn-primary" type="submit" disabled={pending}>
                Add item
              </button>
            </div>
          </form>
        )}

        {data.rows.length === 0 ? (
          <div className={s.empty}>
            <b>No {trade.noun} items yet.</b>
            <br />
            Add the estimator&apos;s standard items above, add one by hand, or pick from the lines your proposals already use.
          </div>
        ) : (
          <div className={s.scroll}>
            <table className={`ptable ${s.tbl}`} data-stock-table aria-label={`${trade.label} stock`}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={s.cStock}>Stock</th>
                  <th className={`num ${s.cNum}`}>On hand</th>
                  <th className={`num ${s.cNum}`}>Reserved</th>
                  <th className={`num ${s.cNum}`}>Available</th>
                  <th className={`num ${s.cNum}`}>Forecast</th>
                  <th className={s.cStatus}>Status</th>
                  {canWrite && <th className={s.cActs}></th>}
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => (
                  <Fragment key={sec.label ?? "all"}>
                    {sec.label && (
                      <tr className={s.grpRow} data-group={sec.label}>
                        <td colSpan={colSpan}>
                          {sec.label}
                          <span>
                            {plural(sec.items.length, "item")}
                            {sec.needs ? ` · ${sec.needs} to order` : ""}
                          </span>
                        </td>
                      </tr>
                    )}
                    {sec.items.map(renderRow)}
                  </Fragment>
                ))}
                {folded.length > 0 && (
                  <tr>
                    <td colSpan={colSpan} className={s.foldCell}>
                      <button className={s.fold} type="button" onClick={() => setShowEmpty(true)}>
                        <b>{folded.length}</b> more {folded.length === 1 ? "item" : "items"} not stocked yet — nothing on hand, nothing against them · show
                      </button>
                    </td>
                  </tr>
                )}
                {filter === "ALL" && !needle && showEmpty && emptyCount > 0 && (
                  <tr>
                    <td colSpan={colSpan} className={s.foldCell}>
                      <button className={s.fold} type="button" onClick={() => setShowEmpty(false)}>
                        Hide the {emptyCount} {emptyCount === 1 ? "item" : "items"} not stocked yet
                      </button>
                    </td>
                  </tr>
                )}
                {shown.length === 0 && folded.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className={s.empty}>
                      Nothing here{needle ? ` for “${q.trim()}”` : ""}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {canWrite && data.untracked.length > 0 && (
          <div className={s.untracked} data-untracked>
            <b>Your proposals use these and the warehouse does not track them yet.</b> One tap adds the item at zero.
            <div className={s.chipsRow}>
              {data.untracked.slice(0, 20).map((l) => (
                <button key={l.name} className="pchip" type="button" disabled={pending} onClick={() => run(() => upsertInventoryItem({ trade: data.trade, name: l.name, unit: l.unit ?? "each" }), () => `${l.name} is now tracked. Receive what is on the shelf.`)}>
                  + {l.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* WHAT HAPPENED · SUPPLIERS */}
      <div className={s.cols}>
        <section className="card">
          <div className={s.cardHead}>
            <h2>What happened</h2>
            <span>the last {facts.windowDays} days</span>
          </div>
          {facts.recent.length === 0 ? (
            <p className={s.quiet}>Nothing has moved yet. Receiving a delivery, counting the shelf and loading a truck all land here.</p>
          ) : (
            <ul className={s.feed}>
              {facts.recent.map((m) => {
                const k = moveKind(m);
                const parts: ReactNode[] = [];
                if (m.actor) parts.push(m.actor);
                if (m.jobId && m.jobTitle)
                  parts.push(
                    <Link key="job" href={`/dashboard/jobs/${m.jobId}` as Route}>
                      {m.jobTitle}
                    </Link>,
                  );
                if (m.note && m.note !== "Counted") parts.push(m.note);
                return (
                  <li key={m.id} className={s.feedRow}>
                    <span className={`${s.plate} ${k.cls}`}>{k.label}</span>
                    <div className={s.feedMain}>
                      <b>
                        {k.sign}
                        {qty(Math.abs(m.quantity))} {m.unit} · {m.itemName}
                      </b>
                      <span>
                        {parts.map((p, i) => (
                          <Fragment key={i}>
                            {i ? " · " : ""}
                            {p}
                          </Fragment>
                        ))}
                      </span>
                    </div>
                    <span className={s.feedAgo}>{ago(m.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card" ref={supRef}>
          <div className={s.cardHead}>
            <h2>Suppliers</h2>
            <span>{plural(data.suppliers.length, "supplier")}</span>
            {canWrite && (
              <button className={`${s.ghost}${supOpen ? ` ${s.on}` : ""}`} type="button" aria-expanded={supOpen} onClick={() => setSupOpen((v) => !v)}>
                {supOpen ? "Close" : "Add supplier"}
              </button>
            )}
          </div>
          {data.suppliers.length === 0 ? <p className={s.quiet}>No suppliers yet. A supplier with an email is where a purchase order goes.</p> : null}
          <ul className={s.sups} data-suppliers>
            {data.suppliers.map((x) => (
              <li key={x.id} className={s.supRow}>
                <div className={s.supMain}>
                  <b>{x.name}</b>
                  <span>
                    {x.email ?? "no email — purchase orders cannot go out"}
                    {x.phone ? ` · ${x.phone}` : ""}
                    {x.website ? (
                      <>
                        {" · "}
                        <a href={x.website.startsWith("http") ? x.website : `https://${x.website}`} target="_blank" rel="noreferrer">
                          order online
                        </a>
                      </>
                    ) : null}
                  </span>
                </div>
                <span className={s.supCount}>{plural(x.itemCount, "item")}</span>
              </li>
            ))}
          </ul>
          {canWrite && supOpen && (
            <form
              className={s.supForm}
              onSubmit={(e) => {
                e.preventDefault();
                const f = e.currentTarget;
                const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
                const name = g("sname").trim();
                if (!name) return;
                run(() => upsertSupplier({ name, email: g("semail"), phone: g("sphone"), website: g("sweb") }), () => `${name} added.`);
                f.reset();
                setSupOpen(false);
              }}
            >
              <label className={s.fld}>
                <span className={s.lbl}>Supplier</span>
                <input name="sname" className={s.in} placeholder="ABC Supply · Kent" autoFocus />
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Email for orders</span>
                <input name="semail" className={s.in} type="email" placeholder="orders@…" />
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Phone</span>
                <input name="sphone" className={s.in} placeholder="(425) …" />
              </label>
              <label className={s.fld}>
                <span className={s.lbl}>Website</span>
                <input name="sweb" className={s.in} placeholder="ordering page" />
              </label>
              <div className={s.wide}>
                <button className="btn btn-primary" type="submit" disabled={pending}>
                  Add supplier
                </button>
              </div>
            </form>
          )}
        </section>
      </div>

      {/* THE TRADE'S PROPOSALS */}
      <section className={`card ${s.props}`}>
        <div className={s.cardHead}>
          <h2>{trade.label} proposals</h2>
          <span>every proposal from the {trade.label} estimator · the Proposals page lists them all together</span>
          <div className="pchips" role="tablist" aria-label="Proposals">
            {ptabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={ptab === t.id} className={`pchip${ptab === t.id ? " active" : ""}`} data-ptab={t.id} onClick={() => setPtab(t.id)}>
                {t.label} <b>{t.n}</b>
              </button>
            ))}
          </div>
        </div>
        {proposals.length === 0 ? (
          <div className={s.empty}>No {trade.noun} proposals yet — make one with the {trade.label} estimator.</div>
        ) : listedProposals.length === 0 ? (
          <div className={s.empty}>Nothing here.</div>
        ) : (
          <table className={`ptable ${s.propTbl}`} data-trade-proposals>
            <thead>
              <tr>
                <th>Proposal</th>
                <th className={s.cStatus}>Status</th>
                <th className={s.cMat}>Materials</th>
                <th className={`num ${s.cMoney}`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {listedProposals.map((p) => {
                const m = materialsOf(p, data.rows);
                return (
                  <tr key={p.id} data-inferred={p.inferred ? "true" : "false"}>
                    <td>
                      <Link className="pt-title pt-link" href={`/dashboard/manual-blueprint?proposal=${p.id}` as Route}>
                        {p.title}
                      </Link>
                      <div className="pt-sub">
                        {p.client ?? "No client"} · {dayOf(p.createdAt)} · {plural(p.lines.length, "material line")}
                        {p.inferred ? <span className={s.tag}>by its materials</span> : null}
                        {!p.linked ? <span className={s.tag}>not connected</span> : null}
                      </div>
                    </td>
                    <td>
                      <span className={`pstatus pstatus--${p.status.toLowerCase()}`}>{STATUS[p.status] ?? p.status}</span>{" "}
                      {p.linked && p.status === "ACCEPTED" ? <span className={`${s.plate} ${p.loaded ? s.pOk : s.pBlue}`}>{p.loaded ? "Loaded" : "Reserved in stock"}</span> : null}
                      {canWrite && (
                        <button className={`${s.ghost} ${s.linkBtn}`} type="button" disabled={pending} data-link={p.linked ? "off" : "on"} onClick={() => link(p, !p.linked)}>
                          {p.linked ? "Disconnect" : "Connect"}
                        </button>
                      )}
                    </td>
                    <td className={s.mat}>
                      <span className={m.cls}>{m.text}</span>
                      {p.linked && p.jobId && (p.status === "ACCEPTED" || p.status === "COMPLETED") ? (
                        <span className={s.matSub}>
                          {p.jobStartsAt ? `starts ${dayOf(p.jobStartsAt)} · ` : ""}
                          <Link href={`/dashboard/jobs/${p.jobId}` as Route}>Pick list →</Link>
                        </span>
                      ) : null}
                    </td>
                    <td className="num">
                      <span className="pt-money">{usd(p.total)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

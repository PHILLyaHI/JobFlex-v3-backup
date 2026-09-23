"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { countStock, deleteInventoryItem, receivePurchaseOrder, receiveStock, seedTradeItems, sendPurchaseOrder, upsertInventoryItem, upsertSupplier } from "@/actions/inventory";
import { setProposalInventoryLink } from "@/actions/inventoryLink";
import type { BoardProposal, TradeBoardData } from "@/lib/inventoryBoard";
import type { StockFacts, StockMove } from "@/lib/inventoryDashboard";
import { groupByCategory } from "@/lib/inventoryCategories";
import { pickList, type StockLine, type StockRow } from "@/lib/inventory";

export type RoofingInventoryProps = { data: TradeBoardData; facts: StockFacts; canWrite: boolean };
export type InventoryTab = "stock" | "orders" | "proposals" | "suppliers" | "activity";
export type StockFilter = "ALL" | "ORDER" | "RESERVED" | "STOCKED" | "IDLE" | "EMPTY";
export type ProposalFilter = "ALL" | "OPEN" | "SOLD" | "DONE" | "OFF";
export type RowState = "soldshort" | "low" | "short" | "reserved" | "stocked" | "empty";
export type InventoryRow = { r: StockRow; st: RowState; idle: boolean };
export type ItemPanel = { mode: "add" | "edit" | "receive" | "count"; itemId?: string };
export type ItemInput = Omit<Parameters<typeof upsertInventoryItem>[0], "trade">;
export type SupplierInput = Parameters<typeof upsertSupplier>[0];
export type Tone = "danger" | "warning" | "success" | "neutral";

export const qty = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);
export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export function ago(iso: string) {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  if (m < 43200) return `${Math.round(m / 1440)}d ago`;
  return `${Math.round(m / 43200)}mo ago`;
}
const STATUS: Record<string, string> = { DRAFT: "Draft", SENT: "Sent", VIEWED: "Viewed", ACCEPTED: "Sold", COMPLETED: "Completed", PAID: "Paid", DECLINED: "Declined" };
export const statusLabel = (status: string) => STATUS[status] ?? status;
const OPEN = new Set(["DRAFT", "SENT", "VIEWED"]);
const ORDER: Record<RowState, number> = { soldshort: 0, low: 1, short: 2, reserved: 3, stocked: 4, empty: 5 };
const NEEDS = new Set<RowState>(["soldshort", "low", "short"]);
export function stateOf(r: StockRow): RowState {
  if (r.available < 0) return "soldshort";
  if (r.low) return "low";
  if (r.short > 0) return "short";
  if (r.reserved > 0 || r.forecast > 0) return "reserved";
  return r.onHand > 0 ? "stocked" : "empty";
}
export function stockStatus(r: StockRow, st = stateOf(r)): { text: string; tone: Tone } {
  if (st === "soldshort") return { text: `Short ${qty(-r.available)} for sold jobs`, tone: "danger" };
  if (st === "low") return { text: "Low stock", tone: "warning" };
  if (st === "short") return { text: `Short ${qty(r.short)} if all sell`, tone: "warning" };
  if (st === "empty") return { text: "Not stocked", tone: "neutral" };
  return { text: "Stock covered", tone: "success" };
}
export function materialsOf(p: BoardProposal, rows: readonly StockRow[]): { text: string; tone: Tone } {
  if (!p.linked) return { text: "Estimate only · no stock reserved", tone: "neutral" };
  if (p.status === "ACCEPTED" && p.loaded) return { text: "Loaded", tone: "success" };
  if (!OPEN.has(p.status) && p.status !== "ACCEPTED") return { text: "No stock reserved", tone: "neutral" };
  const pick = pickList(rows, p.lines);
  if (!pick.length) return { text: "No material lines", tone: "neutral" };
  const tracked = pick.filter((x) => x.itemId);
  const short = tracked.filter((x) => !x.enough).length;
  const untracked = pick.length - tracked.length;
  if (!tracked.length) return { text: `${pick.length} lines · none tracked`, tone: "neutral" };
  if (short) return { text: `${short} of ${pick.length} lines short${p.status === "ACCEPTED" ? "" : " if sold"}`, tone: p.status === "ACCEPTED" ? "danger" : "warning" };
  return { text: `Stock covers ${tracked.length} lines${untracked ? ` · ${untracked} untracked` : ""}`, tone: "success" };
}
export function moveLabel(m: StockMove) {
  return m.kind === "RECEIVED" ? "Received" : m.kind === "PICKED" ? "Loaded" : m.kind === "USED" ? "Used" : m.kind === "RETURNED" ? "Returned" : m.note === "Counted" ? "Counted" : "Adjusted";
}

export function useRoofingInventory({ data, facts, canWrite }: RoofingInventoryProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tab, setTab] = useState<InventoryTab>("stock");
  const [filter, setFilter] = useState<StockFilter>("ALL");
  const [view, setView] = useState<"urgency" | "category">("urgency");
  const [ptab, setPtab] = useState<ProposalFilter>("ALL");
  const [q, setQ] = useState("");
  const search = useDeferredValue(q);
  const tradeLabel = data.trade === "roof" ? "Roofing" : data.trade === "fence" ? "Fence" : "HVAC";
  const estimatorHref = `/dashboard/${data.trade}-estimator` as const;
  const [itemPanel, setItemPanel] = useState<ItemPanel | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);

  function run<T extends { ok: boolean; error?: string }>(work: () => Promise<T>, done: (result: T) => string, after?: () => void) {
    if (!canWrite || pending) return;
    start(async () => {
      setError(null);
      setNote(null);
      try {
        const result = await work();
        if (!result.ok) { setError(result.error ?? "Could not save. Please try again."); return; }
        setNote(done(result));
        after?.();
        router.refresh();
      } catch {
        setError("Could not reach the server. Your changes have not been confirmed. Please try again.");
      }
    });
  }

  const rows = useMemo<InventoryRow[]>(() => data.rows.map((r) => ({ r, st: stateOf(r), idle: r.onHand > 0 && r.reserved === 0 && r.forecast === 0 && !((facts.items[r.id]?.used ?? 0) > 0) })).sort((a, b) => ORDER[a.st] - ORDER[b.st] || a.r.name.localeCompare(b.r.name)), [data.rows, facts.items]);
  const derived = useMemo(() => {
    const needs = rows.filter((x) => NEEDS.has(x.st)).map((x) => x.r);
    const soldShort = rows.filter((x) => x.st === "soldshort").length;
    const stocked = rows.filter((x) => x.r.onHand > 0).length;
    const emptyCount = rows.filter((x) => x.st === "empty").length;
    const idle = rows.filter((x) => x.idle);
    const idleValue = idle.reduce((n, x) => n + x.r.onHand * (facts.items[x.r.id]?.lastCost ?? 0), 0);
    const needle = search.trim().toLowerCase();
    const listed = rows.filter((x) => (filter === "ALL" || (filter === "ORDER" ? NEEDS.has(x.st) : filter === "RESERVED" ? x.r.reserved > 0 : filter === "STOCKED" ? x.r.onHand > 0 : filter === "IDLE" ? x.idle : x.st === "empty")) && (!needle || x.r.name.toLowerCase().includes(needle) || (x.r.supplierName ?? "").toLowerCase().includes(needle) || (x.r.supplierSku ?? "").toLowerCase().includes(needle)));
    const shown = listed;
    const sections: Array<{ label: string | null; items: InventoryRow[]; needs: number }> = view === "category" ? groupByCategory(data.trade, shown, (x) => x.r.name).map((g) => ({ label: g.label, items: g.items, needs: g.items.filter((x) => NEEDS.has(x.st)).length })) : [{ label: null, items: shown, needs: 0 }];
    const chips: Array<{ id: StockFilter; label: string; n: number }> = [
      { id: "ALL", label: "All items", n: rows.length }, { id: "ORDER", label: "Needs ordering", n: needs.length }, { id: "RESERVED", label: "Reserved", n: rows.filter((x) => x.r.reserved > 0).length }, { id: "STOCKED", label: "In stock", n: stocked }, { id: "IDLE", label: "Idle", n: idle.length }, { id: "EMPTY", label: "Not stocked", n: emptyCount },
    ];
    const bySupplier = new Map<string, StockRow[]>();
    const unassigned: StockRow[] = [];
    for (const r of needs) {
      if (r.suggestedOrder <= 0) continue;
      if (!r.supplierId) unassigned.push(r);
      else bySupplier.set(r.supplierId, [...(bySupplier.get(r.supplierId) ?? []), r]);
    }
    const orderCost = needs.reduce((n, r) => n + r.suggestedOrder * (facts.items[r.id]?.lastCost ?? 0), 0);
    const next = facts.nextLoads[0];
    const nextProposal = next ? data.proposals.find((p) => p.id === next.proposalId) : undefined;
    const nextPick = nextProposal ? pickList(data.rows, nextProposal.lines) : [];
    const nextShort = nextPick.filter((p) => p.itemId && !p.enough).length;
    const rank = (p: BoardProposal) => !p.linked ? 3 : p.status === "ACCEPTED" ? 0 : OPEN.has(p.status) ? 1 : 2;
    const proposals = [...data.proposals].sort((a, b) => rank(a) - rank(b));
    const ptabs: Array<{ id: ProposalFilter; label: string; n: number }> = [
      { id: "ALL", label: "All", n: proposals.length }, { id: "OPEN", label: "Open", n: proposals.filter((p) => p.linked && OPEN.has(p.status)).length }, { id: "SOLD", label: "Sold", n: proposals.filter((p) => p.linked && p.status === "ACCEPTED").length }, { id: "DONE", label: "Done", n: proposals.filter((p) => rank(p) === 2).length }, { id: "OFF", label: "Not connected", n: proposals.filter((p) => !p.linked).length },
    ];
    const listedProposals = proposals.filter((p) => ptab === "ALL" || (ptab === "OPEN" ? p.linked && OPEN.has(p.status) : ptab === "SOLD" ? p.linked && p.status === "ACCEPTED" : ptab === "DONE" ? rank(p) === 2 : !p.linked));

    return { shown, sections, chips, needs, soldShort, stocked, emptyCount, idle, idleValue, bySupplier, unassigned, orderCost, next, nextPick, nextShort, proposals, listedProposals, ptabs };
  }, [rows, data, facts, search, filter, view, ptab]);

  return {
    tradeLabel, estimatorHref, data, facts, canWrite, pending, error, note, dismissFeedback: () => { setError(null); setNote(null); },
    tab, setTab, filter, setFilter, view, setView, ptab, setPtab, q, setQ, itemPanel, setItemPanel, supplierOpen, setSupplierOpen,
    rows, ...derived,
    saveItem: (input: ItemInput) => run(() => upsertInventoryItem({ ...input, trade: data.trade }), () => `${input.name} saved.`, () => setItemPanel(null)),
    removeItem: (r: StockRow) => run(() => deleteInventoryItem(r.id), () => `${r.name} removed.`, () => setItemPanel(null)),
    receiveItem: (r: StockRow, n: number) => run(() => receiveStock(r.id, n), () => `${qty(n)} ${r.unit} of ${r.name} received.`, () => setItemPanel(null)),
    countItem: (r: StockRow, n: number) => run(() => countStock(r.id, n), () => `${r.name} counted at ${qty(n)} ${r.unit}.`, () => setItemPanel(null)),
    saveSupplier: (input: SupplierInput) => run(() => upsertSupplier(input), () => `${input.name} saved.`, () => setSupplierOpen(false)),
    assignSupplier: (r: StockRow, supplierId: string) => run(() => upsertInventoryItem({ trade: data.trade, name: r.name, unit: r.unit, reorderPoint: r.reorderPoint, supplierId, supplierSku: r.supplierSku ?? null, lastCost: facts.items[r.id]?.lastCost ?? null }), () => `Supplier assigned to ${r.name}.`),
    sendOrder: (supplierId: string, list: StockRow[]) => run(() => sendPurchaseOrder({ trade: data.trade, supplierId, lines: list.map((r) => ({ itemId: r.id, quantity: r.suggestedOrder })) }), (r) => r.ok ? `Purchase order emailed to ${r.to} · ${r.count} lines.` : ""),
    receiveOrder: (id: string) => run(() => receivePurchaseOrder(id), (r) => r.ok ? `${r.received} lines received into stock.` : ""),
    seedItems: () => run(() => seedTradeItems(data.trade), (r) => r.ok ? `${r.added} standard ${tradeLabel} items added. Receive your current stock to update quantities.` : ""),
    trackItem: (l: StockLine) => run(() => upsertInventoryItem({ trade: data.trade, name: l.name, unit: l.unit ?? "each" }), () => `${l.name} is now tracked. Receive your current stock to update its quantity.`),
    trackAllItems: () => run(async () => { let added = 0; for (const l of data.untracked) { const r = await upsertInventoryItem({ trade: data.trade, name: l.name, unit: l.unit ?? "each" }); if (!r.ok) return r; added++; } return { ok: true as const, added }; }, (r) => r.ok ? `${r.added} items now tracked.` : ""),
    linkProposal: (p: BoardProposal, linked: boolean) => run(() => setProposalInventoryLink({ proposalId: p.id, linked, trade: data.trade }), () => linked ? `${p.title} is connected to inventory.` : `${p.title} is estimate only. No stock is reserved.`),
  };
}

export type InventoryWorkspace = ReturnType<typeof useRoofingInventory>;

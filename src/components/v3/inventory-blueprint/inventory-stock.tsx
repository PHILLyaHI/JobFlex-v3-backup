"use client";

// THE STOCK TAB (owner, second pass, 2026-09-29) — drawn from scratch on the
// roofing-inventory workspace hook (its state, its derived lists, its
// actions); nothing of the old board's layout or icon tabs is kept.
//   masthead (four plates) → secondary segments Stock · Orders · Jobs ·
//   Suppliers · Activity → one card per system.
// Every write is the hook's: countStock, receiveStock, upsertInventoryItem,
// sendPurchaseOrder, receivePurchaseOrder, upsertSupplier, saveStockList,
// setProposalInventoryLink — the same actions the estimators' boards used.

import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Check, ChevronDown, ChevronRight, Plus, Search, X } from "lucide-react";
import { InventoryItemForm, InventorySupplierForm } from "@/components/v3/roofing-inventory/roofing-inventory-forms";
import { StockListEditor } from "@/components/v3/roofing-inventory/stock-list-editor";
import { ago, dayOf, materialsOf, moveLabel, qty, statusLabel, stockStatus, useRoofingInventory, usd, type InventoryRow, type InventoryTab as StockSection, type InventoryWorkspace } from "@/components/v3/roofing-inventory/roofing-inventory-model";
import type { BoardOrder, BoardProposal, TradeBoardData } from "@/lib/inventoryBoard";
import type { StockFacts } from "@/lib/inventoryDashboard";
import { pickList, type StockRow } from "@/lib/inventory";
import { cx, Empty, Sheet, STAMP_TONE, useHandheld } from "./inventory-shared";

export type StockSlots = { primary: HTMLElement | null; toolbar: HTMLElement | null };

const SECTIONS: Array<{ id: StockSection; label: string }> = [
  { id: "stock", label: "Stock" }, { id: "orders", label: "Orders" }, { id: "proposals", label: "Jobs & proposals" }, { id: "suppliers", label: "Suppliers" }, { id: "activity", label: "Activity" },
];

export function InventoryStock({ data, facts, canWrite, slots }: { data: TradeBoardData; facts: StockFacts; canWrite: boolean; slots: StockSlots }) {
  const w = useRoofingInventory({ data, facts, canWrite });
  const handheld = useHandheld();
  const [orderOpen, setOrderOpen] = useState(false);
  const counts: Record<StockSection, number> = { stock: w.rows.length, orders: w.data.orders.length + w.needs.length, proposals: w.data.proposals.length, suppliers: w.data.suppliers.length, activity: w.facts.recent.length };
  const addMaterials = () => { if (w.data.catalog.length) w.setSetupOpen(true); else w.setItemPanel({ mode: "add" }); w.setTab("stock"); };

  return (
    <section aria-label={`${w.tradeLabel} stock`} aria-busy={w.pending}>
      {canWrite && slots.primary && createPortal(
        <button type="button" className={cx("btn", "btn-primary")} onClick={() => { w.setTab("stock"); w.setItemPanel({ mode: "add" }); }}><Plus className={cx("ic")} aria-hidden="true" />Add item</button>,
        slots.primary,
      )}
      {canWrite && slots.toolbar && createPortal(
        <>
          {w.data.catalog.length > 0 && <button type="button" className={cx("btn", "btn-ghost")} onClick={() => { w.setTab("stock"); w.setSetupOpen(true); }}>What we stock</button>}
          <button type="button" className={cx("btn", "btn-ghost")} onClick={() => w.setSupplierOpen(true)}>Add supplier</button>
        </>,
        slots.toolbar,
      )}

      <div className={cx("kpi-grid")} data-stock-kpis>
        <div className={cx("kpi")}><div className={cx("kpi-val")}>{w.stocked}</div><div className={cx("kpi-lbl")}>in stock</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-val")}>{usd(w.facts.value)}</div><div className={cx("kpi-lbl")}>stock value</div></div>
        <button type="button" className={cx("kpi")} onClick={() => w.setTab("orders")}><div className={cx("kpi-val", w.needs.length > 0 && "warn")}>{w.needs.length}</div><div className={cx("kpi-lbl")}>to order <ArrowRight className={cx("ic")} aria-hidden="true" /></div></button>
        <button type="button" className={cx("kpi")} onClick={() => { w.setTab("proposals"); w.setPtab("SOLD"); }}><div className={cx("kpi-val", "accent")}>{w.data.pipeline.sold}</div><div className={cx("kpi-lbl")}>jobs to load <ArrowRight className={cx("ic")} aria-hidden="true" /></div></button>
      </div>

      {(w.error || w.note) && (
        <div className={cx("note", w.error ? "note-err" : "note-ok")} role={w.error ? "alert" : "status"}>{w.error ?? w.note}<button type="button" className={cx("note-x")} aria-label="Dismiss" onClick={w.dismissFeedback}>×</button></div>
      )}

      <nav className={cx("seg2")} aria-label="Stock sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={cx("seg-btn", w.tab === s.id && "on")} aria-current={w.tab === s.id ? "page" : undefined} onClick={() => w.setTab(s.id)}>
            {s.label}{counts[s.id] > 0 && <span className={cx("n")}>{counts[s.id]}</span>}
          </button>
        ))}
      </nav>

      {w.tab === "stock" && <StockSchedule w={w} handheld={handheld} addMaterials={addMaterials} />}
      {w.tab === "orders" && <Orders w={w} handheld={handheld} addMaterials={addMaterials} onNew={() => setOrderOpen(true)} />}
      {w.tab === "proposals" && <Jobs w={w} />}
      {w.tab === "suppliers" && <Suppliers w={w} />}
      {w.tab === "activity" && <Activity w={w} />}

      {canWrite && w.itemPanel && (
        <Sheet id="inv-stock-sheet-title" kicker={w.itemPanel.mode === "add" ? "New item" : w.itemPanel.mode === "receive" ? "Receive stock" : w.itemPanel.mode === "count" ? "Count the shelf" : "Item"} title={w.itemPanel.mode === "add" ? "Add item" : w.data.rows.find((r) => r.id === w.itemPanel?.itemId)?.name ?? "Item"} onClose={() => w.setItemPanel(null)}>
          <InventoryItemForm key={`${w.itemPanel.mode}:${w.itemPanel.itemId ?? ""}`} workspace={w} compact />
        </Sheet>
      )}
      {canWrite && w.supplierOpen && (
        <Sheet id="inv-stock-sheet-title" kicker="Supplier" title="Add supplier" onClose={() => w.setSupplierOpen(false)}>
          <InventorySupplierForm workspace={w} compact />
        </Sheet>
      )}
      {canWrite && orderOpen && <OrderSheet w={w} onClose={() => setOrderOpen(false)} />}
      {canWrite && w.setupOpen && (
        <Sheet id="inv-stock-sheet-title" kicker={`${w.tradeLabel} stock`} title="Stock list" onClose={() => w.setSetupOpen(false)} wide={!handheld}>
          <StockListEditor workspace={w} compact />
        </Sheet>
      )}
    </section>
  );
}

/* ── STOCK: the schedule ─────────────────────────────────────────────── */

function StockSchedule({ w, handheld, addMaterials }: { w: InventoryWorkspace; handheld: boolean; addMaterials: () => void }) {
  // The "what we stock" checklist opens in a sheet (the toolbar, or "Add materials" on an empty shelf).
  const [open, setOpen] = useState<string | null>(null);
  const cols = w.canWrite ? 8 : 7;
  const untracked = w.data.untracked.length;
  return (
    <section className={cx("card")} aria-label="Stock schedule">
      <div className={cx("card-head")}>
        <div><div className={cx("card-title")}>Stock schedule</div><div className={cx("card-sub")}>{w.rows.length} kept in stock · {w.perJobRows.length} bought per job · {w.facts.valued} of {w.facts.itemCount} priced{w.uncounted ? ` · ${w.uncounted} never counted` : ""}</div></div>
        {w.canWrite && untracked > 0 && <div className={cx("card-acts")}><button type="button" className={cx("btn", "btn-ghost")} onClick={w.trackAllItems} disabled={w.pending}>Track {untracked} proposal line{untracked === 1 ? "" : "s"}</button></div>}
      </div>
      {w.data.rows.length > 0 && (
        <div className={cx("tools")}>
          <label className={cx("search")}><Search size={16} aria-hidden="true" /><input value={w.q} onChange={(e) => w.setQ(e.target.value)} placeholder="Find an item, a supplier, a SKU" aria-label="Find an item" />{w.q && <button type="button" className={cx("link")} onClick={() => w.setQ("")} aria-label="Clear search"><X size={14} /></button>}</label>
          <div className={cx("chips")} role="group" aria-label="Filter">
            {w.chips.filter((c) => c.id === "ALL" || c.n > 0).map((c) => <button key={c.id} type="button" className={cx("chip", w.filter === c.id && "on")} onClick={() => w.setFilter(c.id)}>{c.label} <b>{c.n}</b></button>)}
          </div>
          <div className={cx("tools-r")}>
            <select className={cx("sel")} value={w.view} onChange={(e) => w.setView(e.target.value as "urgency" | "category")} aria-label="Order the schedule by"><option value="urgency">By urgency</option><option value="category">By category</option></select>
          </div>
        </div>
      )}

      {w.data.rows.length === 0 ? (
        <Empty text="No materials in stock yet" action={w.canWrite && <button type="button" className={cx("btn", "btn-primary")} onClick={addMaterials}>Add materials</button>} />
      ) : w.shown.length === 0 && w.folded.length === 0 ? (
        <Empty text="Nothing matches" action={<button type="button" className={cx("btn", "btn-ghost")} onClick={() => { w.setQ(""); w.setFilter("ALL"); }}>Show all</button>} />
      ) : handheld ? (
        <div role="list">
          {w.sections.map((sec) => (
            <div key={sec.label ?? "all"}>
              {sec.label && <div className={cx("grp-h")}>{sec.label}<span>{sec.items.length}</span></div>}
              {sec.items.map((x) => <StockListRow key={x.r.id} x={x} w={w} open={open === x.r.id} onToggle={() => setOpen(open === x.r.id ? null : x.r.id)} />)}
            </div>
          ))}
          {w.folded.length > 0 && <PerJobFold w={w} handheld list={(rows) => rows.map((x) => <StockListRow key={x.r.id} x={x} w={w} open={open === x.r.id} onToggle={() => setOpen(open === x.r.id ? null : x.r.id)} />)} />}
        </div>
      ) : (
        <div className={cx("tbl-wrap")}>
          <table className={cx("spec")}>
            <thead>
              <tr>
                <th scope="col">No.</th><th scope="col">Item</th><th scope="col">Specification</th>
                <th scope="col" className={cx("num")}>On hand</th><th scope="col" className={cx("num")}>Reserved</th><th scope="col" className={cx("num")}>Forecast</th>
                <th scope="col">Status</th>
                {w.canWrite && <th scope="col" className={cx("acts")}><span style={{ position: "absolute", left: -9999 }}>Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {w.sections.map((sec, si) => {
                const start = w.sections.slice(0, si).reduce((n, s) => n + s.items.length, 0);
                return (
                  <SectionRows key={sec.label ?? "all"} label={sec.label} count={sec.items.length} cols={cols}>
                    {sec.items.map((x, i) => <StockTableRow key={x.r.id} x={x} n={start + i + 1} w={w} />)}
                  </SectionRows>
                );
              })}
              {w.folded.length > 0 && (
                <PerJobFold w={w} cols={cols} list={(rows) => rows.map((x, i) => <StockTableRow key={x.r.id} x={x} n={w.shown.length + i + 1} w={w} dim />)} />
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SectionRows({ label, count, cols, children }: { label: string | null; count: number; cols: number; children: ReactNode }) {
  return <>
    {label && <tr className={cx("grp")}><th colSpan={cols} scope="rowgroup">{label}<span>{count} items</span></th></tr>}
    {children}
  </>;
}

/** The items bought per job, folded under the shelf: one mono row, a toggle, the rows when opened. */
function PerJobFold({ w, cols, handheld, list }: { w: InventoryWorkspace; cols?: number; handheld?: boolean; list: (rows: InventoryRow[]) => ReactNode }) {
  const toggle = <button type="button" className={cx("link")} onClick={() => w.setShowPerJob(!w.showPerJob)}>{w.showPerJob ? "Hide" : "Show"}</button>;
  if (handheld) return <>
    <div className={cx("grp-h")}>Bought per job<span>{w.folded.length}</span> {toggle}</div>
    {w.showPerJob && list(w.folded)}
  </>;
  return <>
    <tr className={cx("grp")}><th colSpan={cols} scope="rowgroup">Bought per job<span>{w.folded.length} items · nothing to count</span> <span>{toggle}</span></th></tr>
    {w.showPerJob && list(w.folded)}
  </>;
}

const specsOf = (r: StockRow) => [r.supplierName, r.supplierSku, r.unit].filter(Boolean).join(" · ");

function StockTableRow({ x, n, w, dim }: { x: InventoryRow; n: number; w: InventoryWorkspace; dim?: boolean }) {
  const r = x.r;
  const st = stockStatus(r, x.st);
  const perJob = x.st === "perjob";
  return (
    <tr className={cx("row", dim && "dim")} onClick={() => w.canWrite && w.setItemPanel({ mode: "edit", itemId: r.id })} tabIndex={w.canWrite ? 0 : undefined} onKeyDown={(e) => { if (e.key === "Enter" && w.canWrite) w.setItemPanel({ mode: "edit", itemId: r.id }); }}>
      <td className={cx("no")}>{String(n).padStart(2, "0")}</td>
      <td className={cx("name")}>{r.name}</td>
      <td className={cx("mono")}>{specsOf(r) || "—"}</td>
      <td className={cx("num")} onClick={(e) => e.stopPropagation()}>{perJob ? <span className={cx("mono")}>—</span> : <OnHand r={r} w={w} />}</td>
      <td className={cx("num")}>{r.reserved > 0 ? qty(r.reserved) : <span className={cx("mono")}>—</span>}</td>
      <td className={cx("num")}>{r.forecast > 0 ? qty(r.forecast) : <span className={cx("mono")}>—</span>}</td>
      <td><span className={cx("stamp", STAMP_TONE[st.tone])}>{st.text}</span></td>
      {w.canWrite && (
        <td className={cx("acts")} onClick={(e) => e.stopPropagation()}>
          {!perJob && <button type="button" className={cx("link")} onClick={() => w.setItemPanel({ mode: "receive", itemId: r.id })}>Receive</button>}
          <button type="button" className={cx("link")} onClick={() => w.setItemPanel({ mode: "edit", itemId: r.id })}>Edit</button>
        </td>
      )}
    </tr>
  );
}

/** The on-hand figure: a click turns it into a count field; Enter or blur saves the count. */
function OnHand({ r, w }: { r: StockRow; w: InventoryWorkspace }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (!w.canWrite) return <b>{qty(r.onHand)}</b>;
  if (!editing) return <button type="button" className={cx("cell-btn")} onClick={() => { setText(String(r.onHand)); setEditing(true); }} aria-label={`On hand ${qty(r.onHand)} ${r.unit} — click to count`}>{qty(r.onHand)}</button>;
  const commit = () => { const n = parseFloat(text); setEditing(false); if (Number.isFinite(n) && n >= 0 && n !== r.onHand) w.countItem(r, n); };
  return (
    <span className={cx("cell-edit")}>
      <input autoFocus inputMode="decimal" value={text} aria-label={`Counted on hand, ${r.unit}`} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} />
      <span className={cx("mono")}>{r.unit}</span>
    </span>
  );
}

function StockListRow({ x, w, open, onToggle }: { x: InventoryRow; w: InventoryWorkspace; open: boolean; onToggle: () => void }) {
  const r = x.r;
  const st = stockStatus(r, x.st);
  const perJob = x.st === "perjob";
  return (
    <div role="listitem"><div className={cx("rowi")} role="button" tabIndex={0} aria-expanded={open} onClick={onToggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}>
      <div className={cx("l1")}><span className={cx("t")}>{r.name}</span><span className={cx("p")}>{perJob ? "—" : `${qty(r.onHand)} ${r.unit}`}</span></div>
      <div className={cx("l2")}><span>{specsOf(r) || r.unit}</span><span className={cx("stamp", STAMP_TONE[st.tone])}>{st.text}</span></div>
      {open && (
        <div className={cx("more")} onClick={(e) => e.stopPropagation()}>
          <div className={cx("kv")}><span>Reserved</span><b>{qty(r.reserved)} {r.unit}</b></div>
          <div className={cx("kv")}><span>Forecast</span><b>{qty(r.forecast)} {r.unit}</b></div>
          <div className={cx("kv")}><span>Reorder at</span><b>{qty(r.threshold)} {r.unit}</b></div>
          {w.canWrite && (
            <div className={cx("acts2")}>
              {!perJob && <button type="button" className={cx("btn", "btn-ghost")} onClick={() => w.setItemPanel({ mode: "count", itemId: r.id })}>Count</button>}
              {!perJob && <button type="button" className={cx("btn", "btn-ghost")} onClick={() => w.setItemPanel({ mode: "receive", itemId: r.id })}>Receive</button>}
              <button type="button" className={cx("btn", "btn-primary")} onClick={() => w.setItemPanel({ mode: "edit", itemId: r.id })}>Edit</button>
            </div>
          )}
        </div>
      )}
    </div></div>
  );
}

/* ── ORDERS ──────────────────────────────────────────────────────────── */

function Orders({ w, handheld, addMaterials, onNew }: { w: InventoryWorkspace; handheld: boolean; addMaterials: () => void; onNew: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const jobTitle = (jobId: string | null) => (jobId ? w.data.proposals.find((p) => p.jobId === jobId)?.title ?? null : null);
  const amountOf = (o: BoardOrder) => o.lines.reduce((n, l) => n + l.quantity * (l.id ? w.facts.items[l.id]?.lastCost ?? 0 : 0), 0);
  const groups = [...w.bySupplier.entries()].map(([id, rows]) => ({ id, supplier: w.data.suppliers.find((s) => s.id === id), rows }));
  return (
    <>
      <section className={cx("card")} aria-label="Orders on the way">
        <div className={cx("card-head")}>
          <div><div className={cx("card-title")}>Orders on the way</div><div className={cx("card-sub")}>Sent to the supplier, not received yet — receive an order and its lines land on the shelf.</div></div>
          {w.canWrite && w.data.rows.length > 0 && <div className={cx("card-acts")}><button type="button" className={cx("btn", "btn-primary")} onClick={onNew}><Plus className={cx("ic")} aria-hidden="true" />New order</button></div>}
        </div>
        {w.data.orders.length === 0 ? (
          <Empty text="No orders on the way" action={w.canWrite && (w.data.rows.length ? <button type="button" className={cx("btn", "btn-primary")} onClick={onNew}>New order</button> : <button type="button" className={cx("btn", "btn-primary")} onClick={addMaterials}>Add materials</button>)} />
        ) : handheld ? (
          <div role="list">
            {w.data.orders.map((o) => (
              <div key={o.id} role="listitem"><div className={cx("rowi")} role="button" tabIndex={0} aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(open === o.id ? null : o.id); } }}>
                <div className={cx("l1")}><span className={cx("t")}>{o.supplier}</span><span className={cx("p")}>{amountOf(o) > 0 ? usd(amountOf(o)) : `${o.lines.length} lines`}</span></div>
                <div className={cx("l2")}><span>sent {dayOf(o.sentAt)}{jobTitle(o.jobId) ? ` · ${jobTitle(o.jobId)}` : ""}</span><span className={cx("stamp", "stamp-bp")}>Sent</span></div>
                {open === o.id && (
                  <div className={cx("more")} onClick={(e) => e.stopPropagation()}>
                    {o.lines.map((l, i) => <div key={i} className={cx("kv")}><span>{l.name}</span><b>{qty(l.quantity)}</b></div>)}
                    {w.canWrite && <div className={cx("acts2")}><button type="button" className={cx("btn", "btn-primary")} disabled={w.pending} onClick={() => w.receiveOrder(o.id)}>Receive all</button></div>}
                  </div>
                )}
              </div></div>
            ))}
          </div>
        ) : (
          <div className={cx("tbl-wrap")}>
            <table className={cx("spec")}>
              <thead><tr><th scope="col">Supplier</th><th scope="col">Lines</th><th scope="col" className={cx("num")}>Amount</th><th scope="col">Status</th><th scope="col">Sent</th><th scope="col">Job</th>{w.canWrite && <th scope="col" className={cx("acts")}><span style={{ position: "absolute", left: -9999 }}>Actions</span></th>}</tr></thead>
              <tbody>
                {w.data.orders.map((o) => (
                  <tr key={o.id}>
                    <td className={cx("name")}>{o.supplier}</td>
                    <td className={cx("mono")}>{o.lines.map((l) => `${qty(l.quantity)} × ${l.name}`).join(" · ")}</td>
                    <td className={cx("num")}>{amountOf(o) > 0 ? <b>{usd(amountOf(o))}</b> : <span className={cx("mono")}>no cost on file</span>}</td>
                    <td><span className={cx("stamp", "stamp-bp")}>Sent</span></td>
                    <td className={cx("mono")}>{dayOf(o.sentAt)} · {ago(o.sentAt)}</td>
                    <td>{jobTitle(o.jobId) ? <Link href={`/dashboard/jobs/${o.jobId}` as Route} className={cx("link")}>{jobTitle(o.jobId)}</Link> : <span className={cx("mono")}>restock</span>}</td>
                    {w.canWrite && <td className={cx("acts")}><button type="button" className={cx("link")} disabled={w.pending} onClick={() => w.receiveOrder(o.id)}>Receive all</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(w.needs.length > 0 || w.unassigned.length > 0) && (
        <section className={cx("card")} aria-label="Restock">
          <div className={cx("card-head")}><div><div className={cx("card-title")}>Restock</div><div className={cx("card-sub")}>{w.needs.length} item{w.needs.length === 1 ? "" : "s"} below the reorder line or needed for open work{w.orderCost > 0 ? ` · about ${usd(w.orderCost)} at last cost` : ""}</div></div></div>
          <div className={cx("tbl-wrap")}>
            <table className={cx("spec")}>
              <thead><tr><th scope="col">Item</th><th scope="col" className={cx("num")}>On hand</th><th scope="col" className={cx("num")}>Order</th><th scope="col" className={cx("num")}>Last cost</th><th scope="col">Status</th>{w.canWrite && <th scope="col" className={cx("acts")}><span style={{ position: "absolute", left: -9999 }}>Actions</span></th>}</tr></thead>
              <tbody>
                {groups.map((g) => (
                  <SectionRows key={g.id} label={`${g.supplier?.name ?? "Supplier"}${g.supplier?.email ? "" : " · no email on file"}`} count={g.rows.length} cols={w.canWrite ? 6 : 5}>
                    {g.rows.map((r) => <RestockRow key={r.id} r={r} w={w} />)}
                    {w.canWrite && <tr><td colSpan={w.canWrite ? 6 : 5} className={cx("acts")}><button type="button" className={cx("btn", "btn-primary")} disabled={w.pending || !g.supplier?.email} onClick={() => w.sendOrder(g.id, g.rows)}>Send order to {g.supplier?.name ?? "supplier"}</button></td></tr>}
                  </SectionRows>
                ))}
                {w.unassigned.length > 0 && (
                  <SectionRows label="No supplier yet" count={w.unassigned.length} cols={w.canWrite ? 6 : 5}>
                    {w.unassigned.map((r) => <RestockRow key={r.id} r={r} w={w} assign />)}
                  </SectionRows>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {w.buy.length > 0 && (
        <section className={cx("card")} aria-label="Shopping lists">
          <div className={cx("card-head")}><div><div className={cx("card-title")}>Shopping lists for sold jobs</div><div className={cx("card-sub")}>Bought per job, not shelf stock · {w.buyLines} line{w.buyLines === 1 ? "" : "s"} still to buy{w.buyCost > 0 ? ` · about ${usd(w.buyCost)} at last cost` : ""}</div></div></div>
          <div className={cx("tbl-wrap")}>
            <table className={cx("spec")}>
              <thead><tr><th scope="col">Item</th><th scope="col" className={cx("num")}>Needed</th><th scope="col" className={cx("num")}>Arrived</th><th scope="col" className={cx("num")}>To buy</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {w.buy.map((j) => (
                  <SectionRows key={j.job.id} label={`${j.job.title}${j.job.startsAt ? ` · ${dayOf(j.job.startsAt)}` : ""}`} count={j.lines.length} cols={5}>
                    {j.lines.map((l) => (
                      <tr key={l.itemId}>
                        <td className={cx("name")}>{l.name}<span className={cx("sub")}>{l.supplierName ?? "no supplier"}{l.supplierSku ? ` · ${l.supplierSku}` : ""}</span></td>
                        <td className={cx("num")}>{qty(l.quantity)} <span className={cx("unit")}>{l.unit}</span></td>
                        <td className={cx("num")}>{qty(l.have)}</td>
                        <td className={cx("num")}><b>{qty(l.toBuy)}</b></td>
                        <td><span className={cx("stamp", l.toBuy === 0 ? "stamp-ok" : l.onTheWay ? "stamp-bp" : "stamp-warn")}>{l.toBuy === 0 ? "Arrived" : l.onTheWay ? "On the way" : "To buy"}</span></td>
                      </tr>
                    ))}
                    {w.canWrite && j.bySupplier.filter((g) => g.toBuy > 0).map((g) => (
                      <tr key={g.supplierId ?? "none"}><td colSpan={5} className={cx("acts")}>{g.supplierId ? <button type="button" className={cx("btn", "btn-primary")} disabled={w.pending || !g.supplier?.email} onClick={() => w.sendJobOrder(j, g.supplierId!, g.lines)}>Email {g.supplier?.name} · {g.toBuy} line{g.toBuy === 1 ? "" : "s"}</button> : <span className={cx("mono")}>{g.toBuy} line{g.toBuy === 1 ? "" : "s"} with no supplier — set one on the item</span>}</td></tr>
                    ))}
                  </SectionRows>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function RestockRow({ r, w, assign }: { r: StockRow; w: InventoryWorkspace; assign?: boolean }) {
  const st = stockStatus(r);
  const cost = w.facts.items[r.id]?.lastCost ?? null;
  return (
    <tr>
      <td className={cx("name")}>{r.name}{r.supplierSku && <span className={cx("sub")}>{r.supplierSku}</span>}</td>
      <td className={cx("num")}>{qty(r.onHand)} <span className={cx("unit")}>{r.unit}</span></td>
      <td className={cx("num")}><b>{qty(r.suggestedOrder)}</b></td>
      <td className={cx("num")}>{cost === null ? <span className={cx("mono")}>—</span> : usd(cost)}</td>
      <td><span className={cx("stamp", STAMP_TONE[st.tone])}>{st.text}</span></td>
      {w.canWrite && (
        <td className={cx("acts")}>
          {assign ? (
            w.data.suppliers.length ? <select className={cx("sel")} defaultValue="" aria-label={`Supplier for ${r.name}`} disabled={w.pending} onChange={(e) => { if (e.target.value) w.assignSupplier(r, e.target.value); }}><option value="">Assign supplier…</option>{w.data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : <button type="button" className={cx("link")} onClick={() => w.setSupplierOpen(true)}>Add a supplier</button>
          ) : <button type="button" className={cx("link")} onClick={() => w.setItemPanel({ mode: "receive", itemId: r.id })}>Receive</button>}
        </td>
      )}
    </tr>
  );
}

/** A purchase order by hand: pick the supplier, the lines are what that supplier's items need. */
function OrderSheet({ w, onClose }: { w: InventoryWorkspace; onClose: () => void }) {
  const [supplierId, setSupplierId] = useState(w.data.suppliers[0]?.id ?? "");
  const supplier = w.data.suppliers.find((s) => s.id === supplierId);
  const lines = useMemo(() => w.bySupplier.get(supplierId) ?? [], [w.bySupplier, supplierId]);
  const cost = lines.reduce((n, r) => n + r.suggestedOrder * (w.facts.items[r.id]?.lastCost ?? 0), 0);
  return (
    <Sheet id="inv-stock-sheet-title" kicker="Purchase order" title="New order" onClose={onClose} footer={
      <div className={cx("r")}>
        <button type="button" className={cx("btn", "btn-ghost")} onClick={onClose}>Cancel</button>
        <button type="button" className={cx("btn", "btn-primary")} disabled={w.pending || !supplier?.email || lines.length === 0} onClick={() => { w.sendOrder(supplierId, lines); onClose(); }}>{w.pending ? "Sending…" : "Email the order"}</button>
      </div>
    }>
      {w.data.suppliers.length === 0 ? (
        <Empty text="Add a supplier first — orders are emailed to them" action={<button type="button" className={cx("btn", "btn-primary")} onClick={() => { onClose(); w.setSupplierOpen(true); }}>Add supplier</button>} />
      ) : (
        <>
          <label className={cx("fld")}><span className={cx("lbl")}>Supplier</span><select className={cx("sel-w")} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{w.data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.email ? "" : " · no email"}</option>)}</select>{supplier && !supplier.email && <span className={cx("hint")}>No email on file — the order cannot be sent.</span>}</label>
          <div className={cx("fld")}>
            <span className={cx("lbl")}>Lines · what this supplier&apos;s items need</span>
            {lines.length === 0 ? <span className={cx("hint")}>Nothing to restock from {supplier?.name ?? "this supplier"} right now. An item joins the order when it falls below its reorder line or a job needs it.</span> : (
              <ul className={cx("lines")}>{lines.map((r) => <li key={r.id}><span>{r.name}</span><span className={cx("q")}>{qty(r.suggestedOrder)} {r.unit}</span></li>)}</ul>
            )}
            {cost > 0 && <span className={cx("hint")}>About {usd(cost)} at last cost.</span>}
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ── JOBS & PROPOSALS ────────────────────────────────────────────────── */

function Jobs({ w }: { w: InventoryWorkspace }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className={cx("card")} aria-label="Jobs and proposals">
      <div className={cx("card-head")}><div><div className={cx("card-title")}>Jobs & proposals</div><div className={cx("card-sub")}>{w.connected} of {w.data.proposals.length} connected to the stock · a connected proposal reserves its materials when it sells</div></div></div>
      {w.data.proposals.length > 0 && (
        <div className={cx("tools")}>
          <div className={cx("chips")} role="group" aria-label="Filter proposals">{w.ptabs.filter((t) => t.id === "ALL" || t.n > 0).map((t) => <button key={t.id} type="button" className={cx("chip", w.ptab === t.id && "on")} onClick={() => w.setPtab(t.id)}>{t.label} <b>{t.n}</b></button>)}</div>
        </div>
      )}
      {w.data.proposals.length === 0 ? (
        <Empty text={`No ${w.tradeLabel.toLowerCase()} proposals yet`} action={<Link href={w.estimatorHref as Route} className={cx("btn", "btn-primary")}>Open the estimator</Link>} />
      ) : w.listedProposals.length === 0 ? (
        <Empty text="Nothing in this filter" action={<button type="button" className={cx("btn", "btn-ghost")} onClick={() => w.setPtab("ALL")}>Show all</button>} />
      ) : (
        <ul className={cx("jobs")}>
          {w.listedProposals.map((p) => <JobRow key={p.id} p={p} w={w} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />)}
        </ul>
      )}
    </section>
  );
}

function JobRow({ p, w, open, onToggle }: { p: BoardProposal; w: InventoryWorkspace; open: boolean; onToggle: () => void }) {
  const pick = useMemo(() => pickList(w.data.rows, p.lines), [w.data.rows, p.lines]);
  const covered = pick.filter((x) => x.enough).length;
  const m = materialsOf(p, w.data.rows);
  const pct = !p.linked || pick.length === 0 ? 0 : Math.round((covered / pick.length) * 100);
  const fill = m.tone === "danger" ? "bad" : m.tone === "warning" ? "warn" : m.tone === "success" ? "ok" : "";
  const statusTone = p.status === "ACCEPTED" ? "stamp-bp" : p.status === "COMPLETED" || p.status === "PAID" ? "stamp-ok" : p.status === "DECLINED" ? "stamp-quiet" : "stamp-quiet";
  return (
    <li className={cx("job")}>
      <button type="button" className={cx("job-h")} aria-expanded={open} onClick={onToggle}>
        <span><span className={cx("job-t")}>{p.title}</span><span className={cx("job-s")}>{p.client ?? "No client"} · {dayOf(p.createdAt)}{p.jobStartsAt ? ` · starts ${dayOf(p.jobStartsAt)}` : ""}</span></span>
        <span className={cx("stamp", statusTone)}>{statusLabel(p.status)}{p.loaded ? " · loaded" : ""}</span>
        <span className={cx("cov")} aria-label={m.text} title={m.text}><span className={cx("cov-track")}><span className={cx("cov-fill", fill)} style={{ width: `${pct}%` }} /></span><span className={cx("cov-n")}>{p.linked ? `${covered}/${pick.length}` : "est. only"}</span></span>
        <span className={cx("job-total")}>{usd(p.total)}</span>
        {open ? <ChevronDown className={cx("ic")} aria-hidden="true" /> : <ChevronRight className={cx("ic")} aria-hidden="true" />}
      </button>
      {open && (
        <div className={cx("job-b")}>
          <div className={cx("hint")}>{m.text}</div>
          {pick.length > 0 && (
            <ul className={cx("check")} aria-label="Materials for this job">
              {pick.map((x) => {
                const state = x.enough ? (x.perJob ? "Arrived" : "On the shelf") : x.perJob ? "To buy" : x.itemId ? `Short · ${qty(x.onHand ?? 0)} on hand` : "Not tracked";
                const tone = x.enough ? "stamp-ok" : x.perJob ? "stamp-bp" : x.itemId ? "stamp-bad" : "stamp-quiet";
                return (
                  <li key={x.name}>
                    <span className={cx("box", x.enough && "on")} aria-hidden="true">{x.enough && <Check size={12} />}</span>
                    <span>{x.name}</span>
                    <span className={cx("q")}>{qty(x.quantity)} {x.unit}</span>
                    {!x.itemId && w.canWrite ? <button type="button" className={cx("link")} disabled={w.pending} onClick={() => w.trackItem({ name: x.name, quantity: x.quantity, unit: x.unit })}>Track</button> : <span className={cx("stamp", tone)}>{state}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className={cx("job-acts")}>
            {p.jobId && <Link href={`/dashboard/jobs/${p.jobId}` as Route} className={cx("link")}>Open the job</Link>}
            {w.canWrite && <button type="button" className={cx("link")} disabled={w.pending} onClick={() => w.linkProposal(p, !p.linked)}>{p.linked ? "Make it estimate only" : "Connect to the stock"}</button>}
          </div>
        </div>
      )}
    </li>
  );
}

/* ── SUPPLIERS ───────────────────────────────────────────────────────── */

function Suppliers({ w }: { w: InventoryWorkspace }) {
  const lastOrder = (id: string) => [...w.data.orders].filter((o) => o.supplierId === id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
  return (
    <section className={cx("card")} aria-label="Suppliers">
      <div className={cx("card-head")}>
        <div><div className={cx("card-title")}>Suppliers</div><div className={cx("card-sub")}>Purchase orders are emailed to them; every item names the one it comes from.</div></div>
        {w.canWrite && w.data.suppliers.length > 0 && <div className={cx("card-acts")}><button type="button" className={cx("btn", "btn-primary")} onClick={() => w.setSupplierOpen(true)}><Plus className={cx("ic")} aria-hidden="true" />Add supplier</button></div>}
      </div>
      {w.data.suppliers.length === 0 ? (
        <Empty text="No suppliers yet" action={w.canWrite && <button type="button" className={cx("btn", "btn-primary")} onClick={() => w.setSupplierOpen(true)}>Add supplier</button>} />
      ) : (
        <div className={cx("cards")}>
          {w.data.suppliers.map((s) => {
            const o = lastOrder(s.id);
            return (
              <article key={s.id} className={cx("sup")}>
                <div className={cx("sup-t")}>{s.name}<span className={cx("stamp", "stamp-quiet")}>{s.itemCount} item{s.itemCount === 1 ? "" : "s"}</span></div>
                <div className={cx("sup-l")}><span>Email</span>{s.email ? <a href={`mailto:${s.email}`}>{s.email}</a> : <i className={cx("none")}>none · orders cannot be sent</i>}</div>
                <div className={cx("sup-l")}><span>Phone</span>{s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : <i className={cx("none")}>—</i>}</div>
                <div className={cx("sup-l")}><span>Web</span>{s.website ? <a href={/^https?:/.test(s.website) ? s.website : `https://${s.website}`} target="_blank" rel="noreferrer">{s.website.replace(/^https?:\/\//, "")}</a> : <i className={cx("none")}>—</i>}</div>
                <div className={cx("sup-l")}><span>Last order</span>{o ? <b>{dayOf(o.sentAt)} · {o.lines.length} line{o.lines.length === 1 ? "" : "s"}</b> : <i className={cx("none")}>none yet</i>}</div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── ACTIVITY ────────────────────────────────────────────────────────── */

function Activity({ w }: { w: InventoryWorkspace }) {
  return (
    <section className={cx("card")} aria-label="Activity">
      <div className={cx("card-head")}><div><div className={cx("card-title")}>Activity</div><div className={cx("card-sub")}>Every movement of the last {w.facts.windowDays} days — received, loaded, used, counted.</div></div></div>
      {w.facts.recent.length === 0 ? (
        <Empty text="Nothing has moved yet" action={w.canWrite && w.data.rows.length > 0 && <button type="button" className={cx("btn", "btn-primary")} onClick={() => { w.setTab("stock"); }}>Count the shelf</button>} />
      ) : (
        <ul className={cx("feed")}>
          {w.facts.recent.map((m) => {
            const out = m.quantity < 0;
            const inn = m.quantity > 0;
            return (
              <li key={m.id}>
                <time dateTime={m.at}>{dayOf(m.at)}</time>
                <div><div className={cx("t")}>{moveLabel(m)} · {m.itemName}</div><div className={cx("s")}>{[m.jobTitle, m.note && m.note !== "Counted" ? m.note : null, m.actor, ago(m.at)].filter(Boolean).join(" · ")}</div></div>
                <span className={cx("q", inn && "q-in", out && "q-out")}>{inn ? "+" : out ? "−" : ""}{qty(Math.abs(m.quantity))} {m.unit}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

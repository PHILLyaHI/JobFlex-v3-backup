"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Route } from "next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, ChevronRight, ClipboardList, Clock3, FileText, Mail, Package, Phone, Plus, Search, Store, Truck, X } from "lucide-react";
import { lockScroll } from "@/lib/scrollLock";
import { InventoryItemForm, InventorySupplierForm } from "./roofing-inventory-forms";
import { ago, dayOf, materialsOf, moveLabel, qty, statusLabel, usd, type InventoryWorkspace } from "./roofing-inventory-model";
import s from "./roofing-inventory-mobile.module.css";

type Props = { workspace: InventoryWorkspace };
type InventoryRow = InventoryWorkspace["rows"][number];

const destinations = [
  { id: "stock", label: "Stock", icon: Package },
  { id: "orders", label: "Orders", icon: Truck },
  { id: "proposals", label: "Jobs", icon: FileText },
  { id: "suppliers", label: "Suppliers", icon: Store },
  { id: "activity", label: "Activity", icon: Clock3 },
] as const;

function itemStatus({ r, st }: InventoryRow) {
  if (st === "soldshort") return { text: `Short ${qty(-r.available)} for sold jobs`, tone: "danger" };
  if (st === "low") return { text: "Below reorder level", tone: "warning" };
  if (st === "short") return { text: "Short if open proposals sell", tone: "warning" };
  if (st === "empty") return { text: "Not stocked", tone: "neutral" };
  return { text: r.reserved > 0 ? "Stock reserved" : "In stock", tone: "neutral" };
}

function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className={s.empty}><h3>{title}</h3><p>{children}</p>{action}</div>;
}

function ItemCard({ item, workspace: w, expanded, onExpand }: Props & { item: InventoryRow; expanded: boolean; onExpand: () => void }) {
  const { r } = item;
  const status = itemStatus(item);
  const fact = w.facts.items[r.id];
  const days = fact && fact.usedPerDay > 0 && r.available > 0 ? Math.round(r.available / fact.usedPerDay) : null;
  return (
    <article className={s.item} data-stock-row={r.id} data-state={item.st}>
      <div className={s.itemTop}>
        <div className={s.itemIdentity}>
          <h3>{r.name}</h3>
          <span className={s.stockStatus} data-tone={status.tone}>{status.text}</span>
        </div>
        <div className={s.available} data-short={r.available < 0 || undefined}>
          <span>Available</span><strong>{qty(r.available)}</strong><small>{r.unit}</small>
        </div>
      </div>
      <div className={s.itemFoot}>
        <span><b>{qty(r.onHand)}</b> on hand <span aria-hidden="true">·</span> <b>{qty(r.reserved)}</b> reserved</span>
        <button type="button" onClick={onExpand} aria-expanded={expanded} aria-controls={`roof-item-${r.id}`} aria-label={`${expanded ? "Close" : "View"} ${r.name} details`} className={s.detailsButton}>
          Details <ChevronDown size={16} aria-hidden="true" className={expanded ? s.rotate : undefined} />
        </button>
      </div>
      {expanded && (
        <div className={s.itemDetails} id={`roof-item-${r.id}`}>
          <dl className={s.itemFacts}>
            <div><dt>Open proposal demand</dt><dd>{qty(r.forecast)} {r.unit}</dd></div>
            <div><dt>Reorder level</dt><dd>{qty(r.threshold)} {r.unit}</dd></div>
            {r.suggestedOrder > 0 && <div><dt>Suggested order</dt><dd>{qty(r.suggestedOrder)} {r.unit}</dd></div>}
            <div><dt>Supplier</dt><dd>{r.supplierName || "Not assigned"}</dd></div>
            {r.supplierSku && <div><dt>Supplier SKU</dt><dd>{r.supplierSku}</dd></div>}
            {fact?.lastCost != null && <div><dt>Last cost / {r.unit}</dt><dd>{fact.lastCost.toLocaleString("en-US", { style: "currency", currency: "USD" })}</dd></div>}
            {days != null && <div><dt>At the current pace</dt><dd>About {days} days left</dd></div>}
            <div><dt>Last counted</dt><dd>{fact?.lastCountAt ? ago(fact.lastCountAt) : "Not yet counted"}</dd></div>
            <div><dt>Used in {w.facts.windowDays} days</dt><dd>{qty(fact?.used ?? 0)} {r.unit}</dd></div>
          </dl>
          {w.canWrite && <div className={s.itemActions}>
            <button type="button" className={s.primary} disabled={w.pending} onClick={() => w.setItemPanel({ mode: "receive", itemId: r.id })}><ArrowDownToLine size={16} aria-hidden="true" /> Receive</button>
            <button type="button" className={s.secondary} disabled={w.pending} onClick={() => w.setItemPanel({ mode: "count", itemId: r.id })}>Count</button>
            <button type="button" className={s.secondary} disabled={w.pending} onClick={() => w.setItemPanel({ mode: "edit", itemId: r.id })}>Edit</button>
          </div>}
        </div>
      )}
    </article>
  );
}

function Stock({ workspace: w }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return <section className={s.section} aria-label="Roofing stock">
    <div className={s.sectionHeading}><h2>Stock</h2><span>{w.rows.length} items</span></div>
    <label className={s.search}>
      <Search size={18} aria-hidden="true" />
      <input type="search" value={w.q} onChange={(e) => w.setQ(e.target.value)} placeholder="Find an item or supplier" aria-label="Search roofing inventory" />
    </label>
    <div className={s.filters}>
      <label className={s.filterField}><span>Show</span><span className="bp-sel"><select className="bp-sel-in" value={w.filter} onChange={(e) => w.setFilter(e.target.value as InventoryWorkspace["filter"])}>
        {w.chips.map((chip) => <option key={chip.id} value={chip.id}>{chip.label} ({chip.n})</option>)}
      </select></span></label>
      <label className={s.filterField}><span>Sort by</span><span className="bp-sel"><select className="bp-sel-in" value={w.view} onChange={(e) => w.setView(e.target.value as InventoryWorkspace["view"])}>
        <option value="urgency">Priority</option><option value="category">Category</option>
      </select></span></label>
    </div>
    {w.rows.length === 0 ? (
      <Empty title="Build your stock list" action={w.canWrite ? <button type="button" className={s.primary} disabled={w.pending} onClick={() => w.setItemPanel({ mode: "add" })}><Plus size={16} aria-hidden="true" /> Add first item</button> : undefined}>Add the materials you keep on hand, then receive your current stock.</Empty>
    ) : <>
      {w.shown.length > 0 && <div className={s.stockList}>
        {w.sections.map((section) => <div key={section.label ?? "all"} className={s.stockGroup}>
          {section.label && <h3 className={s.category}>{section.label}<span>{section.items.length}</span></h3>}
          {section.items.map((item) => <ItemCard key={item.r.id} item={item} workspace={w} expanded={expandedId === item.r.id} onExpand={() => setExpandedId(expandedId === item.r.id ? null : item.r.id)} />)}
        </div>)}
      </div>}
      {w.shown.length === 0 && w.folded.length === 0 && <Empty title="No matching items" action={<button type="button" className={s.secondary} onClick={() => { w.setQ(""); w.setFilter("ALL"); }}>Clear filters</button>}>Try another name, supplier, or stock filter.</Empty>}
      {w.folded.length > 0 && <button type="button" className={s.fullButton} onClick={() => w.setShowEmpty(true)}>Show {w.folded.length} items not stocked<ChevronDown size={18} aria-hidden="true" /></button>}
      {w.showEmpty && w.filter === "ALL" && !w.q.trim() && w.rows.some((row) => row.st === "empty") && <button type="button" className={s.fullButton} onClick={() => w.setShowEmpty(false)}>Hide items not stocked<ChevronDown size={18} className={s.rotate} aria-hidden="true" /></button>}
    </>}
    {w.canWrite && (w.data.presets.missing > 0 || w.data.untracked.length > 0) && <details className={s.setup}>
      <summary>Complete your stock list<ChevronDown size={18} aria-hidden="true" /></summary>
      {w.data.presets.missing > 0 && <div className={s.setupBlock}><p>Add {w.data.presets.missing} standard roofing materials to your list. Stock starts at zero.</p><button type="button" className={s.secondary} disabled={w.pending} onClick={w.seedItems}>Add standard items</button></div>}
      {w.data.untracked.length > 0 && <div className={s.setupBlock}><h3>Used in proposals, not tracked</h3><p>Add each item, then receive what you have on hand.</p><button type="button" className={s.secondary} disabled={w.pending} onClick={w.trackAllItems}>Track all {w.data.untracked.length} items</button><ul className={s.untracked}>{w.data.untracked.map((line) => <li key={line.name}><span>{line.name}<small>{line.unit || "each"}</small></span><button type="button" className={s.iconButton} disabled={w.pending} onClick={() => w.trackItem(line)} aria-label={`Track ${line.name}`}><Plus size={18} aria-hidden="true" /></button></li>)}</ul></div>}
    </details>}
  </section>;
}

function Orders({ workspace: w }: Props) {
  return <section className={s.section} aria-label="Roofing purchase orders">
    <div className={s.sectionHeading}><h2>Order materials</h2>{w.orderCost > 0 && <span>Est. {usd(w.orderCost)}</span>}</div>
    {w.needs.length > 0 ? <>
      <p className={s.sectionNote}>Suggested quantities cover sold jobs, open proposals, and your reorder level.</p>
      {[...w.bySupplier.entries()].map(([supplierId, items]) => {
        const supplier = w.data.suppliers.find((entry) => entry.id === supplierId);
        return <article className={s.order} key={supplierId}>
          <div className={s.orderHead}><h3>{supplier?.name || "Supplier"}</h3><span>{items.length} {items.length === 1 ? "item" : "items"}</span></div>
          <ul className={s.orderLines}>{items.map((item) => <li key={item.id}><span>{item.name}</span><strong>{qty(item.suggestedOrder)} <small>{item.unit}</small></strong></li>)}</ul>
          {supplier?.email ? <p className={s.orderEmail}>{supplier.email}</p> : <p className={s.warningText}>Add a supplier email before sending.</p>}
          {w.canWrite && <button type="button" className={s.primary} disabled={w.pending || !supplier?.email} onClick={() => w.sendOrder(supplierId, items)}><Mail size={16} aria-hidden="true" /> Email purchase order</button>}
        </article>;
      })}
      {w.unassigned.length > 0 && <div className={s.unassigned}>
        <h3>Choose a supplier</h3>
        <p className={s.sectionNote}>These items need a supplier before you can order.</p>
        {w.unassigned.map((item) => <div className={s.assignRow} key={item.id}><div><strong>{item.name}</strong><span>Order {qty(item.suggestedOrder)} {item.unit}</span></div>{w.canWrite ? <label className={s.filterField}><span className={s.srOnly}>Supplier for {item.name}</span><span className="bp-sel"><select className="bp-sel-in" value="" disabled={w.pending} onChange={(e) => { if (e.target.value) w.assignSupplier(item, e.target.value); }}><option value="">Select supplier</option>{w.data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></span></label> : <span className={s.muted}>No supplier assigned</span>}</div>)}
        {w.canWrite && <button type="button" className={s.secondary} onClick={() => w.setSupplierOpen(true)}><Plus size={16} aria-hidden="true" /> Add supplier</button>}
      </div>}
    </> : <Empty title={w.data.rows.length ? "Nothing to order right now" : "No suggested orders yet"}>{w.data.rows.length ? "Your tracked materials cover current demand and reorder levels." : "Track your roofing materials and enter current stock to calculate what to order."}</Empty>}
    <div className={s.subsectionHeading}><h2>On the way</h2><span>{w.data.orders.length}</span></div>
    {w.data.orders.length === 0 ? <p className={s.sectionNote}>Sent purchase orders appear here until received.</p> : w.data.orders.map((order) => <article className={s.order} key={order.id}>
      <div className={s.orderHead}><h3>{order.supplier}</h3><span>{dayOf(order.sentAt)}</span></div>
      <ul className={s.orderLines}>{order.lines.map((line, index) => <li key={`${line.name}-${index}`}><span>{line.name}</span><strong>{qty(line.quantity)} <small>{w.data.rows.find((row) => row.name === line.name)?.unit}</small></strong></li>)}</ul>
      {w.canWrite && <button type="button" className={s.secondary} disabled={w.pending} onClick={() => w.receiveOrder(order.id)}><ArrowDownToLine size={16} aria-hidden="true" /> Receive full order</button>}
    </article>)}
  </section>;
}

function Jobs({ workspace: w }: Props) {
  return <section className={s.section} aria-label="Roofing jobs and proposals">
    <div className={s.sectionHeading}><h2>Jobs &amp; proposals</h2><span>{w.proposals.length}</span></div>
    {w.next && <div className={s.nextJob}>
      <div className={s.nextJobTop}><Truck size={18} aria-hidden="true" /><span>Next to load{w.next.startsAt ? ` · ${dayOf(w.next.startsAt)}` : ""}</span></div>
      <h3>{w.next.title}</h3>
      <p data-tone={w.nextShort ? "danger" : "neutral"}>{w.nextShort ? `${w.nextShort} material ${w.nextShort === 1 ? "line is" : "lines are"} short` : w.nextPick.length ? "Tracked materials are on hand" : "No material lines yet"}</p>
      <Link href={`/dashboard/jobs/${w.next.jobId}` as Route} className={s.textButton}>Open pick list<ArrowRight size={16} aria-hidden="true" /></Link>
    </div>}
    <label className={s.filterField}><span>Show proposals</span><span className="bp-sel"><select className="bp-sel-in" value={w.ptab} onChange={(e) => w.setPtab(e.target.value as InventoryWorkspace["ptab"])}>{w.ptabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label} ({tab.n})</option>)}</select></span></label>
    {w.proposals.length === 0 ? <Empty title="No roofing proposals yet" action={<Link className={s.secondary} href="/dashboard/roof-estimator">Open roofing estimator<ArrowRight size={16} aria-hidden="true" /></Link>}>Create an estimate to see its material needs here.</Empty> : w.listedProposals.length === 0 ? <Empty title="No proposals in this view">Choose another proposal status to see your work.</Empty> : <div className={s.proposals}>{w.listedProposals.map((proposal) => {
      const material = materialsOf(proposal, w.data.rows);
      return <article className={s.proposal} key={proposal.id}>
        <div className={s.proposalMeta}><span className={s.badge}>{statusLabel(proposal.status)}</span><strong>{usd(proposal.total)}</strong></div>
        <Link className={s.proposalTitle} href={`/dashboard/manual-blueprint?proposal=${proposal.id}` as Route}>{proposal.title}<ChevronRight size={18} aria-hidden="true" /></Link>
        <p>{proposal.client || "No client"} · {dayOf(proposal.createdAt)}</p>
        <div className={s.material} data-tone={material.tone}><ClipboardList size={16} aria-hidden="true" /><span>{material.text}</span></div>
        {proposal.inferred && <p className={s.inferred}>Matched by its roofing materials</p>}
        <div className={s.proposalActions}>
          {proposal.linked && proposal.jobId && (proposal.status === "ACCEPTED" || proposal.status === "COMPLETED") && <Link className={s.textButton} href={`/dashboard/jobs/${proposal.jobId}` as Route}>Pick list<ArrowRight size={16} aria-hidden="true" /></Link>}
          {w.canWrite && <button type="button" className={s.textButton} disabled={w.pending} onClick={() => w.linkProposal(proposal, !proposal.linked)}>{proposal.linked ? "Disconnect inventory" : "Connect inventory"}</button>}
        </div>
      </article>;
    })}</div>}
  </section>;
}

function supplierWebsite(value: string | null): string | null {
  if (!value || (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:/i.test(value))) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function Suppliers({ workspace: w }: Props) {
  return <section className={s.section} aria-label="Roofing suppliers">
    <div className={s.sectionHeading}><h2>Suppliers</h2>{w.canWrite && <button className={s.iconButton} type="button" aria-label="Add supplier" onClick={() => w.setSupplierOpen(true)}><Plus size={20} aria-hidden="true" /></button>}</div>
    {w.data.suppliers.length === 0 ? <Empty title="Where do you buy materials?" action={w.canWrite ? <button type="button" className={s.primary} onClick={() => w.setSupplierOpen(true)}><Plus size={16} aria-hidden="true" /> Add supplier</button> : undefined}>Add a supplier and their order email to send purchase orders from your stock list.</Empty> : <div className={s.suppliers}>{w.data.suppliers.map((supplier) => <article className={s.supplier} key={supplier.id}>
      <div className={s.orderHead}><h3>{supplier.name}</h3><span>{supplier.itemCount} {supplier.itemCount === 1 ? "item" : "items"}</span></div>
      {supplier.email ? <a className={s.contactLink} href={`mailto:${supplier.email}`}><Mail size={16} aria-hidden="true" /><span>{supplier.email}</span></a> : <p className={s.warningText}>No order email</p>}
      {supplier.phone && <a className={s.contactLink} href={`tel:${supplier.phone}`}><Phone size={16} aria-hidden="true" />{supplier.phone}</a>}
      {supplierWebsite(supplier.website) && <a className={s.textButton} href={supplierWebsite(supplier.website)!} target="_blank" rel="noreferrer">Supplier website<ArrowRight size={16} aria-hidden="true" /></a>}
    </article>)}</div>}
  </section>;
}

function Activity({ workspace: w }: Props) {
  return <section className={s.section} aria-label="Stock activity">
    <div className={s.sectionHeading}><h2>Stock activity</h2><span>{w.facts.windowDays} days</span></div>
    <dl className={s.valueSummary}><div><dt>Stock value</dt><dd>{usd(w.facts.value)}</dd></div><div><dt>Items with a cost</dt><dd>{w.facts.valued} of {w.facts.itemCount}</dd></div>{w.idleValue > 0 && <div><dt>Stock sitting idle</dt><dd>{usd(w.idleValue)}</dd></div>}</dl>
    {w.facts.recent.length === 0 ? <Empty title="No stock movements yet">Deliveries, stock counts, and materials loaded for jobs will appear here.</Empty> : <ol className={s.activityList}>{w.facts.recent.map((move) => <li key={move.id}>
      <div className={s.activityTop}><span>{moveLabel(move)}</span><time dateTime={move.at}>{ago(move.at)}</time></div>
      <div className={s.activityMain}><h3>{move.itemName}</h3><strong data-positive={move.quantity > 0 || undefined}>{move.quantity > 0 ? "+" : move.quantity < 0 ? "−" : ""}{qty(Math.abs(move.quantity))}<small>{move.unit}</small></strong></div>
      {move.actor && <p>{move.actor}</p>}
      {move.note && move.note !== "Counted" && <p>{move.note}</p>}
      {move.jobId && move.jobTitle && <Link className={s.textButton} href={`/dashboard/jobs/${move.jobId}` as Route}>{move.jobTitle}<ArrowRight size={16} aria-hidden="true" /></Link>}
    </li>)}</ol>}
  </section>;
}

function Sheet({ title, children, onClose, pending, returnFocus }: { title: string; children: ReactNode; onClose: () => void; pending: boolean; returnFocus: RefObject<HTMLElement | null> }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const pendingRef = useRef(pending);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    closeRef.current = onClose;
    pendingRef.current = pending;
  }, [onClose, pending]);

  useEffect(() => {
    const previous = returnFocus.current;
    const unlock = lockScroll();
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); panel.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); unlock(); previous?.focus({ preventScroll: true }); };
  }, [returnFocus]);

  return <motion.div className={s.sheetBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.16 }} onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <motion.div ref={panel} className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="roof-inventory-sheet-title" tabIndex={-1} initial={{ y: reduceMotion ? 0 : 24 }} animate={{ y: 0 }} exit={{ y: reduceMotion ? 0 : 24 }} transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 0.61, 0.36, 1] }}>
      <div className={s.sheetHeader}><h2 id="roof-inventory-sheet-title">{title}</h2><button type="button" className={s.iconButton} disabled={pending} aria-label="Close form" onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
      <div className={s.sheetBody}>{children}</div>
    </motion.div>
  </motion.div>;
}

export function RoofingInventoryMobile({ workspace: w }: Props) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const item = w.itemPanel?.itemId ? w.data.rows.find((row) => row.id === w.itemPanel?.itemId) : undefined;
  const sheetOpen = w.canWrite && Boolean(w.itemPanel || w.supplierOpen);
  const sheetTitle = w.supplierOpen ? "Supplier details" : w.itemPanel?.mode === "add" ? "Add stock item" : w.itemPanel?.mode === "receive" ? "Receive stock" : w.itemPanel?.mode === "count" ? "Count stock" : "Edit stock item";
  const closeSheet = () => { w.setItemPanel(null); w.setSupplierOpen(false); };
  return <div className={s.mobile} aria-busy={w.pending} onFocusCapture={(event) => { if (event.target instanceof HTMLElement && event.currentTarget.contains(event.target)) returnFocus.current = event.target; }}>
    <header className={s.header}><h1>Roofing inventory</h1>{w.canWrite && <button type="button" className={s.addButton} aria-label="Add inventory item" disabled={w.pending} onClick={() => w.setItemPanel({ mode: "add" })}><Plus size={20} aria-hidden="true" /></button>}</header>
    {!w.canWrite && <p className={s.readOnly}>View only · Stock changes are managed by your office.</p>}
    {w.needs.length > 0 ? <div className={s.attention}>
      <div><h2>{w.needs.length} {w.needs.length === 1 ? "item needs" : "items need"} ordering</h2><p>{w.soldShort ? `${w.soldShort} short for sold jobs` : "Keep the next job supplied"}{w.data.orders.length ? ` · ${w.data.orders.length} ${w.data.orders.length === 1 ? "order" : "orders"} on the way` : ""}</p></div>
      <button type="button" className={s.primary} onClick={() => w.setTab("orders")}>Review orders<ArrowRight size={18} aria-hidden="true" /></button>
    </div> : w.data.rows.length > 0 && <div className={s.covered}><Check size={18} aria-hidden="true" /><span>Tracked material needs are covered.</span>{w.data.orders.length > 0 && <button type="button" className={s.textButton} onClick={() => w.setTab("orders")}>{w.data.orders.length} on the way<ArrowRight size={16} aria-hidden="true" /></button>}</div>}
    <nav className={s.nav} aria-label="Inventory sections">{destinations.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={w.tab === id ? "page" : undefined} onClick={() => w.setTab(id)}><Icon size={19} aria-hidden="true" /><span>{label}</span>{id === "orders" && w.data.orders.length > 0 && <i aria-label={`${w.data.orders.length} pending orders`} />}</button>)}</nav>
    {(w.error || w.note) && !sheetOpen && <div className={s.feedback} data-error={Boolean(w.error)} role={w.error ? "alert" : "status"}><span>{w.error || w.note}</span><button className={s.iconButton} type="button" aria-label="Dismiss message" onClick={w.dismissFeedback}><X size={18} aria-hidden="true" /></button></div>}
    {w.tab === "stock" && <Stock workspace={w} />}
    {w.tab === "orders" && <Orders workspace={w} />}
    {w.tab === "proposals" && <Jobs workspace={w} />}
    {w.tab === "suppliers" && <Suppliers workspace={w} />}
    {w.tab === "activity" && <Activity workspace={w} />}
    {typeof document !== "undefined" && createPortal(<AnimatePresence>{sheetOpen && <Sheet key="inventory-form" title={sheetTitle} onClose={closeSheet} pending={w.pending} returnFocus={returnFocus}>
      {item && <p className={s.sheetItemName}>{item.name}</p>}
      {w.error && <div className={s.feedback} data-error="true" role="alert">{w.error}</div>}
      {w.supplierOpen ? <InventorySupplierForm workspace={w} compact /> : <InventoryItemForm key={`${w.itemPanel?.mode}-${w.itemPanel?.itemId ?? "new"}`} workspace={w} compact />}
    </Sheet>}</AnimatePresence>, document.body)}
  </div>;
}

export default RoofingInventoryMobile;

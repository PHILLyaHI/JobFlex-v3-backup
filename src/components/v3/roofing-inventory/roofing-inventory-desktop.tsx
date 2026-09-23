"use client";

import { Fragment, memo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
const InventoryItemDialog = dynamic(() => import("./inventory-item-dialog"), { ssr: false });
import type { Route } from "next";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Clock3, FileText, Package, Plus, Search, Send, Store, Truck, X, type LucideIcon } from "lucide-react";
import { InventorySupplierForm } from "./roofing-inventory-forms";
import { ago, dayOf, materialsOf, moveLabel, qty, statusLabel, stockStatus, usd, type InventoryRow, type InventoryTab, type InventoryWorkspace } from "./roofing-inventory-model";
import s from "./roofing-inventory-desktop.module.css";

const TABS: Array<{ id: InventoryTab; label: string; icon: LucideIcon }> = [
  { id: "stock", label: "Stock", icon: Package },
  { id: "orders", label: "Orders", icon: Truck },
  { id: "proposals", label: "Jobs & proposals", icon: FileText },
  { id: "suppliers", label: "Suppliers", icon: Store },
  { id: "activity", label: "Activity", icon: Clock3 },
];

export default function RoofingInventoryDesktop({ workspace: w }: { workspace: InventoryWorkspace }) {
  return <div className={s.workspace}>
    <Link href={w.estimatorHref} className={s.back}><ArrowLeft size={16} />{w.tradeLabel} estimator</Link>
    <header className={s.header}>
      <h1>{w.tradeLabel} inventory</h1>
      <div className={s.headerActions}>{!w.canWrite && <span className={s.readOnly}>View only</span>}{w.canWrite && <button className={s.primary} type="button" onClick={() => { w.setTab("stock"); w.setItemPanel({ mode: "add" }); }}><Plus size={18} />Add item</button>}</div>
    </header>
    <div className={s.summary}>
      <span><strong>{w.stocked}</strong> items in stock</span>
      <span><strong>{usd(w.facts.value)}</strong> stock value <small>{w.facts.valued} of {w.facts.itemCount} items priced</small></span>
      <button type="button" onClick={() => w.setTab("orders")}><strong>{w.data.orders.length}</strong> orders on the way <ArrowRight size={14} /></button>
      <button type="button" onClick={() => { w.setTab("proposals"); w.setPtab("SOLD"); }}><strong>{w.data.pipeline.sold}</strong> sold jobs to load <ArrowRight size={14} /></button>
    </div>
    {(w.error || w.note) && <div className={s.feedback} data-tone={w.error ? "danger" : "success"} role={w.error ? "alert" : "status"}><span>{w.error ?? w.note}</span><button type="button" aria-label="Dismiss message" onClick={w.dismissFeedback}><X size={18} /></button></div>}
    <nav className={s.tabs} aria-label="Inventory workspace">{TABS.map(({ icon: Icon, ...tab }) => <button key={tab.id} type="button" aria-current={w.tab === tab.id ? "page" : undefined} onClick={() => w.setTab(tab.id)}><Icon size={18} aria-hidden="true" />{tab.label}{tab.id === "orders" && w.needs.length > 0 && <span>{w.needs.length}</span>}</button>)}</nav>
    {w.canWrite && w.itemPanel && <InventoryItemDialog workspace={w} />}
    <div aria-busy={w.pending}>
      {w.tab === "stock" && <StockWorkspace workspace={w} />}
      {w.tab === "orders" && <OrdersWorkspace workspace={w} />}
      {w.tab === "proposals" && <ProposalsWorkspace workspace={w} />}
      {w.tab === "suppliers" && <SuppliersWorkspace workspace={w} />}
      {w.tab === "activity" && <ActivityWorkspace workspace={w} />}
    </div>
  </div>;
}

function StockWorkspace({ workspace: w }: { workspace: InventoryWorkspace }) {
  const cols = w.canWrite ? 7 : 6;
  return <>
    {(w.needs.length > 0 || w.next) && <div className={s.attention}>
      {w.needs.length > 0 ? <div><strong>{w.needs.length} {w.needs.length === 1 ? "item needs" : "items need"} ordering</strong><span>{w.soldShort ? `${w.soldShort} short for sold jobs` : "Below reorder level or needed for open proposals"}{w.orderCost > 0 ? ` · about ${usd(w.orderCost)} at last cost` : ""}</span></div> : <div><strong>{w.data.rows.length ? "No tracked items need ordering" : "Add materials to check stock coverage"}</strong><span>{w.data.untracked.length ? `${w.data.untracked.length} proposal material lines are not tracked yet.` : "No stock shortages recorded."}</span></div>}
      {w.next && <div className={s.nextJob}><span>Next load{w.next.startsAt ? ` · ${dayOf(w.next.startsAt)}` : " · unscheduled"}</span><Link href={`/dashboard/jobs/${w.next.jobId}` as Route}>{w.next.title}</Link><span data-tone={w.nextShort ? "danger" : "neutral"}>{w.nextShort ? `${w.nextShort} material lines short` : w.nextPick.some((line) => !line.itemId) ? `${w.nextPick.filter((line) => !line.itemId).length} untracked material lines` : w.nextPick.length ? "Materials covered" : "No material lines"}</span></div>}
      {w.needs.length > 0 && <button type="button" className={s.secondary} onClick={() => w.setTab("orders")}>Review orders<ArrowRight size={16} /></button>}
    </div>}
    <section className={s.surface} aria-label={`${w.tradeLabel} stock`}>
      <div className={s.toolbar}><label className={s.search}><Search size={18} /><input aria-label="Find an item or supplier" placeholder="Find an item or supplier" value={w.q} onChange={(event) => w.setQ(event.target.value)} />{w.q && <button type="button" aria-label="Clear search" onClick={() => w.setQ("")}><X size={16} /></button>}</label><label className={s.sort}>Group by<span className="bp-sel"><select className="bp-sel-in" value={w.view} onChange={(event) => w.setView(event.target.value as "urgency" | "category")}><option value="urgency">Urgency</option><option value="category">Category</option></select></span></label></div>
      <div className={s.filters} role="group" aria-label="Filter inventory">{w.chips.map((chip) => <button key={chip.id} type="button" aria-pressed={w.filter === chip.id} onClick={() => w.setFilter(chip.id)}>{chip.label}<span>{chip.n}</span></button>)}</div>
      {w.filter === "IDLE" && <p className={s.filterNote}>No use or demand in the last {w.facts.windowDays} days{w.idleValue > 0 ? ` · ${usd(w.idleValue)} at last cost` : ""}.</p>}
      {w.data.rows.length === 0 ? <div className={s.empty}><h3>Start your {w.tradeLabel} stock list</h3><p>Add the estimator&apos;s standard materials, then enter the stock you have on hand.</p>{w.canWrite && <div className={s.emptyActions}>{w.data.presets.missing > 0 && <button type="button" className={s.primary} disabled={w.pending} onClick={w.seedItems}><Plus size={16} />Add {w.data.presets.missing} standard items</button>}<button type="button" className={s.secondary} onClick={() => w.setItemPanel({ mode: "add" })}>Add an item manually</button></div>}</div> : <div className={s.tableScroll}><table className={s.table} aria-label={`${w.tradeLabel} inventory`}><thead><tr><th className={s.itemColumn} scope="col">Material</th><th scope="col" className={s.number}>On hand</th><th scope="col" className={s.number}>Reserved</th><th scope="col" className={s.number}>Available</th><th scope="col" className={s.number}>Forecast</th><th scope="col">Status</th>{w.canWrite && <th scope="col"><span className={s.srOnly}>Actions</span></th>}</tr></thead><tbody>
        {w.sections.map((section) => <Fragment key={section.label ?? "all"}>{section.label && <tr className={s.category}><th colSpan={cols} scope="rowgroup">{section.label}<span>{section.items.length} items{section.needs ? ` · ${section.needs} to order` : ""}</span></th></tr>}{section.items.map((row) => <StockTableRow key={row.r.id} row={row} facts={w.facts} canWrite={w.canWrite} onManage={w.setItemPanel} />)}</Fragment>)}
        {w.shown.length === 0 && <tr><td colSpan={cols}><div className={s.empty}><h3>No items match</h3><p>{w.q ? `No results for “${w.q.trim()}”. Try a material name, supplier, or SKU.` : "There are no items in this filter."}</p><button type="button" className={s.secondary} onClick={() => { w.setQ(""); w.setFilter("ALL"); }}>Show all items</button></div></td></tr>}
      </tbody></table></div>}
      {w.data.rows.length > 0 && <div className={s.tableFoot}><span><strong>Available</strong> = on hand − reserved for sold jobs</span><span><strong>Forecast</strong> = open proposals if they sell</span></div>}
    </section>
    {w.canWrite && (w.data.presets.missing > 0 || w.data.untracked.length > 0) && <details className={s.setup}><summary>Complete your material list<span>{w.data.presets.missing} standard items missing{w.data.untracked.length ? ` · ${w.data.untracked.length} untracked proposal lines` : ""}</span><ChevronDown size={16} /></summary><div className={s.setupBody}>
      {w.data.presets.missing > 0 && <div className={s.setupRow}><div><h3>Standard {w.tradeLabel} materials</h3><p>{w.data.presets.missing} of {w.data.presets.total} estimator materials are missing. Add them with zero stock, then receive what you have.</p></div><button className={s.secondary} type="button" disabled={w.pending} onClick={w.seedItems}>Add {w.data.presets.missing} items</button></div>}
      {w.data.untracked.length > 0 && <div className={s.untracked}><div className={s.sectionHeading}><h3>Proposal materials not tracked</h3><button className={s.textButton} type="button" disabled={w.pending} onClick={w.trackAllItems}>Track all {w.data.untracked.length}</button></div><div className={s.trackItems}>{w.data.untracked.map((line) => <button key={line.name} type="button" disabled={w.pending} onClick={() => w.trackItem(line)}><Plus size={14} />{line.name}</button>)}</div></div>}
    </div></details>}
  </>;
}

const StockTableRow = memo(function StockTableRow({ facts, canWrite, onManage, row: { r, st } }: { facts: InventoryWorkspace["facts"]; canWrite: boolean; onManage: InventoryWorkspace["setItemPanel"]; row: InventoryRow }) {
  const status = stockStatus(r, st);
  const fact = facts.items[r.id];
  const days = fact && fact.usedPerDay > 0 && r.available > 0 ? Math.round(r.available / fact.usedPerDay) : null;
  return <Fragment><tr data-stock-row={r.id} data-state={st}>
    <td><strong className={s.itemName}>{r.name}</strong><span className={s.itemMeta}>{r.unit} · {r.supplierName ?? "No supplier"}{r.supplierSku ? ` · ${r.supplierSku}` : ""}</span>{days != null && <span className={s.itemMeta}>About {days > 999 ? "a year+" : `${days} days`} at current use</span>}</td>
    <td className={s.number}>{qty(r.onHand)}</td><td className={s.number}>{r.reserved ? qty(r.reserved) : <span className={s.zero}>0</span>}</td><td className={`${s.number} ${s.available}`} data-tone={r.available < 0 ? "danger" : undefined}>{qty(r.available)}</td><td className={s.number}>{r.forecast ? qty(r.forecast) : <span className={s.zero}>0</span>}</td>
    <td><span className={s.status} data-tone={status.tone}>{status.text}</span><span className={s.itemMeta}>{r.suggestedOrder > 0 ? `Order ${qty(r.suggestedOrder)} ${r.unit}` : r.threshold > 0 ? `Reorder at ${qty(r.threshold)}` : ""}</span></td>
    {canWrite && <td className={s.actionCell}><button type="button" className={s.manage} aria-haspopup="dialog" aria-label={`Manage ${r.name}`} onClick={() => onManage({ mode: "receive", itemId: r.id })}>Manage<ChevronRight size={16} /></button></td>}
  </tr></Fragment>;
});

function OrdersWorkspace({ workspace: w }: { workspace: InventoryWorkspace }) {
  return <div className={s.sections}>
    <section className={s.surface}><div className={s.sectionHeading}><div><h2>Orders on the way <span>{w.data.orders.length}</span></h2><p>Mark an order received when the full delivery arrives.</p></div></div>{w.data.orders.length ? w.data.orders.map((order) => <div key={order.id} className={s.delivery}><div><h3>{order.supplier}</h3><span className={s.meta}>Sent {ago(order.sentAt)} · {order.lines.length} material lines</span><details><summary>View order<ChevronDown size={14} /></summary><ul>{order.lines.map((line, index) => <li key={`${line.name}-${index}`}><span>{line.name}</span><strong>{qty(line.quantity)}</strong></li>)}</ul></details></div>{w.canWrite && <button type="button" className={s.secondary} disabled={w.pending} onClick={() => w.receiveOrder(order.id)}><Check size={16} />Receive order</button>}</div>) : <p className={s.quietEmpty}>No purchase orders are awaiting delivery.</p>}</section>
    <section className={s.surface}><div className={s.sectionHeading}><div><h2>Suggested orders <span>{w.needs.length} items</span></h2><p>Quantities cover sold jobs, open proposals, and the reorder level.{w.orderCost > 0 ? ` Estimated ${usd(w.orderCost)} at last cost.` : ""}</p></div></div>
      {w.needs.length === 0 && <div className={s.empty}><h3>{w.data.rows.length ? "No suggested orders" : "Add materials to see what to order"}</h3><p>{w.data.rows.length ? `Tracked stock covers the work and reorder levels.${w.data.untracked.length ? ` ${w.data.untracked.length} proposal material lines are not tracked yet.` : ""}` : "Your stock list is empty. Add materials and current quantities to calculate shortages."}</p>{w.data.rows.length === 0 && <button className={s.secondary} type="button" onClick={() => w.setTab("stock")}>Open stock list<ArrowRight size={16} /></button>}</div>}
      {[...w.bySupplier.entries()].map(([supplierId, items]) => { const supplier = w.data.suppliers.find((x) => x.id === supplierId); return <div key={supplierId} className={s.orderGroup}><div className={s.orderHeading}><div><h3>{supplier?.name ?? "Supplier"}</h3>{supplier?.email ? <span className={s.meta}>{supplier.email}</span> : <span className={s.missingEmail}>No email for purchase orders. <button type="button" onClick={() => w.setTab("suppliers")}>Open suppliers</button></span>}</div>{w.canWrite && <button type="button" className={s.primary} disabled={w.pending || !supplier?.email} onClick={() => w.sendOrder(supplierId, items)}><Send size={16} />Email order · {items.length} lines</button>}</div><ul className={s.orderItems}>{items.map((r) => <li key={r.id}><div><strong>{r.name}</strong>{r.supplierSku && <span>{r.supplierSku}</span>}</div><span>{qty(r.suggestedOrder)} <small>{r.unit}</small></span></li>)}</ul></div>; })}
      {w.unassigned.length > 0 && <div className={s.orderGroup}><div className={s.orderHeading}><div><h3>Choose a supplier <span>{w.unassigned.length} items</span></h3><p>Assign each material to include it in a supplier&apos;s order.</p></div>{w.canWrite && <button className={s.secondary} type="button" onClick={() => { w.setTab("suppliers"); w.setSupplierOpen(true); }}><Plus size={16} />Add supplier</button>}</div><ul className={s.orderItems}>{w.unassigned.map((r) => <li key={r.id}><div><strong>{r.name}</strong><span>{qty(r.suggestedOrder)} {r.unit} to order</span></div>{w.canWrite && w.data.suppliers.length > 0 && <span className={`bp-sel ${s.supplierSelect}`}><select className="bp-sel-in" aria-label={`Supplier for ${r.name}`} value="" disabled={w.pending} onChange={(event) => { if (event.target.value) w.assignSupplier(r, event.target.value); }}><option value="">Choose supplier</option>{w.data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></span>}</li>)}</ul>{w.data.suppliers.length === 0 && <p className={s.meta}>Add a supplier with an email address to send purchase orders.</p>}</div>}
    </section>
  </div>;
}

function ProposalsWorkspace({ workspace: w }: { workspace: InventoryWorkspace }) {
  return <section className={s.surface}><div className={s.sectionHeading}><div><h2>Jobs & proposals</h2><p>Sold work reserves stock. Open proposals forecast what you may need.</p></div><Link href={w.estimatorHref} className={s.secondary}>Open estimator<ArrowRight size={16} /></Link></div><div className={s.filters} role="group" aria-label={`Filter ${w.tradeLabel} proposals`}>{w.ptabs.map((tab) => <button key={tab.id} type="button" aria-pressed={w.ptab === tab.id} onClick={() => w.setPtab(tab.id)}>{tab.label}<span>{tab.n}</span></button>)}</div>{w.listedProposals.length === 0 ? <div className={s.empty}><h3>{w.proposals.length ? "No proposals in this view" : `No ${w.tradeLabel} proposals yet`}</h3><p>{w.proposals.length ? "Choose another filter to see your work." : `Proposals created in the ${w.tradeLabel} estimator will appear here.`}</p></div> : <div className={s.tableScroll}><table className={s.table} aria-label={`${w.tradeLabel} proposals`}><thead><tr><th scope="col">Proposal</th><th scope="col">Status</th><th scope="col">Material coverage</th><th scope="col" className={s.number}>Total</th>{w.canWrite && <th scope="col">Inventory</th>}</tr></thead><tbody>{w.listedProposals.map((proposal) => { const material = materialsOf(proposal, w.data.rows); return <tr key={proposal.id}><td><Link className={s.proposalName} href={`/dashboard/manual-blueprint?proposal=${proposal.id}` as Route}>{proposal.title}</Link><span className={s.itemMeta}>{proposal.client ?? "No client"} · {dayOf(proposal.createdAt)} · {proposal.lines.length} material lines</span>{proposal.inferred && <span className={s.itemMeta}>Matched by its materials</span>}</td><td><span className={s.proposalStatus}>{statusLabel(proposal.status)}</span>{proposal.linked && proposal.status === "ACCEPTED" && <span className={s.itemMeta}>{proposal.loaded ? "Loaded" : "Reserved in stock"}</span>}</td><td><span className={s.coverage} data-tone={material.tone}>{material.text}</span>{proposal.linked && proposal.jobId && (proposal.status === "ACCEPTED" || proposal.status === "COMPLETED") && <div className={s.itemMeta}>{proposal.jobStartsAt ? `${dayOf(proposal.jobStartsAt)} · ` : ""}<Link href={`/dashboard/jobs/${proposal.jobId}` as Route}>Open pick list<ArrowRight size={12} /></Link></div>}</td><td className={s.number}>{usd(proposal.total)}</td>{w.canWrite && <td><button type="button" className={s.textButton} disabled={w.pending} onClick={() => w.linkProposal(proposal, !proposal.linked)}>{proposal.linked ? "Disconnect" : "Connect"}</button></td>}</tr>; })}</tbody></table></div>}</section>;
}

function SuppliersWorkspace({ workspace: w }: { workspace: InventoryWorkspace }) {
  return <section className={s.surface}><div className={s.sectionHeading}><div><h2>Suppliers <span>{w.data.suppliers.length}</span></h2><p>Contact details and purchase order destinations.</p></div>{w.canWrite && !w.supplierOpen && <button className={s.primary} type="button" onClick={() => w.setSupplierOpen(true)}><Plus size={16} />Add supplier</button>}</div>{w.supplierOpen && <div className={s.supplierForm}><InventorySupplierForm workspace={w} /></div>}{w.data.suppliers.length ? <div className={s.tableScroll}><table className={s.table} aria-label="Inventory suppliers"><thead><tr><th scope="col">Supplier</th><th scope="col">Email for orders</th><th scope="col">Phone</th><th scope="col" className={s.number}>Items</th><th scope="col">Website</th></tr></thead><tbody>{w.data.suppliers.map((supplier) => <tr key={supplier.id}><td><strong>{supplier.name}</strong></td><td>{supplier.email ?? <span className={s.missingEmail}>No email on file</span>}</td><td>{supplier.phone ?? <span className={s.zero}>—</span>}</td><td className={s.number}>{supplier.itemCount}</td><td>{supplier.website ? <a className={s.textLink} href={supplier.website.startsWith("http") ? supplier.website : `https://${supplier.website}`} target="_blank" rel="noreferrer">Order online<ArrowRight size={14} /></a> : <span className={s.zero}>—</span>}</td></tr>)}</tbody></table></div> : <div className={s.empty}><h3>Add your first supplier</h3><p>A supplier with an email address can receive purchase orders from this workspace.</p></div>}</section>;
}

function ActivityWorkspace({ workspace: w }: { workspace: InventoryWorkspace }) {
  return <section className={s.surface}><div className={s.sectionHeading}><div><h2>Stock activity</h2><p>Recent movements from the last {w.facts.windowDays} days.</p></div></div>{w.facts.recent.length === 0 ? <div className={s.empty}><h3>No stock movements yet</h3><p>Deliveries, physical counts, and materials loaded for jobs will appear here.</p></div> : <ol className={s.activity}>{w.facts.recent.map((move) => <li key={move.id}><span className={s.movement}>{moveLabel(move)}</span><div><strong>{move.itemName}</strong><div className={s.itemMeta}>{move.actor}{move.jobId && move.jobTitle && <>{move.actor ? " · " : ""}<Link href={`/dashboard/jobs/${move.jobId}` as Route}>{move.jobTitle}</Link></>}{move.note && move.note !== "Counted" && <>{move.actor || move.jobTitle ? " · " : ""}{move.note}</>}</div></div><span className={s.movementQty}>{move.quantity > 0 ? "+" : move.quantity < 0 ? "−" : ""}{qty(Math.abs(move.quantity))} <small>{move.unit}</small></span><time dateTime={move.at} title={new Date(move.at).toLocaleString("en-US")}>{ago(move.at)}</time></li>)}</ol>}</section>;
}

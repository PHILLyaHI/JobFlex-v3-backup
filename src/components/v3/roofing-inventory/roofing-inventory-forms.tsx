"use client";

import { useState } from "react";
import { ago, qty, type InventoryWorkspace } from "./roofing-inventory-model";
import s from "./roofing-inventory-forms.module.css";

export function InventoryItemForm({ workspace: w, compact = false }: { workspace: InventoryWorkspace; compact?: boolean }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const panel = w.itemPanel;
  if (!panel || !w.canWrite) return null;
  const item = w.data.rows.find((r) => r.id === panel.itemId);
  const fact = item ? w.facts.items[item.id] : undefined;
  const isQuantity = panel.mode === "receive" || panel.mode === "count";
  if (panel.mode !== "add" && !item) return null;

  return (
    <form className={`${s.form} ${compact ? s.compact : ""}`} onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const value = (key: string) => String(form.get(key) ?? "").trim();
      if (isQuantity && item) {
        const quantity = Number(value("quantity"));
        if (value("quantity") === "" || !Number.isFinite(quantity) || quantity < 0 || (panel.mode === "receive" && quantity === 0)) return;
        if (panel.mode === "count") w.countItem(item, quantity);
        else w.receiveItem(item, quantity);
        return;
      }
      w.saveItem({ name: item?.name ?? value("name"), unit: value("unit") || "each", ...(panel.mode === "add" ? { onHand: Number(value("onHand")) || 0 } : {}), reorderPoint: value("reorder") === "" ? null : Number(value("reorder")), supplierId: value("supplier") || null, supplierSku: value("sku") || null, lastCost: value("cost") === "" ? null : Number(value("cost")) });
    }}>
      {isQuantity && item ? (
        <div className={s.quantityFields}>
          <p className={s.helper}>On hand: <strong>{qty(item.onHand)} {item.unit}</strong>{panel.mode === "count" ? ". Enter the total you counted on the shelf." : ". Enter the quantity that arrived."}</p>
          <label className={s.field}>{panel.mode === "count" ? "Counted on hand" : "Quantity received"}<span className={s.quantityInput}><input autoFocus required name="quantity" type="number" step="any" min={panel.mode === "count" ? 0 : "0.01"} placeholder="0" defaultValue={panel.mode === "count" ? item.onHand : undefined} /><span>{item.unit}</span></span></label>
        </div>
      ) : (
        <div className={s.grid}>
          {panel.mode === "add" && <label className={`${s.field} ${s.wide}`}>Item name<input autoFocus required name="name" maxLength={120} placeholder={w.data.trade === "roof" ? "Architectural shingles" : w.data.trade === "fence" ? "Cedar fence pickets" : "Air filter"} /></label>}
          <label className={s.field}>Unit<input autoFocus={panel.mode === "edit"} name="unit" required maxLength={24} defaultValue={item?.unit ?? "each"} placeholder="bundle, roll, each" /></label>
          {panel.mode === "add" && <label className={s.field}>On hand<input name="onHand" type="number" step="any" min="0" defaultValue="0" /></label>}
          <label className={s.field}>Reorder at<input name="reorder" type="number" step="any" min="0" defaultValue={item?.reorderPoint ?? ""} placeholder={item ? `Automatic · ${qty(item.threshold)}` : "Automatic"} /><small>Leave blank to cover the biggest job.</small></label>
          <label className={s.field}>Last cost per unit<input name="cost" type="number" step="any" min="0" defaultValue={fact?.lastCost ?? ""} placeholder="0.00" /></label>
          <label className={s.field}>Supplier<span className="bp-sel"><select name="supplier" className="bp-sel-in" defaultValue={item?.supplierId ?? ""}><option value="">No supplier</option>{w.data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></span></label>
          <label className={s.field}>Supplier SKU<input name="sku" defaultValue={item?.supplierSku ?? ""} placeholder="Optional" /></label>
        </div>
      )}
      {panel.mode === "edit" && item && <dl className={s.facts}>
        <div><dt>Reorder line</dt><dd>{qty(item.threshold)} {item.unit}{item.reorderPoint == null ? " · automatic" : ""}</dd></div>
        <div><dt>Last count</dt><dd>{fact?.lastCountAt ? ago(fact.lastCountAt) : "Never counted"}</dd></div>
        <div><dt>Used in {w.facts.windowDays} days</dt><dd>{qty(fact?.used ?? 0)} {item.unit}</dd></div>
        <div><dt>Received in {w.facts.windowDays} days</dt><dd>{qty(fact?.received ?? 0)} {item.unit}</dd></div>
        {fact?.lastMoveAt && <div><dt>Last movement</dt><dd>{ago(fact.lastMoveAt)}</dd></div>}
      </dl>}
      <div className={s.actions}>
        <button className={s.primary} type="submit" disabled={w.pending}>{w.pending ? "Saving…" : panel.mode === "receive" ? "Receive stock" : panel.mode === "count" ? "Set count" : panel.mode === "add" ? "Add item" : "Save changes"}</button>
        <button className={s.secondary} type="button" disabled={w.pending} onClick={() => w.setItemPanel(null)}>Cancel</button>
        {panel.mode === "edit" && !confirmRemove && <button className={s.remove} type="button" disabled={w.pending} onClick={() => setConfirmRemove(true)}>Remove item</button>}
      </div>
      {confirmRemove && item && <div className={s.confirm} role="alert"><p>Remove <strong>{item.name}</strong> and its inventory history?</p><div className={s.actions}><button className={s.danger} type="button" disabled={w.pending} onClick={() => w.removeItem(item)}>Yes, remove item</button><button className={s.secondary} type="button" onClick={() => setConfirmRemove(false)}>Keep item</button></div></div>}
    </form>
  );
}

export function InventorySupplierForm({ workspace: w, compact = false }: { workspace: InventoryWorkspace; compact?: boolean }) {
  if (!w.canWrite || !w.supplierOpen) return null;
  return <form className={`${s.form} ${compact ? s.compact : ""}`} onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    w.saveSupplier({ name: value("name"), email: value("email"), phone: value("phone"), website: value("website") });
  }}><div className={s.grid}>
    <label className={s.field}>Supplier name<input name="name" autoFocus required maxLength={120} placeholder="ABC Supply" /></label>
    <label className={s.field}>Email for purchase orders<input name="email" type="email" placeholder="orders@supplier.com" /></label>
    <label className={s.field}>Phone<input name="phone" type="tel" placeholder="Optional" /></label>
    <label className={s.field}>Website<input name="website" placeholder="Optional" /></label>
  </div><div className={s.actions}><button className={s.primary} type="submit" disabled={w.pending}>{w.pending ? "Saving…" : "Add supplier"}</button><button className={s.secondary} type="button" disabled={w.pending} onClick={() => w.setSupplierOpen(false)}>Cancel</button></div></form>;
}

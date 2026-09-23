"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { lockScroll } from "@/lib/scrollLock";
import { InventoryItemForm } from "./roofing-inventory-forms";
import type { InventoryWorkspace } from "./roofing-inventory-model";
import s from "./roofing-inventory-desktop.module.css";

export default function InventoryItemDialog({ workspace: w }: { workspace: InventoryWorkspace }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement as HTMLElement | null;
    const unlock = lockScroll();
    dialog?.showModal();
    return () => { dialog?.close(); unlock(); trigger?.focus({ preventScroll: true }); };
  }, []);
  const item = w.data.rows.find((row) => row.id === w.itemPanel?.itemId);
  return createPortal(<dialog ref={ref} className={`${s.workspace} ${s.itemDialog}`} aria-labelledby="inventory-item-title"
    onCancel={(event) => { event.preventDefault(); if (!w.pending) w.setItemPanel(null); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget || w.pending) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) w.setItemPanel(null);
    }}>
    <div className={s.sectionHeading}><h2 id="inventory-item-title">{item ? item.name : "Add inventory item"}</h2><button className={s.iconButton} type="button" disabled={w.pending} aria-label="Close stock form" onClick={() => w.setItemPanel(null)}><X size={20} /></button></div>
    <div className={s.dialogBody}>
      {item && <div className={s.modeSwitch} role="group" aria-label="Stock action">{(["receive", "count", "edit"] as const).map((mode) => <button key={mode} type="button" disabled={w.pending} aria-pressed={w.itemPanel?.mode === mode} onClick={() => w.setItemPanel({ mode, itemId: item.id })}>{mode === "receive" ? "Receive" : mode === "count" ? "Count stock" : "Edit item"}</button>)}</div>}
      {w.error && <p role="alert" className={s.feedback} data-tone="danger">{w.error}</p>}
      <InventoryItemForm key={`${w.itemPanel?.mode}-${item?.id ?? "new"}`} workspace={w} />
    </div>
  </dialog>, document.body);
}

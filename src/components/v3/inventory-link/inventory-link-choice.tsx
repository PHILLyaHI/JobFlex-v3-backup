"use client";

// CONNECT TO INVENTORY, OR NOT (2026-09-20) — the visual choice an estimate
// is created with. Two cards: connected (materials reserved when it sells,
// forecast while open, on the crew's pick list) or estimate only (nothing
// reserved; the contractor orders on their own). Smart default: connected
// when the company keeps stock for the trade, estimate-only when it keeps
// none — asked once from the server when the choice first shows. The parent
// owns the value (null until decided) and sends it with the estimate.

import { useEffect, useState } from "react";
import { inventoryLinkDefault } from "@/actions/inventoryLink";
import s from "./inventory-link-choice.module.css";

const LABEL: Record<string, string> = { roof: "roofing", fence: "fence", hvac: "HVAC" };

export function InventoryLinkChoice({ trade, value, onChange, compact }: { trade: string | null; value: boolean | null; onChange: (v: boolean) => void; compact?: boolean }) {
  const [items, setItems] = useState<{ items: number; perJob: number } | null>(null);
  useEffect(() => {
    let live = true;
    inventoryLinkDefault(trade).then((d) => {
      if (!live) return;
      setItems({ items: d.items, perJob: d.perJob });
      if (value === null) onChange(d.linked);
    });
    return () => {
      live = false;
    };
    // Asked once: the trade does not change under a form, and the parent keeps the choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade]);
  const noun = LABEL[trade ?? ""] ?? "";
  const on = value === true;
  return (
    <div className={`${s.w}${compact ? ` ${s.compact}` : ""}`} data-inventory-link role="radiogroup" aria-label="Inventory">
      <div className={s.head}>
        Inventory
        {items != null && (
          <span className={s.hint}>
            {items.items > 0
              ? `you keep ${items.items - items.perJob} ${noun} item${items.items - items.perJob === 1 ? "" : "s"} in stock${items.perJob ? ` · ${items.perJob} bought per job` : ""}`
              : `no ${noun || ""} stock yet`.replace("  ", " ")}
          </span>
        )}
      </div>
      <div className={s.opts}>
        <button type="button" role="radio" aria-checked={on} className={`${s.opt}${on ? ` ${s.on}` : ""}`} onClick={() => onChange(true)}>
          <span className={s.dot} />
          <span className={s.body}>
            <b>Connect to inventory</b>
            <span>Materials come off the {noun || "warehouse"} shelf: reserved when it sells, forecast while it is open, on the crew&apos;s pick-up list.</span>
          </span>
        </button>
        <button type="button" role="radio" aria-checked={value === false} className={`${s.opt}${value === false ? ` ${s.on}` : ""}`} onClick={() => onChange(false)}>
          <span className={s.dot} />
          <span className={s.body}>
            <b>Estimate only</b>
            <span>Nothing is reserved. You order everything yourself; the proposal still goes to the client the same way.</span>
          </span>
        </button>
      </div>
    </div>
  );
}

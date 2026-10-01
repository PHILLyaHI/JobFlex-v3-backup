"use client";

// DEMO COPY (2026-10-01) of src/components/v3/inventory-link/inventory-link-choice.tsx:
// the same markup and the same stylesheet; the one change is the default,
// which the real one asks the server for (actions/inventoryLink) — here a
// shop with no stock yet, so "Estimate only" is the smart default.

import { useEffect, useState } from "react";
import s from "@/components/v3/inventory-link/inventory-link-choice.module.css";

const LABEL: Record<string, string> = { roof: "roofing", fence: "fence", hvac: "HVAC" };
const DEMO_DEFAULT = { linked: false, items: 0, perJob: 0 };

export function InventoryLinkChoice({ trade, value, onChange, compact }: { trade: string | null; value: boolean | null; onChange: (v: boolean) => void; compact?: boolean }) {
  const [items, setItems] = useState<{ items: number; perJob: number } | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setItems({ items: DEMO_DEFAULT.items, perJob: DEMO_DEFAULT.perJob });
      if (value === null) onChange(DEMO_DEFAULT.linked);
    });
    return () => cancelAnimationFrame(id);
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

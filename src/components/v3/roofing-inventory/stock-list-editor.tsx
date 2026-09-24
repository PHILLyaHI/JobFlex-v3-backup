"use client";

// WHAT WE STOCK — the checklist (2026-09-23). Owner: "when they set up their
// inventory, mark what they keep in stock … not every contractor stocks
// everything … check-box what they stock and calculate on that … make it
// understandable how to set up the inventory."
//
// Every standard material of the trade, and every item already on the list,
// with one checkbox: ticked = kept in stock (counted on the shelf, reserved
// by sold jobs, reordered when low), unticked = bought per job (nothing to
// count; it goes on the job's shopping list when the job sells). The boxes
// start from the trade's suggestion (lib/inventoryStockDefaults), which the
// note above the list explains in one sentence. Saving adds the standard
// items not on the list yet and rewrites the company's choice. Shared by the
// desktop and the phone build; first-time setup shows the three steps too.

import { useMemo, useState } from "react";
import { Check, ListChecks, RotateCcw, Search, X } from "lucide-react";
import { groupByCategory } from "@/lib/inventoryCategories";
import { STOCK_DEFAULT_NOTE, type StockChoice } from "@/lib/inventoryStockDefaults";
import type { InventoryWorkspace } from "./roofing-inventory-model";
import s from "./stock-list-editor.module.css";

export function StockListEditor({ workspace: w, compact = false }: { workspace: InventoryWorkspace; compact?: boolean }) {
  const catalog = w.data.catalog;
  const firstTime = !w.data.policy.decided && w.data.rows.length === 0;
  const [choice, setChoice] = useState<Map<string, boolean>>(() => new Map(catalog.map((c) => [c.key, c.stocked])));
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => groupByCategory(w.data.trade, needle ? catalog.filter((c) => c.name.toLowerCase().includes(needle)) : catalog, (c) => c.name), [catalog, needle, w.data.trade]);
  const stockedOf = (c: StockChoice) => choice.get(c.key) ?? c.stocked;
  const stockedCount = catalog.filter(stockedOf).length;
  const perJobCount = catalog.length - stockedCount;
  const newCount = catalog.filter((c) => c.isNew).length;
  const setMany = (keys: readonly string[], value: boolean) => setChoice((prev) => { const next = new Map(prev); for (const k of keys) next.set(k, value); return next; });
  const reset = () => setChoice(new Map(catalog.map((c) => [c.key, c.suggested])));
  const save = () => {
    const stocked: string[] = [];
    const perJob: string[] = [];
    for (const c of catalog) (stockedOf(c) ? stocked : perJob).push(c.key);
    w.saveStockList(stocked, perJob);
  };

  return (
    <div className={`${s.w}${compact ? ` ${s.compact}` : ""}`} data-stock-editor>
      <div className={s.head}>
        <div>
          <h3><ListChecks size={18} aria-hidden="true" />{firstTime ? `Set up your ${w.tradeLabel} stock list` : "What we stock"}</h3>
          <p>Tick what you keep on the shelf. Everything else is bought per job. You can change any item later.</p>
        </div>
        {!firstTime && <button type="button" className={s.close} aria-label="Close the checklist" disabled={w.pending} onClick={() => w.setSetupOpen(false)}><X size={18} aria-hidden="true" /></button>}
      </div>

      {firstTime && (
        <ol className={s.steps} aria-label="How the inventory works">
          <li><b>1</b><div><strong>Tick what you keep in stock</strong><span>Only those items are counted, reserved by sold jobs and reordered when they run low.</span></div></li>
          <li><b>2</b><div><strong>Count what is on the shelf</strong><span>Every ticked item starts at zero — enter what you have with Manage → Count stock.</span></div></li>
          <li><b>3</b><div><strong>Let the proposals do the rest</strong><span>A sold job reserves its stock; open proposals forecast it. What you buy per job appears on that job&apos;s shopping list under Orders.</span></div></li>
        </ol>
      )}

      <div className={s.legend} aria-hidden="true">
        <span><i className={s.boxOn}><Check size={12} /></i>Kept in stock — counted, reserved, reordered when low</span>
        <span><i className={s.boxOff} />Bought per job — nothing to count; on the job&apos;s shopping list when it sells</span>
      </div>
      <p className={s.note}>{STOCK_DEFAULT_NOTE[w.data.trade]}</p>

      <div className={s.tools}>
        <label className={s.search}><Search size={16} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a material" aria-label="Find a material in the checklist" /></label>
        <div className={s.bulk}>
          <button type="button" onClick={() => setMany(catalog.map((c) => c.key), true)}>All in stock</button>
          <button type="button" onClick={() => setMany(catalog.map((c) => c.key), false)}>All per job</button>
          <button type="button" onClick={reset}><RotateCcw size={13} aria-hidden="true" />Suggested</button>
        </div>
      </div>

      <div className={s.groups}>
        {groups.length === 0 && <p className={s.none}>No material matches “{q.trim()}”.</p>}
        {groups.map((g) => {
          const keys = g.items.map((c) => c.key);
          const on = g.items.filter(stockedOf).length;
          return (
            <section key={g.label} className={s.group} aria-label={g.label}>
              <header className={s.groupHead}>
                <h4>{g.label}<span>{on} of {g.items.length} in stock</span></h4>
                <div className={s.groupActs}><button type="button" onClick={() => setMany(keys, true)}>All</button><button type="button" onClick={() => setMany(keys, false)}>None</button></div>
              </header>
              <ul className={s.rows}>
                {g.items.map((c) => {
                  const on = stockedOf(c);
                  return (
                    <li key={c.key}>
                      <label className={s.row} data-on={on || undefined}>
                        <input type="checkbox" checked={on} onChange={(e) => setMany([c.key], e.target.checked)} />
                        <span className={s.box} aria-hidden="true">{on && <Check size={14} />}</span>
                        <span className={s.name}>{c.name}</span>
                        <span className={s.meta}>{on ? "in stock" : "per job"}<small>{c.unit}</small>{c.isNew && <em>adds to your list</em>}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className={s.foot}>
        <p><b>{stockedCount}</b> kept in stock · <b>{perJobCount}</b> bought per job{newCount ? <span> · {newCount} standard item{newCount === 1 ? "" : "s"} will be added at zero on hand</span> : null}</p>
        <div className={s.footActs}>
          {!firstTime && <button type="button" className={s.secondary} disabled={w.pending} onClick={() => w.setSetupOpen(false)}>Cancel</button>}
          <button type="button" className={s.primary} disabled={w.pending || !w.canWrite} onClick={save}>{w.pending ? "Saving…" : firstTime ? "Save and start counting" : "Save stock list"}</button>
        </div>
      </div>
    </div>
  );
}

"use client";

// WHAT WE STOCK — the checklist, cut for a phone.
//
// Same inputs and the same one write as the shared editor
// (roofing-inventory/stock-list-editor.tsx): every item of w.data.catalog with
// one tick — ticked = kept in stock (counted, reserved by sold jobs, reordered
// when low), unticked = bought per job — starting from the saved choice or the
// trade's suggestion, and w.saveStockList(stocked, perJob) on save. The ticks
// are local until then; nothing is written while the list is being worked.
//
// What changes for the handheld: every control clears 44px (the shared bulk
// and group buttons are 36px), names read at 15px in full ink, each row says
// IN STOCK / PER JOB in words beside the box, the explanation folds under one
// line so the list starts on the first screen, and the save bar sticks to the
// bottom of the screen while the list scrolls under it.

import { useState } from "react";
import { Check, ListChecks, RotateCcw, Search, X } from "lucide-react";
import { groupByCategory } from "@/lib/inventoryCategories";
import { STOCK_DEFAULT_NOTE, type StockChoice } from "@/lib/inventoryStockDefaults";
import type { InventoryWorkspace } from "@/components/v3/roofing-inventory/roofing-inventory-model";

export function MhiStockChecklist({ w }: { w: InventoryWorkspace }) {
  const catalog = w.data.catalog;
  const firstTime = !w.data.policy.decided && w.data.rows.length === 0;
  const [choice, setChoice] = useState<Map<string, boolean>>(() => new Map(catalog.map((c) => [c.key, c.stocked])));
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const groups = groupByCategory(w.data.trade, needle ? catalog.filter((c) => c.name.toLowerCase().includes(needle)) : catalog, (c) => c.name);
  const stockedOf = (c: StockChoice) => choice.get(c.key) ?? c.stocked;
  const stockedCount = catalog.filter(stockedOf).length;
  const perJobCount = catalog.length - stockedCount;
  const newCount = catalog.filter((c) => c.isNew).length;
  const setMany = (keys: readonly string[], value: boolean) =>
    setChoice((prev) => {
      const next = new Map(prev);
      for (const k of keys) next.set(k, value);
      return next;
    });
  const save = () => {
    const stocked: string[] = [];
    const perJob: string[] = [];
    for (const c of catalog) (stockedOf(c) ? stocked : perJob).push(c.key);
    w.saveStockList(stocked, perJob);
  };

  return (
    <section className="mhi-sec mhi-setup" aria-labelledby="mhi-setup-h" data-stock-editor>
      <div className="mhi-card">
        <div className="mhi-setup-head">
          <div className="mhi-setup-txt">
            <p className="mhi-kick">
              <ListChecks size={16} aria-hidden="true" />
              {firstTime ? "Step 1 of 3" : "Stock list"}
            </p>
            <h2 className="mhi-setup-title" id="mhi-setup-h">
              {firstTime ? `Set up your ${w.tradeLabel} stock list` : "What we stock"}
            </h2>
            <p className="mhi-lead">Tick what you keep on the shelf. Everything else is bought per job. You can change any item later.</p>
          </div>
          {!firstTime && (
            <button type="button" className="mhi-iconbtn" aria-label="Close the checklist" disabled={w.pending} onClick={() => w.setSetupOpen(false)}>
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* The three steps as the estimator's step rail: where you are now,
            and the two that follow. Each step's detail is shown when it is
            the step being done — on the Stock guide once the list is saved. */}
        {firstTime && (
          <ol className="mhi-steprail" aria-label="Three steps to a working inventory">
            <li aria-current="step">
              <b aria-hidden="true">1</b>
              <span>Tick what you stock</span>
            </li>
            <li>
              <b aria-hidden="true">2</b>
              <span>Count the shelf</span>
            </li>
            <li>
              <b aria-hidden="true">3</b>
              <span>Proposals draw on it</span>
            </li>
          </ol>
        )}

        <dl className="mhi-key">
          <div>
            <dt>
              <span className="mhi-box is-on" aria-hidden="true">
                <Check size={15} strokeWidth={3} />
              </span>
              Kept in stock
            </dt>
            <dd>Counted, reserved by sold jobs, reordered when low.</dd>
          </div>
          <div>
            <dt>
              <span className="mhi-box" aria-hidden="true" />
              Bought per job
            </dt>
            <dd>Nothing to count — on the job&apos;s shopping list when it sells.</dd>
          </div>
        </dl>

        <details className="mhi-why">
          <summary>Why these are ticked</summary>
          <p>{STOCK_DEFAULT_NOTE[w.data.trade]}</p>
        </details>
      </div>

      <div className="mhi-tools">
        <label className="mhi-search">
          <Search size={18} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a material" aria-label="Find a material in the checklist" enterKeyHint="search" />
          {q && (
            <button type="button" className="mhi-search-x" aria-label="Clear search" onClick={() => setQ("")}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="mhi-bulk" role="group" aria-label="Set every item at once">
          <button type="button" className="mhi-btn mhi-btn-secondary" onClick={() => setMany(catalog.map((c) => c.key), true)}>
            All in stock
          </button>
          <button type="button" className="mhi-btn mhi-btn-secondary" onClick={() => setMany(catalog.map((c) => c.key), false)}>
            All per job
          </button>
          <button type="button" className="mhi-btn mhi-btn-secondary" onClick={() => setChoice(new Map(catalog.map((c) => [c.key, c.suggested])))}>
            <RotateCcw size={15} aria-hidden="true" />
            Suggested
          </button>
        </div>
      </div>

      <div className="mhi-card mhi-chklist">
        {groups.length === 0 && <p className="mhi-quiet mhi-pad">No material matches “{q.trim()}”.</p>}
        {groups.map((g) => {
          const keys = g.items.map((c) => c.key);
          const on = g.items.filter(stockedOf).length;
          return (
            <section key={g.label} className="mhi-chkgroup" aria-label={g.label}>
              <header className="mhi-chkgroup-head">
                <div className="mhi-chkgroup-txt">
                  <h3>{g.label}</h3>
                  <span>
                    {on} of {g.items.length} in stock
                  </span>
                </div>
                <div className="mhi-chkgroup-acts">
                  <button type="button" className="mhi-minibtn" aria-label={`Keep every ${g.label} item in stock`} onClick={() => setMany(keys, true)}>
                    All
                  </button>
                  <button type="button" className="mhi-minibtn" aria-label={`Buy every ${g.label} item per job`} onClick={() => setMany(keys, false)}>
                    None
                  </button>
                </div>
              </header>
              <ul className="mhi-chkrows">
                {g.items.map((c) => {
                  const ticked = stockedOf(c);
                  return (
                    <li key={c.key}>
                      <label className="mhi-chk" data-on={ticked || undefined}>
                        <input type="checkbox" checked={ticked} onChange={(e) => setMany([c.key], e.target.checked)} />
                        <span className="mhi-box" aria-hidden="true">
                          {ticked && <Check size={15} strokeWidth={3} />}
                        </span>
                        <span className="mhi-chk-name">{c.name}</span>
                        <span className="mhi-chk-meta">
                          <b>{ticked ? "In stock" : "Per job"}</b>
                          <span className="mhi-unit">{c.unit}</span>
                          {/* On a first setup every item is new — the save bar says so once. */}
                          {c.isNew && !firstTime && <em>Adds to your list</em>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mhi-savebar">
        <p className="mhi-savebar-sum" aria-live="polite">
          <b>{stockedCount}</b> kept in stock · <b>{perJobCount}</b> bought per job
          {newCount ? (
            <span>
              {" "}
              · {newCount} new {newCount === 1 ? "item starts" : "items start"} at 0 on hand
            </span>
          ) : null}
        </p>
        <div className="mhi-savebar-acts">
          {!firstTime && (
            <button type="button" className="mhi-btn mhi-btn-secondary" disabled={w.pending} onClick={() => w.setSetupOpen(false)}>
              Cancel
            </button>
          )}
          <button type="button" className="mhi-btn mhi-btn-primary" disabled={w.pending || !w.canWrite} onClick={save}>
            {w.pending ? "Saving…" : firstTime ? "Save and start counting" : "Save stock list"}
          </button>
        </div>
      </div>
    </section>
  );
}

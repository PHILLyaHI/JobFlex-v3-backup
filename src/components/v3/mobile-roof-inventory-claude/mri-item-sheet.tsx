"use client";

// THE ITEM SHEET — everything the live board's row and its inline editor
// carry, for one item, in the thumb zone: the facts, receive, count, the
// editable fields and remove with a confirm step. Keyed by the page on every
// open, so the edit disclosure and the confirm step always start closed.

import { useState } from "react";
import type { BoardSupplier } from "@/lib/inventoryBoard";
import { ago, qty, stockBar, usd, type LedgerRow } from "@/components/v3/roof-inventory-claude/inventory-model";
import { Field, Icon, Select, StockTrack } from "./mri-parts";

export type ItemPatch = { unit: string; reorderPoint: number | null; supplierId: string | null; supplierSku: string | null; lastCost: number | null };

const signed = (n: number) => (n < 0 ? `−${qty(-n)}` : qty(n));
/** A per-unit price keeps its cents — $1.15 a square foot is not "$1". The
 *  model's `usd` rounds to the dollar, which is right for totals only. */
const unitCost = (n: number) => (n < 100 ? `$${n.toFixed(2)}` : usd(n));

export function ItemSheetBody({
  x,
  suppliers,
  windowDays,
  canWrite,
  pending,
  onReceive,
  onCount,
  onSave,
  onDelete,
}: {
  x: LedgerRow;
  suppliers: readonly BoardSupplier[];
  windowDays: number;
  canWrite: boolean;
  pending: boolean;
  onReceive: (n: number) => void;
  onCount: (n: number) => void;
  /** `after(ok)` lets the sheet fold its editor once the save has landed. */
  onSave: (p: ItemPatch, after: (ok: boolean) => void) => void;
  onDelete: () => void;
}) {
  const { r, st, fact, daysLeft } = x;
  const [editing, setEditing] = useState(false);
  const [sure, setSure] = useState(false);
  const bar = stockBar(r, st);
  const availTone = r.available < 0 ? "bad" : bar.freeWarn ? "warn" : "none";

  return (
    <div className="mri-item-sheet">
      {/* ── the drawing: the bar at full width, read against the figures ── */}
      <div className="mri-is-bar">
        <StockTrack bar={bar} big />
      </div>

      <dl className="mri-facts">
        <div className="mri-fact">
          <dt>On hand</dt>
          <dd>
            <b>{qty(r.onHand)}</b> <small>{r.unit}</small>
          </dd>
        </div>
        <div className="mri-fact">
          <dt>Available</dt>
          <dd>
            <b className={`t-${availTone}`}>{signed(r.available)}</b> <small>{r.unit}</small>
          </dd>
        </div>
        <div className="mri-fact">
          <dt>Reserved · sold jobs</dt>
          <dd>
            <b>{qty(r.reserved)}</b>
          </dd>
        </div>
        <div className="mri-fact">
          <dt>Forecast · open</dt>
          <dd>
            <b>{qty(r.forecast)}</b>
          </dd>
        </div>
        <div className="mri-fact is-wide">
          <dt>Reorder line in force</dt>
          <dd>
            <b>{qty(r.threshold)}</b> <small>{r.unit}</small>
            {r.reorderPoint == null ? <span className="mri-fact-note">the biggest job on the books</span> : null}
          </dd>
        </div>
        {r.suggestedOrder > 0 && (st === "soldshort" || st === "low" || st === "short") ? (
          <div className="mri-fact is-wide">
            <dt>To order now</dt>
            <dd>
              <b className="t-warn">{r.suggestedOrder}</b> <small>{r.unit}</small>
              <span className="mri-fact-note">covers the sold and open work and keeps the line on the shelf</span>
            </dd>
          </div>
        ) : null}
        <div className="mri-fact is-wide">
          <dt>Supplier</dt>
          <dd className="is-text">
            {r.supplierName ?? <span className="mri-fact-none">No supplier</span>}
            {r.supplierSku ? <span className="mri-sku">{r.supplierSku}</span> : null}
          </dd>
        </div>
        <div className="mri-fact">
          <dt>Last cost</dt>
          <dd>{fact?.lastCost != null ? <b>{unitCost(fact.lastCost)}</b> : <span className="mri-fact-none">Not on file</span>}{fact?.lastCost != null ? <small> / {r.unit}</small> : null}</dd>
        </div>
        <div className="mri-fact">
          <dt>Free stock lasts</dt>
          <dd className="is-text">
            {daysLeft != null ? (
              `≈${daysLeft > 999 ? "a year+" : `${daysLeft} days`} at this pace`
            ) : fact && fact.usedPerDay > 0 ? (
              <span className="t-bad">Nothing free at this pace</span>
            ) : (
              <span className="mri-fact-none">No use yet to pace</span>
            )}
          </dd>
        </div>
      </dl>

      <ul className="mri-hist">
        <li>{fact && fact.used > 0 ? `Used ${qty(fact.used)} ${r.unit} in ${windowDays} days` : `Nothing taken out in ${windowDays} days`}</li>
        {fact && fact.received > 0 ? <li>{`Received ${qty(fact.received)} in ${windowDays} days`}</li> : null}
        <li>{fact?.lastCountAt ? `Last counted ${ago(fact.lastCountAt)}` : "Never counted"}</li>
        {fact?.lastMoveAt ? <li>{`Last movement ${ago(fact.lastMoveAt)}`}</li> : null}
      </ul>

      {canWrite && (
        <>
          {/* ── receive and count: the two things done standing at the shelf ── */}
          <form
            className="mri-qform"
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const v = (f.elements.namedItem("qty") as HTMLInputElement).value;
              const n = Number(v);
              if (v === "" || !Number.isFinite(n) || n <= 0) return;
              onReceive(n);
              f.reset();
            }}
          >
            <label className="mri-lbl" htmlFor="mri-recv">
              Receive a delivery · {r.unit}
            </label>
            <div className="mri-qrow">
              <input id="mri-recv" name="qty" className="mri-in" type="number" step="any" min="0" inputMode="decimal" placeholder="+ qty" aria-label={`Quantity of ${r.name} received`} />
              <button className="mri-btn mri-btn-p" type="submit" disabled={pending}>
                Receive
              </button>
            </div>
          </form>
          <form
            className="mri-qform"
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const v = (f.elements.namedItem("qty") as HTMLInputElement).value;
              const n = Number(v);
              if (v === "" || !Number.isFinite(n) || n < 0) return;
              onCount(n);
              f.reset();
            }}
          >
            <label className="mri-lbl" htmlFor="mri-count">
              Count the shelf · sets on hand
            </label>
            <div className="mri-qrow">
              <input id="mri-count" name="qty" className="mri-in" type="number" step="any" min="0" inputMode="decimal" placeholder="on the shelf" aria-label={`Counted on the shelf, ${r.name}`} />
              <button className="mri-btn mri-btn-s" type="submit" disabled={pending}>
                Set count
              </button>
            </div>
          </form>

          {/* ── the editable fields, folded until asked for ── */}
          <button type="button" className={`mri-disc${editing ? " is-open" : ""}`} aria-expanded={editing} aria-controls="mri-edit" onClick={() => setEditing((v) => !v)}>
            <span>Edit unit, reorder line, supplier, cost</span>
            <Icon id="i-chev" />
          </button>
          {editing && (
            <form
              id="mri-edit"
              className="mri-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = e.currentTarget;
                const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement).value;
                onSave(
                  {
                    unit: g("unit").trim() || r.unit,
                    reorderPoint: g("reorder") === "" ? null : Number(g("reorder")),
                    supplierId: g("supplier") || null,
                    supplierSku: g("sku").trim() || null,
                    lastCost: g("cost") === "" ? null : Number(g("cost")),
                  },
                  (ok) => {
                    if (ok) setEditing(false);
                  },
                );
              }}
            >
              <div className="mri-form-grid">
                <Field label="Unit">
                  <input name="unit" className="mri-in" defaultValue={r.unit} autoComplete="off" />
                </Field>
                <Field label="Reorder at">
                  <input name="reorder" className="mri-in" type="number" step="any" min="0" inputMode="decimal" defaultValue={r.reorderPoint ?? ""} placeholder={`next job · ${qty(r.threshold)}`} />
                </Field>
                <Field label="Supplier" wide>
                  <Select name="supplier" defaultValue={r.supplierId ?? ""}>
                    <option value="">No supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Supplier SKU">
                  <input name="sku" className="mri-in" defaultValue={r.supplierSku ?? ""} placeholder="optional" autoComplete="off" />
                </Field>
                <Field label={`Last cost per ${r.unit}`}>
                  <input name="cost" className="mri-in" type="number" step="any" min="0" inputMode="decimal" defaultValue={fact?.lastCost ?? ""} placeholder="0.00" />
                </Field>
              </div>
              <div className="mri-form-acts">
                <button className="mri-btn mri-btn-p" type="submit" disabled={pending}>
                  Save
                </button>
                <button className="mri-btn mri-btn-s" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* ── remove, behind a confirm step ── */}
          <div className="mri-remove">
            {sure ? (
              <div className="mri-sure" role="group" aria-label="Confirm remove">
                <p>
                  Remove <b>{r.name}</b> and its history?
                </p>
                <div className="mri-form-acts">
                  <button className="mri-btn mri-btn-d" type="button" disabled={pending} onClick={onDelete}>
                    Yes, remove
                  </button>
                  <button className="mri-btn mri-btn-s" type="button" onClick={() => setSure(false)}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="mri-ghost is-danger" onClick={() => setSure(true)}>
                <Icon id="i-trash" />
                Remove item
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

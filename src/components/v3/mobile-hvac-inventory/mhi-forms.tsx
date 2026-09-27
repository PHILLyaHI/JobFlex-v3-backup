"use client";

// THE SHEET'S CONTENT — the item figures and facts, and the four forms.
//
// Each form is presentation around ONE model call, with the same arguments the
// shared inventory forms pass (roofing-inventory-forms.tsx): receiveItem /
// countItem for a quantity, saveItem for add and edit, removeItem, and
// saveSupplier. The server actions still clamp and validate; the checks here
// only say, in the sheet, what the shared forms would have refused silently.
//
// The submit buttons live in the sheet's sticky foot, outside the scrolling
// body, and reach their form through the `form` attribute — so the one primary
// action stays under the thumb however long the form is.

import { useState } from "react";
import { ArrowDownToLine, ClipboardCheck, Minus, Pencil, Plus } from "lucide-react";
import { ago, qty, stockStatus, stateOf, type InventoryWorkspace } from "@/components/v3/roofing-inventory/roofing-inventory-model";
import { isStocked, type StockRow } from "@/lib/inventory";

export type QuantityMode = "receive" | "count";
export type ItemMode = QuantityMode | "edit";

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/* ---------- the item at a glance ---------------------------------------- */

/** Status, and what to order — the two lines that say why this item matters. */
export function ItemHeadline({ r }: { r: StockRow }) {
  const status = stockStatus(r, stateOf(r));
  return (
    <div className="mhi-itemhead">
      <span className="mhi-stamp" data-tone={status.tone}>
        {status.text}
      </span>
      {r.suggestedOrder > 0 && (
        <p className="mhi-itemhead-order">
          Suggested order{" "}
          <b>
            {qty(r.suggestedOrder)} {r.unit}
          </b>
        </p>
      )}
    </div>
  );
}

/** The four numbers the board counts against every item. */
export function ItemFigures({ r }: { r: StockRow }) {
  const perJob = !isStocked(r);
  return (
    <dl className="mhi-figs" aria-label={`Figures in ${r.unit}`}>
      <div className="mhi-fig" data-short={(!perJob && r.available < 0) || undefined}>
        <dt>Available</dt>
        <dd>{perJob ? "—" : qty(r.available)}</dd>
      </div>
      <div className="mhi-fig">
        <dt>On hand</dt>
        <dd>{qty(r.onHand)}</dd>
      </div>
      <div className="mhi-fig">
        <dt>Reserved</dt>
        <dd>{qty(r.reserved)}</dd>
      </div>
      <div className="mhi-fig">
        <dt>Forecast</dt>
        <dd>{qty(r.forecast)}</dd>
      </div>
    </dl>
  );
}

/** Everything else the board knows about the item — the current phone
 *  layout's details fold and the edit form's facts, in one list. */
export function ItemFacts({ w, r }: { w: InventoryWorkspace; r: StockRow }) {
  const fact = w.facts.items[r.id];
  const perJob = !isStocked(r);
  const days = fact && fact.usedPerDay > 0 && r.available > 0 ? Math.round(r.available / fact.usedPerDay) : null;
  const rows: Array<[string, string]> = [
    ["Stock", perJob ? "Bought per job" : "Kept in stock"],
    ["Open proposal demand", `${qty(r.forecast)} ${r.unit}`],
  ];
  if (!perJob) rows.push(["Reorder level", `${qty(r.threshold)} ${r.unit}${r.reorderPoint == null ? " · automatic" : ""}`]);
  if (r.suggestedOrder > 0) rows.push(["Suggested order", `${qty(r.suggestedOrder)} ${r.unit}`]);
  rows.push(["Supplier", r.supplierName || "Not assigned"]);
  if (r.supplierSku) rows.push(["Supplier SKU", r.supplierSku]);
  if (fact?.lastCost != null) rows.push([`Last cost per ${r.unit}`, money(fact.lastCost)]);
  if (days != null) rows.push(["At the current pace", `About ${days > 999 ? "a year+" : `${days} days`} left`]);
  rows.push(["Last counted", fact?.lastCountAt ? ago(fact.lastCountAt) : "Not yet counted"]);
  rows.push([`Used in ${w.facts.windowDays} days`, `${qty(fact?.used ?? 0)} ${r.unit}`]);
  rows.push([`Received in ${w.facts.windowDays} days`, `${qty(fact?.received ?? 0)} ${r.unit}`]);
  if (fact?.lastMoveAt) rows.push(["Last movement", ago(fact.lastMoveAt)]);
  return (
    <dl className="mhi-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- the three things you do to an item --------------------------- */

const MODES: Array<{ id: ItemMode; label: string; icon: typeof Plus }> = [
  { id: "receive", label: "Receive", icon: ArrowDownToLine },
  { id: "count", label: "Count", icon: ClipboardCheck },
  { id: "edit", label: "Edit", icon: Pencil },
];

export function ModeSwitch({ mode, pending, onMode }: { mode: ItemMode; pending: boolean; onMode: (m: ItemMode) => void }) {
  return (
    <div className="mhi-seg" role="group" aria-label="What to do with this item">
      {MODES.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" aria-pressed={mode === id} disabled={pending} onClick={() => onMode(id)}>
          <Icon size={17} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Receive or count, as one stepper. Receive adds what arrived; count sets the
 * shelf to what was counted. Either way the line under the stepper says what
 * the shelf will read afterwards, computed from what is typed — nothing is
 * sent until the foot's button is pressed.
 */
export function QuantityForm({ w, r, mode, formId }: { w: InventoryWorkspace; r: StockRow; mode: QuantityMode; formId: string }) {
  // A count starts from the shelf's figure so − / + adjust it; an item that
  // has never been counted starts empty rather than at a 0 to clear first.
  const [raw, setRaw] = useState(mode === "count" && r.onHand !== 0 ? String(r.onHand) : "");
  const [err, setErr] = useState<string | null>(null);
  const n = raw.trim() === "" ? Number.NaN : Number(raw);
  const typed = Number.isFinite(n);
  const valid = typed && n >= 0 && (mode === "count" || n > 0);
  const step = (delta: number) => {
    setRaw(String(Math.max(0, round2((typed ? n : 0) + delta))));
    setErr(null);
  };
  const inputId = `${formId}-qty`;
  const helpId = `${formId}-help`;

  let preview: string;
  if (mode === "receive") {
    preview = valid
      ? `On hand ${qty(r.onHand)} → ${qty(round2(r.onHand + n))} ${r.unit} after this delivery.`
      : `On hand now: ${qty(r.onHand)} ${r.unit}. Enter what arrived.`;
  } else if (!valid) {
    preview = `The shelf shows ${qty(r.onHand)} ${r.unit}. Enter the total you counted.`;
  } else if (n === r.onHand) {
    preview = `Matches the ${qty(r.onHand)} ${r.unit} on record — saving confirms the count.`;
  } else {
    const diff = round2(n - r.onHand);
    preview = `${qty(r.onHand)} on record → ${qty(n)} ${r.unit} (${diff > 0 ? "+" : "−"}${qty(Math.abs(diff))}).`;
  }

  return (
    <form
      id={formId}
      className="mhi-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) {
          setErr(mode === "count" ? "Enter the total you counted — 0 or more." : "Enter how many arrived — more than 0.");
          return;
        }
        if (mode === "count") w.countItem(r, n);
        else w.receiveItem(r, n);
      }}
    >
      <div className="mhi-field">
        <label className="mhi-label" htmlFor={inputId}>
          {mode === "count" ? "Counted on the shelf" : "Quantity received"}
        </label>
        <div className="mhi-qty">
          <button type="button" aria-label="One less" disabled={w.pending || !typed || n <= 0} onClick={() => step(-1)}>
            <Minus size={22} aria-hidden="true" />
          </button>
          <span className="mhi-qty-in">
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              step="any"
              min={mode === "count" ? 0 : 0.01}
              placeholder="0"
              value={raw}
              aria-describedby={helpId}
              aria-invalid={err ? true : undefined}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                setRaw(event.target.value);
                setErr(null);
              }}
            />
            <span aria-hidden="true">{r.unit}</span>
          </span>
          <button type="button" aria-label="One more" disabled={w.pending} onClick={() => step(1)}>
            <Plus size={22} aria-hidden="true" />
          </button>
        </div>
        <p className="mhi-help" id={helpId} aria-live="polite">
          {preview}
        </p>
        {err && (
          <p className="mhi-fielderr" role="alert">
            {err}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * Add a new item, or edit one on the list. The item's name is its key on the
 * server, so an existing item keeps its name; everything else is here.
 */
export function ItemSettingsForm({ w, item, formId }: { w: InventoryWorkspace; item?: StockRow; formId: string }) {
  const adding = !item;
  // Kept in stock or bought per job (lib/inventoryPolicy). A new item is kept
  // in stock — it is being added to be tracked.
  const [stocked, setStocked] = useState(item ? item.stocked !== false : true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fact = item ? w.facts.items[item.id] : undefined;
  const id = (key: string) => `${formId}-${key}`;
  const placeholder = w.data.trade === "roof" ? "Architectural shingles" : w.data.trade === "fence" ? "Cedar fence pickets" : "Air filter";

  return (
    <form
      id={formId}
      className="mhi-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = (key: string) => String(form.get(key) ?? "").trim();
        const name = item?.name ?? value("name");
        if (!name) {
          setErr("Give the item a name.");
          return;
        }
        if (!value("unit")) {
          setErr("Give the item a unit — each, box, roll.");
          return;
        }
        const numbers = ["onHand", "reorder", "cost"].map((key) => value(key)).filter((v) => v !== "");
        if (numbers.some((v) => !Number.isFinite(Number(v)) || Number(v) < 0)) {
          setErr("Quantities and costs must be 0 or more.");
          return;
        }
        setErr(null);
        w.saveItem({
          name,
          unit: value("unit") || "each",
          ...(adding ? { onHand: Number(value("onHand")) || 0 } : {}),
          reorderPoint: value("reorder") === "" ? null : Number(value("reorder")),
          supplierId: value("supplier") || null,
          supplierSku: value("sku") || null,
          lastCost: value("cost") === "" ? null : Number(value("cost")),
          stocked,
        });
      }}
    >
      {adding && (
        <div className="mhi-field">
          <label className="mhi-label" htmlFor={id("name")}>
            Item name
          </label>
          <input className="mhi-input" id={id("name")} name="name" required maxLength={120} placeholder={placeholder} autoComplete="off" />
        </div>
      )}

      <div className="mhi-field">
        <span className="mhi-label" id={id("policy")}>
          Stock
        </span>
        <div className="mhi-policy" role="radiogroup" aria-labelledby={id("policy")}>
          <button type="button" role="radio" aria-checked={stocked} onClick={() => setStocked(true)}>
            <b>Kept in stock</b>
            <small>Counted on the shelf, reserved by sold jobs, reordered when it runs low.</small>
          </button>
          <button type="button" role="radio" aria-checked={!stocked} onClick={() => setStocked(false)}>
            <b>Bought per job</b>
            <small>Nothing to count. When a job sells it goes on that job&apos;s shopping list.</small>
          </button>
        </div>
      </div>

      <div className="mhi-pair">
        <div className="mhi-field">
          <label className="mhi-label" htmlFor={id("unit")}>
            Unit
          </label>
          <input className="mhi-input" id={id("unit")} name="unit" required maxLength={24} defaultValue={item?.unit ?? "each"} placeholder="each, box, roll" autoComplete="off" />
        </div>
        {adding ? (
          <div className="mhi-field">
            <label className="mhi-label" htmlFor={id("onHand")}>
              On hand
            </label>
            <input className="mhi-input mhi-num" id={id("onHand")} name="onHand" type="number" inputMode="decimal" step="any" min="0" defaultValue="0" />
          </div>
        ) : (
          <div className="mhi-field">
            <label className="mhi-label" htmlFor={id("cost")}>
              Last cost
            </label>
            <span className="mhi-money">
              <span aria-hidden="true">$</span>
              <input className="mhi-input mhi-num" id={id("cost")} name="cost" type="number" inputMode="decimal" step="any" min="0" defaultValue={fact?.lastCost ?? ""} placeholder="0.00" />
            </span>
          </div>
        )}
      </div>

      <div className="mhi-field">
        <label className="mhi-label" htmlFor={id("reorder")}>
          Reorder at
        </label>
        <input
          className="mhi-input mhi-num"
          id={id("reorder")}
          name="reorder"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          defaultValue={item?.reorderPoint ?? ""}
          placeholder={item ? `Automatic · ${qty(item.threshold)}` : "Automatic"}
          disabled={!stocked}
          aria-describedby={id("reorder-help")}
        />
        <p className="mhi-help" id={id("reorder-help")}>
          {stocked ? "Leave blank to cover the biggest job." : "Not used for an item bought per job."}
        </p>
      </div>

      {adding && (
        <div className="mhi-field">
          <label className="mhi-label" htmlFor={id("cost")}>
            Last cost per unit
          </label>
          <span className="mhi-money">
            <span aria-hidden="true">$</span>
            <input className="mhi-input mhi-num" id={id("cost")} name="cost" type="number" inputMode="decimal" step="any" min="0" placeholder="0.00" />
          </span>
        </div>
      )}

      <div className="mhi-field">
        <label className="mhi-label" htmlFor={id("supplier")}>
          Supplier
        </label>
        <span className="mhi-selectwrap">
          <select className="mhi-select" id={id("supplier")} name="supplier" defaultValue={item?.supplierId ?? ""}>
            <option value="">No supplier</option>
            {w.data.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </span>
        {w.data.suppliers.length === 0 && <p className="mhi-help">No suppliers yet — add one on the Suppliers tab.</p>}
      </div>

      <div className="mhi-field">
        <label className="mhi-label" htmlFor={id("sku")}>
          Supplier SKU
        </label>
        <input className="mhi-input" id={id("sku")} name="sku" defaultValue={item?.supplierSku ?? ""} placeholder="Optional" autoComplete="off" />
      </div>

      {err && (
        <p className="mhi-fielderr" role="alert">
          {err}
        </p>
      )}

      {item && (
        <div className="mhi-remove">
          {confirmRemove ? (
            <div className="mhi-confirm" role="alert">
              <p>
                Remove <b>{item.name}</b> and its inventory history?
              </p>
              <div className="mhi-confirm-acts">
                <button type="button" className="mhi-btn mhi-btn-danger" disabled={w.pending} onClick={() => w.removeItem(item)}>
                  {w.pending ? "Removing…" : "Yes, remove item"}
                </button>
                <button type="button" className="mhi-btn mhi-btn-secondary" disabled={w.pending} onClick={() => setConfirmRemove(false)}>
                  Keep item
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="mhi-textbtn mhi-textbtn-danger" disabled={w.pending} onClick={() => setConfirmRemove(true)}>
              Remove item
            </button>
          )}
        </div>
      )}
    </form>
  );
}

/** A supplier and the address its purchase orders are emailed to. */
export function SupplierForm({ w, formId }: { w: InventoryWorkspace; formId: string }) {
  const [err, setErr] = useState<string | null>(null);
  const id = (key: string) => `${formId}-${key}`;
  return (
    <form
      id={formId}
      className="mhi-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = (key: string) => String(form.get(key) ?? "").trim();
        if (!value("name")) {
          setErr("Give the supplier a name.");
          return;
        }
        if (value("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value("email"))) {
          setErr("That email does not look right.");
          return;
        }
        setErr(null);
        w.saveSupplier({ name: value("name"), email: value("email"), phone: value("phone"), website: value("website") });
      }}
    >
      <div className="mhi-field">
        <label className="mhi-label" htmlFor={id("name")}>
          Supplier name
        </label>
        <input className="mhi-input" id={id("name")} name="name" required maxLength={120} placeholder="Supply house name" autoComplete="organization" />
      </div>
      <div className="mhi-field">
        <label className="mhi-label" htmlFor={id("email")}>
          Email for purchase orders
        </label>
        <input className="mhi-input" id={id("email")} name="email" type="email" inputMode="email" placeholder="orders@supplier.com" autoComplete="email" aria-describedby={id("email-help")} />
        <p className="mhi-help" id={id("email-help")}>
          Purchase orders from this page are emailed here.
        </p>
      </div>
      <div className="mhi-field">
        <label className="mhi-label" htmlFor={id("phone")}>
          Phone
        </label>
        <input className="mhi-input" id={id("phone")} name="phone" type="tel" inputMode="tel" placeholder="Optional" autoComplete="tel" />
      </div>
      <div className="mhi-field">
        <label className="mhi-label" htmlFor={id("website")}>
          Website
        </label>
        <input className="mhi-input" id={id("website")} name="website" inputMode="url" placeholder="Optional" autoComplete="url" />
      </div>
      {err && (
        <p className="mhi-fielderr" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}

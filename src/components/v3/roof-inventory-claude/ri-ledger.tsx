"use client";

// THE STOCK LEDGER — one row per item, six columns at most: the item, its
// drawn stock bar, on hand, AVAILABLE (the number that matters), the status
// plate and the row's actions. Reserved and forecast live in the bar and its
// caption. Receive / Count / Edit behave exactly as on the live board; the
// editor opens as a row beneath its item.

import { Fragment, useState, type FormEvent } from "react";
import { countStock, deleteInventoryItem, receiveStock, upsertInventoryItem } from "@/actions/inventory";
import type { BoardSupplier, TradeBoardData } from "@/lib/inventoryBoard";
import type { ItemFacts, StockFacts } from "@/lib/inventoryDashboard";
import type { StockRow } from "@/lib/inventory";
import { ago, filterCount, ledgerRows, plateOf, plural, qty, STOCK_FILTERS, type Board, type LedgerRow, type LedgerView, type StockFilter } from "./inventory-model";
import { Ic, Plate, plateWords, signed, StockBar, SupplierField, type Run } from "./ri-parts";

type ItemPatch = { unit: string; reorderPoint: number | null; supplierId: string | null; supplierSku: string | null; lastCost: number | null };

function ItemEditor({
  r,
  fact,
  suppliers,
  windowDays,
  pending,
  onSave,
  onDelete,
  onClose,
}: {
  r: StockRow;
  fact: ItemFacts | undefined;
  suppliers: readonly BoardSupplier[];
  windowDays: number;
  pending: boolean;
  onSave: (p: ItemPatch) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [sure, setSure] = useState(false);
  return (
    <form
      className="ri-editor"
      aria-label={`Edit ${r.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) onClose();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
        onSave({
          unit: g("unit").trim() || r.unit,
          reorderPoint: g("reorder") === "" ? null : Number(g("reorder")),
          supplierId: g("supplier") || null,
          supplierSku: g("sku").trim() || null,
          lastCost: g("cost") === "" ? null : Number(g("cost")),
        });
      }}
    >
      <div className="ri-editor-grid">
        <label className="ri-fld">
          <span className="ri-lbl">Unit</span>
          <input name="unit" className="ri-in" defaultValue={r.unit} />
        </label>
        <label className="ri-fld">
          <span className="ri-lbl">Reorder at</span>
          <input name="reorder" className="ri-in ri-in--num" type="number" step="any" min="0" inputMode="decimal" defaultValue={r.reorderPoint ?? ""} placeholder={`next job · ${qty(r.threshold)}`} />
        </label>
        <div className="ri-fld">
          <span className="ri-lbl">Supplier</span>
          <SupplierField name="supplier" suppliers={suppliers} initial={r.supplierId} />
        </div>
        <label className="ri-fld">
          <span className="ri-lbl">Supplier SKU</span>
          <input name="sku" className="ri-in ri-in--mono" defaultValue={r.supplierSku ?? ""} placeholder="optional" />
        </label>
        <label className="ri-fld">
          <span className="ri-lbl">Last cost per {r.unit}</span>
          <input name="cost" className="ri-in ri-in--num" type="number" step="any" min="0" inputMode="decimal" defaultValue={fact?.lastCost ?? ""} placeholder="0.00" />
        </label>
      </div>
      <div className="ri-editor-foot">
        <button className="ri-btn ri-btn--primary" type="submit" disabled={pending}>
          Save
        </button>
        <button className="ri-mini" type="button" onClick={onClose}>
          Close
        </button>
        <span className="ri-spacer" />
        {sure ? (
          <>
            <span className="ri-sure">Remove {r.name} and its history?</span>
            <button className="ri-mini" data-danger="" type="button" disabled={pending} onClick={onDelete}>
              Yes, remove
            </button>
            <button className="ri-mini" type="button" onClick={() => setSure(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button className="ri-mini" data-danger="" type="button" onClick={() => setSure(true)}>
            <Ic id="i-trash" />
            Remove item
          </button>
        )}
      </div>
      <p className="ri-hist">
        <span>
          Reorder line in force: <b>{qty(r.threshold)} {r.unit}</b>
          {r.reorderPoint == null ? " — the biggest job on the books" : ""}
        </span>
        {fact?.lastCountAt ? (
          <span>
            Last counted <b>{ago(fact.lastCountAt)}</b>
          </span>
        ) : (
          <span>Never counted</span>
        )}
        {fact && fact.used > 0 ? (
          <span>
            Used <b>{qty(fact.used)} {r.unit}</b> in {windowDays} days
          </span>
        ) : (
          <span>Nothing taken out in {windowDays} days</span>
        )}
        {fact && fact.received > 0 ? (
          <span>
            Received <b>{qty(fact.received)}</b> in {windowDays} days
          </span>
        ) : null}
        {fact?.lastMoveAt ? (
          <span>
            Last movement <b>{ago(fact.lastMoveAt)}</b>
          </span>
        ) : null}
      </p>
    </form>
  );
}

function AddItemForm({ trade, suppliers, pending, run, onClose }: { trade: TradeBoardData["trade"]; suppliers: readonly BoardSupplier[]; pending: boolean; run: Run; onClose: () => void }) {
  return (
    <form
      id="ri-add"
      className="ri-add"
      aria-label="Add an item"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) onClose();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
        const name = g("name").trim();
        if (!name) return;
        run(
          () =>
            upsertInventoryItem({
              trade,
              name,
              unit: g("unit").trim() || "each",
              onHand: Number(g("onHand")) || 0,
              reorderPoint: g("reorder") === "" ? null : Number(g("reorder")),
              supplierId: g("supplier") || null,
              supplierSku: g("sku").trim() || null,
              lastCost: g("cost") === "" ? null : Number(g("cost")),
            }),
          () => `${name} added.`,
        );
        f.reset();
        onClose();
      }}
    >
      <div className="ri-add-grid">
        <label className="ri-fld ri-fld--name">
          <span className="ri-lbl">New item</span>
          <input name="name" className="ri-in" placeholder="Ridge vent, 4 ft" autoFocus />
        </label>
        <label className="ri-fld">
          <span className="ri-lbl">Unit</span>
          <input name="unit" className="ri-in" placeholder="each" />
        </label>
        <label className="ri-fld">
          <span className="ri-lbl">On hand</span>
          <input name="onHand" className="ri-in ri-in--num" type="number" step="any" min="0" inputMode="decimal" placeholder="0" />
        </label>
        <label className="ri-fld">
          <span className="ri-lbl">Reorder at</span>
          <input name="reorder" className="ri-in ri-in--num" type="number" step="any" min="0" inputMode="decimal" placeholder="next job" />
        </label>
        <label className="ri-fld">
          <span className="ri-lbl">Last cost</span>
          <input name="cost" className="ri-in ri-in--num" type="number" step="any" min="0" inputMode="decimal" placeholder="0.00" />
        </label>
        <div className="ri-fld">
          <span className="ri-lbl">Supplier</span>
          <SupplierField name="supplier" suppliers={suppliers} initial={null} />
        </div>
        <label className="ri-fld">
          <span className="ri-lbl">Supplier SKU</span>
          <input name="sku" className="ri-in ri-in--mono" placeholder="optional" />
        </label>
        <div className="ri-add-acts">
          <button className="ri-btn ri-btn--primary" type="submit" disabled={pending}>
            Add item
          </button>
          <button className="ri-mini" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

type Props = {
  board: Board;
  data: TradeBoardData;
  facts: StockFacts;
  canWrite: boolean;
  pending: boolean;
  run: Run;
  filter: StockFilter;
  setFilter: (f: StockFilter) => void;
  addOpen: boolean;
  closeAdd: () => void;
};

export function RiLedger({ board, data, facts, canWrite, pending, run, filter, setFilter, addOpen, closeAdd }: Props) {
  const [view, setView] = useState<LedgerView>("urgency");
  const [q, setQ] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [countingId, setCountingId] = useState<string | null>(null);
  const t = board.trade;
  const { sections, shown, folded, canHideEmpty, needle } = ledgerRows(board, { filter, query: q, view, showEmpty });
  const cols = canWrite ? 6 : 5;
  // The draw-in stagger follows the order the rows are read in.
  const orderOf = new Map(shown.map((x, i) => [x.r.id, i]));

  const onQty = (e: FormEvent<HTMLFormElement>, r: StockRow, counting: boolean) => {
    e.preventDefault();
    const f = e.currentTarget;
    const v = (f.elements.namedItem("qty") as HTMLInputElement).value;
    if (v === "") return;
    const n = Number(v);
    if (counting) {
      run(() => countStock(r.id, n), () => `${r.name} set to ${qty(n)} ${r.unit}.`);
      setCountingId(null);
    } else {
      if (!n) return;
      run(() => receiveStock(r.id, n), () => `${qty(n)} ${r.unit} of ${r.name} received.`);
    }
    f.reset();
  };

  const renderRow = ({ r, st, fact, daysLeft }: LedgerRow) => {
    const plate = plateOf(r, st);
    const open = openId === r.id;
    const counting = countingId === r.id;
    // What the item is and where it comes from; the reorder line is read with
    // the bar it is drawn on, in the caption beside it.
    const sub = [
      `per ${r.unit}`,
      r.supplierName ? `${r.supplierName}${r.supplierSku ? ` ${r.supplierSku}` : ""}` : "no supplier",
      daysLeft != null ? `≈${daysLeft > 999 ? "a year+" : `${daysLeft} days`} at this pace` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    // The caption is the bar's key in numbers, two lines at most: what is on
    // the shelf (free, reserved), then what is coming at it (forecast) and the
    // reorder line the tick draws.
    const free = qty(Math.max(0, r.available));
    const capTitle = [`${free} free`, `${qty(r.reserved)} reserved`, `${qty(r.forecast)} forecast`, r.threshold > 0 ? `reorder at ${qty(r.threshold)}` : null].filter(Boolean).join(" · ");
    return (
      <Fragment key={r.id}>
        <tr className="ri-row" data-stock-row={r.id} data-state={st} data-open={open ? "" : undefined}>
          <td className="ri-c-item">
            <p className="ri-item-name" title={r.name}>
              {r.name}
            </p>
            <p className="ri-item-sub" title={sub}>
              {sub}
            </p>
          </td>
          <td className="ri-c-stock">
            <StockBar r={r} st={st} index={orderOf.get(r.id) ?? 0} />
            <p className="ri-cap" title={capTitle}>
              <span className="ri-cap-row">
                <span>
                  <b>{free}</b> free
                </span>
                {r.reserved > 0 && (
                  <span>
                    <b>{qty(r.reserved)}</b> reserved
                  </span>
                )}
              </span>
              {(r.forecast > 0 || r.threshold > 0) && (
                <span className="ri-cap-row">
                  {r.forecast > 0 && (
                    <span>
                      <b>{qty(r.forecast)}</b> forecast
                    </span>
                  )}
                  {r.threshold > 0 && <span className="ri-cap-line">line {qty(r.threshold)}</span>}
                </span>
              )}
            </p>
          </td>
          <td className="ri-c-num ri-c-onhand">{r.onHand > 0 ? qty(r.onHand) : <span className="ri-nil">0</span>}</td>
          <td className="ri-c-num ri-c-avail">
            <span className="ri-avail" data-neg={r.available < 0 ? "" : undefined}>
              {signed(r.available)}
            </span>
          </td>
          <td className="ri-c-status">
            <Plate tone={plate.tone}>{plateWords(plate.text)}</Plate>
          </td>
          {canWrite && (
            <td className="ri-c-acts">
              <div className="ri-acts">
                <form className="ri-recv" onSubmit={(e) => onQty(e, r, counting)}>
                  <input
                    key={counting ? "count" : "receive"}
                    name="qty"
                    className="ri-in ri-in--num ri-in--qty"
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    placeholder={counting ? "count" : "+ qty"}
                    aria-label={counting ? `Counted on the shelf, ${r.name}` : `Quantity of ${r.name} received`}
                    // Count swaps the field's meaning; focus follows so the number can be typed straight away.
                    autoFocus={counting}
                  />
                  <button className="ri-recv-btn" type="submit" disabled={pending}>
                    {counting ? "Set count" : "Receive"}
                  </button>
                </form>
                {counting ? (
                  <button className="ri-textbtn" type="button" onClick={() => setCountingId(null)}>
                    Cancel
                  </button>
                ) : (
                  <button className="ri-textbtn" type="button" onClick={() => setCountingId(r.id)}>
                    Count
                  </button>
                )}
                <button className="ri-textbtn" type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : r.id)}>
                  Edit
                </button>
              </div>
            </td>
          )}
        </tr>
        {open && canWrite && (
          <tr className="ri-editor-row">
            <td colSpan={cols}>
              <ItemEditor
                r={r}
                fact={fact}
                suppliers={data.suppliers}
                windowDays={facts.windowDays}
                pending={pending}
                onClose={() => setOpenId(null)}
                onSave={(p) => {
                  run(() => upsertInventoryItem({ trade: data.trade, name: r.name, ...p }), () => `${r.name} saved.`);
                  setOpenId(null);
                }}
                onDelete={() => {
                  run(() => deleteInventoryItem(r.id), () => `${r.name} removed.`);
                  setOpenId(null);
                }}
              />
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <section className="ri-sec" id="ri-ledger" aria-labelledby="ri-ledger-h">
      <div className="ri-sec-head">
        <h2 className="ri-h2" id="ri-ledger-h">
          Stock
        </h2>
        <span className="ri-sec-anno">{plural(board.counts.all, "item")}</span>
        {data.rows.length > 0 && (
          <div className="ri-seg" role="group" aria-label="Order the list">
            <button type="button" className="ri-seg-btn" data-view="urgency" aria-pressed={view === "urgency"} onClick={() => setView("urgency")}>
              By urgency
            </button>
            <button type="button" className="ri-seg-btn" data-view="category" aria-pressed={view === "category"} onClick={() => setView("category")}>
              By shelf
            </button>
          </div>
        )}
      </div>

      <div className="ri-card ri-ledger">
        {canWrite && addOpen && <AddItemForm trade={data.trade} suppliers={data.suppliers} pending={pending} run={run} onClose={closeAdd} />}

        {data.rows.length === 0 ? (
          <p className="ri-empty">
            <b>No {t.noun} items yet.</b> Add the estimator’s standard items above, add one by hand, or pick from the lines your proposals already use.
          </p>
        ) : (
          <>
            <div className="ri-tools">
              <label className="ri-search">
                <Ic id="i-search" />
                <input className="ri-in ri-in--search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item or supplier" aria-label="Find an item or supplier" />
              </label>
              <div className="ri-chips" role="group" aria-label="Filter the stock">
                {STOCK_FILTERS.map((f) => (
                  <button key={f.id} type="button" className="ri-chip" data-f={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                    {f.label}
                    <b>{filterCount(board, f.id)}</b>
                  </button>
                ))}
              </div>
            </div>
            <p className="ri-legend" data-legend>
              <span>
                <i className="ri-sw ri-sw--res" />
                reserved for sold jobs
              </span>
              <span>
                <i className="ri-sw ri-sw--free" />
                free
                <i className="ri-sw ri-sw--warn" />
                free, under the line
              </span>
              <span>
                <i className="ri-sw ri-sw--def" />
                sold work past the shelf
              </span>
              <span>
                <i className="ri-sw ri-sw--fc" />
                forecast if the open proposals sell
              </span>
              <span>
                <i className="ri-sw ri-sw--tick" />
                reorder line
              </span>
            </p>

            <div className="ri-tbl-wrap">
              <table className="ri-tbl" data-stock-table aria-label={`${t.label} stock`}>
                <thead>
                  <tr>
                    <th scope="col" className="ri-c-item">
                      Item
                    </th>
                    <th scope="col" className="ri-c-stock">
                      Stock
                    </th>
                    <th scope="col" className="ri-c-num ri-c-onhand">
                      On hand
                    </th>
                    <th scope="col" className="ri-c-num ri-c-avail">
                      Available
                    </th>
                    <th scope="col" className="ri-c-status">
                      Status
                    </th>
                    {canWrite && (
                      <th scope="col" className="ri-c-acts">
                        <span className="ri-vh">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sections.map((sec) => (
                    <Fragment key={sec.label ?? "all"}>
                      {sec.label && (
                        <tr className="ri-grp" data-group={sec.label}>
                          <th scope="colgroup" colSpan={cols}>
                            {sec.label}
                            <span>
                              {plural(sec.items.length, "item")}
                              {sec.needs ? ` · ${sec.needs} to order` : ""}
                            </span>
                          </th>
                        </tr>
                      )}
                      {sec.items.map(renderRow)}
                    </Fragment>
                  ))}
                  {folded.length > 0 && (
                    <tr className="ri-fold-row">
                      <td colSpan={cols}>
                        <button className="ri-fold" type="button" onClick={() => setShowEmpty(true)}>
                          <b>{folded.length}</b> more {folded.length === 1 ? "item" : "items"} not stocked yet — nothing on hand, nothing against them
                          <span className="ri-fold-cta">
                            Show
                            <Ic id="i-chev" />
                          </span>
                        </button>
                      </td>
                    </tr>
                  )}
                  {canHideEmpty && (
                    <tr className="ri-fold-row">
                      <td colSpan={cols}>
                        <button className="ri-fold" type="button" data-up="" onClick={() => setShowEmpty(false)}>
                          Hide the {board.counts.empty} {board.counts.empty === 1 ? "item" : "items"} not stocked yet
                          <span className="ri-fold-cta">
                            Hide
                            <Ic id="i-chev" />
                          </span>
                        </button>
                      </td>
                    </tr>
                  )}
                  {shown.length === 0 && folded.length === 0 && (
                    <tr>
                      <td colSpan={cols} className="ri-none">
                        <p>Nothing here{needle ? ` for “${q.trim()}”` : ""}.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {canWrite && data.untracked.length > 0 && (
          <div className="ri-untracked" data-untracked>
            <p className="ri-untracked-text">
              <b>Your proposals use these and the warehouse does not track them yet.</b> One tap adds the item at zero.
            </p>
            <div className="ri-untracked-chips">
              {data.untracked.slice(0, 20).map((l) => (
                <button
                  key={l.name}
                  className="ri-addchip"
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => upsertInventoryItem({ trade: data.trade, name: l.name, unit: l.unit ?? "each" }), () => `${l.name} is now tracked. Receive what is on the shelf.`)}
                >
                  <Ic id="i-plus" />
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

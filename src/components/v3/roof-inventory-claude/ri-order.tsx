"use client";

// ORDER NOW — one purchase-order sheet per supplier, drawn as a parts list,
// and ON THE WAY — the orders emailed and not yet received. Same writes as
// the live board: sendPurchaseOrder, upsertInventoryItem (picking a supplier
// for an unassigned line) and receivePurchaseOrder.

import { useState, type ReactNode } from "react";
import { receivePurchaseOrder, sendPurchaseOrder, upsertInventoryItem } from "@/actions/inventory";
import { BlueprintSelect } from "@/components/v3/advanced-ai-blueprint/blueprint-select";
import type { TradeBoardData } from "@/lib/inventoryBoard";
import type { StockFacts } from "@/lib/inventoryDashboard";
import type { StockRow } from "@/lib/inventory";
import { ago, plural, usd, type Board } from "./inventory-model";
import { Ic, SEL, supplierOptions, type Run } from "./ri-parts";

type Props = { board: Board; data: TradeBoardData; facts: StockFacts; canWrite: boolean; pending: boolean; run: Run };

/** One order line: quantity and unit as the parts list's first columns, then the item, then whatever sits on the right. */
function Line({ r, children }: { r: StockRow; children?: ReactNode }) {
  return (
    <li className="ri-po-line">
      <span className="ri-po-q">{r.suggestedOrder}</span>
      <span className="ri-po-u">{r.unit}</span>
      <span className="ri-po-i" title={r.name}>
        {r.name}
      </span>
      {children}
    </li>
  );
}

export function RiOrder({ board, data, facts, canWrite, pending, run }: Props) {
  // The supplier picked for an unassigned line, shown while the save lands.
  const [picked, setPicked] = useState<Record<string, string>>({});
  if (!board.needs.length) return null;
  const c = board.counts;

  return (
    <section className="ri-sec" id="ri-order" aria-labelledby="ri-order-h" data-po>
      <div className="ri-sec-head">
        <h2 className="ri-h2" id="ri-order-h">
          Order now
        </h2>
        <span className="ri-sec-anno">
          {plural(board.needs.length, "item")} · {board.orderCost > 0 ? `about ${usd(board.orderCost)} at last cost` : "no costs on file yet"}
        </span>
      </div>
      <p className="ri-sec-note">
        {c.soldShort ? <b>{plural(c.soldShort, "item is", "items are")} short for jobs already sold. </b> : null}
        {c.low > 0 ? `${plural(c.low, "item is", "items are")} under the reorder line. ` : ""}
        {c.short > 0 ? `${c.short} would run short if the open proposals sell. ` : ""}
        Quantities cover the sold and open work and keep the reorder line on the shelf.
      </p>

      <div className="ri-po-grid">
        {board.bySupplier.map((g) => {
          const name = g.supplier?.name ?? "Supplier";
          const email = g.supplier?.email ?? null;
          return (
            <article key={g.supplierId} className="ri-po" aria-labelledby={`ri-po-${g.supplierId}`}>
              <header className="ri-po-head">
                <h3 className="ri-po-name" id={`ri-po-${g.supplierId}`} title={name}>
                  {name}
                </h3>
                {email ? (
                  <p className="ri-po-mail">{email}</p>
                ) : (
                  <p className="ri-po-mail" data-missing="">
                    no email on file — add one under Suppliers
                  </p>
                )}
              </header>
              <ul className="ri-po-lines" aria-label={`Lines to order from ${name}`}>
                {g.lines.map((r) => (
                  <Line key={r.id} r={r}>
                    <span className="ri-po-s" title={r.supplierSku ?? undefined}>
                      {r.supplierSku ?? ""}
                    </span>
                  </Line>
                ))}
              </ul>
              <footer className="ri-po-foot">
                <p className="ri-po-cost">
                  {g.cost > 0 ? (
                    <>
                      Est. <b>{usd(g.cost)}</b> at last cost
                    </>
                  ) : (
                    "No costs on file"
                  )}
                </p>
                {canWrite && (
                  <button
                    type="button"
                    className="ri-btn ri-btn--primary"
                    disabled={pending || !email}
                    title={email ? undefined : "Add an email for this supplier first"}
                    onClick={() =>
                      run(
                        () => sendPurchaseOrder({ trade: data.trade, supplierId: g.supplierId, lines: g.lines.map((r) => ({ itemId: r.id, quantity: r.suggestedOrder })) }),
                        (r) => `Purchase order emailed to ${String(r.to)} — ${plural(Number(r.count), "line")}.`,
                      )
                    }
                  >
                    <Ic id="i-send" />
                    Email order · {plural(g.lines.length, "line")}
                  </button>
                )}
              </footer>
            </article>
          );
        })}

        {board.unassigned.length > 0 && (
          <article className="ri-po" data-sheet="unassigned" aria-labelledby="ri-po-none">
            <header className="ri-po-head">
              <h3 className="ri-po-name" id="ri-po-none">
                No supplier yet
              </h3>
              <p className="ri-po-why">{plural(board.unassigned.length, "item")} to order and no one to send it to. Pick a supplier and the item joins that order.</p>
            </header>
            <ul className="ri-po-lines" aria-label="Lines with no supplier">
              {board.unassigned.map((r) => (
                <Line key={r.id} r={r}>
                  {canWrite && data.suppliers.length > 0 ? (
                    <span className="ri-po-pick">
                      <BlueprintSelect
                        value={picked[r.id] ?? ""}
                        onChange={(id) => {
                          if (!id) return;
                          setPicked((p) => ({ ...p, [r.id]: id }));
                          run(
                            () => upsertInventoryItem({ trade: data.trade, name: r.name, unit: r.unit, reorderPoint: r.reorderPoint, supplierId: id, supplierSku: r.supplierSku ?? null, lastCost: facts.items[r.id]?.lastCost ?? null }),
                            () => `${r.name} now comes from ${board.supName(id)}.`,
                          );
                        }}
                        options={supplierOptions(data.suppliers)}
                        placeholder="Supplier…"
                        ariaLabel={`Supplier for ${r.name}`}
                        triggerClass="ri-sel-btn--sm"
                        disabled={pending}
                        styles={SEL}
                      />
                    </span>
                  ) : (
                    <span className="ri-po-s" />
                  )}
                </Line>
              ))}
            </ul>
            {data.suppliers.length === 0 && <p className="ri-po-empty">Add a supplier below first.</p>}
          </article>
        )}
      </div>
    </section>
  );
}

export function RiWay({ board, canWrite, pending, run }: Pick<Props, "board" | "canWrite" | "pending" | "run">) {
  if (!board.orders.length) return null;
  return (
    <section className="ri-sec" aria-labelledby="ri-way-h" data-orders>
      <div className="ri-sec-head">
        <h2 className="ri-h2" id="ri-way-h">
          On the way
        </h2>
      </div>
      <p className="ri-sec-note">Purchase orders emailed and not yet received. One tap when the delivery lands puts every line on the shelf.</p>
      <ul className="ri-card ri-way">
        {board.orders.map((o) => (
          <li key={o.id} className="ri-way-row">
            <div className="ri-way-main">
              <p className="ri-way-sup">
                <b>{o.supplier}</b>
                <span className="ri-way-when" suppressHydrationWarning>
                  sent {ago(o.sentAt)} · {plural(o.lines.length, "line")}
                </span>
              </p>
              <p className="ri-way-lines" title={o.lines.map((l) => `${l.quantity} × ${l.name}`).join(" · ")}>
                {o.lines.map((l) => `${l.quantity} × ${l.name}`).join(" · ")}
              </p>
            </div>
            {canWrite && (
              <button type="button" className="ri-btn" disabled={pending} onClick={() => run(() => receivePurchaseOrder(o.id), (r) => `${plural(Number(r.received), "line")} received onto the shelf.`)}>
                <Ic id="i-check" />
                Received
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

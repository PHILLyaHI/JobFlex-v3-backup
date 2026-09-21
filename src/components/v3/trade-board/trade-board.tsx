"use client";

// THE TRADE BOARD (2026-09-20) — one component, three trades.
//
// Owner: "when you press fence estimator, roofing estimator or HVAC
// estimator … a sub page … showing all the proposals that belong to the
// fence … and the inventory, what's been used, what's not … warning that you
// need to add some inventory … who's your supplier … send them a PO."
//
// Three cards: the trade's proposals (the main Proposals page keeps them all),
// the warehouse stock with the work counted against it, and the suppliers.
// Every write is a server action in actions/inventory; the page refreshes
// from the database after each one.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { countStock, deleteInventoryItem, receiveStock, sendPurchaseOrder, upsertInventoryItem, upsertSupplier } from "@/actions/inventory";
import type { TradeBoardData } from "@/lib/inventoryBoard";
import { TRADES } from "@/lib/inventory";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const STATUS: Record<string, string> = { DRAFT: "Draft", SENT: "Sent", VIEWED: "Viewed", ACCEPTED: "Sold" };

export function TradeBoard({ data, canWrite }: { data: TradeBoardData; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const trade = TRADES.find((t) => t.id === data.trade)!;

  const run = (work: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, done?: (r: Record<string, unknown>) => string) =>
    start(async () => {
      setError(null);
      const r = await work();
      if (!r.ok) setError(r.error ?? "Could not save");
      else {
        setNote(done ? done(r) : null);
        router.refresh();
      }
    });

  const lowRows = data.rows.filter((r) => r.low || r.short > 0);
  const bySupplier = new Map<string, typeof lowRows>();
  for (const r of lowRows) {
    if (!r.supplierId || r.suggestedOrder <= 0) continue;
    bySupplier.set(r.supplierId, [...(bySupplier.get(r.supplierId) ?? []), r]);
  }

  return (
    <div style={{ display: "grid", gap: 16, padding: "16px 0 48px" }}>
      <header>
        <div className="eyebrow">{trade.label} board</div>
        <h1 style={{ margin: "4px 0 0" }}>{trade.label} proposals and stock</h1>
        <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
          {data.pipeline.open} open worth {usd(data.pipeline.openTotal)} · {data.pipeline.sold} sold and waiting to load worth {usd(data.pipeline.soldTotal)}
        </p>
      </header>

      {(data.pipeline.low > 0 || data.pipeline.short > 0) && (
        <div role="alert" className="paper-card" style={{ borderLeft: "6px solid #c2410c", padding: "12px 16px", background: "#fff7ed" }} data-stock-alert>
          <b>Stock needs attention.</b>{" "}
          {data.pipeline.low > 0 ? `${data.pipeline.low} item${data.pipeline.low === 1 ? " is" : "s are"} low for the next job. ` : ""}
          {data.pipeline.short > 0 ? `${data.pipeline.short} would run short if the open proposals sell.` : ""}
          {bySupplier.size > 0 ? " The purchase order below is ready to send." : " Add a supplier on the items to send a purchase order."}
        </div>
      )}
      {error && (
        <div role="alert" className="paper-card" style={{ borderLeft: "6px solid #b91c1c", padding: "12px 16px" }}>
          {error}
        </div>
      )}
      {note && !error && (
        <div role="status" className="paper-card" style={{ borderLeft: "6px solid #15803d", padding: "12px 16px" }}>
          {note}
        </div>
      )}

      {/* ── Stock ── */}
      <section className="paper-card" style={{ padding: 16 }}>
        <h2 style={{ margin: 0 }}>Warehouse stock</h2>
        <p style={{ margin: "4px 0 12px", opacity: 0.75 }}>
          On hand is the shelf. Reserved is what sold jobs still take. Forecast is what the open proposals would take if they sell.
        </p>
        {data.rows.length === 0 ? (
          <p>No {trade.noun} items yet. Add the first below, or pick from the lines your proposals already use.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }} data-stock-table>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.7 }}>
                  <th style={{ padding: "6px 8px" }}>Item</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>On hand</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Reserved</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Available</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Forecast</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                  {canWrite && <th style={{ padding: "6px 8px" }}>Receive / count</th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #e5e5e5", background: r.low ? "#fff7ed" : undefined }} data-stock-row={r.id}>
                    <td style={{ padding: "8px" }}>
                      <b>{r.name}</b>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        per {r.unit}
                        {r.supplierName ? ` · ${r.supplierName}${r.supplierSku ? ` ${r.supplierSku}` : ""}` : " · no supplier"}
                        {` · reorder at ${qty(r.threshold)}`}
                      </div>
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>{qty(r.onHand)}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>{qty(r.reserved)}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      <b>{qty(r.available)}</b>
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>{qty(r.forecast)}</td>
                    <td style={{ padding: 8 }}>
                      {r.available < 0 ? (
                        <span className="chip" style={{ background: "#fee2e2" }}>Sold short by {qty(-r.available)}</span>
                      ) : r.low ? (
                        <span className="chip" style={{ background: "#ffedd5" }}>Low — order {r.suggestedOrder}</span>
                      ) : r.short > 0 ? (
                        <span className="chip" style={{ background: "#fef9c3" }}>Short by {qty(r.short)} if all sell</span>
                      ) : (
                        <span className="chip">OK</span>
                      )}
                    </td>
                    {canWrite && (
                      <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                        <form
                          style={{ display: "inline-flex", gap: 6 }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = e.currentTarget;
                            const n = Number((f.elements.namedItem("qty") as HTMLInputElement).value);
                            if (!n) return;
                            run(() => receiveStock(r.id, n), () => `${qty(n)} ${r.unit} of ${r.name} received.`);
                            f.reset();
                          }}
                        >
                          <input name="qty" className="pinput" type="number" step="any" placeholder="+ qty" style={{ width: 80 }} aria-label={`Quantity of ${r.name} received`} />
                          <button className="btn btn-sm" type="submit" disabled={pending}>
                            Receive
                          </button>
                        </form>{" "}
                        <button
                          className="btn btn-sm btn-ghost"
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            const v = window.prompt(`Counted on the shelf — ${r.name} (${r.unit}):`, qty(r.onHand));
                            if (v === null) return;
                            run(() => countStock(r.id, Number(v)), () => `${r.name} set to ${v} ${r.unit}.`);
                          }}
                        >
                          Count
                        </button>{" "}
                        <button
                          className="btn btn-sm btn-ghost"
                          type="button"
                          disabled={pending}
                          aria-label={`Remove ${r.name}`}
                          onClick={() => {
                            if (window.confirm(`Remove ${r.name} from the ${trade.noun} stock?`)) run(() => deleteInventoryItem(r.id));
                          }}
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canWrite && (
          <>
            {data.untracked.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <b>Your proposals use these, and the warehouse does not track them yet:</b>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }} data-untracked>
                  {data.untracked.slice(0, 20).map((l) => (
                    <button
                      key={l.name}
                      className="btn btn-sm btn-ghost"
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => upsertInventoryItem({ trade: data.trade, name: l.name, unit: l.unit ?? "each" }), () => `${l.name} is now tracked. Receive what is on the shelf.`)}
                    >
                      + {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <form
              style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, alignItems: "end" }}
              onSubmit={(e) => {
                e.preventDefault();
                const f = e.currentTarget;
                const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement).value;
                const name = g("name").trim();
                if (!name) return;
                run(
                  () =>
                    upsertInventoryItem({
                      trade: data.trade,
                      name,
                      unit: g("unit") || "each",
                      onHand: Number(g("onHand")) || 0,
                      reorderPoint: g("reorder") === "" ? null : Number(g("reorder")),
                      supplierId: g("supplier") || null,
                      supplierSku: g("sku") || null,
                    }),
                  () => `${name} added.`,
                );
                f.reset();
              }}
            >
              <label>
                <div className="eyebrow">New item</div>
                <input name="name" className="pinput" placeholder="4x4 PT post, 8 ft" style={{ width: 220 }} />
              </label>
              <label>
                <div className="eyebrow">Unit</div>
                <input name="unit" className="pinput" placeholder="each" style={{ width: 90 }} />
              </label>
              <label>
                <div className="eyebrow">On hand</div>
                <input name="onHand" className="pinput" type="number" step="any" placeholder="0" style={{ width: 90 }} />
              </label>
              <label>
                <div className="eyebrow">Reorder at</div>
                <input name="reorder" className="pinput" type="number" step="any" placeholder="next job" style={{ width: 100 }} />
              </label>
              <label>
                <div className="eyebrow">Supplier</div>
                <select name="supplier" className="pinput" defaultValue="">
                  <option value="">—</option>
                  {data.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <div className="eyebrow">Supplier SKU</div>
                <input name="sku" className="pinput" placeholder="optional" style={{ width: 120 }} />
              </label>
              <button className="btn btn-sm" type="submit" disabled={pending}>
                Add item
              </button>
            </form>
          </>
        )}
      </section>

      {/* ── Purchase order ── */}
      {canWrite && bySupplier.size > 0 && (
        <section className="paper-card" style={{ padding: 16 }} data-po>
          <h2 style={{ margin: 0 }}>Purchase order</h2>
          <p style={{ margin: "4px 0 12px", opacity: 0.75 }}>Everything low or short, grouped by supplier, sized to cover the sold and open work and keep the reorder level on the shelf.</p>
          {[...bySupplier.entries()].map(([supplierId, rows]) => {
            const sup = data.suppliers.find((s) => s.id === supplierId);
            return (
              <div key={supplierId} style={{ marginBottom: 12 }}>
                <b>{sup?.name ?? "Supplier"}</b> {sup?.email ? <span style={{ opacity: 0.7 }}>· {sup.email}</span> : <span style={{ color: "#b91c1c" }}>· no email on file</span>}
                <ul style={{ margin: "6px 0" }}>
                  {rows.map((r) => (
                    <li key={r.id}>
                      {r.suggestedOrder} {r.unit} — {r.name}
                      {r.supplierSku ? ` (${r.supplierSku})` : ""}
                    </li>
                  ))}
                </ul>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={pending || !sup?.email}
                  onClick={() => run(() => sendPurchaseOrder({ trade: data.trade, supplierId, lines: rows.map((r) => ({ itemId: r.id, quantity: r.suggestedOrder })) }), (r) => `Purchase order emailed to ${String(r.to)} — ${String(r.count)} item(s).`)}
                >
                  Email this order to {sup?.name ?? "the supplier"}
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* ── Suppliers ── */}
      <section className="paper-card" style={{ padding: 16 }}>
        <h2 style={{ margin: 0 }}>Suppliers</h2>
        {data.suppliers.length === 0 ? <p style={{ opacity: 0.75 }}>No suppliers yet.</p> : null}
        <ul style={{ margin: "8px 0" }} data-suppliers>
          {data.suppliers.map((s) => (
            <li key={s.id}>
              <b>{s.name}</b> {s.email ? `· ${s.email}` : ""} {s.phone ? `· ${s.phone}` : ""}{" "}
              {s.website ? (
                <a href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noreferrer">
                  order online
                </a>
              ) : null}{" "}
              <span style={{ opacity: 0.6 }}>· {s.itemCount} item{s.itemCount === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ul>
        {canWrite && (
          <form
            style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
              const name = g("sname").trim();
              if (!name) return;
              run(() => upsertSupplier({ name, email: g("semail"), phone: g("sphone"), website: g("sweb") }), () => `${name} added.`);
              f.reset();
            }}
          >
            <label>
              <div className="eyebrow">Supplier</div>
              <input name="sname" className="pinput" placeholder="Cedar Supply Co." style={{ width: 200 }} />
            </label>
            <label>
              <div className="eyebrow">Email for POs</div>
              <input name="semail" className="pinput" type="email" placeholder="orders@…" style={{ width: 200 }} />
            </label>
            <label>
              <div className="eyebrow">Phone</div>
              <input name="sphone" className="pinput" placeholder="(425) …" style={{ width: 140 }} />
            </label>
            <label>
              <div className="eyebrow">Website</div>
              <input name="sweb" className="pinput" placeholder="ordering page" style={{ width: 180 }} />
            </label>
            <button className="btn btn-sm" type="submit" disabled={pending}>
              Add supplier
            </button>
          </form>
        )}
      </section>

      {/* ── Proposals of this trade ── */}
      <section className="paper-card" style={{ padding: 16 }}>
        <h2 style={{ margin: 0 }}>{trade.label} proposals</h2>
        <p style={{ margin: "4px 0 12px", opacity: 0.75 }}>Open and sold. The Proposals page still lists every proposal.</p>
        {data.proposals.length === 0 ? (
          <p>No {trade.noun} proposals yet — make one with the {trade.label} estimator.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }} data-trade-proposals>
            <tbody>
              {data.proposals.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid #e5e5e5" }}>
                  <td style={{ padding: 8 }}>
                    <Link href={`/dashboard/manual-blueprint?proposal=${p.id}` as Route}>
                      <b>{p.title}</b>
                    </Link>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {p.client ?? "No client"} · {new Date(p.createdAt).toLocaleDateString("en-US")} · {p.lines.length} material line{p.lines.length === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td style={{ padding: 8 }}>
                    <span className="chip">{STATUS[p.status] ?? p.status}</span>
                    {p.status === "ACCEPTED" ? <span className="chip" style={{ marginLeft: 6, background: p.loaded ? "#dcfce7" : "#ffedd5" }}>{p.loaded ? "Materials loaded" : "Reserved in stock"}</span> : null}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{usd(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

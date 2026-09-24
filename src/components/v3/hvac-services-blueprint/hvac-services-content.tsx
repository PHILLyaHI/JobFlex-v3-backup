"use client";

// THE HVAC SERVICE MENU (2026-09-23) — the shop's price book, editable.
//
// Owner: "what is the service menu for … make those services editable, make
// smart." It is what the estimator's Service / repair job prices from: pick
// a house, pick the tasks, every line lands on the estimate at these
// numbers. Built in: 93 tasks, each with a typical US labor price moved to
// the shop's market and a typical part cost plus the shop's markup. Here the
// shop makes the book its own:
//   · a price typed on a row is the shop's price for that task from then on
//     (the typical stays beside it, one click brings it back);
//   · a task the shop does not do is hidden — off the visit's menu, an old
//     estimate that picked it still prices;
//   · one adjustment moves every task the shop has not priced itself
//     (+10% = a tenth above the market's typical);
//   · the shop's own tasks are edited and removed in place.
// Every write is a server action on the rate card (actions/hvacServices),
// and the estimator reads the same card, so the visit's menu follows.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { addHvacServiceTask, deleteHvacServiceTask, resetHvacServiceOverride, setHvacServiceLaborAdjust, setHvacServiceOverride, updateHvacServiceTask } from "@/actions/hvacServices";
import { SERVICE_GROUPS, SERVICE_MENU, applyOverride, indexedLabor, type ServiceOverride, type ServiceTask } from "@/lib/hvac/serviceMenu";
import type { HvacRateCard } from "@/lib/hvac/ledger";
import styles from "./hvac-services.module.css";

const cx = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).map((n) => styles[n as string] ?? n).join(" ");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
type Result = { ok: true; card: HvacRateCard } | { ok: false; error: string };

/** A money field that saves on blur or Enter, only when the number changed. */
function PriceInput({ value, onSave, label, disabled, id }: { value: number; onSave: (n: number) => void; label: string; disabled?: boolean; id?: string }) {
  const [text, setText] = useState(String(Math.round(value)));
  const [was, setWas] = useState(value);
  if (was !== value) {
    // the card changed under us (a reset, an adjustment): show the new number
    setWas(value);
    setText(String(Math.round(value)));
  }
  const commit = () => {
    const n = Number(text.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n < 0) { setText(String(Math.round(value))); return; }
    if (Math.round(n) !== Math.round(value)) onSave(Math.round(n));
  };
  return (
    <span className={cx("money")}>
      <span className={cx("money-sign")}>$</span>
      <input id={id} className={cx("in", "in-money")} inputMode="decimal" value={text} aria-label={label} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }} />
    </span>
  );
}

export function HvacServicesContent({ card: initial, factor, place }: { card: HvacRateCard; factor: number; place: string }) {
  const [card, setCard] = useState(initial);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [adjText, setAdjText] = useState(String(card.serviceLaborAdjustPct ?? 0));
  const [editing, setEditing] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const over = card.serviceOverrides ?? {};
  const adj = card.serviceLaborAdjustPct ?? 0;
  const custom = card.serviceMenu ?? [];
  const mk = (c: number) => Math.round(c * (1 + card.materialsMarkupPct / 100));

  const run = (work: () => Promise<Result>, done?: string) =>
    start(async () => {
      const r = await work();
      if (!r.ok) { setNote({ tone: "err", text: r.error }); return; }
      setCard(r.card);
      setAdjText(String(r.card.serviceLaborAdjustPct ?? 0));
      if (done) setNote({ tone: "ok", text: done });
    });

  const needle = q.trim().toLowerCase();
  const matches = (t: ServiceTask) => !needle || t.title.toLowerCase().includes(needle) || t.includes.toLowerCase().includes(needle) || (t.part?.name ?? "").toLowerCase().includes(needle);
  const groups = useMemo(
    () =>
      SERVICE_GROUPS.filter((g) => g.group !== "custom")
        .map((g) => ({ ...g, tasks: SERVICE_MENU.filter((t) => t.group === g.group) }))
        .filter((g) => g.tasks.length),
    [],
  );
  const priced = SERVICE_MENU.filter((t) => { const o = over[t.id]; return o && (typeof o.laborUsd === "number" || typeof o.partCostUsd === "number"); }).length;
  const hidden = SERVICE_MENU.filter((t) => over[t.id]?.hidden).length;
  const offered = SERVICE_MENU.length - hidden + custom.length;

  const rowOf = (t0: ServiceTask) => {
    const o: ServiceOverride | undefined = over[t0.id];
    const t = applyOverride(t0, o);
    const isHidden = !!o?.hidden;
    const typicalLabor = indexedLabor(t0, factor, adj);
    const labor = t.unit === "lb" ? null : indexedLabor(t, factor, adj);
    const part = t.part ? mk(t.part.costUsd) : 0;
    const ownLabor = !!t.ownLabor;
    const ownPart = !!t.ownPart;
    return { t, o, isHidden, typicalLabor, labor, part, ownLabor, ownPart, total: labor === null ? null : labor + part };
  };

  return (
    <>
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker")}>Automation · HVAC estimator</div>
          <h1 className={cx("page-title")}>Service menu</h1>
        </div>
        <div className={cx("page-actions")}>
          <Link className={cx("btn", "btn-primary")} href={"/dashboard/hvac-estimator" as Route}>Price a visit</Link>
          <Link className={cx("btn", "btn-ghost")} href={"/dashboard/hvac-estimator/board" as Route}>HVAC inventory</Link>
        </div>
      </div>

      <div className={cx("kpis")} data-menu-kpis>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Tasks offered</div><div className={cx("kpi-val")} data-kpi="tasks">{offered}</div><div className={cx("kpi-sub")}>{groups.length} groups · {custom.length} of your own{hidden ? ` · ${hidden} hidden` : ""}</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Priced by you</div><div className={cx("kpi-val")} data-kpi="priced">{priced}</div><div className={cx("kpi-sub")}>{priced ? `of ${SERVICE_MENU.length} built in · the rest typical` : "every price is the market's typical — type yours on any row"}</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Labor in your market</div><div className={cx("kpi-val")} data-kpi="factor">×{(factor * (1 + adj / 100)).toFixed(2)}</div><div className={cx("kpi-sub")}>{place} ×{factor.toFixed(2)}{adj ? ` · your adjustment ${adj > 0 ? "+" : ""}${adj}%` : " · no adjustment"}</div></div>
        <div className={cx("kpi")}><div className={cx("kpi-lbl")}>Diagnostic visit</div><div className={cx("kpi-val")}>{usd(card.labor.diagnostic)}</div><div className={cx("kpi-sub")}>parts +{card.materialsMarkupPct}% · refrigerant {usd(card.labor.refrigerantPerLb)}/lb</div></div>
      </div>

      <div className={cx("stack")}>
        <p className={cx("hint")}>
          This is what the estimator&apos;s <strong>Service / repair</strong> job prices from: pick a house, pick the tasks, and every line lands on the estimate at these numbers. Labor starts as the US-typical shop price moved to your market; the part is the typical cost plus your markup. <strong>Type a price on any row and it is yours from then on</strong> — the typical stays beside it. Hide what you don&apos;t do. Your own tasks are at the end.
        </p>

        <section className={cx("card", "tools")} data-menu-tools>
          <div className={cx("tools-row")}>
            <label className={cx("search")}>
              <input className={cx("in")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a task or a part" aria-label="Find a task" />
            </label>
            <button type="button" className={cx("chip", onlyMine && "on")} aria-pressed={onlyMine} onClick={() => setOnlyMine((v) => !v)}>Priced by you <b>{priced}</b></button>
            <button type="button" className={cx("chip", showHidden && "on")} aria-pressed={showHidden} onClick={() => setShowHidden((v) => !v)} data-toggle-hidden>Hidden <b>{hidden}</b></button>
            <form
              className={cx("adjust")}
              data-menu-adjust
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(adjText.replace(/[^0-9.\-]/g, ""));
                if (!Number.isFinite(n)) return;
                run(() => setHvacServiceLaborAdjust(n), n ? `Every typical labor price now runs ${n > 0 ? "+" : ""}${Math.round(n)}% for your shop.` : "Labor is back to the market's typical.");
              }}
            >
              <span className={cx("lbl")}>Your labor vs typical</span>
              <span className={cx("money")}>
                <input className={cx("in", "in-pct")} inputMode="numeric" value={adjText} onChange={(e) => setAdjText(e.target.value)} aria-label="Your labor against typical, percent" />
                <span className={cx("money-sign")}>%</span>
              </span>
              <button type="submit" className={cx("btn", "btn-ghost", "btn--sm")} disabled={pending || String(adj) === adjText.trim()}>Apply</button>
            </form>
          </div>
          {note && (
            <div className={cx("note", note.tone === "err" ? "note-err" : "note-ok")} role={note.tone === "err" ? "alert" : "status"}>
              {note.text}
              <button type="button" className={cx("note-x")} aria-label="Dismiss" onClick={() => setNote(null)}>×</button>
            </div>
          )}
        </section>

        {groups.map((g) => {
          const rows = g.tasks.map(rowOf).filter((r) => matches(r.t) && (showHidden || !r.isHidden) && (!onlyMine || r.ownLabor || r.ownPart));
          if (!rows.length) return null;
          const hiddenHere = g.tasks.filter((t) => over[t.id]?.hidden).length;
          return (
            <section key={g.group} className={cx("card")} data-menu-group={g.group}>
              <div className={cx("card-h")}><div className={cx("card-t")}>{g.title}</div><div className={cx("card-s")}>{g.tasks.length} task{g.tasks.length === 1 ? "" : "s"}{hiddenHere ? ` · ${hiddenHere} hidden` : ""}</div></div>
              <div className={cx("tbl-wrap")}>
                <table className={cx("tbl", "tbl-edit")}>
                  <thead><tr><th>Task</th><th>Labor</th><th>Part</th><th>Line</th><th aria-label="Actions"></th></tr></thead>
                  <tbody>
                    {rows.map(({ t, o, isHidden, typicalLabor, labor, part, ownLabor, ownPart, total }) => (
                      <tr key={t.id} data-menu-task={t.id} data-own={ownLabor || ownPart ? "true" : "false"} data-hidden={isHidden ? "true" : "false"} className={cx(isHidden && "row-hidden")}>
                        <td data-l="Task">
                          <span className={cx("who")}>{t.title}{ownLabor || ownPart ? <span className={cx("plate", "plate--sent", "tag")}>yours</span> : null}{isHidden ? <span className={cx("plate", "plate--expired", "tag")}>hidden</span> : null}</span>
                          <span className={cx("sub")}>{t.includes}{t.note ? ` — ${t.note}` : ""}</span>
                        </td>
                        <td data-l="Labor">
                          {t.unit === "lb" ? (
                            <span className={cx("mono")}>{usd(card.labor.refrigerantPerLb)}/lb</span>
                          ) : (
                            <>
                              <PriceInput id={`labor-${t.id}`} value={labor ?? 0} label={`Labor for ${t.title}`} disabled={pending || isHidden} onSave={(n) => run(() => setHvacServiceOverride({ id: t.id, laborUsd: n }), `${t.title}: ${usd(n)} labor is your price now.`)} />
                              {ownLabor ? <span className={cx("was")}>typical {usd(typicalLabor)}</span> : null}
                            </>
                          )}
                        </td>
                        <td data-l="Part">
                          {t.unit === "lb" ? (
                            <span className={cx("sub-inline")}>refrigerant by the pound</span>
                          ) : t.part ? (
                            <>
                              <span className={cx("part-name")}>{t.part.name}</span>
                              <span className={cx("part-cost")}>
                                <PriceInput id={`part-${t.id}`} value={t.part.costUsd} label={`Part cost for ${t.title}`} disabled={pending || isHidden} onSave={(n) => run(() => setHvacServiceOverride({ id: t.id, partCostUsd: n }), `${t.title}: ${t.part?.name} at ${usd(n)} cost is your number now.`)} />
                                <span className={cx("was")}>{ownPart ? `typical ${usd(SERVICE_MENU.find((x) => x.id === t.id)?.part?.costUsd ?? 0)} · ` : ""}+{card.materialsMarkupPct}% = {usd(part)}</span>
                              </span>
                              {t.part.brands?.length ? <span className={cx("sub-inline")}>{t.part.brands.join(" / ")}</span> : null}
                            </>
                          ) : (
                            <span className={cx("sub-inline")}>—</span>
                          )}
                        </td>
                        <td data-l="Line" className={cx("mono", "line-total")}>{total === null ? "per lb" : usd(total)}</td>
                        <td data-l="" className={cx("row-acts")}>
                          {o && (ownLabor || ownPart || o.includes || o.partName || o.brands) ? (
                            <button type="button" className={cx("link")} disabled={pending} onClick={() => run(() => resetHvacServiceOverride(t.id), `${t.title} is back to the typical numbers.`)} data-reset={t.id}>Reset</button>
                          ) : null}
                          <button type="button" className={cx("link")} disabled={pending} onClick={() => run(() => setHvacServiceOverride({ id: t.id, hidden: !isHidden }), isHidden ? `${t.title} is offered again.` : `${t.title} is off your menu. Hidden tasks stay here to bring back.`)} data-hide={t.id}>{isHidden ? "Offer again" : "Hide"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <section className={cx("card")} data-menu-custom>
          <div className={cx("card-h")}>
            <div className={cx("card-t")}>Your own tasks</div>
            <div className={cx("card-s")}>{custom.length ? `${custom.length} on the menu` : "none yet"} · your numbers as typed, never indexed</div>
            <button type="button" className={cx("btn", "btn-primary", "btn--sm", "card-act")} onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>{addOpen ? "Close" : "Add a task"}</button>
          </div>
          {addOpen && (
            <form
              className={cx("frm")}
              data-menu-add
              onSubmit={(e) => {
                e.preventDefault();
                const f = e.currentTarget;
                const g = (n: string) => String((f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "").trim();
                const title = g("title");
                const partName = g("partName");
                if (!title) return;
                run(
                  () => addHvacServiceTask({ title, includes: g("includes") || undefined, laborUsd: Number(g("laborUsd")) || 0, partName: partName || undefined, partCost: partName ? Number(g("partCost")) || 0 : undefined, brands: g("brands") ? g("brands").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6) : undefined }),
                  `${title} is on your menu.`,
                );
                f.reset();
                setAddOpen(false);
              }}
            >
              <label className={cx("fld")}><span className={cx("lbl")}>Task</span><input name="title" className={cx("in")} required minLength={2} placeholder="Replace the zone damper actuator" autoFocus /></label>
              <label className={cx("fld")}><span className={cx("lbl")}>Labor $</span><input name="laborUsd" className={cx("in")} type="number" min="0" step="1" required /></label>
              <label className={cx("fld", "wide")}><span className={cx("lbl")}>What it includes (the customer reads this)</span><input name="includes" className={cx("in")} placeholder="Actuator on the existing damper, end switches set" /></label>
              <label className={cx("fld")}><span className={cx("lbl")}>Part (optional)</span><input name="partName" className={cx("in")} placeholder="Damper actuator" /></label>
              <label className={cx("fld")}><span className={cx("lbl")}>Part cost $</span><input name="partCost" className={cx("in")} type="number" min="0" step="1" /></label>
              <label className={cx("fld", "wide")}><span className={cx("lbl")}>Brands, comma-separated (optional)</span><input name="brands" className={cx("in")} placeholder="Honeywell, EWC" /></label>
              <div className={cx("acts", "wide")}><button className={cx("btn", "btn-primary", "btn--sm")} type="submit" disabled={pending}>Add to my menu</button></div>
            </form>
          )}
          {custom.length > 0 ? (
            <div className={cx("tbl-wrap")}>
              <table className={cx("tbl", "tbl-edit")}>
                <thead><tr><th>Task</th><th>Labor</th><th>Part</th><th>Line</th><th aria-label="Actions"></th></tr></thead>
                <tbody>
                  {custom.map((t) =>
                    editing === t.id ? (
                      <tr key={t.id} data-own-task={t.id}>
                        <td colSpan={5}>
                          <form
                            className={cx("frm", "frm-edit")}
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = e.currentTarget;
                              const g = (n: string) => String((f.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "").trim();
                              const partName = g("partName");
                              run(() => updateHvacServiceTask({ id: t.id, title: g("title"), includes: g("includes") || undefined, laborUsd: Number(g("laborUsd")) || 0, partName: partName || undefined, partCost: partName ? Number(g("partCost")) || 0 : undefined, brands: g("brands") ? g("brands").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6) : undefined }), `${g("title")} saved.`);
                              setEditing(null);
                            }}
                          >
                            <label className={cx("fld")}><span className={cx("lbl")}>Task</span><input name="title" className={cx("in")} required minLength={2} defaultValue={t.title} /></label>
                            <label className={cx("fld")}><span className={cx("lbl")}>Labor $</span><input name="laborUsd" className={cx("in")} type="number" min="0" step="1" required defaultValue={t.laborUsd} /></label>
                            <label className={cx("fld", "wide")}><span className={cx("lbl")}>What it includes</span><input name="includes" className={cx("in")} defaultValue={t.includes} /></label>
                            <label className={cx("fld")}><span className={cx("lbl")}>Part (optional)</span><input name="partName" className={cx("in")} defaultValue={t.part?.name ?? ""} /></label>
                            <label className={cx("fld")}><span className={cx("lbl")}>Part cost $</span><input name="partCost" className={cx("in")} type="number" min="0" step="1" defaultValue={t.part?.costUsd ?? ""} /></label>
                            <label className={cx("fld", "wide")}><span className={cx("lbl")}>Brands, comma-separated</span><input name="brands" className={cx("in")} defaultValue={t.part?.brands?.join(", ") ?? ""} /></label>
                            <div className={cx("acts", "wide")}>
                              <button className={cx("btn", "btn-primary", "btn--sm")} type="submit" disabled={pending}>Save</button>
                              <button className={cx("btn", "btn-ghost", "btn--sm")} type="button" onClick={() => setEditing(null)}>Cancel</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={t.id} data-own-task={t.id}>
                        <td data-l="Task"><span className={cx("who")}>{t.title}</span><span className={cx("sub")}>{t.includes}</span></td>
                        <td data-l="Labor" className={cx("mono")}>{usd(t.laborUsd)}</td>
                        <td data-l="Part">{t.part ? <><span className={cx("part-name")}>{t.part.name}</span><span className={cx("was")}>cost {usd(t.part.costUsd)} +{card.materialsMarkupPct}% = {usd(mk(t.part.costUsd))}</span></> : <span className={cx("sub-inline")}>—</span>}</td>
                        <td data-l="Line" className={cx("mono", "line-total")}>{usd(t.laborUsd + (t.part ? mk(t.part.costUsd) : 0))}</td>
                        <td data-l="" className={cx("row-acts")}>
                          <button type="button" className={cx("link")} onClick={() => { setEditing(t.id); setSure(null); }}>Edit</button>
                          {sure === t.id ? (
                            <>
                              <button type="button" className={cx("link", "link-danger")} disabled={pending} onClick={() => { run(() => deleteHvacServiceTask(t.id), `${t.title} removed from your menu.`); setSure(null); }} data-delete-own={t.id}>Yes, remove</button>
                              <button type="button" className={cx("link")} onClick={() => setSure(null)}>keep</button>
                            </>
                          ) : (
                            <button type="button" className={cx("link")} onClick={() => setSure(t.id)}>Remove</button>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            !addOpen && <div className={cx("empty")}>A task the book does not have — a name, your labor, the part if there is one. It joins the visit&apos;s menu under &ldquo;Your own tasks&rdquo;.</div>
          )}
        </section>
      </div>
    </>
  );
}

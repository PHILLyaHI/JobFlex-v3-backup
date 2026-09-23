"use client";

// Below the ledger: WHAT HAPPENED (the movement feed), SUPPLIERS (with the
// inline add form) and the trade's PROPOSALS, each saying whether the shelf
// covers it. Writes: upsertSupplier and setProposalInventoryLink, called as
// the live board calls them.

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { upsertSupplier } from "@/actions/inventory";
import { setProposalInventoryLink } from "@/actions/inventoryLink";
import type { BoardProposal, TradeBoardData } from "@/lib/inventoryBoard";
import type { StockFacts } from "@/lib/inventoryDashboard";
import { ago, dayOf, inProposalTab, materialsOf, moveKind, plural, PROPOSAL_TABS, qty, STATUS_LABEL, usd, type Board, type ProposalTab } from "./inventory-model";
import { Ic, Plate, type PlateTone, type Run } from "./ri-parts";

export function RiFeed({ facts }: { facts: StockFacts }) {
  const scrolls = facts.recent.length > 5;
  return (
    <section className="ri-sec" aria-labelledby="ri-feed-h">
      <div className="ri-sec-head">
        <h2 className="ri-h2" id="ri-feed-h">
          What happened
        </h2>
        <span className="ri-sec-anno">the last {facts.windowDays} days</span>
      </div>
      <div className="ri-card">
        {facts.recent.length === 0 ? (
          <p className="ri-empty">Nothing has moved yet. Receiving a delivery, counting the shelf and loading a truck all land here.</p>
        ) : (
          <div className="ri-feed" data-scroll={scrolls ? "" : undefined} tabIndex={scrolls ? 0 : undefined} role={scrolls ? "region" : undefined} aria-labelledby={scrolls ? "ri-feed-h" : undefined}>
            <ul className="ri-feed-list">
              {facts.recent.map((m) => {
                const k = moveKind(m);
                const parts: ReactNode[] = [];
                if (m.actor) parts.push(m.actor);
                if (m.jobId && m.jobTitle)
                  parts.push(
                    <Link key="job" className="ri-inline-link" href={`/dashboard/jobs/${m.jobId}` as Route}>
                      {m.jobTitle}
                    </Link>,
                  );
                if (m.note && m.note !== "Counted") parts.push(m.note);
                return (
                  <li key={m.id} className="ri-feed-row">
                    <Plate tone={k.tone}>{k.label}</Plate>
                    <div className="ri-feed-main">
                      <p className="ri-feed-what" title={m.itemName}>
                        <span className="ri-feed-q">
                          {k.sign}
                          {qty(Math.abs(m.quantity))} {m.unit}
                        </span>{" "}
                        · {m.itemName}
                      </p>
                      {parts.length > 0 && (
                        <p className="ri-feed-who">
                          {parts.map((p, i) => (
                            <Fragment key={i}>
                              {i ? " · " : ""}
                              {p}
                            </Fragment>
                          ))}
                        </p>
                      )}
                    </div>
                    <time className="ri-feed-ago" dateTime={m.at} suppressHydrationWarning>
                      {ago(m.at)}
                    </time>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export function RiSuppliers({ data, canWrite, pending, run, open, setOpen }: { data: TradeBoardData; canWrite: boolean; pending: boolean; run: Run; open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <section className="ri-sec" id="ri-suppliers" aria-labelledby="ri-sup-h">
      <div className="ri-sec-head">
        <h2 className="ri-h2" id="ri-sup-h">
          Suppliers
        </h2>
        <span className="ri-sec-anno">{plural(data.suppliers.length, "supplier")}</span>
        {canWrite && (
          <button className="ri-mini ri-sec-tool" type="button" data-on={open ? "" : undefined} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? (
              "Close"
            ) : (
              <>
                <Ic id="i-plus" />
                Add supplier
              </>
            )}
          </button>
        )}
      </div>
      <div className="ri-card">
        {data.suppliers.length === 0 && !open ? <p className="ri-empty">No suppliers yet. A supplier with an email is where a purchase order goes.</p> : null}
        {data.suppliers.length > 0 && (
          <ul className="ri-sups" data-suppliers>
            {data.suppliers.map((x) => (
              <li key={x.id} className="ri-sup-row">
                <div className="ri-sup-main">
                  <p className="ri-sup-name" title={x.name}>
                    {x.name}
                  </p>
                  <p className="ri-sup-meta">
                    {x.email ? <span>{x.email}</span> : <span data-missing="">no email — purchase orders cannot go out</span>}
                    {x.phone ? (
                      <>
                        <i className="ri-dot" aria-hidden="true">
                          ·
                        </i>
                        <span>{x.phone}</span>
                      </>
                    ) : null}
                    {x.website ? (
                      <>
                        <i className="ri-dot" aria-hidden="true">
                          ·
                        </i>
                        <span>
                          <a className="ri-inline-link" href={x.website.startsWith("http") ? x.website : `https://${x.website}`} target="_blank" rel="noreferrer">
                            order online
                          </a>
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <span className="ri-sup-count">{plural(x.itemCount, "item")}</span>
              </li>
            ))}
          </ul>
        )}
        {canWrite && open && (
          <form
            className="ri-sup-form"
            aria-label="Add a supplier"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const g = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
              const name = g("sname").trim();
              if (!name) return;
              run(() => upsertSupplier({ name, email: g("semail"), phone: g("sphone"), website: g("sweb") }), () => `${name} added.`);
              f.reset();
              setOpen(false);
            }}
          >
            <label className="ri-fld">
              <span className="ri-lbl">Supplier</span>
              <input name="sname" className="ri-in" placeholder="ABC Supply · Kent" autoFocus />
            </label>
            <label className="ri-fld">
              <span className="ri-lbl">Email for orders</span>
              <input name="semail" className="ri-in" type="email" placeholder="orders@…" />
            </label>
            <label className="ri-fld">
              <span className="ri-lbl">Phone</span>
              <input name="sphone" className="ri-in" type="tel" placeholder="(425) …" />
            </label>
            <label className="ri-fld">
              <span className="ri-lbl">Website</span>
              <input name="sweb" className="ri-in" placeholder="ordering page" />
            </label>
            <div className="ri-sup-form-acts">
              <button className="ri-btn ri-btn--primary" type="submit" disabled={pending}>
                Add supplier
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

const STATUS_TONE: Record<string, PlateTone> = { DRAFT: "none", SENT: "info", VIEWED: "blue", ACCEPTED: "ok", COMPLETED: "ink", PAID: "ok", DECLINED: "bad" };

export function RiProposals({ board, data, canWrite, pending, run }: { board: Board; data: TradeBoardData; canWrite: boolean; pending: boolean; run: Run }) {
  const [tab, setTab] = useState<ProposalTab>("ALL");
  const t = board.trade;
  const listed = board.proposals.filter((p) => inProposalTab(p, tab));
  const link = (p: BoardProposal, linked: boolean) =>
    run(
      () => setProposalInventoryLink({ proposalId: p.id, linked, trade: data.trade }),
      () => (linked ? `${p.title} is connected to the inventory again.` : `${p.title} is an estimate only now — nothing reserved for it.`),
    );

  return (
    <section className="ri-sec" aria-labelledby="ri-props-h">
      <div className="ri-sec-head">
        <h2 className="ri-h2" id="ri-props-h">
          {t.label} proposals
        </h2>
        <span className="ri-sec-anno">{plural(board.proposals.length, "proposal")}</span>
      </div>
      <p className="ri-sec-note">Every proposal from the {t.label} estimator. The Proposals page lists them all together.</p>
      <div className="ri-card">
        {board.proposals.length === 0 ? (
          <p className="ri-empty">
            No {t.noun} proposals yet — make one with the {t.label} estimator.
          </p>
        ) : (
          <>
            <div className="ri-tools">
              <div className="ri-chips" role="group" aria-label="Show proposals">
                {PROPOSAL_TABS.map((x) => (
                  <button key={x.id} type="button" className="ri-chip" data-ptab={x.id} aria-pressed={tab === x.id} onClick={() => setTab(x.id)}>
                    {x.label}
                    <b>{board.proposalCounts[x.id]}</b>
                  </button>
                ))}
              </div>
            </div>
            {listed.length === 0 ? (
              <p className="ri-empty">Nothing here.</p>
            ) : (
              <div className="ri-tbl-wrap ri-tbl-wrap--props">
                <table className="ri-tbl ri-ptbl" data-trade-proposals>
                  <thead>
                    <tr>
                      <th scope="col" className="ri-p-c-title">
                        Proposal
                      </th>
                      <th scope="col" className="ri-p-c-status">
                        Status
                      </th>
                      <th scope="col" className="ri-p-c-mat">
                        Materials
                      </th>
                      <th scope="col" className="ri-c-num ri-p-c-total">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {listed.map((p) => {
                      const m = materialsOf(p, data.rows);
                      return (
                        <tr key={p.id} className="ri-row" data-inferred={p.inferred ? "true" : "false"}>
                          <td className="ri-p-c-title">
                            <Link className="ri-p-title" href={`/dashboard/manual-blueprint?proposal=${p.id}` as Route} title={p.title}>
                              {p.title}
                            </Link>
                            <p className="ri-p-sub" suppressHydrationWarning>
                              {p.client ?? "No client"} · {dayOf(p.createdAt)} · {plural(p.lines.length, "material line")}
                              {p.inferred ? <span className="ri-tag">by its materials</span> : null}
                              {!p.linked ? <span className="ri-tag">not connected</span> : null}
                            </p>
                          </td>
                          <td className="ri-p-c-status">
                            <div className="ri-p-status">
                              <Plate tone={STATUS_TONE[p.status] ?? "none"}>{STATUS_LABEL[p.status] ?? p.status}</Plate>
                              {p.linked && p.status === "ACCEPTED" ? <Plate tone={p.loaded ? "ok" : "blue"}>{p.loaded ? "Loaded" : "Reserved in stock"}</Plate> : null}
                              {canWrite && (
                                <button className="ri-mini" type="button" disabled={pending} data-link={p.linked ? "off" : "on"} onClick={() => link(p, !p.linked)}>
                                  {p.linked ? "Disconnect" : "Connect"}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="ri-p-c-mat">
                            <p className="ri-mat" data-tone={m.tone}>
                              {m.text}
                            </p>
                            {p.linked && p.jobId && (p.status === "ACCEPTED" || p.status === "COMPLETED") ? (
                              <p className="ri-mat-sub" suppressHydrationWarning>
                                {p.jobStartsAt ? `starts ${dayOf(p.jobStartsAt)} · ` : ""}
                                <Link className="ri-link" href={`/dashboard/jobs/${p.jobId}` as Route}>
                                  Pick list
                                  <Ic id="i-arrow" />
                                </Link>
                              </p>
                            ) : null}
                          </td>
                          <td className="ri-c-num ri-p-c-total">
                            <span className="ri-money">{usd(p.total)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

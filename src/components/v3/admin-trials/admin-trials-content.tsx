"use client";

// ADMIN TRIAL WATCH — /admin/trials, blueprint (2026-09-24).
//
// The companies signed up in the window, highest score first: what they
// looked at, what they made, and why the score is what it is — each signal a
// sentence with its weight, under the row. Same vocabulary as the other
// admin pages (admin-shared): the KPI strip, the filter bar, the estimate
// table that stacks on a phone.

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { TrialWatchData } from "@/actions/trialWatch";
import type { TrialLevel } from "@/lib/trialWatch";
import s from "@/components/v3/admin-overview/admin-shared.module.css";
import { Ic, StatusChip, ago } from "@/components/v3/admin-overview/admin-ui";
import t from "./admin-trials.module.css";

const LEVEL_LABEL: Record<TrialLevel, string> = { suspicious: "Look at this", watch: "Watch", clear: "Clear" };

export function AdminTrialsContent({ data }: { data: TrialWatchData }) {
  const [level, setLevel] = useState<"" | TrialLevel>("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((r) => (!level || r.level === level) && (!q || r.name.toLowerCase().includes(q) || (r.ownerEmail ?? "").toLowerCase().includes(q)));
  }, [data.rows, level, query]);
  const suspicious = data.rows.filter((r) => r.level === "suspicious").length;
  const watching = data.rows.filter((r) => r.level === "watch").length;
  const working = data.rows.filter((r) => r.writes > 0).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Platform · Trials</div>
          <h1 className="page-title">Trial watch</h1>
        </div>
        <div className={s.headSide}>
          {suspicious > 0 ? <span className={`chip ${s.chipDanger}`}>{suspicious} to look at</span> : <span className="chip ok">Nothing to look at</span>}
          <Link className="btn btn-ghost" href={"/admin/subscribers" as Route}>
            <Ic id="i-card" />
            Subscribers
          </Link>
        </div>
      </div>

      {!data.viewsAvailable && (
        <p className={`${s.note} ${t.warn}`} data-views-missing>
          <b>Page views are not being recorded yet.</b> The PageView table is not in this database — push the schema and this page fills in. Until then only the signals that need no page views show: a competitor&apos;s domain, a test name, the records made.
        </p>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-lbl">Trials · last {data.windowDays} days</div>
          <div className="kpi-val">{data.rows.length}</div>
          <div className={s.kpiSrc}>Signed up in the window</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Look at these</div>
          <div className={suspicious > 0 ? "kpi-val accent" : "kpi-val"}>{suspicious}</div>
          <div className={s.kpiSrc}>Score 60 and up</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Watching</div>
          <div className="kpi-val">{watching}</div>
          <div className={s.kpiSrc}>Score 30 to 59</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Working</div>
          <div className="kpi-val">{working}</div>
          <div className={s.kpiSrc}>Made a client, proposal, job or lead</div>
        </div>
      </div>

      <p className={s.note}>
        A screenshot cannot be seen. Behaviour can: an account that opens every screen and creates nothing, races through the product, signs up from a competitor&apos;s domain or shares a device with another trial scores up; proposals sent and jobs scheduled score it down. Page views are kept for a company&apos;s first {data.watchDays} days. Every screen of an unpaid account carries a faint watermark with the company, the email and the date, so a leaked screenshot names its source.
      </p>

      <div className="card">
        <div className="card-head">
          <div className="card-titles">
            <div className="card-title">Trials, highest score first</div>
          </div>
          <span className={s.count}>
            {rows.length} of {data.rows.length}
          </span>
        </div>
        <div className={s.filters}>
          <input className={`${s.search} ${s.fSearch}`} placeholder="Company or email" aria-label="Find a trial" value={query} onChange={(e) => setQuery(e.target.value)} />
          <span className={`bp-sel bp-sel--admin ${s.fSel}`}>
            <select className="bp-sel-in" aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value as "" | TrialLevel)}>
              <option value="">All levels</option>
              <option value="suspicious">Look at these</option>
              <option value="watch">Watching</option>
              <option value="clear">Clear</option>
            </select>
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="empty">{data.rows.length ? "No trials match." : `No companies signed up in the last ${data.windowDays} days.`}</div>
        ) : (
          <table className={s.tbl}>
            <thead>
              <tr>
                <th>Company</th>
                <th>Signed up</th>
                <th className={s.num}>Screens</th>
                <th className={s.num}>Records</th>
                <th>Active</th>
                <th>Score</th>
                <th>
                  <span className={t.srOnly}>Why</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr data-trial-row={r.id} data-level={r.level}>
                    <td data-l="Company">
                      <div>
                        <b>{r.name}</b>
                        <div className={s.sub}>{r.ownerEmail ?? "no owner email"}</div>
                      </div>
                    </td>
                    <td data-l="Signed up">
                      <div>
                        {ago(r.createdAt, data.now)}
                        <div className={s.sub}>
                          <StatusChip status={r.status} />
                        </div>
                      </div>
                    </td>
                    <td data-l="Screens" className={s.num}>
                      {r.distinctRoutes}
                      <span className={s.sub}> · {r.views} views</span>
                    </td>
                    <td data-l="Records" className={s.num}>
                      {r.writes}
                      <span className={s.sub}> · {r.records.sent} sent</span>
                    </td>
                    <td data-l="Active">
                      {r.sessions ? `${r.sessions} ${r.sessions === 1 ? "sitting" : "sittings"} · ${r.minutesActive} min` : "—"}
                      {r.lastSeen && <div className={s.sub}>last {ago(r.lastSeen, data.now)}</div>}
                    </td>
                    <td data-l="Score">
                      <div className={t.score}>
                        <i className={t.bar} data-level={r.level}>
                          <b style={{ width: `${r.score}%` }} />
                        </i>
                        <b>{r.score}</b>
                        <span className={t.level} data-level={r.level}>
                          {LEVEL_LABEL[r.level]}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                        {open === r.id ? "Close" : "Why"}
                      </button>
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr className={s.detail} data-trial-detail>
                      <td colSpan={7}>
                        <div className={t.detail}>
                          <div>
                            <div className={s.detailHead}>Signals</div>
                            {r.signals.length ? (
                              <ul className={t.signals}>
                                {r.signals.map((sg) => (
                                  <li key={sg.code} data-weight={sg.weight > 0 ? "up" : "down"}>
                                    <b>{sg.weight > 0 ? `+${sg.weight}` : sg.weight}</b>
                                    {sg.text}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className={s.detailNote}>Nothing stands out.</p>
                            )}
                          </div>
                          <div>
                            <div className={s.detailHead}>Screens opened</div>
                            {r.routes.length ? (
                              <div className={t.routes}>
                                {r.routes.slice(0, 24).map((rt) => (
                                  <span key={rt}>{rt}</span>
                                ))}
                                {r.routes.length > 24 && <span>+{r.routes.length - 24} more</span>}
                              </div>
                            ) : (
                              <p className={s.detailNote}>No page views recorded{data.viewsAvailable ? "" : " — the table is not in this database"}.</p>
                            )}
                          </div>
                          <div>
                            <div className={s.detailHead}>Made</div>
                            <p className={s.detailNote}>
                              {r.records.clients} clients · {r.records.proposals} proposals ({r.records.sent} sent) · {r.records.jobs} jobs · {r.records.leads} leads
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

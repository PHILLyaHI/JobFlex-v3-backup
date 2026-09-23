// SERVICE PLANS — THE PAGE (2026-09-22), on the blueprint sheet. Server
// rendered: every button is a form bound to a server action
// (actions/servicePlans), nothing to hydrate. What the office reads at a
// glance (members, expiring, monthly revenue, bills due), then the members,
// the visits ahead, the bills open, and the plans the shop sells.

import Link from "next/link";
import type { Route } from "next";
import {
  activateServicePlan,
  archiveServicePlanTemplate,
  cancelServicePlan,
  completePlanVisit,
  enrollClientInPlan,
  markServicePlanInvoicePaid,
  renewServicePlan,
  saveServicePlanTemplate,
  seedStarterPlans,
  sendServicePlan,
  setPlanAutoRenew,
} from "@/actions/servicePlans";
import { money } from "@/lib/servicePlans";
import type { PlansDashboard } from "@/lib/servicePlanBook";
import styles from "./service-plans.module.css";

const cx = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).map((n) => styles[n as string] ?? n).join(" ");

const day = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");
const when = (d: Date | null | undefined, tz: string) => (d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }) : "—");
const PHASE_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent", active: "Active", expiring: "Expiring", lapsed: "Ended · renew", expired: "Expired", canceled: "Canceled" };

export function ServicePlansContent({ data, timeZone, appUrl }: { data: PlansDashboard; timeZone: string; appUrl: string }) {
  const { stats, plans, templates, visitsDue, clients } = data;
  const open = plans.flatMap((p) => p.openInvoices.map((i) => ({ ...i, clientName: p.clientName, planName: p.name })));
  const members = plans.filter((p) => p.status !== "CANCELED" && p.status !== "EXPIRED");
  const past = plans.filter((p) => p.status === "CANCELED" || p.status === "EXPIRED");

  return (
    <>
      <div className={cx("page-head")}>
        <div>
          <div className={cx("kicker")}>Money · Memberships</div>
          <h1 className={cx("page-title")}>Service plans</h1>
        </div>
        <div className={cx("page-actions")}>
          {templates.length === 0 && (
            <form action={seedStarterPlans}>
              <button className={cx("btn", "btn-primary")} type="submit" data-seed-plans>
                Add the three starter plans
              </button>
            </form>
          )}
          <Link className={cx("btn", "btn-ghost")} href={"/dashboard/calendar" as Route}>
            Calendar
          </Link>
        </div>
      </div>

      <div className={cx("kpis")} data-plan-kpis>
        <div className={cx("kpi")}>
          <div className={cx("kpi-lbl")}>Active members</div>
          <div className={cx("kpi-val")} data-kpi="active">{stats.active}</div>
          <div className={cx("kpi-sub")}>{stats.drafts ? `${stats.drafts} waiting to be signed` : "every plan signed"}</div>
        </div>
        <div className={cx("kpi")}>
          <div className={cx("kpi-lbl")}>Expiring · 30 days</div>
          <div className={cx("kpi-val")} data-kpi="expiring">{stats.expiring}</div>
          <div className={cx("kpi-sub")}>{stats.expiring ? "call to renew" : "nothing ending soon"}</div>
        </div>
        <div className={cx("kpi")}>
          <div className={cx("kpi-lbl")}>Monthly recurring</div>
          <div className={cx("kpi-val")} data-kpi="mrr">{money(stats.mrrCents)}</div>
          <div className={cx("kpi-sub")}>{money(stats.mrrCents * 12)} a year at this pace</div>
        </div>
        <div className={cx("kpi")}>
          <div className={cx("kpi-lbl")}>Due for billing</div>
          <div className={cx("kpi-val")} data-kpi="due">{money(stats.dueCents)}</div>
          <div className={cx("kpi-sub")}>{stats.dueCount} open invoice{stats.dueCount === 1 ? "" : "s"} · {stats.visitsDue} visit{stats.visitsDue === 1 ? "" : "s"} in 30 days</div>
        </div>
      </div>

      <div className={cx("stack")}>
        {/* ── enroll ── */}
        <section className={cx("card")} data-plan-enroll>
          <div className={cx("card-h")}>
            <div className={cx("card-t")}>Enroll a client</div>
            <div className={cx("card-s")}>send the plan to sign, or start it today when it was signed with the office</div>
          </div>
          {templates.length === 0 ? (
            <div className={cx("empty")}>Add the starter plans above (or your own below) to start enrolling clients.</div>
          ) : (
            <form action={enrollClientInPlan} className={cx("row")}>
              <label className={cx("fld")}>
                <span className={cx("lbl")}>Client</span>
                <select name="clientId" className={cx("sel")} required defaultValue="">
                  <option value="" disabled>Pick a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className={cx("fld")}>
                <span className={cx("lbl")}>Plan</span>
                <select name="templateId" className={cx("sel")} required defaultValue={templates[0]?.id}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — {t.terms}</option>
                  ))}
                </select>
              </label>
              <div className={cx("acts")}>
                <button className={cx("btn", "btn-primary", "btn--sm")} type="submit" name="then" value="send">Enroll and send to sign</button>
                <button className={cx("btn", "btn-ghost", "btn--sm")} type="submit" name="then" value="activate">Enroll and start today</button>
              </div>
            </form>
          )}
        </section>

        {/* ── members ── */}
        <section className={cx("card")} data-plan-members>
          <div className={cx("card-h")}>
            <div className={cx("card-t")}>Members</div>
            <div className={cx("card-s")}>{members.length} plan{members.length === 1 ? "" : "s"} · a member&apos;s discount rides on every new proposal for them</div>
          </div>
          {members.length === 0 ? (
            <div className={cx("empty")}>No members yet. Enroll a client above — the visits go on the calendar and the first bill goes out on their own.</div>
          ) : (
            <div className={cx("tbl-wrap")}>
              <table className={cx("tbl")}>
                <thead>
                  <tr><th>Client</th><th>Plan</th><th>Status</th><th>Next visit</th><th>Next bill</th><th>Term</th><th></th></tr>
                </thead>
                <tbody>
                  {members.map((p) => (
                    <tr key={p.id} data-plan-row={p.phase}>
                      <td>
                        <Link className={cx("who")} href={`/dashboard/client-detail?client=${p.clientId}` as Route}>{p.clientName}</Link>
                        <span className={cx("sub")}>{p.clientEmail ?? "no email — share the accept link"}</span>
                      </td>
                      <td>
                        {p.name}
                        <span className={cx("sub")}>{p.terms}</span>
                      </td>
                      <td>
                        <span className={cx("plate", `plate--${p.phase}`)}>{PHASE_LABEL[p.phase] ?? p.phase}</span>
                        {(p.status === "DRAFT" || p.status === "SENT") && (
                          <span className={cx("sub")}>
                            <a href={`${appUrl}/plan/${p.acceptToken}`} target="_blank" rel="noreferrer">accept link</a>
                          </span>
                        )}
                      </td>
                      <td className={cx("mono")}>
                        {p.nextVisit ? (
                          <>
                            {when(p.nextVisit.dueAt, timeZone)}
                            <span className={cx("sub")}>{p.nextVisit.label} · {p.visitsDone}/{p.visitsTotal} done</span>
                          </>
                        ) : p.status === "ACTIVE" ? (
                          <>—<span className={cx("sub")}>{p.visitsDone}/{p.visitsTotal} done</span></>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={cx("mono")}>
                        {p.openInvoices.length ? (
                          <>
                            {money(Math.round(p.openInvoices[0].amount * 100))} open
                            <span className={cx("sub")}>invoice {p.openInvoices[0].number} · due {day(p.openInvoices[0].dueDate)}</span>
                          </>
                        ) : p.nextBillingAt ? (
                          day(p.nextBillingAt)
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={cx("mono")}>
                        {p.startsAt ? `${day(p.startsAt)} – ${day(p.endsAt)}` : "not started"}
                        {p.status === "ACTIVE" && <span className={cx("sub")}>{p.autoRenew ? "renews on its own" : "ends, no renewal"}</span>}
                      </td>
                      <td>
                        <div className={cx("acts")}>
                          {(p.status === "DRAFT" || p.status === "SENT") && (
                            <>
                              <form action={sendServicePlan.bind(null, p.id)}><button className={cx("btn", "btn-ghost", "btn--sm")} type="submit">{p.status === "SENT" ? "Send again" : "Send to sign"}</button></form>
                              <form action={activateServicePlan.bind(null, p.id)}><button className={cx("btn", "btn-primary", "btn--sm")} type="submit" data-plan-activate>Start today</button></form>
                            </>
                          )}
                          {(p.phase === "expiring" || p.phase === "lapsed") && (
                            <form action={renewServicePlan.bind(null, p.id)}><button className={cx("btn", "btn-primary", "btn--sm")} type="submit">Renew now</button></form>
                          )}
                          {p.status === "ACTIVE" && (
                            <form action={setPlanAutoRenew.bind(null, p.id, !p.autoRenew)}><button className={cx("btn", "btn-ghost", "btn--sm")} type="submit">{p.autoRenew ? "Stop auto-renew" : "Auto-renew"}</button></form>
                          )}
                          {p.status !== "CANCELED" && (
                            <form action={cancelServicePlan.bind(null, p.id)}><button className={cx("btn", "btn-ghost", "btn--sm")} type="submit">Cancel</button></form>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className={cx("two")}>
          {/* ── visits ahead ── */}
          <section className={cx("card")} data-plan-visits>
            <div className={cx("card-h")}>
              <div className={cx("card-t")}>Visits in the next 30 days</div>
              <div className={cx("card-s")}>on the calendar at 9:00 with the crew&apos;s checklist; move them there</div>
            </div>
            {visitsDue.length === 0 ? (
              <div className={cx("empty")}>Nothing due in the next 30 days.</div>
            ) : (
              <table className={cx("tbl")}>
                <thead><tr><th>When</th><th>Client</th><th>Visit</th><th></th></tr></thead>
                <tbody>
                  {visitsDue.map((v) => (
                    <tr key={v.id}>
                      <td className={cx("mono")}>{when(v.startsAt ?? v.dueAt, timeZone)}</td>
                      <td className={cx("who")}>{v.clientName}</td>
                      <td>{v.label}<span className={cx("sub")}>{v.planName}</span></td>
                      <td><form action={completePlanVisit.bind(null, v.id)}><button className={cx("btn", "btn-ghost", "btn--sm")} type="submit">Done</button></form></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ── bills open ── */}
          <section className={cx("card")} data-plan-billing>
            <div className={cx("card-h")}>
              <div className={cx("card-t")}>Due for billing</div>
              <div className={cx("card-s")}>plan invoices go out by email on schedule; mark them paid when the money lands</div>
            </div>
            {open.length === 0 ? (
              <div className={cx("empty")}>No open plan invoices.</div>
            ) : (
              <table className={cx("tbl")}>
                <thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th>Amount</th><th></th></tr></thead>
                <tbody>
                  {open.map((i) => (
                    <tr key={i.id}>
                      <td className={cx("mono")}>{i.number}<span className={cx("sub")}>{i.planName}</span></td>
                      <td className={cx("who")}>{i.clientName}</td>
                      <td className={cx("mono")}>{day(i.dueDate)}</td>
                      <td className={cx("mono")}>{money(Math.round(i.amount * 100))}</td>
                      <td><form action={markServicePlanInvoicePaid.bind(null, i.id)}><button className={cx("btn", "btn-ghost", "btn--sm")} type="submit">Mark paid</button></form></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* ── the plans the shop sells ── */}
        <section className={cx("card")} data-plan-templates>
          <div className={cx("card-h")}>
            <div className={cx("card-t")}>The plans you sell</div>
            <div className={cx("card-s")}>a member keeps the terms they signed; edits here shape the next enrollment</div>
          </div>
          <div className={cx("tpl")}>
            {templates.map((t) => (
              <div key={t.id} data-plan-template>
                <div className={cx("card-t")}>{t.name}</div>
                <div className={cx("tpl-terms")}>{t.terms} · {t.members} member{t.members === 1 ? "" : "s"}</div>
                {t.description && <p className={cx("hint")}>{t.description}</p>}
                {t.benefits.length > 0 && (
                  <ul className={cx("benefits")}>
                    {t.benefits.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                )}
                <details>
                  <summary>Edit this plan</summary>
                  <TemplateForm t={t} />
                </details>
              </div>
            ))}
            <div data-plan-template-new>
              <div className={cx("card-t")}>New plan</div>
              <div className={cx("tpl-terms")}>visits a year, price, discount, benefits</div>
              <TemplateForm />
            </div>
          </div>
        </section>

        {past.length > 0 && (
          <section className={cx("card")}>
            <div className={cx("card-h")}>
              <div className={cx("card-t")}>Past plans</div>
              <div className={cx("card-s")}>{past.length} expired or canceled — renew brings an expired plan back</div>
            </div>
            <table className={cx("tbl")}>
              <thead><tr><th>Client</th><th>Plan</th><th>Status</th><th>Term</th><th></th></tr></thead>
              <tbody>
                {past.map((p) => (
                  <tr key={p.id}>
                    <td className={cx("who")}>{p.clientName}</td>
                    <td>{p.name}<span className={cx("sub")}>{p.terms}</span></td>
                    <td><span className={cx("plate", `plate--${p.phase}`)}>{PHASE_LABEL[p.phase] ?? p.phase}</span></td>
                    <td className={cx("mono")}>{p.startsAt ? `${day(p.startsAt)} – ${day(p.endsAt)}` : "—"}</td>
                    <td>{p.status === "EXPIRED" && <form action={renewServicePlan.bind(null, p.id)}><button className={cx("btn", "btn-ghost", "btn--sm")} type="submit">Renew</button></form>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </>
  );
}

function TemplateForm({ t }: { t?: PlansDashboard["templates"][number] }) {
  return (
    <form action={saveServicePlanTemplate} className={cx("frm")} style={{ marginTop: 10 }}>
      {t && <input type="hidden" name="id" value={t.id} />}
      <label className={cx("fld", "wide")}><span className={cx("lbl")}>Name</span><input name="name" className={cx("in")} defaultValue={t?.name ?? ""} required minLength={2} /></label>
      <label className={cx("fld")}><span className={cx("lbl")}>Price ($)</span><input name="priceDollars" className={cx("in")} type="number" step="0.01" min="0" defaultValue={t ? (t.priceCents / 100).toString() : "21"} required /></label>
      <label className={cx("fld")}><span className={cx("lbl")}>Billed</span>
        <select name="billing" className={cx("sel")} defaultValue={t?.billing ?? "MONTHLY"}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select>
      </label>
      <label className={cx("fld")}><span className={cx("lbl")}>Visits a year</span><input name="visitsPerYear" className={cx("in")} type="number" min="0" max="12" defaultValue={t?.visitsPerYear ?? 2} required /></label>
      <label className={cx("fld")}><span className={cx("lbl")}>Term (months)</span><input name="termMonths" className={cx("in")} type="number" min="1" max="60" defaultValue={t?.termMonths ?? 12} required /></label>
      <label className={cx("fld")}><span className={cx("lbl")}>Discount on repairs (%)</span><input name="discountPct" className={cx("in")} type="number" min="0" max="100" defaultValue={t?.discountPct ?? 15} required /></label>
      <div className={cx("fld")}>
        <span className={cx("lbl")}>Perks</span>
        <label className={cx("chk")}><input type="checkbox" name="priorityScheduling" defaultChecked={t ? t.priorityScheduling : true} /> Priority scheduling</label>
        <label className={cx("chk")}><input type="checkbox" name="waivedDiagnostic" defaultChecked={t ? t.waivedDiagnostic : false} /> Diagnostic fee waived</label>
      </div>
      <label className={cx("fld", "wide")}><span className={cx("lbl")}>Description (the client reads this)</span><textarea name="description" className={cx("ta")} defaultValue={t?.description ?? ""} /></label>
      <label className={cx("fld", "wide")}><span className={cx("lbl")}>Benefits, one per line</span><textarea name="benefits" className={cx("ta")} defaultValue={t?.benefits.join("\n") ?? ""} /></label>
      <div className={cx("acts", "wide")}>
        <button className={cx("btn", "btn-primary", "btn--sm")} type="submit">{t ? "Save" : "Add this plan"}</button>
        {t && (
          <button className={cx("btn", "btn-ghost", "btn--sm")} type="submit" formAction={archiveServicePlanTemplate.bind(null, t.id)}>Retire</button>
        )}
      </div>
    </form>
  );
}

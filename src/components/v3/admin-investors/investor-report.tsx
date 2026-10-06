// THE INVESTOR REPORT (2026-10-06) — the same page for the admin, for the
// shared link and (in prose) for the PDF: what the ads cost, who signed up,
// what the trials are worth, who pays, and when the ads pay for themselves.
// Read-only; the admin's controls sit around it (admin-investors-content).
// No hooks, no server imports, so a server page can render it as it is.
import type { ReactNode } from "react";
import { dollars, longDate, paybackSentence, type InvestorFigures } from "@/lib/investorModel";
import type { InvestorReport } from "@/lib/investors";
import { PaybackChart } from "./payback-chart";
import s from "./investor-report.module.css";

const n = (v: number) => v.toLocaleString("en-US");
const pct = (v: number | null, suffix = "%") => (v === null ? "—" : `${v}${suffix}`);
const money = (v: number | null) => (v === null ? "—" : dollars(v));
const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function InvestorReportView({ report, shared = false, between }: { report: InvestorReport; shared?: boolean; between?: ReactNode }) {
  const f = report.figures;
  const a = report.settings;
  const be = f.breakEven;
  return (
    <div className={s.rep} data-investor-report>
      {/* The sentence first. */}
      <section className={s.lead} data-tone={be.withinHorizon ? "good" : f.spend.totalCents === 0 ? "none" : "late"}>
        <div className={s.leadLabel}>When the ads pay for themselves</div>
        <p className={s.leadText}>{paybackSentence(f)}</p>
        <div className={s.leadFacts}>
          <div><b>{be.daysFromToday !== null && be.daysFromToday > 0 ? `${be.daysFromToday} days` : be.daysFromToday !== null ? "Covered" : "—"}</b><span>{be.date ? `break-even · ${longDate(be.date)}` : "break-even not within the horizon"}</span></div>
          <div><b>{pct(f.unit.paybackMonths, " mo")}</b><span>spend to date ÷ realistic monthly revenue</span></div>
          <div><b>{pct(f.unit.returnToDatePct)}</b><span>revenue earned to date against the spend</span></div>
        </div>
      </section>

      {/* The numbers. */}
      <section className={s.kpis} aria-label="The figures">
        <Kpi label="Ad spend" value={dollars(f.spend.totalCents)} note={`since ${shortDate(f.since)} · ${dollars(f.spend.perDayRecentCents)}/day lately`} tone="ink" />
        <Kpi label="Visitors" value={f.visitors === null ? "—" : n(f.visitors)} note={f.visitors === null ? "analytics not reached" : `${money(f.unit.costPerVisitorCents)} each`} />
        <Kpi label="Signed up" value={n(f.signups)} note={`${f.unit.signupsPerDay}/day · ${pct(f.unit.visitorToSignupPct)} of visitors · ${money(f.unit.costPerSignupCents)} each`} />
        <Kpi label="On free trial" value={n(f.trials.count)} note={`${dollars(f.trials.maxMrrCents)}/mo if all pay`} tone="trial" />
        <Kpi label="Paying" value={n(f.paying.count)} note={`${dollars(f.paying.mrrCents)}/mo · ${dollars(f.paying.arrCents)} a year${report.payingUnpriced > 0 ? ` · ${report.payingUnpriced} without a list price` : ""}`} tone="good" />
        <Kpi label="Realistic MRR" value={dollars(f.projected.mrrRealisticCents)} note={`paying + ${a.realisticPct}% of trials`} tone="blue" />
      </section>

      {between}

      <section className={s.card}>
        <h2 className={s.h2}>Ad spend against revenue</h2>
        <PaybackChart curve={f.curve} today={f.today} breakEven={be.date} />
      </section>

      <div className={s.twoUp}>
        <section className={s.card}>
          <h2 className={s.h2}>Monthly revenue, three ways</h2>
          <table className={s.tbl}>
            <tbody>
              <tr><td>Paying now</td><td className={s.num}>{dollars(f.paying.mrrCents)}</td><td className={s.sub}>{f.paying.count} {f.paying.count === 1 ? "account" : "accounts"} at list price</td></tr>
              <tr><td>If every trial pays</td><td className={s.num}>{dollars(f.projected.mrrAllPayCents)}</td><td className={s.sub}>+ {dollars(f.trials.maxMrrCents)} from {f.trials.priced} priced {f.trials.priced === 1 ? "trial" : "trials"}</td></tr>
              <tr className={s.strong}><td>Realistic · {a.realisticPct}% of trials</td><td className={s.num}>{dollars(f.projected.mrrRealisticCents)}</td><td className={s.sub}>the share used for the break-even</td></tr>
              <tr><td>By behaviour</td><td className={s.num}>{dollars(f.projected.mrrByBehaviourCents)}</td><td className={s.sub}>{pct(f.trials.byBehaviourPct)} of trials, read from what each account has done</td></tr>
              {f.observed.pct !== null && <tr><td>Observed so far</td><td className={s.num}>{f.observed.pct}%</td><td className={s.sub}>{f.observed.paid} paid, {f.observed.lapsed} lapsed, of the trials that have finished</td></tr>}
            </tbody>
          </table>
        </section>
        <section className={s.card}>
          <h2 className={s.h2}>What a customer costs</h2>
          <table className={s.tbl}>
            <tbody>
              <tr><td>Per visitor</td><td className={s.num}>{money(f.unit.costPerVisitorCents)}</td><td className={s.sub}>{f.visitors === null ? "no visitor count" : `${n(f.visitors)} visitors`}</td></tr>
              <tr><td>Per signup</td><td className={s.num}>{money(f.unit.costPerSignupCents)}</td><td className={s.sub}>{n(f.signups)} signed up</td></tr>
              <tr className={s.strong}><td>Per paying customer</td><td className={s.num}>{money(f.unit.costPerPayingRealisticCents)}</td><td className={s.sub}>paying now plus {a.realisticPct}% of trials</td></tr>
              <tr><td>Pays back in</td><td className={s.num}>{pct(f.unit.paybackMonths, " months")}</td><td className={s.sub}>at {dollars(f.projected.mrrRealisticCents)} a month</td></tr>
              <tr><td>Lapsed</td><td className={s.num}>{n(f.lapsed)}</td><td className={s.sub}>trials over or canceled</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      {report.spend.byPlatform.length > 0 && (
        <section className={s.card}>
          <h2 className={s.h2}>Where the ad money went</h2>
          <table className={s.tbl}>
            <tbody>
              {report.spend.byPlatform.map((p) => (
                <tr key={p.platform}><td>{p.label}</td><td className={s.num}>{dollars(p.cents)}</td><td className={s.sub}>{p.days} {p.days === 1 ? "day" : "days"} · {dollars(Math.round(p.cents / Math.max(1, p.days)))}/day</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className={s.method}>
        <h2 className={s.h2}>How these are figured</h2>
        <ul>
          <li>Counting from {longDate(f.since)}, the day the first campaign went live — only what happened from that day on. Visitors are unique people on www.jobflex.app, bots and previews out.{report.before.paying > 0 ? ` ${report.before.paying} ${report.before.paying === 1 ? "account" : "accounts"} paying from before that day (${dollars(report.before.mrrCents)}/mo) ${report.before.paying === 1 ? "is" : "are"} not counted.` : ""}</li>
          <li>Ad spend is the budget booked per day{shared ? "" : " (typed in on this page; Meta's own figures once its API token is connected)"}. Days with no entry count as zero.</li>
          <li>A trial is worth its plan&apos;s monthly list price: a yearly plan as a twelfth, a custom plan by its pages. Discounts, taxes and churn are not modelled.</li>
          <li>The realistic share is {a.realisticPct}% of trials paying, set by the owner; &ldquo;by behaviour&rdquo; reads each account&apos;s activity instead and is shown beside it.</li>
          <li>The curve: each paying account earns a thirtieth of its monthly price a day from the day it started paying; a trial from the day it ends; signups still to come arrive at the recent pace ({f.unit.signupsPerDay}/day), at the average trial price ({dollars(f.trials.avgMonthlyCents)}/mo), and pay after a {a.trialDays}-day trial. Spend continues at {dollars(f.spend.perDayProjectedCents)}/day for {a.horizonDays} days.</li>
          <li>Read on {new Date(report.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. The figures move as accounts sign up and pay.</li>
        </ul>
      </section>
    </div>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "ink" | "trial" | "good" | "blue" }) {
  return (
    <div className={s.kpi} data-tone={tone}>
      <span className={s.kpiLabel}>{label}</span>
      <strong className={s.kpiValue}>{value}</strong>
      <small className={s.kpiNote}>{note}</small>
    </div>
  );
}

export type { InvestorFigures };

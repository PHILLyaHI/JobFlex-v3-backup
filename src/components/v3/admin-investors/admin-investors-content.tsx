"use client";

// ADMIN — INVESTORS, /admin/investors (2026-10-06). The report (shared with
// the public link and the PDF) with the owner's controls around it: the ad
// budget typed in by day, the realistic share and the pace assumptions, and
// the shared link.

import { useState } from "react";
import { Copy, ExternalLink, FileDown, Link as LinkIcon, RefreshCw, Trash2 } from "lucide-react";
import { addAdSpendAction, deleteAdSpendAction, investorLinkAction, saveInvestorSettingsAction } from "@/actions/investors";
import type { InvestorReport } from "@/lib/investors";
import { dollars, PLATFORMS, PLATFORM_LABEL, type SpendPlatform } from "@/lib/investorModel";
import { InvestorReportView } from "./investor-report";
import shared from "@/components/v3/admin-overview/admin-shared.module.css";
import s from "./admin-investors.module.css";

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function AdminInvestorsContent({ initial, origin }: { initial: InvestorReport; origin: string }) {
  const [report, setReport] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const f = report.figures;
  const a = report.settings;

  // The budget form.
  const [from, setFrom] = useState(todayLocal());
  const [to, setTo] = useState(todayLocal());
  const [perDay, setPerDay] = useState(String(a.spendPerDayCents ? a.spendPerDayCents / 100 : f.spend.perDayRecentCents / 100 || ""));
  const [platform, setPlatform] = useState<SpendPlatform>("meta");
  // The assumptions.
  const [pct, setPct] = useState(a.realisticPct);
  const [projPerDay, setProjPerDay] = useState(a.spendPerDayCents === null ? "" : String(a.spendPerDayCents / 100));
  const [horizon, setHorizon] = useState(a.horizonDays);
  const [trialDays, setTrialDays] = useState(a.trialDays);

  const run = async (call: () => Promise<{ ok: true; report: InvestorReport } | { ok: false; error: string }>) => {
    setPending(true);
    setError("");
    try {
      const res = await call();
      if (res.ok) setReport(res.report);
      else setError(res.error);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  };
  const link = a.linkToken ? `${origin}/investors/${a.linkToken}` : null;
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy did not work here — select the link and copy it.");
    }
  };
  const assumptionsChanged = pct !== a.realisticPct || horizon !== a.horizonDays || trialDays !== a.trialDays || (projPerDay.trim() === "" ? a.spendPerDayCents !== null : Math.round(Number(projPerDay) * 100) !== a.spendPerDayCents);

  const controls = (
    <div className={s.controls}>
      {/* The ad budget. */}
      <section className={s.panel} aria-label="Ad spend">
        <h2 className={s.panelTitle}>Ad spend, by day</h2>
        <p className={s.hint}>Type what the ads cost per day. Meta&apos;s own figures take over once its API token is connected; what you type stays beside them.</p>
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => addAdSpendAction({ from, to, perDayDollars: Number(perDay), platform }));
          }}
        >
          <label className={s.field}><span>From</span><input className={s.in} type="date" value={from} max={todayLocal()} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} required /></label>
          <label className={s.field}><span>To</span><input className={s.in} type="date" value={to} min={from} max={todayLocal()} onChange={(e) => setTo(e.target.value)} required /></label>
          <label className={s.field}><span>Per day, $</span><input className={s.in} type="number" inputMode="decimal" min={0} step="0.01" value={perDay} onChange={(e) => setPerDay(e.target.value)} required /></label>
          <label className={s.field}><span>Platform</span><select className={s.in} value={platform} onChange={(e) => setPlatform(e.target.value as SpendPlatform)}>{PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select></label>
          <button type="submit" className="btn btn-primary" disabled={pending}>Book spend</button>
        </form>
        {report.spend.entries.length > 0 ? (
          <details className={s.entries}>
            <summary>{report.spend.entries.length} {report.spend.entries.length === 1 ? "day" : "days"} booked · {dollars(f.spend.totalCents)} since the launch</summary>
            <div className={s.entryList}>
              {report.spend.entries.slice(0, 120).map((e) => (
                <div key={e.id} className={s.entry}>
                  <span className={s.entryDate}>{e.date}</span>
                  <span>{PLATFORM_LABEL[e.platform]}{e.source === "meta" ? " · from Meta" : ""}</span>
                  <b>{dollars(e.cents)}</b>
                  <button type="button" className={s.iconBtn} aria-label={`Remove ${e.date} ${PLATFORM_LABEL[e.platform]}`} disabled={pending} onClick={() => void run(() => deleteAdSpendAction({ id: e.id }))}><Trash2 size={13} aria-hidden="true" /></button>
                </div>
              ))}
              {report.spend.entries.length > 120 && <p className={s.hint}>The newest 120 are listed.</p>}
            </div>
          </details>
        ) : (
          <p className={s.hint}>Nothing booked yet — every figure below treats the spend as zero.</p>
        )}
      </section>

      {/* The assumptions. */}
      <section className={s.panel} aria-label="Assumptions">
        <h2 className={s.panelTitle}>Assumptions</h2>
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => saveInvestorSettingsAction({ realisticPct: pct, spendPerDayDollars: projPerDay.trim() === "" ? null : Number(projPerDay), horizonDays: horizon, trialDays }));
          }}
        >
          <label className={`${s.field} ${s.wide}`}>
            <span>Realistic share of trials that pay · <b>{pct}%</b></span>
            <input className={s.range} type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label="Realistic share of trials that pay, percent" />
            <small>By behaviour the model reads {f.trials.byBehaviourPct === null ? "—" : `${f.trials.byBehaviourPct}%`}{f.observed.pct !== null ? `; observed so far ${f.observed.pct}%` : ""}.</small>
          </label>
          <label className={s.field}><span>Projected spend per day, $</span><input className={s.in} type="number" inputMode="decimal" min={0} step="1" placeholder={`${f.spend.perDayRecentCents / 100} (recent)`} value={projPerDay} onChange={(e) => setProjPerDay(e.target.value)} /></label>
          <label className={s.field}><span>Horizon, days</span><input className={s.in} type="number" min={30} max={730} step={30} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} /></label>
          <label className={s.field}><span>Trial length, days</span><input className={s.in} type="number" min={1} max={90} value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} /></label>
          <button type="submit" className="btn btn-primary" disabled={pending || !assumptionsChanged}>Apply</button>
        </form>
      </section>

      {/* The shared link. */}
      <section className={s.panel} aria-label="Shared link">
        <h2 className={s.panelTitle}>Share with investors</h2>
        <p className={s.hint}>A live page with these figures and no admin controls, and the same as a PDF. Anyone with the link can open it; make a new link to cut off the old one.</p>
        {link ? (
          <div className={s.linkRow} data-link-enabled={a.linkEnabled}>
            <code className={s.link}>{link}</code>
            <button type="button" className="btn btn-ghost" onClick={() => void copy()} disabled={!a.linkEnabled}><Copy size={14} aria-hidden="true" />{copied ? "Copied" : "Copy"}</button>
            <a className="btn btn-ghost" href={link} target="_blank" rel="noreferrer" aria-disabled={!a.linkEnabled}><ExternalLink size={14} aria-hidden="true" />Open</a>
          </div>
        ) : null}
        <div className={s.linkActs}>
          {link && <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => void run(() => investorLinkAction({ enabled: !a.linkEnabled }))}>{a.linkEnabled ? "Switch the link off" : "Switch the link on"}</button>}
          <button type="button" className={link ? "btn btn-ghost" : "btn btn-primary"} disabled={pending} onClick={() => void run(() => investorLinkAction({ rotate: true }))}><LinkIcon size={14} aria-hidden="true" />{link ? "Make a new link" : "Make the link"}</button>
          <button type="button" className={s.iconBtn} aria-label="Read the figures again" disabled={pending} onClick={() => void run(async () => ({ ok: true as const, report: await (await import("@/actions/investors")).getInvestorReport() }))}><RefreshCw size={14} className={pending ? s.spin : ""} aria-hidden="true" /></button>
        </div>
      </section>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Platform · Investors</div>
          <h1 className="page-title">Investors</h1>
        </div>
        <div className={shared.headSide}>
          {link && a.linkEnabled ? <span className="chip ok">Link live</span> : <span className={`chip ${shared.chipMuted}`}>Link off</span>}
          {link && a.linkEnabled && (
            <a className="btn btn-ghost" href={`/api/investors/${a.linkToken}/pdf`} target="_blank" rel="noreferrer">
              <FileDown size={15} aria-hidden="true" />
              PDF
            </a>
          )}
        </div>
      </div>

      {error && <p className={`${shared.note} ${s.err}`} role="alert">{error}</p>}

      <InvestorReportView report={report} between={controls} />
    </>
  );
}

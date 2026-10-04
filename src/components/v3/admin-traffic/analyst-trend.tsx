"use client";
/**
 * TREND, LAST 14 DAYS (2026-10-04), under the analyst: one saved reading a
 * day (the daily digest, lib/traffic-digest) — each finding's tone and sample
 * by day, what appeared or went since the reading before, the funnel by day,
 * and the history as JSON.
 */
import { useEffect, useState } from "react";
import { Braces, RefreshCw } from "lucide-react";
import { getAnalystHistory, getAnalystHistoryJson, type AnalystHistory } from "@/actions/trafficHistory";
import { pct } from "@/lib/traffic-analyst";
import { TONE_WORD, downloadText } from "@/lib/traffic-export";
import type { TrendChange } from "@/lib/traffic-history";
import { toast } from "@/components/ui/toast-store";
import s from "./traffic.module.css";
import t from "./analyst-trend.module.css";

const short = (day: string) => { const [, m, d] = day.split("-"); return `${Number(m)}/${Number(d)}`; };
const FUNNEL_KEYS = ["landed", "pressed", "form", "s2", "s3", "attempted", "done"] as const;
const FUNNEL_HEAD = ["Landed", "Pressed", "Form", "Step 2", "Step 3", "Started", "Signed up"];

function Chips({ label, items }: { label: string; items: TrendChange[] }) {
  if (!items.length) return null;
  return <div className={t.changeGroup}><span className={t.changeLabel}>{label}</span><ul>{items.map((c) => <li key={c.id} data-tone={c.tone}><b>{TONE_WORD[c.tone]}</b> {c.title}</li>)}</ul></div>;
}

export function AnalystTrend() {
  const [data, setData] = useState<AnalystHistory | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const load = async () => {
    setPending(true);
    try { setData(await getAnalystHistory()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "The history could not be read."); }
    finally { setPending(false); }
  };
  useEffect(() => { const id = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(id); }, []);

  async function download() {
    try {
      const h = await getAnalystHistoryJson();
      downloadText(`jobflex-analyst-history-${h.days[0]}_${h.days.at(-1)}.json`, JSON.stringify(h, null, 2), "application/json");
      toast.success("History downloaded", `${h.snapshots.length} saved ${h.snapshots.length === 1 ? "reading" : "readings"}.`);
    } catch (err) { toast.error("Could not export", err instanceof Error ? err.message : undefined); }
  }

  const trend = data?.trend;
  const readings = trend?.readings ?? [];
  const byDay = new Map(readings.map((r) => [r.day, r]));
  const c = trend?.changes ?? null;
  // Columns from the first saved reading on: gaps after it stay visible, the
  // empty fortnight before it does not push the readings off a phone's screen.
  const shownDays = trend && readings.length ? trend.days.slice(Math.max(0, trend.days.indexOf(readings[0].day))) : [];
  return (
    <section className={`${s.card} ${s.analyst}`} aria-label="Analyst trend" aria-busy={pending} data-testid="analyst-trend">
      <div className={s.cardHead}>
        <div>
          <h2>Trend, last 14 days</h2>
          <span className={s.micro}>One reading a day, saved at 8:00 AM Los Angeles{trend ? ` · ${readings.length} of ${trend.days.length} days saved` : ""}</span>
        </div>
        <div className={s.headerActions}>
          <button type="button" className={s.button} onClick={() => void download()} disabled={!readings.length}><Braces size={15} aria-hidden="true"/>Download history JSON</button>
          <button type="button" className={s.iconButton} aria-label="Read the history again" title="Read the history again" onClick={() => void load()} disabled={pending}><RefreshCw size={16} className={pending ? s.spin : ""}/></button>
        </div>
      </div>

      {!data && !error && <div className={s.analystEmpty}>Reading the history…</div>}
      {error && <div className={s.notice} role="status"><strong>{error}</strong></div>}
      {data && !readings.length && <div className={s.analystEmpty}>No reading saved yet. The first is saved at 8:00 AM Los Angeles, and the trend grows a day at a time.</div>}

      {readings.length > 0 && trend && <>
        <div className={t.changes} data-testid="trend-changes">
          {c ? <>
            <span className={t.changesHead}>{short(c.day)} against {short(c.against)}</span>
            {!c.appeared.length && !c.gone.length && !c.toneChanged.length && <span className={t.changeLabel}>The same findings as the reading before.</span>}
            <Chips label="Appeared" items={c.appeared}/>
            <Chips label="Gone" items={c.gone}/>
            {c.toneChanged.length > 0 && <div className={t.changeGroup}><span className={t.changeLabel}>Changed</span><ul>{c.toneChanged.map((x) => <li key={x.id} data-tone={x.tone}><b>{TONE_WORD[x.from]} → {TONE_WORD[x.tone]}</b> {x.title}</li>)}</ul></div>}
          </> : <span className={t.changeLabel}>One reading so far: what appeared and what went shows from the second.</span>}
        </div>

        <div className={s.tableScroll}>
          <table className={`${s.table} ${t.grid}`}>
            <caption className={s.analystCaption}>Findings by day · tone and sample</caption>
            <thead><tr><th>Finding</th>{shownDays.map((d) => <th key={d} data-empty={!byDay.has(d) || undefined}>{short(d)}</th>)}</tr></thead>
            <tbody>{trend.rows.map((row) => <tr key={row.id}>
              <td>{row.title}<small>{row.id}</small></td>
              {shownDays.map((d) => { const cell = row.cells[d]; return <td key={d} className={t.cell} data-tone={cell?.tone} title={cell ? `${cell.title} · ${cell.n} visits · ${cell.confidence} confidence` : byDay.has(d) ? "Not found that day" : "No reading that day"}>{cell ? <><b>{TONE_WORD[cell.tone]}</b><span>{cell.n}</span></> : byDay.has(d) ? "–" : ""}</td>; })}
            </tr>)}</tbody>
          </table>
        </div>

        <div className={s.tableScroll}>
          <table className={`${s.table} ${t.grid}`}>
            <caption className={s.analystCaption}>The funnel by day</caption>
            <thead><tr><th>Day</th><th>Window</th>{FUNNEL_HEAD.map((h) => <th key={h}>{h}</th>)}<th>Emailed</th></tr></thead>
            <tbody>{[...readings].reverse().map((r) => <tr key={r.day}>
              <td>{short(r.day)}</td><td><small>{r.period}{r.basis === "all" ? " · all visits" : ""}</small></td>
              {FUNNEL_KEYS.map((k) => { const st = r.funnel.find((x) => x.key === k); return <td key={k}><b>{st?.n ?? "—"}</b>{k !== "landed" && st ? <small>{pct(st.pct)}</small> : null}</td>; })}
              <td>{r.emailed ? "yes" : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className={s.footnote}>Each day keeps the analyst&apos;s reading as it stood at 8:00 AM: its window, its findings and its funnel. A finding is followed by its id, so a reworded title stays one row. &ldquo;–&rdquo; is a day with a reading where the finding did not appear; a blank column is a day with no reading.</p>
      </>}
    </section>
  );
}

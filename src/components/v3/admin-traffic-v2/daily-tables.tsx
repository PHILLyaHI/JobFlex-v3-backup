"use client";
// THE DAYS, TWO WAYS (2026-10-01).
//
// People. A visitor is a PostHog person, and in Facebook's and Instagram's
// in-app browsers each ad tap can arrive with a fresh cookie — so there a
// "visitor" is a click. Beside it: "people (est.)", unique by address and
// browser ($ip + $raw_user_agent) within the day, and the in-app share.
//
// Ads. Our visitors who carried a Meta tag — utm_source fb / ig / an, and
// fbclid — day by day, beside the link clicks Ads Manager reports. The Meta
// Marketing API is not connected (no token with ads_read in the environment),
// so the clicks are typed in here; they are kept in this browser only.
import { memo, useEffect, useState } from "react";
import type { TrafficPoint } from "@/lib/traffic-contract";
import s from "./traffic.module.css";

const n = (v: number) => v.toLocaleString("en-US");
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "--");
const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" });
const CLICKS_KEY = "jf.traffic.adsManagerClicks.v1";

export const DailyPeople = memo(function DailyPeople({ points }: { points: TrafficPoint[] }) {
  const sum = (k: keyof TrafficPoint) => points.reduce((a, p) => a + (p[k] as number), 0);
  return <section className={s.card} aria-label="Visitors and people by day">
    <div className={s.cardHead}><div><h2>Visitors and people, by day</h2><span className={s.micro}>In Facebook / Instagram in-app browsers a visitor is a click: each tap can bring a fresh cookie. People (est.) counts address + browser instead, unique per day.</span></div><span className={s.stamp}>Estimate</span></div>
    <div className={s.tableScroll}><table className={s.table}>
      <thead><tr><th>Day</th><th>Visitors</th><th>People (est.)</th><th>In-app visitors (clicks)</th><th>In-app people (est.)</th><th>In-app share</th></tr></thead>
      <tbody>{points.map((p) => <tr key={p.date}>
        <td>{day(p.date)}</td><td><b>{n(p.visitors)}</b></td><td><b>{n(p.people)}</b></td><td>{n(p.inAppVisitors)}</td><td>{n(p.inAppPeople)}</td><td>{pct(p.inAppVisitors, p.visitors)}</td>
      </tr>)}</tbody>
      {points.length > 1 && <tfoot><tr><td>Days summed</td><td><b>{n(sum("visitors"))}</b></td><td><b>{n(sum("people"))}</b></td><td>{n(sum("inAppVisitors"))}</td><td>{n(sum("inAppPeople"))}</td><td>{pct(sum("inAppVisitors"), sum("visitors"))}</td></tr></tfoot>}
    </table></div>
    <p className={s.footnote}>Daily figures add up a person once per day they came back; the range&apos;s own unique count is the card above.</p>
  </section>;
});

export const AdsReconciliation = memo(function AdsReconciliation({ points }: { points: TrafficPoint[] }) {
  const [clicks, setClicks] = useState<Record<string, string>>({});
  useEffect(() => {
    const id = requestAnimationFrame(() => { try { setClicks(JSON.parse(localStorage.getItem(CLICKS_KEY) || "{}")); } catch { /* blocked storage: start empty */ } });
    return () => cancelAnimationFrame(id);
  }, []);
  const put = (date: string, value: string) => setClicks((cur) => {
    const next = { ...cur, [date]: value.replace(/[^\d]/g, "").slice(0, 7) };
    try { localStorage.setItem(CLICKS_KEY, JSON.stringify(next)); } catch { /* kept for this visit only */ }
    return next;
  });
  return <section className={s.card} aria-label="Ads reconciliation">
    <div className={s.cardHead}><div><h2>Our ad visitors against Ads Manager</h2><span className={s.micro}>Visitors who carried utm_source fb / ig / an or fbclid, by day. Type the link clicks from Ads Manager for the same day (Los Angeles time); they stay in this browser.</span></div><span className={s.stamp}>Manual entry</span></div>
    <div className={s.tableScroll}><table className={s.table}>
      <thead><tr><th>Day</th><th>utm fb</th><th>utm ig</th><th>utm an</th><th>fbclid</th><th>Ours (any tag)</th><th>Ads Manager clicks</th><th>Difference</th></tr></thead>
      <tbody>{points.map((p) => {
        const theirs = Number(clicks[p.date] || 0);
        const diff = theirs > 0 ? Math.round(((p.adsAny - theirs) / theirs) * 100) : null;
        return <tr key={p.date}>
          <td>{day(p.date)}</td><td>{n(p.adsFb)}</td><td>{n(p.adsIg)}</td><td>{n(p.adsAn)}</td><td>{n(p.adsFbclid)}</td><td><b>{n(p.adsAny)}</b></td>
          <td><input className={s.clicksInput} inputMode="numeric" aria-label={`Ads Manager link clicks on ${p.date}`} placeholder="—" value={clicks[p.date] ?? ""} onChange={(e) => put(p.date, e.target.value)}/></td>
          <td data-sign={diff === null ? undefined : diff < 0 ? "down" : "up"}>{diff === null ? "--" : `${diff > 0 ? "+" : ""}${diff}%`}</td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className={s.footnote}>A visitor can carry more than one tag; &ldquo;any tag&rdquo; counts them once. Ads Manager counts link clicks, we count browsers that loaded a page: blocked analytics, a tap that never finished loading and the in-app browser&apos;s fresh cookies all move the two apart. The Meta Marketing API is not connected; with a token that has ads_read the clicks could be read instead of typed.</p>
  </section>;
});

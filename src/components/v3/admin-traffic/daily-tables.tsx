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
// so the clicks are typed in here; since 2026-10-04 they are kept for every
// admin (SyncState adsclicks:<day>).
import { memo, useEffect, useRef, useState } from "react";
import { getAdsManagerClicks, saveAdsManagerClicks } from "@/actions/trafficClicks";
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

/** This browser's clicks from before they were kept for every admin: the
 *  days the server does not have yet, to be sent up once and then dropped. */
function legacyClicks(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(CLICKS_KEY) || "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).map(([d, v]) => [d, Number(v)] as const).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isInteger(v) && v > 0));
  } catch { return {}; }
}
const SAVE_AFTER_MS = 700;
type SaveState = "loading" | "saved" | "saving" | "failed";

export const AdsReconciliation = memo(function AdsReconciliation({ points }: { points: TrafficPoint[] }) {
  // KEPT FOR EVERY ADMIN (2026-10-04): the clicks live in SyncState
  // (adsclicks:<day>, actions/trafficClicks); what this browser typed before
  // is sent up once for the days the server lacks, then dropped here.
  const [clicks, setClicks] = useState<Record<string, string>>({});
  const [state, setState] = useState<SaveState>("loading");
  const timers = useRef(new Map<string, number>());
  const dates = points.map((p) => p.date).join(",");
  useEffect(() => {
    let live = true;
    const days = dates ? dates.split(",") : [];
    (async () => {
      try {
        const kept = await getAdsManagerClicks({ days });
        const old = legacyClicks();
        const missing = Object.fromEntries(Object.entries(old).filter(([d]) => !(d in kept)));
        let uploaded = true;
        if (Object.keys(missing).length) {
          const r = await saveAdsManagerClicks({ entries: missing });
          uploaded = r.ok;
          if (r.ok) Object.assign(kept, Object.fromEntries(Object.entries(missing).filter(([d]) => days.includes(d))));
        }
        // Dropped here only once the server holds them.
        if (uploaded && Object.keys(old).length) { try { localStorage.removeItem(CLICKS_KEY); } catch { /* nothing kept here to drop */ } }
        if (live) { setClicks(Object.fromEntries(Object.entries(kept).map(([d, v]) => [d, String(v)]))); setState("saved"); }
      } catch { if (live) setState("failed"); }
    })();
    return () => { live = false; };
  }, [dates]);
  useEffect(() => { const t = timers.current; return () => { for (const id of t.values()) window.clearTimeout(id); }; }, []);
  const save = (date: string, value: string) => {
    setState("saving");
    void saveAdsManagerClicks({ entries: { [date]: value === "" ? null : Number(value) } })
      .then((r) => setState(r.ok ? "saved" : "failed"))
      .catch(() => setState("failed"));
  };
  const put = (date: string, value: string) => {
    const clean = value.replace(/[^\d]/g, "").slice(0, 7);
    setClicks((cur) => ({ ...cur, [date]: clean }));
    window.clearTimeout(timers.current.get(date));
    timers.current.set(date, window.setTimeout(() => { timers.current.delete(date); save(date, clean); }, SAVE_AFTER_MS));
  };
  const stamp = state === "loading" ? "Loading…" : state === "saving" ? "Saving…" : state === "failed" ? "Not saved" : "Saved for every admin";
  return <section className={s.card} aria-label="Ads reconciliation">
    <div className={s.cardHead}><div><h2>Our ad visitors against Ads Manager</h2><span className={s.micro}>Visitors who carried utm_source fb / ig / an or fbclid, by day. Type the link clicks from Ads Manager for the same day (Los Angeles time); every admin sees them, and the exports carry them.</span></div><span className={s.stamp} role="status" data-state={state}>{stamp}</span></div>
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

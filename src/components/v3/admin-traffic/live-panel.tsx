"use client";
// STATS + VISITOR SOURCES (2026-09-28 "Live now", reworked 2026-10-01): four
// live figures, then one card — the platforms that brought people over a
// range the owner picks (5 minutes to all time), and the map of where they
// are. Polls while the tab is visible; the live window and the long ranges
// are each one shared, cached PostHog query (lib/traffic-server).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Activity, Info, RefreshCw } from "lucide-react";
import { getLiveTraffic } from "@/actions/trafficDashboard";
import { LIVE_RANGES, RANGE_MAP_CAP, type LiveRange, type LiveReport } from "@/lib/traffic-live";
import { LivePlatforms } from "./live-platforms";
import { RangeSelect } from "./range-select";
import { setClockPeriod } from "./ticker";
import { sameReport } from "./live-diff";
import s from "./traffic.module.css";

/* The map is the heaviest part of the page (the world's shapes, a pin per
   visitor) and the last thing the eye reaches: it loads after the rest, in
   its own chunk (2026-10-01). */
const LiveMap = dynamic(() => import("./live-map").then((m) => m.LiveMap), { ssr: false, loading: () => <div className={s.mapLoading}>Loading the map…</div> });

/** Live mode (2026-09-30): the owner watches this while an ad runs, so the
 *  panel refreshes every 15 s instead of 45. It costs PostHog queries, so it
 *  is a switch — remembered per browser — and it only ticks while this tab is
 *  actually in front. The heavy site-wide totals are NOT on this clock; the
 *  server caches those for minutes (lib/traffic-server fetchLiveTotals). */
const LIVE_POLL_MS = 15_000;
const POLL_MS = 45_000;
const LIVE_MODE_KEY = "jf.traffic.liveMode";
const fmt = (n: number) => n.toLocaleString("en-US");

export function LivePanel({ initial, timezone, fullHistory = false }: { initial: LiveReport; timezone: string; fullHistory?: boolean }) {
  const [report, setReport] = useState(initial);
  const [includeDev, setIncludeDev] = useState(false);
  const [adsOnly, setAdsOnly] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  /** The Visitor sources range: the platforms and the map cover it. */
  const [range, setRange] = useState<LiveRange>(initial.range ?? "30m");
  /** Live mode: 15-second refresh. On unless this browser turned it off. */
  const [liveMode, setLiveMode] = useState(true);
  /** The visitor opened on the map. */
  const [selected, setSelected] = useState<string | null>(null);
  /** A platform card pressed: the map keeps only its people. */
  const [platform, setPlatform] = useState<string | null>(null);
  const request = useRef(0);
  // Stable: it takes what changes as arguments, so the poll below is armed
  // once per setting, not once per tick of the clock.
  const load = useCallback(async (dev: boolean, span: LiveRange, fast = false) => {
    const id = ++request.current;
    setPending(true);
    try {
      const next = await getLiveTraffic({ includeDevelopment: dev, timezone, fast, range: span, fullHistory });
      // Only what changed is handed down: an answer with the same visitors
      // keeps the same objects, so the map and the cards skip their render.
      if (id === request.current) { setReport((prev) => sameReport(prev, next)); setError(""); }
    } catch (err) {
      if (id === request.current) setError(err instanceof Error ? err.message : "Could not refresh the live view.");
    } finally {
      if (id === request.current) setPending(false);
    }
  }, [timezone, fullHistory]);
  // "Show full history" turned on or off: everything is counted again at once.
  const firstWindow = useRef(true);
  useEffect(() => {
    if (firstWindow.current) { firstWindow.current = false; return; }
    void load(includeDev, range, liveMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the window switch reloads here
  }, [fullHistory]);

  // The switch is remembered per browser. Read after mount so the server and
  // the first client render agree.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LIVE_MODE_KEY);
      if (saved === "off") setLiveMode(false);
    } catch { /* private browsing: live mode simply stays on */ }
  }, []);
  const toggleLiveMode = (on: boolean) => {
    setLiveMode(on);
    try { window.localStorage.setItem(LIVE_MODE_KEY, on ? "on" : "off"); } catch { /* not worth a word to the user */ }
    if (on) void load(includeDev, range, true);
  };
  const changeRange = (next: LiveRange) => { setRange(next); setSelected(null); void load(includeDev, next, liveMode); };
  // Poll while the tab is in front; a tab brought back refreshes at once.
  useEffect(() => {
    const every = liveMode ? LIVE_POLL_MS : POLL_MS;
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void load(includeDev, range, liveMode); }, every);
    // The shared clock (./ticker) moves the "n s ago" labels on the map card.
    setClockPeriod(liveMode ? 1_000 : 10_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(includeDev, range, liveMode); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); };
  }, [includeDev, liveMode, range, load]);

  const c = report.counts;
  // Today against the same hour yesterday — the only honest comparison while
  // the day is still running. Null when yesterday had nobody to divide by.
  const t = report.totals;
  const trend = t && t.yesterdaySoFar > 0 ? Math.round(((t.today - t.yesterdaySoFar) / t.yesterdaySoFar) * 100) : null;
  // A day two hours old explains a small number better than any comparison.
  const youngDay = report.dayAgeMinutes < 120;
  const dayAge = report.dayAgeMinutes < 60 ? `${Math.max(1, report.dayAgeMinutes)} min` : `${Math.floor(report.dayAgeMinutes / 60)} h`;
  const onMap = useMemo(() => report.visitors.filter((v) => (!adsOnly || v.fromAd || v.stage === "signed-up") && (!platform || v.platform === platform)), [report.visitors, adsOnly, platform]);
  // The owner's names for ad and campaign ids, for the map card.
  const adNames = useMemo(() => report.adNames ?? {}, [report.adNames]);
  const live = report.status === "ok";
  const total = report.rangeTotal ?? report.visitors.length;

  return <section className={s.section} id="live" aria-labelledby="traffic-live-title" data-state={report.status} aria-busy={pending}>
    <header className={s.sectionHead}>
      <div className={s.sectionTitle}>
        <span className={s.sectionIcon} data-live={live && c.onSite > 0} aria-hidden="true"><Activity size={22}/></span>
        <h2 id="traffic-live-title">Stats</h2>
      </div>
      <div className={s.sectionTools}>
        <label className={s.chip} title={`Refresh every ${LIVE_POLL_MS / 1000} seconds instead of ${POLL_MS / 1000}`}><input type="checkbox" checked={liveMode} onChange={(e) => toggleLiveMode(e.target.checked)}/>Live · {LIVE_POLL_MS / 1000} s</label>
        <label className={s.chip}><input type="checkbox" checked={adsOnly} onChange={(e) => setAdsOnly(e.target.checked)}/>Ads only</label>
        <label className={s.chip}><input type="checkbox" checked={includeDev} onChange={(e) => { setIncludeDev(e.target.checked); void load(e.target.checked, range, liveMode); }}/>Localhost</label>
        <button type="button" className={s.iconButton} aria-label="Refresh stats" onClick={() => void load(includeDev, range, liveMode)} disabled={pending}><RefreshCw size={16} className={pending ? s.spin : ""}/></button>
      </div>
    </header>

    <div className={s.card}>
      <div className={s.kpis} data-cols="4">
        <div className={s.kpi} data-lead="true">
          <span>On the site now</span>
          <strong>{fmt(c.onSite)}</strong>
          <small>{c.fromAds > 0 ? `${fmt(c.fromAds)} from ads` : "none from ads"}{c.signingUp > 0 ? ` · ${fmt(c.signingUp)} signing up` : ""}</small>
        </div>
        <div className={s.kpi}>
          <span>Visitors today</span>
          <strong>{t ? fmt(t.today) : "—"}</strong>
          <small data-trend={trend === null ? "flat" : trend > 0 ? "up" : trend < 0 ? "down" : "flat"}>
            {!t ? "totals unavailable"
              : youngDay ? `the day is ${dayAge} old`
              : trend === null ? "nothing yet at this hour yesterday"
              : trend === 0 ? "level with this time yesterday"
              : `${trend > 0 ? "+" : "−"}${Math.abs(trend)}% vs this time yesterday`}
          </small>
        </div>
        <div className={s.kpi} data-tone="ok">
          <span>Signed up today</span>
          <strong>{fmt(report.today.signups)}</strong>
          <small>{report.today.signups > 0 ? `${fmt(report.today.fromAds)} from ads` : "none yet"}</small>
        </div>
        <div className={s.kpi}>
          <span>All-time visitors</span>
          <strong>{t ? fmt(t.allTime) : "—"}</strong>
          <small>{t ? `${fmt(t.last7Days)} this week · ${fmt(t.yesterday)} yesterday` : "totals unavailable"}</small>
        </div>
      </div>
    </div>

    {(error || report.message) && <div className={s.notice} role="status"><Info size={16}/><div><strong>{error || report.message}</strong></div></div>}

    {live && <div className={s.card}>
      <div className={s.cardHead}>
        <h3 className={s.bigTitle}>Visitor sources <b>{fmt(total)}</b></h3>
        <div className={s.cardTools}>
          <RangeSelect label="Range" value={range} options={LIVE_RANGES} onChange={changeRange} disabled={pending && range !== report.range}/>
        </div>
      </div>
      <LivePlatforms platforms={report.platforms} selected={platform} onSelect={setPlatform}/>
      <div className={s.liveMapCol}>
        {total > report.visitors.length && <p className={s.cardMeta} style={{ margin: "0 0 12px" }}>The map shows the latest {fmt(RANGE_MAP_CAP)} of {fmt(total)}.</p>}
        <LiveMap visitors={onMap} selected={selected} onSelect={setSelected} timezone={timezone} adNames={adNames}/>
      </div>
    </div>}
  </section>;
}

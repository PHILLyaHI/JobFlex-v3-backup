"use client";
// LIVE NOW (2026-09-28): the people on the site this minute — where each one
// came from (an ad, tagged or not), what they are looking at, how far they
// got — and the ones who signed up, in their own colour, named after the
// account the database just made. Polls while the tab is visible; one shared
// PostHog query behind it (lib/traffic-server fetchLiveEvents).
import { useCallback, useEffect, useRef, useState } from "react";
import { Info, KeyRound, Megaphone, MousePointerClick, RefreshCw } from "lucide-react";
import { getLiveTraffic } from "@/actions/trafficDashboard";
import type { LiveReport, LiveStage, LiveVisitor } from "@/lib/traffic-live";
import { LiveMap } from "./live-map";
import { LivePlatforms } from "./live-platforms";
import s from "./traffic.module.css";

/** Live mode (2026-09-30): the owner watches this while an ad runs, so the
 *  panel refreshes every 15 s instead of 45. It costs PostHog queries, so it
 *  is a switch — remembered per browser — and it only ticks while this tab is
 *  actually in front. The heavy site-wide totals are NOT on this clock; the
 *  server caches those for minutes (lib/traffic-server fetchLiveTotals). */
const LIVE_POLL_MS = 15_000;
const POLL_MS = 45_000;
const LIVE_MODE_KEY = "jf.traffic.liveMode";
const fmt = (n: number) => n.toLocaleString("en-US");
/** The window's stages in travel order; registering absorbs checkout, the
 *  same fold the map's pins use so a chip and a pin are the same colour. */
const FUNNEL: Array<[LiveStage, string]> = [
  ["browsing", "looking around"],
  ["signing-in", "signing in"],
  ["registering", "signing up"],
  ["signed-up", "signed up"],
  ["member", "members"],
];
const STAGE: Record<LiveStage, string> = { browsing: "Looking around", "signing-in": "Signing in", registering: "On the sign-up form", checkout: "At checkout", "signed-up": "Signed up", member: "In the app · member" };

function ago(iso: string, now: number): string {
  const sec = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (sec < 45) return `${sec} s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}
function clock(iso: string, timezone: string): string {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso)); } catch { return ""; }
}

export function LivePanel({ initial, timezone }: { initial: LiveReport; timezone: string }) {
  const [report, setReport] = useState(initial);
  const [includeDev, setIncludeDev] = useState(false);
  const [adsOnly, setAdsOnly] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  /** Who the map shows: the last 5 minutes (on the site now) or the whole window. */
  const [span, setSpan] = useState<5 | 30>(30);
  /** Live mode: 15-second refresh. On unless this browser turned it off. */
  const [liveMode, setLiveMode] = useState(true);
  /** The visitor opened on the map — from a pin, or from a row of the list. */
  const [selected, setSelected] = useState<string | null>(null);
  /** A platform card pressed: the map and the list keep only its people. */
  const [platform, setPlatform] = useState<string | null>(null);
  const request = useRef(0);
  // Stable: it takes the one thing that changes as an argument, so the poll
  // below is armed once per setting, not once per tick of the clock.
  const load = useCallback(async (dev: boolean, fast = false) => {
    const id = ++request.current;
    setPending(true);
    try {
      const next = await getLiveTraffic({ includeDevelopment: dev, timezone, fast });
      if (id === request.current) { setReport(next); setError(""); setNow(Date.now()); }
    } catch (err) {
      if (id === request.current) setError(err instanceof Error ? err.message : "Could not refresh the live view.");
    } finally {
      if (id === request.current) setPending(false);
    }
  }, [timezone]);

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
    if (on) void load(includeDev, true);
  };
  // Poll while the tab is in front; a tab brought back refreshes at once.
  // The "n s ago" figures tick on their own, ten seconds at a time.
  useEffect(() => {
    const every = liveMode ? LIVE_POLL_MS : POLL_MS;
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void load(includeDev, liveMode); }, every);
    // In live mode the "n s ago" figures have to keep up with the poll.
    const tick = window.setInterval(() => setNow(Date.now()), liveMode ? 1_000 : 10_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(includeDev, liveMode); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(poll); window.clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
  }, [includeDev, liveMode, load]);

  const c = report.counts;
  // Today against the same hour yesterday — the only honest comparison while
  // the day is still running. Null when yesterday had nobody to divide by.
  const t = report.totals;
  const trend = t && t.yesterdaySoFar > 0 ? Math.round(((t.today - t.yesterdaySoFar) / t.yesterdaySoFar) * 100) : null;
  // A day two hours old explains a small number better than any comparison.
  const youngDay = report.dayAgeMinutes < 120;
  const dayAge = report.dayAgeMinutes < 60 ? `${Math.max(1, report.dayAgeMinutes)} min` : `${Math.floor(report.dayAgeMinutes / 60)} h`;
  const rows = report.visitors.filter((v) => (!adsOnly || v.fromAd || v.stage === "signed-up") && (!platform || v.platform === platform));
  const onMap = rows.filter((v) => span === 30 || v.active);
  const live = report.status === "ok";
  return <section className={s.live} aria-label="Live now" data-state={report.status} aria-busy={pending}>
    <div className={s.liveHead}>
      <div className={s.liveTitle}><span className={s.livePulse} data-on={live && c.onSite > 0}/><h2>Live now</h2><span className={s.micro}>Last {report.activeMinutes} minutes on the site · seen within {report.windowMinutes} · {liveMode ? `live — every ${LIVE_POLL_MS / 1000} s` : `every ${POLL_MS / 1000} s`} while this tab is open · updated {ago(report.fetchedAt, now)}</span></div>
      <div className={s.liveTools}>
        <label className={s.liveToggle} data-live={liveMode} title={`Refresh every ${LIVE_POLL_MS / 1000} seconds instead of ${POLL_MS / 1000}`}><input type="checkbox" checked={liveMode} onChange={(e) => toggleLiveMode(e.target.checked)}/>Live · {LIVE_POLL_MS / 1000} s</label>
        <label className={s.liveToggle}><input type="checkbox" checked={adsOnly} onChange={(e) => setAdsOnly(e.target.checked)}/>From ads only</label>
        <label className={s.liveToggle}><input type="checkbox" checked={includeDev} onChange={(e) => { setIncludeDev(e.target.checked); void load(e.target.checked, liveMode); }}/>Include localhost</label>
        <button type="button" className={s.iconButton} aria-label="Refresh live view" onClick={() => void load(includeDev, liveMode)} disabled={pending}><RefreshCw size={16} className={pending ? s.spin : ""}/></button>
      </div>
    </div>
    {/* ONE stat row (2026-10-01). It used to be two — four totals over six
        live counters — which on a quiet morning was ten zeros in a grid and
        read as a broken page. Four tiles now, each with the figure that
        gives it meaning underneath, and a sentence under the lot. */}
    <div className={s.liveTotals}>
      <div data-tone="now">
        <span>On the site now</span>
        <strong>{fmt(c.onSite)}</strong>
        <small>{c.fromAds > 0 ? `${fmt(c.fromAds)} from ads` : "none from ads"}{c.signingUp > 0 ? ` · ${fmt(c.signingUp)} signing up` : ""}</small>
      </div>
      <div data-tone="lead">
        <span>Visitors today</span>
        <strong>{t ? fmt(t.today) : "—"}</strong>
        <small data-trend={trend === null ? "flat" : trend > 0 ? "up" : trend < 0 ? "down" : "flat"}>
          {!t ? "totals unavailable"
            : youngDay ? `the day is ${dayAge} old`
            : trend === null ? "nothing at this hour yesterday to compare"
            : trend === 0 ? "level with this time yesterday"
            : `${trend > 0 ? "+" : "−"}${Math.abs(trend)}% vs this time yesterday`}
        </small>
      </div>
      <div data-tone="ok">
        <span>Signed up today</span>
        <strong>{fmt(report.today.signups)}</strong>
        <small>{report.today.signups > 0 ? `${fmt(report.today.fromAds)} from ads` : t && t.today > 0 ? `${fmt(t.today)} visitors, none yet` : "none yet"}</small>
      </div>
      <div data-tone="mute">
        <span>All-time visitors</span>
        <strong>{t ? fmt(t.allTime) : "—"}</strong>
        <small>{t ? `${fmt(t.last7Days)} in the last 7 days · ${fmt(t.yesterday)} yesterday` : "totals unavailable"}</small>
      </div>
    </div>
    {/* What all of that actually means, in a sentence. */}
    {live && report.headline && <p className={s.liveHeadline}>{report.headline}</p>}
    {/* The window, as one coloured line instead of five tiles — the same
        colours the map's pins use. */}
    {live && <div className={s.liveFunnel} aria-label={`The last ${report.windowMinutes} minutes`}>
      <span className={s.liveFunnelLead}>Last {report.windowMinutes} min · {fmt(report.visitors.length)}</span>
      {FUNNEL.map(([stage, label]) => {
        const n = report.visitors.filter((v) => v.stage === stage || (stage === "registering" && v.stage === "checkout")).length;
        return <span key={stage} className={s.liveFunnelStep} data-stage={stage} data-zero={n === 0}><i aria-hidden="true"/>{label}<b>{fmt(n)}</b></span>;
      })}
    </div>}
    {(error || report.message) && <div className={s.notice} role="status"><Info size={16}/><div><strong>{error || report.message}</strong></div></div>}
    {live && <>
      {/* The platforms: a card each, the ad platforms always; pressed, a filter. */}
      <LivePlatforms platforms={report.platforms} selected={platform} onSelect={setPlatform}/>
      {/* The map: where everyone is, a pin per visitor in the stage colours. */}
      <div className={s.liveSpan} role="group" aria-label="Who the map shows">
        <div className={s.dimensionTabs} style={{ margin: 0 }}>
          <button type="button" aria-pressed={span === 5} onClick={() => setSpan(5)}>Now · 5 min</button>
          <button type="button" aria-pressed={span === 30} onClick={() => setSpan(30)}>Last 30 min</button>
        </div>
        <span>{onMap.length} {onMap.length === 1 ? "visitor" : "visitors"} on the map{platform ? ` · ${report.platforms.find((p) => p.platform === platform)?.name ?? platform} only` : ""}</span>
        {platform && <button type="button" className={s.textButton} onClick={() => setPlatform(null)}>Show everyone</button>}
      </div>
      <LiveMap visitors={onMap} now={now} selected={selected} onSelect={setSelected} timezone={timezone} totals={report.totals}/>
    </>}
    {live && !rows.length && <div className={s.liveEmpty}>{report.visitors.length ? (platform ? "Nobody from this platform in the last half hour — press the card again to see everyone." : "Nobody from an ad in the last half hour — turn off the ads filter to see everyone.") : `Nobody on the site in the last ${report.windowMinutes} minutes.`}</div>}
    {rows.length > 0 && <ol className={s.liveList} aria-label="Visitors on the site">
      {rows.map((v) => <LiveRow key={v.id + v.firstAt} v={v} now={now} timezone={timezone} selected={selected === v.id} onSelect={() => setSelected(selected === v.id ? null : v.id)}/>)}
    </ol>}
    {report.otherSignups.length > 0 && <div className={s.liveOthers}><span className={s.micro}>Also signed up today, before this window or with analytics blocked:</span>{report.otherSignups.map((o) => <span key={o.orgName + o.at} className={s.liveOther}><b>{o.orgName}</b> · {o.ownerEmail || "no owner yet"} · {o.source} · {clock(o.at, timezone)}</span>)}</div>}
    <p className={s.footnote}>One line per browser (a PostHog person), newest move first, signups on top; a click on a line shows it on the map. Source is what the first page of the visit carried: a tagged paid medium is an ad; a Facebook, Instagram or TikTok referrer with no tag is called an ad too. Colour is how far they got, and each stage has its own: crimson looking around, cyan signing in, amber on the sign-up form or at checkout, green signed up, near-black already a member. A visitor at the login, forgot-password or reset screen is an existing customer, counted as signing in rather than browsing; "locked out" means they asked for a reset link. Places come from PostHog&apos;s GeoIP reading of the browser&apos;s address — the town is usually right, the street never known. A signup is named after the organization created within fifteen minutes of it with the same campaign tag.</p>
  </section>;
}

function LiveRow({ v, now, timezone, selected, onSelect }: { v: LiveVisitor; now: number; timezone: string; selected: boolean; onSelect: () => void }) {
  // A row is a click away from its pin on the map (and back).
  return <li className={s.liveRow} data-stage={v.stage} data-active={v.active} data-ad={v.fromAd} data-selected={selected} onClick={onSelect} title={v.lat !== null ? "Show on the map" : "No known place for this visitor"}>
    <div className={s.liveMark} aria-hidden="true"/>
    <div className={s.liveWho}>
      <b>{STAGE[v.stage]}{v.signup ? ` → ${v.signup.orgName}` : ""}</b>
      {v.signup && <span className={s.liveSignup}>{v.signup.ownerName ? `${v.signup.ownerName} · ` : ""}{v.signup.ownerEmail}{v.signup.plan ? ` · ${v.signup.plan}` : ""}{v.signup.outcome ? ` · ${v.signup.outcome.replace(/_/g, " ")}` : ""} · account made {clock(v.signup.at, timezone)}</span>}
      {!v.signup && v.stage === "signed-up" && v.signedUpAt && <span className={s.liveSignup}>Verified at {clock(v.signedUpAt, timezone)} · no organization row matched yet</span>}
      <span className={s.liveSource}>
        {v.fromAd && <em className={s.liveAd}><Megaphone size={11}/>Ad</em>}
        {/* Locked out is its own chip: the one state that wants a person,
            not a nudge. */}
        {v.lockedOut && <em className={s.liveLocked}><KeyRound size={11}/>Locked out</em>}
        {v.source}{v.campaign ? ` · ${v.campaign}` : ""}
      </span>
    </div>
    <div className={s.liveWhere}>
      <b>{v.pageLabel}</b>
      <span>{v.views} {v.views === 1 ? "page" : "pages"}{v.trail.length > 1 ? ` · ${v.trail.join(" → ")}` : ""}</span>
      {/* What they pressed — only the landing's tagged buttons fire this, so
          an empty line means "nothing we track", not "they clicked nothing". */}
      {v.clicks.length > 0 && <span className={s.liveClicks}>
        <MousePointerClick size={11}/>
        {v.clicks.map((c) => `“${c.label}”${c.placement ? ` · ${c.placement.replace(/[-_]/g, " ")}` : ""}`).join("  ·  ")}
      </span>}
      {/* The visit in one sentence, so the trail above does not have to be
          decoded by eye. */}
      {v.summary && <span className={s.liveSummary}>{v.summary}</span>}
    </div>
    <div className={s.liveWhen}>
      <b>{v.active ? "On the site now" : "Left"}</b>
      <span>{ago(v.lastAt, now)} · since {clock(v.firstAt, timezone)}</span>
      <span>{[v.device, v.browser].filter(Boolean).join(" / ") || "Unknown device"}{v.place ? ` · ${v.place}` : ""}{v.environment === "development" ? " · localhost" : ""}</span>
    </div>
  </li>;
}

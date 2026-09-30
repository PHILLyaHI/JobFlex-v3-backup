"use client";
// LIVE NOW (2026-09-28): the people on the site this minute — where each one
// came from (an ad, tagged or not), what they are looking at, how far they
// got — and the ones who signed up, in their own colour, named after the
// account the database just made. Polls while the tab is visible; one shared
// PostHog query behind it (lib/traffic-server fetchLiveEvents).
import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Megaphone, RefreshCw } from "lucide-react";
import { getLiveTraffic } from "@/actions/trafficDashboard";
import type { LiveReport, LiveStage, LiveVisitor } from "@/lib/traffic-live";
import { LiveMap } from "./live-map";
import { LivePlatforms } from "./live-platforms";
import s from "./traffic.module.css";

const POLL_MS = 45_000;
const STAGE: Record<LiveStage, string> = { browsing: "Looking around", registering: "On the sign-up form", checkout: "At checkout", "signed-up": "Signed up", member: "In the app · member" };

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
  /** The visitor opened on the map — from a pin, or from a row of the list. */
  const [selected, setSelected] = useState<string | null>(null);
  /** A platform card pressed: the map and the list keep only its people. */
  const [platform, setPlatform] = useState<string | null>(null);
  const request = useRef(0);
  // Stable: it takes the one thing that changes as an argument, so the poll
  // below is armed once per setting, not once per tick of the clock.
  const load = useCallback(async (dev: boolean) => {
    const id = ++request.current;
    setPending(true);
    try {
      const next = await getLiveTraffic({ includeDevelopment: dev });
      if (id === request.current) { setReport(next); setError(""); setNow(Date.now()); }
    } catch (err) {
      if (id === request.current) setError(err instanceof Error ? err.message : "Could not refresh the live view.");
    } finally {
      if (id === request.current) setPending(false);
    }
  }, []);
  // Poll while the tab is in front; a tab brought back refreshes at once.
  // The "n s ago" figures tick on their own, ten seconds at a time.
  useEffect(() => {
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void load(includeDev); }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 10_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(includeDev); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(poll); window.clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
  }, [includeDev, load]);

  const c = report.counts;
  const rows = report.visitors.filter((v) => (!adsOnly || v.fromAd || v.stage === "signed-up") && (!platform || v.platform === platform));
  const onMap = rows.filter((v) => span === 30 || v.active);
  const live = report.status === "ok";
  return <section className={s.live} aria-label="Live now" data-state={report.status} aria-busy={pending}>
    <div className={s.liveHead}>
      <div className={s.liveTitle}><span className={s.livePulse} data-on={live && c.onSite > 0}/><h2>Live now</h2><span className={s.micro}>Last {report.activeMinutes} minutes on the site · seen within {report.windowMinutes} · refreshes every {POLL_MS / 1000} s while this tab is open</span></div>
      <div className={s.liveTools}>
        <label className={s.liveToggle}><input type="checkbox" checked={adsOnly} onChange={(e) => setAdsOnly(e.target.checked)}/>From ads only</label>
        <label className={s.liveToggle}><input type="checkbox" checked={includeDev} onChange={(e) => { setIncludeDev(e.target.checked); void load(e.target.checked); }}/>Include localhost</label>
        <button type="button" className={s.iconButton} aria-label="Refresh live view" onClick={() => void load(includeDev)} disabled={pending}><RefreshCw size={16} className={pending ? s.spin : ""}/></button>
      </div>
    </div>
    <div className={s.liveKpis}>
      <div data-tone="ink"><span>On the site now</span><strong>{c.onSite}</strong></div>
      <div data-tone="ad"><span>From ads</span><strong>{c.fromAds}</strong><small>of those on now</small></div>
      <div data-tone="warm"><span>Signing up</span><strong>{c.signingUp}</strong><small>form or checkout, now</small></div>
      <div data-tone="ok"><span>Signed up</span><strong>{c.signedUp}</strong><small>last {report.windowMinutes} min</small></div>
      <div data-tone="mute"><span>Members in the app</span><strong>{c.members}</strong></div>
      <div data-tone="today"><span>Today</span><strong>{report.today.signups}</strong><small>{report.today.signups === 1 ? "signup" : "signups"} · {report.today.fromAds} from ads</small></div>
    </div>
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
      <LiveMap visitors={onMap} now={now} selected={selected} onSelect={setSelected} timezone={timezone}/>
    </>}
    {live && !rows.length && <div className={s.liveEmpty}>{report.visitors.length ? (platform ? "Nobody from this platform in the last half hour — press the card again to see everyone." : "Nobody from an ad in the last half hour — turn off the ads filter to see everyone.") : `Nobody on the site in the last ${report.windowMinutes} minutes.`}</div>}
    {rows.length > 0 && <ol className={s.liveList} aria-label="Visitors on the site">
      {rows.map((v) => <LiveRow key={v.id + v.firstAt} v={v} now={now} timezone={timezone} selected={selected === v.id} onSelect={() => setSelected(selected === v.id ? null : v.id)}/>)}
    </ol>}
    {report.otherSignups.length > 0 && <div className={s.liveOthers}><span className={s.micro}>Also signed up today, before this window or with analytics blocked:</span>{report.otherSignups.map((o) => <span key={o.orgName + o.at} className={s.liveOther}><b>{o.orgName}</b> · {o.ownerEmail || "no owner yet"} · {o.source} · {clock(o.at, timezone)}</span>)}</div>}
    <p className={s.footnote}>One line per browser (a PostHog person), newest move first, signups on top; a click on a line shows it on the map. Source is what the first page of the visit carried: a tagged paid medium is an ad; a Facebook, Instagram or TikTok referrer with no tag is called an ad too. Colour is how far they got. Places come from PostHog&apos;s GeoIP reading of the browser&apos;s address — the town is usually right, the street never known. A signup is named after the organization created within fifteen minutes of it with the same campaign tag.</p>
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
      <span className={s.liveSource}>{v.fromAd && <em className={s.liveAd}><Megaphone size={11}/>Ad</em>}{v.source}{v.campaign ? ` · ${v.campaign}` : ""}</span>
    </div>
    <div className={s.liveWhere}>
      <b>{v.pageLabel}</b>
      <span>{v.views} {v.views === 1 ? "page" : "pages"}{v.trail.length > 1 ? ` · ${v.trail.join(" → ")}` : ""}</span>
    </div>
    <div className={s.liveWhen}>
      <b>{v.active ? "On the site now" : "Left"}</b>
      <span>{ago(v.lastAt, now)} · since {clock(v.firstAt, timezone)}</span>
      <span>{[v.device, v.browser].filter(Boolean).join(" / ") || "Unknown device"}{v.place ? ` · ${v.place}` : ""}{v.environment === "development" ? " · localhost" : ""}</span>
    </div>
  </li>;
}

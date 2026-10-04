"use client";
// THE SIGNUP RAIL (2026-10-04): the green cards beside the live map — every
// account made today, in the last two days, the week or the month, newest on
// top, and the next one the moment it lands. Owner: "keep all the signed-up
// green cards in a row next to the map, per day / two days / seven days /
// month; as soon as somebody signs up under the map it goes right away on
// the right side."
//
// One read covers every span: the 30-day signup ledger (actions/
// trafficDashboard getSignupLedger — Organization rows with the landing's
// tags and the Subscription beside them), cut here to calendar days in the
// page's timezone, like the map's own "today". Switching the span never
// waits on the server. The read happens again every half minute while the
// tab is in front, when the tab comes back, and at once when the live poll
// brings a convert the rail does not hold — so the card follows the pin by
// one poll (15 s in live mode) at the latest. A card the rail had not seen
// before slides in from the map's side; one made in the last quarter hour
// keeps a pulse on its stripe; one whose visitor is still on the map says
// where they are.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Megaphone, RefreshCw } from "lucide-react";
import { getSignupLedger } from "@/actions/trafficDashboard";
import { signupLedgerSummary, type LiveVisitor, type SignupLedger, type SignupRecord } from "@/lib/traffic-live";
import { TRAFFIC_SINCE_LABEL, TRAFFIC_SINCE_MS } from "@/lib/traffic-visitor";
import { localHourAt } from "@/lib/home/dates";
import { Ago, agoText, useNow } from "./ticker";
import s from "./signup-rail.module.css";

/** The spans: calendar days in the page's timezone, today counted as one. */
const SPANS: Array<[number, string]> = [[1, "Today"], [2, "2 days"], [7, "7 days"], [30, "30 days"]];
/** One read covers every span. */
const READ_DAYS = 30;
const POLL_MS = 30_000;
/** A card this young keeps its stripe pulsing. */
const FRESH_MS = 15 * 60_000;
/** How long a card that just landed keeps its arrival mark. */
const ARRIVAL_MS = 12_000;
const DAY_MS = 86_400_000;

function ymdIn(ms: number, tz: string): { y: number; m: number; d: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return { y: get("year"), m: get("month"), d: get("day") };
  } catch { return null; }
}
/** Local midnight, `daysBack` days before the day `at` falls in, as UTC ms. */
function dayStart(at: number, daysBack: number, tz: string): number {
  const ymd = ymdIn(at, tz);
  if (!ymd) return at - (daysBack + 1) * DAY_MS; // an unknown zone: a rolling window
  return localHourAt(new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d - daysBack)), 0, tz).getTime();
}
/** "Today", "Yesterday", "Thu, Oct 1". */
function dayLabel(ms: number, at: number, tz: string): string {
  const d = ymdIn(ms, tz);
  const t = ymdIn(at, tz);
  if (!d || !t) return "";
  const key = (x: { y: number; m: number; d: number }) => Date.UTC(x.y, x.m - 1, x.d);
  if (key(d) === key(t)) return "Today";
  if (key(d) === key(t) - DAY_MS) return "Yesterday";
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(ms)); } catch { return ""; }
}
function sameDay(a: number, b: number, tz: string): boolean {
  const x = ymdIn(a, tz);
  const y = ymdIn(b, tz);
  return Boolean(x && y && x.y === y.y && x.m === y.m && x.d === y.d);
}
/** "4 min ago" for a card made today; the clock for an older one — its day header says which day. */
function whenTextFor(tz: string): (iso: string, at: number) => string {
  return (iso, at) => {
    const ms = Date.parse(iso);
    if (sameDay(ms, at, tz)) return agoText(iso, at);
    try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms)); } catch { return agoText(iso, at); }
  };
}
/** "Bothell, WA" — the short form of where the pin is; the long one when the state is unknown. */
function placeOfVisitor(v: LiveVisitor): string {
  if (v.city && v.regionCode) return `${v.city}, ${v.regionCode}`;
  return v.place || v.city || v.country || "";
}
function clock(ms: number, tz: string): string {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms)); } catch { return ""; }
}

export function SignupRail({ initial, timezone, fullHistory = false, liveSignups, adNames }: {
  /** The page's ledger, when it covers the rail's whole read; else the rail reads its own. */
  initial: SignupLedger | null;
  timezone: string;
  fullHistory?: boolean;
  /** The signed-up visitors the live poll knows (the window's and today's). */
  liveSignups: LiveVisitor[];
  adNames: Record<string, string>;
}) {
  const usable = initial && initial.days >= READ_DAYS ? initial : null;
  const [days, setDays] = useState<number>(1);
  const [ledger, setLedger] = useState<SignupLedger | null>(usable);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [arrivals, setArrivals] = useState<ReadonlySet<string>>(() => new Set());
  const request = useRef(0);
  const known = useRef<Set<string> | null>(usable ? new Set(usable.records.map((r) => r.orgId)) : null);
  const arrivalTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const id = ++request.current;
    setPending(true);
    try {
      const next = await getSignupLedger({ days: READ_DAYS, fullHistory });
      if (id !== request.current) return;
      setLedger(next);
      setError("");
      // Who the rail had not seen: those cards come in from the map's side.
      const seen = known.current;
      if (seen) {
        const fresh = next.records.filter((r) => !seen.has(r.orgId)).map((r) => r.orgId);
        if (fresh.length) {
          setArrivals(new Set(fresh));
          if (arrivalTimer.current !== null) window.clearTimeout(arrivalTimer.current);
          arrivalTimer.current = window.setTimeout(() => setArrivals(new Set()), ARRIVAL_MS);
        }
      }
      known.current = new Set(next.records.map((r) => r.orgId));
    } catch (err) {
      if (id === request.current) setError(err instanceof Error ? err.message : "Could not load the signups.");
    } finally {
      if (id === request.current) setPending(false);
    }
  }, [fullHistory]);
  useEffect(() => () => { if (arrivalTimer.current !== null) window.clearTimeout(arrivalTimer.current); }, []);

  // Read on mount unless the page's ledger already serves; again whenever the
  // window switch flips (a new `load`), every half minute in front, and when
  // the tab comes back. The first read waits a tick, as the map's history
  // read does, so no state moves inside the effect itself.
  const primed = useRef(Boolean(usable));
  useEffect(() => {
    let first: number | null = null;
    if (!primed.current) first = window.setTimeout(() => void load(), 0);
    primed.current = false;
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { if (first !== null) window.clearTimeout(first); window.clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  // The live poll brought a signup the rail does not hold: read now.
  const liveKey = useMemo(() => liveSignups.map((v) => (v.signup?.ownerEmail || v.signedUpAt || v.id).toLowerCase()).sort().join("|"), [liveSignups]);
  const seenKey = useRef(liveKey);
  useEffect(() => {
    if (liveKey === seenKey.current) return;
    seenKey.current = liveKey;
    const have = new Set((ledger?.records ?? []).map((r) => r.ownerEmail.toLowerCase()));
    const unseen = liveSignups.some((v) => (v.signup ? !have.has(v.signup.ownerEmail.toLowerCase()) : Boolean(v.signedUpAt)));
    if (!unseen) return;
    const soon = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(soon);
  }, [liveKey, liveSignups, ledger, load]);

  // Where a signup's visitor is, while the map still has them.
  const placeOf = useMemo(() => {
    const m = new Map<string, LiveVisitor>();
    for (const v of liveSignups) if (v.signup?.ownerEmail) m.set(v.signup.ownerEmail.toLowerCase(), v);
    return m;
  }, [liveSignups]);

  // The clock the page shares (./ticker): 0 until the browser has it, so the
  // server and the first client render agree. Minute-coarse here — the cut
  // of the day moves once a minute, not once a second.
  const at = useNow();
  const minute = at ? Math.floor(at / 60_000) * 60_000 : 0;
  const since = useMemo(() => (minute ? dayStart(minute, days - 1, timezone) : null), [minute, days, timezone]);
  const records = useMemo(() => (ledger && since !== null ? ledger.records.filter((r) => Date.parse(r.createdAt) >= since) : []), [ledger, since]);
  const summary = useMemo(() => signupLedgerSummary(records), [records]);
  const groups = useMemo(() => {
    const out: Array<{ label: string; items: SignupRecord[] }> = [];
    for (const r of records) {
      const label = days === 1 ? "" : dayLabel(Date.parse(r.createdAt), minute, timezone);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(r);
      else out.push({ label, items: [r] });
    }
    return out;
  }, [records, days, minute, timezone]);
  const ready = Boolean(ledger) && since !== null;
  const floored = !fullHistory && since !== null && since < TRAFFIC_SINCE_MS;
  const whenText = useMemo(() => whenTextFor(timezone), [timezone]);
  // An empty "today" early in the day: say what yesterday brought, one press away.
  const yesterday = useMemo(() => {
    if (!ledger || !minute || days !== 1) return 0;
    const from = dayStart(minute, 1, timezone);
    return ledger.records.filter((r) => Date.parse(r.createdAt) >= from).length - records.length;
  }, [ledger, minute, days, timezone, records.length]);

  return (
    <aside className={s.rail} aria-label="Signed up" data-pending={pending} data-span={days}>
      <div className={s.in}>
        <div className={s.head}>
          <div className={s.titleRow}>
            <b className={s.title}>Signed up</b>
            {ready && <span className={s.count} data-signup-rail-count={summary.total}>{summary.total}{summary.fromAds ? ` · ${summary.fromAds} from ads` : ""}</span>}
            <button type="button" className={s.refresh} onClick={() => void load()} disabled={pending} aria-label="Refresh the signups" title="Refresh"><RefreshCw size={13}/></button>
          </div>
          <div className={s.tabs} role="group" aria-label="How far back">
            {SPANS.map(([d, label]) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{label}</button>)}
          </div>
        </div>
        <ol className={s.list}>
          {!ready && !error && <li className={s.empty}>…</li>}
          {error && <li className={s.empty} role="status">{error}</li>}
          {ready && records.length === 0 && (
            <li className={s.empty}>
              {days === 1
                ? <>Nobody yet today — the next signup lands here the moment it happens.{yesterday > 0 && <> <button type="button" className={s.link} onClick={() => setDays(2)}>Yesterday brought {yesterday} →</button></>}</>
                : `No signups in the last ${days} days.`}
            </li>
          )}
          {groups.map((g) => (
            <li key={g.label || "today"} className={s.group}>
              {g.label && <div className={s.day}>{g.label}</div>}
              <ol className={s.cards}>
                {g.items.map((r) => {
                  const made = Date.parse(r.createdAt);
                  const live = placeOf.get(r.ownerEmail.toLowerCase());
                  return (
                    <li key={r.orgId} className={s.card} data-state={r.state} data-fresh={minute - made < FRESH_MS} data-new={arrivals.has(r.orgId)} data-live={Boolean(live?.active)} data-signup-card={r.orgId}>
                      <div className={s.cardTop}>
                        <b className={s.org}>{r.orgName}</b>
                        <span className={s.when} title={clock(made, timezone)}><Ago iso={r.createdAt} format={whenText}/></span>
                      </div>
                      <div className={s.who}>{r.ownerName ? `${r.ownerName} · ` : ""}{r.ownerEmail || "no owner yet"}</div>
                      <div className={s.chips}>
                        <em className={s.plan}>{r.planLabel}</em>
                        {r.fromAd && <em className={s.ad}><Megaphone size={10} aria-hidden/>{adNames[r.campaign] || adNames[r.content] || r.source}</em>}
                        {!r.fromAd && r.source && <em className={s.src}>{r.source}</em>}
                        {r.industry && r.industry !== "default" && <em className={s.trade}>{r.industry}</em>}
                      </div>
                      {live && (live.place || live.device) && <div className={s.place}>{live.active ? "On the site now" : "Was on the map"}{placeOfVisitor(live) ? ` · ${placeOfVisitor(live)}` : ""}{live.device ? ` · ${live.device}` : ""}</div>}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
        {(ledger?.truncated || floored) && (
          <div className={s.foot}>
            {ledger?.truncated ? `The newest ${ledger.records.length} — the whole list is in the signup ledger below. ` : ""}
            {floored ? `Counted from ${TRAFFIC_SINCE_LABEL}, the ad launch; "Show full history" above lifts that.` : ""}
          </div>
        )}
      </div>
    </aside>
  );
}

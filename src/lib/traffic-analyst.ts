// THE ANALYST (owner, 2026-10-02: "a smart analyser of what people do on the
// landing page — find what is wrong with the ads or the sign-up, how to
// convert faster, and say what is going on after a period of time").
//
// One HogQL query reads the last ANALYST_DAYS of events as ONE ROW PER
// SESSION: where the visit came from (ad, trade hero, device, Facebook's
// in-app browser), what happened on the landing (pages, seconds on it, how
// far they scrolled — posthog-js sends both on $pageleave — which sections
// they reached, which buttons they pressed) and how far the sign-up got
// (the form, step 1 / 2 / 3, a trial or checkout started, errors, the
// verified completion). `analyse` then turns those rows into FINDINGS — each
// a plain sentence of evidence and one concrete thing to try — by rules
// with minimum samples, so it says nothing it cannot back, and a one-line
// headline of what is going on. Pure: no I/O, so scripts/qa/traffic-analyst
// .check.ts proves every rule on made-up sessions.

import { LANDING_SECTIONS } from "./landing-sections";
import { TRAFFIC_EVENTS as E } from "./traffic-contract";
import { classifySource } from "./traffic-live";
import { BROWSER_TYPE_SQL, HOST_SQL, IN_APP_SQL, UA_SQL, visitorRuleSql } from "./traffic-visitor";
import { resolveLandingVariant } from "@/components/v3/landing-e/landing-variants";

export const ANALYST_DAYS = 7;
/** The analyst speaks once this many visits from ads have landed in the window. */
export const ANALYST_MIN_AD_VISITS = 20;
/** A segment (an ad, a trade, a device…) is compared once it has this many visits. */
const SEGMENT_MIN = 8;

/** One session, as the query returns it (analystSessionFromRow). */
export interface LandingSession {
  id: string;
  person: string;
  startedAt: number;
  endedAt: number;
  /** The landing's variant key ("roofing", "hvac", "default"…), "" when the landing was not seen. */
  industry: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  referrer: string;
  fbclid: boolean;
  device: string;
  browser: string;
  os: string;
  inApp: boolean;
  views: number;
  landingViews: number;
  /** Seconds on the landing (null = the browser never reported leaving it). */
  dwell: number | null;
  /** Deepest scroll on the landing, 0..1 (null = not reported). */
  scroll: number | null;
  sections: string[];
  cta: number;
  placements: string[];
  registerViews: number;
  /** The furthest sign-up step viewed: 0 none, 1 account, 2 company, 3 plan. */
  step: number;
  flow: string;
  attempts: number;
  cardless: number;
  opened: number;
  errors: string[];
  completed: boolean;
  outcome: string;
  plan: string;
}

export interface AnalystFinding {
  id: string;
  tone: "bad" | "warn" | "good" | "info";
  title: string;
  /** The numbers behind it, in one line. */
  evidence: string;
  /** One concrete thing to try. */
  action: string;
  /** What it is about — an ad's name, a trade, a browser — when not the whole site. */
  about?: string;
  n: number;
  confidence: "low" | "medium" | "high";
}

export interface AnalystSegment { key: string; name: string; n: number; bounce: number | null; cta: number | null; form: number | null; completed: number; platform?: string }

export interface AnalystReport {
  days: number;
  sample: { sessions: number; landed: number; fromAds: number; last24h: number; measured: number; enough: boolean; needed: number; basis: "ads" | "all" };
  headline: string;
  findings: AnalystFinding[];
  funnel: Array<{ key: string; label: string; n: number; pct: number | null }>;
  sections: Array<{ key: string; label: string; reach: number | null; shown: "all" | "some" }>;
  ads: AnalystSegment[];
  trades: AnalystSegment[];
  placements: Array<{ placement: string; n: number }>;
  stats: { bounce: number | null; fast: number | null; dwellMedian: number | null; scrollMedian: number | null; inApp: number | null };
}

// ── The query ──────────────────────────────────────────────────────────────

/** The last `days` of events, one row per session, in the order
 *  analystSessionFromRow reads them. Arrays travel as comma-joined strings
 *  (groupUniqArrayIf). HogQL, not ClickHouse: the alias cannot be `session`
 *  (HogQL's own sessions table), only its whitelisted functions exist
 *  (toFloat64OrNull yes; the Int variants are not relied on), and the sort
 *  key must be a selected column. The visitor rule is the page's one rule
 *  (traffic-visitor). */
export function buildAnalystQuery(days = ANALYST_DAYS): string {
  const prop = (name: string) => `ifNull(toString(properties.${name}), '')`;
  const num = (name: string) => `toFloat64OrNull(toString(properties.${name}))`;
  const path = `ifNull(nullIf(${prop("$pathname")}, ''), path(${prop("$current_url")}))`;
  const events = ["'$pageview'", "'$pageleave'", ...[E.landingView, E.landingSection, E.ctaClick, E.step, E.attempt, E.opened, E.error, E.completed].map((e) => `'${e}'`)].join(", ");
  // The landing's own numbers ride on the event that leaves it: $pageleave, or the next $pageview on an in-app navigation.
  const left = `((event = '$pageleave' OR event = '$pageview') AND ${prop("$prev_pageview_pathname")} = '/')`;
  const joined = (value: string, when: string) => `arrayStringConcat(groupUniqArrayIf(${value}, ${when} AND ${value} != ''), ',')`;
  const d = Math.max(1, Math.min(30, Math.round(days)));
  return `SELECT ${prop("$session_id")} AS sid, any(toString(person_id)),
    toUnixTimestamp(min(timestamp)) * 1000 AS started, toUnixTimestamp(max(timestamp)) * 1000,
    anyIf(${prop("industry")}, event = '${E.landingView}'),
    argMinIf(${prop("$current_url")}, timestamp, event = '$pageview' AND ${path} = '/'),
    anyIf(${prop("utm_source")}, ${prop("utm_source")} != ''), anyIf(${prop("utm_medium")}, ${prop("utm_medium")} != ''),
    anyIf(${prop("utm_campaign")}, ${prop("utm_campaign")} != ''), anyIf(${prop("utm_content")}, ${prop("utm_content")} != ''),
    anyIf(${prop("$referring_domain")}, event = '$pageview'), max(${prop("fbclid")} != ''),
    anyIf(${prop("$device_type")}, ${prop("$device_type")} != ''), anyIf(${prop("$browser")}, ${prop("$browser")} != ''), anyIf(${prop("$os")}, ${prop("$os")} != ''),
    max(${IN_APP_SQL}),
    countIf(event = '$pageview'), countIf(event = '$pageview' AND ${path} = '/'),
    maxIf(${num("$prev_pageview_duration")}, ${left}), maxIf(${num("$prev_pageview_max_scroll_percentage")}, ${left}),
    ${joined(prop("section"), `event = '${E.landingSection}'`)},
    countIf(event = '${E.ctaClick}'), ${joined(prop("placement"), `event = '${E.ctaClick}'`)},
    countIf(event = '$pageview' AND startsWith(${path}, '/auth/register')),
    maxIf(${num("step")}, event = '${E.step}'), anyIf(${prop("flow")}, event = '${E.step}'),
    countIf(event = '${E.attempt}'), countIf(event = '${E.attempt}' AND ${prop("card")} = 'false'), countIf(event = '${E.opened}'),
    ${joined(prop("reason"), `event = '${E.error}'`)},
    countIf(event = '${E.completed}' AND ${prop("verified")} IN ('true', '1', '')),
    anyIf(${prop("outcome")}, event = '${E.completed}'), anyIf(${prop("plan")}, event = '${E.completed}')
    FROM events
    WHERE timestamp > now() - INTERVAL ${d} DAY AND timestamp <= now() AND event IN (${events})
      AND ${prop("$session_id")} != '' AND ${path} != '/admin' AND NOT startsWith(${path}, '/admin/')
      AND ${visitorRuleSql({ host: HOST_SQL, ua: UA_SQL, browserType: BROWSER_TYPE_SQL, event: "event" }, "production")}
    GROUP BY sid ORDER BY started DESC LIMIT 6000`;
}

const text = (v: unknown) => (v == null ? "" : String(v));
const count = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const maybe = (v: unknown) => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const list = (v: unknown) => text(v).split(",").map((s) => s.trim()).filter(Boolean);

/** The landing's trade from its URL when landing_view did not arrive (beacon fallback). */
function industryOfUrl(url: string): string {
  if (!url.includes("?")) return "";
  try { const q = new URL(url, "https://www.jobflex.app").searchParams; return resolveLandingVariant(q.get("industry") ?? q.get("trade")) ?? ""; } catch { return ""; }
}

export function analystSessionFromRow(row: unknown[]): LandingSession | null {
  if (!Array.isArray(row) || row.length < 33) return null;
  const id = text(row[0]);
  if (!id) return null;
  const industry = text(row[4]) || industryOfUrl(text(row[5])) || (count(row[16]) > 0 ? "default" : "");
  return {
    id, person: text(row[1]), startedAt: count(row[2]), endedAt: count(row[3]), industry,
    utmSource: text(row[6]), utmMedium: text(row[7]), utmCampaign: text(row[8]), utmContent: text(row[9]), referrer: text(row[10]), fbclid: count(row[11]) > 0,
    device: text(row[12]), browser: text(row[13]), os: text(row[14]), inApp: count(row[15]) > 0,
    views: count(row[16]), landingViews: count(row[17]), dwell: maybe(row[18]), scroll: maybe(row[19]),
    sections: list(row[20]), cta: count(row[21]), placements: list(row[22]),
    registerViews: count(row[23]), step: count(row[24]), flow: text(row[25]),
    attempts: count(row[26]), cardless: count(row[27]), opened: count(row[28]), errors: list(row[29]),
    completed: count(row[30]) > 0, outcome: text(row[31]), plan: text(row[32]),
  };
}

// ── The reading of one session ─────────────────────────────────────────────

interface Read extends LandingSession {
  landed: boolean; fromAd: boolean; platform: string; platformName: string; adKey: string;
  bounced: boolean; fast: boolean; engaged: boolean; pressed: boolean; form: boolean;
  s1: boolean; s2: boolean; s3: boolean; attempted: boolean; done: boolean; hour: number;
}

function hourIn(ms: number, timezone: string): number {
  try { return Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(new Date(ms))) % 24; } catch { return new Date(ms).getUTCHours(); }
}

function read(s: LandingSession, timezone: string): Read {
  const src = classifySource(s.utmSource, s.utmMedium, s.referrer, "www.jobflex.app", s.fbclid ? "fbclid" : "");
  const landed = s.landingViews > 0 || s.industry !== "";
  const pressed = s.cta > 0;
  const form = s.registerViews > 0 || s.step >= 1;
  const bounced = landed && s.views <= 1 && !pressed && !form;
  return {
    ...s, landed, fromAd: src.fromAd, platform: src.platform, platformName: src.label, adKey: s.utmContent || s.utmCampaign,
    bounced, fast: bounced && s.dwell !== null && s.dwell < 5 && (s.scroll === null || s.scroll < 0.1),
    engaged: landed && ((s.dwell ?? 0) >= 30 || (s.scroll ?? 0) >= 0.5 || s.sections.length >= 3),
    pressed, form, s1: s.step >= 1, s2: s.step >= 2, s3: s.step >= 3, attempted: s.attempts > 0 || s.opened > 0, done: s.completed,
    hour: hourIn(s.startedAt, timezone),
  };
}

// ── Arithmetic in plain words ──────────────────────────────────────────────

const share = (xs: readonly Read[], pick: (r: Read) => boolean): number | null => (xs.length ? xs.filter(pick).length / xs.length : null);
const median = (xs: number[]): number | null => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const pct = (x: number | null, digits = 0): string => (x === null ? "—" : `${(x * 100).toFixed(digits)}%`);
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const conf = (n: number): AnalystFinding["confidence"] => (n >= 100 ? "high" : n >= 40 ? "medium" : "low");
const secs = (x: number | null) => (x === null ? "—" : x < 60 ? `${Math.round(x)} s` : `${Math.round(x / 60)} min`);

function segment(key: string, name: string, xs: Read[], platform?: string): AnalystSegment {
  return { key, name, n: xs.length, bounce: share(xs, (r) => r.bounced), cta: share(xs, (r) => r.pressed), form: share(xs, (r) => r.form), completed: xs.filter((r) => r.done).length, platform };
}
function groupBy(xs: Read[], by: (r: Read) => string): Map<string, Read[]> {
  const m = new Map<string, Read[]>();
  for (const r of xs) { const k = by(r); if (!k) continue; const g = m.get(k); if (g) g.push(r); else m.set(k, [r]); }
  return m;
}

/** An ad's name: the owner's name for the ad (utm_content) or the campaign, else the id as Meta sent it. */
export function adNameOf(s: { utmCampaign: string; utmContent: string }, adNames: Record<string, string>): string {
  if (s.utmContent && adNames[s.utmContent]) return adNames[s.utmContent];
  // Only the campaign is named: the ad is told apart by its id, under that name.
  if (s.utmCampaign && adNames[s.utmCampaign]) return s.utmContent ? `${adNames[s.utmCampaign]} · ad ${s.utmContent}` : adNames[s.utmCampaign];
  if (s.utmContent) return `ad ${s.utmContent}`;
  if (s.utmCampaign) return `campaign ${s.utmCampaign}`;
  return "untagged";
}

const STEP_NAMES: Record<number, string> = { 1: "step 1 (account)", 2: "step 2 (company)", 3: "step 3 (plan)" };
const TRADE_NAME = (key: string) => (key === "default" ? "the general landing" : `the ${key.replace(/-/g, " ")} landing`);

// ── The analysis ───────────────────────────────────────────────────────────

export function analyse(sessions: LandingSession[], opts: { now?: number; timezone?: string; adNames?: Record<string, string>; days?: number } = {}): AnalystReport {
  const now = opts.now ?? Date.now();
  const timezone = opts.timezone || "America/Los_Angeles";
  const adNames = opts.adNames ?? {};
  const days = opts.days ?? ANALYST_DAYS;
  const all = sessions.map((s) => read(s, timezone));
  const landed = all.filter((r) => r.landed);
  const fromAds = landed.filter((r) => r.fromAd);
  const enough = fromAds.length >= ANALYST_MIN_AD_VISITS;
  // The basis: visits from ads once there are enough of them (that is what the
  // owner pays for), else every landing visit.
  const basis: "ads" | "all" = enough ? "ads" : "all";
  const base = enough ? fromAds : landed;
  const last24h = landed.filter((r) => r.startedAt >= now - 86_400_000).length;
  const measured = base.filter((r) => r.sections.length > 0);

  // The funnel in people, over the basis.
  const n = base.length;
  const pressed = base.filter((r) => r.pressed), form = base.filter((r) => r.form), s1 = base.filter((r) => r.s1), s2 = base.filter((r) => r.s2), s3 = base.filter((r) => r.s3), attempted = base.filter((r) => r.attempted), done = base.filter((r) => r.done);
  const funnel = [
    { key: "landed", label: basis === "ads" ? "Landed from an ad" : "Landed", n, pct: n ? 1 : null },
    { key: "pressed", label: "Pressed a button", n: pressed.length, pct: n ? pressed.length / n : null },
    { key: "form", label: "Opened the form", n: form.length, pct: n ? form.length / n : null },
    { key: "s2", label: "Step 2 · company", n: s2.length, pct: n ? s2.length / n : null },
    { key: "s3", label: "Step 3 · plan", n: s3.length, pct: n ? s3.length / n : null },
    { key: "attempted", label: "Started a trial / checkout", n: attempted.length, pct: n ? attempted.length / n : null },
    { key: "done", label: "Signed up", n: done.length, pct: n ? done.length / n : null },
  ];
  const stats = {
    bounce: share(base, (r) => r.bounced),
    fast: share(base, (r) => r.fast),
    dwellMedian: median(base.map((r) => r.dwell).filter((x): x is number => x !== null)),
    scrollMedian: median(base.map((r) => r.scroll).filter((x): x is number => x !== null)),
    inApp: share(base, (r) => r.inApp),
  };
  // Sections: of the visits that reported any section, how many reached each.
  const sections = LANDING_SECTIONS.map((sec) => ({ key: sec.key, label: sec.label, shown: sec.shown, reach: measured.length ? measured.filter((r) => r.sections.includes(sec.key)).length / measured.length : null }));
  const placementCounts = new Map<string, number>();
  for (const r of base) for (const p of r.placements) placementCounts.set(p, (placementCounts.get(p) ?? 0) + 1);
  const placements = [...placementCounts].map(([placement, c]) => ({ placement, n: c })).sort((a, b) => b.n - a.n);
  const ads = [...groupBy(fromAds, (r) => r.adKey)].map(([key, xs]) => segment(key, adNameOf(xs[0], adNames), xs, xs[0].platformName)).sort((a, b) => b.n - a.n);
  const trades = [...groupBy(landed, (r) => r.industry)].map(([key, xs]) => segment(key, TRADE_NAME(key), xs)).sort((a, b) => b.n - a.n);

  const findings: AnalystFinding[] = [];
  const add = (f: Omit<AnalystFinding, "confidence">) => findings.push({ ...f, confidence: conf(f.n) });

  if (!enough) {
    add({ id: "sample", tone: "info", title: `Not enough yet — ${fromAds.length} of the ${ANALYST_MIN_AD_VISITS} ad visits the analyst waits for`,
      evidence: `${landed.length} landing ${landed.length === 1 ? "visit" : "visits"} in the last ${days} days, ${fromAds.length} from ads, ${last24h} in the last 24 h.`,
      action: "Let the ads run; the reading starts on its own once there is something to read.", n: fromAds.length });
  }

  // The leak: the transition that loses the most of what reaches it.
  const steps: Array<{ from: string; to: string; a: number; b: number; key: string }> = [
    { key: "pressed", from: "landed", to: "pressed a button", a: n, b: pressed.length },
    { key: "form", from: "pressed a button", to: "opened the form", a: pressed.length, b: form.length },
    { key: "s2", from: "opened the form", to: "finished step 1 (account)", a: form.length, b: s2.length },
    { key: "s3", from: "step 2 (company)", to: "step 3 (plan)", a: s2.length, b: s3.length },
    { key: "attempted", from: "step 3 (plan)", to: "started a trial", a: s3.length, b: attempted.length },
    { key: "done", from: "started a trial", to: "signed up", a: attempted.length, b: done.length },
  ];
  const leak = steps.filter((t) => t.a >= 5).sort((x, y) => (x.b / x.a) - (y.b / y.a))[0] ?? null;

  if (enough) {
    add({ id: "funnel", tone: "info", title: `The funnel, last ${days} days`,
      evidence: `${n} landed from ads → ${pct(funnel[1].pct)} pressed a button → ${pct(funnel[2].pct)} opened the form → ${s2.length} reached the company step → ${s3.length} the plan → ${attempted.length} started → ${done.length} signed up.`,
      action: leak ? `The biggest leak is ${leak.from} → ${leak.to}: ${leak.a} reached it, ${leak.b} went on (${pct(leak.b / leak.a)}).` : "Too few reach the form to say where the sign-up leaks.", n });
  }

  // No signups at all.
  if (enough && n >= 30 && done.length === 0) {
    add({ id: "no-signups", tone: "bad", title: `No signups from ${n} ad visits`,
      evidence: `${pct(stats.bounce)} left the landing without a second page, ${pressed.length} pressed a button, ${form.length} opened the form, ${attempted.length} started a trial.`,
      action: leak ? `Fix the biggest leak first — ${leak.from} → ${leak.to} loses ${pct(1 - leak.b / leak.a)}.` : "Get people to the form first: a clear price and a 'free trial, no card' button in the first screen.", n });
  }

  // Bouncing.
  const bounce = stats.bounce ?? 0;
  if (enough && n >= 20 && bounce >= 0.45) {
    const fastShare = stats.fast ?? 0;
    const inAppBounce = share(base.filter((r) => r.inApp), (r) => r.bounced), browserBounce = share(base.filter((r) => !r.inApp), (r) => r.bounced);
    const quick = bounce > 0 && fastShare / bounce >= 0.5;
    add({ id: "bounce", tone: bounce >= 0.6 ? "bad" : "warn", title: `${pct(bounce)} of ad clicks leave the landing without a second page`,
      evidence: `${Math.round(bounce * n)} of ${n}; ${pct(fastShare)} of all visits were gone inside 5 seconds without scrolling${inAppBounce !== null && browserBounce !== null ? `; Facebook's in-app browser bounces ${pct(inAppBounce)} vs ${pct(browserBounce)} in a real browser` : ""}. Median time on the landing ${secs(stats.dwellMedian)}.`,
      action: quick ? "Most of these never looked: accidental taps or a slow first screen in the in-app browser. Optimise the ad set for landing-page views (not link clicks), keep the first screen light, and check the hero loads under 2 s on 4G."
        : "They looked and left: the ad's promise is not in the first screen. Put the ad's exact claim, the trade, the price and 'free trial, no card' in the hero, above the fold.", n });
  }

  // Scrolling but not far.
  const scrolls = base.filter((r) => r.scroll !== null);
  if (enough && scrolls.length >= 20 && (stats.scrollMedian ?? 1) < 0.35 && bounce < 0.6) {
    const pricing = sections.find((s) => s.key === "pricing");
    add({ id: "scroll", tone: "warn", title: `Half of them stop before ${pct(stats.scrollMedian)} of the page`,
      evidence: `Median deepest scroll ${pct(stats.scrollMedian)} over ${scrolls.length} visits${pricing?.reach !== null && pricing?.reach !== undefined ? `; only ${pct(pricing.reach)} reach the pricing` : ""}.`,
      action: "Bring the price and a sign-up button into the first two screens; the pricing section is too far down to be seen.", n: scrolls.length });
  }

  // The section where they leave.
  if (measured.length >= 20) {
    const shown = sections.filter((s) => s.reach !== null && s.reach > 0);
    let cliff: { at: typeof shown[0]; next: typeof shown[0]; drop: number } | null = null;
    for (let i = 0; i + 1 < shown.length; i++) {
      const a = shown[i], b = shown[i + 1];
      if ((a.reach ?? 0) < 0.3) continue;
      const drop = (a.reach ?? 0) - (b.reach ?? 0);
      if (drop >= 0.25 && (!cliff || drop > cliff.drop)) cliff = { at: a, next: b, drop };
    }
    if (cliff) add({ id: "cliff", tone: "warn", title: `They leave at «${cliff.at.label}»`,
      evidence: `${pct(cliff.at.reach)} of ${measured.length} measured visits reach «${cliff.at.label}», ${pct(cliff.next.reach)} reach the next section («${cliff.next.label}»).`,
      action: `Shorten «${cliff.at.label}» or move what matters below it («${cliff.next.label}») above it — and put a sign-up button right there, at the point where they stop.`, n: measured.length });
  }

  // Reading, not pressing.
  const engaged = share(base, (r) => r.engaged) ?? 0, ctaRate = funnel[1].pct ?? 0;
  if (enough && n >= 30 && engaged >= 0.4 && ctaRate <= 0.08) {
    const top = placements.slice(0, 2).map((p) => `${p.placement} (${p.n})`).join(", ");
    add({ id: "reading", tone: "warn", title: "They read, but they don't press",
      evidence: `${pct(engaged)} stay 30 s or scroll past half the page; only ${pct(ctaRate)} press any button${top ? ` — the presses: ${top}` : ""}.`,
      action: "The offer is not clear enough to act on: say the price and 'free trial, no card needed' on the hero button itself, and repeat that button after the estimator section.", n });
  }

  // Pressed, never saw the form.
  if (pressed.length >= 10) {
    const lost = pressed.filter((r) => !r.form).length, lostShare = lost / pressed.length;
    if (lostShare >= 0.25) add({ id: "leak", tone: "warn", title: `${pct(lostShare)} press a button but never see the form`,
      evidence: `${lost} of ${pressed.length} who pressed a sign-up button have no form view${share(pressed.filter((r) => !r.form), (r) => r.inApp) !== null ? ` — ${pct(share(pressed.filter((r) => !r.form), (r) => r.inApp))} of them in the in-app browser` : ""}.`,
      action: "The form page loads too slowly after the tap (worst in Facebook's browser). Preload /auth/register from the landing, or open the first step in a sheet on the landing itself.", n: pressed.length });
  }

  // Where the sign-up leaks.
  if (s1.length >= 10) {
    const trans = [
      { from: 1, to: 2, a: s1.length, b: s2.length, action: "Step 1 asks for name, email and two passwords, and the Google button is hidden inside Facebook's browser. Ask for the email alone first; set the password after the trial starts. (Step-1 errors — 'email already registered' — are not tracked yet.)" },
      { from: 2, to: 3, a: s2.length, b: s3.length, action: "Step 2 wants the business name, the address and the trades, all required. Make the company step optional — ask inside the app on the first proposal — or keep only the business name." },
      { from: 3, to: 4, a: s3.length, b: attempted.length, action: "The plan sheet stops them. Pre-select the plan the ad promised, and say 'Start free trial · no card' on the button; show the price per month next to it." },
    ].filter((t) => t.a >= 8).map((t) => ({ ...t, loss: 1 - t.b / t.a })).sort((x, y) => y.loss - x.loss);
    const worst = trans[0];
    if (worst && worst.loss >= 0.4) add({ id: "step", tone: worst.loss >= 0.6 ? "bad" : "warn",
      title: `${STEP_NAMES[worst.from]} loses ${pct(worst.loss)} of the people who reach it`,
      evidence: `${worst.a} reached ${STEP_NAMES[worst.from]}, ${worst.b} went on to ${worst.to === 4 ? "a trial or checkout" : STEP_NAMES[worst.to]}.`, action: worst.action, n: worst.a });
    const errs = new Map<string, number>();
    for (const r of base) for (const e of r.errors) errs.set(e, (errs.get(e) ?? 0) + 1);
    const errList = [...errs].sort((a, b) => b[1] - a[1]);
    if (errList.length && errList[0][1] >= 3) add({ id: "errors", tone: "warn", title: `The plan step failed ${errList.reduce((a, [, c]) => a + c, 0)} times`,
      evidence: errList.map(([k, c]) => `${k.replace(/_/g, " ")} × ${c}`).join(", ") + ".", action: "Checkout or trial requests were refused: check the Stripe keys and the rate limit on /api/checkout/signup, and show the reason on the page instead of a generic error.", n: s3.length });
  }
  // Started, never finished (the e-mail confirmation).
  if (attempted.length >= 8 && done.length / attempted.length <= 0.5) {
    const cardless = attempted.filter((r) => r.cardless > 0).length;
    add({ id: "confirm", tone: "warn", title: `${attempted.length - done.length} of ${attempted.length} who started a trial never finished`,
      evidence: cardless >= attempted.length / 2 ? `${cardless} started a card-less trial, which needs the confirmation e-mail to be opened; ${done.length} did.` : `${done.length} of ${attempted.length} checkouts completed.`,
      action: cardless >= attempted.length / 2 ? "The confirmation e-mail is the leak: confirm on the page (a 6-digit code) instead of a link, resend after a minute, and check the e-mail is not landing in spam." : "Stripe's checkout loses them: offer the card-less trial first, card later.", n: attempted.length });
  }

  // Facebook's in-app browser vs a real one.
  const inApp = base.filter((r) => r.inApp), browser = base.filter((r) => !r.inApp);
  if (inApp.length >= 12 && browser.length >= 12) {
    const a = share(inApp, (r) => r.form) ?? 0, b = share(browser, (r) => r.form) ?? 0;
    if (b > 0 && a <= b * 0.5) add({ id: "in-app", tone: "warn", title: "Facebook's in-app browser converts half as well",
      evidence: `${pct(a)} of ${inApp.length} in-app visits open the form vs ${pct(b)} of ${browser.length} in a real browser; ${pct(stats.inApp)} of ad visits arrive in-app.`,
      action: "Keep the landing light for the in-app browser (it is slower and hides Google sign-up): email-first sign-up, no autoplay video in the hero, and the 'Open in browser' hint on the form.", n: inApp.length + browser.length });
  }

  // Ad against ad.
  const ranked = ads.filter((a) => a.n >= SEGMENT_MIN);
  if (ranked.length >= 2) {
    const byForm = [...ranked].sort((x, y) => (y.form ?? 0) - (x.form ?? 0));
    const best = byForm[0], worst = byForm[byForm.length - 1];
    if ((best.form ?? 0) >= 2 * (worst.form ?? 0) && (best.form ?? 0) > 0) add({ id: "ads", tone: "info", title: `«${best.name}» gets people to the form; «${worst.name}» does not`,
      evidence: `${best.name}: ${pct(best.form)} open the form, ${pct(best.bounce)} bounce (${best.n} visits). ${worst.name}: ${pct(worst.form)} and ${pct(worst.bounce)} (${worst.n} visits).`,
      action: `Move budget to «${best.name}». For «${worst.name}», change the audience or the first three seconds of the creative — its clicks are not the people the landing is for.`, about: worst.name, n: best.n + worst.n });
    for (const a of ranked) {
      const xs = fromAds.filter((r) => r.adKey === a.key);
      const eng = share(xs, (r) => r.engaged) ?? 0;
      // Readers (they stay, they scroll, they never open the form) and
      // bouncers (gone without a look) are different ads with different fixes.
      if (xs.length >= 12 && eng >= 0.5 && (a.form ?? 0) <= 0.06) add({ id: `readers-${a.key}`, tone: "warn", title: `«${a.name}» brings readers, not sign-ups`,
        evidence: `${pct(eng)} of its ${xs.length} visits read the page, ${pct(a.form)} open the form.`, action: "The ad's audience is curious, not buying: make the ad's offer the landing's first line, and add the price. If the ad targets homeowners, retarget to contractors.", about: a.name, n: xs.length });
      else if (xs.length >= 12 && eng < 0.5 && (a.bounce ?? 0) >= 0.75) add({ id: `bounce-${a.key}`, tone: "warn", title: `«${a.name}»: ${pct(a.bounce)} leave without pressing anything`,
        evidence: `${Math.round((a.bounce ?? 0) * xs.length)} of ${xs.length} clicks; ${pct(share(xs, (r) => r.fast))} gone inside 5 s; median ${secs(median(xs.map((r) => r.dwell).filter((x): x is number => x !== null)))} on the page.`, action: "Pause it or swap the creative: the click does not match what the landing shows. Check the ad's landing URL carries the right ?industry=.", about: a.name, n: xs.length });
    }
  }

  // Trade landing against trade landing.
  const tr = trades.filter((t) => t.n >= SEGMENT_MIN);
  if (tr.length >= 2) {
    const byForm = [...tr].sort((x, y) => (y.form ?? 0) - (x.form ?? 0));
    const best = byForm[0], worst = byForm[byForm.length - 1];
    if ((best.form ?? 0) >= 2 * (worst.form ?? 0) && (best.form ?? 0) > 0) add({ id: "trades", tone: "info", title: `${best.name[0].toUpperCase()}${best.name.slice(1)} converts, ${worst.name} does not`,
      evidence: `${best.name}: ${pct(best.form)} open the form (${best.n} visits). ${worst.name}: ${pct(worst.form)} (${worst.n} visits).`,
      action: `Read ${worst.name}'s hero against the ad that sends people there — the words, the picture and the price should match the ad; copy what ${best.name} does.`, about: worst.name, n: best.n + worst.n });
  }

  // Phone against desktop.
  const phone = base.filter((r) => /mobile/i.test(r.device)), desk = base.filter((r) => /desktop/i.test(r.device));
  if (phone.length >= 12 && desk.length >= 12) {
    const a = share(phone, (r) => r.form) ?? 0, b = share(desk, (r) => r.form) ?? 0;
    if (b >= 2 * a && b > 0) add({ id: "device", tone: "info", title: "Desktops sign up, phones don't",
      evidence: `${pct(b)} of ${desk.length} desktop visits open the form vs ${pct(a)} of ${phone.length} on phones — and ${pct(phone.length / n)} of ad visits are phones.`,
      action: "The form is a phone form now: one field per screen, big buttons, the keyboard type right (email, phone). Or run the ads to desktop placements until it is.", n: phone.length + desk.length });
  }

  // The hour of the day.
  if (n >= 60) {
    const buckets = [["night", 0, 6], ["morning", 6, 12], ["afternoon", 12, 18], ["evening", 18, 24]] as const;
    const rows = buckets.map(([name, a, b]) => { const xs = base.filter((r) => r.hour >= a && r.hour < b); return { name, n: xs.length, bounce: share(xs, (r) => r.bounced) ?? 0, form: share(xs, (r) => r.form) ?? 0 }; }).filter((r) => r.n >= 12);
    if (rows.length >= 2) {
      const byBounce = [...rows].sort((x, y) => x.bounce - y.bounce);
      const best = byBounce[0], worst = byBounce[byBounce.length - 1];
      if (worst.bounce >= 1.4 * best.bounce && worst.bounce - best.bounce >= 0.15) add({ id: "hours", tone: "info", title: `${worst.name[0].toUpperCase()}${worst.name.slice(1)} clicks bounce more`,
        evidence: `${pct(worst.bounce)} bounce in the ${worst.name} (${worst.n} visits) vs ${pct(best.bounce)} in the ${best.name} (${best.n}).`,
        action: `Day-part the ad set: cut the ${worst.name} hours, or give them a lighter creative; keep the ${best.name}.`, n: worst.n + best.n });
    }
  }

  // Good news is news too.
  if (enough && done.length >= 3 && done.length / n >= 0.03) {
    const bestAd = ads.filter((a) => a.n >= SEGMENT_MIN).sort((x, y) => y.completed - x.completed)[0];
    add({ id: "good", tone: "good", title: `${done.length} signed up — ${pct(done.length / n, 1)} of ad visits`,
      evidence: `${people(done.length)} completed a verified sign-up in the last ${days} days${bestAd && bestAd.completed > 0 ? `; «${bestAd.name}» brought ${bestAd.completed} of them` : ""}.`,
      action: bestAd && bestAd.completed > 0 ? `Scale «${bestAd.name}» before anything else.` : "Keep the ads running; the landing is converting.", n });
  }

  const order: Record<AnalystFinding["tone"], number> = { bad: 0, warn: 1, good: 2, info: 3 };
  findings.sort((a, b) => order[a.tone] - order[b.tone] || b.n - a.n);

  // One line of what is going on.
  let headline: string;
  if (!landed.length) headline = `Nobody has landed in the last ${days} days.`;
  else if (!enough) headline = `${landed.length} landing ${landed.length === 1 ? "visit" : "visits"} in the last ${days} days, ${fromAds.length} from ads — the analyst starts reading at ${ANALYST_MIN_AD_VISITS} ad visits.`;
  else {
    const top = findings.find((f) => f.tone === "bad" || f.tone === "warn");
    headline = `In the last ${days} days ${n} people landed from ads: ${pct(stats.bounce)} left without pressing anything, ${pct(funnel[1].pct)} pressed a button, ${pct(funnel[2].pct)} opened the form, ${done.length} signed up.${top ? ` The thing to fix: ${top.title.replace(/^./, (c) => c.toLowerCase())}.` : done.length ? " Nothing is broken; scale what works." : ""}`;
  }

  return {
    days,
    sample: { sessions: all.length, landed: landed.length, fromAds: fromAds.length, last24h, measured: measured.length, enough, needed: ANALYST_MIN_AD_VISITS, basis },
    headline, findings, funnel, sections, ads: ads.slice(0, 12), trades: trades.slice(0, 8), placements: placements.slice(0, 8), stats,
  };
}

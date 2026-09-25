// TRIAL WATCH (2026-09-24) — pure.
//
// Owner: "can we track and check if people on a free trial are trying to
// copy our features by doing screenshots of pages?" A web page cannot see a
// screenshot. What it can see is how an account behaves, and a copier
// behaves unlike a contractor: it opens every screen, every settings pane and
// every estimator, and never creates anything — a real company makes a
// client and a proposal in its first sitting. So:
//
//   routePattern   a page view is the route pattern ("/dashboard/jobs/*"),
//                  never the id or the query string;
//   sessionsOf     views split into sittings at a 30-minute gap;
//   scoreTrial     the signals, each a sentence with a weight, summed into a
//                  score and a level — suspicious, watch, or clear. Work
//                  (proposals sent, jobs scheduled) counts against.
//   watermarkText  the faint text tiled over every screen of an unpaid
//   watermarkDataUri account, so a leaked screenshot names the account.
//
// No database, no framework: the admin loader feeds it rows and the QA runs
// it on made-up ones.

/** Page views are recorded for a company's first weeks — that is when a tour tells. */
export const WATCH_DAYS = 45;
/** The admin list covers companies signed up within this many days. */
export const TRIAL_WINDOW_DAYS = 60;
/** A pause longer than this starts a new sitting. */
export const SESSION_GAP_MIN = 30;

const SIGNED_IN_PREFIXES = ["/dashboard", "/mobile-", "/trade-services", "/v3"];
const ID_SEGMENT = /^(?:c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d+)$/i;

/** The route a page view is filed under: ids collapsed to "*", the query dropped, six segments at most. */
export function routePattern(pathname: string): string | null {
  const path = (pathname || "").split(/[?#]/)[0].trim();
  if (!path.startsWith("/") || !SIGNED_IN_PREFIXES.some((p) => path.startsWith(p))) return null;
  const parts = path
    .split("/")
    .filter(Boolean)
    .slice(0, 6)
    .map((seg) => (ID_SEGMENT.test(seg) || seg.length > 24 ? "*" : seg.toLowerCase()));
  return `/${parts.join("/")}`.slice(0, 120);
}

export type ViewIn = { route: string; at: string; userId?: string | null; ipHash?: string | null; uaHash?: string | null };

export type Session = { start: string; end: string; minutes: number; routes: string[]; views: number };

/** Views split into sittings; a gap longer than SESSION_GAP_MIN starts a new one. */
export function sessionsOf(views: readonly ViewIn[]): Session[] {
  const sorted = [...views].filter((v) => Number.isFinite(Date.parse(v.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const out: Session[] = [];
  let cur: { start: number; end: number; routes: Set<string>; views: number } | null = null;
  for (const v of sorted) {
    const t = Date.parse(v.at);
    if (!cur || t - cur.end > SESSION_GAP_MIN * 60_000) {
      if (cur) out.push(close(cur));
      cur = { start: t, end: t, routes: new Set([v.route]), views: 1 };
    } else {
      cur.end = t;
      cur.routes.add(v.route);
      cur.views++;
    }
  }
  if (cur) out.push(close(cur));
  return out;
  function close(c: { start: number; end: number; routes: Set<string>; views: number }): Session {
    return { start: new Date(c.start).toISOString(), end: new Date(c.end).toISOString(), minutes: Math.max(1, Math.round((c.end - c.start) / 60_000)), routes: [...c.routes], views: c.views };
  }
}

/** Software companies whose people sign up to look, not to roof. Matched on the email domain. */
const COMPETITOR_WORDS = /(^|[.-])(jobber|getjobber|housecall|housecallpro|servicetitan|buildertrend|contractorforeman|fieldpulse|workiz|acculynx|jobnimbus|companycam|roofr|roofle|roofsnap|sumoquote|leaptodigital|buildxact|arborgold|fieldedge|successware|serviceminder|simpro|tradify|knowify|projul|coconstruct|estimaterocket|clearestimates|kickserv|mhelpdesk|thryv|joist|procore|zuper|fergus|angi|thumbtack|homeadvisor|networx|craftjack|houzz|hover|eagleview|xactware|verisk|smartspace)([.-]|$)/i;

export function domainOf(email: string | null | undefined): string | null {
  const at = (email ?? "").trim().toLowerCase().lastIndexOf("@");
  return at > 0 ? (email as string).trim().toLowerCase().slice(at + 1) : null;
}

export function isCompetitorDomain(domain: string | null | undefined): boolean {
  return !!domain && COMPETITOR_WORDS.test(domain);
}

const TEST_NAME = /\b(test|testing|demo|sample|fake|example|asdf|qwerty|xyz|abc|foo|bar|temp|trial|acme)\b/i;

export type TrialIn = {
  id: string;
  name: string;
  createdAt: string;
  plan: string;
  status: string;
  trialEndsAt: string | null;
  ownerEmail: string | null;
  /** Every member's email — one competitor address is enough. */
  emails: string[];
  views: ViewIn[];
  records: { clients: number; proposals: number; sent: number; jobs: number; leads: number };
  /** Other trials in the window seen on the same device and address. */
  sharedDeviceTrials: number;
};

export type Signal = { code: "toured" | "wide" | "raced" | "competitor" | "shared-device" | "test-name" | "working"; text: string; weight: number };
export type TrialLevel = "suspicious" | "watch" | "clear";

export type TrialAssessment = {
  id: string;
  name: string;
  createdAt: string;
  plan: string;
  status: string;
  trialEndsAt: string | null;
  ownerEmail: string | null;
  domain: string | null;
  views: number;
  distinctRoutes: number;
  routes: string[];
  sessions: number;
  minutesActive: number;
  firstSeen: string | null;
  lastSeen: string | null;
  records: TrialIn["records"];
  /** clients + proposals + jobs + leads. */
  writes: number;
  score: number;
  level: TrialLevel;
  signals: Signal[];
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The signals, the score and the level for one account. */
export function scoreTrial(t: TrialIn): TrialAssessment {
  const sessions = sessionsOf(t.views);
  const routeCount = new Map<string, number>();
  for (const v of t.views) routeCount.set(v.route, (routeCount.get(v.route) ?? 0) + 1);
  const routes = [...routeCount.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  const distinct = routes.length;
  const r = t.records;
  const writes = r.clients + r.proposals + r.jobs + r.leads;
  const signals: Signal[] = [];

  if (distinct >= 12 && writes === 0) signals.push({ code: "toured", weight: 40, text: `Opened ${distinct} different screens and created nothing` });
  else if (distinct >= 8 && distinct / (1 + writes) >= 6) signals.push({ code: "wide", weight: 25, text: `Browsed ${distinct} screens for ${plural(writes, "record")} made` });

  const race = sessions.filter((s) => s.routes.length >= 15 && s.minutes <= 30).sort((a, b) => b.routes.length - a.routes.length)[0];
  if (race) signals.push({ code: "raced", weight: 20, text: `${race.routes.length} screens in ${plural(race.minutes, "minute")}` });

  const hit = t.emails.map(domainOf).find((d) => isCompetitorDomain(d));
  if (hit) signals.push({ code: "competitor", weight: 45, text: `Signed up from ${hit}` });

  if (t.sharedDeviceTrials > 0) signals.push({ code: "shared-device", weight: 25, text: `Same device and address as ${plural(t.sharedDeviceTrials, "other trial")}` });

  if (TEST_NAME.test(t.name) || t.name.trim().length < 3) signals.push({ code: "test-name", weight: 10, text: `Company named “${t.name.trim() || "—"}”` });

  if (r.sent > 0) signals.push({ code: "working", weight: -30, text: `Sent ${plural(r.sent, "proposal")} to clients` });
  else if (r.jobs > 0) signals.push({ code: "working", weight: -20, text: `Scheduled ${plural(r.jobs, "job")}` });
  else if (writes >= 3) signals.push({ code: "working", weight: -15, text: `Created ${plural(writes, "record")}` });

  const score = Math.max(0, Math.min(100, signals.reduce((n, s) => n + s.weight, 0)));
  const level: TrialLevel = score >= 60 ? "suspicious" : score >= 30 ? "watch" : "clear";
  const sorted = [...t.views].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return {
    id: t.id,
    name: t.name,
    createdAt: t.createdAt,
    plan: t.plan,
    status: t.status,
    trialEndsAt: t.trialEndsAt,
    ownerEmail: t.ownerEmail,
    domain: domainOf(t.ownerEmail),
    views: t.views.length,
    distinctRoutes: distinct,
    routes,
    sessions: sessions.length,
    minutesActive: sessions.reduce((n, s) => n + s.minutes, 0),
    firstSeen: sorted[0]?.at ?? null,
    lastSeen: sorted[sorted.length - 1]?.at ?? null,
    records: r,
    writes,
    score,
    level,
    signals: signals.sort((a, b) => b.weight - a.weight),
  };
}

/** Highest score first; among equals the newest company. */
export function sortAssessments(rows: readonly TrialAssessment[]): TrialAssessment[] {
  return [...rows].sort((a, b) => b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// ── the watermark ──────────────────────────────────────────────────────────

/** "Trial · Ridgeline Roofing · alex@ridgeline.test · Sep 24, 2026" — tiled faintly over every screen of an unpaid account. */
export function watermarkText(input: { status: string | null | undefined; org: string; email: string; date?: Date }): string {
  const kind = input.status === "TRIALING" ? "Trial" : "Free plan";
  const when = (input.date ?? new Date()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return [kind, input.org.trim(), input.email.trim(), when].filter(Boolean).join(" · ");
}

const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c);

/** One tile of the watermark as an SVG data URI for a CSS background — the text twice, offset, rotated. */
export function watermarkDataUri(text: string): string {
  const t = escapeXml(text.slice(0, 120));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='460' height='280'><g fill='rgba(10,10,10,0.085)' font-family='ui-monospace,Menlo,monospace' font-size='12.5' font-weight='600'><text transform='translate(24 170) rotate(-24)'>${t}</text><text transform='translate(254 300) rotate(-24)'>${t}</text></g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

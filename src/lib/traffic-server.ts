import type { ExperimentResult, StageVisitor, StageVisitorsReport, TrafficBreakdown, TrafficDaily, TrafficFilters, TrafficReport, TrafficTotals } from "./traffic-contract";
import { buildExperimentsQuery, buildStageVisitorsQuery, buildTrafficQueries, funnelStages, shiftDate } from "./traffic-query";
import { buildLiveQuery, buildLiveTotalsQuery, liveEventFromRow, liveHeadline, liveTotalsFromRow, minutesIntoDay, shapeLive, type FreshSignup, type LiveEvent, type LiveReport, type LiveTotalsPair } from "./traffic-live";

/** The last half hour of events, one PostHog query, shared by every admin
 *  looking for LIVE_CACHE_MS — the query endpoint's budget is small, and the
 *  panel polls. */
const LIVE_CACHE_MS = 25_000;
/** Live mode polls every 15 s, so its answers may be at most this stale —
 *  otherwise the cache would hand back the same rows twice and the panel
 *  would tick without moving. Still shared: two admins watching cost one
 *  query between them. */
const LIVE_FAST_CACHE_MS = 12_000;
let liveEvents: { at: number; promise: Promise<LiveEvent[]> } | null = null;
export async function fetchLiveEvents(maxAgeMs = LIVE_CACHE_MS): Promise<LiveEvent[]> {
  const now = Date.now();
  const age = Math.max(LIVE_FAST_CACHE_MS, Math.min(LIVE_CACHE_MS, maxAgeMs));
  if (liveEvents && now - liveEvents.at < age) return liveEvents.promise;
  const promise = runTrafficQuery(buildLiveQuery(), "live").then((rows) => rows.map(liveEventFromRow).filter((e): e is LiveEvent => !!e));
  promise.catch(() => { if (liveEvents?.promise === promise) liveEvents = null; });
  liveEvents = { at: now, promise };
  return promise;
}

/** The site-wide totals (all-time, today, this time yesterday, seven days).
 *  A far longer cache than the window above on purpose: the query reads every
 *  event in the project, and an all-time count does not move while someone
 *  watches a 15-second ticker. Keyed by timezone, because "today" is. */
const LIVE_TOTALS_CACHE_MS = 5 * 60_000;
const liveTotals = new Map<string, { at: number; promise: Promise<LiveTotalsPair> }>();
export async function fetchLiveTotals(timezone: string, fullHistory = false): Promise<LiveTotalsPair> {
  const key = `${timezone || "UTC"}|${fullHistory ? "full" : "since"}`;
  const now = Date.now();
  const hit = liveTotals.get(key);
  if (hit && now - hit.at < LIVE_TOTALS_CACHE_MS) return hit.promise;
  const promise = runTrafficQuery(buildLiveTotalsQuery(timezone || "UTC", fullHistory), "live totals").then((rows) => liveTotalsFromRow(Array.isArray(rows[0]) ? rows[0] : []));
  promise.catch(() => { if (liveTotals.get(key)?.promise === promise) liveTotals.delete(key); });
  liveTotals.set(key, { at: now, promise });
  return promise;
}

/** The live report: the window's visitors shaped with the day's signups. */
export async function getLiveTraffic(signups: FreshSignup[], opts: { includeDevelopment?: boolean; timezone?: string; fast?: boolean; fullHistory?: boolean } = {}): Promise<LiveReport> {
  const fetchedAt = new Date().toISOString();
  try {
    if (!posthogApiConfig()) return { ...shapeLive([], signups, Date.now(), opts), status: "disabled", message: "Connect a PostHog personal key with query:read and a numeric project ID.", fetchedAt };
  } catch (err) { return { ...shapeLive([], signups, Date.now(), opts), status: "error", message: (err as Error).message, fetchedAt }; }
  try {
    // The totals must never take the live view down with them: a failure
    // there leaves the window intact and the panel simply prints no totals.
    const [events, pair] = await Promise.all([
      fetchLiveEvents(opts.fast ? LIVE_FAST_CACHE_MS : LIVE_CACHE_MS),
      fetchLiveTotals(opts.timezone || "UTC", !!opts.fullHistory).catch(() => null),
    ]);
    const totals = pair ? (opts.includeDevelopment ? pair.all : pair.production) : null;
    const shaped = shapeLive(events, signups, Date.now(), opts);
    const dayAgeMinutes = minutesIntoDay(opts.timezone || "UTC");
    // The busiest platform of the window, for the sentence.
    const top = [...shaped.platforms].sort((a, b) => b.visitors - a.visitors)[0];
    const headline = liveHeadline({
      onSite: shaped.counts.onSite,
      fromAds: shaped.counts.fromAds,
      signingUp: shaped.counts.signingUp,
      windowVisitors: shaped.visitors.length,
      windowMinutes: shaped.windowMinutes,
      todayVisitors: totals ? totals.today : null,
      todaySignups: shaped.today.signups,
      yesterdaySoFar: totals ? totals.yesterdaySoFar : null,
      yesterdayTotal: totals ? totals.yesterday : null,
      dayAgeMinutes,
      topPlatform: top && top.visitors > 0 ? { name: top.name, visitors: top.visitors } : null,
    });
    return { ...shaped, totals, dayAgeMinutes, headline, status: "ok", fetchedAt };
  } catch (err) {
    const msg = err instanceof Error && err.name === "TimeoutError" ? "PostHog took too long. Try again shortly." : err instanceof Error ? err.message : "Live view unavailable.";
    return { ...shapeLive([], signups, Date.now(), opts), status: "error", message: msg, fetchedAt };
  }
}

type Rows = unknown[][];
const cache = new Map<string, { at: number; promise: Promise<TrafficReport> }>();
const numeric = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0;
const daily = (r: unknown[]): TrafficDaily => ({ people: numeric(r[0]), inAppVisitors: numeric(r[1]), inAppPeople: numeric(r[2]), adsFb: numeric(r[3]), adsIg: numeric(r[4]), adsAn: numeric(r[5]), adsFbclid: numeric(r[6]), adsAny: numeric(r[7]) });
const totals = (r: unknown[]): TrafficTotals => ({ visitors: numeric(r[0]), newVisitors: numeric(r[1]), returningVisitors: numeric(r[2]), repeatVisitors: numeric(r[3]), sessions: numeric(r[4]), pageviews: numeric(r[5]) });

export function posthogApiConfig() {
  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").trim().replace(/\/+$/, "");
  // A local stand may answer as PostHog (a fixture server) — never production.
  const local = process.env.NODE_ENV !== "production" && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  if (!local && !["https://us.posthog.com", "https://eu.posthog.com"].includes(host)) throw new Error("POSTHOG_HOST must be https://us.posthog.com or https://eu.posthog.com.");
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const id = process.env.POSTHOG_PROJECT_ID?.trim();
  if (!key || !id) return null;
  if (!/^\d+$/.test(id)) throw new Error("POSTHOG_PROJECT_ID must be numeric.");
  return { host, key, id };
}

export async function runTrafficQuery(sql: string, name: string): Promise<Rows> {
  const config = posthogApiConfig();
  if (!config) throw new Error("Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID.");
  const response = await fetch(`${config.host}/api/projects/${config.id}/query/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ name: `JobFlex traffic / ${name}`, query: { kind: "HogQLQuery", query: sql }, refresh: "blocking" }),
    cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // Upstream bodies may contain SQL, identifiers or credentials. Keep them server-side.
    throw new Error(response.status === 401 || response.status === 403 ? "PostHog denied access. Check the project ID and query:read permission."
      : response.status === 429 ? "PostHog query limit reached. Try again shortly."
      : `PostHog query failed (HTTP ${response.status}).`);
  }
  const body = await response.json();
  if (!Array.isArray(body.results)) throw new Error("PostHog has not returned a completed result yet.");
  return body.results;
}

export function emptyTrafficReport(filters: TrafficFilters): TrafficReport {
  return { filters, fetchedAt: new Date().toISOString(), status: "ok", errors: [], totals: null, previous: null,
    lifetime: null, today: null, firstTrackedAt: null, firstStepAt: null, people: null, points: [], pages: [], sources: [],
    referrers: [], campaigns: [], devices: [], browsers: [], countries: [], terms: [], hosts: [], funnel: [], funnelOutcomes: null, experiments: [], variants: [] };
}

async function loadReport(filters: TrafficFilters): Promise<TrafficReport> {
  const report = emptyTrafficReport(filters);
  try {
    if (!posthogApiConfig()) return { ...report, status: "disabled", message: "Connect a PostHog personal key with query:read and a numeric project ID." };
  } catch (err) { return { ...report, status: "error", message: (err as Error).message }; }
  const queries = Object.entries(buildTrafficQueries(filters));
  const results: Record<string, Rows> = {};
  // Bound concurrency to avoid saturating the upstream project's query slots.
  // Two at a time: the live panel's two queries run beside these on a page
  // load, and at three PostHog queued one of them for nine seconds
  // (measured 2026-10-01). Six queries now (lifetime folded into the
  // overview, the A/B bench on its tab) — three rounds, not five.
  for (let i = 0; i < queries.length; i += QUERY_CONCURRENCY) {
    await Promise.all(queries.slice(i, i + QUERY_CONCURRENCY).map(async ([name, sql]) => {
      try { results[name] = await runTrafficQuery(sql, name); }
      catch (err) {
        const msg = err instanceof Error && err.name === "TimeoutError" ? "Query timed out. Narrow the date range." : err instanceof Error ? err.message : "Query unavailable.";
        report.errors.push(`${name}: ${msg}`);
      }
    }));
  }
  if (results.overview) {
    const current = results.overview.find(r => r[0] === "current");
    const previous = results.overview.find(r => r[0] === "previous");
    report.totals = current ? totals(current.slice(1)) : null;
    report.previous = previous ? totals(previous.slice(1)) : null;
    const people = results.overview.find(r => r[0] === "people");
    report.people = people ? { people: numeric(people[1]), inAppVisitors: numeric(people[2]), inAppPeople: numeric(people[3]) } : null;
    // Coverage: the first pageview and the first registration step, as Unix seconds (0 = none).
    const coverage = results.overview.find(r => r[0] === "coverage");
    const iso = (v: unknown) => (numeric(v) > 0 ? new Date(numeric(v) * 1000).toISOString() : null);
    report.firstTrackedAt = coverage ? iso(coverage[1]) : null;
    report.firstStepAt = coverage ? iso(coverage[2]) : null;
  }
  // ONE ALL-TIME FIGURE (2026-10-01). The header's "All-time visitors" and
  // "Today" are the live panel's totals — the same query, the same cached
  // answer — so the two can no longer print 11,706 and 11,702 side by side
  // (two queries, two rules, two cache ages). The localhost-only scope keeps
  // its own count; the pair has no column for it.
  if (filters.environment !== "development") {
    try {
      const pair = await fetchLiveTotals(filters.timezone, filters.fullHistory);
      const t = filters.environment === "all" ? pair.all : pair.production;
      report.lifetime = t.allTime; report.today = t.today;
    } catch { /* the report's own count stands */ }
  }
  if (results.trend) {
    const days = new Map(results.trend.map(r => [String(r[0]), { ...totals(r.slice(1)), ...daily(r.slice(7)) }]));
    for (let date = filters.from; date <= filters.to; date = shiftDate(date, 1)) report.points.push({ date, ...(days.get(date) || { ...totals([]), ...daily([]) }) });
  }
  report.pages = (results.pages || []).map(r => ({ page: String(r[0]), ...totals(r.slice(1)) }));
  for (const r of results.breakdowns || []) {
    const key = String(r[0]);
    if (["sources", "referrers", "campaigns", "devices", "browsers", "countries", "terms", "hosts"].includes(key)) {
      (report[key as "sources"] as TrafficBreakdown[]).push({ name: String(r[1]), visitors: numeric(r[2]), sessions: numeric(r[3]), conversions: numeric(r[4]) });
    }
  }
  const stages = funnelStages(filters);
  report.funnel = results.funnel?.[0] ? stages.map(({ id, label }, i) => ({ id, label, visitors: numeric(results.funnel[0][i]) })) : [];
  if (results.funnel?.[0]) {
    const row = results.funnel[0].slice(stages.length);
    report.funnelOutcomes = { trials: numeric(row[0]), purchases: numeric(row[1]), other: numeric(row[2]), trialAttempts: numeric(row[3]), purchaseAttempts: numeric(row[4]) };
  }
  report.variants = (results.variants || []).map(r => ({ variant: String(r[0]) === "e" ? "e" as const : "d" as const, started: numeric(r[1]), completed: numeric(r[2]) }));
  report.experiments = (results.experiments || []).map(r => ({ experiment: String(r[0]), variant: String(r[1]), visitors: numeric(r[2]), attempts: numeric(r[3]), completed: numeric(r[4]), mixedVisitors: numeric(r[5]) }));
  if (!report.totals) { report.status = "error"; report.message = report.errors[0] || "Traffic is unavailable."; }
  return report;
}

/** STALE WHILE REVALIDATE (2026-10-01). A report younger than a minute is
 *  served as is; up to half an hour old it is served AT ONCE and refreshed
 *  behind it, so the page never waits on PostHog for a figure it showed a
 *  minute ago (the header says when it was fetched). Older, or an answer that
 *  failed, waits for a fresh one. */
const REPORT_FRESH_MS = 60_000;
const REPORT_STALE_MS = 30 * 60_000;
const QUERY_CONCURRENCY = 2;
const refreshing = new Set<string>();
export async function getTrafficReport(filters: TrafficFilters): Promise<TrafficReport> {
  const cacheKey = JSON.stringify([process.env.POSTHOG_PROJECT_ID, process.env.POSTHOG_HOST, filters]);
  const hit = cache.get(cacheKey);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < REPORT_FRESH_MS) return hit.promise;
  if (hit && age < REPORT_STALE_MS) {
    const served = await hit.promise;
    if (served.status === "ok" && !served.errors.length) {
      if (!refreshing.has(cacheKey)) {
        refreshing.add(cacheKey);
        void loadReport(filters).then((fresh) => { if (fresh.status === "ok") cache.set(cacheKey, { at: Date.now(), promise: Promise.resolve(fresh) }); }).finally(() => refreshing.delete(cacheKey));
      }
      return served;
    }
  }
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  const promise = loadReport(filters);
  cache.set(cacheKey, { at: Date.now(), promise });
  return promise;
}

/** The A/B bench, asked for when its tab opens — not on every page load. */
export async function getTrafficExperiments(filters: TrafficFilters): Promise<ExperimentResult[]> {
  if (!posthogApiConfig()) return [];
  const rows = await runTrafficQuery(buildExperimentsQuery(filters), "experiments");
  return rows.map(r => ({ experiment: String(r[0]), variant: String(r[1]), visitors: numeric(r[2]), attempts: numeric(r[3]), completed: numeric(r[4]), mixedVisitors: numeric(r[5]) }));
}

const text = (v: unknown) => v == null ? "" : String(v);
// HogQL returns UTC datetimes as "YYYY-MM-DD HH:MM:SS[.ffffff]" or ISO strings; both become ISO.
const stamp = (v: unknown) => { const raw = text(v).trim(); if (!raw) return ""; const iso = raw.replace(" ", "T") + (/[Zz]$|[+-]\d\d:?\d\d$/.test(raw) ? "" : "Z"); const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toISOString(); };
const stageCache = new Map<string, { at: number; promise: Promise<StageVisitorsReport> }>();

/** Everyone who reached one funnel stage under the current filters, newest first. */
export async function getStageVisitors(filters: TrafficFilters, stageId: string): Promise<StageVisitorsReport> {
  const stage = funnelStages(filters).find(s => s.id === stageId);
  if (!stage) throw new Error("Choose a funnel stage.");
  const cacheKey = JSON.stringify([process.env.POSTHOG_PROJECT_ID, process.env.POSTHOG_HOST, filters, stageId]);
  const hit = stageCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 60_000) return hit.promise;
  if (stageCache.size >= 24) stageCache.delete(stageCache.keys().next().value!);
  const promise = (async () => {
    const config = posthogApiConfig();
    if (!config) throw new Error("Connect PostHog to inspect visitors.");
    const sql = buildStageVisitorsQuery(filters, stageId);
    if (!sql) throw new Error("Choose a funnel stage.");
    const rows = await runTrafficQuery(sql, `stage visitors / ${stageId}`);
    const visitors: StageVisitor[] = rows.map(r => ({
      id: text(r[0]), reachedAt: stamp(r[2]), lastSeen: stamp(r[3]),
      device: text(r[4]), browser: text(r[5]), os: text(r[6]),
      country: text(r[7]), region: text(r[8]), city: text(r[9]),
      source: text(r[10]), referrer: text(r[11]), campaign: text(r[12]).trim() === "/  /" ? "" : text(r[12]),
      sessions: numeric(r[13]), views: numeric(r[14]), furthest: text(r[15]),
      personUrl: r[1] ? `${config.host}/project/${config.id}/person/${encodeURIComponent(text(r[1]))}` : null,
    }));
    return { stage: { id: stage.id, label: stage.label }, filters, total: numeric(rows[0]?.[16]) || visitors.length, visitors, fetchedAt: new Date().toISOString() };
  })();
  promise.catch(() => stageCache.delete(cacheKey));
  stageCache.set(cacheKey, { at: Date.now(), promise });
  return promise;
}

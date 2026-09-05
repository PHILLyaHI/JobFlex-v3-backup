import type { TrafficBreakdown, TrafficFilters, TrafficReport, TrafficTotals } from "./traffic-contract";
import { buildTrafficQueries, shiftDate } from "./traffic-query";

type Rows = unknown[][];
const cache = new Map<string, { at: number; promise: Promise<TrafficReport> }>();
const numeric = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0;
const totals = (r: unknown[]): TrafficTotals => ({ visitors: numeric(r[0]), newVisitors: numeric(r[1]), returningVisitors: numeric(r[2]), repeatVisitors: numeric(r[3]), sessions: numeric(r[4]), pageviews: numeric(r[5]) });

export function posthogApiConfig() {
  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").trim().replace(/\/+$/, "");
  if (!["https://us.posthog.com", "https://eu.posthog.com"].includes(host)) throw new Error("POSTHOG_HOST must be https://us.posthog.com or https://eu.posthog.com.");
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
    lifetime: null, today: null, firstTrackedAt: null, firstStepAt: null, points: [], pages: [], sources: [],
    referrers: [], campaigns: [], devices: [], browsers: [], countries: [], terms: [], hosts: [], funnel: [], funnelOutcomes: null, experiments: [] };
}

async function loadReport(filters: TrafficFilters): Promise<TrafficReport> {
  const report = emptyTrafficReport(filters);
  try {
    if (!posthogApiConfig()) return { ...report, status: "disabled", message: "Connect a PostHog personal key with query:read and a numeric project ID." };
  } catch (err) { return { ...report, status: "error", message: (err as Error).message }; }
  const queries = Object.entries(buildTrafficQueries(filters));
  const results: Record<string, Rows> = {};
  // Bound concurrency to avoid saturating the upstream project's query slots.
  for (let i = 0; i < queries.length; i += 2) {
    await Promise.all(queries.slice(i, i + 2).map(async ([name, sql]) => {
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
  }
  if (results.lifetime?.[0]) {
    const r = results.lifetime[0];
    report.lifetime = numeric(r[0]); report.today = numeric(r[1]);
    report.firstTrackedAt = r[2] ? String(r[2]) : null; report.firstStepAt = r[3] ? String(r[3]) : null;
  }
  if (results.trend) {
    const days = new Map(results.trend.map(r => [String(r[0]), totals(r.slice(1))]));
    for (let date = filters.from; date <= filters.to; date = shiftDate(date, 1)) report.points.push({ date, ...(days.get(date) || totals([])) });
  }
  report.pages = (results.pages || []).map(r => ({ page: String(r[0]), ...totals(r.slice(1)) }));
  for (const r of results.breakdowns || []) {
    const key = String(r[0]);
    if (["sources", "referrers", "campaigns", "devices", "browsers", "countries", "terms", "hosts"].includes(key)) {
      (report[key as "sources"] as TrafficBreakdown[]).push({ name: String(r[1]), visitors: numeric(r[2]), sessions: numeric(r[3]), conversions: numeric(r[4]) });
    }
  }
  const stages = [["landing", "Landing"], ["registration", "Registration"],
    ...(filters.flow === "standard" ? [["account", "1 / Account"]] : []),
    ["company", "2 / Company"], ["plan", "3 / Plan"], ["attempt", "Trial / purchase attempt"],
    ["checkout", "Checkout opened"], ["completed", "Verified signup"]];
  report.funnel = results.funnel?.[0] ? stages.map(([id, label], i) => ({ id, label, visitors: numeric(results.funnel[0][i]) })) : [];
  if (results.funnel?.[0]) {
    const row = results.funnel[0].slice(stages.length);
    report.funnelOutcomes = { trials: numeric(row[0]), purchases: numeric(row[1]), other: numeric(row[2]), trialAttempts: numeric(row[3]), purchaseAttempts: numeric(row[4]) };
  }
  report.experiments = (results.experiments || []).map(r => ({ experiment: String(r[0]), variant: String(r[1]), visitors: numeric(r[2]), attempts: numeric(r[3]), completed: numeric(r[4]), mixedVisitors: numeric(r[5]) }));
  if (!report.totals) { report.status = "error"; report.message = report.errors[0] || "Traffic is unavailable."; }
  return report;
}

export async function getTrafficReport(filters: TrafficFilters): Promise<TrafficReport> {
  const cacheKey = JSON.stringify([process.env.POSTHOG_PROJECT_ID, process.env.POSTHOG_HOST, filters]);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < 60_000) return hit.promise;
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  const promise = loadReport(filters);
  cache.set(cacheKey, { at: Date.now(), promise });
  return promise;
}

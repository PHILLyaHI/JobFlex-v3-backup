import type { TrafficFilters } from "./traffic-contract";
import { TRAFFIC_EVENTS as E } from "./traffic-contract";

const DAY = 86_400_000;
export function dateInZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
}
export function parseTrafficFilters(input: Record<string, unknown> = {}, now = new Date()): TrafficFilters {
  const timezone = typeof input.timezone === "string" ? input.timezone : "America/Los_Angeles";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(now); } catch { throw new Error("Choose a valid timezone."); }
  const today = dateInZone(now, timezone);
  const from = typeof input.from === "string" ? input.from : shiftDate(today, -29);
  const to = typeof input.to === "string" ? input.to : today;
  for (const d of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) throw new Error("Use valid dates in YYYY-MM-DD format.");
  }
  if (from > to || to > today || Date.parse(to) - Date.parse(from) >= 366 * DAY) throw new Error("Choose a date range up to 366 days ending today or earlier.");
  const text = (key: string, max: number) => typeof input[key] === "string" ? (input[key] as string).trim().slice(0, max) : "";
  return {
    from, to, timezone,
    audience: input.audience === "new" || input.audience === "returning" ? input.audience : "all",
    environment: input.environment === "production" || input.environment === "development" ? input.environment : "all",
    page: text("page", 240), source: text("source", 160), device: text("device", 80), host: text("host", 253),
    flow: input.flow === "google" ? "google" : "standard",
    windowDays: [1, 7, 14].includes(Number(input.windowDays)) ? Number(input.windowDays) : 7,
    billingMode: input.billingMode === "test" || input.billingMode === "all" ? input.billingMode : "live",
  };
}

// Only validated literals enter HogQL; the client never supplies SQL or identifiers.
export const literal = (s: string) => "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
export function buildTrafficQueries(f: TrafficFilters): Record<string, string> {
  const q = literal;
  const start = `toDateTime(${q(f.from + " 00:00:00")}, ${q(f.timezone)})`;
  const end = `toDateTime(${q(shiftDate(f.to, 1) + " 00:00:00")}, ${q(f.timezone)})`;
  const duration = Math.round((Date.parse(f.to) - Date.parse(f.from)) / DAY) + 1;
  const prev = `toDateTime(${q(shiftDate(f.from, -duration) + " 00:00:00")}, ${q(f.timezone)})`;
  const prop = (name: string) => `ifNull(toString(properties.${name}), '')`;
  const eventPath = `ifNull(nullIf(${prop("$pathname")}, ''), path(${prop("$current_url")}))`;
  const env = f.environment === "all" ? "1 = 1" : `environment = ${q(f.environment)}`;
  const hostFilter = f.host ? `hostname = ${q(f.host === "__unknown__" ? "" : f.host)}` : "1 = 1";
  const base = `WITH raw AS (
    SELECT timestamp, toString(person_id) AS visitor, event,
      ${eventPath} AS pathname,
      ifNull(nullIf(${prop("jf_hostname")}, ''), domain(${prop("$current_url")})) AS hostname,
      ${prop("$session_id")} AS session_id,
      ifNull(nullIf(${prop("jf_environment")}, ''), if(domain(${prop("$current_url")}) IN ('localhost', '127.0.0.1'), 'development', 'production')) AS environment,
      ${prop("utm_source")} AS utm_source, ${prop("utm_medium")} AS medium,
      ${prop("utm_campaign")} AS campaign, ${prop("utm_term")} AS term,
      ${prop("$referring_domain")} AS referrer,
      ${prop("$device_type")} AS device, ${prop("$browser")} AS browser,
      ${prop("$geoip_country_name")} AS country,
      ${prop("step")} AS step, ${prop("flow")} AS flow,
      ${prop("experiment")} AS experiment, ${prop("variant")} AS variant,
      ${prop("verified")} AS verified, ${prop("billing_mode")} AS billing_mode,
      ${prop("intent")} AS intent, ${prop("outcome")} AS outcome
    FROM events
    WHERE timestamp <= now() AND (event = '$pageview' OR event IN (${Object.values(E).map(q).join(",")}))
  ), base AS (
    SELECT *, if(event = ${q(E.step)}, concat('registration:', step), pathname) AS page,
      if(utm_source != '', utm_source, if(referrer IN ('', '$direct') OR referrer = hostname, 'Direct / unknown', referrer)) AS source
    FROM raw WHERE pathname != '/admin' AND NOT startsWith(pathname, '/admin/') AND ${env} AND ${hostFilter}
      ${f.billingMode === "all" ? "" : `AND (event != ${q(E.completed)} OR billing_mode = ${q(f.billingMode)})`}
  ), enriched AS (
    SELECT *, minIf(timestamp, event = '$pageview') OVER (PARTITION BY visitor) AS first_seen,
      if(session_id = '', source, argMin(source, timestamp) OVER (PARTITION BY visitor, session_id)) AS traffic_source,
      if(session_id = '', referrer, argMin(referrer, timestamp) OVER (PARTITION BY visitor, session_id)) AS traffic_referrer,
      argMin(concat(utm_source, ' / ', medium, ' / ', campaign), timestamp) OVER (PARTITION BY visitor, session_id) AS traffic_campaign,
      argMin(term, timestamp) OVER (PARTITION BY visitor, session_id) AS traffic_term,
      minOrNullIf(timestamp, event = ${q(E.completed)} AND verified = 'true') OVER
        (PARTITION BY visitor ORDER BY timestamp ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING) AS next_completed
    FROM base
  )`;
  // Most reports need only first-seen and source. Avoid calculating acquisition
  // and forward-conversion windows for every audience/funnel request.
  const scopedBase = base.slice(0, base.indexOf(", enriched AS ("));
  const audienceBase = `${scopedBase}, enriched AS (
    SELECT *, minIf(timestamp, event = '$pageview') OVER (PARTITION BY visitor) AS first_seen,
      if(session_id = '', source, argMin(source, timestamp) OVER (PARTITION BY visitor, session_id)) AS traffic_source
    FROM base
  )`;
  const aud = (boundary: string) => f.audience === "new" ? `first_seen >= ${boundary}` : f.audience === "returning" ? `first_seen < ${boundary}` : "1 = 1";
  const segment = `${f.source ? `traffic_source = ${q(f.source)}` : "1 = 1"} AND ${f.device ? `device = ${q(f.device === "__unknown__" ? "" : f.device)}` : "1 = 1"}`;
  const page = f.page.startsWith("registration:") ? `event = ${q(E.step)} AND page = ${q(f.page)}`
    : `event = '$pageview'${f.page ? ` AND page = ${q(f.page)}` : ""}`;
  const selected = `timestamp >= ${start} AND timestamp < ${end} AND ${segment} AND ${aud(start)}`;
  const previous = `timestamp >= ${prev} AND timestamp < ${start} AND ${segment} AND ${aud(prev)}`;
  const totals = (where: string, boundary: string) => `SELECT count() AS visitors,
    countIf(visitor_first_seen >= ${boundary}) AS new_visitors, countIf(visitor_first_seen < ${boundary}) AS returning_visitors,
    countIf(sessions >= 2) AS repeat_visitors, sum(sessions) AS session_total, sum(views) AS pageview_total
    FROM (SELECT visitor, min(first_seen) AS visitor_first_seen, uniqExactIf(session_id, session_id != '') AS sessions, count() AS views
      FROM enriched WHERE ${where} AND ${page} GROUP BY visitor)`;
  const overview = `${audienceBase} SELECT 'current' AS period, * FROM (${totals(selected, start)})
    UNION ALL SELECT 'previous' AS period, * FROM (${totals(previous, prev)}) LIMIT 2`;
  const trend = `${audienceBase} SELECT day, count(), countIf(visitor_first_seen >= ${start}), countIf(visitor_first_seen < ${start}), countIf(sessions >= 2), sum(sessions), sum(views)
    FROM (SELECT toString(toDate(toTimeZone(timestamp, ${q(f.timezone)}))) AS day, visitor, min(first_seen) AS visitor_first_seen,
      uniqExactIf(session_id, session_id != '') AS sessions, count() AS views
      FROM enriched WHERE ${selected} AND ${page} GROUP BY day, visitor)
    GROUP BY day ORDER BY day LIMIT 366`;
  const pages = `${audienceBase} SELECT page, count(), countIf(visitor_first_seen >= ${start}), countIf(visitor_first_seen < ${start}), countIf(sessions >= 2), sum(sessions), sum(views)
    FROM (SELECT page, visitor, min(first_seen) AS visitor_first_seen, uniqExactIf(session_id, session_id != '') AS sessions, count() AS views
      FROM enriched WHERE ${selected} AND event IN ('$pageview', ${q(E.step)}) GROUP BY page, visitor)
    GROUP BY page ORDER BY count() DESC LIMIT 200`;
  const lifetime = `${scopedBase} SELECT uniqExactIf(visitor, event = '$pageview'),
    uniqExactIf(visitor, event = '$pageview' AND toDate(toTimeZone(timestamp, ${q(f.timezone)})) = toDate(toTimeZone(now(), ${q(f.timezone)}))),
    minOrNullIf(timestamp, event = '$pageview'), minOrNullIf(timestamp, event = ${q(E.step)}) FROM base`;
  const dimensions = { sources: "traffic_source", referrers: "traffic_referrer", campaigns: "traffic_campaign", devices: "device", browsers: "browser", countries: "country", terms: "traffic_term", hosts: "hostname" };
  const breakdowns = `${base} SELECT tupleElement(dimension, 1) AS kind, ifNull(nullIf(tupleElement(dimension, 2), ''), 'Unknown') AS name,
      uniqExact(visitor) AS visitors, uniqExactIf(concat(visitor, ':', session_id), session_id != '') AS sessions,
      uniqExactIf(visitor, next_completed >= timestamp AND next_completed <= timestamp + INTERVAL ${f.windowDays} DAY) AS conversions
    FROM (SELECT *, arrayJoin([${Object.entries(dimensions).map(([key, column]) => `tuple(${q(key)}, ${column})`).join(",")}]) AS dimension FROM enriched)
    WHERE ${selected} AND ${page} GROUP BY kind, name ORDER BY visitors DESC LIMIT 20 BY kind LIMIT 160`;

  // The cohort starts with its first eligible landing. Every later stage must follow
  // the preceding stage and fit inside that visitor's conversion window.
  const stages = [
    ["landing", "Landing", "event = '$pageview' AND pathname = '/'"],
    ["registration", "Registration", "event = '$pageview' AND pathname = '/auth/register'"],
    ...(f.flow === "google" ? [] : [["account", "1 / Account", `event = ${q(E.step)} AND step = '1'`]]),
    ["company", "2 / Company", `event = ${q(E.step)} AND step = '2'${f.flow === "google" ? " AND flow = 'google'" : " AND flow = 'standard'"}`],
    ["plan", "3 / Plan", `event = ${q(E.step)} AND step = '3'`],
    ["attempt", "Trial / purchase attempt", `event = ${q(E.attempt)}`],
    ["checkout", "Checkout opened", `event = ${q(E.opened)}`],
    ["completed", "Verified signup", `event = ${q(E.completed)} AND verified = 'true'`],
  ];
  const ctes = [`s0 AS (SELECT *, minOrNullIf(timestamp, ${selected} AND ${stages[0][2]}) OVER (PARTITION BY visitor) AS t0 FROM enriched)`];
  for (let i = 1; i < stages.length; i++) ctes.push(`s${i} AS (
    SELECT *, minOrNullIf(timestamp, t${i - 1} IS NOT NULL AND timestamp >= t${i - 1}
      AND timestamp <= t0 + INTERVAL ${f.windowDays} DAY AND ${stages[i][2]}) OVER (PARTITION BY visitor) AS t${i} FROM s${i - 1})`);
  const funnel = `${audienceBase}, ${ctes.join(",\n")}
    SELECT ${stages.map((_, i) => `uniqExactIf(visitor, t${i} IS NOT NULL)`).join(", ")},
      uniqExactIf(visitor, timestamp = t${stages.length - 1} AND event = ${q(E.completed)} AND outcome = 'trial_started'),
      uniqExactIf(visitor, timestamp = t${stages.length - 1} AND event = ${q(E.completed)} AND outcome = 'subscription_purchased'),
      uniqExactIf(visitor, timestamp = t${stages.length - 1} AND event = ${q(E.completed)} AND outcome NOT IN ('trial_started', 'subscription_purchased')),
      uniqExactIf(visitor, timestamp = t${stages.length - 3} AND event = ${q(E.attempt)} AND intent = 'trial'),
      uniqExactIf(visitor, timestamp = t${stages.length - 3} AND event = ${q(E.attempt)} AND intent = 'purchase')
    FROM s${stages.length - 1} LIMIT 1`;
  const experiments = `${audienceBase}, exposures AS (
    SELECT visitor, experiment, argMin(variant, timestamp) AS assigned_variant, min(timestamp) AS exposed_at, uniqExact(variant) AS variants,
      argMin(traffic_source, timestamp) AS exposure_source, argMin(device, timestamp) AS exposure_device, min(first_seen) AS first_seen
    FROM enriched WHERE event = ${q(E.exposure)} AND experiment != '' AND variant != '' GROUP BY visitor, experiment
  ), outcomes AS (
    SELECT x.visitor, x.experiment, x.assigned_variant, x.variants,
      countIf(b.event = ${q(E.attempt)} AND b.timestamp >= x.exposed_at AND b.timestamp <= x.exposed_at + INTERVAL ${f.windowDays} DAY) > 0 AS attempted,
      countIf(b.event = ${q(E.completed)} AND b.verified = 'true' AND b.timestamp >= x.exposed_at AND b.timestamp <= x.exposed_at + INTERVAL ${f.windowDays} DAY) > 0 AS completed
    FROM exposures x LEFT JOIN base b ON x.visitor = b.visitor
    WHERE x.exposed_at >= ${start} AND x.exposed_at < ${end} AND ${aud(start)}
      ${f.source ? `AND x.exposure_source = ${q(f.source)}` : ""} ${f.device ? `AND x.exposure_device = ${q(f.device === "__unknown__" ? "" : f.device)}` : ""}
    GROUP BY x.visitor, x.experiment, x.assigned_variant, x.variants
  ) SELECT experiment, assigned_variant, countIf(variants = 1), countIf(variants = 1 AND attempted), countIf(variants = 1 AND completed), countIf(variants > 1)
    FROM outcomes GROUP BY experiment, assigned_variant ORDER BY experiment, assigned_variant LIMIT 100`;
  return { overview, lifetime, trend, pages, breakdowns, funnel, experiments };
}

// WHO COUNTS AS A VISITOR (2026-10-01) — one rule for every figure on
// /admin/traffic: the report's header and cards, the funnel, the breakdowns,
// the live panel and its totals. Pure, no imports: the HogQL half and the
// JavaScript half are written side by side so they cannot drift.
//
// The audit of 2026-10-01 (PostHog Query API) found 11,868 all-time visitors:
// 11,810 on www.jobflex.app / jobflex.app, 36 on Vercel preview deployments,
// 20 with no hostname at all (2,855 pageviews, all before 2026-09-05), 7 on
// localhost. The previews were counted as production because jf_environment
// only knew localhost. No bot user agent was found — posthog-js drops known
// bots and webdriver browsers before sending — but our own beacon path sends
// around the library, so the rule still filters them here.
//
//   · a counted host is www.jobflex.app or jobflex.app; localhost, 127.0.0.1
//     and 192.168.* only when the admin asks for them ("Include localhost");
//     Vercel previews and unknown hosts never;
//   · a pageview with no user agent, PostHog's own bot flag ($browser_type
//     "bot", set when its filter is off), or a user agent on the list below is
//     not a visit;
//   · server-side events (the verified signup) carry no user agent and keep
//     their hostname from the browser that started them — they pass.
//
// "From ads" is decided here too: a visit is from an ad only when it carries
// utm_source or fbclid (owner, 2026-10-01). An untagged Facebook referrer or
// a Google click id alone no longer counts.

/** Старт рекламы — the ad launch (owner, 2026-10-01). Every figure on
 *  /admin/traffic counts from local midnight of this day in
 *  America/Los_Angeles: the cards, "all-time", "7 days", the funnel, the
 *  platform cards and the map. Earlier events are the old campaign's clicks
 *  and the previews; "Show full history" (admins) brings them back. */
export const TRAFFIC_SINCE = "2026-09-30";
/** THE PAGE'S DAY (2026-10-04). "Today", "yesterday to this hour" and the ad
 *  launch are all read in this one zone. The live view's signups used to be
 *  the last 24 hours while its visitors were this zone's day, so at midnight
 *  one card went to zero and the other did not. */
export const TRAFFIC_TZ = "America/Los_Angeles";
export const TRAFFIC_SINCE_TZ = TRAFFIC_TZ;
/** Local midnight of the day `now` falls in, in TRAFFIC_TZ, as a UTC instant in ms. */
export function trafficDayStartMs(now: number = Date.now()): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TRAFFIC_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const local = (ms: number) => {
    const p = fmt.formatToParts(new Date(ms));
    const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
    return { y: n("year"), mo: n("month"), d: n("day"), asUtc: Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) };
  };
  const today = local(now);
  // Midnight of that date as if the zone were UTC, then moved by the zone's
  // offset at that hour — read there, not now, so a day the clocks change
  // (2 am) still starts at its own midnight.
  const guess = Date.UTC(today.y, today.mo - 1, today.d);
  const first = guess - (local(guess).asUtc - guess);
  return first - (local(first).asUtc - guess);
}
/** The same instant in ms: 2026-09-30 00:00 PDT (UTC−7). */
export const TRAFFIC_SINCE_MS = Date.parse("2026-09-30T00:00:00-07:00");
export const TRAFFIC_SINCE_LABEL = "Sep 30, 2026";
/** The date half of the rule, over a timestamp column; nothing when the full history is asked for. */
export function sinceSql(fullHistory: boolean, ts = "timestamp"): string {
  return fullHistory ? "1 = 1" : `${ts} >= toDateTime('${TRAFFIC_SINCE} 00:00:00', '${TRAFFIC_SINCE_TZ}')`;
}

export const PRODUCTION_HOSTS = ["www.jobflex.app", "jobflex.app"] as const;
export const LOCAL_HOSTS = ["localhost", "127.0.0.1"] as const;
const LOCAL_PREFIX = "192.168.";

/** Bots, headless browsers and scripts, by user agent. RE2 and JS agree on it.
 *  "bot" only as a whole word or before a slash ("Googlebot/2.1",
 *  "AhrefsBot/7"), so a phone named CUBOT is not one. */
export const BOT_UA_PATTERN = "headless|playwright|puppeteer|selenium|webdriver|lighthouse|pagespeed|phantomjs|\\bbot\\b|bot/|crawl|spider|slurp|facebookexternalhit|curl/|wget/|python-requests|python-urllib|go-http-client|okhttp|java/|httpclient|axios/|node-fetch|undici";
const BOT_UA = new RegExp(BOT_UA_PATTERN, "i");

// ── HogQL ──────────────────────────────────────────────────────────────────

const prop = (name: string) => `ifNull(toString(properties.${name}), '')`;
/** The visit's host: our own jf_hostname, else the URL's. Lower-cased. */
export const HOST_SQL = `lower(ifNull(nullIf(${prop("jf_hostname")}, ''), domain(${prop("$current_url")})))`;
export const UA_SQL = prop("$raw_user_agent");
export const BROWSER_TYPE_SQL = prop("$browser_type");

const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");
const LOCAL_SQL = (host: string) => `(${host} IN (${list(LOCAL_HOSTS)}) OR startsWith(${host}, '${LOCAL_PREFIX}'))`;

export type VisitorScope = "production" | "with-local" | "local";

/** The host half of the rule, over a column (or expression) holding the host.
 *  A server-side event with no host passes; a pageview never does. */
export function hostRuleSql(host: string, event: string, scope: VisitorScope): string {
  const prod = `${host} IN (${list(PRODUCTION_HOSTS)})`;
  const allowed = scope === "production" ? prod : scope === "local" ? LOCAL_SQL(host) : `(${prod} OR ${LOCAL_SQL(host)})`;
  return `(${allowed} OR (${host} = '' AND ${event} != '$pageview'))`;
}

/** The bot half of the rule, over the user-agent and browser-type columns. */
export function botRuleSql(ua: string, browserType: string, event: string): string {
  return `NOT (${browserType} = 'bot' OR (${event} = '$pageview' AND ${ua} = '') OR match(${ua}, '(?i)${BOT_UA_PATTERN.replace(/\\/g, "\\\\")}'))`;
}

/** Both halves: the one predicate every query on the page filters by. */
export function visitorRuleSql(cols: { host: string; ua: string; browserType: string; event: string }, scope: VisitorScope): string {
  return `(${hostRuleSql(cols.host, cols.event, scope)} AND ${botRuleSql(cols.ua, cols.browserType, cols.event)})`;
}

/** Facebook's and Instagram's in-app browsers (2026-10-01). A visitor there is
 *  a CLICK: each ad tap can arrive with a fresh cookie, so PostHog counts the
 *  same person again. "People (est.)" counts them by address and browser
 *  instead — $ip + $raw_user_agent, unique per day. */
export const IN_APP_UA_PATTERN = "FBAN|FBAV|FB_IAB|FBIOS|FB4A|Instagram";
export const IN_APP_SQL = `match(${UA_SQL}, '${IN_APP_UA_PATTERN}')`;
/** One estimated person: the address and the browser, together. */
export const PERSON_KEY_SQL = `concat(${prop("$ip")}, '|', ${UA_SQL})`;
/** The ad tags the reconciliation table splits by: Meta's site_source_name values. */
export const AD_SOURCES = ["fb", "ig", "an"] as const;

// ── JavaScript (the live panel's events) ───────────────────────────────────

export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return (LOCAL_HOSTS as readonly string[]).includes(h) || h.startsWith(LOCAL_PREFIX);
}
export function isProductionHost(host: string): boolean {
  return (PRODUCTION_HOSTS as readonly string[]).includes(host.toLowerCase());
}
export function isBotUa(ua: string, browserType = ""): boolean {
  return browserType === "bot" || BOT_UA.test(ua);
}

/** The same rule as visitorRuleSql, for one event already fetched (the date half when `at` is given). */
export function isCountedEvent(e: { event: string; hostname: string; ua: string; browserType: string; at?: number }, includeLocal: boolean, fullHistory = false): boolean {
  if (!fullHistory && e.at !== undefined && e.at < TRAFFIC_SINCE_MS) return false;
  const host = e.hostname.toLowerCase();
  const hostOk = isProductionHost(host) || (includeLocal && isLocalHost(host)) || (host === "" && e.event !== "$pageview");
  if (!hostOk) return false;
  if (isBotUa(e.ua, e.browserType)) return false;
  return !(e.event === "$pageview" && e.ua === "");
}

/** From an ad: the visit carries utm_source or fbclid. Nothing else qualifies. */
export function carriesAdTag(utmSource: string, click: string): boolean {
  return utmSource.trim() !== "" || click.trim().toLowerCase() === "fbclid";
}

// LIVE NOW (2026-09-28) — who is on the site this minute, where they came
// from, what they are looking at, and whether they signed up. Pure: the
// server hands in the last half hour of PostHog events (one row each) and
// the day's fresh organizations from the database; this turns them into one
// line per visitor, coloured by how far they got.
//
// Owner: "add to statistics at admin to look at live users when they are
// coming from advertisement and looking at the app; if they sign up make it
// a different colour — make it smart."
//
// What "smart" means here:
//   · A visitor is one PostHog person (anonymous id, merged on signup), not a
//     pageview — a reader flipping through five screens is one line.
//   · Where they came from is read off the FIRST event of their latest visit
//     (utm_*, then the referring domain): a tagged paid medium is an ad; a
//     Facebook / Instagram / TikTok referrer with no tag is "untagged — most
//     likely an ad" (the landing is not something people share for fun); a
//     search engine referrer is search; the rest referral or direct.
//   · How far they got is the furthest thing they did in the window:
//     browsing → on the sign-up form → at checkout → SIGNED UP; a person on
//     the app's own screens (/dashboard…) is a member, not a prospect.
//   · A signup is tied back to the organization the database just created
//     (the verified event and the row are minutes apart and carry the same
//     utm_*), so the line names the company and the owner.
//   · "On the site now" = an event in the last ACTIVE_MINUTES; up to
//     WINDOW_MINUTES they are "just left", shown dimmer, then gone.
import { TRAFFIC_EVENTS as E, pageLabel } from "./traffic-contract";

export const LIVE_WINDOW_MINUTES = 30;
export const LIVE_ACTIVE_MINUTES = 5;
/** The verified signup event and the database row are this close in time. */
const SIGNUP_MATCH_MS = 15 * 60_000;

/** One PostHog event, as the live query returns it (traffic-server). */
export interface LiveEvent {
  person: string;
  distinctId: string;
  event: string;
  /** Unix ms. */
  at: number;
  pathname: string;
  url: string;
  sessionId: string;
  hostname: string;
  environment: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  referrer: string;
  device: string;
  browser: string;
  os: string;
  country: string;
  region: string;
  city: string;
  step: string;
  outcome: string;
  plan: string;
  verified: string;
  /** PostHog's GeoIP guess at the browser's place (null when it has none). */
  lat: number | null;
  lon: number | null;
  countryCode: string;
  regionCode: string;
}

/** An organization created today, from the database. */
export interface FreshSignup {
  orgId: string;
  orgName: string;
  ownerEmail: string;
  ownerName: string;
  createdAt: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  landingIndustry: string;
}

export type LiveStage = "browsing" | "registering" | "checkout" | "signed-up" | "member";
export type SourceKind = "ad" | "likely-ad" | "search" | "social" | "referral" | "direct";

export interface LiveVisitor {
  /** The person id, shortened for the eye. */
  id: string;
  stage: LiveStage;
  /** True for a tagged ad and for an untagged ad-platform referrer. */
  fromAd: boolean;
  sourceKind: SourceKind;
  /** "Facebook ad", "Google search", "Direct", "yelp.com"… */
  source: string;
  campaign: string;
  /** The page they are on now (last pageview), and its plain name. */
  page: string;
  pageLabel: string;
  /** Pageviews in this visit, and the last few pages in order. */
  views: number;
  trail: string[];
  firstAt: string;
  lastAt: string;
  /** An event in the last LIVE_ACTIVE_MINUTES. */
  active: boolean;
  device: string;
  browser: string;
  place: string;
  /** For the map: where the browser is, as GeoIP reads it (null = not on the map). */
  lat: number | null;
  lon: number | null;
  city: string;
  region: string;
  regionCode: string;
  country: string;
  countryCode: string;
  environment: "production" | "development";
  hostname: string;
  /** The account this visitor made, when the database row could be tied to it. */
  signup: { orgName: string; ownerEmail: string; ownerName: string; at: string; plan: string; outcome: string } | null;
  /** The verified signup this visit produced even when no row matched. */
  signedUpAt: string | null;
}

export interface LiveCounts {
  onSite: number;
  fromAds: number;
  signingUp: number;
  signedUp: number;
  members: number;
}

export interface LiveReport {
  status: "ok" | "disabled" | "error";
  message?: string;
  fetchedAt: string;
  windowMinutes: number;
  activeMinutes: number;
  visitors: LiveVisitor[];
  counts: LiveCounts;
  /** The day's organizations from the database, and how many came from ads. */
  today: { signups: number; fromAds: number };
  /** Fresh organizations no live visitor could be tied to (their visit was
   *  before the window, or the browser blocked analytics). */
  otherSignups: Array<{ orgName: string; ownerEmail: string; at: string; source: string }>;
}

const AD_MEDIUMS = new Set(["cpc", "ppc", "paid", "paid_social", "paidsocial", "paid-social", "social-paid", "ads", "ad", "display", "retargeting", "remarketing", "cpm", "cpv", "cpa", "sponsored", "banner", "video-ad", "lead-ad", "leadgen", "instant-form"]);
const AD_PLATFORMS: Record<string, string> = {
  facebook: "Facebook", fb: "Facebook", meta: "Meta", instagram: "Instagram", ig: "Instagram",
  google: "Google", googleads: "Google", adwords: "Google", gads: "Google", youtube: "YouTube",
  tiktok: "TikTok", bing: "Bing", microsoft: "Bing", linkedin: "LinkedIn", nextdoor: "Nextdoor", yelp: "Yelp", reddit: "Reddit", x: "X", twitter: "X", pinterest: "Pinterest", snapchat: "Snapchat",
};
/** Referrers that are almost always an ad click on a contractor SaaS landing. */
const SOCIAL_AD_DOMAINS: Array<[RegExp, string]> = [
  [/(^|\.)facebook\.com$|^l\.facebook\.com$|^lm\.facebook\.com$|^m\.facebook\.com$|(^|\.)fb\.com$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "YouTube"],
  [/(^|\.)snapchat\.com$/, "Snapchat"],
];
const SOCIAL_DOMAINS: Array<[RegExp, string]> = [
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "LinkedIn"],
  [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, "X"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)nextdoor\.com$/, "Nextdoor"],
  [/(^|\.)pinterest\.com$/, "Pinterest"],
];
const SEARCH_DOMAINS: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)yahoo\.[a-z.]+$/, "Yahoo"],
  [/(^|\.)ecosia\.org$/, "Ecosia"],
  [/(^|\.)brave\.com$/, "Brave"],
];

const lower = (s: string) => s.trim().toLowerCase();

/** Where a visit came from, read off its first event. */
export function classifySource(utmSource: string, utmMedium: string, referrer: string, hostname: string): { kind: SourceKind; label: string; fromAd: boolean } {
  const src = lower(utmSource);
  const med = lower(utmMedium);
  const ref = lower(referrer).replace(/^www\./, "");
  if (src) {
    const platform = AD_PLATFORMS[src] ?? utmSource.trim();
    if (AD_MEDIUMS.has(med) || /paid|cpc|ppc|\bads?\b/.test(med)) return { kind: "ad", label: `${platform} ad`, fromAd: true };
    if (src in AD_PLATFORMS && !med) return { kind: "likely-ad", label: `${platform} · tagged, no medium`, fromAd: true };
    if (med === "social" || med === "organic_social") return { kind: "social", label: `${platform} · post`, fromAd: false };
    if (med === "email" || med === "newsletter") return { kind: "referral", label: `${platform} · email`, fromAd: false };
    if (med === "referral" || med === "affiliate" || med === "partner") return { kind: "referral", label: `${platform} · ${med}`, fromAd: false };
    if (med === "organic" || med === "search") return { kind: "search", label: `${platform} search`, fromAd: false };
    return { kind: "referral", label: med ? `${platform} · ${utmMedium.trim()}` : platform, fromAd: false };
  }
  if (!ref || ref === "$direct" || ref === hostname.toLowerCase().replace(/^www\./, "")) return { kind: "direct", label: "Direct", fromAd: false };
  for (const [re, name] of SOCIAL_AD_DOMAINS) if (re.test(ref)) return { kind: "likely-ad", label: `${name} · untagged, most likely an ad`, fromAd: true };
  for (const [re, name] of SEARCH_DOMAINS) if (re.test(ref)) return { kind: "search", label: `${name} search`, fromAd: false };
  for (const [re, name] of SOCIAL_DOMAINS) if (re.test(ref)) return { kind: "social", label: `${name}`, fromAd: false };
  return { kind: "referral", label: ref, fromAd: false };
}

/** A database signup's own source, in the same words. */
export function signupSource(s: { utmSource: string; utmMedium: string }): { label: string; fromAd: boolean } {
  const c = classifySource(s.utmSource, s.utmMedium, "", "");
  return { label: c.kind === "direct" ? "Untagged" : c.label, fromAd: c.fromAd };
}

const APP_PATH = /^\/(dashboard|mobile-|w\/|portal|worker)/;
const SIGNUP_PATH = /^\/auth\/register/;

const stageRank: Record<LiveStage, number> = { browsing: 0, member: 1, registering: 2, checkout: 3, "signed-up": 4 };

/** A screen's plain name: the report's labels, the app's own screens by
 *  section ("App · Jobs"), the rest by path. */
export function screenLabel(path: string): string {
  const known = pageLabel(path);
  if (known !== path) return known;
  const m = /^\/(dashboard|mobile-[a-z0-9-]+|portal|w)(?:\/([a-z0-9-]+))?/i.exec(path);
  if (m) {
    const section = m[1] === "dashboard" ? m[2] : m[1].startsWith("mobile-") ? m[1].slice(7).replace(/-v\d+$/, "") : m[1] === "w" ? "crew" : m[1];
    const name = section ? section.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Dashboard";
    return `App · ${name}`;
  }
  if (path === "/pricing") return "Pricing";
  return path;
}
/** What one event was, for the trail: a screen, a step, the checkout, the signup. */
function trailLabel(e: LiveEvent): string | null {
  if (e.event === E.completed) return "Signed up";
  if (e.event === E.opened || e.event === E.attempt) return "Checkout";
  if (e.event === E.step && e.step) return pageLabel(`registration:${e.step}`);
  const p = pathOf(e);
  return p ? screenLabel(p) : null;
}

export function shortId(person: string): string {
  const s = person.replace(/-/g, "");
  return s.length > 8 ? s.slice(-6) : s;
}

function envOf(e: LiveEvent): "production" | "development" {
  if (e.environment === "development" || e.environment === "production") return e.environment;
  const host = (e.hostname || domainOf(e.url)).toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local") ? "development" : "production";
}
function domainOf(url: string): string {
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].replace(/:\d+$/, "") : "";
}
function pathOf(e: LiveEvent): string {
  if (e.pathname) return e.pathname;
  const m = /^[a-z]+:\/\/[^/?#]+([^?#]*)/i.exec(e.url);
  return m ? m[1] || "/" : "";
}

/** The visitors of the window, newest activity first, signups on top. */
export function shapeLive(events: LiveEvent[], signups: FreshSignup[], now = Date.now(), opts: { includeDevelopment?: boolean } = {}): Omit<LiveReport, "status" | "message" | "fetchedAt"> {
  const windowStart = now - LIVE_WINDOW_MINUTES * 60_000;
  const activeSince = now - LIVE_ACTIVE_MINUTES * 60_000;
  const byPerson = new Map<string, LiveEvent[]>();
  for (const e of events) {
    if (!(e.at >= windowStart && e.at <= now + 60_000)) continue;
    if (!opts.includeDevelopment && envOf(e) === "development") continue;
    const key = e.person || e.distinctId;
    if (!key) continue;
    const list = byPerson.get(key);
    if (list) list.push(e);
    else byPerson.set(key, [e]);
  }
  const claimed = new Set<string>();
  const visitors: LiveVisitor[] = [];
  for (const [person, list] of byPerson) {
    list.sort((a, b) => a.at - b.at);
    // The latest visit: the events of the last session id seen (or all, when
    // the events carry none).
    const lastSession = [...list].reverse().find((e) => e.sessionId)?.sessionId ?? "";
    const visit = lastSession ? list.filter((e) => !e.sessionId || e.sessionId === lastSession) : list;
    const first = visit[0];
    const last = visit[visit.length - 1];
    const views = visit.filter((e) => e.event === "$pageview");
    // Where they are NOW is the last event that carries a page — a
    // registration step is not a pageview but it is a screen.
    const lastView = [...visit].reverse().find((e) => pathOf(e)) ?? last;
    const page = pathOf(lastView) || "/";
    const src = classifySource(first.utmSource, first.utmMedium, first.referrer, first.hostname || domainOf(first.url));
    // The furthest thing done in the whole window, any visit.
    let stage: LiveStage = "browsing";
    let signedUpAt: string | null = null;
    let plan = "";
    let outcome = "";
    for (const e of list) {
      let s: LiveStage = "browsing";
      if (e.event === E.completed && (e.verified === "true" || e.verified === "" || e.verified === "1")) {
        s = "signed-up";
        signedUpAt = new Date(e.at).toISOString();
        plan = e.plan || plan;
        outcome = e.outcome || outcome;
      } else if (e.event === E.opened || e.event === E.attempt) s = "checkout";
      else if (e.event === E.step || SIGNUP_PATH.test(pathOf(e))) s = "registering";
      else if (APP_PATH.test(pathOf(e))) s = "member";
      if (stageRank[s] > stageRank[stage]) stage = s;
    }
    // Tie the signup to the organization the database made minutes later:
    // the closest row in time whose tag agrees, each row claimed once.
    let signup: LiveVisitor["signup"] = null;
    if (stage === "signed-up" && signedUpAt) {
      const at = Date.parse(signedUpAt);
      let best: { s: FreshSignup; d: number } | null = null;
      for (const s of signups) {
        if (claimed.has(s.orgId)) continue;
        const d = Math.abs(Date.parse(s.createdAt) - at);
        if (d > SIGNUP_MATCH_MS) continue;
        const tagged = lower(first.utmCampaign) && lower(s.utmCampaign);
        if (tagged && lower(first.utmCampaign) !== lower(s.utmCampaign)) continue;
        if (!best || d < best.d) best = { s, d };
      }
      if (best) {
        claimed.add(best.s.orgId);
        signup = { orgName: best.s.orgName, ownerEmail: best.s.ownerEmail, ownerName: best.s.ownerName, at: best.s.createdAt, plan, outcome };
      }
    }
    // Where they are: the latest event that carries a GeoIP place.
    const located = [...list].reverse().find((e) => e.lat !== null && e.lon !== null);
    const geo = located ? { lat: located.lat, lon: located.lon, city: located.city, region: located.region, regionCode: located.regionCode, country: located.country, countryCode: located.countryCode } : null;
    // The trail: every screen and step in order, a repeat folded into its
    // neighbour; the last six.
    const trail: string[] = [];
    for (const e of visit) {
      const label = trailLabel(e);
      if (label && trail[trail.length - 1] !== label) trail.push(label);
    }
    while (trail.length > 6) trail.shift();
    visitors.push({
      id: shortId(person),
      stage,
      fromAd: src.fromAd,
      sourceKind: src.kind,
      source: src.label,
      campaign: first.utmCampaign || "",
      page,
      pageLabel: screenLabel(page),
      views: views.length,
      trail,
      firstAt: new Date(first.at).toISOString(),
      lastAt: new Date(last.at).toISOString(),
      active: last.at >= activeSince,
      device: lastView.device || first.device || "",
      browser: lastView.browser || first.browser || "",
      place: [first.city, first.region, first.country].filter(Boolean).join(", "),
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      city: geo?.city ?? first.city,
      region: geo?.region ?? first.region,
      regionCode: geo?.regionCode ?? first.regionCode,
      country: geo?.country ?? first.country,
      countryCode: geo?.countryCode ?? first.countryCode,
      environment: envOf(first),
      hostname: first.hostname || domainOf(first.url),
      signup,
      signedUpAt,
    });
  }
  // Signups first, then the people from ads who are on the site now, then
  // everyone else by their last move.
  visitors.sort((a, b) => {
    const sa = a.stage === "signed-up" ? 0 : 1;
    const sb = b.stage === "signed-up" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.fromAd !== b.fromAd) return a.fromAd ? -1 : 1;
    return Date.parse(b.lastAt) - Date.parse(a.lastAt);
  });
  const counts: LiveCounts = {
    onSite: visitors.filter((v) => v.active).length,
    fromAds: visitors.filter((v) => v.active && v.fromAd).length,
    signingUp: visitors.filter((v) => v.active && (v.stage === "registering" || v.stage === "checkout")).length,
    signedUp: visitors.filter((v) => v.stage === "signed-up").length,
    members: visitors.filter((v) => v.active && v.stage === "member").length,
  };
  const otherSignups = signups
    .filter((s) => !claimed.has(s.orgId))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12)
    .map((s) => ({ orgName: s.orgName, ownerEmail: s.ownerEmail, at: s.createdAt, source: signupSource(s).label }));
  return {
    windowMinutes: LIVE_WINDOW_MINUTES,
    activeMinutes: LIVE_ACTIVE_MINUTES,
    visitors,
    counts,
    today: { signups: signups.length, fromAds: signups.filter((s) => signupSource(s).fromAd).length },
    otherSignups,
  };
}

/** The one HogQL query behind the panel: the window's events, one row each. */
export function buildLiveQuery(windowMinutes = LIVE_WINDOW_MINUTES): string {
  const prop = (name: string) => `ifNull(toString(properties.${name}), '')`;
  const events = ["'$pageview'", ...[E.step, E.attempt, E.opened, E.completed, E.landingView, E.ctaClick].map((e) => `'${e}'`)].join(", ");
  return `SELECT toString(person_id), toString(distinct_id), event, toUnixTimestamp(timestamp) * 1000,
    ${prop("$pathname")}, ${prop("$current_url")}, ${prop("$session_id")},
    ${prop("jf_hostname")}, ${prop("jf_environment")},
    ${prop("utm_source")}, ${prop("utm_medium")}, ${prop("utm_campaign")}, ${prop("utm_content")},
    ${prop("$referring_domain")},
    ${prop("$device_type")}, ${prop("$browser")}, ${prop("$os")},
    ${prop("$geoip_country_name")}, ${prop("$geoip_subdivision_1_name")}, ${prop("$geoip_city_name")},
    ${prop("step")}, ${prop("outcome")}, ${prop("plan")}, ${prop("verified")},
    toFloat64OrNull(toString(properties.$geoip_latitude)), toFloat64OrNull(toString(properties.$geoip_longitude)),
    ${prop("$geoip_country_code")}, ${prop("$geoip_subdivision_1_code")}
    FROM events
    WHERE timestamp > now() - INTERVAL ${Math.max(5, Math.min(120, Math.round(windowMinutes)))} MINUTE AND event IN (${events})
    ORDER BY timestamp DESC LIMIT 4000`;
}

/** One query row → one LiveEvent (a bad row is skipped by the caller). */
export function liveEventFromRow(row: unknown[]): LiveEvent | null {
  const str = (i: number) => (typeof row[i] === "string" ? (row[i] as string) : row[i] == null ? "" : String(row[i]));
  const at = Number(row[3]);
  if (!Number.isFinite(at) || at <= 0) return null;
  const event = str(2);
  if (!event) return null;
  const coord = (i: number, limit: number) => {
    const v = typeof row[i] === "number" ? (row[i] as number) : row[i] == null || row[i] === "" ? NaN : Number(row[i]);
    return Number.isFinite(v) && Math.abs(v) <= limit && v !== 0 ? v : null;
  };
  const lat = coord(24, 90);
  const lon = coord(25, 180);
  return {
    person: str(0), distinctId: str(1), event, at,
    pathname: str(4), url: str(5), sessionId: str(6), hostname: str(7), environment: str(8),
    utmSource: str(9), utmMedium: str(10), utmCampaign: str(11), utmContent: str(12), referrer: str(13),
    device: str(14), browser: str(15), os: str(16), country: str(17), region: str(18), city: str(19),
    step: str(20), outcome: str(21), plan: str(22), verified: str(23),
    lat: lat !== null && lon !== null ? lat : null,
    lon: lat !== null && lon !== null ? lon : null,
    countryCode: str(26).toUpperCase().slice(0, 2),
    regionCode: str(27).toUpperCase().slice(0, 3),
  };
}

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
// Who counts and what is "from an ad": one rule for the whole page (2026-10-01).
import { BROWSER_TYPE_SQL, HOST_SQL, UA_SQL, carriesAdTag, isCountedEvent, sinceSql, visitorRuleSql } from "./traffic-visitor";
import { resolveLandingVariant, VARIANT_TRADE } from "@/components/v3/landing-e/landing-variants";

export const LIVE_WINDOW_MINUTES = 30;
export const LIVE_ACTIVE_MINUTES = 5;
/** PROSPECTS (owner, 2026-10-02): the map of people who might become
 *  customers keeps someone who signed up for this long after they did. */
export const CONVERTED_HOURS = 24;
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
  /** cta_click only: where the button sits, and the words on it. */
  placement: string;
  label: string;
  /** A signed-in member's organization and user ids (lib/traffic-client
   *  setTrafficMember, 2026-10-01); "" for everyone else. */
  orgId: string;
  userId: string;
  step: string;
  outcome: string;
  plan: string;
  verified: string;
  /** PostHog's GeoIP guess at the browser's place (null when it has none). */
  lat: number | null;
  lon: number | null;
  countryCode: string;
  regionCode: string;
  /** The ad platform's click id on the link, by name ("gclid", "fbclid"…), or "". */
  click: string;
  /** The browser's user agent and PostHog's own bot flag — the visitor rule (lib/traffic-visitor). */
  ua: string;
  browserType: string;
}

/** An organization created today, from the database. */
export interface FreshSignup {
  orgId: string;
  orgName: string;
  ownerEmail: string;
  ownerName: string;
  createdAt: string;
  /** What the account actually is, read from the Subscription row rather
   *  than from the browser event (2026-10-01). The event's `plan` is what
   *  the page said; this is what the database granted. Empty strings mean
   *  the organization has no subscription row at all. */
  plan: string;
  subStatus: string;
  trialEndsAt: string | null;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  landingIndustry: string;
}

/** How far a person got. "signing-in" is its own stage (2026-09-30): an
 *  existing customer at the login, forgot-password or reset screen is not a
 *  stranger looking around, and reading them as one made the list lie. */
export type LiveStage = "browsing" | "signing-in" | "registering" | "checkout" | "signed-up" | "member";
export type SourceKind = "ad" | "likely-ad" | "search" | "social" | "referral" | "direct";

/** The platforms a visit is credited to, each in its own colour (AVACO's),
 *  and which of them we run ads on — those get a card even at zero. */
export const PLATFORMS: Record<string, { name: string; colour: string; ads: boolean }> = {
  facebook: { name: "Facebook", colour: "#1877f2", ads: true },
  instagram: { name: "Instagram", colour: "#e1306c", ads: true },
  tiktok: { name: "TikTok", colour: "#fe2c55", ads: true },
  x: { name: "X (Twitter)", colour: "#0a0a0a", ads: true },
  google: { name: "Google Ads", colour: "#34a853", ads: true },
  youtube: { name: "YouTube", colour: "#ff0000", ads: false },
  bing: { name: "Bing", colour: "#008373", ads: false },
  linkedin: { name: "LinkedIn", colour: "#0a66c2", ads: false },
  snapchat: { name: "Snapchat", colour: "#f5c518", ads: false },
  reddit: { name: "Reddit", colour: "#ff4500", ads: false },
  nextdoor: { name: "Nextdoor", colour: "#8ed500", ads: false },
  pinterest: { name: "Pinterest", colour: "#e60023", ads: false },
  yelp: { name: "Yelp", colour: "#d32323", ads: false },
  search: { name: "Search", colour: "#555555", ads: false },
  direct: { name: "Direct", colour: "#888888", ads: false },
  other: { name: "Other sites", colour: "#b0aea8", ads: false },
};
export const AD_PLATFORM_KEYS = Object.keys(PLATFORMS).filter((k) => PLATFORMS[k].ads);
export const platformName = (key: string) => PLATFORMS[key]?.name ?? key;
export const platformColour = (key: string) => PLATFORMS[key]?.colour ?? PLATFORMS.other.colour;

/** Click ids the ad platforms add to a link: which platform, and whether the
 *  click was paid. fbclid rides every link clicked in Facebook or Instagram,
 *  paid or not, so it names the platform without proving an ad. */
export const CLICK_IDS: Record<string, { platform: string; paid: boolean }> = {
  gclid: { platform: "google", paid: true }, gbraid: { platform: "google", paid: true }, wbraid: { platform: "google", paid: true },
  ttclid: { platform: "tiktok", paid: true }, twclid: { platform: "x", paid: true }, msclkid: { platform: "bing", paid: true },
  li_fat_id: { platform: "linkedin", paid: true }, fbclid: { platform: "facebook", paid: false },
};
export const CLICK_ID_KEYS = Object.keys(CLICK_IDS);

export interface LiveVisitor {
  /** The person id, shortened for the eye. */
  id: string;
  stage: LiveStage;
  /** True for a tagged ad and for an untagged ad-platform referrer. */
  fromAd: boolean;
  sourceKind: SourceKind;
  /** "Facebook ad", "Google search", "Direct", "yelp.com"… */
  source: string;
  /** The platform the visit is credited to (a PLATFORMS key). */
  platform: string;
  campaign: string;
  /** utm_content — the ad itself, as Meta and TikTok name it. */
  content: string;
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
  signup: { orgName: string; ownerEmail: string; ownerName: string; at: string; plan: string; outcome: string;
    /** "Free trial · 12 days left", "Professional · paying", "Free plan" — the
     *  answer to "they signed up, but for what?". */
    planLabel: string } | null;
  /** The verified signup this visit produced even when no row matched. */
  signedUpAt: string | null;
  /** What they pressed, newest first: the words on the button and where it
   *  sits on the page. Only the landing's tagged CTAs fire this. */
  clicks: Array<{ label: string; placement: string; at: string }>;
  /** They asked for a password reset or opened one. A support signal: this
   *  is a customer who cannot get back in, not a visitor. */
  lockedOut: boolean;
  /** One sentence for what this visit is, written from the trail. */
  summary: string;
  /** The trade the ad sent them to — the landing's `?industry=` ("Roofing",
   *  "HVAC"…), or the trade the account signed up with; "" when unknown. */
  trade: string;
  /** A signed-in member's organization and user ids, from their events. */
  orgId: string;
  userId: string;
  /** Filled in by the admin's server action from orgId / userId. */
  member?: { orgName: string; userName: string } | null;
}

export interface LiveCounts {
  onSite: number;
  fromAds: number;
  signingUp: number;
  signedUp: number;
  members: number;
}

/** The whole-site visitor totals behind the live view (2026-09-30). The live
 *  window only ever holds half an hour; these are the numbers the owner looks
 *  for first — how many people in all, how many today, and how today stands
 *  against the same hour yesterday — so the live section answers everything
 *  without scrolling to the report below it. Counted twice, with and without
 *  localhost, so the panel's own "Include localhost" switch picks an answer
 *  without a second query. */
export interface LiveTotals {
  /** Unique people with a pageview, ever. */
  allTime: number;
  /** Unique people today, in the admin's timezone. */
  today: number;
  /** Yesterday up to this same clock time — what today is beating, or not. */
  yesterdaySoFar: number;
  /** All of yesterday. */
  yesterday: number;
  /** Unique people in the last seven days. */
  last7Days: number;
  /** Pageviews today — views, not people. */
  viewsToday: number;
}
/** The same totals counted both ways; the caller picks by the dev switch. */
export interface LiveTotalsPair { all: LiveTotals; production: LiveTotals }

/** One platform's window: who it brought, from ads or not, how far they got. */
export interface LivePlatform {
  platform: string;
  name: string;
  colour: string;
  /** We run ads here — shown even at zero. */
  ads: boolean;
  visitors: number;
  onSite: number;
  fromAds: number;
  organic: number;
  signingUp: number;
  signedUp: number;
  /** Today's signups the database credits to this platform (utm_source). */
  signedUpToday: number;
  /** The campaigns and ads seen in the window, most visitors first. */
  campaigns: Array<{ campaign: string; content: string; visitors: number; signedUp: number }>;
}

export interface LiveReport {
  status: "ok" | "disabled" | "error";
  message?: string;
  fetchedAt: string;
  windowMinutes: number;
  activeMinutes: number;
  visitors: LiveVisitor[];
  counts: LiveCounts;
  /** Site-wide visitor totals (null when the totals query did not answer —
   *  the live window is still shown). */
  totals: LiveTotals | null;
  /** How far into the local day it is, in minutes. A count of 0 visitors at
   *  00:12 is not the same news as 0 at 16:00, and the panel has to say
   *  which it is rather than print a bare zero. */
  dayAgeMinutes: number;
  /** The whole live section in one sentence, written server-side so the
   *  wording is testable. */
  headline: string;
  /** The ad platforms first (always), then any other platform with a visitor. */
  platforms: LivePlatform[];
  /** The day's organizations from the database, and how many came from ads. */
  today: { signups: number; fromAds: number };
  /** Fresh organizations no live visitor could be tied to (their visit was
   *  before the window, or the browser blocked analytics). */
  otherSignups: Array<{ orgName: string; ownerEmail: string; at: string; source: string; planLabel: string }>;
  /** Everyone who completed a signup in the last CONVERTED_HOURS, shaped
   *  like a visitor (stage "signed-up"), whether or not their visit is still
   *  inside the window. The prospects map keeps them for a day (prospectsOf). */
  converted: LiveVisitor[];
  /** Names the owner gave ad and campaign ids (Meta sends {{campaign.id}} /
   *  {{ad.id}} as numbers), keyed by the id as it arrives. Filled in by the
   *  admin's server action. */
  adNames?: Record<string, string>;
}

/** The SyncState key a name for an ad or campaign id is kept under. */
export const adNameKey = (id: string) => `adname:${id.trim()}`;
/** An ad tag worth naming: a bare platform id (a long run of digits). */
export const isAdId = (value: string) => /^\d{8,}$/.test(value.trim());

/** The trade an ad sent them to: the first `?industry=` / `?trade=` the
 *  visit's pages carried (kept in the tracked URL since 2026-10-01). */
export function landingTradeOf(urls: readonly string[]): string {
  for (const u of urls) {
    if (!u || !u.includes("?")) continue;
    try {
      const q = new URL(u, "https://www.jobflex.app").searchParams;
      const key = resolveLandingVariant(q.get("industry") ?? q.get("trade"));
      if (key) return VARIANT_TRADE[key];
    } catch { /* a malformed URL names no trade */ }
  }
  return "";
}

/** Every ad and campaign tag the report shows — what the server looks names up for. */
export function adTagsOf(report: Pick<LiveReport, "visitors" | "platforms"> & { converted?: LiveVisitor[] }): string[] {
  const out = new Set<string>();
  for (const v of [...report.visitors, ...(report.converted ?? [])]) { if (v.campaign) out.add(v.campaign); if (v.content) out.add(v.content); }
  for (const p of report.platforms) for (const c of p.campaigns) { if (c.campaign) out.add(c.campaign); if (c.content) out.add(c.content); }
  return [...out].filter((t) => t.length <= 120);
}

const AD_MEDIUMS = new Set(["cpc", "ppc", "paid", "paid_social", "paidsocial", "paid-social", "social-paid", "ads", "ad", "display", "retargeting", "remarketing", "cpm", "cpv", "cpa", "sponsored", "promoted", "boost", "boosted", "banner", "video-ad", "lead-ad", "leadgen", "instant-form"]);
/** utm_source spellings → the platform key. Meta's own {{site_source_name}}
 *  fills in fb / ig / msg / an; Google Ads, adwords; the rest as people type them. */
const SOURCE_PLATFORM: Record<string, string> = {
  facebook: "facebook", fb: "facebook", meta: "facebook", msg: "facebook", messenger: "facebook", an: "facebook",
  instagram: "instagram", ig: "instagram",
  google: "google", googleads: "google", adwords: "google", gads: "google", "google-ads": "google",
  youtube: "youtube", yt: "youtube",
  tiktok: "tiktok", tt: "tiktok",
  bing: "bing", microsoft: "bing", msads: "bing",
  linkedin: "linkedin", nextdoor: "nextdoor", yelp: "yelp", reddit: "reddit",
  x: "x", twitter: "x", "x.com": "x",
  pinterest: "pinterest", snapchat: "snapchat", snap: "snapchat",
};
/** The platform's name as the source line says it — "Facebook ad", not "Facebook Ads ad". */
const SOURCE_LABEL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", google: "Google", youtube: "YouTube", tiktok: "TikTok", bing: "Bing", linkedin: "LinkedIn", nextdoor: "Nextdoor", yelp: "Yelp", reddit: "Reddit", x: "X", pinterest: "Pinterest", snapchat: "Snapchat" };
/** Referrers that are almost always an ad click on a contractor SaaS landing. */
const SOCIAL_AD_DOMAINS: Array<[RegExp, string]> = [
  [/(^|\.)facebook\.com$|^l\.facebook\.com$|^lm\.facebook\.com$|^m\.facebook\.com$|(^|\.)fb\.com$|(^|\.)messenger\.com$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "youtube"],
  [/(^|\.)snapchat\.com$/, "snapchat"],
];
const SOCIAL_DOMAINS: Array<[RegExp, string]> = [
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "linkedin"],
  [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, "x"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)nextdoor\.com$/, "nextdoor"],
  [/(^|\.)pinterest\.com$/, "pinterest"],
];
/** Other sites that get a card of their own when they send someone. */
const REFERRAL_PLATFORMS: Array<[RegExp, string]> = [[/(^|\.)yelp\.com$/, "yelp"]];
const SEARCH_DOMAINS: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)yahoo\.[a-z.]+$/, "Yahoo"],
  [/(^|\.)ecosia\.org$/, "Ecosia"],
  [/(^|\.)brave\.com$/, "Brave"],
];

const lower = (s: string) => s.trim().toLowerCase();

export interface SourceRead { kind: SourceKind; label: string; fromAd: boolean; platform: string }

/** Where a visit came from, read off its first event: the tag first, then
 *  the platform's click id, then the referrer.
 *
 *  FROM AN AD (owner, 2026-10-01): only a visit that carries utm_source or
 *  fbclid (traffic-visitor carriesAdTag). An untagged Facebook / Instagram /
 *  TikTok referrer is that platform's link, not an ad; a Google, TikTok or X
 *  click id with no utm tag is named but not counted. A tagged post
 *  (utm_medium social, email, referral, organic) stays a post. */
export function classifySource(utmSource: string, utmMedium: string, referrer: string, hostname: string, click = ""): SourceRead {
  const src = lower(utmSource);
  const med = lower(utmMedium);
  const ref = lower(referrer).replace(/^www\./, "");
  const clickId = CLICK_IDS[lower(click)];
  if (src) {
    const key = SOURCE_PLATFORM[src] ?? "other";
    const platform = SOURCE_LABEL[key] ?? utmSource.trim();
    const paid = AD_MEDIUMS.has(med) || /paid|cpc|ppc|\bads?\b/.test(med) || Boolean(clickId?.paid);
    if (paid) return { kind: "ad", label: `${platform} ad`, fromAd: true, platform: key };
    if (key !== "other" && PLATFORMS[key]?.ads && !med) return { kind: "likely-ad", label: `${platform} · tagged, no medium`, fromAd: true, platform: key };
    if (med === "social" || med === "organic_social") return { kind: "social", label: `${platform} · post`, fromAd: false, platform: key };
    if (med === "email" || med === "newsletter") return { kind: "referral", label: `${platform} · email`, fromAd: false, platform: key };
    if (med === "referral" || med === "affiliate" || med === "partner") return { kind: "referral", label: `${platform} · ${med}`, fromAd: false, platform: key };
    if (med === "organic" || med === "search") return { kind: "search", label: `${platform} search`, fromAd: false, platform: key === "other" ? "search" : key };
    return { kind: "referral", label: med ? `${platform} · ${utmMedium.trim()}` : platform, fromAd: false, platform: key };
  }
  // fbclid with no tag: Meta's own ad link (the in-app browser sends no referrer).
  if (carriesAdTag("", click)) return { kind: "likely-ad", label: `${SOURCE_LABEL[clickId?.platform ?? "facebook"] ?? "Facebook"} · fbclid, no utm tag`, fromAd: true, platform: clickId?.platform ?? "facebook" };
  // Any other click id with no tag: named, not counted as an ad.
  if (clickId) return { kind: "referral", label: `${SOURCE_LABEL[clickId.platform] ?? clickId.platform} · click id, no utm tag`, fromAd: false, platform: clickId.platform };
  const own = !ref || ref === "$direct" || ref === hostname.toLowerCase().replace(/^www\./, "");
  if (own) return { kind: "direct", label: "Direct", fromAd: false, platform: "direct" };
  for (const [re, key] of SOCIAL_AD_DOMAINS) if (re.test(ref)) return { kind: "social", label: `${SOURCE_LABEL[key]} · untagged link`, fromAd: false, platform: key };
  for (const [re, name] of SEARCH_DOMAINS) if (re.test(ref)) return { kind: "search", label: `${name} search`, fromAd: false, platform: "search" };
  for (const [re, key] of SOCIAL_DOMAINS) if (re.test(ref)) return { kind: "social", label: SOURCE_LABEL[key] ?? key, fromAd: false, platform: key };
  const known = REFERRAL_PLATFORMS.find(([re]) => re.test(ref));
  return { kind: "referral", label: ref, fromAd: false, platform: known ? known[1] : "other" };
}

/** A database signup's own source, in the same words. */
export function signupSource(s: { utmSource: string; utmMedium: string }): { label: string; fromAd: boolean; platform: string } {
  const c = classifySource(s.utmSource, s.utmMedium, "", "");
  return { label: c.kind === "direct" ? "Untagged" : c.label, fromAd: c.fromAd, platform: c.kind === "direct" ? "direct" : c.platform };
}

const APP_PATH = /^\/(dashboard|mobile-|w\/|portal|worker)/;
const SIGNUP_PATH = /^\/auth\/register/;
/** Signing in, and the locked-out corner of it. A visitor here already has an
 *  account; counting them as "looking around" hid every returning customer
 *  and every person who could not get back in. */
const SIGNIN_PATH = /^\/auth\/(login|signin|sign-in)/;
const RECOVER_PATH = /^\/auth\/(forgot|reset|recover)/;
const VERIFY_PATH = /^\/auth\/(verify|confirm)/;

const stageRank: Record<LiveStage, number> = { browsing: 0, "signing-in": 1, member: 2, registering: 3, checkout: 4, "signed-up": 5 };

/** The screens worth naming in words, because the live list is read at a
 *  glance (2026-09-30). "/auth/reset" told the owner nothing and, worse, it
 *  looked like browsing; "Resetting their password" says who that is and
 *  that they are stuck. These names are the LIVE view's only — the report's
 *  page table keeps `pageLabel`'s shorter ones so its rows stay comparable
 *  with the history. */
const PLAIN_SCREEN: Record<string, string> = {
  "/": "Landing page",
  "/pricing": "Pricing",
  "/auth/login": "Signing in",
  "/auth/signin": "Signing in",
  "/auth/sign-in": "Signing in",
  "/auth/register": "Sign-up form",
  "/auth/forgot": "Forgot password",
  "/auth/reset": "Setting a new password",
  "/auth/recover": "Account recovery",
  "/auth/verify": "Verifying their email",
  "/auth/confirm": "Confirming their email",
  "/auth/logout": "Signing out",
};

/** A screen's plain name: the report's labels, the app's own screens by
 *  section ("App · Jobs"), the rest by path. */
export function screenLabel(path: string): string {
  const plain = PLAIN_SCREEN[path.replace(/\/+$/, "") || "/"];
  if (plain) return plain;
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

/** One sentence for what a visit is (2026-09-30). The list used to make the
 *  owner read a trail of paths and work it out; this says it. Written from
 *  what we actually saw, and it never guesses: a visitor with no tracked
 *  click is "no button we track", not "clicked nothing". */
export function visitSummary(v: {
  stage: LiveStage;
  lockedOut: boolean;
  views: number;
  trail: string[];
  clicks: Array<{ label: string; placement: string }>;
  active: boolean;
  signup: { orgName: string } | null;
  step: number;
  fromAd: boolean;
  source: string;
}): string {
  const pressed = v.clicks[0]
    ? `Pressed “${v.clicks[0].label}”${v.clicks[0].placement ? ` in the ${v.clicks[0].placement.replace(/[-_]/g, " ")}` : ""}.`
    : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join(" ");

  if (v.stage === "signed-up") {
    return join(v.signup ? `Signed up — the account ${v.signup.orgName} exists in the database.` : "Signed up, but no organization row matched it yet.", pressed);
  }
  if (v.stage === "member") {
    return join(
      v.lockedOut ? "Got back in after a password reset, and is working in the app." : "An existing customer working in the app.",
      v.active ? "" : "Has since left.",
    );
  }
  if (v.stage === "signing-in") {
    if (v.lockedOut) return join("Locked out — asked for a password reset.", v.active ? "Still on it." : "Gave up for now.", "Worth a look if it repeats.");
    return join("An existing customer signing back in.", v.active ? "" : "Left before reaching the app.");
  }
  if (v.stage === "checkout") return join("At checkout, choosing a plan.", pressed);
  if (v.stage === "registering") {
    const where = v.step > 0 ? `reached step ${v.step}` : "opened the form";
    return join(`Filling in the sign-up form — ${where}.`, v.active ? "" : "Stopped there.", pressed);
  }
  // Browsing. One sentence, not two saying the same thing: a visitor who
  // left after one page is a bounce, and that is the whole story.
  const last = v.trail[v.trail.length - 1] || "the first page";
  if (v.views <= 1 && !v.active) {
    return join(`Left from ${v.trail[0] || "the first page"} without opening a second page${v.fromAd ? " — an ad click that bounced" : ""}.`, pressed);
  }
  if (v.views <= 1) return join("Landed, and has not opened a second page yet.", pressed);
  return join(`Reading — ${v.views} pages so far${v.trail.length > 1 ? `, now on ${last}` : ""}.`, v.active ? "" : "Has since left.", pressed);
}

/** What an account actually is, in the words the owner asked for:
 *  "they signed up — but for what, a free trial or what?" (2026-10-01).
 *
 *  Read from the Subscription row, which is Stripe's truth mirrored by the
 *  webhooks, not from the browser event that said what the page offered.
 *  An organization with no subscription row yet says so rather than being
 *  quietly called free: that is a real state, usually a signup caught in
 *  the seconds before the row is written. */
export function signupPlanLabel(sub: { plan: string; subStatus: string; trialEndsAt: string | null }, now = Date.now()): string {
  const plan = (sub.plan || "").trim();
  const status = (sub.subStatus || "").trim().toUpperCase();
  if (!status && !plan) return "no subscription row yet";
  const pretty = plan && plan.toUpperCase() !== "FREE"
    ? plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase()
    : "";
  switch (status) {
    case "TRIALING": {
      const ends = sub.trialEndsAt ? Date.parse(sub.trialEndsAt) : NaN;
      if (!Number.isFinite(ends)) return pretty ? `Free trial · ${pretty}` : "Free trial";
      // Whole days remaining, rounded DOWN: a trial with six hours on it
      // "ends today" rather than claiming a day the owner does not have.
      const ms = ends - now;
      const days = Math.floor(ms / 86_400_000);
      const left = ms <= 0 ? "trial expired" : days === 0 ? "ends today" : days === 1 ? "1 day left" : `${days} days left`;
      return `${pretty ? `Free trial · ${pretty}` : "Free trial"} · ${left}`;
    }
    case "ACTIVE": return pretty ? `${pretty} · paying` : "Paying";
    case "PAST_DUE": return `${pretty || "Paid plan"} · payment failed`;
    case "CANCELED": return `${pretty || "Paid plan"} · canceled`;
    case "EXPIRED": return `${pretty || "Paid plan"} · expired`;
    case "FREE": return "Free plan";
    default: return pretty ? `${pretty} · ${status.toLowerCase().replace(/_/g, " ")}` : status ? status.toLowerCase().replace(/_/g, " ") : "no subscription row yet";
  }
}

/** THE SIGNUP LEDGER (2026-10-01).
 *
 *  The live list holds half an hour and the day line holds a day, so a signup
 *  older than that had nowhere left to be seen — which is how an account the
 *  owner watched arrive became an account he could not find again. Nothing
 *  new is stored for this: every signup is already an Organization row with
 *  the landing's tags on it and a Subscription beside it. This is a reading
 *  of those rows over a span the owner picks, so the record lasts as long as
 *  the accounts do. */
export type SignupState = "trial" | "paying" | "lapsed" | "free" | "unknown";

export interface SignupRecord {
  orgId: string;
  orgName: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  /** Where the landing recorded them as coming from. */
  source: string;
  fromAd: boolean;
  platform: string;
  campaign: string;
  content: string;
  /** The trade hero the landing showed them, "default" when none. */
  industry: string;
  /** What the account is now, from its Subscription row. */
  planLabel: string;
  state: SignupState;
}

/** The coarse state a subscription is in, for the colour and the counts. */
export function signupState(subStatus: string): SignupState {
  switch ((subStatus || "").trim().toUpperCase()) {
    case "TRIALING": return "trial";
    case "ACTIVE": return "paying";
    case "PAST_DUE": case "CANCELED": case "EXPIRED": return "lapsed";
    case "FREE": return "free";
    default: return "unknown";
  }
}

export interface SignupLedger {
  days: number;
  records: SignupRecord[];
  summary: { total: number; fromAds: number; trial: number; paying: number; lapsed: number; free: number; unknown: number };
  /** True when the span held more accounts than the page asked for. */
  truncated: boolean;
}

/** The counts under the ledger — what the span actually produced. */
export function signupLedgerSummary(records: SignupRecord[]): SignupLedger["summary"] {
  const n = (st: SignupState) => records.filter((r) => r.state === st).length;
  return {
    total: records.length,
    fromAds: records.filter((r) => r.fromAd).length,
    trial: n("trial"), paying: n("paying"), lapsed: n("lapsed"), free: n("free"), unknown: n("unknown"),
  };
}

/** How far into the local day it is, in minutes. */
export function minutesIntoDay(timezone: string, now: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const m = n("hour") * 60 + n("minute");
    return Number.isFinite(m) && m >= 0 && m < 1440 ? m : 0;
  } catch {
    return 0;
  }
}

/** The whole live section in one sentence (2026-10-01).
 *
 *  Ten tiles of zeros told the owner nothing and, just after midnight, read
 *  as a broken page. This says what is actually true: who is here, what the
 *  day has done so far, and — when the day is minutes old — that the day is
 *  minutes old, which is the whole reason the number is small. */
export function liveHeadline(r: {
  onSite: number;
  fromAds: number;
  signingUp: number;
  windowVisitors: number;
  windowMinutes: number;
  todayVisitors: number | null;
  todaySignups: number;
  yesterdaySoFar: number | null;
  yesterdayTotal: number | null;
  dayAgeMinutes: number;
  topPlatform: { name: string; visitors: number } | null;
}): string {
  const parts: string[] = [];

  // 1. Who is here this minute.
  if (r.onSite > 0) {
    const who = `${r.onSite} ${r.onSite === 1 ? "person is" : "people are"} on the site right now`;
    const ads = r.fromAds > 0 ? `, ${r.fromAds} of them from an ad` : "";
    parts.push(`${who}${ads}.`);
    if (r.signingUp > 0) parts.push(`${r.signingUp} ${r.signingUp === 1 ? "is" : "are"} filling in the sign-up form.`);
  } else if (r.windowVisitors > 0) {
    parts.push(`Nobody on the site this minute, but ${r.windowVisitors} came through in the last ${r.windowMinutes} minutes.`);
  } else {
    parts.push(`Quiet — nobody in the last ${r.windowMinutes} minutes.`);
  }

  // 2. Which platform is doing the work, when one is.
  if (r.topPlatform && r.topPlatform.visitors > 0) {
    parts.push(`${r.topPlatform.name} brought the most of them (${r.topPlatform.visitors}).`);
  }

  // 3. The day so far — and why it might look empty.
  const young = r.dayAgeMinutes < 120;
  if (r.todayVisitors === null) {
    // No totals this time round; say nothing rather than guess.
  } else if (young) {
    const age = r.dayAgeMinutes < 60 ? `${Math.max(1, r.dayAgeMinutes)} minutes` : `${Math.floor(r.dayAgeMinutes / 60)} hour${r.dayAgeMinutes >= 120 ? "s" : ""}`;
    const sofar = r.todayVisitors === 0 ? "No visitors yet today" : `${r.todayVisitors} ${r.todayVisitors === 1 ? "visitor" : "visitors"} so far today`;
    const ref = r.yesterdayTotal && r.yesterdayTotal > 0 ? `; yesterday finished at ${r.yesterdayTotal}` : "";
    parts.push(`${sofar} — the day is only ${age} old${ref}.`);
  } else if (r.yesterdaySoFar && r.yesterdaySoFar > 0) {
    const delta = Math.round(((r.todayVisitors - r.yesterdaySoFar) / r.yesterdaySoFar) * 100);
    const verdict = delta > 4 ? `${delta}% ahead of` : delta < -4 ? `${Math.abs(delta)}% behind` : "level with";
    parts.push(`${r.todayVisitors} visitors today, ${verdict} this time yesterday.`);
  } else {
    parts.push(`${r.todayVisitors} ${r.todayVisitors === 1 ? "visitor" : "visitors"} today.`);
  }

  // 4. Did any of it turn into an account.
  if (r.todaySignups > 0) parts.push(`${r.todaySignups} signed up today.`);
  else if (!young && r.todayVisitors) parts.push("No signups yet today.");

  return parts.join(" ");
}

/** The visitors of the window, newest activity first, signups on top. */
export function shapeLive(events: LiveEvent[], signups: FreshSignup[], now = Date.now(), opts: { includeDevelopment?: boolean; fullHistory?: boolean; windowMinutes?: number } = {}): Omit<LiveReport, "status" | "message" | "fetchedAt"> {
  // The half hour, or the day when the converts are shaped (traffic-server).
  const windowMinutes = opts.windowMinutes ?? LIVE_WINDOW_MINUTES;
  const windowStart = now - windowMinutes * 60_000;
  const activeSince = now - LIVE_ACTIVE_MINUTES * 60_000;
  const byPerson = new Map<string, LiveEvent[]>();
  for (const e of events) {
    if (!(e.at >= windowStart && e.at <= now + 60_000)) continue;
    // The page's one visitor rule: production hosts (localhost on the switch), no bots, no previews.
    if (!isCountedEvent({ event: e.event, hostname: e.hostname || domainOf(e.url), ua: e.ua, browserType: e.browserType, at: e.at }, !!opts.includeDevelopment, !!opts.fullHistory)) continue;
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
    // The first event usually carries the tag and the click id; a later one
    // may (a tagged link opened mid-visit), so the first that has any wins.
    const tagged = visit.find((e) => e.utmSource || e.click) ?? first;
    const src = classifySource(tagged.utmSource, tagged.utmMedium, first.referrer, first.hostname || domainOf(first.url), tagged.click);
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
      else if (SIGNIN_PATH.test(pathOf(e)) || RECOVER_PATH.test(pathOf(e)) || VERIFY_PATH.test(pathOf(e))) s = "signing-in";
      if (stageRank[s] > stageRank[stage]) stage = s;
    }
    // Locked out: they asked for a reset link or opened one. Worth its own
    // flag — it is the one stage that wants a human, not a nudge.
    const lockedOut = list.some((e) => RECOVER_PATH.test(pathOf(e)));
    // The furthest numbered sign-up step they reached, for the sentence.
    const furthestStep = list.reduce((best, e) => (e.event === E.step && /^\d+$/.test(e.step) ? Math.max(best, Number(e.step)) : best), 0);
    // What they pressed. Only the landing's tagged CTAs fire cta_click, so an
    // empty list means "nothing we track", never "they clicked nothing".
    const clicks = [...list]
      .reverse()
      .filter((e) => e.event === E.ctaClick && (e.label || e.placement))
      .slice(0, 3)
      .map((e) => ({ label: e.label || "a button", placement: e.placement || "", at: new Date(e.at).toISOString() }));
    // Tie the signup to the organization the database made minutes later:
    // the closest row in time whose tag agrees, each row claimed once.
    let signup: LiveVisitor["signup"] = null;
    let signupTrade = "";
    if (stage === "signed-up" && signedUpAt) {
      const at = Date.parse(signedUpAt);
      let best: { s: FreshSignup; d: number } | null = null;
      for (const s of signups) {
        if (claimed.has(s.orgId)) continue;
        const d = Math.abs(Date.parse(s.createdAt) - at);
        if (d > SIGNUP_MATCH_MS) continue;
        const bothTagged = lower(tagged.utmCampaign) && lower(s.utmCampaign);
        if (bothTagged && lower(tagged.utmCampaign) !== lower(s.utmCampaign)) continue;
        if (!best || d < best.d) best = { s, d };
      }
      if (best) {
        claimed.add(best.s.orgId);
        signupTrade = best.s.landingIndustry ? (VARIANT_TRADE[resolveLandingVariant(best.s.landingIndustry) as keyof typeof VARIANT_TRADE] ?? best.s.landingIndustry) : "";
        signup = { orgName: best.s.orgName, ownerEmail: best.s.ownerEmail, ownerName: best.s.ownerName, at: best.s.createdAt, plan, outcome, planLabel: signupPlanLabel(best.s, now) };
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
      platform: src.platform,
      campaign: tagged.utmCampaign || "",
      content: tagged.utmContent || "",
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
      clicks,
      lockedOut,
      trade: landingTradeOf(visit.map((e) => e.url)) || signupTrade,
      orgId: [...list].reverse().find((e) => e.orgId)?.orgId ?? "",
      userId: [...list].reverse().find((e) => e.userId)?.userId ?? "",
      summary: visitSummary({ stage, lockedOut, views: views.length, trail, clicks, active: last.at >= activeSince, signup, step: furthestStep, fromAd: src.fromAd, source: src.label }),
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
    .map((s) => ({ orgName: s.orgName, ownerEmail: s.ownerEmail, at: s.createdAt, source: signupSource(s).label, planLabel: signupPlanLabel(s, now) }));
  return {
    windowMinutes,
    activeMinutes: LIVE_ACTIVE_MINUTES,
    visitors,
    counts,
    totals: null,
    dayAgeMinutes: 0,
    headline: "",
    platforms: platformCards(visitors, signups),
    today: { signups: signups.length, fromAds: signups.filter((s) => signupSource(s).fromAd).length },
    otherSignups,
    converted: [],
  };
}

/** PROSPECTS (owner, 2026-10-02): the map of the people who might become
 *  customers. Members in the app and customers signing in are left off —
 *  they are not converting, they have. Someone who signed up stays on it
 *  for CONVERTED_HOURS after they did, as "signed up": even when their
 *  latest visit is already inside the app (a trial poking around), and even
 *  after their visit has left the half-hour window — `converted` is the
 *  day's signups shaped over a day-long window. A convert the window still
 *  holds keeps the window's fresher trail, with the signup written on it. */
export function prospectsOf(visitors: LiveVisitor[], converted: LiveVisitor[], now = Date.now()): LiveVisitor[] {
  const since = now - CONVERTED_HOURS * 3_600_000;
  const recent = new Map(converted.filter((c) => c.signedUpAt && Date.parse(c.signedUpAt) >= since).map((c) => [c.id, c]));
  const out: LiveVisitor[] = [];
  for (const v of visitors) {
    const c = recent.get(v.id);
    if (c) {
      recent.delete(v.id);
      out.push({ ...v, stage: "signed-up", signedUpAt: v.signedUpAt ?? c.signedUpAt, signup: v.signup ?? c.signup, trade: v.trade || c.trade, campaign: v.campaign || c.campaign, content: v.content || c.content });
      continue;
    }
    if (v.stage === "member" || v.stage === "signing-in") continue;
    out.push(v);
  }
  for (const c of recent.values()) out.push(c);
  return out;
}

/** The platform cards: every ad platform (even at zero), then the others
 *  with a visitor, each with who it brought in the window, from ads or not,
 *  how far they got, today's signups the database credits to it, and the
 *  campaigns and ads seen. */
export function platformCards(visitors: LiveVisitor[], signups: FreshSignup[]): LivePlatform[] {
  const by = new Map<string, LivePlatform>();
  const card = (key: string): LivePlatform => {
    const found = by.get(key);
    if (found) return found;
    const meta = PLATFORMS[key] ?? PLATFORMS.other;
    const fresh: LivePlatform = { platform: key, name: meta.name, colour: meta.colour, ads: meta.ads, visitors: 0, onSite: 0, fromAds: 0, organic: 0, signingUp: 0, signedUp: 0, signedUpToday: 0, campaigns: [] };
    by.set(key, fresh);
    return fresh;
  };
  for (const key of AD_PLATFORM_KEYS) card(key);
  const campaignsBy = new Map<string, Map<string, { campaign: string; content: string; visitors: number; signedUp: number }>>();
  for (const v of visitors) {
    const key = PLATFORMS[v.platform] ? v.platform : "other";
    const c = card(key);
    c.visitors++;
    if (v.active) c.onSite++;
    if (v.fromAd) c.fromAds++; else c.organic++;
    if (v.stage === "registering" || v.stage === "checkout") c.signingUp++;
    if (v.stage === "signed-up") c.signedUp++;
    if (v.campaign || v.content) {
      const list = campaignsBy.get(key) ?? new Map();
      const id = `${v.campaign}\u0000${v.content}`;
      const row = list.get(id) ?? { campaign: v.campaign, content: v.content, visitors: 0, signedUp: 0 };
      row.visitors++;
      if (v.stage === "signed-up") row.signedUp++;
      list.set(id, row);
      campaignsBy.set(key, list);
    }
  }
  for (const s of signups) {
    const p = signupSource(s).platform;
    if (p === "direct") continue;
    card(PLATFORMS[p] ? p : "other").signedUpToday++;
  }
  for (const [key, list] of campaignsBy) card(key).campaigns = [...list.values()].sort((a, b) => b.visitors - a.visitors).slice(0, 4);
  // The ad platforms in their fixed order, so the cards never jump around as
  // traffic shifts; then the other named platforms by visitors; then search,
  // direct and other sites, always last.
  const TAIL = ["search", "direct", "other"];
  const order = (p: LivePlatform) => (p.ads ? AD_PLATFORM_KEYS.indexOf(p.platform) : TAIL.includes(p.platform) ? 100 + TAIL.indexOf(p.platform) : 50);
  return [...by.values()]
    .filter((p) => p.ads || p.visitors > 0 || p.signedUpToday > 0)
    .sort((a, b) => order(a) - order(b) || b.visitors - a.visitors || b.signedUpToday - a.signedUpToday || a.name.localeCompare(b.name));
}

/** The events the live view reads, as a HogQL list. */
const liveEventsSql = () => ["'$pageview'", ...[E.step, E.attempt, E.opened, E.completed, E.landingView, E.ctaClick].map((e) => `'${e}'`)].join(", ");

/** The one HogQL query behind the panel: the window's events, one row each. */
export function buildLiveQuery(windowMinutes = LIVE_WINDOW_MINUTES): string {
  return `${liveSelectSql()}
    WHERE timestamp > now() - INTERVAL ${Math.max(5, Math.min(120, Math.round(windowMinutes)))} MINUTE AND event IN (${liveEventsSql()})
    ORDER BY timestamp DESC LIMIT 4000`;
}

/** The last day's events of everyone who completed a signup in it, for the
 *  prospects map (which keeps a convert for CONVERTED_HOURS): the same
 *  columns, so the same parser and shaping read them. The subquery is on
 *  distinct_id — the server-side completion event and the browser's own
 *  pageviews share it. */
export function buildConvertedQuery(hours = CONVERTED_HOURS): string {
  const h = Math.max(1, Math.min(72, Math.round(hours)));
  return `${liveSelectSql()}
    WHERE timestamp > now() - INTERVAL ${h} HOUR AND event IN (${liveEventsSql()})
      AND distinct_id IN (SELECT distinct_id FROM events WHERE event = '${E.completed}' AND timestamp > now() - INTERVAL ${h} HOUR)
    ORDER BY timestamp DESC LIMIT 3000`;
}

/** The columns every live row carries, in the order liveEventFromRow reads them. */
function liveSelectSql(): string {
  const prop = (name: string) => `ifNull(toString(properties.${name}), '')`;
  return `SELECT toString(person_id), toString(distinct_id), event, toUnixTimestamp(timestamp) * 1000,
    ${prop("$pathname")}, ${prop("$current_url")}, ${prop("$session_id")},
    ${prop("jf_hostname")}, ${prop("jf_environment")},
    ${prop("utm_source")}, ${prop("utm_medium")}, ${prop("utm_campaign")}, ${prop("utm_content")},
    ${prop("$referring_domain")},
    ${prop("$device_type")}, ${prop("$browser")}, ${prop("$os")},
    ${prop("$geoip_country_name")}, ${prop("$geoip_subdivision_1_name")}, ${prop("$geoip_city_name")},
    ${prop("step")}, ${prop("outcome")}, ${prop("plan")}, ${prop("verified")},
    toFloat64OrNull(toString(properties.$geoip_latitude)), toFloat64OrNull(toString(properties.$geoip_longitude)),
    ${prop("$geoip_country_code")}, ${prop("$geoip_subdivision_1_code")},
    multiIf(${CLICK_ID_KEYS.map((k) => `${prop(k)} != '', '${k}'`).join(", ")}, ''),
    ${prop("placement")}, ${prop("label")}, ${prop("jf_org_id")}, ${prop("jf_user_id")},
    ${UA_SQL}, ${BROWSER_TYPE_SQL}
    FROM events`;
}

/** A timezone name, safe to paste into HogQL. Anything else falls back to UTC
 *  rather than reaching the query with quotes in it. */
function tzLiteral(timezone: string): string {
  const name = typeof timezone === "string" ? timezone.trim() : "";
  return /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/.test(name) && name.length <= 64 ? `'${name}'` : "'UTC'";
}

/** Site-wide visitor totals, in the admin's timezone, counted with and
 *  without localhost in one pass (2026-09-30).
 *
 *  It follows the page's one visitor rule (lib/traffic-visitor, 2026-10-01) —
 *  pageviews only, /admin excluded, www.jobflex.app and jobflex.app (plus
 *  localhost on the switch), no bots, no Vercel previews — and the report's
 *  header reads these same figures (traffic-server), so the two can no
 *  longer disagree.
 *
 *  This one touches every event the project holds, so it is deliberately NOT
 *  on the live poll's cache: an all-time count does not move in fifteen
 *  seconds (lib/traffic-server caches it for minutes). */
export function buildLiveTotalsQuery(timezone: string, fullHistory = false): string {
  const tz = tzLiteral(timezone);
  const prop = (name: string) => `ifNull(toString(properties.${name}), '')`;
  // The page's one visitor rule (lib/traffic-visitor), twice: with localhost, then without.
  const cols = { host: "hostname", ua: "ua", browserType: "browser_type", event: "'$pageview'" };
  const withLocal = visitorRuleSql(cols, "with-local");
  const production = visitorRuleSql(cols, "production");
  /** Each figure twice: production + localhost, then production only. */
  const pair = (cond: string) => `uniqExactIf(person, (${cond}) AND ${withLocal}), uniqExactIf(person, (${cond}) AND ${production})`;
  const today = "day = today_local";
  const localNow = `toTimeZone(now(), ${tz})`;
  return `SELECT
    ${pair("1 = 1")},
    ${pair(today)},
    ${pair("day = today_local - 1 AND secs <= now_secs")},
    ${pair("day = today_local - 1")},
    ${pair("ts >= now() - INTERVAL 7 DAY")},
    countIf((${today}) AND ${withLocal}), countIf((${today}) AND ${production})
  FROM (
    SELECT toString(person_id) AS person, timestamp AS ts,
      ifNull(nullIf(${prop("$pathname")}, ''), path(${prop("$current_url")})) AS pathname,
      ${HOST_SQL} AS hostname, ${UA_SQL} AS ua, ${BROWSER_TYPE_SQL} AS browser_type,
      toTimeZone(timestamp, ${tz}) AS lts,
      toDate(lts) AS day,
      toHour(lts) * 3600 + toMinute(lts) * 60 + toSecond(lts) AS secs,
      toDate(${localNow}) AS today_local,
      toHour(${localNow}) * 3600 + toMinute(${localNow}) * 60 + toSecond(${localNow}) AS now_secs
    FROM events
    WHERE event = '$pageview' AND timestamp <= now() AND ${sinceSql(fullHistory)}
  )
  WHERE pathname != '/admin' AND NOT startsWith(pathname, '/admin/')`;
}

/** The totals row → both readings. A missing or unreadable cell counts zero,
 *  never NaN: the panel prints these straight. */
export function liveTotalsFromRow(row: unknown[]): LiveTotalsPair {
  const n = (i: number) => {
    const raw = Array.isArray(row) ? row[i] : undefined;
    const v = typeof raw === "number" ? raw : raw == null || raw === "" ? NaN : Number(raw);
    return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  };
  // Columns come in pairs: everyone, then production only.
  const read = (offset: 0 | 1): LiveTotals => ({
    allTime: n(0 + offset),
    today: n(2 + offset),
    yesterdaySoFar: n(4 + offset),
    yesterday: n(6 + offset),
    last7Days: n(8 + offset),
    viewsToday: n(10 + offset),
  });
  return { all: read(0), production: read(1) };
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
    click: CLICK_IDS[str(28).toLowerCase()] ? str(28).toLowerCase() : "",
    placement: str(29),
    label: str(30),
    orgId: str(31).slice(0, 40),
    userId: str(32).slice(0, 40),
    ua: str(33),
    browserType: str(34),
  };
}

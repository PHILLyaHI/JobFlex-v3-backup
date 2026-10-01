// Live now (2026-09-28, lib/traffic-live): events of the last half hour →
// one line per visitor, where from (an ad or not), how far they got, the
// signups named after the organization the database made. Static imports
// only (tsx has no top-level await).
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/traffic-live.check.ts
import { AD_PLATFORM_KEYS, buildLiveQuery, buildLiveTotalsQuery, classifySource, liveEventFromRow, liveTotalsFromRow, platformCards, shapeLive, shortId, type FreshSignup, type LiveEvent } from "../../src/lib/traffic-live";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const NOW = Date.parse("2026-09-28T17:30:00Z");
const min = (m: number) => NOW - m * 60_000;
const ev = (p: Partial<LiveEvent> & { person: string; at: number }): LiveEvent => ({
  distinctId: p.person, event: "$pageview", pathname: "/", url: "https://jobflex.app/", sessionId: "s-" + p.person, hostname: "jobflex.app", environment: "production",
  utmSource: "", utmMedium: "", utmCampaign: "", utmContent: "", referrer: "$direct", device: "Desktop", browser: "Chrome", os: "Mac OS X",
  country: "United States", region: "Texas", city: "Dallas", step: "", outcome: "", plan: "", verified: "",
  lat: 32.78, lon: -96.8, countryCode: "US", regionCode: "TX", click: "", ...p,
});

// ── where a visit came from
check("a tagged paid medium is an ad", classifySource("facebook", "paid", "", "jobflex.app").fromAd && classifySource("facebook", "paid", "", "jobflex.app").label === "Facebook ad");
check("google / cpc is a Google ad", classifySource("google", "cpc", "", "").label === "Google ad" && classifySource("google", "cpc", "", "").kind === "ad");
check("an ad platform tagged without a medium is still counted as an ad, and says so", classifySource("fb", "", "", "").fromAd && /tagged, no medium/.test(classifySource("fb", "", "", "").label));
check("an untagged Facebook referrer is most likely an ad", classifySource("", "", "l.facebook.com", "jobflex.app").fromAd && classifySource("", "", "l.facebook.com", "jobflex.app").kind === "likely-ad");
check("Instagram and TikTok referrers likewise", classifySource("", "", "www.instagram.com", "").fromAd && classifySource("", "", "www.tiktok.com", "").fromAd);
check("a Google referrer is search, not an ad", !classifySource("", "", "www.google.com", "").fromAd && classifySource("", "", "www.google.com", "").label === "Google search");
check("tagged organic social is a post, not an ad", !classifySource("facebook", "social", "", "").fromAd && /post/.test(classifySource("facebook", "social", "", "").label));
check("no referrer, or the site itself, is Direct", classifySource("", "", "$direct", "jobflex.app").kind === "direct" && classifySource("", "", "jobflex.app", "jobflex.app").kind === "direct" && classifySource("", "", "", "").kind === "direct");
check("another site is a referral by name", classifySource("", "", "www.yelp.com", "").label === "yelp.com" && classifySource("", "", "www.yelp.com", "").kind === "referral");
check("LinkedIn is social, not an ad", classifySource("", "", "www.linkedin.com", "").kind === "social" && !classifySource("", "", "www.linkedin.com", "").fromAd);
// ── the platforms, and the click ids the ad platforms add
check("Meta's own site_source_name fills fb / ig / msg: each credited to its platform", classifySource("fb", "paid", "", "").platform === "facebook" && classifySource("ig", "paid", "", "").platform === "instagram" && classifySource("msg", "paid", "", "").platform === "facebook" && classifySource("ig", "paid", "", "").label === "Instagram ad");
check("a Google click id with no tag is a Google ad (auto-tagging)", classifySource("", "", "", "", "gclid").fromAd && classifySource("", "", "", "", "gclid").platform === "google" && /click id/.test(classifySource("", "", "", "", "gclid").label));
check("ttclid and twclid are TikTok and X ads; msclkid Bing", classifySource("", "", "", "", "ttclid").platform === "tiktok" && classifySource("", "", "", "", "twclid").platform === "x" && classifySource("", "", "", "", "msclkid").platform === "bing" && classifySource("", "", "", "", "twclid").fromAd);
check("fbclid with no referrer (the in-app browser) is Facebook, most likely an ad", classifySource("", "", "", "", "fbclid").platform === "facebook" && classifySource("", "", "", "", "fbclid").kind === "likely-ad");
check("fbclid does not turn a tagged post into an ad", !classifySource("facebook", "social", "", "", "fbclid").fromAd);
check("search, direct and other sites have their own platform keys", classifySource("", "", "www.google.com", "").platform === "search" && classifySource("", "", "", "").platform === "direct" && classifySource("", "", "www.yelp.com", "").platform === "yelp" && classifySource("", "", "some-blog.com", "").platform === "other");

// ── the window's people
const events: LiveEvent[] = [
  // Ana: a Facebook ad → landing → register → checkout → signed up, 3 minutes ago; now in the dashboard
  ev({ person: "p-ana", at: min(12), utmSource: "facebook", utmMedium: "paid", utmCampaign: "fence-fall", referrer: "l.facebook.com", device: "Mobile", browser: "Mobile Safari" }),
  ev({ person: "p-ana", at: min(10), pathname: "/auth/register" }),
  ev({ person: "p-ana", at: min(9), event: "jf_registration_step_viewed", pathname: "/auth/register", step: "2" }),
  ev({ person: "p-ana", at: min(6), event: "jf_checkout_opened", pathname: "/auth/register" }),
  ev({ person: "p-ana", at: min(3), event: "jf_signup_completed", pathname: "/auth/register", outcome: "trial_started", plan: "pro", verified: "true" }),
  ev({ person: "p-ana", at: min(1), pathname: "/dashboard" }),
  // Ben: Google search, reading the landing 2 minutes ago
  ev({ person: "p-ben", at: min(4), referrer: "www.google.com" }),
  ev({ person: "p-ben", at: min(2), pathname: "/pricing" }),
  // Cal: an untagged Instagram click, on the sign-up form now
  ev({ person: "p-cal", at: min(8), referrer: "www.instagram.com" }),
  ev({ person: "p-cal", at: min(1), event: "jf_registration_step_viewed", pathname: "/auth/register", step: "1" }),
  // Dee: a member in the app, quiet for 20 minutes (left)
  ev({ person: "p-dee", at: min(20), pathname: "/dashboard/jobs" }),
  // Eli: on localhost — a developer, hidden by default
  ev({ person: "p-eli", at: min(1), hostname: "localhost", environment: "development", url: "http://localhost:3000/" }),
  // Fay: too old for the window
  ev({ person: "p-fay", at: min(45), utmSource: "google", utmMedium: "cpc" }),
  // Gus: two visits — an old direct one and a new Facebook-ad one; the source is the NEW visit's
  ev({ person: "p-gus", at: min(28), sessionId: "s-gus-1", referrer: "$direct" }),
  ev({ person: "p-gus", at: min(2), sessionId: "s-gus-2", utmSource: "facebook", utmMedium: "paid_social", utmCampaign: "fence-fall" }),
];
const signups: FreshSignup[] = [
  { orgId: "o1", orgName: "Ana Fence Co", ownerEmail: "ana@example.com", ownerName: "Ana Ruiz", createdAt: new Date(min(2.5)).toISOString(), utmSource: "facebook", utmMedium: "paid", utmCampaign: "fence-fall", landingIndustry: "fence" },
  { orgId: "o2", orgName: "Morning Roofing", ownerEmail: "m@example.com", ownerName: "", createdAt: new Date(min(300)).toISOString(), utmSource: "google", utmMedium: "cpc", utmCampaign: "roof", landingIndustry: "roofing" },
  { orgId: "o3", orgName: "Walk-in Decks", ownerEmail: "w@example.com", ownerName: "", createdAt: new Date(min(400)).toISOString(), utmSource: "", utmMedium: "", utmCampaign: "", landingIndustry: "" },
];
const r = shapeLive(events, signups, NOW);
const by = (id: string) => r.visitors.find((v) => v.id === shortId(id));
check("one line per person: the localhost developer and the visitor past the window are out", r.visitors.length === 5 && !by("p-eli") && !by("p-fay"), r.visitors.map((v) => v.id).join(","));
const ana = by("p-ana")!;
check("Ana signed up: the green stage, from a Facebook ad, named after the organization the database made", ana.stage === "signed-up" && ana.fromAd && ana.source === "Facebook ad" && ana.campaign === "fence-fall" && ana.signup?.orgName === "Ana Fence Co" && ana.signup?.ownerEmail === "ana@example.com" && ana.signup?.plan === "pro" && ana.signup?.outcome === "trial_started", JSON.stringify(ana.signup));
check("…and she is on the dashboard now, three pages in, the trail naming each step, the checkout and the signup", ana.active && ana.page === "/dashboard" && ana.pageLabel === "App · Dashboard" && ana.views === 3 && ana.trail.join(" → ") === "Landing page → Registration entry → Step 2 / Company → Checkout → Signed up → App · Dashboard", `${ana.page} · ${ana.views} · ${ana.trail.join(" → ")}`);
check("signups sort to the top", r.visitors[0].id === ana.id);
const ben = by("p-ben")!;
check("Ben: Google search, looking around on /pricing, not from an ad", ben.stage === "browsing" && !ben.fromAd && ben.source === "Google search" && ben.page === "/pricing" && ben.active);
const cal = by("p-cal")!;
check("Cal: an untagged Instagram click, on the sign-up form now — counted as an ad", cal.stage === "registering" && cal.fromAd && cal.sourceKind === "likely-ad" && cal.active && cal.pageLabel === "Registration entry", `${cal.stage} · ${cal.source} · ${cal.pageLabel}`);
check("an app screen is named by its section", (() => { const m = shapeLive([ev({ person: "p-m", at: min(1), pathname: "/dashboard/jobs" })], [], NOW).visitors[0]; return m.pageLabel === "App · Jobs" && m.stage === "member"; })());
const dee = by("p-dee")!;
check("Dee: a member in the app, gone quiet — shown as left", dee.stage === "member" && !dee.active);
const gus = by("p-gus")!;
check("Gus: the source is his NEW visit's (the Facebook ad), not the old direct one", gus.fromAd && gus.source === "Facebook ad" && gus.views === 1 && gus.active);
check("the counts: 4 on now, 3 of them from ads, 1 signing up, 1 signed up, 0 members on now", r.counts.onSite === 4 && r.counts.fromAds === 3 && r.counts.signingUp === 1 && r.counts.signedUp === 1 && r.counts.members === 0, JSON.stringify(r.counts));
check("today: 3 signups, 2 from ads", r.today.signups === 3 && r.today.fromAds === 2, JSON.stringify(r.today));
// ── the platform cards
const cards = r.platforms;
const byKey = (k: string) => cards.find((c) => c.platform === k);
check("the five ad platforms always have a card, ad platforms first", AD_PLATFORM_KEYS.every((k) => byKey(k)) && cards.slice(0, AD_PLATFORM_KEYS.length).every((c) => c.ads), cards.map((c) => c.platform).join(","));
const fb = byKey("facebook")!;
check("Facebook: Ana and Gus, both from ads, Ana signed up, the fence-fall campaign counted twice with one signup", fb.visitors === 2 && fb.fromAds === 2 && fb.organic === 0 && fb.signedUp === 1 && fb.onSite === 2 && fb.campaigns[0]?.campaign === "fence-fall" && fb.campaigns[0]?.visitors === 2 && fb.campaigns[0]?.signedUp === 1, JSON.stringify(fb));
check("Facebook's signups today from the database: Ana's row (facebook / paid)", fb.signedUpToday === 1);
const ig = byKey("instagram")!;
check("Instagram: Cal, untagged, signing up", ig.visitors === 1 && ig.fromAds === 1 && ig.signingUp === 1 && ig.campaigns.length === 0);
const goog = byKey("google")!;
check("Google Ads: nobody in the window, one signup today (Morning Roofing, google / cpc)", goog.visitors === 0 && goog.signedUpToday === 1 && goog.ads);
check("TikTok and X stand at zero, still shown", byKey("tiktok")?.visitors === 0 && byKey("x")?.visitors === 0);
check("Search and Direct come after the ad platforms: Ben on search, Dee direct", byKey("search")?.visitors === 1 && byKey("direct")?.visitors === 1 && cards.indexOf(byKey("search")!) > cards.indexOf(byKey("google")!));
check("a platform without visitors or signups today is left out", !byKey("yelp") && !byKey("linkedin"));
check("platformCards on nothing still lists the ad platforms at zero", platformCards([], []).length === AD_PLATFORM_KEYS.length);
check("the two signups no visitor could be tied to are listed apart, newest first, with their own source", r.otherSignups.length === 2 && r.otherSignups[0].orgName === "Morning Roofing" && r.otherSignups[0].source === "Google ad" && r.otherSignups[1].source === "Untagged", JSON.stringify(r.otherSignups));
const dev = shapeLive(events, signups, NOW, { includeDevelopment: true });
check("with localhost included the developer shows, marked development", dev.visitors.length === 6 && dev.visitors.find((v) => v.id === shortId("p-eli"))?.environment === "development");
// a signup whose campaign tag disagrees is not tied to the row
const wrongTag = shapeLive(events.map((e) => (e.person === "p-ana" ? { ...e, utmCampaign: "other-campaign" } : e)), signups, NOW);
check("a different campaign tag keeps the signup from being tied to the wrong row (still green, unnamed)", wrongTag.visitors[0].stage === "signed-up" && wrongTag.visitors[0].signup === null && wrongTag.otherSignups.length === 3);
check("an empty window is an empty report, not a crash", shapeLive([], [], NOW).visitors.length === 0 && shapeLive([], [], NOW).counts.onSite === 0);
// ── the map: where each one is
check("a visitor carries the place GeoIP gave the browser", ana.lat === 32.78 && ana.lon === -96.8 && ana.countryCode === "US" && ana.regionCode === "TX" && ana.city === "Dallas");
const unplaced = shapeLive([ev({ person: "p-u", at: min(1), lat: null, lon: null, countryCode: "", regionCode: "" })], [], NOW).visitors[0];
check("a visitor without a place is counted but has no pin", unplaced.lat === null && unplaced.lon === null && unplaced.active);
const moved = shapeLive([ev({ person: "p-m2", at: min(9), lat: 47.61, lon: -122.33, city: "Seattle", regionCode: "WA" }), ev({ person: "p-m2", at: min(1), lat: null, lon: null, city: "" })], [], NOW).visitors[0];
check("the place is the latest event that had one", moved.lat === 47.61 && moved.city === "Seattle" && moved.regionCode === "WA");

// ── the query and its rows
const sql = buildLiveQuery();
check("the live query reads the last 30 minutes of the events that matter", /INTERVAL 30 MINUTE/.test(sql) && /'\$pageview'/.test(sql) && /'jf_signup_completed'/.test(sql) && /toUnixTimestamp\(timestamp\) \* 1000/.test(sql) && /LIMIT 4000/.test(sql));
check("the window is clamped", /INTERVAL 5 MINUTE/.test(buildLiveQuery(1)) && /INTERVAL 120 MINUTE/.test(buildLiveQuery(999)));
const row = ["person-1", "anon-1", "$pageview", 1_790_000_000_000, "/", "https://jobflex.app/", "s1", "jobflex.app", "production", "facebook", "paid", "camp", "", "l.facebook.com", "Mobile", "Mobile Safari", "iOS", "United States", "Texas", "Dallas", "", "", "", ""];
const e1 = liveEventFromRow(row);
check("a query row becomes an event", !!e1 && e1.person === "person-1" && e1.at === 1_790_000_000_000 && e1.utmSource === "facebook" && e1.city === "Dallas" && e1.lat === null && e1.countryCode === "");
const e2 = liveEventFromRow([...row, 32.7767, -96.797, "us", "tx"]);
check("the GeoIP columns ride along: numbers for the place, codes upper-cased", !!e2 && e2.lat === 32.7767 && e2.lon === -96.797 && e2.countryCode === "US" && e2.regionCode === "TX");
const e3 = liveEventFromRow([...row, "0", "0", "", ""]);
check("0,0 is no place (GeoIP's nothing), and a lone latitude is dropped too", !!e3 && e3.lat === null && liveEventFromRow([...row, 32.7, null, "US", "TX"])?.lat === null);
check("the query asks for the GeoIP columns and the click ids", /\$geoip_latitude/.test(sql) && /\$geoip_longitude/.test(sql) && /\$geoip_country_code/.test(sql) && /gclid/.test(sql) && /fbclid/.test(sql) && /multiIf/.test(sql));
const e4 = liveEventFromRow([...row, 32.7767, -96.797, "us", "tx", "GCLID"]);
check("the click id column names the id, lower-cased, only when it is one we know", !!e4 && e4.click === "gclid" && liveEventFromRow([...row, 1, 1, "US", "TX", "zzz"])?.click === "");
check("a row without a time or an event is skipped", liveEventFromRow(["p", "d", "$pageview", "x"]) === null && liveEventFromRow(["p", "d", "", 1]) === null);
check("a short id is the tail of the person id", shortId("0192abcd-1234-5678-9abc-def012345678") === "345678" && shortId("abc") === "abc");

// ── the site-wide totals behind the live view (2026-09-30)
const totalsSql = buildLiveTotalsQuery("America/Chicago");
check("the totals query counts people today, yesterday to this hour, the week and all time",
  /uniqExactIf\(person, 1 = 1\)/.test(totalsSql) && /day = today_local/.test(totalsSql)
  && /day = today_local - 1 AND secs <= now_secs/.test(totalsSql) && /INTERVAL 7 DAY/.test(totalsSql)
  && /countIf\(day = today_local\)/.test(totalsSql));
check("it counts each figure twice, so the localhost switch needs no second query",
  (totalsSql.match(/env != 'development'/g) || []).length === 6);
check("it follows the report's own rules — pageviews, no /admin, localhost by domain when the tag is missing",
  /event = '\$pageview'/.test(totalsSql) && /pathname != '\/admin'/.test(totalsSql)
  && /NOT startsWith\(pathname, '\/admin\/'\)/.test(totalsSql) && /'localhost', '127\.0\.0\.1'/.test(totalsSql));
check("the timezone is the admin's, and only a real zone name reaches the query",
  /'America\/Chicago'/.test(totalsSql) && /'UTC'/.test(buildLiveTotalsQuery("'; DROP TABLE events --"))
  && !/DROP TABLE/.test(buildLiveTotalsQuery("'; DROP TABLE events --")) && /'UTC'/.test(buildLiveTotalsQuery("")));
const pair = liveTotalsFromRow([900, 700, 120, 90, 100, 80, 450, 400, 61, 50, 310, 240]);
check("the row reads as two sets: everyone, and everyone but localhost",
  pair.all.allTime === 900 && pair.production.allTime === 700
  && pair.all.today === 120 && pair.production.today === 90
  && pair.all.yesterdaySoFar === 100 && pair.production.yesterdaySoFar === 80
  && pair.all.yesterday === 450 && pair.production.yesterday === 400
  && pair.all.last7Days === 61 && pair.production.last7Days === 50
  && pair.all.viewsToday === 310 && pair.production.viewsToday === 240);
const empty = liveTotalsFromRow([]);
check("a missing or unreadable total is zero, never NaN",
  empty.all.allTime === 0 && empty.production.today === 0
  && liveTotalsFromRow(["12", null, "x", -4, undefined, "", 0, 0, 0, 0, 0, 0]).all.allTime === 12
  && liveTotalsFromRow(["12", null, "x", -4, undefined, "", 0, 0, 0, 0, 0, 0]).all.today === 0);
check("shapeLive leaves the totals to the server fetch that caches them",
  shapeLive([], [], NOW, {}).totals === null);

console.log(bad ? `\n${bad} failing` : "\nall green");
process.exit(bad ? 1 : 0);

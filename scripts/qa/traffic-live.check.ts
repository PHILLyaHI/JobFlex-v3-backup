// Live now (2026-09-28, lib/traffic-live): events of the last half hour →
// one line per visitor, where from (an ad or not), how far they got, the
// signups named after the organization the database made. Static imports
// only (tsx has no top-level await).
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/traffic-live.check.ts
import { buildLiveQuery, classifySource, liveEventFromRow, shapeLive, shortId, type FreshSignup, type LiveEvent } from "../../src/lib/traffic-live";

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
  country: "United States", region: "Texas", city: "Dallas", step: "", outcome: "", plan: "", verified: "", ...p,
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
check("the two signups no visitor could be tied to are listed apart, newest first, with their own source", r.otherSignups.length === 2 && r.otherSignups[0].orgName === "Morning Roofing" && r.otherSignups[0].source === "Google ad" && r.otherSignups[1].source === "Untagged", JSON.stringify(r.otherSignups));
const dev = shapeLive(events, signups, NOW, { includeDevelopment: true });
check("with localhost included the developer shows, marked development", dev.visitors.length === 6 && dev.visitors.find((v) => v.id === shortId("p-eli"))?.environment === "development");
// a signup whose campaign tag disagrees is not tied to the row
const wrongTag = shapeLive(events.map((e) => (e.person === "p-ana" ? { ...e, utmCampaign: "other-campaign" } : e)), signups, NOW);
check("a different campaign tag keeps the signup from being tied to the wrong row (still green, unnamed)", wrongTag.visitors[0].stage === "signed-up" && wrongTag.visitors[0].signup === null && wrongTag.otherSignups.length === 3);
check("an empty window is an empty report, not a crash", shapeLive([], [], NOW).visitors.length === 0 && shapeLive([], [], NOW).counts.onSite === 0);

// ── the query and its rows
const sql = buildLiveQuery();
check("the live query reads the last 30 minutes of the events that matter", /INTERVAL 30 MINUTE/.test(sql) && /'\$pageview'/.test(sql) && /'jf_signup_completed'/.test(sql) && /toUnixTimestamp\(timestamp\) \* 1000/.test(sql) && /LIMIT 4000/.test(sql));
check("the window is clamped", /INTERVAL 5 MINUTE/.test(buildLiveQuery(1)) && /INTERVAL 120 MINUTE/.test(buildLiveQuery(999)));
const row = ["person-1", "anon-1", "$pageview", 1_790_000_000_000, "/", "https://jobflex.app/", "s1", "jobflex.app", "production", "facebook", "paid", "camp", "", "l.facebook.com", "Mobile", "Mobile Safari", "iOS", "United States", "Texas", "Dallas", "", "", "", ""];
const e1 = liveEventFromRow(row);
check("a query row becomes an event", !!e1 && e1.person === "person-1" && e1.at === 1_790_000_000_000 && e1.utmSource === "facebook" && e1.city === "Dallas");
check("a row without a time or an event is skipped", liveEventFromRow(["p", "d", "$pageview", "x"]) === null && liveEventFromRow(["p", "d", "", 1]) === null);
check("a short id is the tail of the person id", shortId("0192abcd-1234-5678-9abc-def012345678") === "345678" && shortId("abc") === "abc");

console.log(bad ? `\n${bad} failing` : "\nall green");
process.exit(bad ? 1 : 0);

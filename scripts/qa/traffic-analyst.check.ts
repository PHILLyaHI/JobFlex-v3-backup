// The analyst (2026-10-02, lib/traffic-analyst): a week of landing sessions
// → findings with evidence and one thing to try. Every rule proved on
// made-up sessions. Static imports only (tsx has no top-level await).
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/traffic-analyst.check.ts
import { ANALYST_MIN_AD_VISITS, adNameOf, analyse, analystSessionFromRow, buildAnalystQuery, type LandingSession } from "../../src/lib/traffic-analyst";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };

const NOW = Date.parse("2026-10-02T18:00:00-07:00");
let seq = 0;
const sess = (p: Partial<LandingSession> = {}): LandingSession => {
  seq++;
  const ad = p.utmSource !== "";
  return {
    id: `s${seq}`, person: `p${seq}`, startedAt: NOW - 3_600_000 * ((seq % 100) + 1), endedAt: NOW - 3_600_000 * ((seq % 100) + 1) + 60_000,
    industry: "roofing", utmSource: ad ? "fb" : "", utmMedium: ad ? "paid" : "", utmCampaign: ad ? "C1" : "", utmContent: ad ? "A1" : "", referrer: ad ? "l.facebook.com" : "google.com", fbclid: ad,
    device: "Mobile", browser: "Mobile Safari", os: "iOS", inApp: false, views: 1, landingViews: 1, dwell: 40, scroll: 0.6, sections: ["hero", "compare", "showcase"],
    cta: 0, placements: [], registerViews: 0, step: 0, flow: "", attempts: 0, cardless: 0, opened: 0, errors: [], completed: false, outcome: "", plan: "",
    heroMs: null, paintMs: null, readyMs: null, trackedMs: null, kb: null, connection: "", leftUnshown: 0, formReadyMs: null, typedEarly: 0, submittedEarly: 0, step1Errors: [], step1Passed: 0, ...p,
  };
};
const many = (n: number, p: Partial<LandingSession> | ((i: number) => Partial<LandingSession>) = {}) => Array.from({ length: n }, (_, i) => sess(typeof p === "function" ? p(i) : p));
const ids = (r: ReturnType<typeof analyse>) => r.findings.map((f) => f.id);
const find = (r: ReturnType<typeof analyse>, id: string) => r.findings.find((f) => f.id === id);

// ── the query and the row
const sql = buildAnalystQuery();
check("the query reads a week, one row per session, with the landing's leave numbers and the sections", /INTERVAL 7 DAY/.test(sql) && /GROUP BY sid/.test(sql) && /\$pageleave/.test(sql) && /\$prev_pageview_max_scroll_percentage/.test(sql) && /landing_section/.test(sql) && /jf_signup_completed/.test(sql) && /www\.jobflex\.app/.test(sql) && /LIMIT 6000/.test(sql));
check("the query keeps the admin out and needs a session id", /NOT startsWith\(.*'\/admin\/'\)/.test(sql) && /\$session_id\), ''\) != ''/.test(sql));
const row = ["sess-1", "person-1", 1_700_000_000_000, 1_700_000_060_000, "", "https://www.jobflex.app/?industry=fencing&utm_source=fb", "fb", "paid", "C9", "A9", "l.facebook.com", 1, "Mobile", "Mobile Safari", "iOS", 1, 2, 1, 42.5, 0.73, "hero,compare,showcase", 1, "hero", 1, 2, "standard", 1, 1, 0, "trial_rejected", 1, "trial_started", "starter"];
const parsed = analystSessionFromRow(row)!;
check("a row parses: trade from the URL when landing_view is missing, numbers, lists", !!parsed && parsed.industry === "fencing" && parsed.inApp && parsed.fbclid && parsed.dwell === 42.5 && parsed.scroll === 0.73 && parsed.sections.join() === "hero,compare,showcase" && parsed.placements[0] === "hero" && parsed.step === 2 && parsed.cardless === 1 && parsed.errors[0] === "trial_rejected" && parsed.completed && parsed.plan === "starter");
check("a short row is refused; nulls stay null", analystSessionFromRow(row.slice(0, 20)) === null && analystSessionFromRow([...row.slice(0, 18), null, null, ...row.slice(20)])!.dwell === null);
check("a landing seen only by its pageview counts as the general landing", analystSessionFromRow([...row.slice(0, 4), "", "https://www.jobflex.app/", ...row.slice(6)])!.industry === "default");

// ── not enough yet
const few = analyse([...many(10), ...many(5, { utmSource: "" })], { now: NOW });
check("under 20 ad visits the analyst only says so", ids(few)[0] === "sample" && !few.sample.enough && few.sample.fromAds === 10 && few.sample.landed === 15 && /starts reading at 20/.test(few.headline), few.headline);
check("with nobody landed it says that", /Nobody has landed/.test(analyse([], { now: NOW }).headline));

// ── bouncing fast, no signups
const bouncy = analyse([...many(30, (i) => ({ views: 1, dwell: 2 + (i % 3), scroll: 0.02, sections: i % 2 ? ["hero"] : [], inApp: i % 3 !== 0 })), ...many(10, { views: 2, dwell: 50, cta: 1, placements: ["hero"], registerViews: 1, step: 1 })], { now: NOW });
const b = find(bouncy, "bounce")!;
check("75% bouncing is a bad finding, with the in-app split, and the quick-leave reading when most were gone in 5 s", !!b && b.tone === "bad" && /75% of ad clicks leave/.test(b.title) && /in-app browser bounces/.test(b.evidence) && /landing-page views/.test(b.action), b?.evidence);
check("no signups from 40 ad visits is its own bad finding, pointing at the biggest leak", !!find(bouncy, "no-signups") && /Fix the biggest leak first/.test(find(bouncy, "no-signups")!.action));
check("the headline says what is going on and what to fix", /In the last 7 days 40 people landed from ads: 75% left without pressing anything, 25% pressed a button, 25% opened the form, 0 signed up\. The thing to fix: no signups/.test(bouncy.headline), bouncy.headline);
check("bad findings come first", bouncy.findings[0].tone === "bad" && bouncy.findings.findIndex((f) => f.tone === "info") > bouncy.findings.findIndex((f) => f.tone === "bad"));
check("the funnel counts people and shares", bouncy.funnel[0].n === 40 && bouncy.funnel[1].n === 10 && bouncy.funnel[1].pct === 0.25 && bouncy.funnel[6].n === 0);

// ── they leave at a section, and they read without pressing
const cliff = analyse([...many(36, { dwell: 60, scroll: 0.6, sections: ["hero", "compare", "showcase"] }), ...many(4, (i) => ({ dwell: 90, scroll: 0.9, sections: ["hero", "compare", "showcase", "proposals", "portal"], cta: i < 2 ? 1 : 0, placements: i < 2 ? ["footer"] : [] }))], { now: NOW });
const c = find(cliff, "cliff")!;
check("the section after which they leave is named, with the reach on both sides", !!c && /They leave at «Estimators»/.test(c.title) && /100% of 40 measured visits reach «Estimators», 10% reach the next section \(«Proposals»\)/.test(c.evidence), c?.evidence);
check("reading without pressing is called, with where the presses went", !!find(cliff, "reading") && /100% stay 30 s/.test(find(cliff, "reading")!.evidence) && /only 5% press any button — the presses: footer \(2\)/.test(find(cliff, "reading")!.evidence), find(cliff, "reading")?.evidence);
check("section reach is over the measured visits only", cliff.sections.find((x) => x.key === "proposals")!.reach === 0.1 && cliff.sample.measured === 40);

// ── where the sign-up leaks
const leaky = analyse([...many(20, (i) => ({ cta: 1, placements: ["hero"], registerViews: 1, step: i < 4 ? 3 : i < 16 ? 2 : 1 })), ...many(10, { cta: 1, placements: ["hero"] }), ...many(5)], { now: NOW });
const st = find(leaky, "step")!;
check("step 2 (company) losing 75% is the step finding, with the company advice", !!st && /step 2 \(company\) loses 75%/.test(st.title) && /16 reached step 2 \(company\), 4 went on/.test(st.evidence) && /company step optional/.test(st.action), st?.evidence);
check("a third pressing a button but never seeing the form is the leak finding", !!find(leaky, "leak") && /33% press a button but never see the form/.test(find(leaky, "leak")!.title));
const confirm = analyse([...many(12, (i) => ({ registerViews: 1, step: 3, attempts: 1, cardless: 1, completed: i < 4 })), ...many(10)], { now: NOW });
check("trials started but not confirmed is the confirm finding, naming the e-mail", !!find(confirm, "confirm") && /8 of 12 who started a trial never finished/.test(find(confirm, "confirm")!.title) && /confirmation e-mail is the leak/.test(find(confirm, "confirm")!.action));
const errs = analyse(many(20, (i) => ({ registerViews: 1, step: 3, errors: i < 4 ? ["checkout_rejected"] : [] })), { now: NOW });
check("repeated plan-step errors are a finding", !!find(errs, "errors") && /failed 4 times/.test(find(errs, "errors")!.title) && /checkout rejected × 4/.test(find(errs, "errors")!.evidence));

// ── Facebook's browser, ad against ad, the good news
const names = { A1: "Roof · 40 s v1", A2: "Fence · 40 s v1", C1: "Roofing campaign" };
const mixed = analyse([
  ...many(30, (i) => ({ inApp: true, utmContent: "A2", registerViews: i === 0 ? 1 : 0, step: i === 0 ? 1 : 0 })),
  ...many(30, (i) => ({ cta: 1, placements: ["hero"], registerViews: i < 20 ? 1 : 0, step: i < 20 ? 1 : 0, completed: i < 3 })),
], { now: NOW, adNames: names });
check("the in-app browser converting half as well is called", !!find(mixed, "in-app") && /3% of 30 in-app visits open the form vs 67% of 30/.test(find(mixed, "in-app")!.evidence), find(mixed, "in-app")?.evidence);
const ads = find(mixed, "ads")!;
check("ad against ad, by the owner's names, with where to move the budget", !!ads && /«Roof · 40 s v1» gets people to the form; «Fence · 40 s v1» does not/.test(ads.title) && /Move budget to «Roof · 40 s v1»/.test(ads.action) && ads.about === "Fence · 40 s v1", ads?.title);
check("three signups out of sixty is good news, crediting the ad", !!find(mixed, "good") && /3 signed up — 5\.0% of ad visits/.test(find(mixed, "good")!.title) && /«Roof · 40 s v1» brought 3/.test(find(mixed, "good")!.evidence));
check("the ads table names, counts and rates each ad", mixed.ads.length === 2 && mixed.ads[0].n === 30 && mixed.ads.some((a) => a.name === "Fence · 40 s v1" && a.form !== null && Math.abs(a.form - 1 / 30) < 1e-9));
check("an unnamed ad under a named campaign is told apart by its id", adNameOf({ utmCampaign: "C1", utmContent: "A7" }, names) === "Roofing campaign · ad A7" && adNameOf({ utmCampaign: "C1", utmContent: "" }, names) === "Roofing campaign" && adNameOf({ utmCampaign: "", utmContent: "" }, names) === "untagged");
const readers = analyse([...many(20, { utmContent: "A2", dwell: 80, scroll: 0.8 }), ...many(12, { utmContent: "A1", registerViews: 1, step: 1 })], { now: NOW, adNames: names });
check("an ad whose people read but never open the form is called out", !!find(readers, "readers-A2") && /brings readers, not sign-ups/.test(find(readers, "readers-A2")!.title));

// ── trades, devices, hours
const trades = analyse([...many(20, (i) => ({ industry: "roofing", registerViews: i < 8 ? 1 : 0, step: i < 8 ? 1 : 0 })), ...many(20, (i) => ({ industry: "fencing", registerViews: i < 1 ? 1 : 0, step: i < 1 ? 1 : 0 }))], { now: NOW });
check("trade landing against trade landing", !!find(trades, "trades") && /The roofing landing converts, the fencing landing does not/.test(find(trades, "trades")!.title), find(trades, "trades")?.title);
const devices = analyse([...many(20, (i) => ({ device: "Desktop", registerViews: i < 10 ? 1 : 0, step: i < 10 ? 1 : 0 })), ...many(20, (i) => ({ device: "Mobile", registerViews: i < 2 ? 1 : 0, step: i < 2 ? 1 : 0 }))], { now: NOW });
check("desktops signing up while phones do not is called", !!find(devices, "device") && /50% of 20 desktop visits open the form vs 10% of 20 on phones/.test(find(devices, "device")!.evidence));
const at = (h: number, day = 1) => Date.parse(`2026-10-0${day}T${String(h).padStart(2, "0")}:30:00-07:00`);
const hours = analyse([...many(40, (i) => ({ startedAt: at(20, 1 + (i % 2)), views: 1, dwell: 3, scroll: 0.02, cta: i < 8 ? 1 : 0 })), ...many(40, (i) => ({ startedAt: at(9, 1 + (i % 2)), views: 1, cta: i < 30 ? 1 : 0 }))], { now: NOW, timezone: "America/Los_Angeles" });
check("evening clicks bouncing more than morning ones is called, in the page's timezone", !!find(hours, "hours") && /Evening clicks bounce more/.test(find(hours, "hours")!.title) && /80% bounce in the evening \(40 visits\) vs 25% in the morning/.test(find(hours, "hours")!.evidence), find(hours, "hours")?.evidence);

// ── shallow scrolling
const shallow = analyse(many(30, (i) => ({ views: i % 3 ? 2 : 1, dwell: 20, scroll: 0.2, sections: ["hero"] })), { now: NOW });
check("half stopping early on the page is a finding that names the pricing's reach", !!find(shallow, "scroll") && /stop before 20% of the page/.test(find(shallow, "scroll")!.title) && /only 0% reach the pricing/.test(find(shallow, "scroll")!.evidence));
check("every finding carries a sample and a confidence", shallow.findings.every((f) => f.n > 0 && ["low", "medium", "high"].includes(f.confidence)) && find(shallow, "scroll")!.confidence === "low");
check("the minimum is the exported constant", ANALYST_MIN_AD_VISITS === 20 && few.sample.needed === 20);

// ── the first screen, the form before it is ready, the demo's place, the counting (2026-10-04)
const sql2 = buildAnalystQuery();
check("the query reads the two beacons and stays balanced", /landing_timing/.test(sql2) && /signup_step1/.test(sql2) && /hero_ms/.test(sql2) && /typed_before_ready/.test(sql2) && sql2.split("(").length === sql2.split(")").length);
const row45 = [...row, 7600, 2900, 5000, 5200, 1450, "4g", 0, 3300, 1, 0, "email_taken,password_mismatch", 1];
const p45 = analystSessionFromRow(row45)!;
check("a 45-column row carries the timings", p45.heroMs === 7600 && p45.paintMs === 2900 && p45.readyMs === 5000 && p45.trackedMs === 5200 && p45.kb === 1450 && p45.connection === "4g" && p45.leftUnshown === 0 && p45.formReadyMs === 3300 && p45.typedEarly === 1 && p45.submittedEarly === 0 && p45.step1Errors.join() === "email_taken,password_mismatch" && p45.step1Passed === 1);
check("a row from before the beacons parses with nothing known; -1 is not a time", parsed.heroMs === null && parsed.formReadyMs === null && parsed.step1Errors.length === 0 && analystSessionFromRow([...row, -1, -1])!.heroMs === null);
const slowScreen = analyse([...many(30, (i) => ({ views: 1, dwell: 20, scroll: 0, sections: ["hero"], heroMs: 6000 + (i % 5) * 800, paintMs: 2800, readyMs: 5000, trackedMs: 5100, kb: 1400, connection: i % 2 ? "4g" : "3g", inApp: i % 3 !== 0 })), ...many(10, { views: 2, cta: 1, placements: ["hero"], registerViews: 1, step: 1, heroMs: 2000, paintMs: 900, readyMs: 1500, trackedMs: 1600, kb: 1300 })], { now: NOW });
const fs = find(slowScreen, "first-screen")!;
check("a headline arriving seconds after the tap is a bad finding, with the split and the steps", !!fs && fs.tone === "bad" && /On phones the headline shows \d\.\d s after the tap/.test(fs.title) && /Median \d\.\d s over 40 phone visits/.test(fs.evidence) && /in Facebook's browser vs/.test(fs.evidence) && /by connection/.test(fs.evidence) && /JavaScript takes over at 5\.0 s after 1\.4 MB downloaded/.test(fs.evidence) && (fs.steps?.length ?? 0) >= 5 && /lp-enter/.test(fs.steps![0]), fs?.evidence);
check("held back after the first paint: the evidence says by how much, and step 1 is to show the copy", /the headline \d\.\d s after it/.test(fs.evidence) && /held back after the first paint/.test(fs.action) && /Show the hero copy from the first paint/.test(fs.steps![0]));
const latePaint = analyse(many(30, (i) => ({ views: 1, dwell: 20, scroll: 0, sections: ["hero"], heroMs: 3300 + (i % 5) * 300, paintMs: 3250 + (i % 5) * 300, readyMs: 5200, trackedMs: 5300, kb: 1400 })), { now: NOW });
const lp = find(latePaint, "first-screen")!;
check("once the headline comes with the first paint, the advice is the page's weight, not the entrance", !!lp && lp.tone === "warn" && /comes with the first paint/.test(lp.action) && !/lp-enter/.test(lp.steps!.join(" ")) && /WOFF2/.test(lp.steps![0]) && !/after it,/.test(lp.evidence), lp?.action);
check("the bounce finding then points at the first screen, not the words", /first screen is slow/.test(find(slowScreen, "bounce")!.action));
check("the tracking starting late is a note that explains the 5-second number", !!find(slowScreen, "undercount") && /Counting starts 5\.1 s into a phone visit/.test(find(slowScreen, "undercount")!.title));
check("the sample line carries the phone median", slowScreen.stats.heroMedianPhone !== null && slowScreen.stats.heroMedianPhone >= 2000);
const fastScreen = analyse(many(30, { heroMs: 900, paintMs: 600, readyMs: 800, trackedMs: 1000 }), { now: NOW });
check("a fast first screen says nothing", !find(fastScreen, "first-screen") && !find(fastScreen, "undercount"));
const slowForm = analyse([...many(25, (i) => ({ registerViews: 1, step: 1, formReadyMs: 3200, typedEarly: i < 6 ? 1 : 0, submittedEarly: i < 2 ? 1 : 0, step1Errors: i < 3 ? ["email_taken"] : i < 5 ? ["password_mismatch"] : [], step1Passed: i >= 5 ? 1 : 0 })), ...many(5)], { now: NOW });
const fr = find(slowForm, "form-ready")!;
check("a form usable seconds after it appears, with early typing, is a finding with the diet steps", !!fr && /24% start filling the sign-up form before it is ready/.test(fr.title) && /25 form loads on phones/.test(fr.evidence) && /6 had already typed and 2 had already pressed Continue/.test(fr.evidence) && (fr.steps?.length ?? 0) === 4, fr?.title);
const se = find(slowForm, "step1-errors")!;
check("step 1's refusals are counted by reason, the first with its advice, the rest as steps", !!se && /Step 1 refused 5 times/.test(se.title) && /email taken × 3, password mismatch × 2/.test(se.evidence) && /Sign in instead/.test(se.action) && se.steps!.length === 1 && /confirmation field/.test(se.steps![0]), se?.evidence);
const order = analyse([...many(30, { sections: ["hero", "compare"] }), ...many(10, { sections: ["hero", "compare", "showcase", "proposals"] })], { now: NOW });
const od = find(order, "order")!;
check("the demo sitting third behind the comparison is called, with the reorder", !!od && /The demo is the 3rd screen; «JobFlex vs other apps» comes before it/.test(od.title) && /100% of 40 measured visits reach «JobFlex vs other apps», 25% reach the demo/.test(od.evidence) && /Reorder landing-e-page.tsx/.test(od.steps![0]), od?.title);
const adDefault = analyse([...many(20, { utmContent: "A3", industry: "default", views: 1, dwell: 8, scroll: 0.05, sections: ["hero"] }), ...many(12, { utmContent: "A1", registerViews: 1, step: 1 })], { now: NOW, adNames: { A3: "Business · crew" } });
check("an ad whose clicks land on the general hero is told to carry ?industry= and a ?hook=", !!find(adDefault, "bounce-A3") && /100% land on the general hero/.test(find(adDefault, "bounce-A3")!.evidence) && /\?industry=<trade>/.test(find(adDefault, "bounce-A3")!.action), find(adDefault, "bounce-A3")?.evidence);
check("every new finding carries steps the panel can list, or none", slowScreen.findings.every((f) => f.steps === undefined || (Array.isArray(f.steps) && f.steps.every((x) => typeof x === "string" && x.length > 10))));

console.log(bad ? `\n${bad} FAILED` : "\nall green");
process.exit(bad ? 1 : 0);

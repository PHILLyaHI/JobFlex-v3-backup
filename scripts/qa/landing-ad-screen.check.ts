// The ad landing's first screen (2026-10-04, roofing): the section order the
// page, the tracker and the analyst share (lib/landing-sections), the ads'
// opening lines behind `?hook=` (landing-variants LANDING_HOOKS) and the
// price the hero reads from the plan catalogue (landing-e/hero-price).
// Pure functions only. Static imports (tsx has no top-level await).
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/landing-ad-screen.check.ts
import { LANDING_SECTIONS, LANDING_SECTION_KEYS, OWN_ORDER_LANDINGS, hasOwnSectionOrder, landingSectionOrder, landingSectionsFor } from "../../src/lib/landing-sections";
import { DEFAULT_LANDING, LANDING_HOOKS, LANDING_VARIANTS, hookContent, hooksOf, resolveLandingHook, variantContent, withHook, type LandingVariantKey } from "../../src/components/v3/landing-e/landing-variants";
import { cheapestPlanWith, heroPriceLine, type PricedPlan } from "../../src/components/v3/landing-e/hero-price";

let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };

// ── the order
const roof = landingSectionOrder("roofing");
check("every landing but roofing is laid out in the list's own order", landingSectionOrder(undefined) === LANDING_SECTION_KEYS && landingSectionOrder("default") === LANDING_SECTION_KEYS && landingSectionOrder("fencing") === LANDING_SECTION_KEYS && landingSectionOrder("hvac") === LANDING_SECTION_KEYS && !hasOwnSectionOrder("fencing") && !hasOwnSectionOrder("") && !hasOwnSectionOrder(null));
check("roofing puts the estimators directly under the hero and the comparison right before the pricing", roof[0] === "hero" && roof[1] === "showcase" && roof.indexOf("compare") === roof.indexOf("pricing") - 1 && roof.indexOf("compare") > roof.indexOf("stats") && roof.indexOf("compare") > roof.indexOf("built") && roof[roof.length - 1] === "final", roof.join(" → "));
check("roofing's order is the same sections, each once", roof.length === LANDING_SECTION_KEYS.length && LANDING_SECTION_KEYS.every((k) => roof.filter((x) => x === k).length === 1));
check("the sections come back whole in that order, for the tracker and the analyst", landingSectionsFor("roofing").map((s) => s.key).join() === roof.join() && landingSectionsFor("roofing")[1].label === "Estimators" && landingSectionsFor("fencing") === LANDING_SECTIONS);
check("a visit from before the order went live is read in the usual order; one after it, in roofing's", hasOwnSectionOrder("roofing") && !hasOwnSectionOrder("roofing", Date.parse("2026-10-04T12:00:00Z")) && hasOwnSectionOrder("roofing", Date.parse("2026-10-06T00:00:00Z")) && !hasOwnSectionOrder("fencing", Date.parse("2026-10-06T00:00:00Z")));
check("the comparison is found by its content-visibility box when a landing moves it down, else by its id", LANDING_SECTIONS.find((s) => s.key === "compare")!.selector.join() === ".lp-cv--compare,#compare");
check("an inherited name is not a landing", !hasOwnSectionOrder("constructor") && !hasOwnSectionOrder("__proto__") && !hasOwnSectionOrder("toString") && landingSectionOrder("constructor") === LANDING_SECTION_KEYS);

// ── the scope: roofing only
const adScreens = (Object.keys(LANDING_VARIANTS) as LandingVariantKey[]).filter((k) => { const v = LANDING_VARIANTS[k]; return !!v && (v.shotCta || v.playOnPhone || v.priceFeature || v.priceNote); });
check("only the roofing landing takes the ad's first screen, the hooks and an order of its own", adScreens.join() === "roofing" && Object.keys(LANDING_HOOKS).join() === "roofing" && OWN_ORDER_LANDINGS.join() === "roofing", adScreens.join());
check("the default hero and every other trade's are as they were", DEFAULT_LANDING.h1.join(" ") === "Turn your trade into a business." && !("shotCta" in DEFAULT_LANDING) && variantContent("fencing").heroCta === "Create My Free Estimate →" && variantContent("hvac").subStrong === "No unnecessary drive. No hours of calculations.");
check("roofing keeps the owner's own headline and button when the link carries no hook", variantContent("roofing").h1.join(" ") === "Complete Roof Report & Proposal — in Seconds." && variantContent("roofing").heroCta === "Get My First Roofing Report & Proposal →" && variantContent("roofing").priceFeature === "Roof estimator");

// ── the hooks
check("a hook key resolves whatever its case, spaces or underscores", resolveLandingHook("roofing", "no-report") === "no-report" && resolveLandingHook("roofing", " No_Report ") === "no-report" && resolveLandingHook("roofing", "NO REPORT") === "no-report" && resolveLandingHook("roofing", ["two-prices", "hours"]) === "two-prices");
check("an unknown key, free text, or a hook on a trade without a table is the trade's own hero", resolveLandingHook("roofing", "free-money") === undefined && resolveLandingHook("roofing", "Call 1-800 now for a refund") === undefined && resolveLandingHook("roofing", "") === undefined && resolveLandingHook("roofing", undefined) === undefined && resolveLandingHook("fencing", "no-report") === undefined && resolveLandingHook(undefined, "no-report") === undefined);
check("an inherited name is not a hook", resolveLandingHook("roofing", "constructor") === undefined && resolveLandingHook("roofing", "__proto__") === undefined && resolveLandingHook("roofing", "toString") === undefined && hookContent("roofing", "constructor") === undefined && hookContent("roofing", "hasOwnProperty") === undefined);
const hooked = withHook(variantContent("roofing"), hookContent("roofing", "no-report"));
check("a hook changes the two headline lines and the line under them, nothing else", hooked.h1.join(" | ") === "Stop Buying Roof Reports. | Stop Retyping Them." && /no PDF to order, no hours to wait\.$/.test(hooked.sub ?? "") && hooked.h1Break === true && hooked.h1Long === true && hooked.heroCta === "Get My First Roofing Report & Proposal →" && hooked.visual === "roof" && hooked.showcaseSlide === "roof" && hooked.priceFeature === "Roof estimator" && hooked.playOnPhone === true && hooked.shotCta === true && hooked.primaryCta === variantContent("roofing").primaryCta);
check("no hook, no change: the very same hero", withHook(variantContent("roofing"), undefined) === variantContent("roofing") && withHook(variantContent("roofing"), hookContent("roofing", "nope")) === variantContent("roofing"));
check("a trade's bold third line belongs to its own copy and goes when a hook takes the headline", withHook(variantContent("hvac"), { h1: ["A.", "B."], sub: "C.", ad: "x" }).subStrong === undefined);
const all = hooksOf("roofing");
check("every roofing ad has its opening line: twelve hooks, slug keys, two lines, a line under them, the ad named", all.length === 12 && all.every((h) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(h.key) && h.h1.length === 2 && h.h1.every((l) => l.trim().length >= 6 && /[.?]$/.test(l)) && h.sub.length >= 40 && h.sub.length <= 170 && /[.]$/.test(h.sub) && h.ad.length > 4), all.filter((h) => h.sub.length > 170 || h.sub.length < 40).map((h) => `${h.key}:${h.sub.length}`).join());
check("the headline lines are distinct, so two ads never share a first screen", new Set(all.map((h) => h.h1.join(" "))).size === all.length);
// The trial's terms and the price are the page's own lines, decided by the flag and the catalogue — a hook never states them.
const TERMS = /credit card|no card|free trial|\$\s?\d|per month|\/mo\b|instant|guarantee|#1|best/i;
check("no hook states the trial's terms, a price or a superlative — those lines are the page's own", all.every((h) => !TERMS.test(`${h.h1.join(" ")} ${h.sub}`)), all.filter((h) => TERMS.test(`${h.h1.join(" ")} ${h.sub}`)).map((h) => h.key).join());
check("hooksOf is empty for a trade without a table and for no trade", hooksOf("fencing").length === 0 && hooksOf(undefined).length === 0);

// ── the price
const plan = (slug: string, priceCents: number, features: string[]): PricedPlan => ({ slug, priceCents, isFree: priceCents === 0, features });
const live = [plan("starter", 4500, ["Proposal management", "CRM", "1 user"]), plan("professional", 9500, ["Everything in Starter", "Smart proposal generation", "Roof estimator", "Fence estimator"]), plan("advanced", 19900, ["Everything in Professional", "Video estimator"])];
check("the hero's price is the cheapest plan that carries the roof estimator — not the cheapest plan", cheapestPlanWith(live, "Roof estimator")?.slug === "professional" && heroPriceLine(variantContent("roofing"), live) === "Then from $95/mo · roof estimator included", String(heroPriceLine(variantContent("roofing"), live)));
check("a plan that rolls the row up from the one under it carries it too, and the cheaper of two carrying it wins", cheapestPlanWith(live, "roof estimator")?.slug === "professional" && cheapestPlanWith([...live].reverse().map((p) => ({ ...p, features: p.slug === "advanced" ? ["Roof estimator"] : p.features })), "Roof estimator")?.priceCents === 9500);
check("a flat list of rows reads the same as a rolled-up one", heroPriceLine(variantContent("roofing"), [plan("starter", 4500, ["CRM"]), plan("professional", 9500, ["CRM", "Roof estimator"]), plan("advanced", 19900, ["CRM", "Roof estimator", "Video estimator"])]) === "Then from $95/mo · roof estimator included");
check("no plan on sale carries the row, an empty catalogue, or a free plan that does: no price line", heroPriceLine(variantContent("roofing"), [plan("starter", 4500, ["CRM"])]) === null && heroPriceLine(variantContent("roofing"), []) === null && heroPriceLine(variantContent("roofing"), [plan("free", 0, ["Roof estimator"])]) === null);
check("a landing that names no plan row shows no price", heroPriceLine(variantContent("fencing"), live) === null && heroPriceLine(DEFAULT_LANDING, live) === null);
check("cents show when the price has them", heroPriceLine({ priceFeature: "Roof estimator" }, [plan("pro", 9550, ["Roof estimator"])]) === "Then from $95.50/mo");

console.log(bad ? `\n${bad} FAILED` : "\nall green");
process.exit(bad ? 1 : 0);

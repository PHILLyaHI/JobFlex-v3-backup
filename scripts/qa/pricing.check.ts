// Pricing by place and by kind of work (2026-09-18): underground utility
// work priced at public bid prices instead of house plumbing, and the job's
// market read city first, then state, then national. No model call.
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/pricing.check.ts
import { buildLegacyEstimatePrompt } from "../../src/lib/estimate/legacy-estimate";
import { detectSpecialty } from "../../src/lib/estimate/legacy/specialtyDetector";
import { detectTrade, STATE_COST_INDEX, TRADES } from "../../src/lib/estimate/trade-knowledge";
import { utilityJob, utilityRange, utilityPriceBlock, utilityRangeLine } from "../../src/lib/estimate/utility-work";
import { UTILITY_COMPONENTS, UTILITY_JOBS, utilityAnchorLines } from "../../src/lib/estimate/utility-prices-data";
import { locationIndex, locationLine } from "../../src/lib/estimate/location-index";
import { CITY_COST_INDEX } from "../../src/lib/estimate/location-index-data";
import { retryReasons } from "../../src/lib/estimate/remodel-sanity";
import { readBrief } from "../../src/lib/estimate/brief";
import { stateFromAddress } from "../../src/lib/pricing/salesTax";

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── The data ────────────────────────────────────────────────────────────────
const jobs = Object.entries(UTILITY_JOBS);
check("six utility job types, every range ordered, Seattle at or above national", jobs.length === 6 && jobs.every(([, j]) => j.national[0] < j.national[1] && j.seattle[0] < j.seattle[1] && j.seattle[0] >= j.national[0]));
check("the component prices are ordered and every one carries its basis", UTILITY_COMPONENTS.length >= 30 && UTILITY_COMPONENTS.every((c) => c.seattle[0] <= c.seattle[1] && (!c.national || c.national[0] <= c.national[1]) && c.basis.length > 2));
const anchors = utilityAnchorLines();
check("the anchor lines name pipe, manholes, traffic control, pavement and the fees, at contractor cost (bid less 15%)", anchors.some((a) => /^PVC sewer pipe 8 in\., supplied and laid with bedding: \$61-\$130\/linear ft national, \$80-\$196\/linear ft Seattle area$/.test(a)) && anchors.some((a) => /^King County sewage capacity charge .*: \$14,038\/unit \(Seattle-area fee\)$/.test(a)) && anchors.some((a) => /^Side sewer permit: \$100-\$500\/permit national/.test(a)) && anchors.some((a) => /^Precast manhole 48 in\./.test(a)) && anchors.some((a) => /^Traffic control lane closure/.test(a)) && anchors.some((a) => /trench patch/.test(a)) && anchors.some((a) => /\(Seattle-area fee\)$/.test(a)) && anchors.some((a) => /^Mobilization: 5-10% of the job/.test(a)));
check("the owner's figure sits inside the Seattle-area street main: $1,000/LF", UTILITY_JOBS["sewer-main-street"].seattle[0] <= 1000 && UTILITY_JOBS["sewer-main-street"].seattle[1] >= 1000);

// ── What kind of utility job a brief is ─────────────────────────────────────
const kind: Array<[string, string, string | null]> = [
  ["Run sewer in the street 300 linear feet", "sanitary-sewer", "sewer-main-street"],
  ["new sewer main in the road, 8 inch, 450 lf", "sanitary-sewer", "sewer-main-street"],
  ["Sewer line installation, 300 ft from the house to the city main, across the lawn and the driveway", "sanitary-sewer", "side-sewer-to-street"],
  ["replace 40 ft of sewer lateral in the yard", "sanitary-sewer", "side-sewer-yard"],
  ["new 8 inch water main in the street 400 lf", "water-utility-installation", "water-main-street"],
  ["new water service line from the meter to the house, 80 ft", "water-utility-installation", "water-service-yard"],
  ["storm drain in the street, 18 in. RCP, 200 lf", "storm-sewer", "storm-street"],
  ["the sewer backed up, need it cleared", "drain-cleaning", null],
  ["roots in the sewer line, need it jetted", "drain-cleaning", null],
  ["kitchen remodel", "kitchen-remodel", null],
];
const kindMiss = kind.filter(([b, s, want]) => utilityJob(b, s) !== want).map(([b, s, want]) => `${b} → ${utilityJob(b, s)} (want ${want})`);
check(`street or yard, sewer, storm or water (${kind.length} briefs)`, kindMiss.length === 0, kindMiss.join(" | "));

// ── Routing: never house plumbing ───────────────────────────────────────────
check("a sewer installation gets the utilities trade profile, a backup stays with plumbing",
  detectTrade("Run sewer in the street 300 linear feet").id === "utilities" && detectTrade("Sewer line installation, Lynnwood WA").id === "utilities" &&
  detectTrade("the sewer backed up, need it cleared").id === "plumbing" && detectTrade("roots in the sewer line, need it jetted").id === "plumbing" && detectTrade("clogged sewer line in the basement").id === "plumbing");
check("the specialty detector sends backups and roots to drain cleaning", detectSpecialty("the sewer backed up, need it cleared")?.specialty.id === "drain-cleaning" && detectSpecialty("roots in the sewer line, need it jetted")?.specialty.id === "drain-cleaning" && detectSpecialty("Run sewer in the street 300 linear feet")?.specialty.id === "sanitary-sewer");
const utilitiesTrade = TRADES.find((t) => t.id === "utilities")!;
check("the utilities profile carries the bid-price anchors and no plumbing ones", utilitiesTrade.anchors.length === anchors.length && !utilitiesTrade.anchors.some((a) => /PEX repipe|Toilet set/.test(a)) && !TRADES.find((t) => t.id === "plumbing")!.primary.includes("sewer"));

// ── The prompt ──────────────────────────────────────────────────────────────
const dallasTrade = buildLegacyEstimatePrompt({ description: "Run sewer in the street 300 linear feet", location: "Dallas, TX" }, { withTradeRules: true });
check("gpt-4o path: the utilities trade block with its anchors, the range line, no plumbing anchors",
  dallasTrade.prompt.includes("TRADE PROFILE: UNDERGROUND UTILITIES") && dallasTrade.prompt.includes("PVC sewer pipe 8 in., supplied and laid with bedding") && dallasTrade.prompt.includes("THIS BRIEF'S RANGE: a sewer main in a city street") && !dallasTrade.prompt.includes("PEX repipe") && !dallasTrade.prompt.includes("INSTALLED UNIT PRICES — UNDERGROUND UTILITIES"));
const dallas = buildLegacyEstimatePrompt({ description: "Run sewer in the street 300 linear feet", location: "Dallas, TX" });
check("reasoning path: the installed-price block and the location line instead", dallas.prompt.includes("INSTALLED UNIT PRICES — UNDERGROUND UTILITIES") && dallas.prompt.includes("LOCATION: the job is in") && !dallas.prompt.includes("TRADE PROFILE:"));
check("300 LF of street sewer in Dallas (0.92), at contractor cost: $84,000-$264,000", dallas.utilityJob === "sewer-main-street" && dallas.range?.low === 84000 && dallas.range?.high === 264000, JSON.stringify(dallas.range));
check("the owner's old answer ($37,500) is asked again; $300,000 stands",
  retryReasons({ lines: 19, coreSteps: dallas.procedureCoreSteps, total: 37500, range: dallas.range }).some((r) => /PUBLIC BID PRICES/.test(r)) &&
  retryReasons({ lines: 19, coreSteps: dallas.procedureCoreSteps, total: 300000, range: dallas.range }).length === 0);
check("a side sewer in a Spokane yard has its own, smaller range", (() => { const r = utilityRange(utilityJob("replace 40 ft of sewer lateral in the yard", "sanitary-sewer"), readBrief("replace 40 ft of sewer lateral in the yard"), "Spokane, WA"); return !!r && r.low >= 2000 && r.high <= 16000; })());
check("no run stated, no range", utilityRange("sewer-main-street", readBrief("run sewer in the street"), "Dallas, TX") === null);
check("the price block and range line read as bid prices", /INSTALLED UNIT PRICES/.test(utilityPriceBlock("sewer-main-street")) && /public bid prices/.test(utilityRangeLine(dallas.range as Parameters<typeof utilityRangeLine>[0])));

// ── The market: city, then state, then national ─────────────────────────────
check("a state with no listed city uses the state index", locationIndex("Somewhere, WV").level === "state" && locationIndex("Somewhere, WV").factor === STATE_COST_INDEX.WV);
check("no location reads national, and says so", locationIndex("").level === "national" && /no city or state was recognized/.test(locationLine(locationIndex(""))));
check("a city name two states share is not guessed without the state; with it, it resolves", locationIndex("Portland").level === "national" && locationIndex("Springfield").level === "national" && locationIndex("Portland, OR").place === "Portland, OR" && locationIndex("Portland, ME").place === "Portland, ME" && locationIndex("Bothell").place === "Bothell, WA");
check("a spelled-out state resolves", locationIndex("Dallas, Texas").state === "TX");
const stateCases: Array<[string, string]> = [["Charleston, West Virginia 25301", "WV"], ["Richmond, Virginia", "VA"], ["123 Main St, Austin, TX 78701", "TX"], ["New York 10001", "NY"], ["Everett WA 98201", "WA"], ["Rapid City, South Dakota", "SD"]];
const stateMiss = stateCases.filter(([a, want]) => stateFromAddress(a) !== want).map(([a, want]) => `${a} → ${stateFromAddress(a)} (want ${want})`);
check("the state reader: West Virginia is WV, not the Virginia inside it; the other forms hold", stateMiss.length === 0 && locationIndex("Charleston, West Virginia").place === "Charleston, WV", stateMiss.join(" | "));
if (CITY_COST_INDEX.length) {
  const lynn = locationIndex("Lynnwood, WA");
  check("a listed city wins over its state (Lynnwood)", lynn.level === "city" && lynn.factor >= 1.1, JSON.stringify(lynn));
  const lynnSewer = buildLegacyEstimatePrompt({ description: "Run sewer in the street 300 linear feet", location: "Lynnwood, WA" });
  check("300 LF of street sewer in Lynnwood uses the Seattle-area bids at cost, $208,700-$417,400; the owner's $300,000 sells inside it at a 15% markup", lynnSewer.range?.low === 208700 && lynnSewer.range?.high === 417400, JSON.stringify(lynnSewer.range));
  check("city rows are well formed", CITY_COST_INDEX.every((r) => /^[A-Z]{2}$/.test(r.state) && r.factor > 0.6 && r.factor < 1.8 && r.city.trim().length > 1));
}

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);

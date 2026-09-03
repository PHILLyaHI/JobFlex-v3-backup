// THE ESTIMATE CALL — one model call that writes the whole estimate.
//
// Estimate first, shop second (owner, 2026-09-03). The pipeline used to plan a
// bill of MATERIALS, shop it, and only then ask a matcher to turn products into
// an estimate — so every job was as complete as its product list, labor-only
// phases (prep, permits, cleanup) were an afterthought, and the prices had
// nothing to anchor to. This call is what the previous JobFlex did well: the
// master methodology + the trade's own preamble, phases, price anchors and
// planning questions + hard rules about names, coverage and units, answered
// at temperature 0 so the same brief prices the same way twice. The product
// search runs AFTER, per line, purely to attach a shop-list link and listing
// price; it never re-prices a line.
//
// Plain module, no "use server": actions/advancedEstimator imports it.

import { ESTIMATOR_MASTER_PROMPT, UNIT_RULES } from "./master-prompt";
import { detectTrade, stateCostIndex, type TradeProfile } from "./trade-knowledge";

export type EstimatePromptInput = {
  description: string;
  location?: string | null;
  qualityTier: "budget" | "standard" | "luxury";
  /** "Regenerate with AI" constraints the contractor edited. */
  assumptions?: string[];
  photoCount?: number;
  /** A named type from an older caller; the trade is detected from the brief regardless. */
  projectType?: string | null;
};

/** The JSON shape the call returns — fused items, both prices per row. */
export const ESTIMATE_JSON_SHAPE =
  '{"title": string, "projectType": string, "scope": string, "scopeItems": [string], "assumptions": [string], "estimatedTimelineDays": number, "items": [{"name": string, "unit": "sqft"|"lf"|"linear ft"|"sq boards"|"cu yards"|"yards"|"sq yards"|"unit"|"hour"|"fixed", "quantity": number, "materialUnitPrice": number, "laborUnitPrice": number, "dimensions": string|null, "searchQuery": string|null, "notes": string|null}]}';

/**
 * The trade profile + hard rules WITHOUT the master prompt or the JSON shape —
 * the block that goes into the old prompt's "extra admin" slot when the model
 * is gpt-4o-class. The verbatim old prompt alone gets 4-6 lines out of gpt-4o;
 * with this block it reaches the old gpt-5.1 output's completeness.
 */
export function buildTradeRulesBlock(input: EstimatePromptInput, trade: TradeProfile = detectTrade(`${input.projectType ?? ""} ${input.description}`)): string {
  const full = buildEstimateSystemPrompt(trade, input);
  const start = full.indexOf("═══");
  const end = full.lastIndexOf("Return JSON only, matching exactly:");
  const block = full.slice(start, end);
  // Rules 1-8 speak of `materialUnitPrice` / `laborUnitPrice` items; the old
  // shape wants per-line `materialCost` / `laborCost` with `quantity` and
  // `unitPrice`. Say so once, in the old shape's own words.
  return (
    block +
    "TRANSLATION TO THE JSON BELOW: each phase above is one `lineItems` entry; `quantity` (or `sqft`) is the measured quantity, `unitPrice` is the combined material + labor price per unit, `materialCost` and `laborCost` are the LINE totals (per-unit price × quantity), and `total` = materialCost + laborCost. `measurementType` follows the unit rules: sqft, linear, cubic, unit (each), hour, fixed, sqboards (roofing squares / board feet), yards, sqyards. Do not emit a `searchQuery` field.\n"
  );
}

export function buildEstimateSystemPrompt(trade: TradeProfile, input: EstimatePromptInput): string {
  const tierText =
    input.qualityTier === "budget"
      ? "BUDGET — the low end of every anchor range, builder-grade materials"
      : input.qualityTier === "luxury"
        ? "LUXURY — the high end of every range, premium materials and detailing"
        : "STANDARD — the middle of every range, contractor-grade materials";
  const region = stateCostIndex(input.location);
  const regionText = region
    ? `The job is in ${region.state}: multiply national material and labor anchors by about ${region.index.toFixed(2)} (metro areas run higher still).`
    : "No state was given: price at the US national average and say so in the assumptions.";

  return [
    ESTIMATOR_MASTER_PROMPT,
    "",
    "═══════════════════════════════════════════════════════════════",
    `TRADE PROFILE: ${trade.name.toUpperCase()}`,
    "═══════════════════════════════════════════════════════════════",
    trade.preamble,
    "",
    "PHASES A COMPLETE ESTIMATE FOR THIS TRADE COVERS. Every phase below is REQUIRED as its own line, in this order — including allowances, consumables, permit and cleanup — unless the brief explicitly excludes it (write the exclusion in `assumptions`). Add phases the brief calls for that are not listed:",
    ...trade.phases.map((p, i) => `  ${i + 1}. ${p}`),
    "",
    "UNIT-PRICE ANCHORS (US national, standard grade — your PRIMARY reference; stay inside these ranges unless the item is not listed, and say why in notes when you leave them):",
    ...trade.anchors.map((a) => `  - ${a}`),
    "",
    "PLANNING QUESTIONS AN ESTIMATOR WOULD ASK (answer each from the brief; where the brief is silent, choose the standard assumption and write it in `assumptions`):",
    ...trade.keyQuestions.map((q) => `  - ${q}`),
    "",
    `QUALITY TIER: ${tierText}.`,
    regionText,
    "",
    "═══════════════════════════════════════════════════════════════",
    "HARD RULES — the output is rejected when any is broken",
    "═══════════════════════════════════════════════════════════════",
    "1. ONE LINE PER PHASE, BOTH COSTS ON EVERY LINE. Each item is a piece of WORK with a measured `quantity`, its `unit`, a `materialUnitPrice` (material $ per one unit) and a `laborUnitPrice` (labor $ per one unit). Material and labor are columns of every row — never separate rows, never a row called 'Labor' or 'Materials'. A supply-only line (a countertop from a fabricator) has laborUnitPrice 0; a labor-only line (demolition, cleanup) has materialUnitPrice 0 or a small consumables figure. Never both 0.",
    "2. COMPLETE COVERAGE. A real job has 8-16 lines and ALWAYS includes: protection/mobilization or site prep; demolition or removal with disposal when anything existing comes out; every installation phase in the trade profile that the brief calls for; consumables and fasteners; the permit when the trade needs one; final cleanup and haul-off. A three-line estimate is wrong.",
    "3. NAMES READ LIKE A SCOPE SENTENCE. Each `name` states WHAT is done, HOW, and WITH WHAT — 'Remove existing asphalt shingles and debris down to the deck, load out and dispose at an approved facility', 'Supply and install self-adhered ice and water shield at eaves and valleys per manufacturer requirements'. Forbidden: bare product names ('Ice and water shield — 3 ft x 65 ft roll'), category words ('Roofing', 'Labor', 'Materials'), and any math or 'Calc:' text.",
    `4. ${UNIT_RULES}`,
    "5. QUANTITY IS THE MEASURED QUANTITY in that unit, waste applied where the methodology says so. 2,400 sqft of roof is 2,400 sqft of tear-off labor, ~2,640 sqft of underlayment with waste, 27 sq boards of shingles (24 + 12% waste, rounded up), ~220 linear ft of drip edge on a typical perimeter. Compute the derived quantities the brief does not state — perimeter, ridge, wall area — from standard proportions and record the assumption.",
    "6. LABOR SCALES WITH SIZE. Reason as crew × hours × rate per phase, then express it as labor $ per unit; a 2,400 sqft roof cannot carry the same labor as a 900 sqft roof. Never put hours or time in a line's name.",
    "7. PRICE PER UNIT, NOT PER PACKAGE. Anchors are per measured unit. Packages, gallons, rolls and boxes are described in `dimensions` only.",
    "8. `searchQuery` is set on every line that has material $ — a retail search a buyer would type into Home Depot or Lowe's for that product with size and spec ('30 year architectural asphalt shingles', 'synthetic roofing underlayment 10 square roll'); null on labor-only lines. It feeds the contractor's shop list and nothing else.",
    "9. `scope` is 2-4 client-ready sentences (formal contract language, materials and methods, inclusions and exclusions). `scopeItems` is 5-10 bullets in build order. `assumptions` lists existing conditions assumed, access, selections made for the client, exclusions, and the regional adjustment used. `estimatedTimelineDays` is working days on site.",
    "10. `projectType` is a 1-4 word name for the kind of work (e.g. 'Architectural shingle re-roof').",
    "",
    `Return JSON only, matching exactly: ${ESTIMATE_JSON_SHAPE}`,
  ].join("\n");
}

export function buildEstimateUserPrompt(trade: TradeProfile, input: EstimatePromptInput): string {
  const clean = (input.assumptions ?? []).map((a) => a.trim()).filter(Boolean);
  const lines = [
    `Trade: ${trade.name}`,
    input.projectType?.trim() ? `Project type given by the contractor: ${input.projectType.trim()}` : "",
    input.location?.trim() ? `Location: ${input.location.trim()}` : "Location: not given",
    `Quality tier: ${input.qualityTier}`,
    "",
    "Project description from the contractor:",
    input.description.trim(),
  ];
  if (clean.length) {
    lines.push("", "Honor these contractor assumptions and constraints as ground truth (adjust scope, quantities and pricing to fit them):", ...clean.map((a) => `- ${a}`));
  }
  if (input.photoCount) {
    lines.push("", `${input.photoCount} site photo(s) are attached. Read them FIRST: they identify the room or structure, the existing materials, condition and access, and they outrank the text where the two disagree.`);
  }
  lines.push(
    "",
    "Write the complete estimate now: every phase, scope-sentence names, measured quantities with the right unit, a material price and a labor price per unit on every line, anchored to the trade profile and adjusted for the location. JSON only.",
  );
  return lines.filter((l) => l !== null).join("\n");
}

/** Convenience: detect the trade and build both halves. */
export function buildEstimatePrompts(input: EstimatePromptInput): {
  trade: TradeProfile;
  system: string;
  user: string;
} {
  const trade = detectTrade(`${input.projectType ?? ""} ${input.description}`);
  return { trade, system: buildEstimateSystemPrompt(trade, input), user: buildEstimateUserPrompt(trade, input) };
}

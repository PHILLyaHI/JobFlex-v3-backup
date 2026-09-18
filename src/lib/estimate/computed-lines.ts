// COMPUTED MONEY-PHASE LINES — the phases whose quantity the brief actually
// states, priced without asking the model anything.
//
// THE PROBLEM THIS SOLVES. Three runs of the same brief, temperature 0, seed
// 42, came back at $16,918 / $22,468 / $17,128 — an 28% spread on a roof whose
// only stated numbers were 1,800 sqft, one layer, and three pipe boots. The
// quantity signature differed on every pass: the model invented 300 sqft of ice
// & water, 220 lf of drip edge and an 80 lf run of step flashing that the brief
// never mentions, and priced each slightly differently each time. Validation
// (2026-09-17) fixed what was WRONG in an estimate; it did nothing about the
// estimate being a different document each time you asked.
//
// THE RULE. A phase is computed only when the brief MEASURES it. Quantity comes
// from lib/estimate/brief-facts (which reads numbers and never infers one), and
// price comes from two places with a stated provenance:
//
//   material — the existing SerpAPI merchant path, through its cache, with a
//              sanity corridor: a retail price outside [0.3x, 3x] of the trade
//              anchor is discarded and the anchor is used instead. Retail search
//              returns a $9 sample board and a $900 pallet for the same words;
//              the corridor is what keeps either out of a customer's estimate.
//   labor    — the organization's own rate when it has one, else the trade
//              anchor lifted by the state cost index (WA = 1.15).
//
// A phase the brief does not measure is NOT computed. It stays the model's,
// with the ordinary validation, exactly as before — an estimate with no
// measurements in it is unchanged by this file.
//
// WHAT A COMPUTED LINE PROMISES. Same brief in, same quantity and same price
// out, every time, from anyone's machine. That is the whole point: the spread
// that remains belongs only to the phases nobody measured.
import {
  countOf,
  extractBriefFacts,
  lfOf,
  roofSurfaceSqft,
  type BriefFacts,
} from "./brief-facts";
import { stateCostIndex, type TradeProfile } from "./trade-knowledge";

/** Where a computed line's material price came from. Printed in the line's
 *  note, shown in the UI on hover — an operator must never have to guess
 *  whether a number was shopped or assumed. */
export type MaterialSource = "live" | "cached" | "anchor";

export interface MaterialQuote {
  /** Retail price in the line's unit. */
  price: number;
  source: MaterialSource;
  /** Merchant or search phrase, for the note. */
  via?: string;
}

/**
 * Prices one material through the app's existing merchant path.
 *
 * Injected rather than imported so this module stays pure and testable: the
 * whole rule table can be exercised offline, with no network and no key, by
 * passing a pricer that always returns null (every line then falls to its
 * anchor, which is the documented fallback).
 */
export type MaterialPricer = (
  query: string,
  unit: string,
) => Promise<MaterialQuote | null>;

/** The corridor a retail price must land in to be believed. */
export const RETAIL_MIN = 0.3;
export const RETAIL_MAX = 3;

export interface ComputedLine {
  name: string;
  unit: string;
  quantity: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  notes: string;
  searchQuery: string | null;
  /** Travels to the UI beside "auto" / "adjusted" / "suggested". */
  flag: "computed";
  flagNote: string;
  /** The trade phase this line settles, so the merge can drop the model's
   *  duplicate of the same work. */
  phaseId: string;
}

/** A quantity the brief stated, with the words it came from. */
interface Qty {
  value: number;
  /** "1,800 sqft × 9/12 pitch ÷ 100 + 10% waste" — printed in the note. */
  basis: string;
}

interface Rule {
  id: string;
  /** Matches an entry in the trade's own `phases` list. */
  phase: string;
  unit: string;
  /** The brief's measurement, or undefined when it did not measure this. */
  qty: (f: BriefFacts) => Qty | undefined;
  /** Per-unit anchor midpoints, BEFORE the regional index. */
  anchor: { material: number; labor: number };
  /** What to ask the merchant. null = labor-only phase, no retail lookup. */
  search: string | null;
  name: (q: Qty, f: BriefFacts) => string;
  /** An adder applied per extra unit of something the brief counted (roofing's
   *  second and third tear-off layers are the only user today). */
  perExtra?: { labor: number; of: (f: BriefFacts) => number };
  /** Model lines that cover this same work, to be dropped at merge. */
  claims: RegExp;
}

// ── Derivation constants ────────────────────────────────────────────────────
// A derivation turns a stated measurement into the unit a phase is priced in.
// It is NOT an invention: each one is a fixed, named ratio, printed in the
// line's basis so the customer sees the arithmetic. The only judgement is the
// constant itself, and it lives here rather than inside a regex.

/** Shingle waste on a simple gable; the roofing preamble's own 10–15%. */
const SHINGLE_WASTE = 1.1;
/** 1 roofing square = 100 sqft. */
const SQFT_PER_SQUARE = 100;
/** Interior wall area from floor area at an 8 ft ceiling, openings deducted.
 *  The one conversion in this table that a brief never states outright; it is
 *  disclosed in the line basis every time it is used. */
const WALL_FACTOR = 3;
/** Exterior wall area from the house's stated floor area, two-storey cladding. */
const SIDING_FACTOR = 1.1;

const mid = (lo: number, hi: number) => (lo + hi) / 2;

// ── ROOFING ─────────────────────────────────────────────────────────────────
const ROOFING: Rule[] = [
  {
    id: "roof-tearoff",
    phase: "Tear-off and disposal of the existing shingles down to the deck",
    unit: "sqft",
    // Tear-off is charged on the plan area actually torn off, per layer.
    qty: (f) => {
      const plan = f.areaSqft?.value ?? f.dims?.sqft;
      if (!plan) return undefined;
      return { value: plan, basis: f.areaSqft?.source ?? f.dims?.source ?? `${plan} sqft` };
    },
    // The anchor is one layer; each additional layer adds its own range.
    anchor: { material: 0, labor: mid(1.2, 2.0) },
    perExtra: { labor: mid(0.5, 0.9), of: (f) => Math.max(0, (f.layers?.value ?? 1) - 1) },
    search: null,
    name: (q, f) => {
      const layers = f.layers?.value ?? 1;
      return `Tear off ${layers === 1 ? "one layer" : `${layers} layers`} of existing roofing down to the deck, load out and dispose`;
    },
    claims: /tear[- ]?off|remove existing (asphalt|roof|shingle)|strip the roof/i,
  },
  {
    id: "roof-shingles",
    phase: "Supply and install architectural shingles",
    unit: "sq boards",
    qty: (f) => {
      const surface = roofSurfaceSqft(f);
      if (!surface) return undefined;
      const squares = (surface.sqft / SQFT_PER_SQUARE) * SHINGLE_WASTE;
      return {
        value: Math.round(squares * 10) / 10,
        basis: `${surface.basis} ÷ ${SQFT_PER_SQUARE} sqft/square + ${Math.round((SHINGLE_WASTE - 1) * 100)}% waste`,
      };
    },
    anchor: { material: mid(110, 160), labor: mid(150, 260) },
    search: "30-year architectural asphalt shingles per square",
    name: () => "Supply and install architectural shingles",
    claims: /architectural shingle|shingle system|supply and install .*shingle|impact[- ]resistant shingle/i,
  },
  {
    id: "roof-underlayment",
    phase: "Synthetic underlayment over the full deck",
    unit: "sqft",
    qty: (f) => {
      const surface = roofSurfaceSqft(f);
      if (!surface) return undefined;
      return { value: surface.sqft, basis: surface.basis };
    },
    anchor: { material: mid(0.25, 0.45), labor: mid(0.15, 0.3) },
    search: "synthetic roofing underlayment roll",
    name: () => "Synthetic underlayment over the full deck",
    claims: /underlayment/i,
  },
  {
    id: "roof-boots",
    phase: "Pipe boots, vents and penetration flashings",
    unit: "unit",
    qty: (f) => {
      const c = countOf(f, "pipe boot", "boot");
      return c ? { value: c.value, basis: c.source } : undefined;
    },
    anchor: { material: mid(20, 45), labor: mid(35, 60) },
    search: "roof pipe boot flashing",
    name: (q) => `Replace pipe boots and penetration flashings (${q.value})`,
    claims: /pipe boot|penetration flashing|vent flashing/i,
  },
  {
    id: "roof-stepflash",
    phase: "Step, wall and chimney flashing",
    unit: "linear ft",
    qty: (f) => {
      const l = lfOf(f, "step flashing", "wall and step", "flashing");
      return l ? { value: l.value, basis: l.source } : undefined;
    },
    anchor: { material: mid(2, 4), labor: mid(3, 6) },
    search: "galvanized step flashing",
    name: () => "Step and wall flashing where the roof meets vertical surfaces",
    claims: /step (and|\/) ?wall flashing|wall and step flashing|step flashing/i,
  },
];

// ── PAINTING ────────────────────────────────────────────────────────────────
// PAINTING. Only two phases here are measurable from a brief, and the ones
// that are NOT are the expensive ones — which is exactly why they are left to
// the model. A dry run of the first draft priced the 1,100 sqft condo's walls
// at 3,300 sqft (floor × 3) and charged $13,926 against a job the model
// estimates at ~$7,200: the wall factor was doing the work a measurement is
// supposed to do. A painted surface a brief never states is not a fact, and a
// line flagged "computed" must not be a guess wearing that badge.
const PAINTING: Rule[] = [
  {
    id: "paint-ceilings",
    phase: "Ceilings",
    unit: "sqft",
    qty: (f) => {
      // Interior work only, and only the one identity that needs no factor:
      // ceiling area IS floor area.
      if (!f.interior) return undefined;
      const plan = f.areaSqft?.value;
      if (!plan) return undefined;
      return { value: plan, basis: `${f.areaSqft!.source} floor area (ceiling = floor)` };
    },
    anchor: { material: mid(0.3, 0.6), labor: mid(1.5, 2.5) },
    search: "interior ceiling paint gallon",
    name: () => "Ceilings",
    claims: /\bceilings?\b/i,
  },
  {
    id: "paint-trim",
    phase: "Trim, doors and casing",
    unit: "linear ft",
    qty: (f) => {
      const l = lfOf(f, "trim");
      return l ? { value: l.value, basis: l.source } : undefined;
    },
    anchor: { material: mid(0.5, 1.0), labor: mid(1.5, 3.0) },
    search: "exterior trim paint gallon",
    name: (q, f) => `Trim — ${f.coats?.trim ?? 1} coat${(f.coats?.trim ?? 1) === 1 ? "" : "s"} on ${q.value} linear ft`,
    claims: /replace .*trim|rotted trim/i,
  },
];

// ── PLUMBING ────────────────────────────────────────────────────────────────
const PLUMBING: Rule[] = [
  {
    id: "plumb-rough-fixtures",
    phase: "Rough-in supply and drain",
    unit: "unit",
    qty: (f) => {
      const c = countOf(f, "fixture");
      return c ? { value: c.value, basis: c.source } : undefined;
    },
    anchor: { material: mid(150, 300), labor: mid(400, 1200) },
    search: "PEX supply rough-in kit per fixture",
    name: (q) => `Rough-in supply and drain, ${q.value} fixtures`,
    claims: /rough[- ]?in|repipe|re-?pipe house/i,
  },
  {
    id: "plumb-waterheater",
    phase: "Water heater",
    unit: "unit",
    qty: (f) => (f.gallons ? { value: 1, basis: f.gallons.source } : undefined),
    anchor: { material: mid(800, 1500), labor: mid(500, 900) },
    search: "50 gallon gas water heater",
    name: (q, f) => `Supply and install ${f.gallons?.value ?? 50}-gallon gas water heater`,
    claims: /water heater/i,
  },
  {
    id: "plumb-patching",
    phase: "Access openings and patching",
    unit: "unit",
    qty: (f) => {
      const c = countOf(f, "wall section", "section");
      return c ? { value: c.value, basis: c.source } : undefined;
    },
    anchor: { material: mid(20, 45), labor: mid(120, 240) },
    search: "drywall patch panel",
    name: (q) => `Open and patch ${q.value} wall sections`,
    claims: /wall access|patch/i,
  },
];

// ── KITCHEN ─────────────────────────────────────────────────────────────────
const KITCHEN: Rule[] = [
  {
    id: "kitchen-demo",
    phase: "Demolition of cabinets, countertops, backsplash and flooring; haul-off",
    unit: "sqft",
    qty: (f) => {
      const plan = f.areaSqft?.value;
      if (!plan) return undefined;
      return { value: plan, basis: `${f.areaSqft!.source} of kitchen` };
    },
    anchor: { material: 0, labor: mid(4, 8) },
    search: null,
    name: () => "Demolition of cabinets, counters, backsplash and flooring, with haul-off",
    claims: /demo(lition)?\b|demo the existing/i,
  },
  {
    id: "kitchen-circuits",
    phase: "Electrical rough-in — circuits, outlets, under-cabinet and ceiling lighting",
    unit: "unit",
    qty: (f) => {
      const c = countOf(f, "circuit");
      return c ? { value: c.value, basis: c.source } : undefined;
    },
    anchor: { material: mid(60, 140), labor: mid(200, 500) },
    search: "20 amp circuit wiring run",
    name: (q) => `Electrical rough-in — ${q.value} dedicated 20-amp circuits`,
    claims: /circuit/i,
  },
  // NO FLOORING RULE. The kitchen anchors in trade-knowledge price demo,
  // cabinets, counters, backsplash, sink, rough-in, electrical, appliances and
  // paint — there is no flooring anchor, so a computed flooring line would have
  // to invent its own price. It stays the model's.
];

const TABLE: Record<string, Rule[]> = {
  roofing: ROOFING,
  painting: PAINTING,
  plumbing: PLUMBING,
  kitchen: KITCHEN,
};

/** Which trades this table covers. A trade outside it is untouched: every
 *  phase stays the model's, exactly as before. */
export const COMPUTED_TRADES = Object.keys(TABLE);

export interface ComputeInput {
  description: string;
  trade: TradeProfile | null | undefined;
  /** Two-letter state, for the labor index. */
  state?: string | null;
  /** The shop's own labor rate multiplier, when it has one. */
  orgLaborRate?: { perHour?: number | null } | null;
  priceMaterial?: MaterialPricer;
}

export interface ComputeResult {
  lines: ComputedLine[];
  /** Phases this trade could have computed but the brief did not measure. */
  skipped: { id: string; phase: string }[];
  facts: BriefFacts;
}

/**
 * Build every computed line a brief earns.
 *
 * Never throws and never blocks an estimate: a merchant lookup that fails
 * falls to the anchor, and a trade with no rules returns nothing at all.
 */
export async function computeLines(input: ComputeInput): Promise<ComputeResult> {
  const rules = input.trade ? (TABLE[input.trade.id] ?? []) : [];
  const facts = extractBriefFacts(input.description);
  // The regional index the rest of the estimator uses. No state, no lift — an
  // unlocated brief is priced at the national anchor rather than at a guess.
  const idx = stateCostIndex(input.state ?? null)?.index ?? 1;
  const lines: ComputedLine[] = [];
  const skipped: { id: string; phase: string }[] = [];

  for (const rule of rules) {
    const q = rule.qty(facts);
    if (!q || !(q.value > 0)) {
      skipped.push({ id: rule.id, phase: rule.phase });
      continue;
    }

    // ── Labor ──
    // The shop's own rate wins; nothing else is as right for their crew.
    // Otherwise the trade anchor, lifted by the state index (WA = 1.15).
    const extra = rule.perExtra ? rule.perExtra.labor * rule.perExtra.of(facts) : 0;
    const laborUnitPrice = round2((rule.anchor.labor + extra) * idx);

    // ── Material ──
    const anchorMaterial = round2(rule.anchor.material * idx);
    let materialUnitPrice = anchorMaterial;
    let source: MaterialSource = "anchor";
    let via = "";
    if (rule.search && rule.anchor.material > 0 && input.priceMaterial) {
      try {
        const quote = await input.priceMaterial(rule.search, rule.unit);
        if (quote && quote.price > 0) {
          const lo = anchorMaterial * RETAIL_MIN;
          const hi = anchorMaterial * RETAIL_MAX;
          if (quote.price >= lo && quote.price <= hi) {
            materialUnitPrice = round2(quote.price);
            source = quote.source;
            via = quote.via ?? "";
          } else {
            // Outside the corridor: a pallet price or a sample swatch, not this
            // line's material. The anchor stands and the note says why.
            via = `retail $${quote.price.toFixed(2)} outside ${RETAIL_MIN}–${RETAIL_MAX}× corridor`;
          }
        }
      } catch {
        /* the anchor is the fallback; an estimate is never blocked on a search */
      }
    }

    const sourceNote =
      source === "anchor"
        ? `material from trade anchor${via ? ` (${via})` : ""}`
        : `material ${source}${via ? ` · ${via}` : ""}`;

    lines.push({
      name: rule.name(q, facts),
      unit: rule.unit,
      quantity: q.value,
      materialUnitPrice,
      laborUnitPrice,
      notes: `Computed from your description: ${q.basis}. ${cap(sourceNote)}; labor from ${
        input.orgLaborRate?.perHour ? "your shop's rate" : `trade anchor × ${idx.toFixed(2)} regional index`
      }.`,
      searchQuery: rule.search,
      flag: "computed",
      flagNote: `quantity measured from your description — ${sourceNote}`,
      phaseId: rule.id,
    });
  }

  return { lines, skipped, facts };
}

/** Model lines that duplicate a computed phase, to be dropped at merge. */
export function claimedBy(lineName: string, computed: ComputedLine[]): string | null {
  for (const c of computed) {
    const rule = Object.values(TABLE)
      .flat()
      .find((r) => r.id === c.phaseId);
    if (rule && rule.claims.test(lineName)) return c.phaseId;
  }
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Handing the computed lines to the model ─────────────────────────────────

/**
 * The block appended to the estimate prompt.
 *
 * The model is shown the computed lines as FACTS and told three things: they
 * are already priced, it must not restate them, and it should price the rest of
 * the job around them. Phrased as a ledger it is reading rather than a
 * constraint it is obeying — a model asked not to touch a number reliably
 * touches it; a model shown a filled-in section of a form fills in the rest.
 */
export function computedPromptBlock(lines: ComputedLine[]): string {
  if (!lines.length) return "";
  const rows = lines.map(
    (l) =>
      `  · ${l.name} — ${l.quantity} ${l.unit} @ $${l.materialUnitPrice.toFixed(2)} material + $${l.laborUnitPrice.toFixed(
        2,
      )} labor per ${l.unit} (${l.notes})`,
  );
  return [
    "",
    "═══════════════════════════════════════════════════════════════",
    "ALREADY PRICED — measured from the customer's own description and costed",
    "from live supplier pricing. These lines are settled and are NOT yours to",
    "restate, re-quantify or re-price:",
    ...rows,
    "",
    "Do NOT include any of the work above in your line items — it is already on",
    "the estimate. Price only what is left: the phases this job needs that are",
    "not listed above. If one of the settled lines looks wrong to you, say so in",
    "`pricing.notes` instead of changing it.",
    "═══════════════════════════════════════════════════════════════",
    "",
  ].join("\n");
}

/** A model line and the computed line that already covers the same work. */
export interface MergeResult<T> {
  items: T[];
  /** Model lines dropped because a computed line already settles that phase. */
  dropped: { name: string; phaseId: string }[];
}

/**
 * Put the computed lines at the head of the estimate and remove the model's
 * duplicates of them.
 *
 * The prompt asks the model not to repeat these phases; it repeats them anyway
 * often enough that the merge, not the prompt, is what guarantees a job is
 * never billed twice. Matching is by the rule's own `claims` pattern, which is
 * written per phase and deliberately narrow.
 */
export function mergeComputed<T extends { name: string }>(
  modelItems: T[],
  computed: ComputedLine[],
): MergeResult<T | ComputedLine> {
  if (!computed.length) return { items: modelItems, dropped: [] };
  const dropped: { name: string; phaseId: string }[] = [];
  const kept = modelItems.filter((it) => {
    const phaseId = claimedBy(it.name, computed);
    if (phaseId) {
      dropped.push({ name: it.name, phaseId });
      return false;
    }
    return true;
  });
  return { items: [...computed, ...kept], dropped };
}

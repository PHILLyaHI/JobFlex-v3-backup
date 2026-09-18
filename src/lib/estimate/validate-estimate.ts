// WHAT THE ESTIMATOR RETURNED, JUDGED BEFORE IT REACHES A CONTRACTOR.
//
// The 2026-09-17 accuracy audit ran ten briefs three times each through the
// live path. What came back:
//   · the same brief priced $1,021 and $3,000 on two runs (98% apart) even at
//     temperature 0 with a fixed seed — the reply is not reproducible, and a
//     comment in advancedEstimator claimed it was;
//   · assumptions that said "permits and inspections are included" over an
//     estimate with no permit line — three runs out of three on a re-roof;
//   · whole phases dropped between runs: the upper cabinets of a kitchen
//     ($7,500, a quarter of the job), both tub/shower valves of a repipe;
//   · a water-heater replacement worth $2,300 invented on a repipe brief that
//     only asked for its connections to be re-piped;
//   · $1 of material for a 50-gallon water heater, $16/ft of PEX against a
//     $2-4 anchor, 2,800 linear ft of caulk on a 2,800 sq ft house (the wall
//     area used as a length, ten times the real figure);
//   · roofing install labor at $130/sq against an anchor floor of $150.
//
// So the model's answer is now checked against the trade's own phases, its
// price anchors, the units a line of that kind is measured in, and the
// promises the estimate itself makes. Violations go back to the model once or
// twice as a list to fix; whatever is still wrong after that is repaired
// deterministically and SAID OUT LOUD on the estimate — a line the app added
// carries "added", a price it pulled to the anchor carries "adjusted", and
// work the brief never asked for is set aside as a suggestion rather than
// billed.
//
// Pure module, no I/O.

import { corridorFor, matchAnchor, parseTradeAnchors, type ParsedAnchor } from "./estimate-anchors";
import { normalizeUnit } from "./console-model";
import { stateCostIndex, type TradeProfile } from "./trade-knowledge";

/** One fused estimate line, as legacyEstimateFromText produces them. */
export interface CheckedItem {
  name: string;
  unit: string;
  quantity: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  notes?: string;
  searchQuery: string | null;
  /** Set by the repair pass; travels to the UI. */
  flag?: "auto" | "adjusted" | "suggested" | "computed";
  flagNote?: string;
}

export type ViolationCode =
  | "promise-unpriced"
  | "missing-required"
  | "missing-phase"
  | "price-out-of-corridor"
  | "unit-mismatch"
  | "quantity-implausible"
  | "too-few-lines"
  | "out-of-scope";

export interface Violation {
  code: ViolationCode;
  /** Index into the items array, when the violation is about one line. */
  item?: number;
  /** One sentence, written so it can be handed straight back to the model. */
  message: string;
  /** A violation the estimate cannot ship with. */
  blocking: boolean;
}

export interface ValidationInput {
  items: CheckedItem[];
  description: string;
  location?: string | null;
  assumptions: string[];
  trade: TradeProfile;
}

export interface ValidationReport {
  violations: Violation[];
  blocking: Violation[];
  regionIndex: number;
  regionState: string | null;
}

// ── the four lines a job of any size carries ────────────────────────────────

interface RequiredLine {
  id: "permit" | "disposal" | "cleanup" | "protection";
  /** Does an estimate line cover it? */
  line: RegExp;
  /** Does the trade's own phase list call for it? */
  phase: RegExp;
  /** Does an assumption promise it? */
  promise: RegExp;
  /** The anchor to price an inserted line from. */
  anchor: RegExp;
  insertName: string;
}

const REQUIRED: RequiredLine[] = [
  {
    id: "permit",
    line: /\bpermit|inspection fee|building department/i,
    phase: /permit/i,
    promise: /permit/i,
    anchor: /permit/i,
    insertName: "Obtain the permit and schedule the required inspections",
  },
  {
    id: "disposal",
    line: /dispos|haul[- ]?(off|away)|dumpster|debris|landfill|tear[- ]?off/i,
    phase: /dispos|haul|demolition|tear[- ]?off|removal/i,
    promise: /dispos|haul|dumpster|debris/i,
    anchor: /dumpster|dispos|haul/i,
    insertName: "Load out and dispose of the debris at an approved facility",
  },
  {
    id: "cleanup",
    line: /clean[- ]?up|final clean|broom clean|magnetic sweep|site clean/i,
    phase: /clean/i,
    promise: /clean/i,
    anchor: /clean/i,
    insertName: "Final cleanup and site tidy on completion",
  },
  {
    id: "protection",
    line: /protect|mask|drop cloth|mobiliz|site prep|staging|cover/i,
    phase: /protect|mobiliz|site prep|staging/i,
    promise: /protect|mask|drop cloth/i,
    anchor: /protect|mobiliz|staging/i,
    insertName: "Protect the work area and mobilise to site",
  },
];

/** Other things an estimate can promise in its assumptions and never price. */
const PROMISES: Array<{ id: string; promise: RegExp; line: RegExp; label: string }> = [
  { id: "lift", promise: /\b(lift|scaffold|boom|man ?lift)\b/i, line: /lift|scaffold|staging|boom/i, label: "lift or scaffolding" },
  { id: "dumpster", promise: /\bdumpster\b/i, line: /dumpster|dispos|haul/i, label: "a dumpster" },
  { id: "warranty", promise: /\bwarranty (registration|fee)\b/i, line: /warranty/i, label: "a warranty registration" },
];

/** An assumption only promises something when it says it is INCLUDED. */
const INCLUDED = /\b(include[ds]?|included|covered|in the (estimate|proposal|price)|is priced|are priced|accounted)\b/i;

// ── work a brief has to ask for by name ─────────────────────────────────────

const CONDITIONAL_WORK: Array<{ trades: string[]; line: RegExp; brief: RegExp; label: string }> = [
  {
    trades: ["plumbing"],
    line: /water heater/i,
    // The verb has to be in the SAME clause: "replace both tub/shower valves,
    // re-pipe the water heater connections" asks for no new water heater.
    brief: /(replace|replacing|replacement|new|install|swap|upgrade)[^.,;]{0,25}water heater|water heater[^.,;]{0,25}(replace|replacement|swap|install)/i,
    label: "replacing the water heater",
  },
  { trades: ["roofing", "gutters"], line: /\bgutter|downspout/i, brief: /\bgutter|downspout/i, label: "gutter work" },
  { trades: ["roofing"], line: /skylight/i, brief: /skylight/i, label: "skylight work" },
  { trades: ["roofing"], line: /\bsolar\b/i, brief: /\bsolar\b/i, label: "solar panel work" },
  { trades: ["painting"], line: /\b(lift|scaffold)\b/i, brief: /\b(lift|scaffold|two[- ]stor|second stor|tall|high|ladder)\b/i, label: "lift or scaffolding" },
  { trades: ["decking"], line: /\brailing|baluster/i, brief: /\brailing|baluster|guard ?rail/i, label: "railing" },
  { trades: ["decking"], line: /\bstair|step/i, brief: /\bstair|step/i, label: "stairs" },
  { trades: ["kitchen", "bathroom"], line: /appliance|range hood|garbage disposal|dishwasher/i, brief: /appliance|range hood|garbage disposal|dishwasher|vent(ed)? outside/i, label: "appliance work" },
  { trades: ["kitchen", "bathroom"], line: /\bskylight|window\b/i, brief: /\bskylight|window\b/i, label: "window work" },
  { trades: ["flooring", "tile"], line: /\bsubfloor replacement|joist/i, brief: /\bsubfloor|joist|rot/i, label: "structural floor work" },
];

// ── units a line of a given kind is measured in ─────────────────────────────

const LENGTH_WORK = /caulk|trim\b|baseboard|casing|drip edge|ridge (vent|cap)|gutter|downspout|railing|molding|moulding|fascia|soffit|edging|coping|step flashing|wall flashing|starter strip|base ?board/i;
const AREA_WORK = /\bpaint(ing)?\b|two coats|second coat|underlayment|shingle|drywall|\bfloor(ing)?\b|\btile\b|membrane|sheathing|housewrap|ice ?& ?water|ice and water|sod|turf|insulation/i;

/**
 * Only the HEAD of a line name says what the line is measured in. "Remove
 * existing deck boards and railing; dispose of debris" is an AREA of
 * demolition that happens to mention a railing, and "Surface preparation
 * including patching, sanding and caulking" is an area of prep that happens to
 * mention caulk — a whole-name match called both of them length work.
 */
const HEAD_CHARS = 30;
const headIs = (re: RegExp, name: string) => re.test(name.slice(0, HEAD_CHARS));

/**
 * Handling something that is already there is not supplying a new one, so a
 * supply anchor says nothing about its price: "Reset existing vanity and
 * toilet" is not the "Vanity + top" anchor, however many words they share.
 */
const HANDLING_ONLY = /\breset|re-?install|re-?hang|re-?attach|adjust|protect|remove|haul|clean|dispose|demolish|tear[- ]?off/i;

const AREA_IN_BRIEF = /\b([\d][\d,]{1,6})\s*(?:sq\.?\s?ft|sqft|square\s*(?:feet|ft))/i;

/** Plan area named in the brief, when it names one. */
export function briefAreaSqft(description: string): number | null {
  const m = description.match(AREA_IN_BRIEF);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n >= 100 ? n : null;
}

/** The perimeter of a 1.6-aspect rectangle of that area — the length scale a
 *  brief of this size implies. Interior trim runs several times it, so the
 *  implausibility cap is four perimeters. */
function perimeterOf(areaSqft: number): number {
  const long = Math.sqrt(areaSqft * 1.6);
  return 2 * (long + areaSqft / long);
}

const floorOfRange = (range: string | undefined): number => {
  const m = (range ?? "8-16").match(/(\d+)\s*[-–]\s*(\d+)/);
  return m ? Number(m[1]) : 8;
};

/**
 * Judge one parsed estimate. Pure: it reports, it does not change anything.
 */
export function validateEstimate(input: ValidationInput): ValidationReport {
  const { items, trade } = input;
  const region = stateCostIndex(input.location);
  const regionIndex = region?.index ?? 1;
  const anchors = parseTradeAnchors(trade);
  const v: Violation[] = [];
  const nameOf = (i: number) => items[i]?.name ?? "";
  const anyLine = (re: RegExp) => items.some((it) => re.test(it.name) || (it.notes ? re.test(it.notes) : false));

  // (a) + (d) the four required lines, and anything the estimate promises
  for (const req of REQUIRED) {
    if (anyLine(req.line)) continue;
    const promised = input.assumptions.some((a) => req.promise.test(a) && INCLUDED.test(a));
    const inPhases = trade.phases.some((p) => req.phase.test(p));
    if (promised) {
      v.push({
        code: "promise-unpriced",
        blocking: true,
        message: `The assumptions say ${req.id} is included, but no line prices it. Add the ${req.id} line (or drop the claim from the assumptions).`,
      });
    } else if (inPhases) {
      v.push({
        code: "missing-required",
        blocking: true,
        message: `No ${req.id} line. This trade's phases require one — add it, or state in the assumptions why this job has none.`,
      });
    }
  }
  for (const p of PROMISES) {
    if (anyLine(p.line)) continue;
    if (input.assumptions.some((a) => p.promise.test(a) && INCLUDED.test(a))) {
      v.push({ code: "promise-unpriced", blocking: true, message: `The assumptions include ${p.label}, but no line prices it. Add the line or drop the claim.` });
    }
  }

  // (a) every phase of the trade, reported but not enforced
  for (const phase of trade.phases) {
    const words = phase
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5);
    if (!words.length) continue;
    const covered = items.some((it) => {
      const hay = `${it.name} ${it.notes ?? ""}`.toLowerCase();
      return words.some((w) => hay.includes(w));
    });
    if (!covered) v.push({ code: "missing-phase", blocking: false, message: `No line covers the phase "${phase}". Add it, or say in the assumptions that this job excludes it.` });
  }

  // (b) prices against the trade's anchors, in this state's market
  items.forEach((it, i) => {
    // A computed line is a measurement, not an opinion: its quantity came out of
    // the brief and its price out of the merchant path or the trade anchor. The
    // corridor check exists to catch a model inventing a number, so running it
    // here would only ever argue with arithmetic — and, worse, the violation
    // would be handed back to the model as something to "fix".
    if (it.flag === "computed") return;
    const anchor: ParsedAnchor | null = matchAnchor(it.name, anchors);
    if (!anchor) return;
    if (HANDLING_ONLY.test(it.name) && !HANDLING_ONLY.test(anchor.label)) return;
    for (const kind of ["material", "labor"] as const) {
      const price = kind === "material" ? it.materialUnitPrice : it.laborUnitPrice;
      if (!(price > 0)) continue;
      const c = corridorFor(anchor, kind, it.unit, regionIndex);
      if (!c) continue;
      if (price < c.lo || price > c.hi) {
        v.push({
          code: "price-out-of-corridor",
          item: i,
          blocking: true,
          message: `"${it.name}": ${kind} $${price}/${it.unit} is outside the anchor for ${c.label} ($${c.anchorLo.toFixed(2)}-${c.anchorHi.toFixed(2)}/${normalizeUnit(it.unit)} in this market). Price it inside the anchor or say in notes why it differs.`,
        });
      }
    }
  });

  // (c) units and quantities
  const area = briefAreaSqft(input.description);
  const lfCap = area ? perimeterOf(area) * 4 : null;
  items.forEach((it, i) => {
    // Same reason as the corridor pass: a measured quantity in its own unit is
    // not the model guessing, and these emitters are blocking.
    if (it.flag === "computed") return;
    const u = normalizeUnit(it.unit);
    if (headIs(LENGTH_WORK, it.name) && !AREA_WORK.test(it.name) && u === "sqft") {
      v.push({ code: "unit-mismatch", item: i, blocking: true, message: `"${it.name}" is measured in linear feet, not sqft. Re-state the quantity as linear ft.` });
    }
    if (headIs(AREA_WORK, it.name) && !LENGTH_WORK.test(it.name) && u === "linear ft") {
      v.push({ code: "unit-mismatch", item: i, blocking: true, message: `"${it.name}" is measured by area, not by length. Re-state the quantity in sqft.` });
    }
    if (lfCap && u === "linear ft" && it.quantity > lfCap) {
      v.push({
        code: "quantity-implausible",
        item: i,
        blocking: true,
        message: `"${it.name}": ${Math.round(it.quantity)} linear ft on a ${area} sqft job is impossible (about ${Math.round(perimeterOf(area!))} ft of perimeter). Re-measure it — the wall area is not a length.`,
      });
    }
    if (area && u === "sqft" && it.quantity > area * 4) {
      v.push({ code: "quantity-implausible", item: i, blocking: true, message: `"${it.name}": ${Math.round(it.quantity)} sqft is more than four times the ${area} sqft the brief states. Re-measure it.` });
    }
  });

  // (e) work the brief never asked for
  items.forEach((it, i) => {
    for (const w of CONDITIONAL_WORK) {
      if (!w.trades.includes(trade.id)) continue;
      if (!w.line.test(it.name)) continue;
      if (w.brief.test(input.description)) continue;
      v.push({
        code: "out-of-scope",
        item: i,
        blocking: false,
        message: `"${nameOf(i)}" is ${w.label}, which the description never asks for. Leave it out, or offer it as an option.`,
      });
    }
  });

  // (f) completeness
  const floor = floorOfRange(trade.lineRange);
  if (items.length < floor) {
    v.push({ code: "too-few-lines", blocking: true, message: `Only ${items.length} lines. A real job in this trade runs ${trade.lineRange ?? "8-16"} lines — every phase the brief calls for is its own line.` });
  }

  return { violations: v, blocking: v.filter((x) => x.blocking), regionIndex, regionState: region?.state ?? null };
}

/** The violations, written as an instruction the model can act on. */
export function repairInstruction(report: ValidationReport): string {
  const list = [...report.blocking, ...report.violations.filter((x) => !x.blocking && x.code === "missing-phase")].slice(0, 14);
  if (!list.length) return "";
  return [
    "",
    "═══════════════════════════════════════════════════════════════",
    "YOUR PREVIOUS ANSWER WAS REJECTED. Fix exactly these and return the whole estimate again:",
    ...list.map((x, i) => `  ${i + 1}. ${x.message}`),
    "Keep everything else as it was — same scope, same structure, same quantities where they were right.",
    "Lines already priced for you are fixed: do not restate their quantity or their prices. You may add lines and write notes.",
    "═══════════════════════════════════════════════════════════════",
    "",
  ].join("\n");
}

export interface RepairResult {
  items: CheckedItem[];
  /** What the repair did, in the contractor's words. Shown on the estimate. */
  notes: string[];
  /** Assumptions with any claim the estimate cannot back removed. */
  assumptions: string[];
}

/**
 * What the model would not fix, fixed here — visibly.
 *
 *   · a required line it kept leaving out is inserted at the anchor's midpoint
 *     × the regional index, flagged `auto`;
 *   · a price outside the corridor is pulled to the nearest edge of the
 *     anchor's own range, flagged `adjusted`;
 *   · work the brief never asked for is flagged `suggested` — it leaves the
 *     total and is offered as an option instead;
 *   · a promise the estimate still cannot price is struck from the
 *     assumptions rather than left standing over nothing.
 */
export function applyRepairs(input: ValidationInput, report: ValidationReport): RepairResult {
  const items = input.items.map((it) => ({ ...it }));
  const anchors = parseTradeAnchors(input.trade);
  const notes: string[] = [];
  let assumptions = [...input.assumptions];
  const idx = report.regionIndex;
  let added = 0;
  let adjusted = 0;
  let suggested = 0;

  // work the brief never asked for → an option, not a charge
  for (const v of report.violations) {
    if (v.code !== "out-of-scope" || v.item == null) continue;
    const it = items[v.item];
    if (!it || it.flag) continue;
    it.flag = "suggested";
    it.flagNote = "not in your description";
    suggested += 1;
  }

  // prices outside the corridor → the nearest edge of the anchor
  for (const v of report.violations) {
    if (v.code !== "price-out-of-corridor" || v.item == null) continue;
    const it = items[v.item];
    if (!it) continue;
    // Never snap a computed price to an anchor — the anchor is already one of
    // its two possible sources, and the other (a live merchant price inside the
    // sanity corridor) is deliberately more specific than the anchor.
    if (it.flag === "computed") continue;
    const anchor = matchAnchor(it.name, anchors);
    if (!anchor) continue;
    for (const kind of ["material", "labor"] as const) {
      const price = kind === "material" ? it.materialUnitPrice : it.laborUnitPrice;
      if (!(price > 0)) continue;
      const c = corridorFor(anchor, kind, it.unit, idx);
      if (!c) continue;
      if (price >= c.lo && price <= c.hi) continue;
      const to = Math.round((price < c.lo ? c.anchorLo : c.anchorHi) * 100) / 100;
      if (kind === "material") it.materialUnitPrice = to;
      else it.laborUnitPrice = to;
      if (it.flag !== "suggested") it.flag = "adjusted";
      it.flagNote = `${kind} pulled to the ${c.label} anchor`;
      adjusted += 1;
    }
  }

  // required lines the model kept leaving out → inserted at the anchor
  const missing = report.violations.filter((v) => v.code === "missing-required" || v.code === "promise-unpriced");
  for (const v of missing) {
    const req = REQUIRED.find((r) => v.message.toLowerCase().includes(r.id));
    if (!req) continue;
    if (items.some((it) => req.line.test(it.name))) continue;
    const anchor = anchors.find((a) => req.anchor.test(a.raw));
    const fixed = anchor?.ranges.find((r) => r.unit === "fixed");
    if (!fixed) continue;
    const price = Math.round(((fixed.lo + fixed.hi) / 2) * idx);
    if (!(price > 0)) continue;
    items.push({
      name: req.insertName,
      unit: "fixed",
      quantity: 1,
      materialUnitPrice: req.id === "permit" ? price : 0,
      laborUnitPrice: req.id === "permit" ? 0 : price,
      notes: `Added from the ${input.trade.name.toLowerCase()} standard scope at the catalogue anchor.`,
      searchQuery: null,
      flag: "auto",
      flagNote: "added from standard scope",
    });
    added += 1;
  }

  // a promise nothing prices, and nothing could price → strike the promise
  for (const v of report.violations) {
    if (v.code !== "promise-unpriced") continue;
    const req = REQUIRED.find((r) => v.message.toLowerCase().includes(r.id));
    const promise = req?.promise ?? PROMISES.find((p) => v.message.includes(p.label))?.promise;
    const line = req?.line ?? PROMISES.find((p) => v.message.includes(p.label))?.line;
    if (!promise || !line) continue;
    if (items.some((it) => line.test(it.name))) continue;
    const before = assumptions.length;
    assumptions = assumptions.filter((a) => !(promise.test(a) && INCLUDED.test(a)));
    if (assumptions.length < before) notes.push("1 assumption removed: it claimed something no line priced.");
  }

  if (added) notes.unshift(`${added} line${added === 1 ? "" : "s"} added from the standard scope for this trade.`);
  if (adjusted) notes.unshift(`${adjusted} unit price${adjusted === 1 ? "" : "s"} adjusted to the catalogue anchor.`);
  if (suggested) notes.unshift(`${suggested} line${suggested === 1 ? "" : "s"} set aside as suggestions — the description never asked for them, so they are not in the total.`);
  return { items, notes, assumptions };
}

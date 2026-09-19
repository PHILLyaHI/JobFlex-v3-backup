// Remodel sanity ranges — what a whole remodel of a known kind costs, so a
// reply far under it is asked again (2026-09-18).
//
// A full hall bath in Kirkland WA came back at $12,600; the reviewed
// standard-grade range there is $28,000-45,000. The ranges are the method's
// section 8 (lib/estimate/remodel-method, reviewed by a production estimator
// and a master plumber/electrician): US national, standard grade, before the
// org's markup; metros use their own checks, elsewhere the state index.
//
// A job is classified only when the brief is a WHOLE remodel of a known kind
// (or a tub-to-shower, a defined job) and states no price — a stated price is
// binding (lib/estimate/brief) and never argued with. Plain module.

import { stateCostIndex } from "./trade-knowledge";
import { shortOfProcedure } from "./procedures";
import type { BriefFacts } from "./brief";
import type { BriefScope, RemodelDomain } from "./remodel-method";

export type RemodelJobId =
  | "tub-to-shower"
  | "powder-room"
  | "hall-bath"
  | "primary-bath"
  | "kitchen-galley"
  | "kitchen-full"
  | "kitchen-layout"
  | "basement-finish"
  | "basement-finish-bath"
  | "garage-conversion"
  | "laundry";

export type RemodelJob = {
  id: RemodelJobId;
  label: string;
  /** National, standard grade, before markup: a job total, or per sqft when `perSqft`. */
  low: number;
  high: number;
  /** The method's metro checks, used in place of the metro factor. */
  metroLow?: number;
  metroHigh?: number;
  perSqft?: boolean;
};

export const REMODEL_JOBS: Record<RemodelJobId, RemodelJob> = {
  "tub-to-shower": { id: "tub-to-shower", label: "tiled tub-to-shower conversion with frameless glass", low: 10_000, high: 18_000, metroLow: 12_000, metroHigh: 22_500 },
  "powder-room": { id: "powder-room", label: "powder room remodeled in place", low: 6_000, high: 12_000 },
  "hall-bath": { id: "hall-bath", label: "full hall bath remodel", low: 18_000, high: 32_000, metroLow: 28_000, metroHigh: 45_000 },
  "primary-bath": { id: "primary-bath", label: "full primary bath remodel", low: 35_000, high: 70_000, metroLow: 45_000, metroHigh: 90_000 },
  "kitchen-galley": { id: "kitchen-galley", label: "full galley kitchen remodel, same layout", low: 22_000, high: 40_000 },
  "kitchen-full": { id: "kitchen-full", label: "full kitchen remodel, same layout", low: 38_000, high: 66_000, metroLow: 50_000, metroHigh: 90_000 },
  "kitchen-layout": { id: "kitchen-layout", label: "full kitchen remodel with a layout change", low: 60_000, high: 105_000 },
  "basement-finish": { id: "basement-finish", label: "basement finish", low: 45, high: 85, perSqft: true },
  "basement-finish-bath": { id: "basement-finish-bath", label: "basement finish with a bathroom", low: 60, high: 115, perSqft: true },
  "garage-conversion": { id: "garage-conversion", label: "garage conversion", low: 90, high: 170, perSqft: true },
  laundry: { id: "laundry", label: "laundry room remodel", low: 6_000, high: 15_000 },
};

/** Metros whose costs run about 1.25 times national (the method's section 8). */
const METRO =
  /\b(seattle|bellevue|kirkland|redmond|bothell|woodinville|sammamish|issaquah|mercer\s+island|shoreline|lynnwood|edmonds|mill\s+creek|renton|kenmore|newcastle|san\s+francisco|oakland|berkeley|san\s+jose|palo\s+alto|mountain\s+view|sunnyvale|menlo\s+park|fremont|los\s+angeles|santa\s+monica|pasadena|beverly\s+hills|san\s+diego|new\s+york|brooklyn|manhattan|queens|bronx|staten\s+island|boston|cambridge|somerville|brookline|washington,?\s*d\.?\s*c\.?)\b/i;

export function locationFactor(location: string | null | undefined): { factor: number; metro: boolean; label: string } {
  const loc = (location ?? "").trim();
  const m = loc.match(METRO);
  if (m) return { factor: 1.25, metro: true, label: m[1].replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
  const st = stateCostIndex(loc);
  if (st) return { factor: st.index, metro: false, label: st.state };
  return { factor: 1, metro: false, label: "the US" };
}

const TUB_TO_SHOWER = /\btub[\s-]*to[\s-]*shower|\bshower\s+conversion|\bconvert\w*\s+(?:the\s+|a\s+|my\s+)?(?:bath)?tub\b|\breplace\s+(?:the\s+)?(?:bath)?tub\s+with\s+(?:a\s+)?(?:walk[-\s]in\s+)?shower/i;
const LAYOUT_CHANGE = /\bmove\b|\brelocat|\bisland\s+sink|\bsink\s+(?:to|into|on)\s+(?:the\s+|an\s+)?island|\b(?:remove|removing|take\s+out|knock\s+(?:out|down)|open\w*)\s+(?:up\s+)?(?:the\s+|a\s+)?wall|\blayout\s+change|\bnew\s+layout|\bchange\s+the\s+layout/i;
const BASEMENT_FINISH = /\bfinish\w*\s+(?:the\s+|my\s+|a\s+|an\s+|our\s+)?(?:\d[\d,]*\s*(?:sq\.?\s*ft|sqft|sf)\s+)?basement|\bbasement\s+finish/i;
const GARAGE_CONVERSION = /\bconvert\w*\s+(?:the\s+|my\s+|our\s+|a\s+)?(?:\w+[-\s])?garage|\bgarage\s+conversion/i;

/**
 * The kind of whole remodel this brief is, or null (a partial job, a stated
 * price, several rooms at once, or a kind with no reviewed range).
 */
export function remodelJob(
  description: string,
  facts: BriefFacts,
  scope: BriefScope,
  specialtyId: string,
  domains: readonly RemodelDomain[],
): RemodelJob | null {
  const t = description ?? "";
  if (facts.sellTotal || facts.sellPerUnit) return null;
  if (TUB_TO_SHOWER.test(t)) return REMODEL_JOBS["tub-to-shower"];
  if (scope !== "full") return null;
  if (specialtyId === "garage-conversion" || GARAGE_CONVERSION.test(t)) return REMODEL_JOBS["garage-conversion"];
  if (BASEMENT_FINISH.test(t)) return REMODEL_JOBS[domains.includes("bathroom") || /\bbath/i.test(t) ? "basement-finish-bath" : "basement-finish"];
  const kitchen = domains.includes("kitchen") && /\bkitchen/i.test(t);
  const bath = domains.includes("bathroom") && /\bbath|\bpowder\s+room|\bensuite/i.test(t);
  if (kitchen && bath) return null;
  if (bath) {
    if (/\bpowder\s+room|\bhalf[\s-]bath/i.test(t)) return REMODEL_JOBS["powder-room"];
    if (/\b(?:master|primary|ensuite|en-suite)\b/i.test(t)) return REMODEL_JOBS["primary-bath"];
    return REMODEL_JOBS["hall-bath"];
  }
  if (kitchen) {
    if (LAYOUT_CHANGE.test(t)) return REMODEL_JOBS["kitchen-layout"];
    if (facts.area && facts.area < 120) return REMODEL_JOBS["kitchen-galley"];
    return REMODEL_JOBS["kitchen-full"];
  }
  if (specialtyId === "laundry-room-remodel" && /\blaundry/i.test(t)) return REMODEL_JOBS.laundry;
  return null;
}

export type RemodelRange = { job: RemodelJobId; label: string; low: number; high: number; place: string };

/**
 * A hall bath larger than about 60 sqft (a 12x8 is 96) costs more than the
 * 5x8 the reviewed range describes: more floor tile, wall, paint and trim,
 * and usually a bigger shower. Each sqft past 60 adds half the slope between
 * the reviewed hall-bath and primary-bath anchors, capped at the primary
 * range. A derived rule, stated as such in docs/remodel-method.md.
 */
const BATH_SIZE = { from: 60, low: 105, high: 235, metroLow: 130, metroHigh: 295 };

const round100 = (n: number) => Math.round(n / 100) * 100;

/**
 * The room's floor area from "12x8", "8 x 10 ft", "12 by 8" — for the range
 * only. The brief reader counts a pair as an area only from 100 sqft up (a
 * stated area is binding on the lines, and a door is 8 x 7), which skips most
 * bathrooms; binding stays as it is. Tile and sheet sizes ("12x24 porcelain",
 * "4x8 sheet") and lumber ("2x4") are not rooms.
 */
export function roomAreaFrom(text: string): number | undefined {
  const re = /(?<![$\d.])(\d{1,2}(?:\.\d+)?)\s*(?:ft|feet|foot|')?\s*(?:x|×|by)\s*(\d{1,2}(?:\.\d+)?)\s*(?:ft|feet|foot|')?(?![\d.])(?!\s*(?:in\b|inch|"|porcelain|tile|ceramic|marble|stone|subway|mosaic|sheet|panel|board|plank|lumber|post|beam|header))/gi;
  for (const m of (text ?? "").matchAll(re)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= 4 && b >= 4 && a * b >= 24 && a * b <= 3000) return a * b;
  }
  return undefined;
}

/** The job's range here, before markup. Per-sqft jobs need the area. */
export function remodelRange(job: RemodelJob | null, facts: BriefFacts, location: string | null | undefined, description = ""): RemodelRange | null {
  if (!job) return null;
  const loc = locationFactor(location);
  const roomArea = facts.area ?? roomAreaFrom(description);
  if (job.perSqft) {
    const area = roomArea;
    if (!area || area < 80) return null;
    return { job: job.id, label: `${job.label} of about ${Math.round(area).toLocaleString("en-US")} sqft`, low: round100(job.low * area * loc.factor), high: round100(job.high * area * loc.factor), place: loc.label };
  }
  const extra = job.id === "hall-bath" && roomArea && roomArea > BATH_SIZE.from ? roomArea - BATH_SIZE.from : 0;
  const label = extra ? `${job.label} of about ${Math.round(roomArea!).toLocaleString("en-US")} sqft` : job.label;
  // Only a bath grown past 60 sqft moves, and never past the primary bath.
  const primary = REMODEL_JOBS["primary-bath"];
  const grow = (base: number, perSqft: number, cap: number) => (extra ? Math.min(base + extra * perSqft, cap) : base);
  if (loc.metro && job.metroLow && job.metroHigh) {
    const low = grow(job.metroLow, BATH_SIZE.metroLow, primary.metroLow!);
    const high = grow(job.metroHigh, BATH_SIZE.metroHigh, primary.metroHigh!);
    return { job: job.id, label, low: round100(low), high: round100(high), place: loc.label };
  }
  const low = grow(job.low, BATH_SIZE.low, primary.low) * loc.factor;
  const high = grow(job.high, BATH_SIZE.high, primary.high) * loc.factor;
  return { job: job.id, label, low: round100(low), high: round100(high), place: loc.label };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The line the prompt carries so the model knows the range before it answers. */
export function rangeLine(r: RemodelRange): string {
  return `THIS BRIEF'S RANGE: a ${r.label} in ${r.place} runs ${usd(r.low)}-${usd(r.high)} before markup at standard grade (REMODEL ESTIMATING METHOD, section 8). A total under it is missing lines or prices licensed labor below the trade — walk sections 2, 3 and 5 before you answer. Fix the lines, never just the total.`;
}

/** A reply's total before markup: every line's quantity times both halves. */
export function linesTotal(items: readonly { quantity: number; materialUnitPrice: number; laborUnitPrice: number }[]): number {
  return items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * ((Number(it.materialUnitPrice) || 0) + (Number(it.laborUnitPrice) || 0)), 0);
}

/**
 * Why a reply is asked again (empty = it stands): fewer lines than seven
 * tenths of a whole job's core steps, or a total under nine tenths of the
 * job's range. One retry carries every reason.
 */
export function retryReasons(input: { lines: number; coreSteps: number; total: number; range: RemodelRange | null }): string[] {
  const reasons: string[] = [];
  if (shortOfProcedure(input.lines, input.coreSteps)) {
    reasons.push(
      `YOUR PREVIOUS ANSWER TO THIS BRIEF HAD ONLY ${input.lines} LINE ITEMS. THE PROCEDURE BELOW HAS ${input.coreSteps} CORE STEPS AND EVERY ONE OF THEM IS ITS OWN LINE ITEM — return at least ${input.coreSteps} lines, in the procedure's order, plus the conditional steps this brief calls for.`,
    );
  }
  if (input.range && input.total > 0 && input.total < input.range.low * 0.9) {
    reasons.push(
      `YOUR PREVIOUS ANSWER TOTALED ${usd(input.total)} BEFORE MARKUP. A ${input.range.label.toUpperCase()} IN ${input.range.place.toUpperCase()} RUNS ${usd(input.range.low)}-${usd(input.range.high)} AT STANDARD GRADE. An answer this far under the range is missing lines or prices licensed labor below the trade: walk section 2, the chains of section 3 and the lines of section 5 of the REMODEL ESTIMATING METHOD again, add every missing line, and price labor at the trade rates of section 8. Fix the lines, never just the total.`,
    );
  }
  return reasons;
}

/** Keep the fuller answer: more lines, or as many lines and a higher total. */
export function fullerAnswer<T extends { items: readonly { quantity: number; materialUnitPrice: number; laborUnitPrice: number }[] }>(first: T, second: T): T {
  if (second.items.length > first.items.length) return second;
  if (second.items.length === first.items.length && linesTotal(second.items) > linesTotal(first.items)) return second;
  if (second.items.length >= first.items.length * 0.9 && linesTotal(second.items) > linesTotal(first.items) * 1.15) return second;
  return first;
}

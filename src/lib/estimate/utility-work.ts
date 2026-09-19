// Underground utility work — sewer, storm and water lines (2026-09-18).
//
// Owner: "run sewer in the street, 300 linear feet … usually costs around
// $300,000 … look at their state, their major cities pricing and update the
// price book." The brief had been priced as house plumbing: "sewer" belonged
// to the plumbing trade profile, whose only per-foot anchor was a PEX repipe
// at $2-4 material and $8-15 labor, and nothing in the prompt priced a
// trench, a manhole, a pavement patch, traffic control or the tap.
//
// This module reads what kind of utility job a brief is (street or yard,
// sewer, storm or water), gives it an installed range per linear foot from
// public bid data (./utility-prices-data, sources in docs/pricing-sources.md)
// scaled to the job's city, and formats the installed unit prices the prompt
// carries. Plain module.

import type { BriefFacts } from "./brief";
import { locationIndex } from "./location-index";
import { bidToCost, UTILITY_JOBS, utilityAnchorLines, type UtilityJobId } from "./utility-prices-data";
import type { SpecialtyPrices } from "./step-prices";

export type { UtilityJobId };

/** Specialties whose work this is, besides any brief that names it. */
const UTILITY_SPECIALTIES = new Set([
  "sanitary-sewer",
  "storm-sewer",
  "underground-utility",
  "underground-utility-installation",
  "water-utility-installation",
  "trenching",
  "utility-excavation",
  "culvert-installation",
  "catch-basin-manhole",
  "plumbing",
  "residential-plumbing",
]);

const SEWER = /\bsewer|\bside[-\s]sewer|\blateral\b/i;
const STORM = /\bstorm\s+(?:drain|sewer|line|pipe)|\bculvert|\bcatch\s+basin/i;
const WATER = /\bwater\s+(?:main|service|line)\b/i;
const STREET = /\b(?:in|under|along|across|down|up|through)\s+(?:the\s+|a\s+)?(?:street|road|avenue|right[-\s]of[-\s]way|row|alley)\b|\bstreet\b|\broad(?:way)?s?\b|\bhighway\b|\bpublic\s+(?:sewer|main)|\bsewer\s+main\b|\bwater\s+main\b|\bmain\s+line\b/i;
/** A sewer pipe 8 in. or larger is a main — a side sewer from a house is 4-6 in. */
const MAIN_SIZE = /\b(?:8|10|12|15|18|21|24|30|36)\s*(?:-\s*)?(?:inch(?:es)?|in\.|")(?![a-z])|\b(?:8|10|12|15|18|21|24|30|36)\s*in\s+(?:pvc|pipe|main|sewer|line|diameter|ductile|sdr)\b/i;
const FROM_HOUSE = /\b(?:from|off)\s+the\s+(?:house|home|building|foundation)|\bto\s+the\s+(?:city\s+|public\s+|street\s+)?(?:main|street|sewer)\b|\bside[-\s]sewer|\blateral\b|\bservice\s+line\b/i;
const YARD = /\byard\b|\blawn\b|\blandscap|\bbackyard\b|\bfront\s+yard\b|\bgarden\b/i;
const REPAIR = /\b(?:clog\w*|backed?\s*up|backup|snake|jet(?:ting)?|camera\s+(?:the|it)|smell\w*|roots?\s+in)\b/i;

/**
 * The kind of utility job a brief is, or null. Needs the utility named
 * (sewer, storm, water) and a specialty that does this work or the words;
 * a drain-cleaning brief ("the sewer backed up") is not an installation.
 */
export function utilityJob(description: string, specialtyId: string): UtilityJobId | null {
  const t = description ?? "";
  if (REPAIR.test(t)) return null;
  const named = SEWER.test(t) || STORM.test(t) || WATER.test(t);
  if (!named) return null;
  if (!UTILITY_SPECIALTIES.has(specialtyId) && !/\btrench|\bexcavat|\binstall|\brun\b|\breplace|\bnew\b|\blay\b/i.test(t)) return null;
  if (STORM.test(t)) return "storm-street";
  if (WATER.test(t)) {
    if (/\bwater\s+main\b/i.test(t) || (STREET.test(t) && !FROM_HOUSE.test(t))) return "water-main-street";
    return "water-service-yard";
  }
  // Sewer: a line from the house is a side sewer (in the yard, or out to the
  // main in the street); a line in the street with no house named is a main.
  if (FROM_HOUSE.test(t)) return STREET.test(t) || /\bto\s+the\s+(?:city\s+|public\s+)?main\b/i.test(t) ? "side-sewer-to-street" : "side-sewer-yard";
  if (STREET.test(t) || MAIN_SIZE.test(t)) return "sewer-main-street";
  if (YARD.test(t)) return "side-sewer-yard";
  return "side-sewer-yard";
}

/**
 * Whether a specialty's price book is the right scale for this utility job:
 * its benchmark per linear foot overlaps the job's national bid range by at
 * least a quarter. A side-sewer book ($90-280/LF) does not price a sewer
 * main in a street ($350-1,100/LF), nor a water-main book a yard service
 * line — there the job's bid prices govern alone.
 */
export function fitsUtilityJob(book: SpecialtyPrices, job: UtilityJobId): boolean {
  const b = book.benchmark;
  if (b.unit !== "linear ft") return false;
  const [lo, hi] = UTILITY_JOBS[job].national;
  return Math.min(hi, b.price[1]) - Math.max(lo, b.price[0]) > 0.25 * (hi - lo);
}

export type UtilityRange = {
  kind: "utility";
  job: UtilityJobId;
  label: string;
  low: number;
  high: number;
  place: string;
  /** The run the range was computed for. */
  lengthFt: number;
};

const round100 = (n: number) => Math.round(n / 100) * 100;

/**
 * The job's range at contractor cost, before markup: per linear foot times
 * the run the brief states, Seattle-area bid prices where the job is there,
 * else the national range times the city (or state) index, less the
 * bidder's overhead and profit. No run, no range.
 */
export function utilityRange(job: UtilityJobId | null, facts: BriefFacts, location: string | null | undefined): UtilityRange | null {
  if (!job) return null;
  const run = facts.length;
  if (!run || run < 10) return null;
  const spec = UTILITY_JOBS[job];
  const idx = locationIndex(location);
  const seattle = idx.state === "WA" && idx.level === "city" && idx.factor >= 1.15;
  const [lo, hi] = seattle ? spec.seattle : [spec.national[0] * idx.factor, spec.national[1] * idx.factor];
  const low = bidToCost(Math.max(lo * run, spec.minJob?.[0] ?? 0));
  const high = bidToCost(Math.max(hi * run, spec.minJob?.[1] ?? 0));
  return {
    kind: "utility",
    job,
    label: `${spec.label}, about ${Math.round(run).toLocaleString("en-US")} linear ft`,
    low: round100(low),
    high: round100(high),
    place: idx.level === "national" ? "the US" : idx.place,
    lengthFt: run,
  };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const range = ([a, b]: [number, number], unit: string) => `${usd(bidToCost(a))}-${usd(bidToCost(b))}/${unit}`;

/**
 * The installed unit prices the prompt carries for a utility brief when the
 * trade block (which carries the same anchors) is not sent.
 */
export function utilityPriceBlock(job: UtilityJobId): string {
  const spec = UTILITY_JOBS[job];
  return [
    "═══════════════════════════════════════════════════════════════",
    "INSTALLED UNIT PRICES — UNDERGROUND UTILITIES (public bid data, at contractor cost)",
    "═══════════════════════════════════════════════════════════════",
    "Price each line of the procedure at these installed prices, scaled by the LOCATION line; never as house plumbing. They are public bid prices less the bidder's overhead and profit — the contractor's cost, before markup — and a fee is shown as charged. Pipe is priced per linear foot laid in its bedding; the trench, shoring, pavement cut and restoration, traffic control, manholes, the connection and the tests are their own lines.",
    ...utilityAnchorLines().map((l) => `  - ${l}`),
    `A ${spec.label} runs ${range(spec.national, "linear ft")} all-in nationally, ${range(spec.seattle, "linear ft")} in the Seattle area.`,
  ].join("\n");
}

/** The line the prompt carries so the model knows the range before it answers. */
export function utilityRangeLine(r: UtilityRange): string {
  return `THIS BRIEF'S RANGE: a ${r.label} in ${r.place} runs ${usd(r.low)}-${usd(r.high)} at contractor cost, before markup (public bid prices less the bidder's overhead and profit). A total under it is missing lines — traffic control, the pavement cut and restoration, shoring, manholes, the connection, bypass pumping, testing — or prices the line as house plumbing. Fix the lines, never just the total.`;
}

// What a brief actually MEASURES — the only input a computed line is allowed
// to take its quantity from.
//
// WHY THIS EXISTS. The Smart Proposal's run-to-run spread is not a pricing
// problem, it is a quantity problem. Asked the same brief three times at
// temperature 0 with a fixed seed, the model returned 13 lines whose quantity
// signature differed every time: on the 1,800 sqft roof it invented 300 sqft of
// ice & water, 220 lf of drip edge, 80 lf of step flashing and a 10-sheet
// decking allowance — none of which the homeowner had mentioned — and priced
// each of them slightly differently on each pass. The totals came back 16,918 /
// 22,468 / 17,128.
//
// So the fix is to take the measurable facts OUT of the model's hands. This
// module reads only what the brief states in numbers. It never infers, never
// defaults, and never fills a gap: a fact that is not written down comes back
// undefined, and the phase that needed it stays the model's (with the ordinary
// validation), which is the contract in the task.
//
// Every extractor here is deliberately narrow. A greedy regex that turns "two
// coats on the body and one on the trim" into `coats: 2` for the whole job is
// worse than no extraction at all, because a computed line carries the
// authority of a measurement.

/** A number the brief spelled out, e.g. "three pipe boots". */
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const NUM = "(\\d[\\d,]*(?:\\.\\d+)?|" + Object.keys(WORD_NUMBERS).join("|") + ")";

function num(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const w = WORD_NUMBERS[raw.toLowerCase()];
  if (w !== undefined) return w;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** One measured quantity, with the words it came from so a line can cite them. */
export interface MeasuredFact {
  /** What was measured — "pipe boots", "wall and step flashing". */
  label: string;
  value: number;
  /** The brief's own words, for the line's note and for an operator to audit. */
  source: string;
}

export interface BriefFacts {
  /** Plan area in sqft, as stated ("1,800 sqft roof", "220 sqft kitchen"). */
  areaSqft?: MeasuredFact;
  /** An explicit W × L ("12 by 16 ft deck") — area is the product. */
  dims?: { w: number; l: number; sqft: number; source: string };
  /** Roof pitch as rise/12 ("9/12 pitch"). */
  pitch?: { rise: number; run: number; factor: number; source: string };
  /** Layers of existing roofing to remove ("two layers"). */
  layers?: MeasuredFact;
  /** Storeys ("two-story", "single-story rambler"). */
  stories?: MeasuredFact;
  /** Every "<n> linear ft of <thing>" in the brief. */
  linearFt: MeasuredFact[];
  /** Every counted thing: "three pipe boots", "14 fixtures", "four skylights". */
  counts: MeasuredFact[];
  /** Coats, split when the brief splits them. */
  coats?: { body?: number; trim?: number; source: string };
  /** Appliance capacity ("50-gallon water heater"). */
  gallons?: MeasuredFact;
  /** True when the brief says the work is inside, false when it says outside,
   *  undefined when it says neither. A painting rule that fires on the wrong
   *  side of the wall put an exterior body coat on an interior condo repaint in
   *  the first dry run, so the side is read rather than assumed. */
  interior?: boolean;
}

/** Pitch factor: roof surface ÷ plan footprint, for a rise over 12. */
export function pitchFactor(rise: number): number {
  return Math.sqrt(rise * rise + 144) / 12;
}

/** The whole extraction. Pure, synchronous, no I/O — it is called on every
 *  estimate and must never be the reason one is slow or fails. */
export function extractBriefFacts(briefRaw: string): BriefFacts {
  const brief = briefRaw.replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const lower = brief.toLowerCase();
  const facts: BriefFacts = { linearFt: [], counts: [] };

  // ── Area ────────────────────────────────────────────────────────────────
  // "1,800 sqft asphalt shingle roof", "220 sqft kitchen", "2,800 sqft cedar".
  // Deliberately NOT anchored to a noun: the briefs put the noun before the
  // number as often as after it.
  const area = new RegExp(NUM + "\\s*(?:sq\\.?\\s*ft|sqft|square feet|sf)\\b", "i").exec(brief);
  if (area) {
    const v = num(area[1]);
    if (v !== undefined && v > 0) facts.areaSqft = { label: "area", value: v, source: area[0].trim() };
  }

  // ── Explicit dimensions ─────────────────────────────────────────────────
  // "12 by 16 ft", "20 by 24 ft". Only when BOTH sides are numbers.
  const dims = new RegExp(NUM + "\\s*(?:by|x|\\u00d7)\\s*" + NUM + "\\s*(?:ft|foot|feet)\\b", "i").exec(brief);
  if (dims) {
    const w = num(dims[1]);
    const l = num(dims[2]);
    if (w && l) facts.dims = { w, l, sqft: w * l, source: dims[0].trim() };
  }

  // ── Roof pitch ──────────────────────────────────────────────────────────
  const pitch = /(\d{1,2})\s*\/\s*12\s*pitch|pitch\s*(?:of\s*)?(\d{1,2})\s*\/\s*12/i.exec(brief);
  if (pitch) {
    const rise = Number(pitch[1] ?? pitch[2]);
    if (Number.isFinite(rise) && rise >= 0 && rise <= 24) {
      facts.pitch = { rise, run: 12, factor: pitchFactor(rise), source: pitch[0].trim() };
    }
  }

  // ── Layers ──────────────────────────────────────────────────────────────
  const layers = new RegExp(NUM + "\\s*layers?\\b", "i").exec(brief);
  if (layers) {
    const v = num(layers[1]);
    if (v !== undefined && v >= 1 && v <= 4) {
      facts.layers = { label: "layers", value: v, source: layers[0].trim() };
    }
  }

  // ── Storeys ─────────────────────────────────────────────────────────────
  if (/\bsingle[- ]story\b|\brambler\b|\bone[- ]story\b/i.test(lower)) {
    const m = /\bsingle[- ]story\b|\brambler\b|\bone[- ]story\b/i.exec(brief)!;
    facts.stories = { label: "stories", value: 1, source: m[0] };
  } else {
    const st = new RegExp(NUM + "[- ]stor(?:y|ey|ies)\\b", "i").exec(brief);
    const v = st ? num(st[1]) : undefined;
    if (st && v !== undefined && v >= 1 && v <= 4) {
      facts.stories = { label: "stories", value: v, source: st[0].trim() };
    }
  }

  // ── Linear feet ─────────────────────────────────────────────────────────
  // "60 linear ft of wall and step flashing", "40 linear ft of rotted trim",
  // "12 ft of stairs", "4 ft of stairs". The label is what follows "of", cut
  // at the first comma or clause end so it stays a noun phrase.
  const lfRe = new RegExp(NUM + "\\s*(?:linear\\s*(?:ft|feet|foot)|lin\\.?\\s*ft|lf|ft|feet|foot)\\s+of\\s+([a-z][a-z /-]{2,48})", "gi");
  for (let m = lfRe.exec(brief); m; m = lfRe.exec(brief)) {
    const v = num(m[1]);
    if (v === undefined || v <= 0) continue;
    const label = m[2].replace(/\s+(and|with|plus)\s*$/i, "").trim().toLowerCase();
    facts.linearFt.push({ label, value: v, source: m[0].trim() });
  }

  // ── Counted things ──────────────────────────────────────────────────────
  // "three pipe boots", "four skylights", "14 fixtures", "12 wall sections",
  // "two chimneys", "two 20-amp circuits". Two-word nouns are kept whole.
  const countRe = new RegExp(
    // The words between the number and the noun may start with a digit —
    // "two 20-amp circuits" was missed by a letters-only class.
    NUM + "\\s+((?:[a-z0-9][a-z0-9-]{1,18}\\s+){0,2}?(?:pipe boots?|boots?|skylights?|chimneys?|fixtures?|wall sections?|sections?|circuits?|valves?|bathrooms?|bedrooms?|coats?|stairs?))\\b",
    "gi",
  );
  for (let m = countRe.exec(brief); m; m = countRe.exec(brief)) {
    const v = num(m[1]);
    if (v === undefined || v <= 0) continue;
    const label = m[2].trim().toLowerCase();
    // Coats are their own fact; stairs are linear, not a count.
    if (/coats?$/.test(label) || /stairs?$/.test(label)) continue;
    facts.counts.push({ label, value: v, source: m[0].trim() });
  }

  // ── Coats ───────────────────────────────────────────────────────────────
  // The split form first: "two coats on the body and one on the trim".
  const split = new RegExp(
    NUM + "\\s*coats?\\s*on\\s*the\\s*body\\s*and\\s*" + NUM + "\\s*(?:coats?\\s*)?on\\s*the\\s*trim",
    "i",
  ).exec(brief);
  if (split) {
    const body = num(split[1]);
    const trim = num(split[2]);
    if (body || trim) facts.coats = { body, trim, source: split[0].trim() };
  } else {
    const plain = new RegExp(NUM + "\\s*(?:finish\\s*)?coats?\\b", "i").exec(brief);
    const v = plain ? num(plain[1]) : undefined;
    if (plain && v !== undefined && v >= 1 && v <= 4) {
      facts.coats = { body: v, trim: v, source: plain[0].trim() };
    }
  }

  // ── Which side of the wall ──────────────────────────────────────────────
  if (/\binterior\b|\binside\b/i.test(lower)) facts.interior = true;
  else if (/\bexterior\b|\boutside\b|\bsiding\b/i.test(lower)) facts.interior = false;

  // ── Appliance capacity ──────────────────────────────────────────────────
  const gal = new RegExp(NUM + "[- ]gallon\\b", "i").exec(brief);
  if (gal) {
    const v = num(gal[1]);
    if (v !== undefined && v > 0) facts.gallons = { label: "gallons", value: v, source: gal[0].trim() };
  }

  return facts;
}

/** Roof surface area in sqft: the stated plan area lifted by the stated pitch.
 *  Returns undefined unless the brief states the area — a roof nobody measured
 *  does not get a computed shingle line. */
export function roofSurfaceSqft(f: BriefFacts): { sqft: number; basis: string } | undefined {
  const plan = f.areaSqft?.value ?? f.dims?.sqft;
  if (!plan) return undefined;
  const basis = f.areaSqft?.source ?? f.dims?.source ?? "";
  if (!f.pitch) return { sqft: plan, basis };
  return { sqft: Math.round(plan * f.pitch.factor), basis: `${basis} × ${f.pitch.rise}/12 pitch` };
}

/** Find a counted fact by what it counts. Substring match on the label, so
 *  "three pipe boots" answers a lookup for "boot". */
export function countOf(f: BriefFacts, ...needles: string[]): MeasuredFact | undefined {
  for (const n of needles) {
    const hit = f.counts.find((c) => c.label.includes(n));
    if (hit) return hit;
  }
  return undefined;
}

/** Find a linear-feet fact by what it runs along. */
export function lfOf(f: BriefFacts, ...needles: string[]): MeasuredFact | undefined {
  for (const n of needles) {
    const hit = f.linearFt.find((c) => c.label.includes(n));
    if (hit) return hit;
  }
  return undefined;
}

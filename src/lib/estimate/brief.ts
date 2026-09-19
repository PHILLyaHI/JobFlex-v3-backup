// THE CONTRACTOR'S NUMBERS.
//
// A Smart Proposal brief is the whole intake (owner, 2026-09-17: nothing is
// asked back). What the brief states is binding: a quantity is what the
// customer is billed on, a price is what the customer pays. This module reads
// those numbers out of the text, writes the rules the model answers under,
// and — because a model still rounds a 400 up to 450 "for waste" or prices
// from its anchors instead of the stated $10 — enforces them on the reply, so
// the sheet lands on the contractor's numbers whatever the model did.
//
// Plain module, no "use server": the prompt builder and the actions import it.

import { pairEstimateLines } from "./console-model";
import type { GeneratedEstimate } from "../estimatorSchema";

export type BriefUnit = "sqft" | "linear ft" | "sq yards" | "cu yards" | "unit";

export type BriefMeasure = { value: number; unit: BriefUnit; text: string };

export type BriefFacts = {
  /** Every quantity the brief states, in writing order. */
  measures: BriefMeasure[];
  /** The job's area: the first stated sqft (else a 20x20 pair, else the intake's size). */
  area?: number;
  /** The job's run: the largest stated length (a height is the small one). */
  length?: number;
  /** "$10 per sq ft" — the price the customer pays per measured unit. */
  sellPerUnit?: { amount: number; unit: BriefUnit; text: string };
  /** "$4,000 total" — the price the customer pays for the job. */
  sellTotal?: { amount: number; text: string };
  /** What the lines must add up to before tax: the total, else per-unit × the matching measure. */
  targetSell?: number;
  /** How the target was arrived at, for the note on the sheet. */
  targetFrom?: string;
};

const NUM = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)";
const AREA_WORD = "(?:sq\\.?\\s*ft\\.?|sqft|sq\\.?\\s*feet|square\\s*(?:feet|foot|ft)|sf|sq)";
const LENGTH_WORD = "(?:linear\\s*(?:feet|foot|ft)|lin\\.?\\s*ft\\.?|lf|running\\s*(?:feet|foot|ft)|feet|foot|ft|')";
const SQYD_WORD = "(?:sq\\.?\\s*(?:yd|yard)s?|square\\s*yards?)";
const CUYD_WORD = "(?:cu\\.?\\s*(?:yd|yard)s?|cubic\\s*yards?)";
const COUNT_WORD = "(?:units?|each|ea|pieces?|pcs?|windows?|doors?|fixtures?|outlets?|posts?|panels?|trees?|items?|heads?|zones?)";
/** Words that make a "$6 per sq ft" a COST the contractor pays, not the price the customer pays. */
const COST_CONTEXT = /\b(cost|costs|costing|material|materials|buy|buying|bought|pay|paid|paying|from|supplier|vendor|home depot|lowe'?s|priced? of|wholesale|retail)\b[^.]*$/i;

const toNumber = (s: string) => Number(s.replace(/,/g, ""));
const money = (n: number) => Math.round(n * 100) / 100;

function unitFor(word: string): BriefUnit {
  const w = word.toLowerCase();
  if (new RegExp(`^${SQYD_WORD}$`).test(w)) return "sq yards";
  if (new RegExp(`^${CUYD_WORD}$`).test(w)) return "cu yards";
  if (new RegExp(`^${AREA_WORD}$`).test(w)) return "sqft";
  if (new RegExp(`^${LENGTH_WORD}$`).test(w)) return "linear ft";
  return "unit";
}

/** True when the characters before `at` make this number a rate ("$10 sq ft",
 *  "per sq") or the second half of a dimension ("8 ft x 7 ft"), not a measure. */
function isPriceContext(text: string, at: number): boolean {
  const before = text.slice(Math.max(0, at - 12), at);
  return /(\$|per|\/|\ba\b|\ban\b|each|\bx|×|\bby)\s*$/i.test(before);
}

/** Read the numbers a brief states. `hint.sqft` is the intake's size field. */
export function readBrief(text: string, hint: { sqft?: number } = {}): BriefFacts {
  const t = (text ?? "").replace(/\s+/g, " ");
  const measures: BriefMeasure[] = [];

  const measureRe = new RegExp(`(?<![$\\d.])${NUM}\\s*(${SQYD_WORD}|${CUYD_WORD}|${AREA_WORD}|${LENGTH_WORD})(?![a-z])(?!\\s*(?:tall|high|height|wide|width|deep|depth|thick|x\\b|×|by\\b))`, "gi");
  for (const m of t.matchAll(measureRe)) {
    if (isPriceContext(t, m.index ?? 0)) continue;
    const value = toNumber(m[1]);
    if (!Number.isFinite(value) || value <= 0) continue;
    measures.push({ value, unit: unitFor(m[2]), text: m[0].trim() });
  }

  let area = measures.find((m) => m.unit === "sqft")?.value;
  if (area === undefined) {
    // "20x20 garage", "20 by 24 ft" — a pair of dimensions is an area.
    // A tile or sheet size ("12x24 porcelain", "4x8 sheet") is not the job's area.
    const dims = t.match(new RegExp(`(?<![$\\d.])(\\d+(?:\\.\\d+)?)\\s*(?:ft|feet|foot|')?\\s*(?:x|×|by)\\s*(\\d+(?:\\.\\d+)?)(?![\\d.])\\s*(?:ft|feet|foot|')?(?![a-z])(?!\\s*(?:in\\b|inch|"|porcelain|tile|ceramic|marble|stone|subway|mosaic|sheet|panel|board|plank))`, "i"));
    if (dims) {
      const a = Number(dims[1]) * Number(dims[2]);
      // A door is 8 x 7; a floor starts around 100 sq ft.
      if (a >= 100 && a <= 100_000 && Number(dims[1]) <= 500 && Number(dims[2]) <= 500) area = a;
    }
  }
  if (area === undefined && hint.sqft && hint.sqft > 0) area = hint.sqft;
  const lengths = measures.filter((m) => m.unit === "linear ft").map((m) => m.value);
  const length = lengths.length ? Math.max(...lengths) : undefined;

  // "$10 per sq ft", "10$ per sq", "$10/sf", "10 dollars a square foot", "$45 per foot", "$150 each".
  const perRe = new RegExp(`(?:\\$\\s*${NUM}|${NUM}\\s*(?:\\$|dollars?|bucks))\\s*(?:per|/|a|an|each|for each|for every|every)\\s*(${SQYD_WORD}|${CUYD_WORD}|${AREA_WORD}|${LENGTH_WORD}|${COUNT_WORD})(?![a-z])`, "gi");
  let sellPerUnit: BriefFacts["sellPerUnit"];
  for (const m of t.matchAll(perRe)) {
    if (COST_CONTEXT.test(t.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0))) continue;
    const amount = toNumber(m[1] ?? m[2]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    sellPerUnit = { amount, unit: unitFor(m[3]), text: m[0].trim() };
    break;
  }
  if (!sellPerUnit) {
    // "$150 each", "$85 apiece", "150 dollars per unit".
    const eachRe = new RegExp(`(?:\\$\\s*${NUM}|${NUM}\\s*(?:\\$|dollars?|bucks))\\s*(?:each|ea\\.?|apiece|per\\s+(?:unit|piece|item))(?![a-z])`, "gi");
    for (const m of t.matchAll(eachRe)) {
      if (COST_CONTEXT.test(t.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0))) continue;
      const amount = toNumber(m[1] ?? m[2]);
      if (Number.isFinite(amount) && amount > 0) { sellPerUnit = { amount, unit: "unit", text: m[0].trim() }; break; }
    }
  }

  // "total $4,000", "make it $4k", "for $4000", "$4,000 all-in", "budget of 3500".
  const NOT_A_RATE = "(?!\\s*(?:per\\b|/|a\\s|an\\s|each\\b|sq|sf\\b|ft\\b|lf\\b|feet|foot|%|percent))";
  const totalRes = [
    new RegExp(`\\b(?:total(?:s|ing)?|comes?\\s+(?:out\\s+)?to|all[- ]in|budget(?:\\s+of|\\s+is)?|not\\s+(?:to\\s+)?exceed|max(?:imum)?(?:\\s+of)?)\\s*(?:of|is|=|:|at|around|about|~)?\\s*\\$?\\s*${NUM}\\s*(k\\b)?${NOT_A_RATE}`, "gi"),
    new RegExp(`\\b(?:make(?:\\s+it)?|charge|charging|price(?:\\s+it)?(?:\\s+at)?|sell(?:\\s+it)?(?:\\s+for|\\s+at)?|bill(?:\\s+it)?(?:\\s+at)?|quote(?:\\s+it)?(?:\\s+at)?|for|at)\\s*(?:of|is|=|:)?\\s*(?:\\$\\s*${NUM}|${NUM}\\s*(?:\\$|dollars|bucks|k\\b))\\s*(k\\b)?${NOT_A_RATE}`, "gi"),
    new RegExp(`\\$\\s*${NUM}\\s*(k\\b)?\\s*(?:total|all[- ]in|flat|for\\s+(?:the\\s+)?(?:whole\\s+|entire\\s+)?(?:job|project|thing|floor|house|everything))`, "gi"),
  ];
  let sellTotal: BriefFacts["sellTotal"];
  for (const re of totalRes) {
    for (const m of t.matchAll(re)) {
      if (COST_CONTEXT.test(t.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0))) continue;
      const raw = m[1] ?? m[2] ?? m[3];
      if (!raw) continue;
      const k = /\bk\b/i.test(m[0].slice(m[0].indexOf(raw) + raw.length)) || /\dk\b/i.test(m[0]);
      const amount = toNumber(raw) * (k ? 1000 : 1);
      if (!Number.isFinite(amount) || amount < 50) continue;
      sellTotal = { amount, text: m[0].trim() };
      break;
    }
    if (sellTotal) break;
  }

  const facts: BriefFacts = { measures, area, length, sellPerUnit, sellTotal };
  if (sellTotal) {
    facts.targetSell = money(sellTotal.amount);
    facts.targetFrom = `the $${fmt(sellTotal.amount)} you set`;
  } else if (sellPerUnit) {
    const qty =
      sellPerUnit.unit === "sqft" ? area
        : sellPerUnit.unit === "linear ft" ? length
          : measures.find((m) => m.unit === sellPerUnit!.unit)?.value;
    if (qty) {
      facts.targetSell = money(qty * sellPerUnit.amount);
      facts.targetFrom = `${fmtQty(qty)} ${unitWord(sellPerUnit.unit)} × $${fmt(sellPerUnit.amount)}/${unitWord(sellPerUnit.unit)}`;
    }
  }
  return facts;
}

export function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const fmtQty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
export function unitWord(u: BriefUnit): string {
  return u === "sqft" ? "sq ft" : u === "linear ft" ? "linear ft" : u;
}

// ── The rules the model answers under ───────────────────────────────────────

/** How to read a brief — always in the prompt, with the stated numbers when there are any. */
export function briefRulesBlock(facts: BriefFacts): string {
  const lines = [
    "HOW TO READ THE CONTRACTOR'S BRIEF (BINDING — these beat every anchor, waste table and phase list above):",
    "1. The brief is the whole intake; there is nobody to ask. Where it is silent, take the standard assumption for this trade, write it in pricing.notes, and keep going. Never drop a step for want of a detail, and never invent a requirement the brief does not carry.",
    "2. The line items are the steps of the job the brief asks for, in build order — every step that job takes (preparation, the work itself, cleanup) and nothing from a different job or a wider scope. No tests, treatments, allowances, permits, upgrades or 'recommended' extras the brief did not ask for: offer those in `upsells`, never as a line. When the brief names the system ('full flake epoxy with a polyaspartic topcoat'), the lines are that system's own steps.",
    "3. A quantity the contractor states is exact. The customer is billed on what was measured, so every line in that unit carries that quantity; waste, overage and coverage loss go into the material unitPrice, never into the quantity.",
    "4. A price the contractor states is the price the customer pays. '$10 per sq ft' on 400 sq ft means the line items total exactly $4,000.00 before tax — split it across the steps by their real share of cost. Do not add a line to reach it, do not stop short of it, and do not put overhead or profit on top of it.",
  ];
  const stated: string[] = [];
  if (facts.area) stated.push(`Area: ${fmtQty(facts.area)} sq ft — every sqft line carries sqft ${fmtQty(facts.area)} exactly.`);
  if (facts.length) stated.push(`Run: ${fmtQty(facts.length)} linear ft — every linear line carries quantity ${fmtQty(facts.length)} exactly.`);
  for (const m of facts.measures) {
    if (m.unit === "sq yards" || m.unit === "cu yards") stated.push(`${fmtQty(m.value)} ${m.unit} as stated.`);
  }
  if (facts.sellPerUnit) stated.push(`Customer price: $${fmt(facts.sellPerUnit.amount)} per ${unitWord(facts.sellPerUnit.unit)} ("${facts.sellPerUnit.text}").`);
  if (facts.sellTotal) stated.push(`Customer price for the job: $${fmt(facts.sellTotal.amount)} ("${facts.sellTotal.text}").`);
  if (facts.targetSell) stated.push(`THEREFORE the sum of every lineItem total (materialCost + laborCost across all lines) must be exactly $${fmt(facts.targetSell)} — ${facts.targetFrom}.`);
  if (stated.length) lines.push("THE NUMBERS THIS BRIEF STATES:", ...stated.map((s) => `  - ${s}`));
  return lines.join("\n");
}

// ── Enforcing them on the reply ─────────────────────────────────────────────

export type BriefLine = { name: string; unit: string; quantity: number; materialUnitPrice: number; laborUnitPrice: number };
export type MarkupPct = { materialMarkupPct: number; laborMarkupPct: number };
export type BriefSnap = { from: number; to: number; unit: BriefUnit };

export type BriefBinding<T> = {
  lines: T[];
  /** Notes for the sheet's assumptions — what was held to the brief. */
  notes: string[];
  snapped: BriefSnap[];
  /** True when the prices were scaled to the stated customer price. */
  fitted: boolean;
  /** The customer price the lines now sum to (after the markup given), when a target was set. */
  sellTotal?: number;
};

const NO_MARKUP: MarkupPct = { materialMarkupPct: 0, laborMarkupPct: 0 };

const isArea = (u: string) => /^(sqft|sq ft|square feet|sf)$/i.test(u.trim());
const isLinear = (u: string) => /^(linear ft|lf|linear feet|ln ft)$/i.test(u.trim());

function sellOf(l: BriefLine, mk: MarkupPct): number {
  return l.quantity * (l.materialUnitPrice * (1 + mk.materialMarkupPct / 100) + l.laborUnitPrice * (1 + mk.laborMarkupPct / 100));
}

/**
 * Hold the reply to the brief: the stated quantity on every line measured in
 * that unit (a 450 that came from a 400 plus waste goes back to 400, its line
 * total kept), then the stated customer price across all lines (scaled by
 * one factor, so the model's split between steps survives), landing on the
 * cent through the fixed line.
 */
export function bindLinesToBrief<T extends BriefLine>(input: T[], facts: BriefFacts, markup: MarkupPct = NO_MARKUP): BriefBinding<T> {
  const lines = input.map((l) => ({ ...l }));
  const notes: string[] = [];
  const snapped: BriefSnap[] = [];

  // 1. Quantities.
  const snapTo = (l: T, to: number, unit: BriefUnit) => {
    const from = l.quantity;
    if (!Number.isFinite(from) || from <= 0 || from === to) return;
    const r = from / to;
    // Only a waste-inflated (or slightly short) reading of the SAME measure:
    // a second area in the job (walls next to a floor) is left alone.
    if (r < 0.85 || r > 1.6) return;
    l.quantity = to;
    l.materialUnitPrice = money(l.materialUnitPrice * r);
    l.laborUnitPrice = money(l.laborUnitPrice * r);
    if (!snapped.some((s) => s.from === from && s.to === to)) snapped.push({ from, to, unit });
  };
  for (const l of lines) {
    if (facts.area && isArea(l.unit)) snapTo(l, facts.area, "sqft");
    else if (facts.length && isLinear(l.unit)) snapTo(l, facts.length, "linear ft");
  }
  if (snapped.length) {
    const s = snapped[0];
    notes.push(`Quantities follow the brief: ${fmtQty(s.to)} ${unitWord(s.unit)} on every ${unitWord(s.unit)} line — waste and coverage loss sit in the material prices, not in the quantity.`);
  }

  // 2. The customer price.
  let fitted = false;
  let sellTotal: number | undefined;
  const target = facts.targetSell;
  if (target && target > 0) {
    const sum = () => lines.reduce((a, l) => a + sellOf(l, markup), 0);
    const before = sum();
    if (before > 0) {
      const f = target / before;
      if (Math.abs(f - 1) > 1e-6) {
        for (const l of lines) {
          l.materialUnitPrice = money(l.materialUnitPrice * f);
          l.laborUnitPrice = money(l.laborUnitPrice * f);
        }
        fitted = true;
      }
      // Land on the cent: the rounding residue goes on a quantity-1 line (a
      // fixed line, usually cleanup or mobilization), else on the line whose
      // quantity divides it, else on the smallest quantity.
      const residual = () => money(target - sum());
      let r = residual();
      if (Math.abs(r) >= 0.005) {
        const cents = Math.round(r * 100);
        const pick =
          lines.find((l) => l.quantity === 1 && l.laborUnitPrice > 0) ??
          lines.find((l) => l.quantity === 1 && l.materialUnitPrice > 0) ??
          lines.find((l) => l.quantity > 0 && Number.isInteger(l.quantity) && cents % l.quantity === 0 && (l.laborUnitPrice > 0 || l.materialUnitPrice > 0)) ??
          [...lines].filter((l) => l.quantity > 0 && (l.laborUnitPrice > 0 || l.materialUnitPrice > 0)).sort((a, b) => a.quantity - b.quantity)[0];
        if (pick) {
          const onLabor = pick.laborUnitPrice > 0 || pick.materialUnitPrice <= 0;
          const rate = 1 + (onLabor ? markup.laborMarkupPct : markup.materialMarkupPct) / 100;
          const perUnit = money(r / pick.quantity / rate);
          if (onLabor) pick.laborUnitPrice = money(pick.laborUnitPrice + perUnit);
          else pick.materialUnitPrice = money(pick.materialUnitPrice + perUnit);
          r = residual();
        }
      }
      sellTotal = money(sum());
      const hasMarkup = markup.materialMarkupPct !== 0 || markup.laborMarkupPct !== 0;
      notes.push(
        `Priced to ${facts.targetFrom ?? "the price you set"}: the proposal totals $${fmt(sellTotal)} before tax` +
          (hasMarkup ? ` — that figure already includes your ${markup.materialMarkupPct}% material and ${markup.laborMarkupPct}% labor markup, so this sheet shows the cost side below it.` : "."),
      );
    } else {
      notes.push(`The brief sets ${facts.targetFrom ?? "a price"}, but every line came back unpriced — fill the prices in and the total is yours to set.`);
    }
  }
  return { lines, notes, snapped, fitted, sellTotal };
}

/** "450 sqft" in a title or scope, after the quantity went back to 400. */
export function bindTextToBrief(text: string, snapped: BriefSnap[]): string {
  let out = text ?? "";
  for (const s of snapped) {
    if (s.unit === "sqft") out = out.replace(new RegExp(`\\b${fmtQty(s.from).replace(/,/g, ",?")}\\s*(?:-\\s*)?(?:sq\\.?\\s*ft\\.?|sqft|square\\s*(?:feet|foot)|sf)\\b`, "gi"), `${fmtQty(s.to)} sq ft`);
    if (s.unit === "linear ft") out = out.replace(new RegExp(`\\b${fmtQty(s.from).replace(/,/g, ",?")}\\s*(linear\\s*(?:feet|foot|ft)|lf|ft|feet)\\b`, "gi"), `${fmtQty(s.to)} $1`);
  }
  return out;
}

// ── Work the brief did not ask for ──────────────────────────────────────────

const COATINGS = new Set(["epoxy-flooring", "concrete-resurfacing", "coatings"]);
const MOISTURE_ASKED = /\b(moisture|vapou?r|damp|wet|humid|mitigat|new\s+(slab|concrete|pour)|green\s+concrete|fresh\s+concrete|recently\s+poured|just\s+poured|hydrostatic)\b/i;
const MOISTURE_CLAUSE = /(?:,?\s*(?:including|incl\.?|with|plus|and|&|\+)\s+)?\bmoisture(?:[- ]vapou?r)?\s+(?:testing|tests?|mitigation|mapping|check|readings?|barrier(?:\s+primer)?)(?:\s*(?:and|&|\/|\+)\s*(?:vapou?r[- ]barrier(?:\s+primer)?|mvb|calcium[- ]chloride\s+tests?|rh\s+probes?))?/gi;
const MOISTURE_ONLY = /^\s*(?:moisture|vapou?r|mvb|calcium chloride|rh probe|relative humidity)/i;

/**
 * A coatings reply loves to add moisture testing and vapor-barrier primers
 * the brief never mentioned. Strip the clause from a line that bundles it
 * with real prep; drop a line that is nothing else. Only when the brief is
 * silent on moisture — a wet or new slab keeps every word.
 */
export function scrubUnaskedWork<T extends { name: string; notes?: string }>(lines: T[], brief: string, specialtyId: string): { lines: T[]; dropped: string[]; scrubbed: boolean } {
  if (!COATINGS.has(specialtyId) || MOISTURE_ASKED.test(brief)) return { lines, dropped: [], scrubbed: false };
  const dropped: string[] = [];
  let scrubbed = false;
  const out: T[] = [];
  for (const l of lines) {
    if (!/moisture|vapou?r|mvb/i.test(l.name)) { out.push(l); continue; }
    if (MOISTURE_ONLY.test(l.name)) { dropped.push(l.name); scrubbed = true; continue; }
    const name = tidy(l.name.replace(MOISTURE_CLAUSE, " "));
    if (name.replace(/[^a-z]/gi, "").length < 6) { dropped.push(l.name); scrubbed = true; continue; }
    scrubbed = scrubbed || name !== l.name;
    out.push({ ...l, name, notes: l.notes ? tidy(l.notes.replace(MOISTURE_CLAUSE, " ")) : l.notes });
  }
  return { lines: out, dropped, scrubbed };
}

/** The same scrub on prose (the scope bullets). */
export function scrubUnaskedText(text: string, brief: string, specialtyId: string): string {
  if (!COATINGS.has(specialtyId) || MOISTURE_ASKED.test(brief)) return text;
  return (text ?? "")
    .split("\n")
    .map((line) => (MOISTURE_ONLY.test(line.replace(/^[-•*\d.)\s]+/, "")) ? "" : tidy(line.replace(MOISTURE_CLAUSE, " "))))
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n");
}

function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\(\s*\)/g, "")
    .replace(/(^|\s)(and|with|including|plus)\s*([,.;:]|$)/gi, "$3")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[,;:]\s*$/, "")
    .trim();
}

// ── The estimate shape (refine) ─────────────────────────────────────────────

/**
 * The same binding on a GeneratedEstimate — material and labor rows that
 * share an id are one line; both rows take the held quantity and price.
 */
export function bindEstimateToBrief(est: GeneratedEstimate, facts: BriefFacts, markup: MarkupPct = NO_MARKUP): BriefBinding<BriefLine> {
  const pairs = pairEstimateLines(est);
  const fused: BriefLine[] = pairs.map(({ material: m, labor: l }) => ({
    name: (m ?? l)!.name,
    unit: (m ?? l)!.unit ?? "",
    quantity: m?.quantity ?? l?.quantity ?? 0,
    materialUnitPrice: m?.unitPrice ?? 0,
    laborUnitPrice: l?.unitPrice ?? 0,
  }));
  const bound = bindLinesToBrief(fused, facts, markup);
  pairs.forEach(({ material: m, labor: l }, i) => {
    const b = bound.lines[i];
    if (m) { m.quantity = b.quantity; m.unitPrice = b.materialUnitPrice; }
    if (l) { l.quantity = b.quantity; l.unitPrice = b.laborUnitPrice; }
  });
  return bound;
}

// ── Which questions are worth the contractor's time ─────────────────────────

/** Preferences and logistics — a homeowner's intake form, not an estimator's question. */
const NOT_COST = /\b(colou?rs?|pattern|brand|style|look|aesthetic|prefer|preference|schedule|start date|timeline|when (?:do|would|can|should)|deadline|access|parking|how did you|contact|phone|email|warranty|financing|payment|budget|design)\b/i;
const ASKS_AREA = /\b(square\s*f(?:oo|ee)t|sq\.?\s*ft|sqft|how (?:big|large)|what (?:size|area)|dimensions?)\b/i;
const ASKS_PRICE = /\b(price|per\s+sq|per\s+foot|cost per|rate|how much)\b/i;
const ASKS_LENGTH = /\b(how long|linear\s*f(?:oo|ee)t|lf\b|length|how many feet)\b/i;

/**
 * Keep only the questions whose answer moves the price: an existing condition
 * the brief does not settle. Anything about taste or logistics, and anything
 * the brief already states, is dropped whatever the model decided.
 */
export function keepCostCritical<T extends { question: string; why?: string }>(questions: T[], brief: string): T[] {
  const facts = readBrief(brief);
  return questions.filter((q) => {
    const text = `${q.question} ${q.why ?? ""}`;
    if (NOT_COST.test(q.question)) return false;
    if (facts.area && ASKS_AREA.test(text)) return false;
    if (facts.length && ASKS_LENGTH.test(text)) return false;
    if ((facts.sellPerUnit || facts.sellTotal) && ASKS_PRICE.test(q.question)) return false;
    return true;
  });
}

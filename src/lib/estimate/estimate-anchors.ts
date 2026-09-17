// THE PRICE ANCHORS, AS NUMBERS.
//
// `trade-knowledge.ts` carries the unit-price anchors as prose, written for a
// model to read ("Architectural shingles (30-yr, Class A): material $110-160/sq
// boards; install labor $150-260/sq boards"). The 2026-09-17 accuracy audit
// needed them as ranges so a returned line can be judged against them: roofing
// install labor came back at $130/sq against a $150-260 anchor in three runs
// out of three, and a 50-gallon water heater came back at $1 of material.
//
// This parser is deliberately CONSERVATIVE. There are ~47 distinct string
// shapes across the 21 trades — parenthetical alternates, "or" clauses, per
// tread, per day, material and labor in different units on one line, one
// anchor with no `$` at all. Anything this file cannot read with confidence
// produces NO range, and a line matched to it is simply not price-checked.
// A missing corridor costs nothing; a wrong corridor would clamp a correct
// price, which is worse than not checking.
//
// Pure module, no I/O. Used by lib/estimate/validate-estimate.

import { normalizeUnit } from "./console-model";
import type { TradeProfile } from "./trade-knowledge";

export type AnchorKind = "material" | "labor" | "either";

export interface AnchorRange {
  kind: AnchorKind;
  /** The estimate's own unit vocabulary (console-model units), or "fixed". */
  unit: string;
  lo: number;
  hi: number;
}

export interface ParsedAnchor {
  /** The text before the colon — what the anchor is about. */
  label: string;
  /** Distinctive words of the label, for matching a line name against it. */
  tokens: string[];
  ranges: AnchorRange[];
  raw: string;
}

const STOP = new Set([
  "and", "the", "with", "per", "for", "one", "two", "of", "in", "on", "at", "or", "to", "it", "is",
  "add", "if", "separate", "standard", "grade", "class", "new", "existing", "each", "installed",
  "from", "up", "than", "over", "under", "into", "any", "all", "job", "work",
]);

/** Distinctive words of a phrase, lowercased. */
export function anchorTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Anchor unit words → the ten units an estimate line can carry. */
const UNIT_WORDS: Record<string, string> = {
  sqft: "sqft",
  "sq ft": "sqft",
  "square ft": "sqft",
  "square feet": "sqft",
  sf: "sqft",
  lf: "linear ft",
  "linear ft": "linear ft",
  "linear foot": "linear ft",
  "linear feet": "linear ft",
  "ln ft": "linear ft",
  "sq boards": "sq boards",
  square: "sq boards",
  squares: "sq boards",
  unit: "unit",
  ea: "unit",
  hour: "hour",
  hr: "hour",
  "cu yards": "cu yards",
  "cubic yard": "cu yards",
  "cubic yards": "cu yards",
  yards: "yards",
  yard: "yards",
  "sq yards": "sq yards",
  fixed: "fixed",
  lot: "fixed",
};

/** Read the unit word that follows a price range; null when it is not one of ours. */
function unitAfter(text: string): string | null {
  const m = text.match(/^\s*(?:\/|per\s+)([a-z][a-z ]*)/i);
  if (m) {
    const raw = m[1].toLowerCase().trim();
    // Longest known unit word that the phrase STARTS with ("sq boards", then "sq").
    const keys = Object.keys(UNIT_WORDS).sort((a, b) => b.length - a.length);
    for (const k of keys) if (raw === k || raw.startsWith(`${k} `)) return UNIT_WORDS[k];
    return null;
  }
  if (/^\s*fixed\b/i.test(text)) return "fixed";
  return null;
}

const money = (s: string) => Number(s.replace(/,/g, ""));

/**
 * One anchor string → the ranges it states with confidence.
 *
 * Parentheses are stripped first: every parenthetical in the catalogue is an
 * alternate, an adder or a gloss ("(add $0.50-0.90/sqft per extra layer)"),
 * and none of them is the anchor's own price.
 */
export function parseAnchor(raw: string): ParsedAnchor {
  const colon = raw.indexOf(":");
  const label = (colon > 0 ? raw.slice(0, colon) : raw).trim();
  const body = (colon > 0 ? raw.slice(colon + 1) : raw).replace(/\([^)]*\)/g, " ");
  const ranges: AnchorRange[] = [];
  for (const clause of body.split(";")) {
    // A clause with an "or" alternate prices two different things — skip it.
    if (/\bor\b/i.test(clause)) continue;
    const re = /\$\s*([\d,]+(?:\.\d+)?)\s*(?:-|–|to)\s*\$?\s*([\d,]+(?:\.\d+)?)/g;
    let m: RegExpExecArray | null;
    let found = 0;
    while ((m = re.exec(clause))) {
      found += 1;
      const lo = money(m[1]);
      const hi = money(m[2]);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo || hi <= 0) continue;
      const unit = unitAfter(clause.slice(m.index + m[0].length));
      if (!unit) continue;
      const before = clause.slice(0, m.index).toLowerCase();
      const kind: AnchorKind = /\blabor\b/.test(before) ? "labor" : /\bmaterial\b|\bsupply\b/.test(before) ? "material" : "either";
      ranges.push({ kind, unit, lo, hi });
    }
    // Two ranges in one clause without a semicolon are a tier list, not a
    // material/labor pair — too ambiguous to judge a price against.
    if (found > 1) {
      for (let k = 0; k < found && ranges.length; k++) ranges.pop();
    }
  }
  return { label, tokens: anchorTokens(label), ranges, raw };
}

export function parseTradeAnchors(trade: TradeProfile): ParsedAnchor[] {
  return trade.anchors.map(parseAnchor);
}

/**
 * The anchor a line is about, by shared distinctive words. Needs a real
 * overlap (a long word, or two short ones) — a single weak match is noise.
 */
export function matchAnchor(lineName: string, anchors: readonly ParsedAnchor[]): ParsedAnchor | null {
  const words = new Set(anchorTokens(lineName));
  let best: { a: ParsedAnchor; score: number } | null = null;
  for (const a of anchors) {
    let score = 0;
    for (const t of a.tokens) if (words.has(t)) score += t.length >= 6 ? 2 : 1;
    if (score > (best?.score ?? 0)) best = { a, score };
  }
  return best && best.score >= 2 ? best.a : null;
}

export interface Corridor {
  lo: number;
  hi: number;
  /** The anchor's own range, before the regional index and the 0.5x-2x window. */
  anchorLo: number;
  anchorHi: number;
  label: string;
}

/**
 * The price window for one side of a line: the anchor range × the regional
 * index, widened to [0.5×, 2×] — outside that the figure is not a judgement
 * call, it is wrong. Null when the anchor says nothing about this unit.
 */
export function corridorFor(
  anchor: ParsedAnchor,
  kind: "material" | "labor",
  unit: string,
  regionIndex: number,
): Corridor | null {
  const u = normalizeUnit(unit);
  const exact = anchor.ranges.filter((r) => r.unit === u && r.kind === kind);
  const either = anchor.ranges.filter((r) => r.unit === u && r.kind === "either");
  const use = exact.length ? exact : either;
  if (!use.length) return null;
  const lo = Math.min(...use.map((r) => r.lo)) * regionIndex;
  const hi = Math.max(...use.map((r) => r.hi)) * regionIndex;
  if (!(lo > 0) || !(hi >= lo)) return null;
  return { lo: lo * 0.5, hi: hi * 2, anchorLo: lo, anchorHi: hi, label: anchor.label };
}

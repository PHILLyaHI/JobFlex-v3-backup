// Smart Proposal — the questions worth asking before the job is priced
// (2026-09-19).
//
// Owner: "make sure when running smart estimator ask question that price
// effective check, make smart." The intake gate used to be the model's
// judgment alone, so it asked what sounded sensible. The app already knows
// which questions move money: the procedure marks a step conditional with
// the condition that puts it on the estimate (`when`), and the price book
// says what that step costs. So the questions are chosen here, ranked by the
// dollars behind them, and the model only puts them in a contractor's words.
//
// First question of all: the job's own measure. Without it there is no range
// for the trade, so nothing checks the model's total and nothing catches a
// cheap answer (2026-09-19: "install 300 lineal feet of sewer…" priced with
// no length at all). Plain module.

import type { BriefFacts } from "./brief";
import { locationIndex } from "./location-index";
import { roomAreaFrom } from "./remodel-sanity";
import type { ProcedureUnit, SpecialtyProcedure } from "./procedures/types";
import { briefQuantity, pricesFor, stepCost, type SpecialtyPrices } from "./step-prices";

export type CostQuestion = {
  id: string;
  question: string;
  /** How the answer moves the price — shown under the question. */
  why: string;
  kind: "select" | "number" | "text";
  options?: string[];
  unit?: string;
  /** What hangs on the answer, at contractor cost in the job's city. */
  impact: number;
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const mid = ([a, b]: [number, number]) => (a + b) / 2;

const MEASURE_WORD: Partial<Record<ProcedureUnit, string>> = {
  sqft: "square feet",
  "linear ft": "linear feet",
  "sq yards": "square yards",
  "cu yards": "cubic yards",
  "sq boards": "square feet of roof",
};

/** A condition that fixes what is broken, or crosses something, covers a part of the job — not all of it. */
const PATCHWORK = /\b(?:damag\w*|rot\w*|soft|crack\w*|repair\w*|patch\w*|beyond|crossing|passes|under|where|spot|failing|deterior\w*)\b/i;
const PART_OF_JOB = 0.25;

/**
 * A quantity for a conditional step on this job: the book's typical for it,
 * else the job's own measure — a whole quantity when the condition puts the
 * step over the whole job ("heated floors are in the scope"), a quarter when
 * it fixes or crosses something ("the subfloor is soft or rotted") — else one.
 */
function stepQuantity(unit: ProcedureUnit, typical: number | undefined, area: number | undefined, facts: BriefFacts, when: string): number {
  if (typical && typical > 0) return typical;
  const share = PATCHWORK.test(when) ? PART_OF_JOB : 1;
  if (unit === "sqft" && area) return area * share;
  if (unit === "linear ft" && facts.length) return facts.length * share;
  if (unit === "sq boards" && area) return (area / 100) * share;
  return 1;
}

/** A condition the brief already rules out: exterior work on an interior job, and the other way round. */
function ruledOut(when: string, brief: string): boolean {
  const w = when.toLowerCase();
  const b = brief.toLowerCase();
  const says = (x: RegExp) => x.test(b);
  if (/\bexterior\b|\boutside\b/.test(w) && says(/\binterior\b|\binside\b/) && !says(/\bexterior\b|\boutside\b/)) return true;
  if (/\binterior\b|\binside\b/.test(w) && says(/\bexterior\b|\boutside\b/) && !says(/\binterior\b|\binside\b/)) return true;
  return false;
}

/**
 * Conditional steps that are alternatives of one choice read their condition
 * the same way — "the fence is a panel system", "the fence is chain link".
 * They become ONE question, and what hangs on it is the spread between the
 * dearest and the cheapest, not the sum.
 */
const ALTERNATIVE = /^(the\s+[a-z][a-z\s-]{0,24}?)\s+(?:is|are)\s+(.+)$/i;

/** A short subject for a question, from the step's line: its first clause. */
function subject(item: string): string {
  const head = item.split(/[—:;(]| - /)[0].replace(/,\s*$/, "").trim();
  return head.length > 4 ? head : item.trim();
}

/**
 * The questions this brief is worth asking, most money first: the job's
 * measure when the trade sells by one and the brief states none, then the
 * conditional steps whose cost is worth a tap. Empty when the brief answers
 * everything the price depends on.
 */
export function costQuestions(
  specialtyId: string,
  procedure: SpecialtyProcedure | null,
  facts: BriefFacts,
  location: string | null | undefined,
  opts: { limit?: number; brief?: string } = {},
): CostQuestion[] {
  const book: SpecialtyPrices | null = pricesFor(specialtyId);
  if (!book || !procedure) return [];
  // A room's size ("8x10 hall bath") is not the brief's binding area, but it
  // is the size a conditional step would cover (lib/estimate/remodel-sanity).
  const area = facts.area ?? (opts.brief ? roomAreaFrom(opts.brief) : undefined);
  const factor = locationIndex(location).factor;
  const b = book.benchmark;
  const out: CostQuestion[] = [];

  // The job's own measure — the whole price rides on it. A roof written in
  // squares ("30 squares") states it too, though the brief reader files the
  // number as sqft.
  const squares = b.unit === "sq boards" ? /(\d{1,4}(?:\.\d+)?)\s*(?:squares|sqs)\b/i.exec(opts.brief ?? "") : null;
  const stated = briefQuantity(b.unit, facts, b.measures) ?? (squares ? Number(squares[1]) : undefined);
  const word = MEASURE_WORD[b.unit];
  const perUnit = mid(b.price) / (1 + book.op) * factor;
  const typicalQty = mid(b.typicalQty);
  if (!stated && word) {
    out.push({
      id: "job-measure",
      question: `How many ${word}? (${b.measures})`,
      why: `the whole job is priced by the ${b.unit} — about ${usd(perUnit)} per ${b.unit} here — so without it the price cannot be checked against the market`,
      kind: "number",
      unit: b.unit === "sq boards" ? "sqft" : b.unit,
      impact: perUnit * typicalQty,
    });
  }
  const jobQty = stated ?? typicalQty;
  const jobTotal = perUnit * jobQty;

  // Every conditional step, priced on this job.
  const floor = Math.max(300, jobTotal * 0.04);
  const conditional = procedure.steps
    .map((s, i) => {
      if (!s.when) return null;
      if (opts.brief && ruledOut(s.when, opts.brief)) return null;
      const price = book.steps[s.item.trim()];
      if (!price) return null;
      const cost = mid(stepCost(price, book.op).total) * factor;
      const qty = stepQuantity(s.unit, price.q, area, facts, s.when);
      const impact = cost * qty;
      return { step: s, i, impact };
    })
    .filter((x): x is { step: SpecialtyProcedure["steps"][number]; i: number; impact: number } => !!x && x.impact >= floor)
    .sort((x, y) => y.impact - x.impact);

  // One question per choice: the alternatives of a choice group together.
  const groups = new Map<string, Array<(typeof conditional)[number] & { tail: string }>>();
  const singles: typeof conditional = [];
  for (const c of conditional) {
    const m = ALTERNATIVE.exec(c.step.when!.trim());
    if (m) {
      const key = m[1].toLowerCase().trim();
      groups.set(key, [...(groups.get(key) ?? []), { ...c, tail: m[2].trim() }]);
    } else singles.push(c);
  }
  const asked: Array<{ q: CostQuestion; impact: number }> = [];
  for (const [key, members] of groups) {
    if (members.length < 2) {
      singles.push(members[0]);
      continue;
    }
    const spread = members[0].impact - members[members.length - 1].impact;
    const noun = key.replace(/^the\s+/i, "");
    asked.push({
      impact: spread,
      q: {
        id: `choice-${members.map((m) => m.i).join("-")}`,
        question: `Which ${noun}?`,
        why: `the price changes by about ${usd(spread)} between them on a job this size`,
        kind: "select",
        options: members.map((m) => m.tail.charAt(0).toUpperCase() + m.tail.slice(1)),
        impact: spread,
      },
    });
  }
  for (const c of singles) {
    asked.push({
      impact: c.impact,
      q: {
        id: `step-${c.i}`,
        question: `${subject(c.step.item)} — does this job need it?`,
        why: `the estimate carries it when ${c.step.when!.trim()}; about ${usd(c.impact)} on a job this size`,
        kind: "select",
        options: ["Not needed", "Yes, include it", "Not sure — assume the usual"],
        impact: c.impact,
      },
    });
  }
  out.push(...asked.sort((x, y) => y.impact - x.impact).map((a) => a.q));
  return out.slice(0, opts.limit ?? 3);
}

/** The block the intake gate carries: what to ask, in order, with the money behind it. */
export function costQuestionBlock(questions: CostQuestion[]): string | null {
  if (!questions.length) return null;
  return [
    "COST-CRITICAL UNKNOWNS for this trade, ranked by the money each answer moves on THIS job (the price book and the trade's procedure, at contractor cost):",
    ...questions.map((q, i) => `  ${i + 1}. id "${q.id}" — ${q.question} [${q.why}]`),
    "Ask these, in this order, keeping each id exactly, and write each one in a contractor's own words (short, one tap to answer, options with the usual case first). Drop any the brief already answers. You may add ONE more question of your own only if its answer moves the price as much.",
  ].join("\n");
}

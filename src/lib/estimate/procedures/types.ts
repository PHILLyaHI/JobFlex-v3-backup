// Smart Proposal — the procedure behind every specialty.
//
// Owner, 2026-09-18, looking at a sewer estimate that came back as six thin
// lines ("Excavation 300 linear ft", "Pressure test 1 fixed"): "it's not
// have procedures at all. go each one and set most important procedures
// belongs to each … need pro estimates that item lines to do are important
// to show … use right measures."
//
// A procedure is the ordered list of the lines a professional estimate for
// that specialty itemizes — what is done, how, with what, and the unit the
// line is measured and sold in. One per AI specialty (lib/estimate/legacy/
// specialties.ts), grouped by the specialty's group in the files beside this
// one; ./index.ts merges them, formats the prompt block and parses the
// admin's edited text back. Plain data + types, no "use client"/"use server".

/** The units a procedure step may carry — the estimator's own vocabulary
 *  (lib/estimate/master-prompt UNIT_VOCABULARY) less the two aliases
 *  (`lf` is `linear ft`; `yards` is fabric by the linear yard and is kept
 *  legal but unused). */
export const PROCEDURE_UNITS = [
  "sqft",
  "linear ft",
  "sq boards",
  "cu yards",
  "sq yards",
  "unit",
  "hour",
  "fixed",
  "yards",
] as const;

export type ProcedureUnit = (typeof PROCEDURE_UNITS)[number];

export type ProcedureStep = {
  /**
   * The line as the estimate prints it: the work, the method, the material
   * or equipment and the size or spec — written for the client, no math.
   * Never a bare category word.
   */
  item: string;
  /** The unit the line is measured and sold in. */
  unit: ProcedureUnit;
  /**
   * Present only on a conditional step: the bare condition that puts it on
   * the estimate ("the run crosses asphalt or concrete"). Absent means every
   * job of this specialty carries the line unless the brief excludes it.
   */
  when?: string;
};

export type SpecialtyProcedure = {
  /** How the trade measures and sells this work — the quantity the main lines carry. */
  basis: string;
  /** The steps in build order. */
  steps: ProcedureStep[];
  /** Lines a pro never writes for this specialty (bare words, padding, another trade's work). */
  avoid: string[];
  /** Assumptions and exclusions the estimate states in its notes. */
  notes: string[];
};

export type ProcedureMap = Record<string, SpecialtyProcedure>;

/** Loose shape a parser or an admin edit may produce before validation. */
export type ProcedureIssue = { path: string; message: string };

const BARE_WORDS =
  /^(mobilization|demobilization|demolition|demo|cleanup|clean up|labor|labour|materials?|misc\.?|miscellaneous|contingency|permits?|excavation|installation|install|prep|preparation|testing|inspection|general conditions|overhead|profit)$/i;

/**
 * Every rule a procedure must satisfy, as issues (empty = valid). Shared by
 * the QA script, the merge step and the admin save so the same bar holds for
 * the code defaults and for an edited override.
 */
export function validateProcedure(p: unknown, opts: { minSteps?: number; maxSteps?: number } = {}): ProcedureIssue[] {
  const issues: ProcedureIssue[] = [];
  const minSteps = opts.minSteps ?? 5;
  const maxSteps = opts.maxSteps ?? 24;
  if (!p || typeof p !== "object") return [{ path: "", message: "not an object" }];
  const proc = p as Partial<SpecialtyProcedure>;
  if (typeof proc.basis !== "string" || proc.basis.trim().length < 8 || proc.basis.length > 200) {
    issues.push({ path: "basis", message: "basis must be 8-200 characters" });
  }
  if (!Array.isArray(proc.steps)) {
    issues.push({ path: "steps", message: "steps must be an array" });
    return issues;
  }
  if (proc.steps.length < minSteps || proc.steps.length > maxSteps) {
    issues.push({ path: "steps", message: `steps must be ${minSteps}-${maxSteps} (got ${proc.steps.length})` });
  }
  const seen = new Set<string>();
  let core = 0;
  proc.steps.forEach((s, i) => {
    const at = `steps[${i}]`;
    if (!s || typeof s !== "object") return issues.push({ path: at, message: "not an object" });
    const item = typeof s.item === "string" ? s.item.trim() : "";
    if (item.length < 18 || item.length > 260) issues.push({ path: at, message: `item must be 18-260 characters (got ${item.length})` });
    if (BARE_WORDS.test(item)) issues.push({ path: at, message: `"${item}" is a bare category word` });
    if (!/\s/.test(item)) issues.push({ path: at, message: `"${item}" is a single word` });
    const key = item.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) issues.push({ path: at, message: `duplicate step "${item}"` });
    seen.add(key);
    if (!PROCEDURE_UNITS.includes(s.unit as ProcedureUnit)) issues.push({ path: at, message: `unit "${String(s.unit)}" is not one of ${PROCEDURE_UNITS.join(", ")}` });
    if (s.when !== undefined) {
      const w = typeof s.when === "string" ? s.when.trim() : "";
      if (w.length < 6 || w.length > 140) issues.push({ path: at, message: "when must be 6-140 characters" });
      if (/^(when|if|only)\b/i.test(w)) issues.push({ path: at, message: `when must be the bare condition, not "${w.split(" ")[0]} …"` });
    } else core++;
  });
  if (core < 4 && proc.steps.length >= minSteps) issues.push({ path: "steps", message: `at least 4 core steps (got ${core})` });
  if (!Array.isArray(proc.avoid) || proc.avoid.length < 1 || proc.avoid.length > 8 || proc.avoid.some((a) => typeof a !== "string" || a.trim().length < 8)) {
    issues.push({ path: "avoid", message: "avoid must list 1-8 entries of at least 8 characters" });
  }
  if (!Array.isArray(proc.notes) || proc.notes.length < 1 || proc.notes.length > 6 || proc.notes.some((a) => typeof a !== "string" || a.trim().length < 12)) {
    issues.push({ path: "notes", message: "notes must list 1-6 entries of at least 12 characters" });
  }
  return issues;
}

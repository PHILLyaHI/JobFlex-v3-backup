// Smart Proposal procedures — the merge, the prompt block, the text form.
//
// The per-group files beside this one hold one SpecialtyProcedure per AI
// specialty id (229 + the general-contracting fallback). This module:
//   - merges them (`SPECIALTY_PROCEDURES`, `procedureFor`);
//   - writes the block the estimate prompt carries for the detected
//     specialty (`formatProcedureBlock`) and the line-item rules that ride
//     with every block (`PROCEDURE_RULES`, overridable from the admin);
//   - turns a procedure into the plain text the admin edits and parses it
//     back (`procedureToText`, `procedureFromText`), so an override is
//     stored as text and validated by the same rules as the code defaults.
// Plain module, no "use client"/"use server".

import { PROCEDURES as CORE } from "./core-building-trades";
import { PROCEDURES as MEP } from "./mep";
import { PROCEDURES as EXTERIOR } from "./exterior-systems";
import { PROCEDURES as INTERIOR } from "./interior-finishes";
import { PROCEDURES as SURFACE } from "./specialty-surface-decor";
import { PROCEDURES as SITE } from "./site-landscape";
import { PROCEDURES as ENVELOPE } from "./waterproofing-envelope";
import { PROCEDURES as SYSTEMS } from "./specialty-systems";
import { PROCEDURES as CIVIL } from "./civil-demolition";
import { PROCEDURES as FABRICATION } from "./fabrication-custom";
import { PROCEDURES as GENERAL } from "./general-professional";
import { PROCEDURES as ROADWAY } from "./roadway-transportation";
import { PROCEDURES as ENGINEERING } from "./engineering-design";
import { PROCEDURES as DEVELOPMENT } from "./development-consulting";
import {
  PROCEDURE_UNITS,
  validateProcedure,
  type ProcedureIssue,
  type ProcedureMap,
  type ProcedureStep,
  type ProcedureUnit,
  type SpecialtyProcedure,
} from "./types";

export * from "./types";

/** Every procedure, keyed by AI specialty id. */
export const SPECIALTY_PROCEDURES: ProcedureMap = {
  ...CORE,
  ...MEP,
  ...EXTERIOR,
  ...INTERIOR,
  ...SURFACE,
  ...SITE,
  ...ENVELOPE,
  ...SYSTEMS,
  ...CIVIL,
  ...FABRICATION,
  ...GENERAL,
  ...ROADWAY,
  ...ENGINEERING,
  ...DEVELOPMENT,
};

/** The core (unconditional) step count — the fewest lines a complete answer has. */
export function coreStepCount(procedure: SpecialtyProcedure | null | undefined): number {
  return procedure ? procedure.steps.filter((s) => !s.when).length : 0;
}

/**
 * A reply with far fewer lines than the procedure's core steps is a thin
 * estimate — the sewer job that came back as six lines, the bathroom as
 * eight. The action asks once more with the shortfall named. Seven tenths
 * leaves room for a brief that fairly excludes a few steps.
 */
export function shortOfProcedure(lineCount: number, coreSteps: number): boolean {
  if (coreSteps < 4) return false;
  return lineCount < Math.ceil(coreSteps * 0.7);
}

/** The procedure for a specialty id, or null when none is written for it. */
export function procedureFor(specialtyId: string): SpecialtyProcedure | null {
  return SPECIALTY_PROCEDURES[specialtyId] ?? null;
}

/**
 * The line-item rules that ride with every procedure block. The admin can
 * replace this text (key `procedure-rules`); the block itself is per
 * specialty (key `specialty:<id>:procedure`).
 */
export const PROCEDURE_RULES =
  "LINE-ITEM DISCIPLINE (MANDATORY). The line items ARE the procedure above, walked in that order and sized to this job. " +
  "Itemize every core step; add a conditional step only when the brief or the site calls for it; skip nothing the client pays for. " +
  "Each line names WHAT is done, HOW, with WHAT material or equipment, and its size or spec — never a bare category or a one-word line ('Mobilization', 'Excavation', 'Labor', 'Materials', 'Misc', 'Cleanup', 'Testing'). " +
  "Quantities are real measured quantities in the unit the step carries, spelled exactly (300 ft of pipe is `linear ft` × 300, never `fixed`; a permit or a test is `fixed` × 1). " +
  "Every line carries both materialCost and laborCost: a labor-only step has materialCost 0, a permit or fee has laborCost 0, a supplied-and-installed step has both. " +
  "Never pad: work already covered by one line is not written again under another name, and two different steps are never priced as one line. " +
  "Do not add work the procedure does not list and the brief does not ask for — an extra a pro would offer goes to `upsells`. " +
  "Where a TRADE PROFILE with phases also appears, its phases group these steps and its price anchors govern the numbers.";

const RULE = "═══════════════════════════════════════════════════════════════";

/**
 * The block the prompt carries: the procedure, numbered, each step with its
 * unit and its condition, then the lines to avoid, the notes to state and
 * the rules.
 */
/**
 * The notice a brief for PART of a room gets instead of the step quota
 * ("replace the kitchen sink" detected as a kitchen remodel): the procedure
 * is a menu, the method's section 2 lists the lines.
 */
export const PARTIAL_SCOPE_NOTICE =
  "THIS BRIEF NAMES PART OF THE JOB this procedure describes, not the whole job. The steps are a menu: write a line only for the steps the brief's work reaches, plus what that work implies (the REMODEL ESTIMATING METHOD, section 2, when it is present). Never add a step the brief does not reach — a sink swap is not a kitchen remodel, a tub-to-shower is not a full bathroom. The rule to itemize every core step applies to a whole job only. Labor on every line is a licensed crew's time at the job's local rates, never a token amount.";

/** Said again after the rules, so the partial brief wins over "itemize every core step". */
export const PARTIAL_SCOPE_TAIL =
  "PARTIAL BRIEF: the rule to itemize every core step applies to a whole job only; this brief itemizes the steps its work reaches and what that work implies.";

export function formatProcedureBlock(
  specialtyName: string,
  procedure: SpecialtyProcedure,
  rules: string = PROCEDURE_RULES,
  opts: { partial?: boolean } = {},
): string {
  const lines: string[] = [];
  lines.push(RULE);
  lines.push(`PROCEDURE — ${specialtyName.toUpperCase()}: THE LINES A PROFESSIONAL ESTIMATE ITEMIZES`);
  lines.push(RULE);
  const core = procedure.steps.filter((s) => !s.when).length;
  const conditional = procedure.steps.length - core;
  lines.push(`Measured and sold by: ${procedure.basis.trim()}.`);
  if (opts.partial) {
    lines.push(PARTIAL_SCOPE_NOTICE);
    lines.push("The steps of the whole job, for reference; the unit after the dash is the unit such a line carries:");
  } else {
    lines.push(
      "Walk the steps in order. A step marked [core] is its own line on every job of this kind unless the brief plainly excludes it (state the exclusion in notes). A step marked [when …] is a line only when the brief or the site calls for it. The unit after the dash is the unit that line carries.",
    );
    lines.push(
      `This procedure has ${core} core steps and ${conditional} conditional ones. A complete answer has AT LEAST ${core} line items — one per core step, in this order — plus every conditional step the brief or the site calls for. An answer with fewer lines is incomplete and is rejected. Labor on every line is a licensed crew's time at the job's local rates, never a token amount.`,
    );
  }
  procedure.steps.forEach((s, i) => {
    const tag = s.when ? `[when ${s.when.trim()}]` : "[core]";
    lines.push(`  ${i + 1}. ${tag} ${s.item.trim()} — ${s.unit}`);
  });
  if (procedure.avoid.length) {
    lines.push("NEVER write these lines for this trade:");
    procedure.avoid.forEach((a) => lines.push(`  - ${a.trim()}`));
  }
  if (procedure.notes.length) {
    lines.push("STATE IN NOTES (pricing.notes) where they apply:");
    procedure.notes.forEach((n) => lines.push(`  - ${n.trim()}`));
  }
  lines.push("");
  lines.push(rules.trim());
  if (opts.partial) lines.push(PARTIAL_SCOPE_TAIL);
  return lines.join("\n");
}

// ── The text form the admin edits ───────────────────────────────────────────
//
//   basis: linear feet of pipe by diameter and depth
//   - Utility locate (811) and private-utility scan | fixed
//   - Saw-cut and remove pavement over the trench | sqft | the run crosses pavement
//   avoid: a bare 'Excavation' line with no depth, size or material
//   avoid: 'Miscellaneous' or 'contingency' lines
//   note: Trench depth is from the brief; rock is a change order
//
// One step per "- " line: item | unit | condition (the condition optional).
// One `avoid:` line per entry and one `note:` line per note — an entry may
// hold a semicolon, so the line is the separator, nothing else.

export function procedureToText(p: SpecialtyProcedure): string {
  const out: string[] = [];
  out.push(`basis: ${p.basis.trim()}`);
  out.push("");
  for (const s of p.steps) {
    out.push(`- ${s.item.trim()} | ${s.unit}${s.when ? ` | ${s.when.trim()}` : ""}`);
  }
  out.push("");
  for (const a of p.avoid) out.push(`avoid: ${a.trim()}`);
  for (const n of p.notes) out.push(`note: ${n.trim()}`);
  return out.join("\n");
}

const UNIT_ALIASES: Record<string, ProcedureUnit> = {
  lf: "linear ft",
  "lin ft": "linear ft",
  "linear feet": "linear ft",
  "ln ft": "linear ft",
  "sq ft": "sqft",
  sf: "sqft",
  "square feet": "sqft",
  "cu yd": "cu yards",
  "cubic yards": "cu yards",
  cy: "cu yards",
  "sq yd": "sq yards",
  sy: "sq yards",
  "square yards": "sq yards",
  each: "unit",
  ea: "unit",
  hr: "hour",
  hrs: "hour",
  hours: "hour",
  squares: "sq boards",
  square: "sq boards",
  sq: "sq boards",
  ls: "fixed",
  lot: "fixed",
  "lump sum": "fixed",
};

export function normalizeProcedureUnit(raw: string): ProcedureUnit | null {
  const u = raw.trim().toLowerCase().replace(/\.$/, "");
  if ((PROCEDURE_UNITS as readonly string[]).includes(u)) return u as ProcedureUnit;
  return UNIT_ALIASES[u] ?? null;
}

/**
 * Parse the admin's text. Returns the procedure and the issues found; a
 * procedure with issues is not saved. Unknown lines are reported, not
 * ignored, so a typo never silently drops a step.
 */
export function procedureFromText(text: string): { procedure: SpecialtyProcedure; issues: ProcedureIssue[] } {
  const issues: ProcedureIssue[] = [];
  const steps: ProcedureStep[] = [];
  const avoid: string[] = [];
  const notes: string[] = [];
  let basis = "";
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const at = `line ${idx + 1}`;
    const m = line.match(/^(basis|avoid|note|notes)\s*:\s*(.*)$/i);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === "basis") basis = val;
      else if (key === "avoid") avoid.push(val);
      else notes.push(val);
      return;
    }
    if (/^[-•*]\s*/.test(line) || /^\d+[.)]\s*/.test(line)) {
      const body = line.replace(/^[-•*]\s*/, "").replace(/^\d+[.)]\s*/, "");
      const parts = body.split("|").map((s) => s.trim());
      if (parts.length < 2) {
        issues.push({ path: at, message: `a step needs "item | unit" (got "${body.slice(0, 40)}")` });
        return;
      }
      const unit = normalizeProcedureUnit(parts[1]);
      if (!unit) {
        issues.push({ path: at, message: `unit "${parts[1]}" is not one of ${PROCEDURE_UNITS.join(", ")}` });
        return;
      }
      const when = parts[2]?.replace(/^(when|if)\s+/i, "").trim();
      steps.push(when ? { item: parts[0], unit, when } : { item: parts[0], unit });
      return;
    }
    issues.push({ path: at, message: `not a step ("- item | unit | condition"), basis:, avoid: or note: line` });
  });
  const procedure: SpecialtyProcedure = { basis, steps, avoid, notes };
  issues.push(...validateProcedure(procedure, { minSteps: 3, maxSteps: 40 }));
  return { procedure, issues };
}

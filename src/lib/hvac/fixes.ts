// WHAT MAKES IT PASS (2026-10-08). Every check that is not a pass comes with
// the shortest way to one: the field to type (or the value to set), the unit
// to pick instead, the line already on the estimate, the permit panel, or the
// note for the install. The contractor reads one plan instead of a list of
// findings, and the page turns each action into a click. Owner: "when it
// says fix, open it and offer the fixes… recommend what to click to make it
// pass… not so many fixes… make it super smart."
//
// Three groups come out of it, and the page lists them in that order:
//   fix      — the design is wrong until something changes here; the actions change it
//   measure  — a figure the engine is still waiting for; the actions open the field
//   code     — for the install or the permit desk, not the design: read, folded
// Pure: nothing here touches the model; the page runs the actions.
import type { BuildingModel, CatalogItem, CheckResult, EngineResult, SelectionCandidate } from "./types";
import type { JobKind } from "./jobs";
import { ratedCoolingBtuh } from "./select";

export type FixAction =
  /** Open the field (and set it when `value` is given). */
  | { kind: "field"; path: string; label: string; value?: unknown }
  /** Put this candidate on the estimate; null = back to the engine's pick. */
  | { kind: "pick"; candidateId: string | null; label: string }
  /** Switch the job. */
  | { kind: "job"; job: JobKind; label: string }
  /** Show the permit-grade report panel. */
  | { kind: "permit"; label: string }
  /** Already priced on the estimate — nothing to click. */
  | { kind: "ledger"; label: string }
  /** For the install or the inspector — nothing to click. */
  | { kind: "note"; label: string };

export type PlanGroup = "fix" | "measure" | "code";
export interface CheckPlan {
  group: PlanGroup;
  /** One line over the actions: what passing takes. */
  lead: string;
  actions: FixAction[];
}
export interface PlanContext { model: BuildingModel; engine: EngineResult; job: JobKind }

const cools = (i: CatalogItem) => i.kind === "heat-pump" || i.kind === "air-conditioner" || i.kind === "package" || i.kind === "ductless";
const name = (i: CatalogItem) => `${i.brand} ${i.model}`;
const tonsOf = (i: CatalogItem) => Math.round((ratedCoolingBtuh(i) / 12000) * 2) / 2;
const fits = (ctx: PlanContext) => ctx.engine.selection.candidates.filter((c) => !c.disqualified);
const chosenId = (ctx: PlanContext) => ctx.engine.selection.chosen?.item.id;

/** The biggest unit that fits Manual S and whose airflow the measured ducts carry. */
function unitForDucts(ctx: PlanContext): SelectionCandidate | undefined {
  const cap = ctx.engine.airflow?.capacityCfm;
  if (!cap) return undefined;
  const perTon = ctx.engine.load.cfmPerTon || 400;
  return fits(ctx)
    .filter((c) => cools(c.item) && c.item.id !== chosenId(ctx) && (ratedCoolingBtuh(c.item) / 12000) * perTon <= cap)
    .sort((a, b) => ratedCoolingBtuh(b.item) - ratedCoolingBtuh(a.item) || b.score - a.score)[0];
}
/** The best-scoring unit of a given nominal size that fits. */
function unitOfTons(ctx: PlanContext, tons: number): SelectionCandidate | undefined {
  return fits(ctx).filter((c) => cools(c.item) && c.item.id !== chosenId(ctx) && Math.abs(tonsOf(c.item) - tons) < 0.26).sort((a, b) => b.score - a.score)[0];
}
/** A fitting unit that asks less of the panel than the chosen one. */
function unitWithLowerMca(ctx: PlanContext): SelectionCandidate | undefined {
  const have = ctx.engine.selection.chosen?.item.mcaAmps;
  return fits(ctx).filter((c) => cools(c.item) && c.item.id !== chosenId(ctx) && c.item.mcaAmps && (!have || c.item.mcaAmps < have)).sort((a, b) => (a.item.mcaAmps ?? 99) - (b.item.mcaAmps ?? 99))[0];
}
/** The engine's own first choice when the estimate carries a hand pick. */
function enginesPick(ctx: PlanContext): SelectionCandidate | undefined {
  const sel = ctx.engine.selection;
  return sel.chosen?.overridden || sel.chosen?.item.typed ? sel.runnerUp ?? undefined : undefined;
}
const pickOf = (c: SelectionCandidate | undefined, why: string): FixAction[] => (c ? [{ kind: "pick", candidateId: c.item.id, label: `Pick the ${tonsOf(c.item)}-ton ${name(c.item)} — ${why}` }] : []);

const WORDS: Record<string, string> = {
  conditionedSqft: "square footage", storeys: "storeys", yearBuilt: "year built", ceilingHeightFt: "ceiling height", occupants: "occupants",
  "electrical.mainAmps": "main breaker", "existing.tons": "tons", "existing.btuInput": "furnace input",
};
const word = (path: string) => WORDS[path] ?? path.replace(/^existing\./, "").replace(/([A-Z])/g, " $1").toLowerCase();

/** The way to a pass for one check. */
export function planFor(c: CheckResult, ctx: PlanContext): CheckPlan {
  const sel = ctx.engine.selection;
  const chosen = sel.chosen;
  const note = (label: string): FixAction => ({ kind: "note", label });
  const field = (path: string, label: string, value?: unknown): FixAction => (value === undefined ? { kind: "field", path, label } : { kind: "field", path, label, value });
  const code = (lead: string, ...actions: FixAction[]): CheckPlan => ({ group: "code", lead, actions });
  if (c.status === "pass") return code("Passed.");

  switch (c.id) {
    case "static": {
      if (c.title === "Airflow not verified") return { group: "measure", lead: "One measurement settles it — any of these:", actions: [field("ducts.measuredTespInWc", "Type the static (in. w.c.)"), field("ducts.supplyTrunk", "Type the supply trunk size"), field("ducts.returnDuct", "Type the return duct size")] };
      if (c.status === "fix") return { group: "fix", lead: "The ducts will not pass this airflow — a smaller unit, or the duct work:", actions: [...pickOf(unitForDucts(ctx), "the ducts carry it"), { kind: "job", job: "ducts", label: "Price the return and trunk fix as a Ductwork job" }, field("ducts.returnGrilleSqIn", "Type the return grille to size the fix")] };
      if (/duct sizes say/.test(c.detail)) return { group: "measure", lead: "The sizes say it fits; a reading at start-up confirms it.", actions: [field("ducts.measuredTespInWc", "Type the static once it is read")] };
      return { group: "measure", lead: "Check the filter and the return, then read it again:", actions: [field("ducts.measuredTespInWc", "Re-type the static after the fix"), field("ducts.returnGrilleSqIn", "Type the return grille")] };
    }
    case "return":
      return c.status === "fix"
        ? { group: "fix", lead: "More return is on the estimate already:", actions: [{ kind: "ledger", label: "Return grille and duct upsize — priced" }, field("ducts.returnGrilleSqIn", "Re-measure the grille if it was a guess")] }
        : { group: "measure", lead: "Measure the grille — width × height in inches:", actions: [field("ducts.returnGrilleSqIn", "Type the return grille (W×H)")] };
    case "duct-size":
      return c.status === "fix"
        ? { group: "fix", lead: "Two ways to pass:", actions: [...pickOf(unitForDucts(ctx), "the ducts carry it as they are"), { kind: "ledger", label: "Or keep this size — the trunk / return upsize is priced on the estimate" }] }
        : { group: "measure", lead: "Tight, not short:", actions: [note("Set the blower to its high tap at start-up"), field("ducts.measuredTespInWc", "Type the static after install")] };
    case "duct-cond":
      return c.status === "fix"
        ? { group: "fix", lead: "Sealing is on the estimate already:", actions: [{ kind: "ledger", label: "Duct sealing — priced" }, field("ducts.condition", "Change the condition if the ducts are better than that")] }
        : { group: "measure", lead: "Look at the ducts and say what you saw:", actions: [field("ducts.condition", "Good", "good"), field("ducts.condition", "Fair", "fair"), field("ducts.condition", "Poor — add sealing", "poor")] };
    case "duct-ins":
      return { group: "fix", lead: "Insulate them, or say they are:", actions: [{ kind: "job", job: "ducts", label: "Price the insulation as a Ductwork job" }, field("ducts.insulated", "They are insulated after all", true)] };
    case "ducts-none":
      return { group: "fix", lead: "No ducts — pick the job that builds them or does without:", actions: [{ kind: "job", job: "ducts", label: "Price a duct system" }, { kind: "job", job: "ductless", label: "Make it ductless" }] };
    case "service": {
      if (c.status !== "fix") return { group: "measure", lead: "Photograph the panel or type what it says:", actions: [field("electrical.mainAmps", "Type the main breaker"), field("electrical.freeSlots", "Type the free slots")] };
      const lower = unitWithLowerMca(ctx);
      return { group: "fix", lead: "The panel is short for this unit:", actions: [...(lower ? [{ kind: "pick" as const, candidateId: lower.item.id, label: `Pick the ${name(lower.item)} — MCA ${lower.item.mcaAmps} A` }] : []), note("Or quote the service upgrade separately — it is not in these lines"), field("electrical.mainAmps", "Re-check the main breaker")] };
    }
    case "gas":
      return c.status === "fix"
        ? { group: "fix", lead: "The branch cannot carry it:", actions: [note("Run a larger branch — gas pipe is priced per foot on the estimate"), field("gas.pipeIn", "Type the new pipe size")] }
        : { group: "measure", lead: "Read the pipe at the appliance and pace the run:", actions: [field("gas.pipeIn", "Pick the pipe size"), field("gas.longestRunFt", "Type the run length")] };
    case "efficiency": {
      if (c.status === "fix") {
        const back = enginesPick(ctx);
        const alt = back ?? fits(ctx).filter((x) => cools(x.item) && x.item.id !== chosenId(ctx))[0];
        return { group: "fix", lead: "A unit that meets the floor:", actions: alt ? [{ kind: "pick", candidateId: back ? null : alt.item.id, label: back ? `Back to the engine's pick — ${name(back.item)}` : `Pick the ${name(alt.item)} (${alt.item.seer2 ?? "?"} SEER2)` }] : [note("Import a unit that meets the regional floor")] };
      }
      return code("The rating is not on the row — confirm it before ordering:", note("Read SEER2 / EER2 / HSPF2 off the AHRI certificate and add them to the catalog row"));
    }
    case "refrigerant": {
      if (c.status === "fix") {
        const alt = fits(ctx).filter((x) => cools(x.item) && x.item.id !== chosenId(ctx))[0];
        return { group: "fix", lead: "A unit on an allowed refrigerant:", actions: alt ? [{ kind: "pick", candidateId: alt.item.id, label: `Pick the ${name(alt.item)} (${alt.item.refrigerant})` }] : [note("Import an R-454B or R-32 unit")] };
      }
      if (/not identified/i.test(c.title)) return { group: "measure", lead: "Read it off the outdoor unit's plate:", actions: [field("existing.refrigerant", "Set the refrigerant")] };
      return code("For the install:", note(c.detail));
    }
    case "sizing": {
      if (/kept up$/i.test(c.title)) {
        const old = ctx.model.existing.tons ?? 0;
        return { group: "measure", lead: "Recheck the inputs before upsizing — or size it as the house says:", actions: [field("wallInsulation", "Wall insulation"), field("ceilingInsulation", "Attic insulation"), field("windowType", "Windows"), field("tightness", "Tightness"), ...pickOf(unitOfTons(ctx, old), "the size that kept up")] };
      }
      return { group: "measure", lead: "Before matching the old size, rule out the usual causes:", actions: [note("Confirm the charge and the coil were not the trouble"), field("ducts.condition", "Say what the ducts looked like")] };
    }
    case "code": {
      if (c.title === "Unit chosen by hand") { const back = sel.runnerUp; return { group: "fix", lead: "The engine's pick passes:", actions: [{ kind: "pick", candidateId: null, label: back ? `Back to the engine's pick — ${name(back.item)}` : "Back to the engine's pick" }] }; }
      if (c.title === "Unit typed in") return code("Before ordering:", note("Confirm the model number and the ratings against the submittal, and add the cost so the price is not a rate-card default"));
      if (c.title === "Already has cooling") return { group: "fix", lead: "Price it as the job it is:", actions: [{ kind: "job", job: "replace-outdoor", label: "Replace the outdoor unit" }, { kind: "job", job: "replace-system", label: "Replace the whole system" }] };
      if (c.title === "Record vs walk") return { group: "measure", lead: "Type the right figure and the question goes away:", actions: (ctx.model.conflicts ?? []).map((k) => field(k.path, `Type the ${word(k.path)} (record ${k.kept}, walk ${k.walk})`)) };
      if (c.title === "Furnace fit") return code("Said so the inspector hears it from you first:", note(c.detail));
      return code("For the install:", note(c.detail));
    }
  }

  // Code flags and the fuel checks, by id.
  if (c.id === "wa-manual-s" || c.id === "ny-manual-js") return { group: "fix", lead: "The permit office wants the approved calculation attached; the design card already carries the load and the Manual S fit:", actions: [{ kind: "permit", label: "Attach the ACCA-approved Manual J report" }] };
  if (c.id === "wa-hp-lockout") {
    const bp = chosen?.balancePointF;
    return { group: "fix", lead: "A thermostat that locks the strips out above the balance point:", actions: [note(`Choose a heat-pump thermostat with aux-heat lockout for the thermostat line${bp ? `, and set the lockout at ${bp} °F` : ""}`)] };
  }
  if (c.id === "wa-estar-tstat") return { group: "fix", lead: "The thermostat line must be an ENERGY STAR model:", actions: [note("Pick an ENERGY STAR thermostat for the thermostat line on the estimate")] };
  if (c.id === "ca-uln-furnace") {
    const uln = fits(ctx).filter((x) => x.item.kind === "furnace" && (x.item.noxNgJ ?? 40) <= 14 && x.item.id !== chosenId(ctx))[0];
    return { group: "fix", lead: "The air district takes only a 14 ng/J furnace:", actions: uln ? [{ kind: "pick", candidateId: uln.item.id, label: `Pick the ${name(uln.item)} — ultra-low NOx` }] : [note("Order the ultra-low-NOx build of the furnace (Lennox NV/NE, Carrier 59SU5/59CU5, Goodman -U)")] };
  }
  if (c.id === "fl-seer2-install") {
    const eff = ctx.engine.checks.find((x) => x.id === "efficiency");
    if (chosen && eff?.status === "pass") return code(`Met: the ${name(chosen.item)} is ${chosen.item.seer2 ?? "?"} SEER2.`);
    return code("Met when the unit clears the efficiency floor above — fix that one and this passes with it.");
  }
  if (c.id === "wa-hfc-750" || c.id === "ca-carb-gwp") {
    const r = chosen?.item.refrigerant;
    const under = r === "R-454B" || r === "R-32";
    return under ? code(`Met: ${r} is under the 750 GWP cap.`) : code("For the install:", note(c.detail));
  }
  // Everything else on the flags and the fuel checks is for the install or
  // the permit desk — read, not clicked.
  return code(c.status === "fix" ? "On the job, not on the design:" : "For the install or the permit:", note(c.detail));
}

/** The few clicks that take the estimate to a pass, in order: the fixes
 *  first, then the measurements; one entry per field, unit or job. */
/** What to ask for first: the airflow question before the grille that is
 *  part of it, the unit before the panel, the house before the paperwork. */
const ORDER = ["static", "duct-size", "efficiency", "refrigerant", "ducts-none", "service", "gas", "return", "duct-cond", "duct-ins", "sizing", "code"];
const rank = (c: CheckResult) => { const i = ORDER.indexOf(c.id); return i < 0 ? ORDER.length : i; };

export function nextSteps(checks: CheckResult[], ctx: PlanContext, max = 4): FixAction[] {
  const out: FixAction[] = [];
  const seen = new Set<string>();
  const key = (a: FixAction) => (a.kind === "field" ? `field:${a.path}` : a.kind === "pick" ? `pick:${a.candidateId ?? "engine"}` : a.kind === "job" ? `job:${a.job}` : a.kind === "permit" ? "permit" : "");
  const ordered = [...checks].sort((a, b) => rank(a) - rank(b));
  for (const group of ["fix", "measure"] as const) {
    for (const c of ordered) {
      if (c.status === "pass") continue;
      const plan = planFor(c, ctx);
      if (plan.group !== group) continue;
      for (const a of plan.actions) {
        const k = key(a);
        if (!k || seen.has(k)) continue;
        // A field with a preset value is one of several choices: the strip offers the field, not a choice.
        const action: FixAction = a.kind === "field" && a.value !== undefined ? { kind: "field", path: a.path, label: `Set the ${word(a.path)}` } : a;
        seen.add(k);
        out.push(action);
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

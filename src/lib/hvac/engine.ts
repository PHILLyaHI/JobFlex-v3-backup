// The one call the page makes: building model in, everything the design card
// shows out. Pure and synchronous, so the same inputs give the same answer on
// the server, in the browser and in scripts/qa/hvac-engine.check.ts.

import type { BuildingModel, CatalogItem, DesignConditions, EngineResult } from "./types";
import { computeBlockLoad, ENGINE_VERSION } from "./load";
import { selectSystem } from "./select";
import { allChecks, defaultedFields } from "./checks";
import { designConditionsFor } from "./designConditions";
import { incentivesFor } from "./data/rules";
import { DEFAULTS_SOURCE } from "./data/defaults";

export interface RunEngineOptions {
  /** Pre-resolved conditions (the server resolves the county once). */
  conditions?: DesignConditions;
  catalog: CatalogItem[];
}

const FIELD_WORDS: Record<string, string> = {
  conditionedSqft: "conditioned area",
  storeys: "storeys",
  ceilingHeightFt: "ceiling height",
  yearBuilt: "year built",
  windowToFloor: "window area",
  windowType: "window type",
  wallInsulation: "wall insulation",
  ceilingInsulation: "attic insulation",
  foundation: "foundation",
  tightness: "air tightness",
  roofColor: "roof colour",
  shading: "shading",
  occupants: "occupants",
  "ducts.location": "duct location",
  "ducts.condition": "duct condition",
};

export function runEngine(model: BuildingModel, opts: RunEngineOptions): EngineResult {
  const conditions = opts.conditions ?? designConditionsFor(model.state, model.county, model.elevationFt ?? 0).conditions;
  const load = computeBlockLoad(model, conditions);
  const selection = selectSystem(opts.catalog, load, conditions, model);
  const checks = allChecks(load, conditions, model, selection.chosen);

  const notes: EngineResult["notes"] = [];
  for (const a of load.assumptions) notes.push({ kind: "assumption", text: a });
  const defaulted = defaultedFields(model).map((f) => FIELD_WORDS[f] ?? f);
  if (defaulted.length) {
    notes.push({
      kind: "assumption",
      text: `Taken from the era table (${DEFAULTS_SOURCE}) until confirmed on site: ${defaulted.join(", ")}.`,
    });
  }
  for (const c of checks) {
    if (c.status !== "pass") notes.push({ kind: "code", text: `${c.title}: ${c.detail}` });
  }
  for (const r of incentivesFor(model.state)) {
    notes.push({ kind: "incentive", text: `${r.program} — ${r.status}${r.amount ? `, ${r.amount}` : ""}: ${r.text} (verified ${r.verifiedOn})` });
  }
  if (selection.chosen) {
    if (selection.systems > 1) notes.push({ kind: "contractor", text: `${selection.systems} systems: the ${load.coolingTotalBtuh.toLocaleString("en-US")} BTU/h load is more than one residential unit carries, so the house is zoned into ${selection.systems} and each zone gets its own system.` });
    notes.push({ kind: "contractor", text: `Chosen: ${selection.systems > 1 ? `${selection.systems} × ` : ""}${selection.chosen.item.brand} ${selection.chosen.item.model} — ${selection.chosen.reasons.join(" ")}` });
    if (selection.runnerUp) {
      notes.push({ kind: "contractor", text: `Runner-up: ${selection.runnerUp.item.brand} ${selection.runnerUp.item.model} — ${selection.runnerUp.reasons[0] ?? ""}` });
    }
  } else {
    notes.push({ kind: "contractor", text: `No catalog unit fits the ${load.coolingTotalBtuh.toLocaleString("en-US")} BTU/h cooling load within Manual S limits; a ${selection.targetTons}-ton system is the target.` });
  }

  return { conditions, load, selection, checks, notes, engineVersion: ENGINE_VERSION };
}

// The one call the page makes: building model in, everything the design card
// shows out. Pure and synchronous, so the same inputs give the same answer on
// the server, in the browser and in scripts/qa/hvac-engine.check.ts.

import type { BuildingModel, CatalogItem, DesignConditions, EngineResult } from "./types";
import { DEFAULT_JOB, jobDef, type JobInput, type JobKind } from "./jobs";
import { waterHeaterChecks, waterHeaterPlan } from "./waterHeater";
import { fuelChecks } from "./checks";
import { keepsGas } from "./ledger";
import { refrigerantRule } from "./data/rules";
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
  /** What the contractor is pricing (default: the full system). */
  job?: JobKind;
  input?: JobInput;
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
  const job = jobDef(opts.job ?? DEFAULT_JOB);
  const conditions = opts.conditions ?? designConditionsFor(model.state, model.county, model.elevationFt ?? 0).conditions;
  // A ductless zone is loaded on its own area, one storey, the house's envelope.
  const zoneSqft = job.id === "ductless" ? Math.max(100, Math.round(opts.input?.zoneSqft ?? 0)) : 0;
  // A mini-split has no ducts: the zone is loaded without the house's duct losses.
  const loadModel = zoneSqft ? { ...model, conditionedSqft: zoneSqft, storeys: 1, ducts: { location: "none" as const, condition: "good" as const }, perimeterFt: undefined, footprintEdges: undefined } : model;
  const load = computeBlockLoad(loadModel, conditions);
  // A package-unit house gets a package unit on a full replacement; with no
  // package rows in the catalog the ledger prices one from the rate card.
  const kinds = job.id === "replace-system" && model.existing.kind === "package-unit" ? (["package"] as const).slice() : job.kinds;
  const dualFuel = job.id === "heat-pump-conversion" && keepsGas(model);
  const selection = job.selection === "none"
    ? { chosen: null, runnerUp: null, candidates: [], targetTons: Math.max(1.5, Math.round((load.coolingTotalBtuh / 12000) * 2) / 2), systems: 1 }
    : selectSystem(opts.catalog, load, conditions, model, { kinds, wantsHeatPump: job.id === "heat-pump-conversion" });
  const waterHeater = job.id === "water-heater" ? waterHeaterPlan(model, opts.input?.wh) : undefined;
  const wanted = new Set<string>(job.checks);
  const chosenItem = selection.chosen?.item;
  const gasFurnace = job.id === "replace-furnace" || (job.id === "replace-system" && chosenItem?.kind === "air-conditioner" && keepsGas(model));
  const a2lOnExisting = !!chosenItem && (chosenItem.refrigerant === "R-454B" || chosenItem.refrigerant === "R-32") && (job.id === "add-ac" || dualFuel || (job.id === "replace-outdoor" && model.existing.refrigerant !== chosenItem.refrigerant));
  const checks = waterHeater
    ? [...waterHeaterChecks(model, waterHeater), ...fuelChecks(model, { gasFurnace: false, gasWaterHeater: waterHeater.fuel !== "electric" && waterHeater.type !== "heat-pump", whVent: waterHeater.vent, whLocation: waterHeater.location, furnaceReplaced: false, a2lCoilOnExistingFurnace: false })]
    : job.selection === "none"
      ? [...(model.existing.refrigerant && wanted.has("refrigerant") ? [(() => { const rr = refrigerantRule(model.state, model.existing.refrigerant); return { id: "refrigerant", title: `Refrigerant · ${model.existing.refrigerant}`, status: rr.status, detail: rr.text, rule: rr.source }; })()] : []), ...allChecks(load, conditions, model, null).filter((c) => wanted.has(c.id))]
      : [...allChecks(load, conditions, model, selection.chosen, { dualFuel }).filter((c) => wanted.has(c.id) || (c.id === "code" && wanted.has("code")) || (!["return", "static", "duct-cond", "duct-ins", "ducts-none", "service", "gas", "refrigerant", "efficiency"].includes(c.id) && wanted.has("code"))), ...fuelChecks(model, { gasFurnace, gasWaterHeater: false, furnaceReplaced: gasFurnace, a2lCoilOnExistingFurnace: a2lOnExisting })];

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
  if (job.selection === "none") {
    // Nothing to pick: the notes say what the job is priced on.
    notes.push({ kind: "contractor", text: waterHeater ? `Water heater: ${waterHeater.gallons ? `${waterHeater.gallons} gal ` : ""}${waterHeater.type === "heat-pump" ? "heat-pump" : waterHeater.type} on ${waterHeater.fuel} — ${waterHeater.sizedFrom}.` : job.id === "ducts" ? `Ductwork on the existing system — ${load.coolingCfm.toLocaleString("en-US")} CFM design airflow.` : "Service call — priced by the task." });
  } else if (selection.chosen) {
    if (selection.systems > 1) notes.push({ kind: "contractor", text: `${selection.systems} systems: the ${load.coolingTotalBtuh.toLocaleString("en-US")} BTU/h load is more than one residential unit carries, so the house is zoned into ${selection.systems} and each zone gets its own system.` });
    notes.push({ kind: "contractor", text: `Chosen: ${selection.systems > 1 ? `${selection.systems} × ` : ""}${selection.chosen.item.brand} ${selection.chosen.item.model} — ${selection.chosen.reasons.join(" ")}` });
    if (selection.runnerUp) {
      notes.push({ kind: "contractor", text: `Runner-up: ${selection.runnerUp.item.brand} ${selection.runnerUp.item.model} — ${selection.runnerUp.reasons[0] ?? ""}` });
    }
  } else {
    notes.push({ kind: "contractor", text: `No catalog unit fits the ${load.coolingTotalBtuh.toLocaleString("en-US")} BTU/h cooling load within Manual S limits; a ${selection.targetTons}-ton system is the target.` });
  }

  return { job: job.id, waterHeater, zone: zoneSqft ? { sqft: zoneSqft, heads: Math.max(1, Math.round(opts.input?.heads ?? 1)) } : undefined, conditions, load, selection, checks, notes, engineVersion: ENGINE_VERSION };
}

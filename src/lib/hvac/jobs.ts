// What the contractor is here to price. The job is picked first and shapes
// everything after it: which facts the intake asks for, what the engine
// selects, which checks run, and which lines the ledger writes. One registry,
// read by the engine, the ledger and the page.

import type { EquipmentKind } from "./types";

export type JobKind =
  | "replace-system"
  | "replace-outdoor"
  | "replace-furnace"
  | "add-ac"
  | "heat-pump-conversion"
  | "ductless"
  | "water-heater"
  | "ducts"
  | "service";

export type CheckId = "return" | "static" | "duct-cond" | "duct-ins" | "ducts-none" | "service" | "gas" | "refrigerant" | "efficiency" | "code";

export interface JobDef {
  id: JobKind;
  title: string;
  /** One line under the title, in the contractor's words. */
  sub: string;
  /** The intake sections that matter for this job. */
  needs: { load: boolean; existing: boolean; electrical: boolean; ducts: boolean; gas: boolean; zone: boolean; waterHeater: boolean };
  /** What the engine picks from the catalog. */
  selection: "system" | "outdoor" | "furnace" | "cooling-add" | "heat-pump" | "ductless" | "none";
  /** Catalog kinds the selection may choose from (empty = none). */
  kinds: EquipmentKind[];
  /** Checks that apply. */
  checks: CheckId[];
  /** Video shots that matter most, by shot number in filming-guide.ts. */
  shots: number[];
}

export const JOBS: JobDef[] = [
  {
    id: "replace-system",
    title: "Full system",
    sub: "Replace heating and cooling together — AC + furnace, or a heat pump",
    needs: { load: true, existing: true, electrical: true, ducts: true, gas: true, zone: false, waterHeater: false },
    selection: "system",
    kinds: ["air-conditioner", "heat-pump", "package"],
    checks: ["return", "static", "duct-cond", "duct-ins", "ducts-none", "service", "gas", "refrigerant", "efficiency", "code"],
    shots: [1, 2, 3, 4, 5, 6, 7],
  },
  {
    id: "replace-outdoor",
    title: "Outdoor unit",
    sub: "Replace the condenser or heat pump, keep the indoor unit",
    needs: { load: true, existing: true, electrical: true, ducts: false, gas: false, zone: false, waterHeater: false },
    selection: "outdoor",
    kinds: ["air-conditioner", "heat-pump"],
    checks: ["service", "refrigerant", "efficiency", "code", "static"],
    shots: [1, 2, 3, 6],
  },
  {
    id: "replace-furnace",
    title: "Furnace",
    sub: "Replace the furnace, keep the cooling",
    needs: { load: true, existing: true, electrical: false, ducts: true, gas: true, zone: false, waterHeater: false },
    selection: "furnace",
    kinds: ["furnace"],
    checks: ["return", "static", "duct-cond", "gas", "code"],
    shots: [2, 4, 5, 6],
  },
  {
    id: "add-ac",
    title: "Add cooling",
    sub: "Add AC to a house that only has a furnace",
    needs: { load: true, existing: true, electrical: true, ducts: true, gas: false, zone: false, waterHeater: false },
    selection: "cooling-add",
    kinds: ["air-conditioner"],
    checks: ["return", "static", "duct-cond", "service", "refrigerant", "efficiency", "code"],
    shots: [2, 3, 4, 6],
  },
  {
    id: "heat-pump-conversion",
    title: "Heat pump",
    sub: "Convert to a heat pump — dual fuel with the furnace, or all-electric",
    needs: { load: true, existing: true, electrical: true, ducts: true, gas: true, zone: false, waterHeater: false },
    selection: "heat-pump",
    kinds: ["heat-pump"],
    checks: ["return", "static", "duct-cond", "duct-ins", "service", "refrigerant", "efficiency", "code"],
    shots: [1, 2, 3, 4, 6, 7],
  },
  {
    id: "ductless",
    title: "Ductless zone",
    sub: "A mini-split for a room, an addition or a garage",
    needs: { load: true, existing: false, electrical: true, ducts: false, gas: false, zone: true, waterHeater: false },
    selection: "ductless",
    kinds: ["ductless"],
    checks: ["service", "refrigerant", "efficiency", "code"],
    shots: [3, 6, 7],
  },
  {
    id: "water-heater",
    title: "Water heater",
    sub: "Replace a gas or electric tank, or go to a heat-pump water heater",
    needs: { load: false, existing: false, electrical: true, ducts: false, gas: true, zone: false, waterHeater: true },
    selection: "none",
    kinds: [],
    checks: ["gas", "service"],
    shots: [3, 5],
  },
  {
    id: "ducts",
    title: "Ductwork",
    sub: "Seal, repair or replace the ducts and returns",
    needs: { load: true, existing: false, electrical: false, ducts: true, gas: false, zone: false, waterHeater: false },
    selection: "none",
    kinds: [],
    checks: ["return", "static", "duct-cond", "duct-ins", "ducts-none"],
    shots: [4, 6],
  },
  {
    id: "service",
    title: "Service / repair",
    sub: "Diagnose, recharge, replace a part — priced by the task",
    needs: { load: false, existing: true, electrical: false, ducts: false, gas: false, zone: false, waterHeater: false },
    selection: "none",
    kinds: [],
    checks: ["refrigerant"],
    shots: [1, 2, 7],
  },
];

export const DEFAULT_JOB: JobKind = "replace-system";

export function jobDef(id: JobKind | string | undefined | null): JobDef {
  return JOBS.find((j) => j.id === id) ?? JOBS[0];
}

/** The contractor's answers that only some jobs need. */
export interface JobInput {
  /** Ductless: the zone the heads serve. */
  zoneSqft?: number;
  heads?: number;
  /** Water heater. */
  wh?: {
    /** What is there now — decides whether a circuit or a gas line exists. */
    existingFuel?: "gas" | "electric" | "propane";
    fuel?: "gas" | "electric" | "propane";
    type?: "tank" | "heat-pump" | "tankless";
    gallons?: number;
    vent?: "atmospheric" | "power" | "direct" | "none";
    location?: "garage" | "closet" | "basement" | "utility" | "attic" | "outdoor";
  };
  /** Ductwork: what is on the system. */
  supplyRegisters?: number;
  /** Service: what the visit is. */
  service?: { refrigerantLb?: number; parts?: Array<{ name: string; cost: number }>; task?: string };
}

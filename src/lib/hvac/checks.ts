// Field checks — the pure arithmetic a contractor does in his head and the
// customer never sees done. Each answers pass / fix / verify with one plain
// sentence, so the ledger can price the fix and the proposal can name it.

import type { BuildingModel, CatalogItem, CheckResult, DesignConditions, LoadResult, SelectionCandidate } from "./types";
import { CODE_FLAGS, efficiencyFloor, refrigerantRule } from "./data/rules";
import { ratedCoolingBtuh } from "./select";

/** Return grille free area the airflow needs: 200 sq in per nominal ton. */
export const RETURN_SQIN_PER_TON = 200;
/** Design external static most residential air handlers are rated at. */
export const DEFAULT_RATED_STATIC = 0.5;

export function ductChecks(load: LoadResult, m: BuildingModel, chosen: SelectionCandidate | null): CheckResult[] {
  const out: CheckResult[] = [];
  // A furnace has no cooling rating: the airflow it must move is the load's.
  const cap = chosen ? ratedCoolingBtuh(chosen.item) : 0;
  const tons = Math.round(((cap > 0 ? cap : load.coolingTotalBtuh) / 12000) * 2) / 2;
  const targetCfm = Math.round(tons * load.cfmPerTon / 10) * 10;
  if (m.ducts.location === "none") {
    out.push({ id: "ducts-none", title: "Ductwork", status: "fix", detail: "No ducts: the job carries a full duct system, or a ductless design.", rule: "Manual D" });
    return out;
  }
  // Return air.
  const needSqIn = Math.round(tons * RETURN_SQIN_PER_TON);
  if (typeof m.ducts.returnGrilleSqIn === "number") {
    const have = m.ducts.returnGrilleSqIn;
    out.push(
      have >= needSqIn
        ? { id: "return", title: "Return air", status: "pass", detail: `${have} sq in of return grille carries the ${targetCfm} CFM the system needs (${needSqIn} sq in wanted).`, rule: `${RETURN_SQIN_PER_TON} sq in per ton` }
        : { id: "return", title: "Return air", status: "fix", detail: `${have} sq in of return grille is short of the ${needSqIn} sq in a ${tons}-ton system wants; add return.`, rule: `${RETURN_SQIN_PER_TON} sq in per ton` },
    );
  } else {
    out.push({ id: "return", title: "Return air", status: "verify", detail: `Measure the return grille: a ${tons}-ton system wants about ${needSqIn} sq in of free area for ${targetCfm} CFM.`, rule: `${RETURN_SQIN_PER_TON} sq in per ton` });
  }
  // Static pressure.
  const rated = chosen?.item.ratedStaticInWc ?? DEFAULT_RATED_STATIC;
  if (typeof m.ducts.measuredTespInWc === "number") {
    const tesp = m.ducts.measuredTespInWc;
    if (tesp <= rated) out.push({ id: "static", title: "Static pressure", status: "pass", detail: `Measured ${tesp.toFixed(2)} in. w.c. is within the ${rated.toFixed(2)} in. w.c. the equipment is rated for.`, rule: "TESP vs rated static" });
    else if (tesp <= rated * 1.3) out.push({ id: "static", title: "Static pressure", status: "verify", detail: `Measured ${tesp.toFixed(2)} in. w.c. is above the ${rated.toFixed(2)} rating: check the filter and the return before the new blower is asked to push it.`, rule: "TESP vs rated static" });
    else out.push({ id: "static", title: "Static pressure", status: "fix", detail: `Measured ${tesp.toFixed(2)} in. w.c. is far above the ${rated.toFixed(2)} rating: the ducts will not carry the ${chosen ? "new system's" : "system's"} airflow without a return and trunk fix.`, rule: "TESP vs rated static" });
  } else {
    out.push({ id: "static", title: "Static pressure", status: "verify", detail: chosen ? "Measure total external static on the existing system before install; the new blower needs the ducts to pass its airflow." : "Measure total external static on the system; the blower is rated for 0.50 in. w.c. and the ducts must let it breathe.", rule: "TESP vs rated static" });
  }
  // Condition and insulation.
  if (m.ducts.condition === "poor") out.push({ id: "duct-cond", title: "Duct condition", status: "fix", detail: "Ducts read poor: seal or replace, then test leakage.", rule: "duct leakage" });
  else if (m.ducts.condition === "fair" || m.ducts.condition === "unknown") out.push({ id: "duct-cond", title: "Duct condition", status: "verify", detail: "Test duct leakage; seal if over 15%.", rule: "duct leakage" });
  else out.push({ id: "duct-cond", title: "Duct condition", status: "pass", detail: "Ducts read good; a leakage test confirms it.", rule: "duct leakage" });
  if ((m.ducts.location === "attic" || m.ducts.location === "crawl") && m.ducts.insulated === false) {
    out.push({ id: "duct-ins", title: "Duct insulation", status: "fix", detail: `Uninsulated ducts in the ${m.ducts.location}: insulate to R-8 (attic) or the code minimum.`, rule: "IECC R403.3" });
  }
  return out;
}

/**
 * NEC 220.83(B): can the existing service take the new HVAC load?
 * General loads at 100% of the first 8 kVA and 40% of the rest, the new
 * heating or cooling load at 100%, against the service rating.
 */
export function electricalCheck(m: BuildingModel, chosen: SelectionCandidate | null, opts: { dualFuel?: boolean; reusesCircuit?: boolean } = {}): CheckResult {
  const e = m.electrical;
  if (typeof e.mainAmps !== "number" || e.mainAmps <= 0) {
    return { id: "service", title: "Electrical service", status: "verify", detail: "Photograph the panel: main breaker size and free slots decide whether the new system needs a circuit, a subpanel or a service upgrade.", rule: "NEC 220.83" };
  }
  const general = 3 * m.conditionedSqft + 1500 * 2 + 1500 + (e.electricRange ? 8000 : 0) + (e.electricDryer ? 5000 : 0) + (e.electricWaterHeater ? 4500 : 0) + (e.evCharger ? 7200 : 0);
  const generalDemand = Math.min(general, 8000) + Math.max(0, general - 8000) * 0.4;
  let hvacVa = 0;
  if (chosen) {
    const it = chosen.item;
    const outdoorVa = it.mcaAmps ? it.mcaAmps * 240 : (ratedCoolingBtuh(it) / 12000) * 1600;
    // Dual fuel: the furnace is the backup, no strips on the count.
    const strips = it.kind === "heat-pump" && !opts.dualFuel ? Math.ceil((chosen.backupKw ?? 0) / 5) * 5 * 1000 : 0;
    hvacVa = Math.max(outdoorVa + 500, strips + 500 + (it.kind === "heat-pump" ? 0 : 0)); // heating vs cooling, whichever is larger
    if (it.kind === "heat-pump") hvacVa = Math.max(outdoorVa + 500, outdoorVa + strips + 500);
  } else {
    hvacVa = (Math.max(1.5, m.conditionedSqft / 700) * 1600) + 500;
  }
  const amps = (generalDemand + hvacVa) / 240;
  const cap = e.mainAmps;
  const share = amps / cap;
  const base = `${Math.round(amps)} A calculated against a ${cap} A service`;
  if (share > 1) return { id: "service", title: "Electrical service", status: "fix", detail: `${base}: the new system needs a service upgrade or load management. Price it as an optional line with a warning.`, rule: "NEC 220.83(B)" };
  if (share > 0.9) return { id: "service", title: "Electrical service", status: "verify", detail: `${base}: tight. A licensed electrician's load calculation should confirm before the panel is touched.`, rule: "NEC 220.83(B)" };
  const slots = typeof e.freeSlots === "number" ? e.freeSlots : null;
  if (!opts.reusesCircuit && slots !== null && slots < 2 && !(e.existingHvacAmps && e.existingHvacAmps > 0)) {
    return { id: "service", title: "Electrical service", status: "verify", detail: `${base}: capacity is fine, but only ${slots} free slot(s) — plan a tandem breaker or a small subpanel.`, rule: "NEC 220.83(B)" };
  }
  return { id: "service", title: "Electrical service", status: "pass", detail: `${base}: fits.`, rule: "NEC 220.83(B)" };
}

/** Longest-run capacity of low-pressure gas pipe, kBTU/h (0.5 in. w.c. drop). */
const GAS_TABLE: Record<string, Array<[number, number]>> = {
  "0.5": [[10, 172], [20, 118], [40, 81], [60, 66], [100, 50]],
  "0.75": [[10, 360], [20, 247], [40, 170], [60, 138], [100, 105]],
  "1": [[10, 678], [20, 466], [40, 320], [60, 260], [100, 199]],
};

/** The gas line against the appliance being set PLUS what else hangs on it.
 *  `otherLoadBtuh` is the rest of the house (the furnace when a water heater
 *  is set, the water heater when a furnace is); when nothing is known a gas
 *  house is assumed to carry a 40k water heater alongside a furnace. */
export function gasCheck(m: BuildingModel, chosen: CatalogItem | null, opts: { appliance?: string; otherLoadBtuh?: number } = {}): CheckResult | null {
  if (!chosen || chosen.kind !== "furnace") return null;
  const who = opts.appliance ?? "the furnace";
  if (!m.gas.available) return { id: "gas", title: "Gas supply", status: "fix", detail: `No gas at the property: ${who} needs a gas service, or the job goes electric.`, rule: "" };
  const input = chosen.btuInput ?? 0;
  const other = opts.otherLoadBtuh ?? (who === "the furnace" ? 40_000 : 0);
  const totalK = Math.round((input + other) / 1000);
  const size = typeof m.gas.pipeIn === "number" ? String(m.gas.pipeIn) : null;
  const run = m.gas.longestRunFt;
  if (!size || !GAS_TABLE[size] || typeof run !== "number") {
    return { id: "gas", title: "Gas supply", status: "verify", detail: `Confirm the pipe size and run length can carry ${Math.round(input / 1000)} kBTU/h for ${who}${other ? ` plus ${Math.round(other / 1000)} for the other appliances (${totalK} total)` : ""}.`, rule: "NFPA 54 pipe sizing" };
  }
  const row = GAS_TABLE[size].find(([ft]) => ft >= run) ?? GAS_TABLE[size][GAS_TABLE[size].length - 1];
  const capK = row[1];
  const others = other ? ` plus ${Math.round(other / 1000)} for the other appliances (${totalK} total)` : "";
  if (totalK <= capK * 0.85) return { id: "gas", title: "Gas supply", status: "pass", detail: `${size}" pipe over ${run} ft carries ${capK} kBTU/h; ${who} draws ${Math.round(input / 1000)}${others}.`, rule: "NFPA 54 pipe sizing" };
  if (totalK <= capK) return { id: "gas", title: "Gas supply", status: "verify", detail: `${size}" pipe over ${run} ft carries ${capK} kBTU/h and ${who} draws ${Math.round(input / 1000)}${others}: no margin. Confirm the load on the branch.`, rule: "NFPA 54 pipe sizing" };
  return { id: "gas", title: "Gas supply", status: "fix", detail: `${size}" pipe over ${run} ft carries ${capK} kBTU/h; ${who} draws ${Math.round(input / 1000)}${others}. Upsize the branch.`, rule: "NFPA 54 pipe sizing" };
}

/** Fuel-burning appliance items an inspector asks about on a permit. */
export function fuelChecks(m: BuildingModel, o: { gasFurnace: boolean; gasWaterHeater: boolean; whVent?: string; whLocation?: string; furnaceReplaced: boolean; a2lCoilOnExistingFurnace: boolean; furnaceMaxTonsUnknown?: { tons: number; cfm: number }; furnaceBlowerShort?: { tons: number; cfm: number; btuInput: number; blowerTons: number }; indoorWord?: "furnace" | "air handler" }): CheckResult[] {
  const w = o.indoorWord ?? "furnace";
  const W = w === "furnace" ? "Furnace" : "Air-handler";
  const out: CheckResult[] = [];
  if (o.gasFurnace || o.gasWaterHeater) out.push({ id: "code", title: "CO alarm", status: "verify", detail: "A permit for fuel-fired appliance work in an existing home requires a carbon-monoxide alarm outside each sleeping area — confirm one is there or add it (priced as a line).", rule: "IRC R315.2.2" });
  if ((o.gasWaterHeater && o.whVent === "atmospheric" && (o.whLocation === "closet" || o.whLocation === "utility")) || (o.gasFurnace && m.tightness === "very-tight")) out.push({ id: "code", title: "Combustion air", status: "verify", detail: "An atmospheric appliance in a closet or a very tight house needs combustion-air openings (two, 1 sq in per 1,000 BTU/h each) or a sealed-combustion unit.", rule: "NFPA 54 §9.3" });
  if (o.gasWaterHeater && o.whLocation === "garage") out.push({ id: "code", title: "Garage water heater", status: "verify", detail: "In a garage the burner sits 18 in above the floor and the tank is protected from vehicle impact — a FVIR tank on a stand, or a bollard.", rule: "IRC G2408.2 / M1307.3" });
  if (o.furnaceReplaced && m.gas.available !== false) out.push({ id: "code", title: "Water-heater vent", status: "verify", detail: "If the old furnace shared a chimney with the water heater, the water heater is now alone on a flue sized for both — it needs a liner or its own vent (an orphaned water heater).", rule: "NFPA 54 §12 / IRC G2427" });
  if (o.a2lCoilOnExistingFurnace) out.push({ id: "code", title: `A2L coil on the existing ${w}`, status: "verify", detail: `An R-454B / R-32 coil on a ${w} not listed for A2L needs the maker's refrigerant-detection sensor and mitigation board (priced as a line); confirm the ${w} is on the coil maker's approved list.`, rule: "UL 60335-2-40 / EPA AIM" });
  if (o.furnaceBlowerShort) out.push({ id: "code", title: `${W} blower airflow`, status: "fix", detail: `The ${o.furnaceBlowerShort.tons}-ton coil needs about ${o.furnaceBlowerShort.cfm.toLocaleString("en-US")} CFM at 0.5 in. w.c.; a ${Math.round(o.furnaceBlowerShort.btuInput / 1000)}k BTU furnace blower carries about ${o.furnaceBlowerShort.blowerTons} t. Confirm the blower's CFM from its data plate, replace the furnace, or size the coil down.`, rule: "Manual S · the furnace's blower table" });
  else if (o.furnaceMaxTonsUnknown) out.push({ id: "code", title: `${W} blower airflow`, status: "verify", detail: `The ${w} is picked by airflow, not BTU: its blower must move ${o.furnaceMaxTonsUnknown.cfm.toLocaleString("en-US")} CFM at 0.5 in. w.c. for the ${o.furnaceMaxTonsUnknown.tons}-ton coil — check the blower table.`, rule: "Manual S / maker's blower table" });
  return out;
}

export function complianceChecks(m: BuildingModel, chosen: CatalogItem | null, opts: { touchesRefrigerant: boolean; touchesDucts: boolean; newConstruction: boolean; removesEquipment?: boolean; kind?: string }): CheckResult[] {
  const out: CheckResult[] = [];
  if (chosen) {
    const rr = refrigerantRule(m.state, chosen.refrigerant);
    out.push({ id: "refrigerant", title: `Refrigerant · ${chosen.refrigerant ?? "unknown"}`, status: rr.status, detail: rr.text, rule: rr.source });
    if (chosen.kind === "heat-pump" || chosen.kind === "air-conditioner" || chosen.kind === "ductless") {
      const floor = efficiencyFloor(m.state, chosen.kind === "air-conditioner" ? "air-conditioner" : "heat-pump", ratedCoolingBtuh(chosen));
      const okSeer = !chosen.seer2 || chosen.seer2 >= floor.seer2;
      const okHspf = !floor.hspf2 || !chosen.hspf2 || chosen.hspf2 >= floor.hspf2;
      const ok = okSeer && okHspf;
      out.push({ id: "efficiency", title: "Efficiency floor", status: ok ? (chosen.seer2 ? "pass" : "verify") : "fix", detail: `${floor.text}${chosen.seer2 ? ` This unit: ${chosen.seer2} SEER2${chosen.hspf2 ? `, ${chosen.hspf2} HSPF2` : ""}.` : " SEER2 not on the catalog row."}${!okHspf ? " Below the HSPF2 floor." : ""}`, rule: floor.source });
    }
  }
  for (const f of CODE_FLAGS) {
    if (f.applies({ state: m.state, ...opts })) out.push({ id: f.id, title: f.title, status: f.status, detail: f.text, rule: f.source });
  }
  return out;
}

export function allChecks(load: LoadResult, c: DesignConditions, m: BuildingModel, chosen: SelectionCandidate | null, opts: { dualFuel?: boolean; removesEquipment?: boolean; reusesCircuit?: boolean; touchesRefrigerant?: boolean; kind?: string } = {}): CheckResult[] {
  const item = chosen?.item ?? null;
  const touchesRefrigerant = opts.touchesRefrigerant ?? (!item || item.kind !== "furnace");
  const touchesDucts = m.ducts.condition === "poor" || m.ducts.location === "none";
  const gas = gasCheck(m, item);
  return [...ductChecks(load, m, chosen), electricalCheck(m, chosen, { dualFuel: opts.dualFuel, reusesCircuit: opts.reusesCircuit }), ...(gas ? [gas] : []), ...complianceChecks(m, item, { touchesRefrigerant, touchesDucts, newConstruction: false, removesEquipment: opts.removesEquipment, kind: opts.kind ?? item?.kind })];
}

/** Which of the load's inputs came from a table rather than the house. */
export function defaultedFields(m: BuildingModel): string[] {
  return Object.entries(m.provenance)
    .filter(([, p]) => p.source === "default")
    .map(([k]) => k);
}

export { ratedCoolingBtuh };
export type { DesignConditions };

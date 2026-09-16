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
  const tons = chosen ? ratedCoolingBtuh(chosen.item) / 12000 : load.coolingTotalBtuh / 12000;
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
    else out.push({ id: "static", title: "Static pressure", status: "fix", detail: `Measured ${tesp.toFixed(2)} in. w.c. is far above the ${rated.toFixed(2)} rating: the ducts will not carry the new system's airflow without a return and trunk fix.`, rule: "TESP vs rated static" });
  } else {
    out.push({ id: "static", title: "Static pressure", status: "verify", detail: "Measure total external static on the existing system before install; the new blower needs the ducts to pass its airflow.", rule: "TESP vs rated static" });
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
export function electricalCheck(m: BuildingModel, chosen: SelectionCandidate | null): CheckResult {
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
    const strips = it.kind === "heat-pump" ? Math.ceil((chosen.backupKw ?? 0) / 5) * 5 * 1000 : 0;
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
  if (slots !== null && slots < 2 && !(e.existingHvacAmps && e.existingHvacAmps > 0)) {
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

export function gasCheck(m: BuildingModel, chosen: CatalogItem | null): CheckResult | null {
  if (!chosen || chosen.kind !== "furnace") return null;
  if (!m.gas.available) return { id: "gas", title: "Gas supply", status: "fix", detail: "No gas at the property: a furnace needs a gas service, or the job becomes all-electric.", rule: "" };
  const input = chosen.btuInput ?? 0;
  const size = typeof m.gas.pipeIn === "number" ? String(m.gas.pipeIn) : null;
  const run = m.gas.longestRunFt;
  if (!size || !GAS_TABLE[size] || typeof run !== "number") {
    return { id: "gas", title: "Gas supply", status: "verify", detail: `Confirm the branch pipe size and run length can carry ${Math.round(input / 1000)} kBTU/h alongside the other appliances.`, rule: "NFPA 54 pipe sizing" };
  }
  const row = GAS_TABLE[size].find(([ft]) => ft >= run) ?? GAS_TABLE[size][GAS_TABLE[size].length - 1];
  const capK = row[1];
  if (input / 1000 <= capK * 0.85) return { id: "gas", title: "Gas supply", status: "pass", detail: `${size}" pipe over ${run} ft carries ${capK} kBTU/h; the furnace draws ${Math.round(input / 1000)}.`, rule: "NFPA 54 pipe sizing" };
  if (input / 1000 <= capK) return { id: "gas", title: "Gas supply", status: "verify", detail: `${size}" pipe over ${run} ft carries ${capK} kBTU/h and the furnace draws ${Math.round(input / 1000)}: little room for the other appliances on the branch.`, rule: "NFPA 54 pipe sizing" };
  return { id: "gas", title: "Gas supply", status: "fix", detail: `${size}" pipe over ${run} ft carries ${capK} kBTU/h; the furnace draws ${Math.round(input / 1000)}. Upsize the branch.`, rule: "NFPA 54 pipe sizing" };
}

export function complianceChecks(m: BuildingModel, chosen: CatalogItem | null, opts: { touchesRefrigerant: boolean; touchesDucts: boolean; newConstruction: boolean }): CheckResult[] {
  const out: CheckResult[] = [];
  if (chosen) {
    const rr = refrigerantRule(m.state, chosen.refrigerant);
    out.push({ id: "refrigerant", title: `Refrigerant · ${chosen.refrigerant ?? "unknown"}`, status: rr.status, detail: rr.text, rule: rr.source });
    if (chosen.kind === "heat-pump" || chosen.kind === "air-conditioner") {
      const floor = efficiencyFloor(m.state, chosen.kind, ratedCoolingBtuh(chosen));
      const ok = !chosen.seer2 || chosen.seer2 >= floor.seer2;
      out.push({ id: "efficiency", title: "Efficiency floor", status: ok ? (chosen.seer2 ? "pass" : "verify") : "fix", detail: `${floor.text}${chosen.seer2 ? ` This unit: ${chosen.seer2} SEER2.` : " SEER2 not on the catalog row."}`, rule: floor.source });
    }
  }
  for (const f of CODE_FLAGS) {
    if (f.applies({ state: m.state, ...opts })) out.push({ id: f.id, title: f.title, status: f.status, detail: f.text, rule: f.source });
  }
  return out;
}

export function allChecks(load: LoadResult, c: DesignConditions, m: BuildingModel, chosen: SelectionCandidate | null): CheckResult[] {
  const item = chosen?.item ?? null;
  const touchesRefrigerant = !item || item.kind !== "furnace";
  const touchesDucts = m.ducts.condition === "poor" || m.ducts.location === "none";
  const gas = gasCheck(m, item);
  return [...ductChecks(load, m, chosen), electricalCheck(m, chosen), ...(gas ? [gas] : []), ...complianceChecks(m, item, { touchesRefrigerant, touchesDucts, newConstruction: false })];
}

/** Which of the load's inputs came from a table rather than the house. */
export function defaultedFields(m: BuildingModel): string[] {
  return Object.entries(m.provenance)
    .filter(([, p]) => p.source === "default")
    .map(([k]) => k);
}

export { ratedCoolingBtuh };
export type { DesignConditions };

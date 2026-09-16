// Water heater sizing and checks — rules, no load calculation. Tank size
// from the household (the first-hour-rating table every supplier prints),
// the gas pipe check with the tank's input, the circuit a heat-pump or
// electric tank needs, and the notes an inspector asks about.

import type { BuildingModel, CheckResult } from "./types";
import type { JobInput } from "./jobs";
import { gasCheck } from "./checks";

export interface WaterHeaterPlan {
  fuel: "gas" | "electric" | "propane";
  type: "tank" | "heat-pump" | "tankless";
  gallons: number;
  /** Gas input BTU/h (tank/tankless) or element kW (electric/heat-pump). */
  btuInput?: number;
  kw?: number;
  /** 240 V circuit amps an electric or heat-pump tank wants. */
  circuitAmps?: number;
  vent: NonNullable<JobInput["wh"]>["vent"];
  location: NonNullable<JobInput["wh"]>["location"];
  sizedFrom: string;
  notes: string[];
}

/** Gallons by household — the supplier's first-hour table, rounded to stock sizes. */
export function tankGallonsFor(occupants: number, fuel: "gas" | "electric" | "propane", type: "tank" | "heat-pump" | "tankless"): number {
  if (type === "tankless") return 0;
  const people = Math.max(1, Math.round(occupants));
  if (fuel === "gas" || fuel === "propane") return people <= 2 ? 40 : people <= 4 ? 50 : 75;
  // Electric and heat-pump tanks recover slower: one size up.
  return people <= 2 ? 40 : people <= 3 ? 50 : people <= 5 ? 65 : 80;
}

export function waterHeaterPlan(m: BuildingModel, input: JobInput["wh"] | undefined): WaterHeaterPlan {
  const fuel = input?.fuel ?? (m.gas.available === false ? "electric" : m.existing.fuel === "propane" ? "propane" : "gas");
  const type = input?.type ?? "tank";
  const gallons = input?.gallons ?? tankGallonsFor(m.occupants, fuel, type);
  const notes: string[] = [];
  const plan: WaterHeaterPlan = { fuel, type, gallons, vent: input?.vent ?? (fuel === "electric" ? "none" : type === "tankless" ? "direct" : "atmospheric"), location: input?.location ?? "garage", sizedFrom: input?.gallons ? "size entered" : type === "tankless" ? (fuel === "electric" ? "27 kW ≈ 3 GPM at a 60 °F rise" : "199k BTU/h ≈ 5 GPM at a 70 °F rise") : `${m.occupants} occupants → ${gallons} gal (first-hour table)`, notes };
  if (type === "tankless") {
    plan.btuInput = fuel === "electric" ? undefined : 199_000;
    if (fuel !== "electric") notes.push("Wall-hung, sealed combustion (Category III/IV): PVC or stainless vent, a condensate neutralizer and drain on a condensing unit, an isolation-valve kit for descaling, and a 120 V receptacle.");
    if (fuel === "electric") { plan.kw = 27; plan.circuitAmps = 120; notes.push("An electric tankless wants three 40 A circuits (120 A) — usually a service upgrade."); }
    else notes.push("A gas tankless draws up to 199,000 BTU/h — the gas line is almost always upsized to ¾ in or 1 in.");
  } else if (fuel === "electric" && type === "tank") {
    plan.kw = 4.5; plan.circuitAmps = 30;
    notes.push("Electric tank: 240 V / 30 A circuit (4.5 kW elements).");
  } else if (type === "heat-pump") {
    plan.kw = 4.5; plan.circuitAmps = 30;
    notes.push("Heat-pump water heater: 240 V / 30 A circuit, about 700 cu ft of air around it (or ducted), and a condensate drain; runs cooler and quieter in a garage or basement than a closet.");
    if (plan.location === "closet") notes.push("A closet is usually too small for a heat-pump tank without ducting — confirm the room volume.");
  } else {
    plan.btuInput = gallons >= 75 ? 75_000 : gallons >= 50 ? 40_000 : 36_000;
    notes.push(`${fuel === "propane" ? "Propane" : "Gas"} tank: ${plan.btuInput.toLocaleString("en-US")} BTU/h input, ${plan.vent === "atmospheric" ? "B-vent (atmospheric)" : plan.vent === "power" ? "power vent (PVC)" : "direct vent"}.`);
  }
  notes.push("Expansion tank on a closed system (check valve or PRV at the meter), new T&P discharge to an approved drain, drain pan with a drain where the tank sits over finished space.");
  if (["WA", "CA", "OR", "AK", "HI", "NV", "UT"].includes(m.state)) notes.push(`${m.state}: seismic straps (two, upper and lower third) are required — verify the local amendment.`);
  return plan;
}

/** The checks a water heater swap gets: gas pipe with the tank's input, the
 *  circuit for an electric or heat-pump tank, and the venting. */
export function waterHeaterChecks(m: BuildingModel, plan: WaterHeaterPlan): CheckResult[] {
  const out: CheckResult[] = [];
  if (plan.btuInput && (plan.fuel === "gas" || plan.fuel === "propane")) {
    // The furnace on the same line is the other load, when the house has one.
    const other = m.gas.available !== false && (m.existing.kind === "split-ac-furnace" || m.existing.kind === "furnace-only") ? (m.existing.btuInput ?? 80_000) : 0;
    const g = gasCheck(m, { id: "wh", kind: "furnace", brand: "", model: "water heater", btuInput: plan.btuInput, source: "shop" }, { appliance: "the water heater", otherLoadBtuh: other });
    if (g) out.push({ ...g, title: "Gas pipe to the water heater" });
  }
  if (plan.circuitAmps) {
    const main = m.electrical.mainAmps;
    const slots = m.electrical.freeSlots;
    if (main === undefined) out.push({ id: "service", title: "Circuit for the tank", status: "verify", detail: `Needs a dedicated 240 V / ${plan.circuitAmps} A circuit — panel size not on record yet.`, rule: "NEC 422" });
    else if (plan.circuitAmps >= 100) out.push({ id: "service", title: "Circuit for the tank", status: "fix", detail: `An electric tankless wants ${plan.circuitAmps} A of new circuits on a ${main} A service — plan a service upgrade.`, rule: "NEC 220.83" });
    else if (slots !== undefined && slots < 2) out.push({ id: "service", title: "Circuit for the tank", status: "fix", detail: `Needs a two-pole ${plan.circuitAmps} A breaker and the panel shows ${slots} free slot${slots === 1 ? "" : "s"} — add a tandem or a subpanel.`, rule: "NEC 422" });
    else out.push({ id: "service", title: "Circuit for the tank", status: "pass", detail: `Dedicated 240 V / ${plan.circuitAmps} A circuit on the ${main} A service.`, rule: "NEC 422" });
  }
  if (plan.vent === "atmospheric" && (plan.fuel === "gas" || plan.fuel === "propane") && m.tightness === "very-tight") out.push({ id: "code", title: "Venting", status: "verify", detail: "Atmospheric venting in a very tight house can backdraft — a power-vent or direct-vent tank is the safer choice.", rule: "NFPA 54 / IRC G2407" });
  return out;
}

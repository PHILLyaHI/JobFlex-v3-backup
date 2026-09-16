// Block load — the instant number, estimating grade.
//
// A Manual J-style whole-house calculation in plain TypeScript: envelope by
// component, window solar by wall orientation, infiltration from a tightness
// class, internal gains, duct loss and gain by duct location, county design
// temperatures. Deterministic: the same house and the same tables give the
// same answer, and scripts/qa/hvac-engine.check.ts holds it to known
// behaviour. It is NOT an ACCA-approved calculation; the approved report for
// a permit comes from the partner tool (see docs/hvac-estimator-plan.md).
//
// Conventions: indoor 75 °F / 50% RH cooling, 70 °F heating; loads rounded to
// 500 BTU/h because a finer figure would claim a precision the defaults do
// not have.

import type { BuildingModel, DesignConditions, LoadComponent, LoadResult } from "./types";
import {
  ACH50,
  CEILING_U,
  CFM_PER_TON,
  DUCT,
  FLOOR,
  ROOF_COLOR_ADD,
  SHADING_FACTOR,
  SOLAR_BY_BEARING,
  WALL_U,
  WINDOW,
} from "./data/defaults";

export const ENGINE_VERSION = "jobflex-hvac-engine 0.1 · block load, estimating grade";
export const INDOOR_COOLING_F = 75;
export const INDOOR_HEATING_F = 70;
/** Supply-to-room temperature difference the airflow is sized on, °F. */
const SUPPLY_DT_F = 20;
const DOOR_U = 0.4;
const DOOR_SQFT_PER_STOREY = 40;
const OCCUPANT_SENSIBLE = 230;
const OCCUPANT_LATENT = 200;
const APPLIANCE_SENSIBLE = 1200;
const REFERENCE_SHGC = 0.87;

const round500 = (v: number) => Math.max(0, Math.round(v / 500) * 500);
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

/** Solar gain per sq ft of window at the design hour for a wall bearing. */
export function solarGainForBearing(bearingDeg: number): { gain: number; label: string } {
  const b = ((bearingDeg % 360) + 360) % 360;
  for (const s of SOLAR_BY_BEARING) {
    if (s.from > s.to ? b >= s.from || b < s.to : b >= s.from && b < s.to) return { gain: s.gain, label: s.label };
  }
  return { gain: 70, label: "?" };
}

/** Window area split by the walls it sits in: by footprint edge length when
 *  the footprint is known, otherwise a quarter each way. */
function windowShares(m: BuildingModel): Array<{ label: string; share: number; gain: number }> {
  const edges = (m.footprintEdges ?? []).filter((e) => e.lengthFt > 0);
  if (!edges.length) {
    return [
      { label: "N", share: 0.25, gain: 25 },
      { label: "E", share: 0.25, gain: 110 },
      { label: "S", share: 0.25, gain: 50 },
      { label: "W", share: 0.25, gain: 110 },
    ];
  }
  const total = edges.reduce((a, e) => a + e.lengthFt, 0);
  const byLabel = new Map<string, { share: number; gain: number }>();
  for (const e of edges) {
    const { gain, label } = solarGainForBearing(e.bearingDeg);
    const cur = byLabel.get(label) ?? { share: 0, gain };
    cur.share += e.lengthFt / total;
    byLabel.set(label, cur);
  }
  return [...byLabel.entries()].map(([label, v]) => ({ label, ...v }));
}

export function computeBlockLoad(m: BuildingModel, c: DesignConditions): LoadResult {
  const assumptions: string[] = [];
  const area = Math.max(200, m.conditionedSqft);
  const storeys = Math.max(1, Math.round(m.storeys || 1));
  const ceiling = m.ceilingHeightFt > 0 ? m.ceilingHeightFt : 8;
  if (!(m.ceilingHeightFt > 0)) assumptions.push("Ceiling height assumed 8 ft.");
  const footprint = area / storeys;
  let perimeter = m.perimeterFt ?? 0;
  if (!(perimeter > 0)) {
    // A 3:2 rectangle of the footprint area; a real footprint replaces this.
    perimeter = 4.1 * Math.sqrt(footprint);
    assumptions.push(`Exterior perimeter estimated at ${Math.round(perimeter)} ft from a 3:2 footprint of ${Math.round(footprint)} sq ft.`);
  }

  const dtHeat = Math.max(0, INDOOR_HEATING_F - c.heatingF);
  const dtCool = Math.max(0, c.coolingF - INDOOR_COOLING_F);
  const win = WINDOW[m.windowType];
  const windowSqft = area * m.windowToFloor;
  const doorSqft = DOOR_SQFT_PER_STOREY * Math.min(2, storeys);
  const grossWall = perimeter * ceiling * storeys;
  const netWall = Math.max(0, grossWall - windowSqft - doorSqft);
  const wallU = WALL_U[m.wallInsulation];
  const ceilU = CEILING_U[m.ceilingInsulation];
  const floor = FLOOR[m.foundation];
  const floorUA = floor.perPerimeter ? floor.heatingUA * perimeter : floor.heatingUA * footprint;

  // Infiltration: blower-door ACH50 to natural air changes by the usual
  // divisor (about 20 for a single storey, less for a taller house).
  const nFactor = storeys >= 2 ? 17 : 20;
  const ach = ACH50[m.tightness] / nFactor;
  const volume = area * ceiling;
  const infilCfm = (ach * volume) / 60;
  assumptions.push(`Infiltration from a "${m.tightness}" blower-door class (${ACH50[m.tightness]} ACH50 ÷ ${nFactor}).`);

  const occupants = m.occupants > 0 ? m.occupants : 3;
  if (!(m.occupants > 0)) assumptions.push("Occupants assumed 3.");
  const appliances = APPLIANCE_SENSIBLE + (area > 2500 ? 600 : 0);
  const shade = SHADING_FACTOR[m.shading];
  const roofAdd = ROOF_COLOR_ADD[m.roofColor];

  const components: LoadComponent[] = [];
  const push = (name: string, h: number, cs: number, cl = 0) =>
    components.push({ name, heatingBtuh: round(h), coolingSensibleBtuh: round(cs), coolingLatentBtuh: round(cl) });

  // Windows: conduction both seasons, solar in summer by orientation.
  const shares = windowShares(m);
  let solar = 0;
  for (const s of shares) solar += windowSqft * s.share * s.gain * (win.shgc / REFERENCE_SHGC) * shade;
  push(`Windows · ${Math.round(windowSqft)} sq ft ${win.label}`, win.u * windowSqft * dtHeat, win.u * windowSqft * dtCool);
  push(`Window solar · ${shares.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(", ")}`, 0, solar);
  push(`Doors · ${doorSqft} sq ft`, DOOR_U * doorSqft * dtHeat, DOOR_U * doorSqft * (dtCool + 8));
  push(`Walls · ${Math.round(netWall)} sq ft net, ${m.wallInsulation === "none" ? "uninsulated" : m.wallInsulation.toUpperCase()}`, wallU * netWall * dtHeat, wallU * netWall * (dtCool + 8));
  push(`Ceiling · ${Math.round(footprint)} sq ft under ${m.ceilingInsulation === "none" ? "an uninsulated attic" : m.ceilingInsulation.toUpperCase() + " attic"}, ${m.roofColor} roof`, ceilU * footprint * dtHeat, ceilU * footprint * (dtCool + roofAdd));
  push(`Floor · ${floor.label}`, floorUA * dtHeat, floor.coolingShare * floorUA * dtCool);
  const grains = Math.max(0, c.grainsDiff);
  push(`Infiltration · ${Math.round(infilCfm)} CFM natural`, 1.1 * infilCfm * dtHeat, 1.1 * infilCfm * dtCool, 0.68 * infilCfm * grains);
  push(`People and appliances · ${occupants} occupants`, 0, occupants * OCCUPANT_SENSIBLE + appliances, occupants * OCCUPANT_LATENT);

  let heat = components.reduce((a, k) => a + k.heatingBtuh, 0);
  let sens = components.reduce((a, k) => a + k.coolingSensibleBtuh, 0);
  let lat = components.reduce((a, k) => a + k.coolingLatentBtuh, 0);

  // Ducts outside the envelope lose in winter and gain in summer.
  const duct = DUCT[m.ducts.location] ?? DUCT.none;
  let ductHeat = duct.heating;
  let ductCool = duct.cooling;
  if (m.ducts.location !== "conditioned" && m.ducts.location !== "none") {
    if (m.ducts.condition === "poor") { ductHeat *= 1.5; ductCool *= 1.5; }
    if (m.ducts.insulated === false) { ductHeat *= 1.5; ductCool *= 1.5; }
    push(`Ducts in the ${m.ducts.location}${m.ducts.condition === "poor" ? ", poor condition" : ""}${m.ducts.insulated === false ? ", uninsulated" : ""}`, heat * ductHeat, sens * ductCool, lat * ductCool);
    heat *= 1 + ductHeat;
    sens *= 1 + ductCool;
    lat *= 1 + ductCool;
  }

  const heatingBtuh = round500(heat);
  const coolingSensibleBtuh = round500(sens);
  const coolingLatentBtuh = round500(lat);
  const coolingTotalBtuh = coolingSensibleBtuh + coolingLatentBtuh;
  const coolingTons = round(coolingTotalBtuh / 12000, 2);
  const sensibleHeatRatio = coolingTotalBtuh > 0 ? round(coolingSensibleBtuh / coolingTotalBtuh, 2) : 1;
  const coolingCfm = Math.round(sens / (1.1 * SUPPLY_DT_F) / 10) * 10;
  assumptions.push(`Indoor design ${INDOOR_COOLING_F} °F cooling / ${INDOOR_HEATING_F} °F heating; outdoor ${c.coolingF} °F / ${c.heatingF} °F for ${c.county}, ${c.state} (${c.source}).`);
  assumptions.push(`Moisture at the cooling design taken as "${c.humidity}" climate (${c.grainsDiff} grains).`);
  if (m.ducts.location !== "conditioned" && m.ducts.location !== "none") {
    assumptions.push(`Duct loss ${Math.round(ductHeat * 100)}% heating / gain ${Math.round(ductCool * 100)}% cooling for ducts in the ${m.ducts.location}.`);
  }

  return {
    heatingBtuh,
    coolingSensibleBtuh,
    coolingLatentBtuh,
    coolingTotalBtuh,
    coolingTons,
    sensibleHeatRatio,
    coolingCfm,
    cfmPerTon: CFM_PER_TON[c.humidity],
    components,
    assumptions,
    deltaTCooling: dtCool,
    deltaTHeating: dtHeat,
    ductLossHeating: round(ductHeat, 3),
    ductGainCooling: round(ductCool, 3),
  };
}

/** The house's heating load at any outdoor temperature: straight from zero
 *  at 65 °F to the design load at the 99% temperature. */
export function heatingLoadAt(load: LoadResult, c: DesignConditions, outdoorF: number): number {
  const span = 65 - c.heatingF;
  if (span <= 0) return 0;
  return Math.max(0, (load.heatingBtuh * (65 - outdoorF)) / span);
}

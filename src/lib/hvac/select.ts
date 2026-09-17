// Equipment selection — Manual S rules over the shop's catalog.
//
// Cooling capacity within 90–115% of the total cooling load (up to 125% for
// variable-capacity equipment, which throttles down); a heat pump judged at
// the 99% design temperature, not at its 47 °F rating, with the balance point
// and the electric backup it needs; a furnace whose output sits between 100%
// and 140% of the heating load. Refrigerant and the DOE efficiency floor
// disqualify; the customer's constraints filter; a score orders what is left.
// No price enters here — the ranking is fit, and the ledger prices it.

import type { EquipmentKind, BuildingModel, CapacityPoint, CatalogItem, DesignConditions, LoadResult, SelectionCandidate, SelectionResult } from "./types";
import { heatingLoadAt } from "./load";
import { efficiencyFloor, refrigerantRule, ultraLowNoxNeeded } from "./data/rules";

const BTU_PER_KW = 3412;

/** Rated cooling capacity of a cooling product, BTU/h. */
export function ratedCoolingBtuh(item: CatalogItem): number {
  if (item.coolingBtuh && item.coolingBtuh > 0) return item.coolingBtuh;
  if (item.tons && item.tons > 0) return item.tons * 12000;
  return 0;
}

/**
 * Heating capacity of a heat pump at an outdoor temperature. Published points
 * at 47 / 17 / 5 °F are interpolated; missing points fall back to typical
 * derates (cold-climate units hold ~80% at 17 °F and ~72% at 5 °F; ordinary
 * units ~65% and ~52%). Below the coldest point the last slope continues,
 * floored at 30% of the 47 °F rating.
 */
export function heatPumpCapacityAt(item: CatalogItem, outdoorF: number): number {
  const base = item.heat47Btuh && item.heat47Btuh > 0 ? item.heat47Btuh : ratedCoolingBtuh(item);
  if (base <= 0) return 0;
  const cc = !!item.coldClimate;
  const p17 = item.heat17Btuh && item.heat17Btuh > 0 ? item.heat17Btuh : base * (cc ? 0.8 : 0.65);
  const p5 = item.heat5Btuh && item.heat5Btuh > 0 ? item.heat5Btuh : base * (cc ? 0.72 : 0.52);
  if (outdoorF >= 47) return base;
  if (outdoorF >= 17) return p17 + ((base - p17) * (outdoorF - 17)) / 30;
  if (outdoorF >= 5) return p5 + ((p17 - p5) * (outdoorF - 5)) / 12;
  // Below the coldest published point the curve keeps falling: the read slope,
  // or at least ~1.3% of rated per °F (a cold-climate unit that holds 100% to
  // 5 °F is near 76% by −13 °F).
  const slope = Math.max((p17 - p5) / 12, base * 0.013);
  return Math.max(base * 0.3, p5 - slope * (5 - outdoorF));
}

/** Outdoor temperature where the heat pump alone just carries the house. */
export function balancePointF(item: CatalogItem, load: LoadResult, c: DesignConditions): number | null {
  if (heatPumpCapacityAt(item, c.heatingF) >= load.heatingBtuh) return c.heatingF; // carries the design day
  for (let t = c.heatingF; t <= 65; t += 0.5) {
    if (heatPumpCapacityAt(item, t) >= heatingLoadAt(load, c, t)) return Math.round(t * 2) / 2;
  }
  return null;
}

/** Capacity and load from below the design temperature up to 65 °F, for the chart. */
export function capacityCurve(item: CatalogItem, load: LoadResult, c: DesignConditions): CapacityPoint[] {
  const out: CapacityPoint[] = [];
  const start = Math.floor((c.heatingF - 10) / 5) * 5;
  for (let t = start; t <= 65; t += 5) {
    out.push({ outdoorF: t, capacityBtuh: Math.round(heatPumpCapacityAt(item, t)), loadBtuh: Math.round(heatingLoadAt(load, c, t)) });
  }
  return out;
}

export function evaluateItem(item: CatalogItem, load: LoadResult, c: DesignConditions, m: BuildingModel, opts: { wantsHeatPump?: boolean; keepsIndoor?: boolean } = {}): SelectionCandidate {
  const reasons: string[] = [];
  let score = 100;
  const out: SelectionCandidate = { item, score, reasons };
  const fail = (why: string) => {
    out.disqualified = why;
    out.score = 0;
    return out;
  };

  const rr = refrigerantRule(m.state, item.refrigerant);
  if (!rr.allowed) return fail(rr.text);
  if (rr.status === "verify" && item.refrigerant === "R-410A") {
    score -= 8;
    reasons.push("R-410A stock: confirm the manufacture date and supply before quoting.");
  }
  if (m.preferences.brands?.length && !m.preferences.brands.some((b) => b.toLowerCase() === item.brand.toLowerCase())) {
    return fail(`${item.brand} is not on the shop's brand list.`);
  }

  // Fuel: an all-electric house (or one that wants off gas) takes a heat pump;
  // a house keeping its gas furnace takes an AC, and a heat pump there is a
  // dual-fuel upsell to offer, not the default.
  const noGas = m.gas.available === false || m.preferences.allElectric === true || m.existing.fuel === "electric";
  const hasFurnace = m.existing.kind === "split-ac-furnace" || m.existing.kind === "furnace-only";
  // A heat-pump conversion is the contractor's call: the furnace may stay as
  // dual-fuel backup, and that is not a mark against the heat pump.
  const keepsGas = !noGas && !opts.wantsHeatPump && (m.preferences.keepGas === true || m.existing.fuel === "gas" || m.existing.fuel === "propane" || (hasFurnace && m.gas.available === true));
  // An AC needs an indoor blower to pair with: a new gas furnace on a full
  // replacement, or the furnace / air handler that stays on an add or a swap
  // (an electric furnace carries a coil just as well).
  // Gas heat in California: the South Coast, San Joaquin Valley and Bay Area
  // districts take only 14 ng/J, and the rule binds the installer.
  if ((item.kind === "furnace" || (item.kind === "package" && item.heatKind === "gas")) && (item.noxNgJ ?? 40) > 14) {
    const uln = ultraLowNoxNeeded(m.state, m.county);
    if (uln === "required") return fail(`Not certified to 14 ng/J, and ${m.county} County sits in a district that takes only ultra-low-NOx gas heat — order the ULN build of this model.`);
    if (uln === "confirm") { score -= 4; reasons.push("California: confirm the air district — the South Coast, San Joaquin Valley and Bay Area districts take only 14 ng/J gas heat, and this unit is the 40 ng/J build."); }
  }
  // Where the row may be sold and installed: a state rule the catalog carries.
  const st = (m.state || "").toUpperCase();
  if (st && item.notStates?.map((x) => x.toUpperCase()).includes(st)) return fail(`Not sold or not permitted in ${st}${item.availabilityNote ? ` — ${item.availabilityNote}` : ""}.`);
  if (st && item.states?.length && !item.states.map((x) => x.toUpperCase()).includes(st)) return fail(`Sold in ${item.states.join(", ")} only${item.availabilityNote ? ` — ${item.availabilityNote}` : ""}.`);
  if (item.kind === "air-conditioner" && noGas && !opts.keepsIndoor) return fail("An AC needs a furnace; this house has no gas.");
  if (item.kind === "heat-pump" && keepsGas) {
    // Decisive, not a nudge: a variable-speed heat pump that carries the
    // design day picks up +14 elsewhere, and a gas house should still see
    // the AC first and the heat pump as the runner-up (the dual-fuel offer).
    score -= 20;
    reasons.push("The house keeps its gas furnace — offer this as dual fuel.");
  }
  if (item.kind === "heat-pump" && noGas) score += 4;

  const cools = item.kind === "heat-pump" || item.kind === "air-conditioner" || item.kind === "package" || item.kind === "ductless";
  if (cools) {
    const cap = ratedCoolingBtuh(item);
    if (cap <= 0) return fail("No cooling capacity on the catalog row.");
    const floor = efficiencyFloor(m.state, item.kind === "heat-pump" || (item.kind === "package" && item.heatKind === "heat-pump") ? "heat-pump" : "air-conditioner", cap, item.kind === "package");
    if (item.seer2 && item.seer2 < floor.seer2) return fail(`${item.seer2} SEER2 is below the ${floor.seer2} SEER2 regional minimum.`);
    // The Southwest EER2 floor drops for a unit already certified high on SEER2.
    const eerFloor = floor.eer2IfHighSeer && (item.seer2 ?? 0) >= 15.2 ? floor.eer2IfHighSeer : floor.eer2;
    if (eerFloor && item.eer2 && item.eer2 < eerFloor) return fail(`${item.eer2} EER2 is below the ${eerFloor} EER2 minimum for this region.`);
    if (!item.seer2) { score -= 5; reasons.push("SEER2 not on the catalog row — confirm it meets the regional minimum."); }
    const ratio = load.coolingTotalBtuh > 0 ? cap / load.coolingTotalBtuh : 0;
    out.coolingRatio = Math.round(ratio * 100) / 100;
    const upper = item.staging === "variable" ? 1.25 : 1.15;
    // Judged on whole percent: a 42,000 BTU/h unit on a 36,500 load is 115%, not 115.07%.
    const pct = Math.round(ratio * 100);
    if (pct < 90) return fail(`Cooling capacity is ${pct}% of the load; Manual S wants at least 90%.`);
    if (pct > Math.round(upper * 100)) return fail(`Cooling capacity is ${pct}% of the load; Manual S allows up to ${Math.round(upper * 100)}% for this equipment.`);
    // Closest to a touch over the load scores best: 100–110% ideal.
    score -= Math.round(Math.abs(ratio - 1.05) * 100);
    reasons.push(`Cooling ${Math.round(ratio * 100)}% of the ${load.coolingTotalBtuh.toLocaleString("en-US")} BTU/h load.`);
    if (item.staging === "variable") { score += 6; reasons.push("Variable capacity: better humidity control and part-load efficiency."); }
    else if (item.staging === "two-stage") { score += 3; }
    if (c.humidity === "humid" && item.staging === "single" && ratio > 1.1) { score -= 6; reasons.push("Single-stage and oversized in a humid climate: short cycles, poor dehumidification."); }
  }

  if (item.kind === "heat-pump") {
    const atDesign = heatPumpCapacityAt(item, c.heatingF);
    out.heatAtDesignBtuh = Math.round(atDesign);
    out.balancePointF = balancePointF(item, load, c) ?? undefined;
    out.backupKw = Math.round((Math.max(0, load.heatingBtuh - atDesign) / BTU_PER_KW) * 10) / 10;
    out.curve = capacityCurve(item, load, c);
    if (atDesign >= load.heatingBtuh) {
      score += 8;
      reasons.push(`Carries the ${load.heatingBtuh.toLocaleString("en-US")} BTU/h heating load at ${c.heatingF} °F with no backup.`);
    } else {
      const share = atDesign / load.heatingBtuh;
      reasons.push(`Covers ${Math.round(share * 100)}% of the heating load at ${c.heatingF} °F; ${out.backupKw} kW of backup carries the rest below ${out.balancePointF ?? "—"} °F.`);
      if (share < 0.6) { score -= 15; reasons.push("Under 60% at the design temperature — the strips will run most cold nights."); }
      else if (share < 0.8) score -= 6;
    }
    if (c.heatingF <= 17 && !item.coldClimate) { score -= 10; reasons.push("A cold-climate rated unit holds more capacity at this design temperature."); }
    if (m.preferences.keepGas && !opts.wantsHeatPump) { score -= 4; reasons.push("Customer wants to keep gas; a dual-fuel pairing may suit better."); }
  }

  if (item.kind === "furnace") {
    if (m.preferences.allElectric) return fail("Customer wants all-electric.");
    if (m.gas.available === false) {
      reasons.push("No gas at the property: a gas furnace needs a gas service — or price an electric furnace or a heat pump.");
      score -= 30;
    } else if (!m.gas.available && item.btuInput && (m.existing.fuel === "gas" || m.existing.fuel === undefined)) {
      reasons.push("Gas availability at the property is unconfirmed.");
      score -= 10;
    }
    const output = (item.btuInput ?? 0) * (item.afue ?? 0.8);
    out.furnaceOutputBtuh = Math.round(output);
    const ratio = load.heatingBtuh > 0 ? output / load.heatingBtuh : 0;
    out.outputRatio = Math.round(ratio * 100) / 100;
    if (ratio < 1) return fail(`Furnace output ${Math.round(output).toLocaleString("en-US")} BTU/h is under the ${load.heatingBtuh.toLocaleString("en-US")} BTU/h heating load.`);
    if (ratio > 1.4) return fail(`Furnace output is ${Math.round(ratio * 100)}% of the heating load; Manual S caps a furnace at 140%.`);
    score -= Math.round(Math.abs(ratio - 1.15) * 60);
    reasons.push(`Output ${Math.round(ratio * 100)}% of the heating load.`);
    if ((item.afue ?? 0) >= 0.9) reasons.push("Condensing furnace: PVC vent, condensate drain and neutralizer are part of the job.");
  }

  out.score = Math.max(1, Math.min(100, Math.round(score)));
  return out;
}

/** Rank the catalog against the load. Heat pumps and air conditioners compete
 *  for the outdoor unit; furnaces are listed alongside for a gas house. */
const isOutdoor = (x: SelectionCandidate) => !x.disqualified && (x.item.kind === "heat-pump" || x.item.kind === "air-conditioner" || x.item.kind === "package" || x.item.kind === "ductless");

/** Residential ladders stop at 5 tons; a bigger load is two (or three)
 *  systems, each on its own zone, and the selection says so. */
export interface SelectOptions {
  /** Catalog kinds the job may choose from; empty/undefined = any outdoor kind. */
  kinds?: EquipmentKind[];
  /** The contractor chose a heat pump: no keep-gas penalty. */
  wantsHeatPump?: boolean;
  /** The indoor unit stays (add cooling, outdoor swap): an AC pairs with it whatever the fuel. */
  keepsIndoor?: boolean;
  /** Smallest nominal size worth targeting (0.5 t for a ductless zone; 1.5 t central). */
  minTons?: number;
  /** Furnace jobs: the coil the new furnace is set under — its blower must carry these tons. */
  coilTons?: number;
}

export function selectSystem(catalog: CatalogItem[], load: LoadResult, c: DesignConditions, m: BuildingModel, opts: SelectOptions = {}): SelectionResult {
  // Central gear comes in half tons from 1.5; wall heads in quarter tons from 0.5.
  const minTons = opts.minTons ?? 1.5;
  const step = minTons < 1.5 ? 4 : 2;
  const targetTons = Math.max(minTons, Math.round((load.coolingTotalBtuh / 12000) * step) / step);
  const allowed = opts.kinds?.length ? new Set(opts.kinds) : null;
  const pool = allowed ? catalog.filter((i) => allowed.has(i.kind)) : catalog;
  const model = m;
  const scorer = { wantsHeatPump: opts.wantsHeatPump, keepsIndoor: opts.keepsIndoor };
  const candidates = pool.map((item) => evaluateItem(item, load, c, model, scorer)).sort((a, b) => b.score - a.score);
  // An electric furnace is an air handler with a heat kit: the cabinet is
  // picked for the coil it carries, and the kit covers the heating load.
  if (allowed && allowed.has("air-handler") && allowed.size === 1) {
    const need = opts.coilTons ?? targetTons;
    const fits = candidates.filter((x) => !x.disqualified && x.item.kind === "air-handler" && (x.item.maxTons ?? x.item.tons ?? 99) >= need).sort((a, b) => (a.item.tons ?? 99) - (b.item.tons ?? 99));
    const pool2 = fits.length ? fits : candidates.filter((x) => x.item.kind === "air-handler").sort((a, b) => (b.item.tons ?? 0) - (a.item.tons ?? 0));
    const kw = Math.round((load.heatingBtuh / 3412) * 10) / 10;
    const withReason = pool2.map((x) => ({ ...x, disqualified: undefined, reasons: [...x.reasons.filter((r) => !/SEER2|cold-climate/i.test(r)), `Electric furnace: this cabinet carries the ${need}-ton coil, with a ${Math.max(5, Math.ceil(kw / 5) * 5)} kW heat kit for the ${Math.round(load.heatingBtuh / 1000)}k BTU/h heating load.`] }));
    return { chosen: withReason[0] ?? null, runnerUp: withReason[1] ?? null, candidates, targetTons, systems: 1 };
  }
  // Furnace-only jobs pick a furnace; everything else picks an outdoor unit.
  if (allowed && allowed.has("furnace") && allowed.size === 1) {
    const furnaces = candidates.filter((x) => !x.disqualified && x.item.kind === "furnace").sort((a, b) => (Math.abs((a.outputRatio ?? 9) - 1.15)) - (Math.abs((b.outputRatio ?? 9) - 1.15)));
    if (!furnaces.length) {
      // A small load and nothing small enough made: Manual S accepts the
      // smallest available furnace over 140% — said so, not hidden.
      const smallest = candidates.filter((x) => x.item.kind === "furnace" && (x.outputRatio ?? 0) >= 1 && /140%/.test(x.disqualified ?? "")).sort((a, b) => (a.outputRatio ?? 9) - (b.outputRatio ?? 9))[0];
      if (smallest) {
        const chosen: SelectionCandidate = { ...smallest, disqualified: undefined, score: 60, reasons: [`Output ${Math.round((smallest.outputRatio ?? 0) * 100)}% of the heating load — over Manual S's 140%, but the smallest furnace in the catalog; acceptable when nothing smaller is made. Confirm with the inspector.`] };
        return { chosen, runnerUp: null, candidates, targetTons, systems: 1 };
      }
    }
    // The blower must move the coil's air: among the fits, prefer cabinets
    // rated for the coil (maxTons); if none is, the engine flags it.
    const carries = opts.coilTons ? furnaces.filter((x) => (x.item.maxTons ?? 99) >= (opts.coilTons ?? 0)) : furnaces;
    const ranked = carries.length ? carries : furnaces;
    return { chosen: ranked[0] ?? null, runnerUp: ranked[1] ?? null, candidates, targetTons, systems: 1 };
  }
  const outdoor = candidates.filter(isOutdoor);
  if (outdoor.length || load.coolingTotalBtuh <= 40000) {
    return { chosen: outdoor[0] ?? null, runnerUp: outdoor[1] ?? null, candidates, targetTons, systems: 1 };
  }
  for (const n of [2, 3]) {
    const part: LoadResult = {
      ...load,
      coolingTotalBtuh: Math.round(load.coolingTotalBtuh / n / 500) * 500,
      coolingSensibleBtuh: Math.round(load.coolingSensibleBtuh / n),
      coolingLatentBtuh: Math.round(load.coolingLatentBtuh / n),
      heatingBtuh: Math.round(load.heatingBtuh / n / 500) * 500,
      coolingTons: Math.round((load.coolingTons / n) * 10) / 10,
      coolingCfm: Math.round(load.coolingCfm / n),
    };
    const split = pool.map((item) => evaluateItem(item, part, c, model, scorer)).sort((a, b) => b.score - a.score);
    const fits = split.filter(isOutdoor);
    if (fits.length) {
      for (const f of fits.slice(0, 2)) f.reasons.unshift(`One of ${n} systems — the ${load.coolingTotalBtuh.toLocaleString("en-US")} BTU/h load is split into ${n} zones.`);
      return { chosen: fits[0], runnerUp: fits[1] ?? null, candidates: split, targetTons, systems: n, perSystem: { coolingTotalBtuh: part.coolingTotalBtuh, heatingBtuh: part.heatingBtuh } };
    }
  }
  return { chosen: null, runnerUp: null, candidates, targetTons, systems: 1 };
}

// The ledger — how an engine result becomes priced lines.
//
// Deterministic on purpose: the same building, unit and rate card give the
// same lines every time, and every line names where its quantity came from.
// The model never prices anything here. The shop's rate card (hours per task,
// stock prices, markups, fees) is the org's own and lives beside the catalog;
// what ships below is a defensible starting card a contractor edits once.

import type { BuildingModel, CatalogItem, EngineResult, SelectionCandidate } from "./types";

export interface HvacRateCard {
  /** Lead tech, per hour. */
  laborRatePerHour: number;
  /** Helper, per hour (two-person tasks bill both). */
  helperRatePerHour: number;
  /** On the shop's equipment cost. */
  equipmentMarkupPct: number;
  /** On stock materials. */
  materialsMarkupPct: number;
  permitFee: number;
  disposalFee: number;
  /** Rooftop / package units only. */
  craneFee: number;
  /** Hours by task, two-person crew unless noted. */
  hours: {
    removeSplit: number;
    removePackage: number;
    setOutdoor: number;
    setAirHandler: number;
    setFurnace: number;
    setCoil: number;
    setPackage: number;
    lineset: number;
    electrical: number;
    electricalUpgradeRun: number;
    gasPipe: number;
    returnUpsize: number;
    ductSeal: number;
    thermostat: number;
    startup: number;
  };
  /** Stock prices, shop cost. */
  materials: {
    pad: number;
    linesetPerFt: number;
    disconnect: number;
    whipKit: number;
    drainKit: number;
    condensatePump: number;
    thermostat: number;
    surgeProtector: number;
    gasFlexKit: number;
    breakerAndWirePerFt: number;
    breaker: number;
    returnGrilleUpsize: number;
    ductSealKit: number;
    backupHeatKitPerKw: number;
    refrigerantPerLb: number;
  };
  /** Used when a catalog row carries no cost. */
  equipmentDefaults: {
    airConditionerPerTon: number;
    heatPumpPerTon: number;
    coldClimateHeatPumpPerTon: number;
    packagePerTon: number;
    ductlessPerTon: number;
    coilPerTon: number;
    airHandlerPerTon: number;
    furnacePer10kBtu: number;
  };
  /** Default lineset run when nobody measured it. */
  linesetFtDefault: number;
}

export const DEFAULT_RATE_CARD: HvacRateCard = {
  laborRatePerHour: 95,
  helperRatePerHour: 55,
  equipmentMarkupPct: 35,
  materialsMarkupPct: 25,
  permitFee: 250,
  disposalFee: 150,
  craneFee: 450,
  hours: {
    removeSplit: 3,
    removePackage: 3,
    setOutdoor: 3,
    setAirHandler: 4,
    setFurnace: 5,
    setCoil: 2.5,
    setPackage: 5,
    lineset: 3,
    electrical: 2.5,
    electricalUpgradeRun: 4,
    gasPipe: 3,
    returnUpsize: 4,
    ductSeal: 5,
    thermostat: 1,
    startup: 2,
  },
  materials: {
    pad: 85,
    linesetPerFt: 9,
    disconnect: 45,
    whipKit: 40,
    drainKit: 60,
    condensatePump: 95,
    thermostat: 180,
    surgeProtector: 130,
    gasFlexKit: 55,
    breakerAndWirePerFt: 4.5,
    breaker: 60,
    returnGrilleUpsize: 220,
    ductSealKit: 180,
    backupHeatKitPerKw: 45,
    refrigerantPerLb: 18,
  },
  equipmentDefaults: {
    airConditionerPerTon: 950,
    heatPumpPerTon: 1250,
    coldClimateHeatPumpPerTon: 1700,
    packagePerTon: 1500,
    ductlessPerTon: 1400,
    coilPerTon: 350,
    airHandlerPerTon: 550,
    furnacePer10kBtu: 190,
  },
  linesetFtDefault: 25,
};

export type LineBasis = "measured" | "estimated" | "entered";

export interface LedgerLine {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  basis: LineBasis;
  /** Why the line is here — the screen shows it under the name. */
  note?: string;
}

export interface Ledger {
  title: string;
  scope: string;
  materials: LedgerLine[];
  labor: LedgerLine[];
  assumptions: string[];
  subtotal: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const markup = (cost: number, pct: number) => r2(cost * (1 + pct / 100));
const crewRate = (card: HvacRateCard) => card.laborRatePerHour + card.helperRatePerHour;

function equipmentPrice(item: CatalogItem, card: HvacRateCard): { price: number; basis: LineBasis; note: string } {
  const d = card.equipmentDefaults;
  if (item.cost && item.cost > 0) return { price: markup(item.cost, card.equipmentMarkupPct), basis: "entered", note: `Shop cost $${item.cost.toLocaleString("en-US")} + ${card.equipmentMarkupPct}%` };
  const tons = item.tons ?? (item.coolingBtuh ? item.coolingBtuh / 12000 : 0);
  let cost = 0;
  switch (item.kind) {
    case "air-conditioner": cost = tons * d.airConditionerPerTon; break;
    case "heat-pump": cost = tons * (item.coldClimate ? d.coldClimateHeatPumpPerTon : d.heatPumpPerTon); break;
    case "package": cost = tons * d.packagePerTon; break;
    case "ductless": cost = tons * d.ductlessPerTon; break;
    case "coil": cost = tons * d.coilPerTon; break;
    case "air-handler": cost = tons * d.airHandlerPerTon; break;
    case "furnace": cost = ((item.btuInput ?? 60000) / 10000) * d.furnacePer10kBtu; break;
  }
  return { price: markup(cost, card.equipmentMarkupPct), basis: "estimated", note: `No shop cost on the catalog row — rate-card default per ${item.kind === "furnace" ? "10k BTU" : "ton"} + ${card.equipmentMarkupPct}%` };
}

/** Lines for the chosen system, with its indoor companion. */
function equipmentLines(chosen: SelectionCandidate, m: BuildingModel, engine: EngineResult, card: HvacRateCard, catalog: CatalogItem[]): LedgerLine[] {
  const item = chosen.item;
  const lines: LedgerLine[] = [];
  const p = equipmentPrice(item, card);
  const kindWord: Record<CatalogItem["kind"], string> = {
    "heat-pump": "heat pump", "air-conditioner": "condenser", furnace: "furnace", "air-handler": "air handler", coil: "coil", ductless: "ductless system", package: "package unit",
  };
  lines.push({
    id: "eq-main",
    name: `${item.brand} ${item.model} — ${item.tons ? `${item.tons}-ton ` : ""}${kindWord[item.kind]}${item.seer2 ? ` · ${item.seer2} SEER2` : ""}${item.refrigerant ? ` · ${item.refrigerant}` : ""}`,
    quantity: 1, unitPrice: p.price, unit: "each", basis: p.basis, note: p.note,
  });
  const tons = item.tons ?? engine.selection.targetTons;

  if (item.kind === "air-conditioner" || item.kind === "heat-pump") {
    // Indoor side: a matched furnace + coil on a gas house, an air handler
    // (with backup strips for a heat pump) on an electric one.
    const gasHouse = m.gas.available !== false && !m.preferences.allElectric && (m.existing.fuel === "gas" || m.existing.fuel === undefined || m.preferences.keepGas);
    if (gasHouse && item.kind === "air-conditioner") {
      const furnace = pickCompanion(catalog, "furnace", tons, engine.load.heatingBtuh);
      if (furnace) {
        const fp = equipmentPrice(furnace, card);
        lines.push({ id: "eq-furnace", name: `${furnace.brand} ${furnace.model} — ${Math.round((furnace.btuInput ?? 0) / 1000)}k BTU furnace${furnace.afue ? ` · ${Math.round(furnace.afue * 100)}% AFUE` : ""}`, quantity: 1, unitPrice: fp.price, unit: "each", basis: fp.basis, note: fp.note });
      } else {
        const input = Math.max(40000, Math.ceil((engine.load.heatingBtuh / 0.95) / 20000) * 20000);
        const cost = (input / 10000) * card.equipmentDefaults.furnacePer10kBtu;
        lines.push({ id: "eq-furnace", name: `${Math.round(input / 1000)}k BTU 95% AFUE gas furnace (matched)`, quantity: 1, unitPrice: markup(cost, card.equipmentMarkupPct), unit: "each", basis: "estimated", note: `Sized from the ${engine.load.heatingBtuh.toLocaleString("en-US")} BTU/h heating load ÷ 0.95 AFUE, rounded up — swap for a catalog row` });
      }
      const coil = pickCompanion(catalog, "coil", tons);
      const cp = coil ? equipmentPrice(coil, card) : { price: markup(tons * card.equipmentDefaults.coilPerTon, card.equipmentMarkupPct), basis: "estimated" as LineBasis, note: "Rate-card default per ton" };
      lines.push({ id: "eq-coil", name: coil ? `${coil.brand} ${coil.model} — matched evaporator coil` : `${tons}-ton matched evaporator coil`, quantity: 1, unitPrice: cp.price, unit: "each", basis: cp.basis, note: cp.note });
    } else {
      const ah = pickCompanion(catalog, "air-handler", tons);
      const ap = ah ? equipmentPrice(ah, card) : { price: markup(tons * card.equipmentDefaults.airHandlerPerTon, card.equipmentMarkupPct), basis: "estimated" as LineBasis, note: "Rate-card default per ton" };
      lines.push({ id: "eq-ah", name: ah ? `${ah.brand} ${ah.model} — matched air handler` : `${tons}-ton matched air handler`, quantity: 1, unitPrice: ap.price, unit: "each", basis: ap.basis, note: ap.note });
      if (item.kind === "heat-pump") {
        const kw = Math.max(5, Math.ceil((chosen.backupKw ?? 0) / 5) * 5);
        lines.push({ id: "eq-strips", name: `${kw} kW backup heat kit`, quantity: 1, unitPrice: markup(kw * card.materials.backupHeatKitPerKw, card.materialsMarkupPct), unit: "each", basis: "estimated", note: chosen.backupKw ? `${chosen.backupKw} kW short at ${engine.conditions.heatingF} °F design, rounded to the next 5 kW kit` : "Minimum kit for defrost and emergency heat" });
      }
    }
  }
  return lines;
}

function pickCompanion(catalog: CatalogItem[], kind: CatalogItem["kind"], tons: number, heatingBtuh?: number): CatalogItem | undefined {
  const rows = catalog.filter((c) => c.kind === kind);
  if (!rows.length) return undefined;
  if (kind === "furnace" && heatingBtuh) {
    // Smallest furnace whose output covers the load (Manual S: 100–140%).
    return rows
      .filter((c) => (c.btuInput ?? 0) * (c.afue ?? 0.8) >= heatingBtuh)
      .sort((a, b) => (a.btuInput ?? 0) - (b.btuInput ?? 0))[0] ?? rows.sort((a, b) => (b.btuInput ?? 0) - (a.btuInput ?? 0))[0];
  }
  return rows.filter((c) => (c.tons ?? 0) >= tons).sort((a, b) => (a.tons ?? 0) - (b.tons ?? 0))[0] ?? rows[rows.length - 1];
}

/** Everything the page prices, from the engine's answer and the shop's card. */
export function buildLedger(engine: EngineResult, m: BuildingModel, card: HvacRateCard, catalog: CatalogItem[], opts: { linesetFt?: number } = {}): Ledger {
  const chosen = engine.selection.chosen;
  const mat: LedgerLine[] = [];
  const lab: LedgerLine[] = [];
  const crew = crewRate(card);
  const mk = (c: number) => markup(c, card.materialsMarkupPct);
  const isPackage = chosen?.item.kind === "package" || m.existing.kind === "package-unit";
  const isDuctless = chosen?.item.kind === "ductless";
  const tons = chosen?.item.tons ?? engine.selection.targetTons;
  const check = (id: string) => engine.checks.find((c) => c.id === id)?.status;

  const n = engine.selection.systems || 1;
  if (chosen) {
    for (const l of equipmentLines(chosen, m, { ...engine, load: n > 1 && engine.selection.perSystem ? { ...engine.load, ...engine.selection.perSystem } : engine.load }, card, catalog)) {
      mat.push(n > 1 ? { ...l, quantity: n, note: `${l.note ? l.note + " · " : ""}one per system, ${n} systems` } : l);
    }
  } else mat.push({ id: "eq-main", name: `${engine.selection.targetTons}-ton system (no catalog match — pick a unit)`, quantity: 1, unitPrice: markup(engine.selection.targetTons * card.equipmentDefaults.heatPumpPerTon, card.equipmentMarkupPct), unit: "each", basis: "estimated", note: "Rate-card default per ton until a catalog row fits" });

  if (!isPackage) {
    const linesetFt = opts.linesetFt ?? card.linesetFtDefault;
    mat.push({ id: "m-lineset", name: "Line set, insulated copper", quantity: linesetFt * n, unitPrice: mk(card.materials.linesetPerFt), unit: "ln ft", basis: opts.linesetFt ? "entered" : "estimated", note: opts.linesetFt ? "Length entered" : `Default ${card.linesetFtDefault} ft — measure the run` });
    mat.push({ id: "m-pad", name: "Condenser pad", quantity: n, unitPrice: mk(card.materials.pad), unit: "each", basis: "estimated" });
  }
  mat.push({ id: "m-disc", name: "Outdoor disconnect + whip", quantity: n, unitPrice: mk(card.materials.disconnect + card.materials.whipKit), unit: "each", basis: "estimated" });
  mat.push({ id: "m-drain", name: "Condensate drain kit, trap and safety switch", quantity: n, unitPrice: mk(card.materials.drainKit), unit: "each", basis: "estimated" });
  if (m.ducts.location === "attic") mat.push({ id: "m-pump", name: "Secondary drain pan / condensate pump (attic unit)", quantity: 1, unitPrice: mk(card.materials.condensatePump), unit: "each", basis: "estimated", note: "Attic air handler" });
  mat.push({ id: "m-tstat", name: chosen?.item.staging === "variable" ? "Communicating thermostat" : "Programmable thermostat", quantity: n, unitPrice: mk(card.materials.thermostat * (chosen?.item.staging === "variable" ? 1.6 : 1)), unit: "each", basis: "estimated" });
  mat.push({ id: "m-surge", name: "Surge protector, outdoor unit", quantity: n, unitPrice: mk(card.materials.surgeProtector), unit: "each", basis: "estimated" });
  if (chosen?.item.kind === "air-conditioner" && m.gas.available !== false) mat.push({ id: "m-gasflex", name: "Gas flex connector, shutoff and drip leg", quantity: 1, unitPrice: mk(card.materials.gasFlexKit), unit: "each", basis: "estimated" });

  const serviceFix = check("service") === "fix";
  if (serviceFix || chosen?.item.kind === "heat-pump") {
    const runFt = 40;
    mat.push({ id: "m-breaker", name: serviceFix ? "Breaker + branch circuit for the new unit (service upgrade quoted separately)" : "Breaker + branch circuit for the outdoor unit", quantity: runFt, unitPrice: mk(card.materials.breakerAndWirePerFt), unit: "ln ft", basis: "estimated", note: `${runFt} ft run assumed — measure panel to pad` });
  }
  if (check("return") === "fix") mat.push({ id: "m-return", name: "Return grille and duct upsize", quantity: 1, unitPrice: mk(card.materials.returnGrilleUpsize), unit: "each", basis: "estimated", note: engine.checks.find((c) => c.id === "return")?.detail });
  if (check("duct-cond") === "fix" || m.ducts.condition === "poor") mat.push({ id: "m-seal", name: "Duct sealing (mastic, tape, collars)", quantity: 1, unitPrice: mk(card.materials.ductSealKit), unit: "lot", basis: "estimated" });

  const assumptions = engine.notes.filter((x) => x.kind === "assumption").map((x) => x.text);

  // Labour, two-person crew.
  const push = (id: string, name: string, hours: number, note?: string, perSystem = true) => lab.push({ id, name, quantity: perSystem ? hours * n : hours, unitPrice: crew, unit: "hour", basis: "estimated", note: perSystem && n > 1 ? `${note ? note + " · " : ""}${hours} h × ${n} systems` : note });
  push("l-remove", isPackage ? "Remove and recover the old package unit (EPA 608)" : "Remove old split system, recover refrigerant (EPA 608)", isPackage ? card.hours.removePackage : card.hours.removeSplit);
  if (isPackage) push("l-set", "Set the package unit, curb adapter, connections", card.hours.setPackage);
  else if (isDuctless) push("l-set", "Mount the outdoor unit and indoor heads", card.hours.setOutdoor + card.hours.setAirHandler);
  else {
    push("l-outdoor", "Set the outdoor unit on the pad", card.hours.setOutdoor);
    const indoorFurnace = mat.some((l) => l.id === "eq-furnace");
    push("l-indoor", indoorFurnace ? "Set the furnace and coil, flue and gas" : "Set the air handler", indoorFurnace ? card.hours.setFurnace + card.hours.setCoil : card.hours.setAirHandler);
    push("l-lineset", "Braze the line set, pressure test, evacuate to 500 microns", card.hours.lineset);
  }
  push("l-elec", serviceFix ? "Electrical: new circuit and disconnect (panel work quoted separately)" : "Electrical: disconnect, whip, thermostat wire", serviceFix ? card.hours.electricalUpgradeRun : card.hours.electrical);
  if (check("gas") === "fix") push("l-gas", "Gas pipe upsizing to the furnace", card.hours.gasPipe, engine.checks.find((c) => c.id === "gas")?.detail);
  if (check("return") === "fix") push("l-return", "Cut in and duct the larger return", card.hours.returnUpsize);
  if (check("duct-cond") === "fix" || m.ducts.condition === "poor") push("l-seal", "Seal and re-hang accessible ducts", card.hours.ductSeal);
  push("l-tstat", "Thermostat install and setup", card.hours.thermostat);
  push("l-startup", "Start-up, charge, airflow and static check, homeowner walkthrough", card.hours.startup);
  if (n > 1) assumptions.push(`${n} systems, one per zone — the zoning (which rooms go on which system) is confirmed on site.`);

  lab.push({ id: "l-permit", name: "Mechanical permit and inspection", quantity: 1, unitPrice: card.permitFee, unit: "lot", basis: "estimated" });
  lab.push({ id: "l-disposal", name: "Haul-off and disposal of old equipment", quantity: 1, unitPrice: card.disposalFee, unit: "lot", basis: "estimated" });
  if (isPackage) lab.push({ id: "l-crane", name: "Crane / lift", quantity: 1, unitPrice: card.craneFee, unit: "lot", basis: "estimated" });

  assumptions.push(`Priced from the shop rate card: crew $${crew}/h, equipment +${card.equipmentMarkupPct}%, materials +${card.materialsMarkupPct}%.`);
  if (serviceFix) assumptions.push("The panel is short for this unit by the NEC 220.83 count — the service upgrade is not in these lines.");

  const subtotal = r2([...mat, ...lab].reduce((a, l) => a + l.quantity * l.unitPrice, 0));
  const c = engine.conditions;
  const l = engine.load;
  const sys = chosen ? `${chosen.item.brand} ${chosen.item.model}` : `${engine.selection.targetTons}-ton system`;
  const scope = [
    `Replace the existing ${existingWords(m)} at ${m.address} with ${n > 1 ? `${n} systems, each a ${tons}-ton ${chosen ? kindPhrase(chosen.item) : "system"} (${sys}), one per zone` : `a ${tons}-ton ${chosen ? kindPhrase(chosen.item) : "system"} (${sys})`}.`,
    `Design load ${l.coolingTotalBtuh.toLocaleString("en-US")} BTU/h cooling and ${l.heatingBtuh.toLocaleString("en-US")} BTU/h heating at ${c.coolingF} °F / ${c.heatingF} °F design conditions for ${c.county ? `${c.county} County, ` : ""}${c.state}, ${m.conditionedSqft.toLocaleString("en-US")} sq ft conditioned.`,
    `Includes removal and refrigerant recovery, new equipment set, line set, electrical disconnect, drain, thermostat, start-up and commissioning, permit and disposal.`,
  ].join(" ");

  return {
    title: `${n > 1 ? `${n} × ` : ""}${chosen ? kindTitle(chosen.item) : "HVAC"} replacement — ${m.address.split(",")[0]}`,
    scope,
    materials: mat,
    labor: lab,
    assumptions,
    subtotal,
  };
}

function existingWords(m: BuildingModel): string {
  const e = m.existing;
  const age = e.yearMade ? ` (${new Date().getFullYear() - e.yearMade} years old)` : "";
  const size = e.tons ? `${e.tons}-ton ` : "";
  switch (e.kind) {
    case "split-heat-pump": return `${size}heat pump${age}`;
    case "package-unit": return `${size}package unit${age}`;
    case "furnace-only": return `furnace${age}`;
    case "ductless": return `ductless system${age}`;
    case "none": return "heating and cooling (none on site)";
    default: return `${size}AC and furnace${age}`;
  }
}
function kindPhrase(i: CatalogItem): string {
  switch (i.kind) {
    case "heat-pump": return `${i.coldClimate ? "cold-climate " : ""}${i.staging === "variable" ? "variable-speed " : ""}heat pump`;
    case "air-conditioner": return `${i.staging === "variable" ? "variable-speed " : ""}air conditioner with matched furnace`;
    case "package": return "package unit";
    case "ductless": return "ductless heat pump";
    default: return i.kind;
  }
}
function kindTitle(i: CatalogItem): string {
  return i.kind === "heat-pump" ? "Heat pump" : i.kind === "air-conditioner" ? "AC + furnace" : i.kind === "package" ? "Package unit" : i.kind === "ductless" ? "Ductless" : "HVAC";
}

/** A catalog with enough rows to price a job before the shop uploads its own —
 *  typical residential ladders, no shop cost (so the rate-card default per ton
 *  applies and every equipment line says so). Ratings are representative
 *  entry-tier figures, not any maker's published values. */
export const STARTER_CATALOG: CatalogItem[] = [
  ...([1.5, 2, 2.5, 3, 3.5, 4, 5] as const).flatMap((t): CatalogItem[] => [
    { id: `st-ac-${t}`, kind: "air-conditioner", brand: "Starter", model: `AC14-${String(t * 12).padStart(3, "0")}`, refrigerant: "R-454B", staging: "single", tons: t, coolingBtuh: t * 12000, seer2: 14.3, eer2: 11.7, source: "shop" },
    { id: `st-hp-${t}`, kind: "heat-pump", brand: "Starter", model: `HP15-${String(t * 12).padStart(3, "0")}`, refrigerant: "R-454B", staging: "single", tons: t, coolingBtuh: t * 12000, heat47Btuh: Math.round(t * 12000 * 1.02), heat17Btuh: Math.round(t * 12000 * 0.62), heat5Btuh: Math.round(t * 12000 * 0.5), seer2: 15.2, hspf2: 7.8, source: "shop" },
    { id: `st-cchp-${t}`, kind: "heat-pump", brand: "Starter", model: `CCHP18-${String(t * 12).padStart(3, "0")}`, refrigerant: "R-454B", staging: "variable", tons: t, coolingBtuh: t * 12000, heat47Btuh: Math.round(t * 12000 * 1.05), heat17Btuh: Math.round(t * 12000 * 0.85), heat5Btuh: Math.round(t * 12000 * 0.72), seer2: 18, hspf2: 9, coldClimate: true, source: "shop" },
    { id: `st-coil-${t}`, kind: "coil", brand: "Starter", model: `CL-${String(t * 12).padStart(3, "0")}`, tons: t, source: "shop" },
    { id: `st-ah-${t}`, kind: "air-handler", brand: "Starter", model: `AH-${String(t * 12).padStart(3, "0")}`, tons: t, ratedStaticInWc: 0.5, source: "shop" },
  ]),
  ...([40, 60, 80, 100, 120] as const).map((k): CatalogItem => ({ id: `st-fur-${k}`, kind: "furnace", brand: "Starter", model: `G96-${String(k).padStart(3, "0")}`, btuInput: k * 1000, afue: 0.96, ratedStaticInWc: 0.5, source: "shop" })),
];

// ── catalog CSV ─────────────────────────────────────────────────────────────

/** Header the import understands; extra columns are ignored. */
export const CATALOG_CSV_COLUMNS = ["kind", "brand", "model", "tons", "coolingBtuh", "heat47Btuh", "heat17Btuh", "heat5Btuh", "btuInput", "afue", "seer2", "eer2", "hspf2", "refrigerant", "staging", "coldClimate", "ahriRef", "mcaAmps", "ratedStaticInWc", "cost"] as const;

const KINDS = new Set<CatalogItem["kind"]>(["heat-pump", "air-conditioner", "furnace", "air-handler", "coil", "ductless", "package"]);

/** Parse a shop's catalog CSV. Rows that do not name a kind, brand and model are
 *  reported, not silently dropped. */
export function parseCatalogCsv(text: string): { items: CatalogItem[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  if (!lines.length) return { items: [], errors: ["The file is empty."] };
  const header = splitCsv(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const col = { kind: idx("kind"), brand: idx("brand"), model: idx("model") };
  if (col.kind < 0 || col.brand < 0 || col.model < 0) return { items: [], errors: ["The header needs at least kind, brand and model columns."] };
  const num = (cells: string[], name: string): number | undefined => {
    const i = idx(name);
    if (i < 0) return undefined;
    const v = Number(String(cells[i] ?? "").replace(/[$,%\s]/g, ""));
    return Number.isFinite(v) && cells[i] !== "" ? v : undefined;
  };
  const str = (cells: string[], name: string): string | undefined => {
    const i = idx(name);
    const v = i >= 0 ? String(cells[i] ?? "").trim() : "";
    return v || undefined;
  };
  const items: CatalogItem[] = [];
  lines.slice(1).forEach((line, n) => {
    const cells = splitCsv(line);
    const kind = kindFromWord(String(cells[col.kind] ?? ""));
    const brand = String(cells[col.brand] ?? "").trim();
    const model = String(cells[col.model] ?? "").trim();
    if (!KINDS.has(kind) || !brand || !model) {
      errors.push(`Row ${n + 2}: needs kind (${[...KINDS].join(", ")}), brand and model.`);
      return;
    }
    const refr = (str(cells, "refrigerant") ?? "").toUpperCase().replace(/\s/g, "");
    const staging = (str(cells, "staging") ?? "").toLowerCase();
    const afueRaw = num(cells, "afue");
    items.push({
      id: `${kind}-${brand}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      kind, brand, model,
      tons: num(cells, "tons"),
      coolingBtuh: num(cells, "coolingBtuh"),
      heat47Btuh: num(cells, "heat47Btuh"),
      heat17Btuh: num(cells, "heat17Btuh"),
      heat5Btuh: num(cells, "heat5Btuh"),
      btuInput: num(cells, "btuInput"),
      afue: afueRaw === undefined ? undefined : afueRaw > 1 ? afueRaw / 100 : afueRaw,
      seer2: num(cells, "seer2"),
      eer2: num(cells, "eer2"),
      hspf2: num(cells, "hspf2"),
      refrigerant: /410/.test(refr) ? "R-410A" : /454/.test(refr) ? "R-454B" : /32/.test(refr) ? "R-32" : /22/.test(refr) ? "R-22" : refr ? "other" : undefined,
      staging: staging.startsWith("var") ? "variable" : staging.startsWith("two") || staging === "2" ? "two-stage" : staging ? "single" : undefined,
      coldClimate: /^(y|yes|true|1)$/i.test(str(cells, "coldClimate") ?? ""),
      ahriRef: str(cells, "ahriRef"),
      mcaAmps: num(cells, "mcaAmps"),
      ratedStaticInWc: num(cells, "ratedStaticInWc"),
      cost: num(cells, "cost"),
      source: "shop",
    });
  });
  return { items, errors };
}

/** "AC", "a/c", "condenser", "heat pump", "mini split", "RTU" → the closed set. */
function kindFromWord(raw: string): CatalogItem["kind"] {
  const w = raw.trim().toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (!w) return "" as CatalogItem["kind"];
  if (/^(ac|a c|air conditioner|air conditioning|condenser|condensing unit|straight cool)$/.test(w)) return "air-conditioner";
  if (/^(hp|heat pump|heatpump|ashp|ccashp)$/.test(w)) return "heat-pump";
  if (/^(furnace|gas furnace)$/.test(w)) return "furnace";
  if (/^(ah|air handler|airhandler|fan coil)$/.test(w)) return "air-handler";
  if (/^(coil|evap coil|evaporator coil|cased coil)$/.test(w)) return "coil";
  if (/^(ductless|mini split|minisplit|multi split)$/.test(w)) return "ductless";
  if (/^(package|packaged|package unit|rtu|rooftop)$/.test(w)) return "package";
  return w.replace(/ /g, "-") as CatalogItem["kind"];
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

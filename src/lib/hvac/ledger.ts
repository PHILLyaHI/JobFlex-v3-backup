// The ledger — how an engine result becomes priced lines, for the job the
// contractor picked (src/lib/hvac/jobs.ts).
//
// Deterministic on purpose: the same building, job, unit and rate card give
// the same lines every time, and every line names where its quantity came
// from. Labor is priced by the task in dollars against a real measure — per
// unit set, per ln ft of line set, per register, per lb — never by the hour.
// The model never prices anything here. The shop's rate card is the org's own
// and lives beside the catalog; what ships below is a defensible starting card
// a contractor edits once.

import type { BuildingModel, CatalogItem, EngineResult , SelectionCandidate } from "./types";
import { serviceTask, type ServiceTask } from "./serviceMenu";
import { DEFAULT_JOB, jobDef, type JobInput, type JobKind } from "./jobs";
import { waterHeaterPlan } from "./waterHeater";

export interface HvacRateCard {
  version: 2;
  /** On the shop's equipment cost. */
  equipmentMarkupPct: number;
  /** On stock materials. */
  materialsMarkupPct: number;
  permitFee: number;
  disposalFee: number;
  /** Rooftop / package units only. */
  craneFee: number;
  /** Labor, priced by the task in dollars — per each, per ln ft, per register,
   *  per lb — never by the hour. The ledger writes the measure beside it. */
  labor: {
    removeSplit: number;
    removePackage: number;
    removeOutdoor: number;
    removeFurnace: number;
    removeWaterHeater: number;
    setOutdoor: number;
    setAirHandler: number;
    setFurnace: number;
    setCoil: number;
    setPackage: number;
    setHead: number;
    setWaterHeater: number;
    /** Braze, pressure test, evacuate — per ln ft of run. */
    linesetPerFt: number;
    /** Flush and reuse the existing run. */
    linesetFlush: number;
    /** A new circuit from the panel. */
    electricalCircuit: number;
    /** Disconnect, whip, thermostat wire on an existing circuit. */
    electricalConnect: number;
    gasPipePerFt: number;
    gasConnect: number;
    ventingPerFt: number;
    returnUpsize: number;
    ductSealPerRegister: number;
    ductRunReplace: number;
    ductTrunkLot: number;
    ductInsulatePerRun: number;
    thermostat: number;
    /** Start-up, charge, airflow and static, homeowner walkthrough — per system. */
    startup: number;
    diagnostic: number;
    refrigerantPerLb: number;
    repairEach: number;
  };
  /** Stock prices, shop cost. */
  /** The shop's own service tasks, saved from the page; they join the menu. */
  serviceMenu?: ServiceTask[];
  materials: {
    pad: number;
    linesetPerFt: number;
    lineCoverPerHead: number;
    disconnect: number;
    whipKit: number;
    drainKit: number;
    condensatePump: number;
    thermostat: number;
    surgeProtector: number;
    gasFlexKit: number;
    ventKit: number;
    bVentKit: number;
    breakerAndWirePerFt: number;
    breaker: number;
    returnGrilleUpsize: number;
    ductSealKit: number;
    ductRunEach: number;
    ductTrunkLot: number;
    backupHeatKitPerKw: number;
    refrigerantPerLb: number;
    expansionTank: number;
    drainPan: number;
    waterFlexLines: number;
    tpDrainKit: number;
    seismicStraps: number;
    hpwhCondensateKit: number;
    /** Condensing furnace / tankless: condensate neutralizer and drain. */
    neutralizer: number;
    /** A2L coil on a furnace not listed for it: sensor + mitigation board. */
    a2lSensorKit: number;
    /** Tankless: isolation / flush valve kit. */
    isoValveKit: number;
    ductInsulationPerRun: number;
    coAlarm: number;
    refrigerantR22PerLb: number;
  };
  /** Used when a catalog row carries no cost. */
  equipmentDefaults: {
    airConditionerPerTon: number;
    heatPumpPerTon: number;
    coldClimateHeatPumpPerTon: number;
    packagePerTon: number;
    ductlessPerTon: number;
    ductlessHeadEach: number;
    coilPerTon: number;
    airHandlerPerTon: number;
    furnacePer10kBtu: number;
    waterHeaterGasPerGal: number;
    waterHeaterElectricPerGal: number;
    heatPumpWaterHeaterEach: number;
    tanklessGasEach: number;
  };
  /** Default line-set run when nobody measured it. */
  linesetFtDefault: number;
}

export const DEFAULT_RATE_CARD: HvacRateCard = {
  version: 2,
  equipmentMarkupPct: 35,
  materialsMarkupPct: 25,
  permitFee: 250,
  disposalFee: 150,
  craneFee: 450,
  labor: {
    removeSplit: 450,
    removePackage: 450,
    removeOutdoor: 250,
    removeFurnace: 300,
    removeWaterHeater: 150,
    setOutdoor: 450,
    setAirHandler: 600,
    setFurnace: 750,
    setCoil: 375,
    setPackage: 750,
    setHead: 350,
    setWaterHeater: 450,
    linesetPerFt: 14,
    linesetFlush: 225,
    electricalCircuit: 375,
    electricalConnect: 225,
    gasPipePerFt: 18,
    gasConnect: 150,
    ventingPerFt: 12,
    returnUpsize: 600,
    ductSealPerRegister: 45,
    ductRunReplace: 220,
    ductTrunkLot: 1400,
    ductInsulatePerRun: 35,
    thermostat: 150,
    startup: 300,
    diagnostic: 129,
    refrigerantPerLb: 90,
    repairEach: 250,
  },
  materials: {
    pad: 85,
    linesetPerFt: 9,
    lineCoverPerHead: 65,
    disconnect: 45,
    whipKit: 40,
    drainKit: 60,
    condensatePump: 95,
    thermostat: 180,
    surgeProtector: 130,
    gasFlexKit: 55,
    ventKit: 120,
    bVentKit: 85,
    breakerAndWirePerFt: 4.5,
    breaker: 60,
    returnGrilleUpsize: 220,
    ductSealKit: 180,
    ductRunEach: 95,
    ductTrunkLot: 900,
    backupHeatKitPerKw: 45,
    refrigerantPerLb: 18,
    expansionTank: 60,
    drainPan: 40,
    waterFlexLines: 45,
    tpDrainKit: 30,
    seismicStraps: 30,
    hpwhCondensateKit: 40,
    neutralizer: 60,
    a2lSensorKit: 185,
    isoValveKit: 85,
    ductInsulationPerRun: 28,
    coAlarm: 45,
    refrigerantR22PerLb: 75,
  },
  equipmentDefaults: {
    airConditionerPerTon: 950,
    heatPumpPerTon: 1250,
    coldClimateHeatPumpPerTon: 1700,
    packagePerTon: 1500,
    ductlessPerTon: 1400,
    ductlessHeadEach: 650,
    coilPerTon: 350,
    airHandlerPerTon: 550,
    furnacePer10kBtu: 200,
    waterHeaterGasPerGal: 26,
    waterHeaterElectricPerGal: 18,
    heatPumpWaterHeaterEach: 2100,
    tanklessGasEach: 1400,
  },
  linesetFtDefault: 25,
};

/** Any saved card → a v2 card. A v1 card (hours × crew rate, 2026-09-15) is
 *  converted task by task at its own crew rate; anything missing takes the
 *  default; unknown keys are dropped. */
export function normalizeRateCard(raw: unknown): HvacRateCard {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const numOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  const group = <K extends "labor" | "materials" | "equipmentDefaults">(key: K): HvacRateCard[K] => {
    const src = (r[key] && typeof r[key] === "object" ? r[key] : {}) as Record<string, unknown>;
    const out = { ...DEFAULT_RATE_CARD[key] } as Record<string, number>;
    for (const k of Object.keys(out)) out[k] = numOr(src[k], out[k]);
    return out as HvacRateCard[K];
  };
  const card: HvacRateCard = {
    version: 2,
    equipmentMarkupPct: numOr(r.equipmentMarkupPct, DEFAULT_RATE_CARD.equipmentMarkupPct),
    materialsMarkupPct: numOr(r.materialsMarkupPct, DEFAULT_RATE_CARD.materialsMarkupPct),
    permitFee: numOr(r.permitFee, DEFAULT_RATE_CARD.permitFee),
    disposalFee: numOr(r.disposalFee, DEFAULT_RATE_CARD.disposalFee),
    craneFee: numOr(r.craneFee, DEFAULT_RATE_CARD.craneFee),
    labor: group("labor"),
    materials: group("materials"),
    equipmentDefaults: group("equipmentDefaults"),
    linesetFtDefault: numOr(r.linesetFtDefault, DEFAULT_RATE_CARD.linesetFtDefault),
    serviceMenu: Array.isArray(r.serviceMenu) ? (r.serviceMenu as unknown[]).flatMap((t) => {
      const x = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      if (typeof x.id !== "string" || typeof x.title !== "string" || typeof x.laborUsd !== "number") return [];
      const part = x.part && typeof x.part === "object" ? (x.part as Record<string, unknown>) : null;
      const row: ServiceTask = { id: x.id.slice(0, 80), group: "custom", title: x.title.slice(0, 120), includes: typeof x.includes === "string" ? x.includes.slice(0, 240) : "", laborUsd: numOr(x.laborUsd, 0), custom: true };
      if (part && typeof part.name === "string" && typeof part.costUsd === "number") row.part = { name: part.name.slice(0, 120), costUsd: numOr(part.costUsd, 0), brands: Array.isArray(part.brands) ? (part.brands as unknown[]).filter((b): b is string => typeof b === "string").slice(0, 6) : undefined };
      return [row];
    }).slice(0, 60) : undefined,
  };
  // v1: hours by task at tech + helper per hour.
  const hours = r.hours && typeof r.hours === "object" ? (r.hours as Record<string, unknown>) : null;
  if (hours && !r.labor) {
    const rate = numOr(r.laborRatePerHour, 95) + numOr(r.helperRatePerHour, 55);
    const h = (k: string) => (typeof hours[k] === "number" ? (hours[k] as number) : undefined);
    const put = (k: keyof HvacRateCard["labor"], hrs: number | undefined) => { if (hrs !== undefined) card.labor[k] = Math.round(hrs * rate); };
    put("removeSplit", h("removeSplit"));
    put("removePackage", h("removePackage"));
    put("setOutdoor", h("setOutdoor"));
    put("setAirHandler", h("setAirHandler"));
    put("setFurnace", h("setFurnace"));
    put("setCoil", h("setCoil"));
    put("setPackage", h("setPackage"));
    put("electricalConnect", h("electrical"));
    put("electricalCircuit", h("electricalUpgradeRun"));
    put("returnUpsize", h("returnUpsize"));
    put("thermostat", h("thermostat"));
    put("startup", h("startup"));
    const ls = h("lineset");
    if (ls !== undefined) card.labor.linesetPerFt = Math.round((ls * rate) / card.linesetFtDefault);
    const gas = h("gasPipe");
    if (gas !== undefined) card.labor.gasPipePerFt = Math.round((gas * rate) / 20);
    const seal = h("ductSeal");
    if (seal !== undefined) card.labor.ductSealPerRegister = Math.round((seal * rate) / 8);
  }
  return card;
}

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

export interface LedgerOptions {
  /** A catalog id the contractor chose by hand (the water-heater job picks by
   *  plan otherwise; the other jobs carry the pick in engine.selection). */
  pick?: string;
  job?: JobKind;
  input?: JobInput;
  linesetFt?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const markup = (cost: number, pct: number) => r2(cost * (1 + pct / 100));

/** What a tier costs against the rate card's per-ton default, when the row
 *  carries no shop cost: a two-stage 16 SEER2 unit runs about a third more
 *  than the 14.3 single-stage, a variable-speed 18+ about three quarters
 *  more; an 80% furnace is the cheap one, a modulating 97% the dear one. */
const TIER_FACTOR: Record<NonNullable<CatalogItem["tier"]>, { cooling: number; furnace: number }> = { value: { cooling: 1, furnace: 0.8 }, mid: { cooling: 1.3, furnace: 1 }, premium: { cooling: 1.75, furnace: 1.4 } };

function equipmentPrice(item: CatalogItem, card: HvacRateCard): { price: number; basis: LineBasis; note: string } {
  const d = card.equipmentDefaults;
  if (item.cost && item.cost > 0) return { price: markup(item.cost, card.equipmentMarkupPct), basis: "entered", note: `${item.typed ? "Typed in — cost" : "Shop cost"} $${item.cost.toLocaleString("en-US")} + ${card.equipmentMarkupPct}%` };
  const tons = item.tons ?? (item.coolingBtuh ? item.coolingBtuh / 12000 : 0);
  const tier = item.tier ? TIER_FACTOR[item.tier] : null;
  let cost = 0;
  switch (item.kind) {
    case "air-conditioner": cost = tons * d.airConditionerPerTon; break;
    case "heat-pump": cost = tons * (item.coldClimate ? d.coldClimateHeatPumpPerTon : d.heatPumpPerTon); break;
    case "package": cost = tons * d.packagePerTon; break;
    case "ductless": cost = tons * d.ductlessPerTon; break;
    case "coil": cost = tons * d.coilPerTon; break;
    case "air-handler": cost = tons * d.airHandlerPerTon; break;
    // Priced on output: an 80% cabinet burns 20% more input for the same heat.
    case "furnace": cost = (((item.btuInput ?? 60000) * (item.afue ?? 0.8)) / 10000) * d.furnacePer10kBtu; break;
    case "water-heater": cost = item.whType === "tankless" ? d.tanklessGasEach : item.whType === "heat-pump" ? d.heatPumpWaterHeaterEach : (item.gallons ?? 50) * (item.fuel === "electric" ? d.waterHeaterElectricPerGal : d.waterHeaterGasPerGal); break;
  }
  if (tier && (item.kind === "air-conditioner" || item.kind === "heat-pump" || item.kind === "package" || item.kind === "ductless")) cost *= tier.cooling;
  if (tier && item.kind === "furnace") cost *= tier.furnace;
  return { price: markup(cost, card.equipmentMarkupPct), basis: "estimated", note: `${item.typed ? "Typed in — no cost given" : "No shop cost on the catalog row"} — rate-card default per ${item.kind === "furnace" ? "10k BTU" : "ton"}${item.tier ? ` × ${item.tier} tier` : ""} + ${card.equipmentMarkupPct}%` };
}

/** The indoor half of the system: the smallest row that carries the load,
 *  from the outdoor unit's own brand first (a matched system), and from its
 *  sales tier when that brand offers one (Good = 80% furnace, Best = the
 *  modulating one), then whatever the catalog has. */
function pickCompanion(catalog: CatalogItem[], kind: CatalogItem["kind"], tons: number, heatingBtuh?: number, like?: { brand?: string; tier?: CatalogItem["tier"]; refrigerant?: CatalogItem["refrigerant"] }): CatalogItem | undefined {
  // A coil or air handler listed for another refrigerant is no match (the
  // TXV and the A2L board are refrigerant-specific); a furnace carries any.
  const rows = catalog.filter((c) => c.kind === kind && !(kind !== "furnace" && like?.refrigerant && c.refrigerant && c.refrigerant !== like.refrigerant));
  if (!rows.length) return undefined;
  const fit = (pool: CatalogItem[]): CatalogItem | undefined => {
    if (kind === "furnace" && heatingBtuh) {
      // Smallest furnace whose output covers the load (Manual S: 100–140%) AND
      // whose blower moves the coil's air (maxTons, when the row carries it).
      return pool
        .filter((c) => (c.maxTons ?? 99) >= tons && (c.btuInput ?? 0) * (c.afue ?? 0.8) >= heatingBtuh)
        .sort((a, b) => (a.btuInput ?? 0) - (b.btuInput ?? 0))[0];
    }
    return pool.filter((c) => (c.tons ?? 0) >= tons).sort((a, b) => (a.tons ?? 0) - (b.tons ?? 0))[0];
  };
  const brand = like?.brand?.toLowerCase();
  const own = brand ? rows.filter((c) => c.brand.toLowerCase() === brand) : [];
  const tier = like?.tier;
  const pools = [tier ? own.filter((c) => c.tier === tier) : [], own, tier ? rows.filter((c) => c.tier === tier) : [], rows];
  for (const pool of pools) { const hit = pool.length ? fit(pool) : undefined; if (hit) return hit; }
  // Nothing covers the load: the largest there is, own brand first.
  const last = own.length ? own : rows;
  return kind === "furnace" ? [...last].sort((a, b) => (b.btuInput ?? 0) - (a.btuInput ?? 0))[0] : [...last].sort((a, b) => (b.tons ?? 0) - (a.tons ?? 0))[0];
}

const KIND_WORD: Record<CatalogItem["kind"], string> = {
  "heat-pump": "heat pump", "air-conditioner": "condenser", furnace: "furnace", "air-handler": "air handler", coil: "coil", ductless: "ductless system (wall head + outdoor unit)", package: "package unit", "water-heater": "water heater",
};

function equipmentLine(id: string, item: CatalogItem, card: HvacRateCard, qty = 1, extraNote?: string): LedgerLine {
  const p = equipmentPrice(item, card);
  return {
    id,
    name: `${item.brand} ${item.model} — ${item.tons ? `${item.tons}-ton ` : ""}${item.kind === "furnace" && item.btuInput ? `${Math.round(item.btuInput / 1000)}k BTU ` : ""}${KIND_WORD[item.kind]}${item.seer2 ? ` · ${item.seer2} SEER2` : ""}${item.afue ? ` · ${Math.round(item.afue * 100)}% AFUE` : ""}${item.refrigerant ? ` · ${item.refrigerant}` : ""}`,
    quantity: qty, unitPrice: p.price, unit: "each", basis: p.basis, note: extraNote ? `${p.note} · ${extraNote}` : p.note,
  };
}

/** The house keeps a gas furnace with this system. */
/** The furnace the ledger would set under this outdoor unit (for the engine's gas check). */
export function companionFurnace(catalog: CatalogItem[], tons: number, heatingBtuh: number, like?: { brand?: string; tier?: CatalogItem["tier"] }): CatalogItem | undefined {
  return pickCompanion(catalog, "furnace", tons, heatingBtuh, like);
}

export function keepsGas(m: BuildingModel): boolean {
  if (m.gas.available === false || m.preferences.allElectric) return false;
  return m.preferences.keepGas === true || m.existing.fuel === "gas" || m.existing.fuel === "propane" || (m.existing.fuel === undefined && (m.existing.kind === "split-ac-furnace" || m.existing.kind === "furnace-only"));
}

/** Everything the page prices, from the engine's answer, the job and the shop's card. */
export function buildLedger(engine: EngineResult, m: BuildingModel, card: HvacRateCard, catalog: CatalogItem[], opts: LedgerOptions = {}): Ledger {
  const job = jobDef(opts.job ?? engine.job ?? DEFAULT_JOB);
  switch (job.id) {
    case "water-heater": return waterHeaterLedger(engine, m, card, opts, catalog);
    case "ducts": return ductsLedger(engine, m, card, opts);
    case "service": return serviceLedger(engine, m, card, opts);
    default: return systemLedger(job.id, engine, m, card, catalog, opts);
  }
}

function systemLedger(job: JobKind, engine: EngineResult, m: BuildingModel, card: HvacRateCard, catalog: CatalogItem[], opts: LedgerOptions): Ledger {
  const chosen = engine.selection.chosen;
  const mat: LedgerLine[] = [];
  const lab: LedgerLine[] = [];
  const mk = (c: number) => markup(c, card.materialsMarkupPct);
  const check = (id: string) => engine.checks.find((c) => c.id === id)?.status;
  const n = job === "ductless" ? 1 : engine.selection.systems || 1;
  const heads = job === "ductless" ? Math.max(1, Math.round(opts.input?.heads ?? 1)) : 0;
  const tons = chosen?.item.tons ?? engine.selection.targetTons;
  const isPackage = chosen?.item.kind === "package" || (!chosen && job === "replace-system" && m.existing.kind === "package-unit");
  const assumptions = engine.notes.filter((x) => x.kind === "assumption").map((x) => x.text);
  const sysNote = n > 1 ? `one per system, ${n} systems` : undefined;
  const task = (id: string, name: string, qty: number, unit: string, price: number, note?: string, basis: LineBasis = "estimated") => lab.push({ id, name, quantity: qty, unitPrice: price, unit, basis, note });
  const stock = (id: string, name: string, qty: number, unit: string, cost: number, note?: string, basis: LineBasis = "estimated") => mat.push({ id, name, quantity: qty, unitPrice: mk(cost), unit, basis, note });
  const gasHouse = keepsGas(m);
  const dualFuel = engine.dualFuel ?? (job === "heat-pump-conversion" && gasHouse);
  const allElectricHp = job === "heat-pump-conversion" && !gasHouse;
  // An outdoor swap that puts a heat pump where an AC was.
  const hpSwap = job === "replace-outdoor" && chosen?.item.kind === "heat-pump" && m.existing.kind !== "split-heat-pump";
  // What the coil sits in when the indoor unit stays.
  const indoorWord = gasHouse || m.existing.kind === "furnace-only" ? "furnace" : "air handler";
  const linesetFt = opts.linesetFt ?? card.linesetFtDefault;
  const linesetBasis: LineBasis = opts.linesetFt ? "entered" : "estimated";
  const linesetNote = opts.linesetFt ? "Length entered" : `Default ${card.linesetFtDefault} ft — measure the run`;

  // ── equipment ─────────────────────────────────────────────────────────────
  if (chosen) {
    const item = chosen.item;
    if (job === "ductless" && heads > 1) {
      // Several heads: a multi-zone outdoor unit with one port per head, sized
      // to the zone. The catalog's single-zone rows set the rating; the price is
      // the rate card's multi-zone default until the shop's multi-zone rows are in.
      mat.push({ id: "eq-main", name: `${heads}-zone ductless outdoor unit, ${tons} t (${heads} ports) — rated like ${item.brand} ${item.model}`, quantity: 1, unitPrice: markup(tons * card.equipmentDefaults.ductlessPerTon, card.equipmentMarkupPct), unit: "each", basis: "estimated", note: "Rate-card multi-zone default — import your multi-zone rows or edit" });
      mat.push({ id: "eq-heads", name: `Indoor head${heads === 1 ? "" : "s"} (wall-mount)`, quantity: heads, unitPrice: markup(card.equipmentDefaults.ductlessHeadEach, card.equipmentMarkupPct), unit: "each", basis: opts.input?.heads ? "entered" : "estimated", note: opts.input?.heads ? "Heads entered" : "One head assumed — set the count" });
    } else mat.push(equipmentLine("eq-main", item, card, job === "ductless" ? 1 : n, sysNote));
    if (job === "ductless") {
      // One head: the catalog pair (wall head + outdoor unit) is the whole system.
    } else if (item.kind === "air-conditioner" || item.kind === "heat-pump") {
      const wantsFurnace = job === "replace-system" && gasHouse && item.kind === "air-conditioner";
      // The coil is replaced when the refrigerant changes, when an AC becomes
      // a heat pump (a heat-pump-rated, AHRI-matched coil and TXV), when AC
      // is added to a furnace, and on a dual-fuel conversion.
      const wantsCoilOnly = job === "add-ac" || (job === "heat-pump-conversion" && dualFuel) || (job === "replace-outdoor" && (refrigerantChanges(m, item) || hpSwap));
      // An A2L coil in the unit that stays: the sensor and mitigation board —
      // only when the refrigerant actually changes to an A2L.
      if (wantsCoilOnly && (item.refrigerant === "R-454B" || item.refrigerant === "R-32") && m.existing.refrigerant !== item.refrigerant) mat.push({ id: "m-rds", name: `A2L refrigerant-detection sensor + mitigation board for the existing ${indoorWord}`, quantity: n, unitPrice: mk(card.materials.a2lSensorKit), unit: "each", basis: "estimated", note: `Required where the ${indoorWord} is not listed for A2L` });
      const wantsAirHandler = (job === "replace-system" && !wantsFurnace) || allElectricHp;
      if (wantsFurnace) {
        // On a zoned house each furnace carries its own zone's heat.
        const heat = engine.selection.perSystem?.heatingBtuh ?? engine.load.heatingBtuh;
        const furnace = pickCompanion(catalog, "furnace", tons, heat, item);
        if (furnace) {
          mat.push(equipmentLine("eq-furnace", furnace, card, n, sysNote));
          const out = (furnace.btuInput ?? 0) * (furnace.afue ?? 0.8);
          if (heat > 0 && out / heat > 1.4) assumptions.push(`The ${Math.round((furnace.btuInput ?? 0) / 1000)}k furnace is the smallest cabinet whose blower carries the ${tons}-t coil — ${Math.round((out / heat) * 100)}% of the ${n > 1 ? "zone's" : ""} heating load, over Manual S's 140%; confirm with the inspector or step the coil down.`);
        } else {
          const input = Math.max(40000, Math.ceil((heat / 0.95) / 20000) * 20000);
          mat.push({ id: "eq-furnace", name: `${Math.round(input / 1000)}k BTU 95% AFUE gas furnace (matched)`, quantity: n, unitPrice: markup(((input * 0.95) / 10000) * card.equipmentDefaults.furnacePer10kBtu, card.equipmentMarkupPct), unit: "each", basis: "estimated", note: `Sized from the ${engine.load.heatingBtuh.toLocaleString("en-US")} BTU/h heating load ÷ 0.95 AFUE — swap for a catalog row` });
        }
      }
      if (wantsFurnace || wantsCoilOnly) {
        const coil = pickCompanion(catalog, "coil", tons, undefined, item);
        const cp = coil ? equipmentPrice(coil, card) : { price: markup(tons * card.equipmentDefaults.coilPerTon, card.equipmentMarkupPct), basis: "estimated" as LineBasis, note: "Rate-card default per ton" };
        const why = job === "replace-outdoor" ? (refrigerantChanges(m, item) ? "the new refrigerant needs a matched coil" : `heat-pump-rated coil and TXV in the existing ${indoorWord}, matched to the new heat pump`) : dualFuel ? "on the existing furnace (dual fuel)" : undefined;
        mat.push({ id: "eq-coil", name: coil ? `${coil.brand} ${coil.model} — ${coil.brand === item.brand ? "matched evaporator coil" : "evaporator coil (cross-brand — confirm the AHRI match)"}` : `${tons}-ton matched evaporator coil`, quantity: n, unitPrice: cp.price, unit: "each", basis: cp.basis, note: [cp.note, why, sysNote].filter(Boolean).join(" · ") });
      }
      if (wantsAirHandler) {
        const ah = pickCompanion(catalog, "air-handler", tons, undefined, item);
        const ap = ah ? equipmentPrice(ah, card) : { price: markup(tons * card.equipmentDefaults.airHandlerPerTon, card.equipmentMarkupPct), basis: "estimated" as LineBasis, note: "Rate-card default per ton" };
        mat.push({ id: "eq-ah", name: ah ? `${ah.brand} ${ah.model} — ${ah.brand === item.brand ? "matched air handler" : "air handler (cross-brand — confirm the AHRI match)"}` : `${tons}-ton matched air handler`, quantity: n, unitPrice: ap.price, unit: "each", basis: ap.basis, note: [ap.note, sysNote].filter(Boolean).join(" · ") });
        if (item.kind === "heat-pump") {
          const kw = Math.max(5, Math.ceil((chosen.backupKw ?? 0) / 5) * 5);
          mat.push({ id: "eq-strips", name: `${kw} kW backup heat kit`, quantity: n, unitPrice: markup(kw * card.materials.backupHeatKitPerKw, card.materialsMarkupPct), unit: "each", basis: "estimated", note: chosen.backupKw ? `${chosen.backupKw} kW short at ${engine.conditions.heatingF} °F design, rounded to the next 5 kW kit` : "Minimum kit for defrost and emergency heat" });
        }
      }
    } else if (item.kind === "air-handler" && job === "replace-furnace") {
      // An electric furnace is the air handler plus a heat kit sized to the load.
      const kw = Math.max(5, Math.ceil(engine.load.heatingBtuh / 3412 / 5) * 5);
      mat.push({ id: "eq-strips", name: `${kw} kW heat kit`, quantity: n, unitPrice: markup(kw * card.materials.backupHeatKitPerKw, card.materialsMarkupPct), unit: "each", basis: "estimated", note: `${Math.round(engine.load.heatingBtuh / 1000)}k BTU/h heating load ÷ 3,412 W — confirm the breaker and the wire at the air handler` });
      if (m.existing.kind === "split-ac-furnace" || m.existing.kind === "split-heat-pump") task("l-recoil", "Re-set the existing coil in the new air handler", n, "each", card.labor.setCoil);
    } else if (item.kind === "furnace" && m.existing.kind === "split-ac-furnace") {
      task("l-recoil", "Re-set the existing coil on the new furnace", n, "each", card.labor.setCoil);
    }
  } else {
    const fallbackTons = engine.selection.targetTons;
    const perTon = job === "replace-furnace" ? 0 : job === "ductless" ? card.equipmentDefaults.ductlessPerTon : job === "add-ac" || job === "replace-outdoor" ? card.equipmentDefaults.airConditionerPerTon : card.equipmentDefaults.heatPumpPerTon;
    const heat = engine.selection.perSystem?.heatingBtuh ?? engine.load.heatingBtuh;
    if (job === "replace-furnace") {
      const input = Math.max(40000, Math.ceil((heat / 0.95) / 20000) * 20000);
      mat.push({ id: "eq-main", name: `${Math.round(input / 1000)}k BTU 95% AFUE gas furnace (no catalog match)`, quantity: 1, unitPrice: markup(((input * 0.95) / 10000) * card.equipmentDefaults.furnacePer10kBtu, card.equipmentMarkupPct), unit: "each", basis: "estimated", note: "Sized from the heating load — pick a catalog row" });
    } else if (isPackage) {
      // No package rows in the catalog: the unit is priced from the rate card's package default.
      mat.push({ id: "eq-main", name: `${fallbackTons}-ton ${gasHouse ? "gas/electric" : "heat-pump"} package unit (no catalog row — priced from the rate card)`, quantity: n, unitPrice: markup(fallbackTons * card.equipmentDefaults.packagePerTon, card.equipmentMarkupPct), unit: "each", basis: "estimated", note: "Rate-card package default per ton — add your package rows to pick a model" });
    } else mat.push({ id: "eq-main", name: `${fallbackTons}-ton ${job === "ductless" ? (heads > 1 ? `${heads}-zone ductless outdoor unit (${heads} ports)` : "ductless system, wall head + outdoor unit") : "unit"} (no catalog match — pick a unit)`, quantity: 1, unitPrice: markup(fallbackTons * perTon, card.equipmentMarkupPct), unit: "each", basis: "estimated", note: "Rate-card default per ton until a catalog row fits" });
    if (job === "ductless" && heads > 1) mat.push({ id: "eq-heads", name: "Indoor heads (wall-mount)", quantity: heads, unitPrice: markup(card.equipmentDefaults.ductlessHeadEach, card.equipmentMarkupPct), unit: "each", basis: "estimated" });
  }

  // ── stock ─────────────────────────────────────────────────────────────────
  const outdoorNew = job !== "replace-furnace";
  const indoorNew = job === "replace-system" || job === "replace-furnace" || allElectricHp;
  // The furnace job on an all-electric house: an air handler plus the heat kit.
  const electricFurnace = job === "replace-furnace" && chosen?.item.kind === "air-handler";
  const condensingFurnace = job === "replace-furnace" && !electricFurnace && (chosen?.item.kind !== "furnace" || (chosen.item.afue ?? 0.8) >= 0.9);
  const newLineset = job === "replace-system" || job === "add-ac" || job === "heat-pump-conversion" || job === "ductless" || (job === "replace-outdoor" && (refrigerantChanges(m, chosen?.item) || !!opts.linesetFt));
  if (outdoorNew && !isPackage) {
    if (job === "ductless") {
      stock("m-lineset", "Line set, insulated copper", linesetFt * heads, "ln ft", card.materials.linesetPerFt, `${linesetNote} · per head`, linesetBasis);
      stock("m-cover", "Line-hide cover kit", heads, "each", card.materials.lineCoverPerHead);
    } else if (newLineset) stock("m-lineset", "Line set, insulated copper", linesetFt * n, "ln ft", card.materials.linesetPerFt, linesetNote, linesetBasis);
    if (job !== "replace-outdoor" || m.existing.kind === "none") stock("m-pad", "Condenser pad", n, "each", card.materials.pad);
  }
  if (outdoorNew) {
    stock("m-disc", "Outdoor disconnect + whip", n, "each", card.materials.disconnect + card.materials.whipKit);
    stock("m-surge", "Surge protector, outdoor unit", n, "each", card.materials.surgeProtector);
  }
  const drains = job === "replace-furnace" ? (condensingFurnace || m.existing.kind === "split-ac-furnace" || m.existing.kind === "split-heat-pump") : indoorNew || job === "add-ac" || job === "ductless";
  if (drains) stock("m-drain", job === "ductless" ? "Condensate drain line, per head" : "Condensate drain kit, trap and safety switch", job === "ductless" ? heads : n, "each", card.materials.drainKit);
  if (drains && job !== "ductless" && !isPackage && m.ducts.location === "attic") stock("m-pump", "Secondary drain pan / condensate pump (attic unit)", 1, "each", card.materials.condensatePump, "Attic air handler");
  // A new thermostat comes with a new system, and with an AC that becomes a
  // heat pump (the old stat has no O/B or aux terminals); a like-for-like
  // outdoor swap keeps the one on the wall.
  if ((job !== "replace-outdoor" && job !== "ductless") || hpSwap) {
    const staged = chosen?.item.staging === "variable" || dualFuel || hpSwap;
    stock("m-tstat", dualFuel ? "Dual-fuel thermostat" : hpSwap ? "Heat-pump thermostat (O/B, aux heat)" : chosen?.item.staging === "variable" ? "Communicating thermostat" : "Programmable thermostat", n, "each", card.materials.thermostat * (staged ? 1.6 : 1));
  }
  if (job === "replace-system" && gasHouse && (chosen?.item.kind === "air-conditioner" || isPackage)) stock("m-gasflex", "Gas flex connector, shutoff and drip leg", n, "each", card.materials.gasFlexKit);
  // Nothing burns in an electric furnace: no vent, no neutralizer, no CO alarm.
  const newFurnace = (job === "replace-furnace" && !electricFurnace) || mat.some((l) => l.id === "eq-furnace");
  const furnaceRow = chosen?.item.kind === "furnace" ? chosen.item : catalog.find((c) => c.kind === "furnace" && mat.some((l) => l.id === "eq-furnace" && l.name.startsWith(`${c.brand} ${c.model}`)));
  const condensing = newFurnace && (furnaceRow ? (furnaceRow.afue ?? 0.8) >= 0.9 : true);
  const noGasHouse = m.gas.available === false;
  if (job === "replace-furnace" && !noGasHouse) stock("m-gasflex", "Gas flex connector, shutoff and drip leg", 1, "each", card.materials.gasFlexKit);
  if (newFurnace) {
    stock("m-vent", condensing ? "PVC vent and intake, termination and hangers" : "Vent kit (B-vent), termination and hangers", n, "each", condensing ? card.materials.ventKit : card.materials.bVentKit);
    if (condensing) stock("m-neut", "Condensate neutralizer and drain for the condensing furnace", n, "each", card.materials.neutralizer);
    stock("m-co", "Carbon-monoxide alarm", 1, "each", card.materials.coAlarm, "Required with a permit for fuel-fired work — skip if one is there");
  }

  const serviceFix = check("service") === "fix";
  // A new circuit when there is none to reuse: adding cooling, a ductless
  // zone, a conversion on a furnace-only house, or a panel that fails; a
  // heat pump replacing a condenser reuses that circuit when it is big enough.
  const hpNeedsCircuit = (job === "heat-pump-conversion" || hpSwap) && (m.existing.kind === "furnace-only" || m.existing.kind === "none" || ((m.electrical.existingHvacAmps ?? 99) < (chosen?.item.mcaAmps ?? 0)));
  const newCircuit = job === "add-ac" || job === "ductless" || hpNeedsCircuit || serviceFix;
  // An air handler with a strip kit is a new 240 V load of its own (the old
  // gas furnace ran on 120 V): breaker and branch sized to the kit.
  const stripsKw = mat.find((l) => l.id === "eq-strips");
  if (stripsKw) stock("m-breaker-ah", `Breaker + branch circuit for the air handler and ${stripsKw.name.replace(" backup heat kit", "")} strip kit (240 V)`, 40, "ln ft", card.materials.breakerAndWirePerFt, "40 ft run assumed — sized to the strip kW");
  if (newCircuit) stock("m-breaker", serviceFix && job !== "add-ac" ? "Breaker + branch circuit for the new unit (service upgrade quoted separately)" : "Breaker + branch circuit for the outdoor unit", 40, "ln ft", card.materials.breakerAndWirePerFt, "40 ft run assumed — measure panel to pad");
  if (check("return") === "fix") stock("m-return", "Return grille and duct upsize", 1, "each", card.materials.returnGrilleUpsize, engine.checks.find((c) => c.id === "return")?.detail);
  if (check("duct-cond") === "fix" || (m.ducts.condition === "poor" && job !== "replace-outdoor" && job !== "ductless")) stock("m-seal", "Duct sealing (mastic, tape, collars)", 1, "lot", card.materials.ductSealKit);

  // ── labor, by the task ────────────────────────────────────────────────────
  const L = card.labor;
  if (job === "replace-system") task("l-remove", isPackage ? "Remove and recover the old package unit (EPA 608)" : "Remove the old split system, recover refrigerant (EPA 608)", n, "each", isPackage ? L.removePackage : L.removeSplit, sysNote);
  if (job === "replace-outdoor" || job === "heat-pump-conversion") task("l-remove", "Remove the old outdoor unit, recover refrigerant (EPA 608)", n, "each", L.removeOutdoor, sysNote);
  if (job === "replace-furnace" || allElectricHp) task("l-remove-furnace", electricFurnace ? "Remove the old air handler / electric furnace" : "Remove the old furnace", n, "each", L.removeFurnace);
  if (isPackage) task("l-set", "Set the package unit, curb adapter, connections", n, "each", L.setPackage, sysNote);
  else if (job === "ductless") {
    task("l-outdoor", "Mount the outdoor unit (pad or bracket)", 1, "each", L.setOutdoor);
    task("l-heads", "Mount the indoor heads, core the wall", heads, "each", L.setHead);
    task("l-lineset", "Line set — braze, pressure test, evacuate to 500 microns", linesetFt * heads, "ln ft", L.linesetPerFt, `${linesetNote} · per head`, linesetBasis);
  } else {
    if (outdoorNew) task("l-outdoor", "Set the outdoor unit on the pad", n, "each", L.setOutdoor, sysNote);
    if (mat.some((l) => l.id === "eq-furnace")) task("l-indoor", "Set the furnace and coil", n, "each", L.setFurnace + L.setCoil, sysNote);
    else if (job === "replace-furnace") task("l-indoor", "Set the furnace", n, "each", L.setFurnace);
    else if (mat.some((l) => l.id === "eq-ah")) task("l-indoor", "Set the air handler", n, "each", L.setAirHandler, sysNote);
    else if (mat.some((l) => l.id === "eq-coil")) task("l-indoor", indoorWord === "furnace" ? "Set the coil on the existing furnace" : "Set the coil in the existing air handler", n, "each", L.setCoil, sysNote);
    if (outdoorNew) {
      if (newLineset) task("l-lineset", "Line set — braze, pressure test, evacuate to 500 microns", linesetFt * n, "ln ft", L.linesetPerFt, linesetNote, linesetBasis);
      else task("l-lineset", "Flush and reuse the existing line set, pressure test, evacuate", n, "each", L.linesetFlush, "Same refrigerant class — the run stays");
    }
  }
  if (mat.some((l) => l.id === "m-breaker-ah")) task("l-elec-ah", "Electrical: air-handler and strip-kit circuit from the panel", 1, "each", L.electricalCircuit);
  if (newCircuit) task("l-elec", serviceFix && job !== "add-ac" ? "Electrical: new circuit and disconnect (panel work quoted separately)" : "Electrical: new circuit from the panel, disconnect, whip", 1, "each", L.electricalCircuit);
  else if (outdoorNew || job === "replace-furnace") task("l-elec", job === "replace-furnace" ? "Electrical: reconnect the furnace circuit and thermostat wire" : "Electrical: disconnect, whip, thermostat wire", n, "each", L.electricalConnect, sysNote);
  if ((job === "replace-furnace" || (job === "replace-system" && mat.some((l) => l.id === "eq-furnace"))) && !noGasHouse) task("l-gas", "Gas: connect the furnace, shutoff, drip leg, leak test", n, "each", L.gasConnect, sysNote);
  else if (isPackage && gasHouse) task("l-gas", "Gas: connect the package unit, shutoff, drip leg, leak test", n, "each", L.gasConnect, sysNote);
  if (allElectricHp && m.gas.available !== false && (m.existing.kind === "split-ac-furnace" || m.existing.kind === "furnace-only") && m.existing.fuel !== "electric") task("l-gascap", "Gas: cap and label the line at the old furnace", 1, "each", L.gasConnect);
  if (check("gas") === "fix" && !noGasHouse) { const ft = Math.max(10, Math.round(m.gas.longestRunFt ?? 20)); task("l-gaspipe", "Gas pipe upsizing to the furnace", ft, "ln ft", L.gasPipePerFt, `${engine.checks.find((c) => c.id === "gas")?.detail ?? ""} · ${m.gas.longestRunFt ? "run entered" : "20 ft run assumed"}`, m.gas.longestRunFt ? "entered" : "estimated"); }
  if (newFurnace) task("l-vent", condensing ? "Venting: run and terminate the PVC vent and intake" : "Venting: run and terminate the flue", 10 * n, "ln ft", L.ventingPerFt, "10 ft assumed — measure to the termination");
  if (check("return") === "fix") task("l-return", "Cut in and duct the larger return", 1, "each", L.returnUpsize);
  if (mat.some((l) => l.id === "m-seal")) { const regs = Math.max(4, Math.round(m.ducts.supplyRegisters ?? opts.input?.supplyRegisters ?? 8)); task("l-seal", "Seal and re-hang accessible ducts", regs, "register", L.ductSealPerRegister, m.ducts.supplyRegisters ? "registers counted" : "8 registers assumed — count them", m.ducts.supplyRegisters ? "entered" : "estimated"); }
  if (mat.some((l) => l.id === "m-tstat")) task("l-tstat", "Thermostat install and setup", n, "each", L.thermostat, sysNote);
  task("l-startup", job === "ductless" ? "Start-up, charge check, homeowner walkthrough" : "Start-up, charge, airflow and static check, homeowner walkthrough", n, "each", L.startup, sysNote);
  lab.push({ id: "l-permit", name: "Mechanical permit and inspection", quantity: 1, unitPrice: card.permitFee, unit: "lot", basis: "estimated" });
  if (job !== "add-ac" && job !== "ductless") lab.push({ id: "l-disposal", name: "Haul-off and disposal of old equipment", quantity: 1, unitPrice: card.disposalFee, unit: "lot", basis: "estimated" });
  if (isPackage) lab.push({ id: "l-crane", name: "Crane / lift", quantity: 1, unitPrice: card.craneFee, unit: "lot", basis: "estimated" });

  if (n > 1) assumptions.push(`${n} systems, one per zone — the zoning (which rooms go on which system) is confirmed on site.`);
  assumptions.push(`Priced from the shop rate card by the task: equipment +${card.equipmentMarkupPct}%, materials +${card.materialsMarkupPct}%.`);
  if (serviceFix) assumptions.push("The panel is short for this unit by the NEC 220.83 count — the service upgrade is not in these lines.");
  if (job === "replace-outdoor" && !refrigerantChanges(m, chosen?.item) && !hpSwap) assumptions.push("The indoor coil stays: same refrigerant class. If the coil turns out mismatched or leaking, add the coil line.");
  if ((job === "heat-pump-conversion" || hpSwap) && !hpNeedsCircuit) assumptions.push("The existing condenser circuit is reused for the outdoor unit — confirm its ampacity covers the heat pump's MCA.");
  if (newFurnace && furnaceRow && furnaceRow.maxTons === undefined && (job === "replace-system" || job === "replace-furnace")) assumptions.push(`The furnace cabinet is chosen by airflow, not BTU: its blower must move ${engine.load.coolingCfm.toLocaleString("en-US")} CFM at 0.5 in. w.c. for the ${tons}-ton coil — check the blower table.`);
  if (noGasHouse && job === "replace-furnace") assumptions.push("No gas at the property: a gas service is the utility's quote and is not on this estimate — or price an electric furnace or a heat pump instead.");
  if (dualFuel) assumptions.push("Dual fuel: the existing furnace stays as backup and the dual-fuel thermostat switches to gas below the balance point.");

  const subtotal = r2([...mat, ...lab].reduce((a, l) => a + l.quantity * l.unitPrice, 0));
  const c = engine.conditions;
  const l = engine.load;
  const sys = chosen ? `${chosen.item.brand} ${chosen.item.model}` : `${engine.selection.targetTons}-ton system`;
  const loadLine = job === "ductless"
    ? `Zone load ${l.coolingTotalBtuh.toLocaleString("en-US")} BTU/h cooling and ${l.heatingBtuh.toLocaleString("en-US")} BTU/h heating for ${(opts.input?.zoneSqft ?? m.conditionedSqft).toLocaleString("en-US")} sq ft at ${c.coolingF} °F / ${c.heatingF} °F design conditions (${c.county ? `${c.county} County, ` : ""}${c.state}).`
    : `Design load ${l.coolingTotalBtuh.toLocaleString("en-US")} BTU/h cooling and ${l.heatingBtuh.toLocaleString("en-US")} BTU/h heating at ${c.coolingF} °F / ${c.heatingF} °F design conditions for ${c.county ? `${c.county} County, ` : ""}${c.state}, ${m.conditionedSqft.toLocaleString("en-US")} sq ft conditioned.`;
  const what: Record<JobKind, string> = {
    "replace-system": `Replace the existing ${existingWords(m)} at ${m.address} with ${n > 1 ? `${n} systems, each a ${tons}-ton ${chosen ? kindPhrase(chosen.item) : isPackage ? "package unit" : "system"} (${sys}), one per zone` : `a ${tons}-ton ${chosen ? kindPhrase(chosen.item) : isPackage ? "package unit" : "system"} (${sys})`}.`,
    "replace-outdoor": `Replace the outdoor unit of the existing ${existingWords(m)} at ${m.address} with a ${tons}-ton ${chosen?.item.kind === "heat-pump" ? "heat pump" : "condenser"} (${sys})${hpSwap ? (dualFuel ? " in place of the AC — dual fuel, the existing furnace stays as backup" : " in place of the AC, on the existing air handler") : ""}${refrigerantChanges(m, chosen?.item) ? ", with a matched coil and new line set for the new refrigerant" : hpSwap ? ", with a heat-pump-rated matched coil on the existing line set" : ", on the existing coil and line set"}.`,
    "replace-furnace": `Replace the ${electricFurnace ? "electric furnace" : "furnace"} at ${m.address} with ${sys}${electricFurnace ? " and its heat kit" : ""}${m.existing.kind === "split-ac-furnace" ? ", re-setting the existing coil" : ""}.`,
    "add-ac": `Add central cooling to the furnace at ${m.address}: a ${tons}-ton condenser (${sys}) with a matched coil, line set, new circuit and drain.`,
    "heat-pump-conversion": `Convert ${m.address} to a ${tons}-ton heat pump (${sys})${dualFuel ? " as dual fuel with the existing furnace" : " with an air handler and backup heat, all-electric"}.`,
    ductless: heads > 1 ? `Add a ${heads}-zone ductless mini-split at ${m.address}: a ${tons}-ton multi-zone outdoor unit (rated like ${sys}) with ${heads} wall-mount heads.` : `Add a ductless mini-split at ${m.address}: ${sys}, wall-mount head and outdoor unit.`,
    "water-heater": "", ducts: "", service: "",
  };
  const includes: Record<JobKind, string> = {
    "replace-system": isPackage ? "Includes removal and refrigerant recovery, the new package unit set on the curb and connected, electrical, drain, thermostat, start-up and commissioning, permit and disposal." : "Includes removal and refrigerant recovery, new equipment set, line set, electrical, drain, thermostat, start-up and commissioning, permit and disposal.",
    "replace-outdoor": hpSwap ? "Includes removal and recovery, the new heat pump set and connected, the matched coil, a heat-pump thermostat, pressure test and evacuation, start-up, permit and disposal." : "Includes removal and recovery, the new unit set and connected, pressure test and evacuation, start-up, permit and disposal.",
    "replace-furnace": electricFurnace ? "Includes removal, the new air handler and heat kit set, the circuit reconnected, start-up, permit and disposal." : "Includes removal, the new furnace set, gas and vent connected, electrical reconnect, start-up, permit and disposal.",
    "add-ac": "Includes the condenser and coil set, line set, a new circuit and disconnect, drain, thermostat, start-up and permit.",
    "heat-pump-conversion": "Includes removal of the old outdoor unit, the heat pump set, indoor side, line set, circuit, thermostat, start-up, permit and disposal.",
    ductless: "Includes the outdoor unit, the heads mounted and cored, line sets, condensate, circuit and disconnect, start-up and permit.",
    "water-heater": "", ducts: "", service: "",
  };
  const titles: Record<JobKind, string> = {
    "replace-system": `${n > 1 ? `${n} × ` : ""}${chosen ? kindTitle(chosen.item) : isPackage ? "Package unit" : "HVAC"} replacement`,
    "replace-outdoor": hpSwap ? (dualFuel ? "Dual-fuel heat pump (outdoor swap)" : "Heat pump in place of the AC") : `${chosen?.item.kind === "heat-pump" ? "Heat pump" : "Condenser"} replacement`,
    "replace-furnace": electricFurnace ? "Electric furnace replacement" : "Furnace replacement",
    "add-ac": "Add central AC",
    "heat-pump-conversion": dualFuel ? "Dual-fuel heat pump" : "Heat pump conversion",
    ductless: `Ductless mini-split, ${heads} head${heads === 1 ? "" : "s"}`,
    "water-heater": "", ducts: "", service: "",
  };
  return { title: `${titles[job]} — ${m.address.split(",")[0]}`, scope: [what[job], loadLine, includes[job]].join(" "), materials: mat, labor: lab, assumptions, subtotal };
}

/** A2L outdoor unit on an older coil: the coil and line set change. */
function refrigerantChanges(m: BuildingModel, item: CatalogItem | undefined | null): boolean {
  if (!item?.refrigerant) return false;
  const old = m.existing.refrigerant;
  if (!old) return item.refrigerant === "R-454B" || item.refrigerant === "R-32";
  return old !== item.refrigerant;
}

/** The catalog's water heater for a plan: same fuel and type, the smallest
 *  tank at or above the size, matching the vent when the row says one. */
/** Good · Better · Best: the best-fitting unit of each tier the catalog
 *  carries, priced as the whole job. Empty when the catalog has one tier. */
export function tiersFor(engine: EngineResult, m: BuildingModel, card: HvacRateCard, catalog: CatalogItem[], opts: LedgerOptions = {}, rerun?: (candidateId: string) => EngineResult): Array<{ tier: NonNullable<CatalogItem["tier"]>; candidate: SelectionCandidate; subtotal: number }> {
  const chosen = engine.selection.chosen;
  if (!chosen) return [];
  const fits = engine.selection.candidates.filter((c) => !c.disqualified && c.item.kind === chosen.item.kind);
  return (["value", "mid", "premium"] as const).flatMap((tier) => {
    const best = fits.filter((c) => (c.item.tier ?? "mid") === tier).sort((a, b) => b.score - a.score)[0];
    if (!best) return [];
    // With a re-run the tier's checks (return, circuit, gas) are its own.
    const e = rerun ? rerun(best.item.id) : { ...engine, selection: { ...engine.selection, chosen: best } };
    const l = buildLedger(e, m, card, catalog, opts);
    return [{ tier, candidate: best, subtotal: l.subtotal }];
  });
}

/** The catalog row for the plan: the smallest tank at or above the sized
 *  gallons (never a smaller one), the smallest tankless at or above the
 *  input. Nothing large enough → undefined, and the ledger prices the plan's
 *  size from the rate card and says so. */
export function pickWaterHeater(catalog: CatalogItem[], plan: { fuel: string; type: string; gallons: number; vent?: string; btuInput?: number }): CatalogItem | undefined {
  const rows = catalog.filter((c) => c.kind === "water-heater" && (c.fuel ?? "gas") === plan.fuel && (c.whType ?? "tank") === plan.type);
  if (!rows.length) return undefined;
  if (plan.type === "tankless") {
    const need = plan.btuInput ?? 0;
    return rows.filter((c) => (c.btuInput ?? 0) >= need).sort((a, b) => (a.btuInput ?? 0) - (b.btuInput ?? 0))[0];
  }
  const vented = rows.filter((c) => !c.vent || !plan.vent || c.vent === plan.vent || plan.vent === "none");
  const pool = vented.length ? vented : rows;
  return pool.filter((c) => (c.gallons ?? 0) >= plan.gallons).sort((a, b) => (a.gallons ?? 0) - (b.gallons ?? 0))[0];
}

/** One tank per maker that fits the plan — the smallest at or above the sized
 *  gallons (or the tankless input), vent-compatible — with the engine's own
 *  pick first. This is the strip the contractor chooses a brand from. */
export function waterHeaterOptions(catalog: CatalogItem[], plan: { fuel: string; type: string; gallons: number; vent?: string; btuInput?: number }): CatalogItem[] {
  const rows = catalog.filter((c) => c.kind === "water-heater" && (c.fuel ?? "gas") === plan.fuel && (c.whType ?? "tank") === plan.type && (plan.type === "tankless" ? (c.btuInput ?? 0) >= (plan.btuInput ?? 0) : (c.gallons ?? 0) >= plan.gallons) && (!c.vent || !plan.vent || c.vent === plan.vent || plan.vent === "none" || plan.type === "tankless"));
  const best = new Map<string, CatalogItem>();
  for (const r of rows.sort((a, b) => (plan.type === "tankless" ? (a.btuInput ?? 0) - (b.btuInput ?? 0) : (a.gallons ?? 0) - (b.gallons ?? 0)) || (b.uef ?? 0) - (a.uef ?? 0))) {
    if (!best.has(r.brand)) best.set(r.brand, r);
  }
  const first = pickWaterHeater(catalog, plan);
  return Array.from(best.values()).sort((a, b) => (a.id === first?.id ? -1 : b.id === first?.id ? 1 : a.brand.localeCompare(b.brand)));
}

/** The largest tank the catalog has for this fuel and type, for the note when none is big enough. */
function largestWaterHeater(catalog: CatalogItem[], plan: { fuel: string; type: string }): CatalogItem | undefined {
  return catalog.filter((c) => c.kind === "water-heater" && (c.fuel ?? "gas") === plan.fuel && (c.whType ?? "tank") === plan.type).sort((a, b) => (b.gallons ?? b.btuInput ?? 0) - (a.gallons ?? a.btuInput ?? 0))[0];
}

function waterHeaterLedger(engine: EngineResult, m: BuildingModel, card: HvacRateCard, opts: LedgerOptions, catalog: CatalogItem[] = []): Ledger {
  const plan = engine.waterHeater ?? waterHeaterPlan(m, opts.input?.wh);
  const mat: LedgerLine[] = [];
  const lab: LedgerLine[] = [];
  const mk = (c: number) => markup(c, card.materialsMarkupPct);
  const d = card.equipmentDefaults;
  const eqCost = plan.type === "tankless" ? d.tanklessGasEach : plan.type === "heat-pump" ? d.heatPumpWaterHeaterEach : plan.fuel === "electric" ? plan.gallons * d.waterHeaterElectricPerGal : plan.gallons * d.waterHeaterGasPerGal;
  const generic = plan.type === "tankless" ? `${plan.fuel === "electric" ? "Electric" : "Gas"} tankless water heater` : plan.type === "heat-pump" ? `${plan.gallons} gal heat-pump water heater` : `${plan.gallons} gal ${plan.fuel === "electric" ? "electric" : plan.fuel === "propane" ? "propane" : "gas"} tank water heater${plan.vent === "power" ? ", power vent" : plan.vent === "direct" ? ", direct vent" : ""}`;
  // The contractor's pick beats the plan's own; if it is short of the sized
  // gallons or the input, the estimate says so instead of quietly shrinking.
  // A pick that is a different kind of appliance (a gas tank on a heat-pump
  // job) is not honoured: the job's setup decides the kind, the pick the maker.
  const pickedRaw = opts.pick ? catalog.find((c) => c.id === opts.pick && c.kind === "water-heater") : undefined;
  const picked = pickedRaw && (pickedRaw.fuel ?? "gas") === plan.fuel && (pickedRaw.whType ?? "tank") === plan.type ? pickedRaw : undefined;
  const row = picked ?? pickWaterHeater(catalog, plan);
  const genericLower = generic.replace(/^\d+ gal /, "").toLowerCase();
  const eqName = row ? `${row.brand} ${row.model} — ${row.gallons ? `${row.gallons} gal ` : ""}${genericLower}${row.uef ? ` · ${row.uef} UEF` : ""}` : generic;
  // What is there now decides whether a circuit, a gas branch or a vent exists:
  // the contractor's answer, else the house's fuel.
  const wasElectric = opts.input?.wh?.existingFuel ? opts.input.wh.existingFuel === "electric" : m.gas.available === false;
  const toGas = plan.fuel !== "electric" && plan.type !== "heat-pump";
  const newGasAppliance = toGas && wasElectric;
  const extraAssumptions: string[] = [];
  if (picked) {
    if (plan.type !== "tankless" && (picked.gallons ?? 0) < plan.gallons) extraAssumptions.push(`You picked a ${picked.gallons} gal tank where the household sizes to ${plan.gallons} gal — the first-hour rating will be short; say so to the customer or pick the larger tank.`);
    if (plan.type === "tankless" && plan.btuInput && (picked.btuInput ?? 0) < plan.btuInput) extraAssumptions.push(`You picked a ${Math.round((picked.btuInput ?? 0) / 1000)}k BTU/h tankless where the plan calls for ${Math.round(plan.btuInput / 1000)}k — the flow at a 70 °F rise will be lower than sized.`);
  }
  if (row) {
    const p = equipmentPrice(row, card);
    mat.push({ id: "eq-main", name: eqName, quantity: 1, unitPrice: p.price, unit: "each", basis: p.basis, note: `${plan.sizedFrom} · ${p.note}` });
  } else {
    mat.push({ id: "eq-main", name: eqName, quantity: 1, unitPrice: markup(eqCost, card.equipmentMarkupPct), unit: "each", basis: opts.input?.wh?.gallons ? "entered" : "estimated", note: `${plan.sizedFrom} · rate-card default + ${card.equipmentMarkupPct}%` });
    const largest = largestWaterHeater(catalog, plan);
    if (largest) extraAssumptions.push(`The catalog's largest ${plan.fuel} ${plan.type === "heat-pump" ? "heat-pump tank" : plan.type} is ${largest.brand} ${largest.model}${largest.gallons ? ` (${largest.gallons} gal)` : largest.btuInput ? ` (${Math.round(largest.btuInput / 1000)}k BTU/h)` : ""} — the ${plan.type === "tankless" ? `${Math.round((plan.btuInput ?? 0) / 1000)}k BTU/h` : `${plan.gallons} gal`} unit is priced from the rate card; add the row.`);
  }
  const stock = (id: string, name: string, cost: number, qty = 1, unit = "each", note?: string) => mat.push({ id, name, quantity: qty, unitPrice: mk(cost), unit, basis: "estimated", note });
  stock("m-exp", "Expansion tank", card.materials.expansionTank);
  stock("m-flex", "Water flex lines, dielectric unions, shutoff", card.materials.waterFlexLines);
  stock("m-tp", "T&P discharge line and drain fittings", card.materials.tpDrainKit);
  if (plan.type !== "tankless") stock("m-pan", "Drain pan with drain", card.materials.drainPan);
  if (plan.fuel !== "electric" && plan.type !== "heat-pump") {
    stock("m-gasflex", "Gas flex connector, shutoff and drip leg", card.materials.gasFlexKit);
    stock("m-vent", plan.type === "tankless" || plan.vent === "power" || plan.vent === "direct" ? (newGasAppliance ? "Vent kit (PVC / concentric), wall or roof termination, flashing" : "Vent kit (PVC / concentric), termination") : newGasAppliance ? "B-vent sections, roof flashing, storm collar and cap" : "B-vent sections, cap and connector", plan.type === "tankless" || plan.vent === "power" || plan.vent === "direct" ? card.materials.ventKit : card.materials.bVentKit);
    stock("m-co", "Carbon-monoxide alarm", card.materials.coAlarm, 1, "each", "Required with a permit for fuel-fired work — skip if one is there");
  }
  if (plan.type === "tankless") { stock("m-iso", "Isolation / flush valve kit", card.materials.isoValveKit); if (plan.fuel !== "electric") stock("m-neut", "Condensate neutralizer and drain (condensing unit)", card.materials.neutralizer); }
  if (plan.type === "heat-pump") stock("m-cond", "Condensate drain kit / pump for the heat-pump tank", card.materials.hpwhCondensateKit);
  if (["WA", "CA", "OR", "AK", "HI", "NV", "UT"].includes(m.state)) stock("m-straps", "Seismic straps (two)", card.materials.seismicStraps);
  const L = card.labor;
  const task = (id: string, name: string, qty: number, unit: string, price: number, note?: string) => lab.push({ id, name, quantity: qty, unitPrice: price, unit, basis: "estimated", note });
  task("l-remove", "Drain and remove the old water heater", 1, "each", L.removeWaterHeater);
  task("l-set", "Set the new water heater, connect water, expansion tank, T&P, pan", 1, "each", L.setWaterHeater);
  if (toGas) {
    if (newGasAppliance) task("l-gasbranch", "Gas branch to the water heater (new run from the meter or manifold)", Math.max(10, Math.round(m.gas.longestRunFt ?? 20)), "ln ft", L.gasPipePerFt, "New gas branch — measure the run; the utility's service is not on this estimate");
    task("l-gas", "Gas: connect, shutoff, drip leg, leak test", 1, "each", L.gasConnect);
    task("l-vent", newGasAppliance ? "Venting: new run through the roof or wall, terminate" : "Venting: run and terminate", plan.type === "tankless" || plan.vent !== "atmospheric" || newGasAppliance ? 12 : 6, "ln ft", L.ventingPerFt, newGasAppliance ? "12 ft new vent assumed — measure the run" : plan.type === "tankless" || plan.vent !== "atmospheric" ? "12 ft of PVC assumed — measure the run" : "6 ft of B-vent assumed — reuse where sound");
  }
  // Leaving gas: the old drop is capped; leaving electric: the old circuit is made safe.
  if (!toGas && !wasElectric && m.gas.available !== false) task("l-gascap", "Gas: cap and label the line at the old tank", 1, "each", L.gasConnect);
  if (toGas && wasElectric) extraAssumptions.push("The old 240 V circuit is disconnected at the breaker and labelled.");
  if (plan.type === "tankless" && plan.fuel !== "electric") task("l-recep", "Electrical: 120 V receptacle at the unit", 1, "each", L.electricalConnect);
  if (plan.circuitAmps) {
    // What is there now decides whether a circuit exists: the contractor's
    // answer, else the house's fuel.
    if (wasElectric && plan.type !== "tankless") task("l-elec", `Electrical: reconnect the 240 V / ${plan.circuitAmps} A circuit`, 1, "each", L.electricalConnect);
    else { mat.push({ id: "m-breaker", name: `Breaker + branch circuit, 240 V / ${plan.circuitAmps} A`, quantity: 30, unitPrice: mk(card.materials.breakerAndWirePerFt), unit: "ln ft", basis: "estimated", note: "30 ft run assumed — measure panel to tank" }); task("l-elec", `Electrical: new 240 V / ${plan.circuitAmps} A circuit from the panel`, 1, "each", L.electricalCircuit); }
  }
  if (engine.checks.find((c) => c.id === "gas")?.status === "fix") { const ft = Math.max(10, Math.round(m.gas.longestRunFt ?? 20)); task("l-gaspipe", "Gas pipe upsizing to the water heater", ft, "ln ft", L.gasPipePerFt, engine.checks.find((c) => c.id === "gas")?.detail); }
  lab.push({ id: "l-permit", name: "Plumbing permit and inspection", quantity: 1, unitPrice: card.permitFee, unit: "lot", basis: "estimated" });
  lab.push({ id: "l-disposal", name: "Haul-off and disposal of the old tank", quantity: 1, unitPrice: card.disposalFee, unit: "lot", basis: "estimated" });
  const assumptions = [...plan.notes, ...extraAssumptions, `Priced from the shop rate card by the task: equipment +${card.equipmentMarkupPct}%, materials +${card.materialsMarkupPct}%.`];
  const subtotal = r2([...mat, ...lab].reduce((a, l) => a + l.quantity * l.unitPrice, 0));
  // The scope keeps the maker's name and the rating as written.
  const eqScope = row ? `${row.brand} ${row.model} — ${row.gallons ? `${row.gallons} gal ` : ""}${genericLower}${row.uef ? ` · ${row.uef} UEF` : ""}` : generic.charAt(0).toLowerCase() + generic.slice(1);
  const article = /^[aeiou]/i.test(eqScope) ? "an" : "a";
  return {
    title: `${eqName.replace(/^(\d+ gal )/, "")} replacement — ${m.address.split(",")[0]}`,
    scope: `Replace the water heater at ${m.address} with ${article} ${eqScope} (${plan.sizedFrom}). Includes removal and disposal, the new unit set and connected, expansion tank, T&P discharge, drain pan, ${plan.fuel !== "electric" && plan.type !== "heat-pump" ? "gas connection and venting" : "the electrical circuit"}, permit and inspection.`,
    materials: mat, labor: lab, assumptions, subtotal,
  };
}

const DUCT_WHERE: Record<BuildingModel["ducts"]["location"], string> = { conditioned: "ducts in conditioned space", attic: "ducts in the attic", crawl: "ducts in the crawlspace", basement: "ducts in the basement", none: "no existing ducts" };

function ductsLedger(engine: EngineResult, m: BuildingModel, card: HvacRateCard, opts: LedgerOptions): Ledger {
  const mat: LedgerLine[] = [];
  const lab: LedgerLine[] = [];
  const mk = (c: number) => markup(c, card.materialsMarkupPct);
  const regs = Math.max(2, Math.round(opts.input?.supplyRegisters ?? m.ducts.supplyRegisters ?? 8));
  const regsBasis: LineBasis = opts.input?.supplyRegisters || m.ducts.supplyRegisters ? "entered" : "estimated";
  const regsNote = regsBasis === "entered" ? "registers counted" : "8 registers assumed — count them";
  const noDucts = m.ducts.location === "none";
  const replace = noDucts || m.ducts.condition === "poor";
  const assumptions_extra: string[] = [];
  const L = card.labor;
  const check = (id: string) => engine.checks.find((c) => c.id === id)?.status;
  if (noDucts) {
    // A house with no ducts gets a duct system: trunks and plenums, a return,
    // and a run to every register.
    mat.push({ id: "m-trunk", name: "Supply and return trunks, plenums, dampers and hangers", quantity: 1, unitPrice: mk(card.materials.ductTrunkLot), unit: "lot", basis: "estimated", note: "Sized to the system's airflow — confirm on the duct layout" });
    lab.push({ id: "l-trunk", name: "Build and hang the trunks, plenums and the return", quantity: 1, unitPrice: L.ductTrunkLot, unit: "lot", basis: "estimated" });
    mat.push({ id: "m-runs", name: "Insulated flex duct runs, boots, registers and collars", quantity: regs, unitPrice: mk(card.materials.ductRunEach), unit: "run", basis: regsBasis, note: regsNote });
    lab.push({ id: "l-runs", name: "Run and connect a supply to each register", quantity: regs, unitPrice: L.ductRunReplace, unit: "run", basis: regsBasis, note: regsNote });
  } else if (replace) {
    mat.push({ id: "m-runs", name: "Insulated flex duct runs, boots and collars", quantity: regs, unitPrice: mk(card.materials.ductRunEach), unit: "run", basis: regsBasis, note: regsNote });
    lab.push({ id: "l-runs", name: "Replace supply runs to the registers", quantity: regs, unitPrice: L.ductRunReplace, unit: "run", basis: regsBasis, note: regsNote });
  } else {
    mat.push({ id: "m-seal", name: "Duct sealing (mastic, tape, collars)", quantity: 1, unitPrice: mk(card.materials.ductSealKit), unit: "lot", basis: "estimated" });
    lab.push({ id: "l-seal", name: "Seal and re-hang accessible ducts", quantity: regs, unitPrice: L.ductSealPerRegister, unit: "register", basis: regsBasis, note: regsNote });
  }
  // The return is upsized when the grille is short, or when the static says
  // the ducts choke the blower; a new duct system carries its own return.
  if (!noDucts && (check("return") === "fix" || check("static") === "fix")) {
    mat.push({ id: "m-return", name: "Return grille and duct upsize", quantity: 1, unitPrice: mk(card.materials.returnGrilleUpsize), unit: "each", basis: "estimated", note: engine.checks.find((c) => c.id === (check("return") === "fix" ? "return" : "static"))?.detail });
    lab.push({ id: "l-return", name: "Cut in and duct the larger return", quantity: 1, unitPrice: L.returnUpsize, unit: "each", basis: "estimated" });
  }
  // Replaced runs come insulated; only kept runs get wrapped.
  if (!replace && check("duct-ins") === "fix") {
    mat.push({ id: "m-ins", name: "R-8 duct wrap / insulated sleeve", quantity: regs, unitPrice: mk(card.materials.ductInsulationPerRun), unit: "run", basis: regsBasis, note: regsNote });
    lab.push({ id: "l-ins", name: "Insulate accessible runs to R-8", quantity: regs, unitPrice: L.ductInsulatePerRun, unit: "run", basis: regsBasis });
  }
  lab.push({ id: "l-startup", name: "Airflow and static check after the work, register balance", quantity: 1, unitPrice: L.startup, unit: "each", basis: "estimated" });
  if (replace) { lab.push({ id: "l-permit", name: "Mechanical permit and inspection", quantity: 1, unitPrice: card.permitFee, unit: "lot", basis: "estimated" }); if (!noDucts) lab.push({ id: "l-disposal", name: "Haul-off of the old duct", quantity: 1, unitPrice: card.disposalFee, unit: "lot", basis: "estimated" }); }
  if (replace) assumptions_extra.push("New runs are insulated flex (R-8): no separate insulation line.");
  const assumptions = [...engine.notes.filter((x) => x.kind === "assumption").map((x) => x.text), ...assumptions_extra, `Priced from the shop rate card by the register: materials +${card.materialsMarkupPct}%.`];
  if (check("return") === "verify") assumptions.push("Return grille not measured — measure it; an undersized return is the usual find and adds the upsize line.");
  const subtotal = r2([...mat, ...lab].reduce((a, l) => a + l.quantity * l.unitPrice, 0));
  return {
    title: `${noDucts ? "New duct system" : replace ? "Duct replacement" : "Duct sealing"} — ${m.address.split(",")[0]}`,
    scope: `${noDucts ? "Build a duct system" : replace ? "Replace the supply runs" : "Seal and re-hang the accessible ducts"} at ${m.address} (${regs} registers, ${DUCT_WHERE[m.ducts.location]}); ${lab.some((l) => l.id === "l-return") ? (check("static") === "fix" && check("return") !== "fix" ? "upsize the return to bring the static down; " : "upsize the return; ") : ""}airflow and static checked after the work. Design airflow ${engine.load.coolingCfm.toLocaleString("en-US")} CFM.`,
    materials: mat, labor: lab, assumptions, subtotal,
  };
}

function serviceLedger(engine: EngineResult, m: BuildingModel, card: HvacRateCard, opts: LedgerOptions): Ledger {
  const mat: LedgerLine[] = [];
  const lab: LedgerLine[] = [];
  const s = opts.input?.service;
  const L = card.labor;
  const mk = (c: number) => markup(c, card.materialsMarkupPct);
  const custom = card.serviceMenu ?? [];
  // The tasks the visit does, in the menu's order; unknown ids are skipped.
  const tasks = (s?.tasks ?? []).map((id) => serviceTask(id, custom)).filter((t): t is NonNullable<typeof t> => !!t);
  // A tune-up carries the inspection; otherwise the visit starts with the diagnostic.
  if (!tasks.some((t) => t.includesDiagnostic)) lab.push({ id: "l-diag", name: "Diagnostic visit", quantity: 1, unitPrice: L.diagnostic, unit: "each", basis: "estimated" });
  for (const t of tasks) {
    if (t.unit === "lb") continue; // refrigerant is priced by the pound below
    lab.push({ id: `l-svc-${t.id}`, name: t.title, quantity: 1, unitPrice: t.laborUsd, unit: "each", basis: "estimated", note: `${t.includes}${t.custom ? " · your saved task" : " · typical shop labor — edit to your rate"}` });
    if (t.part) mat.push({ id: `m-svc-${t.id}`, name: t.part.name, quantity: 1, unitPrice: mk(t.part.costUsd), unit: "each", basis: "estimated", note: `${t.custom ? "Your saved cost" : "Typical shop cost"} $${t.part.costUsd.toLocaleString("en-US")} + ${card.materialsMarkupPct}%${t.part.brands?.length ? ` · ${t.part.brands.join(", ")}` : ""}` });
  }
  const lbs = s?.refrigerantLb && s.refrigerantLb > 0 ? s.refrigerantLb : 0;
  if (lbs) {
    mat.push({ id: "m-refr", name: m.existing.refrigerant ? `Refrigerant ${m.existing.refrigerant}` : "Refrigerant (identify on the nameplate)", quantity: lbs, unitPrice: markup(m.existing.refrigerant === "R-22" ? card.materials.refrigerantR22PerLb : card.materials.refrigerantPerLb, card.materialsMarkupPct), unit: "lb", basis: m.existing.refrigerant ? "entered" : "estimated", note: m.existing.refrigerant === "R-22" ? "Reclaimed R-22 at today's cost" : undefined });
    lab.push({ id: "l-refr", name: "Leak check and recharge", quantity: lbs, unitPrice: L.refrigerantPerLb, unit: "lb", basis: "entered" });
  }
  // Tasks typed for this estimate, and the older free-text task and parts.
  for (const [i, c] of (s?.custom ?? []).entries()) {
    lab.push({ id: `l-cust-${i}`, name: c.name, quantity: 1, unitPrice: c.laborUsd, unit: "each", basis: "entered" });
    if (c.partName) mat.push({ id: `m-cust-${i}`, name: c.partName, quantity: 1, unitPrice: mk(c.partCost ?? 0), unit: "each", basis: c.partCost ? "entered" : "estimated", note: c.partCost ? `Your cost $${c.partCost.toLocaleString("en-US")} + ${card.materialsMarkupPct}%` : "No cost given — put the part cost on the line" });
  }
  for (const [i, p] of (s?.parts ?? []).entries()) {
    if (!p.name) continue;
    mat.push({ id: `m-part-${i}`, name: p.name, quantity: 1, unitPrice: mk(p.cost), unit: "each", basis: "entered", note: `Shop cost $${p.cost.toLocaleString("en-US")} + ${card.materialsMarkupPct}%` });
  }
  if (s?.task) lab.push({ id: "l-repair", name: s.task, quantity: 1, unitPrice: L.repairEach, unit: "each", basis: "entered" });
  const assumptions = [`Priced from the service menu by the task: typical shop labor and part costs (parts +${card.materialsMarkupPct}%) — edit any line to your rate.`];
  for (const t of tasks) if (t.note) assumptions.push(t.note);
  if (m.existing.refrigerant === "R-22") assumptions.push("R-22 system: recharge is priced per pound at today's reclaimed R-22 cost; a replacement quote is the alternative.");
  const subtotal = r2([...mat, ...lab].reduce((a, l) => a + l.quantity * l.unitPrice, 0));
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const done = [...tasks.filter((t) => t.unit !== "lb").map((t) => lower(t.title)), ...(lbs ? [`recharge ${lbs} lb`] : []), ...(s?.custom ?? []).map((c) => lower(c.name)), ...(s?.task ? [lower(s.task)] : [])];
  const count = tasks.length + (s?.custom?.length ?? 0);
  const headline = tasks.length ? tasks.slice(0, 2).map((t) => t.title).join(", ") + (count > 2 ? ` +${count - 2}` : "") : s?.custom?.[0]?.name ?? s?.task ?? "diagnostic";
  return {
    title: `Service: ${headline} — ${m.address.split(",")[0]}`,
    scope: `Service call on the ${existingWords(m)} at ${m.address}: ${tasks.some((t) => t.includesDiagnostic) ? "" : "diagnostic, "}${done.join(", ") || "diagnostic"}${(s?.parts ?? []).some((p) => p.name) ? `, parts: ${(s?.parts ?? []).map((p) => p.name).filter(Boolean).join(", ")}` : ""}.`,
    materials: mat, labor: lab, assumptions, subtotal,
  };
}

function existingWords(m: BuildingModel): string {
  const e = m.existing;
  const years = e.yearMade ? new Date().getFullYear() - e.yearMade : 0;
  const age = e.yearMade ? ` (${years} year${years === 1 ? "" : "s"} old)` : "";
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
    // Good · Better · Best ladders, so the page prices a job three ways
    // before the shop's own catalog is in.
    { id: `st-ac-${t}`, kind: "air-conditioner", brand: "Starter", model: `AC14-${String(t * 12).padStart(3, "0")}`, refrigerant: "R-454B", staging: "single", tons: t, coolingBtuh: t * 12000, seer2: 14.3, eer2: 11.7, tier: "value", source: "shop" },
    { id: `st-ac16-${t}`, kind: "air-conditioner", brand: "Starter", model: `AC16-${String(t * 12).padStart(3, "0")}`, refrigerant: "R-454B", staging: "two-stage", tons: t, coolingBtuh: t * 12000, seer2: 16, eer2: 12.5, tier: "mid", source: "shop" },
    { id: `st-ac18-${t}`, kind: "air-conditioner", brand: "Starter", model: `AC18-${String(t * 12).padStart(3, "0")}`, refrigerant: "R-454B", staging: "variable", tons: t, coolingBtuh: t * 12000, seer2: 18, eer2: 13, tier: "premium", source: "shop" },
    { id: `st-hp-${t}`, kind: "heat-pump", brand: "Starter", model: `HP15-${String(t * 12).padStart(3, "0")}`, refrigerant: "R-454B", staging: "single", tons: t, coolingBtuh: t * 12000, heat47Btuh: Math.round(t * 12000 * 1.02), heat17Btuh: Math.round(t * 12000 * 0.62), heat5Btuh: Math.round(t * 12000 * 0.5), seer2: 15.2, hspf2: 7.8, tier: "value", source: "shop" },
    { id: `st-hp17-${t}`, kind: "heat-pump", brand: "Starter", model: `HP17-${String(t * 12).padStart(3, "0")}`, refrigerant: "R-454B", staging: "two-stage", tons: t, coolingBtuh: t * 12000, heat47Btuh: Math.round(t * 12000 * 1.03), heat17Btuh: Math.round(t * 12000 * 0.68), heat5Btuh: Math.round(t * 12000 * 0.55), seer2: 17, hspf2: 8.5, tier: "mid", source: "shop" },
    { id: `st-cchp-${t}`, kind: "heat-pump", brand: "Starter", model: `CCHP18-${String(t * 12).padStart(3, "0")}`, refrigerant: "R-454B", staging: "variable", tons: t, coolingBtuh: t * 12000, heat47Btuh: Math.round(t * 12000 * 1.05), heat17Btuh: Math.round(t * 12000 * 0.85), heat5Btuh: Math.round(t * 12000 * 0.72), seer2: 18, hspf2: 9, coldClimate: true, tier: "premium", source: "shop" },
    { id: `st-coil-${t}`, kind: "coil", brand: "Starter", model: `CL-${String(t * 12).padStart(3, "0")}`, tons: t, source: "shop" },
    { id: `st-ah-${t}`, kind: "air-handler", brand: "Starter", model: `AH-${String(t * 12).padStart(3, "0")}`, tons: t, ratedStaticInWc: 0.5, source: "shop" },
  ]),
  // The sizes makers actually ship (40 through 120 in the 96% lines, with the
  // 45/70/90 steps), so a furnace-only job on any house finds a 100–140% fit.
  ...([40, 45, 60, 70, 80, 90, 100, 120] as const).flatMap((k): CatalogItem[] => [
    // maxTons: the blower a cabinet of that input usually carries (040/045 → 3 t, 060/070 → 4 t, 080+ → 5 t).
    { id: `st-fur80-${k}`, kind: "furnace", brand: "Starter", model: `G80-${String(k).padStart(3, "0")}`, btuInput: k * 1000, afue: 0.8, staging: "single", ratedStaticInWc: 0.5, maxTons: k <= 45 ? 3 : k <= 70 ? 4 : 5, tier: "value", source: "shop" },
    { id: `st-fur-${k}`, kind: "furnace", brand: "Starter", model: `G96-${String(k).padStart(3, "0")}`, btuInput: k * 1000, afue: 0.96, staging: "single", ratedStaticInWc: 0.5, maxTons: k <= 45 ? 3 : k <= 70 ? 4 : 5, tier: "mid", source: "shop" },
    { id: `st-fur96v-${k}`, kind: "furnace", brand: "Starter", model: `G96V-${String(k).padStart(3, "0")}`, btuInput: k * 1000, afue: 0.97, staging: "variable", ratedStaticInWc: 0.5, maxTons: k <= 45 ? 3 : k <= 70 ? 4 : 5, tier: "premium", source: "shop" },
  ]),
];

// ── catalog CSV ─────────────────────────────────────────────────────────────

/** Header the import understands; extra columns are ignored. */
export const CATALOG_CSV_COLUMNS = ["kind", "brand", "model", "tons", "coolingBtuh", "heat47Btuh", "heat17Btuh", "heat5Btuh", "btuInput", "afue", "seer2", "eer2", "hspf2", "refrigerant", "staging", "coldClimate", "ahriRef", "mcaAmps", "ratedStaticInWc", "maxTons", "tier", "gallons", "whType", "fuel", "uef", "cost"] as const;

const KINDS = new Set<CatalogItem["kind"]>(["heat-pump", "air-conditioner", "furnace", "air-handler", "coil", "ductless", "package", "water-heater"]);

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
      maxTons: num(cells, "maxTons"),
      tier: (["value", "mid", "premium"] as const).find((t) => t === (str(cells, "tier") ?? "").toLowerCase()),
      gallons: num(cells, "gallons"),
      whType: (["tank", "heat-pump", "tankless"] as const).find((t) => t === (str(cells, "whType") ?? "").toLowerCase().replace(/\s+/g, "-")),
      fuel: (["gas", "electric", "propane"] as const).find((t) => t === (str(cells, "fuel") ?? "").toLowerCase()),
      uef: num(cells, "uef"),
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
  if (/^(water heater|wh|tank|hpwh|tankless)$/.test(w)) return "water-heater";
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

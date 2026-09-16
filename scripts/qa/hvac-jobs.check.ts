// Synthetic check of the job kinds — no network.
//   npx tsx --tsconfig tsconfig.json scripts/qa/hvac-jobs.check.ts
// Each job runs the engine and the ledger on the same Frisco house and
// writes the lines that job needs and none it does not; labor is priced by
// the task against a measure, never by the hour; a v1 rate card (hours ×
// crew rate) converts to per-task amounts; the water heater sizes from the
// household and answers the gas / circuit / vent checks.
import { runEngine } from "../../src/lib/hvac/engine";
import { buildLedger, DEFAULT_RATE_CARD, normalizeRateCard, STARTER_CATALOG } from "../../src/lib/hvac/ledger";
import { modelFromSite } from "../../src/lib/hvac/intake";
import { JOBS, jobDef, type JobKind } from "../../src/lib/hvac/jobs";
import { tankGallonsFor, waterHeaterPlan } from "../../src/lib/hvac/waterHeater";
import type { BuildingModel } from "../../src/lib/hvac/types";

let failures = 0;
let passes = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

function house(over: Partial<BuildingModel> = {}): BuildingModel {
  const m = modelFromSite({ address: "4518 Bluestem Hollow Dr, Frisco, TX 75034", state: "TX", county: "Collin", footprintSqft: 2000, storeys: 1, yearBuilt: 1998, sources: {} });
  m.existing = { kind: "split-ac-furnace", tons: 3.5, fuel: "gas", refrigerant: "R-410A", yearMade: 2008 };
  m.electrical = { mainAmps: 200, freeSlots: 4, electricDryer: true };
  m.ducts = { location: "attic", condition: "fair", insulated: true, returnGrilleSqIn: 700, supplyRegisters: 10 };
  m.gas = { available: true, pipeIn: 0.75, longestRunFt: 30 };
  m.occupants = 4;
  return Object.assign(m, over);
}
const run = (job: JobKind, m = house(), input = {}) => {
  const e = runEngine(m, { catalog: STARTER_CATALOG, job, input });
  return { e, l: buildLedger(e, m, DEFAULT_RATE_CARD, STARTER_CATALOG, { job, input }) };
};
const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);
const has = (rows: Array<{ id: string }>, ...want: string[]) => want.every((w) => rows.some((r) => r.id === w));
const lacks = (rows: Array<{ id: string }>, ...no: string[]) => no.every((w) => !rows.some((r) => r.id === w));

ok("Nine jobs, full system first and default", JOBS.length === 9 && JOBS[0].id === "replace-system" && jobDef("nope").id === "replace-system");

// labor is never by the hour, on any job
for (const j of JOBS) {
  const { l } = run(j.id, house(), j.id === "ductless" ? { zoneSqft: 400, heads: 2 } : j.id === "service" ? { service: { task: "Replace the capacitor", refrigerantLb: 2, parts: [{ name: "Run capacitor 45/5", cost: 28 }] } } : {});
  const hourly = l.labor.filter((x) => /hour/i.test(x.unit) || /\bh\b/.test(x.unit));
  ok(`${j.id}: labor by the task, with a measure`, hourly.length === 0 && l.labor.every((x) => x.unitPrice > 0 && x.quantity > 0 && ["each", "ln ft", "register", "run", "lot", "lb"].includes(x.unit)), hourly.map((x) => x.unit).join(",") || l.labor.map((x) => `${x.id}:${x.unit}`).join(","));
}

// full system — as before
const full = run("replace-system");
ok("Full system: AC + furnace + coil, remove, both sets, line set by the foot, start-up, permit, disposal", has(full.l.materials, "eq-main", "eq-furnace", "eq-coil", "m-lineset", "m-pad", "m-tstat", "m-gasflex") && has(full.l.labor, "l-remove", "l-outdoor", "l-indoor", "l-lineset", "l-elec", "l-gas", "l-tstat", "l-startup", "l-permit", "l-disposal"), ids(full.l.labor).join(","));
ok("Line set labor is per ln ft at the card's rate", (() => { const x = full.l.labor.find((r) => r.id === "l-lineset"); return !!x && x.unit === "ln ft" && x.quantity === 25 && x.unitPrice === DEFAULT_RATE_CARD.labor.linesetPerFt; })());
ok("Set the outdoor unit is one each at the card's amount", (() => { const x = full.l.labor.find((r) => r.id === "l-outdoor"); return !!x && x.unit === "each" && x.quantity === 1 && x.unitPrice === DEFAULT_RATE_CARD.labor.setOutdoor; })());
ok("Full system subtotal in band", full.l.subtotal >= 7000 && full.l.subtotal <= 18000, `$${full.l.subtotal}`);

// outdoor unit only — same refrigerant keeps the coil and flushes the line set
const outdoor = run("replace-outdoor");
ok("Outdoor only: an AC on a gas house, no furnace, no air handler", outdoor.e.selection.chosen?.item.kind === "air-conditioner" && lacks(outdoor.l.materials, "eq-furnace", "eq-ah", "eq-strips", "m-tstat", "m-drain"), ids(outdoor.l.materials).join(","));
ok("Outdoor only, R-454B on an R-410A coil: matched coil and new line set", has(outdoor.l.materials, "eq-coil", "m-lineset") && outdoor.l.labor.find((r) => r.id === "l-lineset")?.unit === "ln ft", ids(outdoor.l.materials).join(","));
const sameRefr = run("replace-outdoor", house({ existing: { kind: "split-ac-furnace", tons: 3.5, fuel: "gas", refrigerant: "R-454B", yearMade: 2024 } }));
ok("Outdoor only, same refrigerant: coil stays, line set flushed (each), no pad", lacks(sameRefr.l.materials, "eq-coil", "m-lineset", "m-pad") && sameRefr.l.labor.find((r) => r.id === "l-lineset")?.unit === "each", ids(sameRefr.l.labor).join(","));
ok("Outdoor only: remove outdoor, set outdoor, the new coil set, connect, start-up, permit, disposal; no gas or thermostat work", has(outdoor.l.labor, "l-remove", "l-outdoor", "l-indoor", "l-elec", "l-startup", "l-permit", "l-disposal") && lacks(outdoor.l.labor, "l-gas", "l-tstat") && outdoor.l.labor.find((r) => r.id === "l-indoor")?.name === "Set the coil on the existing furnace", ids(outdoor.l.labor).join(","));
ok("Outdoor only, same refrigerant: no coil work", lacks(sameRefr.l.labor, "l-indoor"), ids(sameRefr.l.labor).join(","));
const hpHouse = house({ existing: { kind: "split-heat-pump", tons: 3, fuel: "electric" }, gas: { available: false } });
ok("Outdoor only on a heat-pump house picks a heat pump", run("replace-outdoor", hpHouse).e.selection.chosen?.item.kind === "heat-pump");

// furnace only
const furnace = run("replace-furnace");
ok("Furnace: a furnace is chosen by the heating load, within 100–140%", furnace.e.selection.chosen?.item.kind === "furnace" && (furnace.e.selection.chosen?.outputRatio ?? 0) >= 1 && (furnace.e.selection.chosen?.outputRatio ?? 9) <= 1.4, `${furnace.e.selection.chosen?.item.model} ${furnace.e.selection.chosen?.outputRatio}`);
ok("Furnace: gas flex, vent kit, thermostat; no line set, pad or disconnect", has(furnace.l.materials, "eq-main", "m-gasflex", "m-vent", "m-tstat") && lacks(furnace.l.materials, "m-lineset", "m-pad", "m-disc", "m-surge"), ids(furnace.l.materials).join(","));
ok("Furnace: remove furnace, set furnace, re-set the coil, gas, vent by the foot, electrical reconnect, start-up", has(furnace.l.labor, "l-remove-furnace", "l-indoor", "l-recoil", "l-gas", "l-vent", "l-elec", "l-startup") && furnace.l.labor.find((r) => r.id === "l-vent")?.unit === "ln ft", ids(furnace.l.labor).join(","));
const tiny = run("replace-furnace", house({ conditionedSqft: 700, provenance: { ...house().provenance, conditionedSqft: { source: "stated", confidence: "high" } } }));
ok("Furnace on a tiny load: the smallest-output furnace, flagged over 140%", tiny.e.load.heatingBtuh < 28000 && /^G(80|96)-040$/.test(tiny.e.selection.chosen?.item.model ?? "") && /smallest furnace/.test(tiny.e.selection.chosen?.reasons[0] ?? ""), `${tiny.e.load.heatingBtuh} ${tiny.e.selection.chosen?.item.model}`);
ok("Furnace: no refrigerant or efficiency-floor checks", !furnace.e.checks.some((c) => c.id === "refrigerant" || c.id === "efficiency") && furnace.e.checks.some((c) => c.id === "gas"));

// add cooling
const addAc = run("add-ac", house({ existing: { kind: "furnace-only", fuel: "gas" } }));
ok("Add cooling: condenser + coil, line set, pad, new circuit, drain, thermostat; no removal, no disposal", has(addAc.l.materials, "eq-main", "eq-coil", "m-lineset", "m-pad", "m-breaker", "m-drain", "m-tstat") && lacks(addAc.l.materials, "eq-furnace", "eq-ah") && lacks(addAc.l.labor, "l-remove", "l-disposal") && has(addAc.l.labor, "l-outdoor", "l-indoor", "l-lineset", "l-elec", "l-startup", "l-permit"), ids(addAc.l.labor).join(","));
ok("Add cooling: new circuit priced as one each", addAc.l.labor.find((r) => r.id === "l-elec")?.unitPrice === DEFAULT_RATE_CARD.labor.electricalCircuit);

// heat pump conversion — dual fuel on a gas house
const hp = run("heat-pump-conversion");
ok("Heat pump conversion on a gas house: a heat pump, no keep-gas penalty", hp.e.selection.chosen?.item.kind === "heat-pump" && !(hp.e.selection.chosen?.reasons.some((r) => /dual fuel/i.test(r)) ?? false), hp.e.selection.chosen?.reasons.join(" | "));
ok("Dual fuel: coil on the existing furnace + dual-fuel thermostat, no air handler or strips", has(hp.l.materials, "eq-main", "eq-coil", "m-tstat") && lacks(hp.l.materials, "eq-ah", "eq-strips") && hp.l.materials.find((r) => r.id === "m-tstat")?.name === "Dual-fuel thermostat" && /Dual-fuel heat pump/.test(hp.l.title), hp.l.title);
const hpElec = run("heat-pump-conversion", house({ preferences: { allElectric: true } }));
ok("All-electric conversion: air handler + strips, old furnace removed", has(hpElec.l.materials, "eq-ah", "eq-strips") && lacks(hpElec.l.materials, "eq-coil") && has(hpElec.l.labor, "l-remove-furnace"), ids(hpElec.l.labor).join(","));

// ductless zone
const dl = run("ductless", house(), { zoneSqft: 400, heads: 2 });
ok("Ductless: the load is the zone's", dl.e.zone?.sqft === 400 && dl.e.load.coolingTotalBtuh < 15000 && dl.e.load.coolingTotalBtuh > 3000, `${dl.e.load.coolingTotalBtuh}`);
ok("Ductless: heads line quantity 2, line set 50 ft, mount heads ×2, no removal", dl.l.materials.find((r) => r.id === "eq-heads")?.quantity === 2 && dl.l.materials.find((r) => r.id === "m-lineset")?.quantity === 50 && dl.l.labor.find((r) => r.id === "l-heads")?.quantity === 2 && lacks(dl.l.labor, "l-remove", "l-disposal"), ids(dl.l.labor).join(","));

// water heater
ok("Tank size from the household", tankGallonsFor(2, "gas", "tank") === 40 && tankGallonsFor(4, "gas", "tank") === 50 && tankGallonsFor(5, "gas", "tank") === 75 && tankGallonsFor(4, "electric", "tank") === 65 && tankGallonsFor(3, "electric", "heat-pump") === 50);
const wh = run("water-heater");
ok("Water heater on a gas house: 50 gal gas tank, 40k input, B-vent", wh.e.waterHeater?.fuel === "gas" && wh.e.waterHeater.gallons === 50 && wh.e.waterHeater.btuInput === 40000 && wh.e.waterHeater.vent === "atmospheric", JSON.stringify(wh.e.waterHeater));
ok("Water heater: nothing selected, checks are the gas pipe", wh.e.selection.chosen === null && wh.e.checks.every((c) => c.id === "gas" || c.id === "code") && wh.e.checks.some((c) => c.id === "gas"), wh.e.checks.map((c) => c.id).join(","));
ok("Water heater lines: tank, expansion tank, flex, T&P, pan, gas flex, vent; labor remove/set/gas/vent/permit/disposal", has(wh.l.materials, "eq-main", "m-exp", "m-flex", "m-tp", "m-pan", "m-gasflex", "m-vent") && lacks(wh.l.materials, "m-straps", "m-breaker") && has(wh.l.labor, "l-remove", "l-set", "l-gas", "l-vent", "l-permit", "l-disposal") && lacks(wh.l.labor, "l-elec"), ids(wh.l.labor).join(","));
ok("Water heater subtotal in band", wh.l.subtotal >= 1500 && wh.l.subtotal <= 4500, `$${wh.l.subtotal}`);
const hpwh = run("water-heater", house({ state: "WA", county: "King", electrical: { mainAmps: 200, freeSlots: 0 } }), { wh: { type: "heat-pump", fuel: "electric" } });
ok("Heat-pump tank: 65 gal for 4 people, 30 A circuit, condensate kit, straps in WA, new circuit; no free slots is a fix", hpwh.e.waterHeater?.gallons === 65 && hpwh.e.waterHeater.circuitAmps === 30 && has(hpwh.l.materials, "m-cond", "m-straps", "m-breaker") && lacks(hpwh.l.materials, "m-gasflex", "m-vent") && hpwh.e.checks.find((c) => c.id === "service")?.status === "fix", `${JSON.stringify(hpwh.e.waterHeater)} ${hpwh.e.checks.map((c) => c.id + ":" + c.status).join(",")}`);
// a water-heater catalog row is picked by fuel, type and size
const whCatalog = [...STARTER_CATALOG, { id: "wh-1", kind: "water-heater" as const, brand: "Rheem", model: "PROG50-40N RH62", fuel: "gas" as const, whType: "tank" as const, gallons: 50, uef: 0.64, btuInput: 40000, vent: "atmospheric" as const, cost: 780, source: "shop" as const }, { id: "wh-2", kind: "water-heater" as const, brand: "Rheem", model: "PROG40-38N RH62", fuel: "gas" as const, whType: "tank" as const, gallons: 40, uef: 0.62, btuInput: 38000, vent: "atmospheric" as const, cost: 690, source: "shop" as const }];
const whCat = buildLedger(runEngine(house(), { catalog: whCatalog, job: "water-heater" }), house(), DEFAULT_RATE_CARD, whCatalog, { job: "water-heater" });
ok("Water heater from the catalog: the 50 gal gas row, shop cost + markup", /Rheem PROG50-40N/.test(whCat.materials[0].name) && whCat.materials[0].unitPrice === 1053 && whCat.materials[0].basis === "entered" && /0\.64 UEF/.test(whCat.materials[0].name), whCat.materials[0].name + " $" + whCat.materials[0].unitPrice);
const tankless = waterHeaterPlan(house(), { type: "tankless", fuel: "gas" });
ok("Gas tankless: 199k input and the gas-line note", tankless.btuInput === 199000 && tankless.notes.some((n) => /upsized/.test(n)));

// ducts
const ducts = run("ducts");
ok("Ducts (fair): sealing per register (10 counted), airflow check; no permit", has(ducts.l.materials, "m-seal") && ducts.l.labor.find((r) => r.id === "l-seal")?.quantity === 10 && ducts.l.labor.find((r) => r.id === "l-seal")?.unit === "register" && lacks(ducts.l.labor, "l-permit"), ids(ducts.l.labor).join(","));
const ductsPoor = run("ducts", house({ ducts: { location: "attic", condition: "poor", insulated: false, supplyRegisters: 12 } }));
ok("Ducts (poor): runs replaced per run ×12, permit and haul-off", ductsPoor.l.materials.find((r) => r.id === "m-runs")?.quantity === 12 && ductsPoor.l.labor.find((r) => r.id === "l-runs")?.unit === "run" && has(ductsPoor.l.labor, "l-permit", "l-disposal"), ids(ductsPoor.l.labor).join(","));

// service
const svc = run("service", house({ existing: { kind: "split-ac-furnace", tons: 3, fuel: "gas", refrigerant: "R-22" } }), { service: { task: "Replace the capacitor and contactor", refrigerantLb: 2, parts: [{ name: "Run capacitor 45/5", cost: 28 }, { name: "Contactor 40 A", cost: 35 }] } });
ok("Service: diagnostic, recharge by the lb, the repair task, two parts with markup; no permit", has(svc.l.labor, "l-diag", "l-refr", "l-repair") && svc.l.labor.find((r) => r.id === "l-refr")?.unit === "lb" && svc.l.materials.length === 3 && svc.l.materials.find((r) => r.id === "m-part-0")?.unitPrice === 35 && lacks(svc.l.labor, "l-permit"), ids(svc.l.materials).join(","));
ok("Service on R-22 says so", svc.l.assumptions.some((a) => /R-22/.test(a)) && /Service —/.test(svc.l.title));

// tiers price apart on the starter ladders
const tierRun = (tier: "value" | "mid" | "premium") => { const e = runEngine(house(), { catalog: STARTER_CATALOG, job: "replace-system" }); const c = e.selection.candidates.filter((x) => !x.disqualified && x.item.kind === "air-conditioner" && x.item.tier === tier).sort((a, b) => b.score - a.score)[0]!; return buildLedger({ ...e, selection: { ...e.selection, chosen: c } }, house(), DEFAULT_RATE_CARD, STARTER_CATALOG, { job: "replace-system" }).subtotal; };
const [tv, tm, tp] = [tierRun("value"), tierRun("mid"), tierRun("premium")];
ok("Good < Better < Best on the same house", tv < tm && tm < tp && tp - tv > 1500, `${tv} < ${tm} < ${tp}`);

// the trade review's fixes (2026-09-16)
const fOnly = run("replace-furnace");
ok("Furnace-only: the return check is sized from the load, not 0 tons", !/\b0 CFM|\b0-ton|\b0 sq in/.test(fOnly.e.checks.find((c) => c.id === "return")?.detail ?? "") && /\d{3,} CFM/.test(fOnly.e.checks.find((c) => c.id === "return")?.detail ?? ""), fOnly.e.checks.find((c) => c.id === "return")?.detail);
ok("Furnace-only: vent, neutralizer, CO alarm, vent labor", has(fOnly.l.materials, "m-vent", "m-neut", "m-co") && has(fOnly.l.labor, "l-vent"), ids(fOnly.l.materials).join(","));
ok("Furnace-only: the orphaned water-heater vent and the CO alarm are flagged", fOnly.e.checks.some((c) => /Water-heater vent/.test(c.title)) && fOnly.e.checks.some((c) => /CO alarm/.test(c.title)), fOnly.e.checks.map((c) => c.title).join(" | "));
const pkgHouse = run("replace-system", house({ existing: { kind: "package-unit", tons: 3, fuel: "gas" } }));
ok("Package house: a package unit (rate-card default, no rows), crane, disconnect, no line set or pad", pkgHouse.e.selection.chosen === null && /package|unit/.test(pkgHouse.l.materials[0].name) && has(pkgHouse.l.labor, "l-crane", "l-set") && has(pkgHouse.l.materials, "m-disc") && lacks(pkgHouse.l.materials, "m-lineset", "m-pad", "eq-furnace", "eq-coil"), `${pkgHouse.l.materials[0].name} · ${ids(pkgHouse.l.materials).join(",")} · ${ids(pkgHouse.l.labor).join(",")}`);
ok("Full system with a condensing furnace: PVC vent, neutralizer, CO alarm and vent labor", has(full.l.materials, "m-vent", "m-neut", "m-co") && has(full.l.labor, "l-vent") && /PVC/.test(full.l.materials.find((r) => r.id === "m-vent")?.name ?? ""), ids(full.l.materials).join(","));
ok("Add cooling with an A2L coil on the old furnace: sensor kit + listing check", has(addAc.l.materials, "m-rds") && addAc.e.checks.some((c) => /A2L coil/.test(c.title)), ids(addAc.l.materials).join(","));
ok("Dual fuel keeps the condenser circuit: no new circuit line, the reuse assumption", lacks(hp.l.materials, "m-breaker") && hp.l.labor.find((r) => r.id === "l-elec")?.unitPrice === DEFAULT_RATE_CARD.labor.electricalConnect && hp.l.assumptions.some((a) => /circuit is reused/.test(a)), ids(hp.l.labor).join(","));
const hpFromFurnace = run("heat-pump-conversion", house({ existing: { kind: "furnace-only", fuel: "gas" } }));
ok("Conversion on a furnace-only house: a new circuit", has(hpFromFurnace.l.materials, "m-breaker") && hpFromFurnace.l.labor.find((r) => r.id === "l-elec")?.unitPrice === DEFAULT_RATE_CARD.labor.electricalCircuit);
const tl = run("water-heater", house(), { wh: { type: "tankless", fuel: "gas" } });
ok("Gas tankless: direct vent, GPM sizing, no pan, isolation valves, neutralizer, receptacle, 12 ft vent", tl.e.waterHeater?.vent === "direct" && /GPM/.test(tl.e.waterHeater.sizedFrom) && lacks(tl.l.materials, "m-pan") && has(tl.l.materials, "m-iso", "m-neut", "m-co") && has(tl.l.labor, "l-recep") && tl.l.labor.find((r) => r.id === "l-vent")?.quantity === 12, `${JSON.stringify(tl.e.waterHeater)} ${ids(tl.l.materials).join(",")}`);
ok("Water heater gas check names the water heater and counts the furnace", /the water heater draws/.test(wh.e.checks.find((c) => c.id === "gas")?.detail ?? "") && /other appliances/.test(wh.e.checks.find((c) => c.id === "gas")?.detail ?? ""), wh.e.checks.find((c) => c.id === "gas")?.detail);
ok("Garage gas tank: elevation flag and CO alarm", wh.e.checks.some((c) => /Garage water heater/.test(c.title)) && wh.e.checks.some((c) => /CO alarm/.test(c.title)) && has(wh.l.materials, "m-co"));
const ductsGood = run("ducts", house({ ducts: { location: "attic", condition: "good", insulated: true, supplyRegisters: 8 } }));
ok("Duct job with no grille measured: no return upsize charged, an assumption instead", lacks(ductsGood.l.materials, "m-return") && ductsGood.l.assumptions.some((a) => /Return grille not measured/.test(a)), ids(ductsGood.l.materials).join(","));
const ductsBare = run("ducts", house({ ducts: { location: "attic", condition: "fair", insulated: false, supplyRegisters: 8 } }));
ok("Uninsulated attic ducts: insulation per run is priced", has(ductsBare.l.materials, "m-ins") && ductsBare.l.labor.find((r) => r.id === "l-ins")?.quantity === 8, ids(ductsBare.l.labor).join(","));
ok("Service on R-22: the refrigerant rule shows and R-22 is priced at its own rate", svc.e.checks.some((c) => c.id === "refrigerant") && svc.l.materials.find((r) => r.id === "m-refr")?.unitPrice === 93.75, `${svc.e.checks.map((c) => c.id).join(",")} $${svc.l.materials.find((r) => r.id === "m-refr")?.unitPrice}`);
ok("Ductless zone load carries no duct loss", !dl.e.load.assumptions.some((a) => /Duct loss/.test(a)) && dl.e.load.ductGainCooling === 0, dl.e.load.assumptions.join(" | "));
const bigCoil = run("replace-system", house({ conditionedSqft: 3400, provenance: { ...house().provenance, conditionedSqft: { source: "stated", confidence: "high" } } }));
ok("Big coil takes a furnace whose blower carries it (maxTons)", (() => { const f = bigCoil.l.materials.find((r) => r.id === "eq-furnace"); const tons = bigCoil.e.selection.chosen?.item.tons ?? 0; const row = STARTER_CATALOG.find((c) => f?.name.startsWith(`${c.brand} ${c.model}`)); return !!row && (row.maxTons ?? 0) >= tons; })(), bigCoil.l.materials.find((r) => r.id === "eq-furnace")?.name);

// rate card migration
const v1 = { laborRatePerHour: 100, helperRatePerHour: 50, equipmentMarkupPct: 30, hours: { removeSplit: 3, setOutdoor: 3, setFurnace: 5, lineset: 3, electrical: 2, thermostat: 1, startup: 2 }, materials: { pad: 90 }, equipmentDefaults: { heatPumpPerTon: 1300 } };
const c1 = normalizeRateCard(v1);
ok("v1 card → v2: hours × crew rate become per-task amounts", c1.version === 2 && c1.labor.removeSplit === 450 && c1.labor.setFurnace === 750 && c1.labor.electricalConnect === 300 && c1.labor.linesetPerFt === Math.round((3 * 150) / 25) && c1.equipmentMarkupPct === 30 && c1.materials.pad === 90 && c1.equipmentDefaults.heatPumpPerTon === 1300 && c1.materials.expansionTank === DEFAULT_RATE_CARD.materials.expansionTank, JSON.stringify({ r: c1.labor.removeSplit, f: c1.labor.setFurnace, e: c1.labor.electricalConnect, l: c1.labor.linesetPerFt }));
ok("Garbage in → defaults out", normalizeRateCard(null).labor.startup === DEFAULT_RATE_CARD.labor.startup && normalizeRateCard({ labor: { startup: -5, setOutdoor: "x" } }).labor.startup === DEFAULT_RATE_CARD.labor.startup);
ok("A v2 card round-trips", JSON.stringify(normalizeRateCard(DEFAULT_RATE_CARD)) === JSON.stringify(DEFAULT_RATE_CARD));

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

// Synthetic check of the HVAC engine — no network, no browser.
//   npx tsx --tsconfig tsconfig.json scripts/qa/hvac-engine.check.ts
// The block load moves the way a load must (more insulation → less load, a
// colder design day → more heating, a leakier house → more of both), lands in
// the bands an estimator expects for two well-known houses, and the Manual S
// rules, the heat-pump capacity curve, the NEC 220.83 service check and the
// duct rules answer known cases. Not an ACCA comparison — that is the
// twenty-real-jobs gate in the plan.
import { computeBlockLoad, heatingLoadAt } from "../../src/lib/hvac/load";
import { balancePointF, evaluateItem, heatPumpCapacityAt, selectSystem } from "../../src/lib/hvac/select";
import { ductChecks, electricalCheck, gasCheck, complianceChecks } from "../../src/lib/hvac/checks";
import { decodeModelNumber, decodeSerialYear } from "../../src/lib/hvac/nameplate";
import { efficiencyFloor, incentivesFor, refrigerantRule } from "../../src/lib/hvac/data/rules";
import type { BuildingModel, CatalogItem, DesignConditions } from "../../src/lib/hvac/types";

let failures = 0;
let passes = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const between = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

const dallas: DesignConditions = { state: "TX", county: "Dallas", coolingF: 100, heatingF: 22, hddCddRatio: 0.5, humidity: "humid", grainsDiff: 45, elevationFt: 430, source: "test", verifiedOn: "2026-09-15" };
const seattle: DesignConditions = { state: "WA", county: "King", coolingF: 84, heatingF: 24, hddCddRatio: 3.5, humidity: "dry", grainsDiff: 0, elevationFt: 300, source: "test", verifiedOn: "2026-09-15" };
const minneapolis: DesignConditions = { state: "MN", county: "Hennepin", coolingF: 89, heatingF: -11, hddCddRatio: 3.6, humidity: "moderate", grainsDiff: 28, elevationFt: 840, source: "test", verifiedOn: "2026-09-15" };

function house(over: Partial<BuildingModel> = {}): BuildingModel {
  return {
    address: "test", state: "TX", county: "Dallas",
    conditionedSqft: 2000, storeys: 1, ceilingHeightFt: 8, yearBuilt: 1995,
    windowToFloor: 0.14, windowType: "double", wallInsulation: "r13", ceilingInsulation: "r30",
    foundation: "slab", tightness: "average", roofColor: "medium", shading: "some", occupants: 4,
    existing: { kind: "split-ac-furnace", tons: 4, fuel: "gas", refrigerant: "R-410A" },
    electrical: { mainAmps: 200, freeSlots: 6, electricRange: true, electricDryer: true },
    ducts: { location: "attic", condition: "fair", insulated: true, returnGrilleSqIn: 500, measuredTespInWc: 0.45 },
    gas: { available: true, pipeIn: 0.75, longestRunFt: 40 },
    preferences: {},
    provenance: {},
    ...over,
  };
}

// ── the block load lands in estimator bands ──
{
  const l = computeBlockLoad(house(), dallas);
  ok("Dallas 2,000 sq ft 1995 house: cooling 30–45 kBTU/h", between(l.coolingTotalBtuh, 30000, 45000), `${l.coolingTotalBtuh}`);
  ok("…heating 26–45 kBTU/h (13–22 BTU/h per sq ft)", between(l.heatingBtuh, 26000, 45000), `${l.heatingBtuh}`);
  ok("…humid climate carries latent load", l.coolingLatentBtuh >= 3000 && l.sensibleHeatRatio <= 0.9, `latent ${l.coolingLatentBtuh}, SHR ${l.sensibleHeatRatio}`);
  ok("…loads rounded to 500", l.heatingBtuh % 500 === 0 && l.coolingTotalBtuh % 500 === 0);
  ok("…airflow 350 CFM per ton in a humid climate", l.cfmPerTon === 350);
  const s = computeBlockLoad(house({ state: "WA", county: "King", conditionedSqft: 1800, yearBuilt: 1972, windowType: "single", wallInsulation: "r11", ceilingInsulation: "r19", tightness: "leaky", foundation: "crawl-vented", ducts: { location: "crawl", condition: "fair" } }), seattle);
  ok("Seattle 1,800 sq ft 1972 house: heating 40–65 kBTU/h", between(s.heatingBtuh, 40000, 65000), `${s.heatingBtuh}`);
  ok("…cooling 15–30 kBTU/h", between(s.coolingTotalBtuh, 15000, 30000), `${s.coolingTotalBtuh}`);
  ok("…dry climate: no infiltration latent", s.components.find((c) => c.name.startsWith("Infiltration"))!.coolingLatentBtuh === 0);
}

// ── monotonic behaviour ──
{
  const base = computeBlockLoad(house(), dallas);
  const insulated = computeBlockLoad(house({ wallInsulation: "r21", ceilingInsulation: "r49", windowType: "double-lowe" }), dallas);
  ok("more insulation → less heating and cooling", insulated.heatingBtuh < base.heatingBtuh && insulated.coolingTotalBtuh < base.coolingTotalBtuh);
  const leaky = computeBlockLoad(house({ tightness: "leaky" }), dallas);
  ok("leakier house → more of both", leaky.heatingBtuh > base.heatingBtuh && leaky.coolingTotalBtuh > base.coolingTotalBtuh);
  const cold = computeBlockLoad(house(), minneapolis);
  ok("colder design day → more heating", cold.heatingBtuh > base.heatingBtuh);
  const inside = computeBlockLoad(house({ ducts: { location: "conditioned", condition: "good" } }), dallas);
  ok("ducts inside the envelope → less load than attic ducts", inside.heatingBtuh < base.heatingBtuh && inside.coolingTotalBtuh < base.coolingTotalBtuh);
  const dark = computeBlockLoad(house({ roofColor: "dark" }), dallas);
  const light = computeBlockLoad(house({ roofColor: "light" }), dallas);
  ok("dark roof → more cooling than light roof", dark.coolingSensibleBtuh > light.coolingSensibleBtuh);
  const west = computeBlockLoad(house({ footprintEdges: [{ bearingDeg: 270, lengthFt: 100 }, { bearingDeg: 90, lengthFt: 100 }] }), dallas);
  const north = computeBlockLoad(house({ footprintEdges: [{ bearingDeg: 0, lengthFt: 100 }, { bearingDeg: 180, lengthFt: 100 }] }), dallas);
  ok("east/west glass gains more than north/south glass", west.coolingSensibleBtuh > north.coolingSensibleBtuh);
  ok("every assumption names its table or figure", base.assumptions.length >= 3 && base.assumptions.every((a) => a.length > 12));
  ok("components sum to the pre-duct totals", (() => {
    const noDuct = computeBlockLoad(house({ ducts: { location: "conditioned", condition: "good" } }), dallas);
    const h = noDuct.components.reduce((a, c) => a + c.heatingBtuh, 0);
    return Math.abs(h - noDuct.heatingBtuh) <= 250;
  })());
  ok("heating load falls to zero at 65 °F", heatingLoadAt(base, dallas, 65) === 0 && heatingLoadAt(base, dallas, dallas.heatingF) === base.heatingBtuh);
}

// ── Manual S rules ──
const load = computeBlockLoad(house(), dallas);
const hp = (tons: number, over: Partial<CatalogItem> = {}): CatalogItem => ({ id: `hp${tons}`, kind: "heat-pump", brand: "Acme", model: `HP${tons * 12}`, refrigerant: "R-454B", staging: "single", tons, seer2: 15, hspf2: 8, source: "shop", ...over });
{
  const small = evaluateItem(hp(2), load, dallas, house());
  ok("a 2-ton unit is disqualified under 90% of the load", !!small.disqualified, small.disqualified);
  const big = evaluateItem(hp(5), load, dallas, house());
  ok("a 5-ton unit is disqualified over 115% (single-stage)", !!big.disqualified, big.disqualified);
  const vari = evaluateItem(hp(4, { staging: "variable" }), load, dallas, house());
  ok("variable capacity gets Manual S latitude to 125%", !vari.disqualified || (vari.coolingRatio ?? 0) > 1.25, `ratio ${vari.coolingRatio}`);
  const right = evaluateItem(hp(3.5), load, dallas, house());
  const also = evaluateItem(hp(3), load, dallas, house());
  ok("the closer size scores higher", !right.disqualified && !also.disqualified && Math.abs((right.coolingRatio ?? 0) - 1.05) < Math.abs((also.coolingRatio ?? 0) - 1.05) ? right.score >= also.score : also.score >= right.score);
  const ny = evaluateItem(hp(3.5, { refrigerant: "R-410A" }), load, dallas, house({ state: "NY" }));
  ok("R-410A is disqualified in New York", !!ny.disqualified);
  const tx410 = evaluateItem(hp(3.5, { refrigerant: "R-410A" }), load, dallas, house());
  ok("R-410A elsewhere is allowed with a verify note", !tx410.disqualified && tx410.reasons.some((r) => /manufacture date/.test(r)));
  const low = evaluateItem(hp(3.5, { seer2: 13 }), load, dallas, house());
  ok("13 SEER2 fails the Southeast 14.3 floor", !!low.disqualified);
  ok("North region AC floor is 13.4 SEER2", efficiencyFloor("OH", "air-conditioner", 36000).seer2 === 13.4);
  ok("Southwest carries an EER2 floor, with the lower one for a high-SEER2 unit", efficiencyFloor("AZ", "air-conditioner", 36000).eer2 === 11.7 && efficiencyFloor("AZ", "air-conditioner", 48000).eer2 === 11.2 && efficiencyFloor("AZ", "air-conditioner", 36000).eer2IfHighSeer === 9.8);
  ok("A single-package unit answers to the national floor, not the regional one", efficiencyFloor("AZ", "air-conditioner", 36000, true).seer2 === 13.4 && efficiencyFloor("AZ", "air-conditioner", 36000, true).eer2 === 11 && efficiencyFloor("CA", "heat-pump", 36000, true).hspf2 === 6.7, efficiencyFloor("CA", "air-conditioner", 36000, true).text);
  const sel = selectSystem([hp(2), hp(3), hp(3.5), hp(4), hp(5)], load, dallas, house());
  ok("selection picks an in-window unit and a runner-up", !!sel.chosen && !!sel.runnerUp && !sel.chosen.disqualified, sel.chosen?.item.model);
  ok("target tons rounds to the half ton", sel.targetTons % 0.5 === 0);
}

// ── heat pump at temperature ──
{
  const unit = hp(3, { heat47Btuh: 36000, heat17Btuh: 27000, heat5Btuh: 22000 });
  ok("published points interpolate: 32 °F between 27 and 36", between(heatPumpCapacityAt(unit, 32), 30000, 33000), String(heatPumpCapacityAt(unit, 32)));
  ok("below 5 °F keeps falling but not under 30%", heatPumpCapacityAt(unit, -10) < 22000 && heatPumpCapacityAt(unit, -10) >= 10800);
  ok("above 47 °F holds the rating", heatPumpCapacityAt(unit, 60) === 36000);
  const cc = hp(3, { coldClimate: true });
  const plain = hp(3);
  ok("a cold-climate unit derates less by default", heatPumpCapacityAt(cc, 5) > heatPumpCapacityAt(plain, 5));
  const mn = computeBlockLoad(house({ state: "MN" }), minneapolis);
  // A unit sized to Minneapolis's cooling load, with published cold points.
  const mnTons = Math.max(1.5, Math.round((mn.coolingTotalBtuh / 12000) * 2) / 2);
  const mnUnit = hp(mnTons, { heat47Btuh: mnTons * 12000, heat17Btuh: mnTons * 12000 * 0.75, heat5Btuh: mnTons * 12000 * 0.61 });
  const c = evaluateItem(mnUnit, mn, minneapolis, house({ state: "MN" }));
  ok("Minneapolis unit is in the cooling window", !c.disqualified, c.disqualified);
  ok("Minneapolis: balance point above the design temp and backup sized", (c.balancePointF ?? -99) > minneapolis.heatingF && (c.backupKw ?? 0) > 0, `balance ${c.balancePointF} °F, backup ${c.backupKw} kW`);
  ok("…a non-cold-climate unit is marked down at −11 °F", c.reasons.some((r) => /cold-climate/.test(r)));
  const bp = balancePointF(unit, load, dallas);
  ok("Dallas: the same unit carries the design day or balances near it", bp !== null && bp <= 40, String(bp));
  ok("the curve spans the design temperature to 65 °F", (c.curve ?? []).length > 5 && c.curve![0].outdoorF <= minneapolis.heatingF && c.curve![c.curve!.length - 1].outdoorF >= 60);
}

// ── furnace ──
{
  const furnace = (input: number, afue = 0.96): CatalogItem => ({ id: "f", kind: "furnace", brand: "Acme", model: `F${input / 1000}`, btuInput: input, afue, source: "shop" });
  const under = evaluateItem(furnace(25000), load, dallas, house());
  const over = evaluateItem(furnace(120000), load, dallas, house());
  const fit = evaluateItem(furnace(40000), load, dallas, house());
  ok("furnace under the heating load is disqualified", !!under.disqualified);
  ok("furnace over 140% is disqualified", !!over.disqualified, `${over.outputRatio}`);
  ok("a 40k condensing furnace fits a 32k load", !fit.disqualified && (fit.outputRatio ?? 0) >= 1, `${fit.outputRatio}`);
  ok("all-electric preference disqualifies a furnace", !!evaluateItem(furnace(60000), load, dallas, house({ preferences: { allElectric: true } })).disqualified);
}

// ── checks ──
{
  const chosen = evaluateItem(hp(3.5, { mcaAmps: 22 }), load, dallas, house());
  const d = ductChecks(load, house(), chosen);
  ok("return grille 500 sq in passes for 3.5 tons (700 wanted → fix)", d.find((x) => x.id === "return")!.status === "fix");
  ok("500 sq in passes for 2 tons", ductChecks(load, house(), evaluateItem(hp(2.5), load, dallas, house())).find((x) => x.id === "return")!.status === "pass");
  ok("static 0.45 within 0.5 rating passes", d.find((x) => x.id === "static")!.status === "pass");
  ok("static 0.9 against 0.5 is a fix", ductChecks(load, house({ ducts: { location: "attic", condition: "fair", measuredTespInWc: 0.9 } }), chosen).find((x) => x.id === "static")!.status === "fix");
  ok("no ducts → full duct system", ductChecks(load, house({ ducts: { location: "none", condition: "unknown" } }), chosen)[0].status === "fix");
  const e = electricalCheck(house(), chosen);
  ok("200 A service fits a 3.5-ton heat pump with strips", e.status === "pass", e.detail);
  const tight = electricalCheck(house({ electrical: { mainAmps: 100, electricRange: true, electricDryer: true, electricWaterHeater: true, evCharger: true } }), evaluateItem(hp(3.5, { mcaAmps: 22 }), computeBlockLoad(house({ state: "MN" }), minneapolis), minneapolis, house({ state: "MN" })));
  ok("100 A service with every electric load and cold-climate strips needs an upgrade", tight.status === "fix", tight.detail);
  ok("unknown panel → verify", electricalCheck(house({ electrical: {} }), chosen).status === "verify");
  const g = gasCheck(house(), { id: "f", kind: "furnace", brand: "A", model: "F80", btuInput: 80000, afue: 0.96, source: "shop" });
  ok("¾-inch pipe over 40 ft carries an 80k furnace", g?.status === "pass", g?.detail);
  const g2 = gasCheck(house({ gas: { available: true, pipeIn: 0.5, longestRunFt: 60 } }), { id: "f", kind: "furnace", brand: "A", model: "F80", btuInput: 80000, afue: 0.96, source: "shop" });
  ok("½-inch pipe over 60 ft cannot carry it", g2?.status === "fix", g2?.detail);
  const ca = complianceChecks(house({ state: "CA" }), chosen.item, { touchesRefrigerant: true, touchesDucts: false, newConstruction: false });
  ok("California adds the 2025-code flags: ECC verification of charge and ducts, the CF forms, the refrigerant cap", ca.some((x) => x.id === "ca-t24-charge") && ca.some((x) => x.id === "ca-t24-duct") && ca.some((x) => x.id === "ca-cf-forms") && ca.some((x) => x.id === "ca-carb-gwp"), ca.map((x) => x.id).join(","));
  ok("refrigerant check rides every selection", ca.some((x) => x.id === "refrigerant"));
}

// ── rules with dates ──
{
  ok("25C is recorded as expired, with a date", incentivesFor("TX").some((r) => r.status === "expired" && /2025-12-31/.test(r.text)));
  ok("California HEEHRA reads reserved", incentivesFor("CA").some((r) => r.status === "reserved"));
  ok("Minnesota HEAR reads active", incentivesFor("MN").some((r) => r.status === "active"));
  ok("every incentive row carries verifiedOn", incentivesFor("WA").every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.verifiedOn)));
  ok("R-22 is a replacement, not a repair", refrigerantRule("TX", "R-22").allowed === false);
}

// ── nameplate ──
{
  ok("'24ACC636A003' reads 3 tons", decodeModelNumber("24ACC636A003").tons === 3);
  ok("'GSZ140361' reads 3 tons", decodeModelNumber("GSZ140361").tons === 3);
  ok("'59SC5A060E17' reads a 60k furnace", decodeModelNumber("59SC5A060E17", "furnace").btuInput === 60000);
  ok("'ML180UH070P36B' reads a 70k furnace", decodeModelNumber("ML180UH070P36B").btuInput === 70000);
  ok("'4TTR3036H1000N' reads 3 tons; 'XR13' reads nothing", decodeModelNumber("4TTR3036H1000N").tons === 3 && decodeModelNumber("XR13").tons === undefined);
  ok("'25HCB636A0030030' reads 3 tons, not the 030 suffix", decodeModelNumber("25HCB636A0030030").tons === 3);
  ok("'GSZ140601' is a 5-ton heat pump, not a 60k furnace", decodeModelNumber("GSZ140601").tons === 5 && decodeModelNumber("GSZ140601").btuInput === undefined);
  ok("'GMVC960803BN' reads an 80k furnace", decodeModelNumber("GMVC960803BN").btuInput === 80000);
  ok("'XC16-036-230' reads 3 tons", decodeModelNumber("XC16-036-230").tons === 3);
  ok("Carrier serial 1219E12345 → 2019", decodeSerialYear("Carrier", "1219E12345").year === 2019);
  ok("Goodman serial 1904123456 → 2019", decodeSerialYear("Goodman", "1904123456").year === 2019);
  ok("unknown brand serial → no year", decodeSerialYear("Mystery", "ABC123").year === undefined);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

// Synthetic check of the county assessor layer registry — no network.
//   npx tsx --tsconfig tsconfig.json scripts/qa/hvac-assessors.check.ts
import { ASSESSOR_LAYERS, assessorLayerFor, recordFromAttributes, storeysFromStyle } from "../../src/lib/hvac/assessors";

let failures = 0;
let passes = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

ok("Skagit resolves with or without 'County'", assessorLayerFor("WA", "Skagit County")?.key === "WA:Skagit" && assessorLayerFor("wa", "skagit")?.key === "WA:Skagit");
ok("Unknown county → null", assessorLayerFor("WA", "Snohomish") === null && assessorLayerFor("TX", "Skagit") === null && assessorLayerFor("WA", undefined) === null);
const cases: Array<[string, number | undefined]> = [["ONE STORY", 1], ["TWO STORY", 2], ["THREE STORY", 3], ["1 & 1/2 STORY", 1.5], ["1 STRY FIN BSMT", 1], ["1.5 STRY FIN BSMT", 1.5], ["2 STRY UNDEV BSMT", 2], ["2.5", 2.5], ["2.5 STY FIN BSMT", 2.5], ["3 STRY FIN BSMT", 3], ["1B", 1], ["1.5B", 1.5], ["2B", 2], ["SPLIT ENTRY", 2], ["BI OR SPLIT LEVEL ENTRY", 2], ["TRI LEVEL", 2], ["SINGLE FAMILY RESIDENCE", undefined], ["DOUBLE WIDE", undefined], ["", undefined]];
const bad = cases.filter(([s, want]) => storeysFromStyle(s) !== want).map(([s, want]) => `${s}→${storeysFromStyle(s)}≠${want}`);
ok("Skagit BuildingStyle → storeys", bad.length === 0, bad.join(", "));
const skagit = ASSESSOR_LAYERS[0];
const r = recordFromAttributes(skagit, { PNumber: "P72695", YearBuilt: "1912", EffYearBuilt: "1988", LivingArea: "1255", GarageSqFt: "440", BuildingStyle: "1 & 1/2 STORY", LandUse: "(111) HOUSEHOLD SFR" })!;
ok("Skagit attributes → record", r.yearBuilt === 1912 && r.livingSqft === 1255 && r.storeys === 1.5 && r.landUse === "(111) HOUSEHOLD SFR" && r.parcelId === "P72695" && /Skagit/.test(r.source), JSON.stringify(r));
ok("Vacant lot → null", recordFromAttributes(skagit, { YearBuilt: null, LivingArea: "0", BuildingStyle: null }) === null);
ok("Garage-only area under 200 is ignored", recordFromAttributes(skagit, { YearBuilt: "2001", LivingArea: "120" })?.livingSqft === undefined);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

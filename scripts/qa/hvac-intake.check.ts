// Synthetic check of the HVAC intake — no network, no browser.
//   npx tsx --tsconfig tsconfig.json scripts/qa/hvac-intake.check.ts
// A site's facts seed a model with every default badged as one; a walkthrough
// reading fills what was said and seen with the right provenance and never
// downgrades a stronger source; a nameplate read is decoded by the rules; the
// county lookup finds exact, fuzzy and median answers; runEngine composes it
// all into one result.
import { applyNameplate, applyStated, applyWalkthrough, modelFromSite, stillDefaulted, type SiteFacts } from "../../src/lib/hvac/intake";
import { countiesFor, designConditionsFor } from "../../src/lib/hvac/designConditions";
import { runEngine } from "../../src/lib/hvac/engine";
import { STARTER_CATALOG } from "../../src/lib/hvac/ledger";
import type { WalkthroughAnalysis } from "../../src/lib/estimate/video-schema";

let failures = 0;
let passes = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

// ── county lookup ───────────────────────────────────────────────────────────
const travis = designConditionsFor("TX", "Travis County");
ok("Travis County TX exact", travis.match === "county" && travis.conditions.coolingF === 99 && travis.conditions.heatingF === 28, `${travis.match} ${travis.conditions.coolingF}/${travis.conditions.heatingF}`);
const miami = designConditionsFor("FL", "Miami-Dade County");
ok("Miami-Dade FL matches with the hyphen", miami.match === "county" && miami.conditions.coolingF >= 88, `${miami.match} ${miami.conditions.county} ${miami.conditions.coolingF}`);
const stl = designConditionsFor("MO", "St. Louis City");
ok("St. Louis City MO resolves", stl.match !== "state" && stl.match !== "none", `${stl.match} → ${stl.conditions.county}`);
const median = designConditionsFor("TX", "Nowhere");
ok("Unknown county → state median, flagged", median.match === "state" && median.approx && /median/.test(median.conditions.source));
const none = designConditionsFor("ZZ", undefined);
ok("Unknown state → national default", none.match === "none" && none.conditions.coolingF === 92);
const pr = designConditionsFor("PR", undefined);
ok("Territory answers its one row", pr.match === "county" && pr.conditions.coolingF > 85, `${pr.conditions.coolingF}`);
ok("countiesFor TX lists 250+", countiesFor("TX").length >= 250, String(countiesFor("TX").length));
ok("Elevation rides through", designConditionsFor("CO", "Denver", 5280).conditions.elevationFt === 5280);
ok("Fairfax County and Fairfax City are different rows", designConditionsFor("VA", "Fairfax County").conditions.county === "Fairfax" && designConditionsFor("VA", "Fairfax City").conditions.county === "Fairfax City");
ok("St. Louis City is the city, St. Louis County the county", designConditionsFor("MO", "St. Louis City").conditions.county === "St. Louis City" && designConditionsFor("MO", "St. Louis County").conditions.county === "St. Louis");
ok("No fuzzy hit from a short prefix: Lee → not Leelanau", designConditionsFor("MI", "Lee County").match === "state");
ok("Whole-word fuzzy still works: Virginia Beach → Virginia Beach City", designConditionsFor("VA", "Virginia Beach").conditions.county === "Virginia Beach City", designConditionsFor("VA", "Virginia Beach").conditions.county);
ok("Renamed counties resolve: Oglala Lakota SD, Kusilvak AK", designConditionsFor("SD", "Oglala Lakota County").match === "county" && designConditionsFor("AK", "Kusilvak Census Area").match === "county");
ok("Split boroughs carry a flagged neighbour: Chugach AK", designConditionsFor("AK", "Chugach Census Area").approx === true);
{
  // Data integrity: every state row is a real county name; the audited counts hold.
  const badRows: string[] = [];
  const counts: Record<string, number> = {};
  for (const st of ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"]) {
    const names = countiesFor(st);
    counts[st] = names.length;
    for (const n of names) if (!n || /[()\d]/.test(n) || n.length > 30 || n === n.toUpperCase()) badRows.push(`${st}:${n}`);
  }
  ok("No junk county rows in any state", badRows.length === 0, badRows.slice(0, 5).join(", "));
  ok("County counts: TN 95, WI 72, VA 133, TX 254, AK 30, SD 66", counts.TN === 95 && counts.WI === 72 && counts.VA === 133 && counts.TX === 254 && counts.AK === 30 && counts.SD === 66, `${counts.TN}/${counts.WI}/${counts.VA}/${counts.TX}/${counts.AK}/${counts.SD}`);
}

// ── site → model ────────────────────────────────────────────────────────────
const site: SiteFacts = {
  address: "4518 Bluestem Hollow Dr, Frisco, TX 75034", state: "TX", county: "Collin", lat: 33.15, lng: -96.82, elevationFt: 720,
  footprintSqft: 1850, perimeterFt: 176, storeys: 2, yearBuilt: 2004,
  roof: { areaSqft: 2600, material: "Asphalt shingle" },
  sources: { footprint: "building footprint at the pin", storeys: "building height 22 ft", yearBuilt: "county record" },
};
const m = modelFromSite(site);
ok("Footprint × storeys → conditioned area, measured", m.conditionedSqft === 3700 && m.provenance.conditionedSqft.source === "measured");
ok("Storeys from the height record", m.storeys === 2 && m.provenance.storeys.source === "measured");
ok("2004 era defaults: double-lowe windows, r13 walls", m.windowType === "double-lowe" && m.wallInsulation === "r13", `${m.windowType} ${m.wallInsulation}`);
ok("Era defaults are badged default", m.provenance.windowType.source === "default" && /2000/.test(m.provenance.windowType.note ?? ""), m.provenance.windowType.note);
ok("Foundation, ducts, gas default with notes", m.provenance.foundation.source === "default" && m.provenance["ducts.location"].source === "default" && m.provenance["gas.available"].source === "default");
const noFoot = modelFromSite({ address: "x", state: "WA", sources: {} });
ok("No footprint → area 0 and asks", noFoot.conditionedSqft === 0 && /enter/.test(noFoot.provenance.conditionedSqft.note ?? ""));
ok("Unknown year → 1985 note", /1985/.test(noFoot.provenance.yearBuilt.note ?? ""));
ok("stillDefaulted lists the load's open fields", stillDefaulted(m).includes("foundation") && stillDefaulted(m).includes("electrical.mainAmps") && !stillDefaulted(m).includes("conditionedSqft"));

// ── walkthrough ─────────────────────────────────────────────────────────────
const analysis: WalkthroughAnalysis = {
  projectType: "other",
  title: "HVAC replacement",
  location: "Frisco, TX",
  scope: "Replace a 4-ton R-22 split system.",
  measurements: [
    { label: "Square footage", value: "2,400", unit: "sq ft", confidence: "high", source: "spoken" },
    { label: "Ceiling height", value: "9", unit: "ft", confidence: "medium", source: "spoken" },
    { label: "Main breaker", value: "150", unit: "A", confidence: "high", source: "visual" },
    { label: "Free breaker slots", value: "2", confidence: "medium", source: "visual" },
    { label: "Outdoor unit model", value: "24ACC636A003", confidence: "high", source: "visual" },
    { label: "Serial", value: "2611E12345", confidence: "medium", source: "visual" },
    { label: "Year built", value: "1998", confidence: "medium", source: "spoken" },
    { label: "Storeys", value: "1", confidence: "high", source: "spoken" },
  ],
  observations: [
    "Ducts run through the attic and look uninsulated with tape peeling — poor condition.",
    "Gas furnace in the garage closet, natural gas meter on the west wall.",
    "Single-pane aluminum windows on the back of the house.",
    "Dark shingle roof, no shade on the south side, full sun.",
    "Electric dryer in the laundry room.",
  ],
  frames: [],
  enoughDetail: true,
  questions: [],
  confidence: 80,
  transcriptHighlights: ["Owner wants to keep the gas furnace.", "The condenser is R-22 and from 2004."],
};
const { applied } = applyWalkthrough(m, analysis);
ok("Spoken area (high) overrides footprint × storeys (medium)", m.conditionedSqft === 2400 && m.provenance.conditionedSqft.source === "stated", `${m.conditionedSqft} ${m.provenance.conditionedSqft.source}`);
ok("Spoken storeys override the building-height guess", m.storeys === 1 && m.provenance.storeys.source === "stated");
ok("Ceiling height stated", m.ceilingHeightFt === 9 && m.provenance.ceilingHeightFt.source === "stated");
ok("Panel amps read from a frame", m.electrical.mainAmps === 150 && m.provenance["electrical.mainAmps"].source === "read");
ok("Free slots read", m.electrical.freeSlots === 2);
ok("Model number decoded to 3 tons", m.existing.model === "24ACC636A003" && m.existing.tons === 3, `${m.existing.tons}`);
ok("Year built stated overrides the record", m.yearBuilt === 1998 && m.provenance.yearBuilt.source === "stated");
ok("Attic ducts, poor, uninsulated", m.ducts.location === "attic" && m.ducts.condition === "poor" && m.ducts.insulated === false, `${m.ducts.location} ${m.ducts.condition} ${m.ducts.insulated}`);
ok("Gas seen at the meter", m.gas.available === true && m.existing.fuel === "gas" && m.provenance["gas.available"].source === "read");
ok("Single-pane windows override the era default", m.windowType === "single" && m.provenance.windowType.source === "read");
ok("Dark roof, no shade", m.roofColor === "dark" && m.shading === "none");
ok("Electric dryer flagged for the NEC count", m.electrical.electricDryer === true);
ok("Keep gas preference from the transcript", m.preferences.keepGas === true);
ok("R-22 from the highlight", m.existing.refrigerant === "R-22");
ok("applied list names the sources", applied.length >= 10, String(applied.length));

// ── nameplate ───────────────────────────────────────────────────────────────
const m2 = modelFromSite(site);
const np = applyNameplate(m2, { kind: "outdoor", brand: "Goodman", model: "GSZ140361", serial: "1904123456", refrigerant: "R-410A", confidence: "high" });
ok("Outdoor plate → 3 tons from the model code", m2.existing.tons === 3 && np.applied.includes("existing.tons"), `${m2.existing.tons}`);
ok("Goodman serial → 2019", m2.existing.yearMade === 2019, `${m2.existing.yearMade}`);
ok("Refrigerant read", m2.existing.refrigerant === "R-410A");
applyNameplate(m2, { kind: "furnace", brand: "Carrier", model: "59SC5A060E17", confidence: "medium" });
ok("Furnace plate → 60k input", m2.existing.btuInput === 60000, `${m2.existing.btuInput}`);
ok("Furnace plate assumes gas fuel, low confidence", m2.existing.fuel === "gas" && m2.provenance["existing.fuel"].confidence === "low");
const m3 = modelFromSite(site);
applyNameplate(m3, { kind: "outdoor", brand: "Carrier", model: "24ACC636A003", tons: 4, confidence: "low" });
ok("Plate's own tons beat the decode", m3.existing.tons === 4);
// Regex guards: negation, preference and dimension products.
const obs = (texts: string[], meas: WalkthroughAnalysis["measurements"] = []) => { const mm = modelFromSite({ address: "x", state: "TX", footprintSqft: 2000, storeys: 1, yearBuilt: 1998, sources: {} }); applyWalkthrough(mm, { ...analysis, measurements: meas, observations: texts, transcriptHighlights: [] }); return mm; };
ok("\"No basement\" leaves the foundation alone", obs(["No basement under the house."]).provenance.foundation.source === "default");
ok("\"Interested in a heat pump\" is a preference, not the existing kind", (() => { const mm = obs(["Owner is interested in a heat pump instead of the furnace."]); return mm.existing.kind === "split-ac-furnace" && mm.preferences.allElectric === true; })());
ok("\"No noise complaints\" is not noise sensitivity", obs(["No noise complaints from the neighbours."]).preferences.noiseSensitive === undefined);
ok("\"Wants it quiet\" is", obs(["She wants it quiet, the old one is too loud."]).preferences.noiseSensitive === true);
ok("Return grille 20x25 → 500 sq in", obs([], [{ label: "Return grille size", value: "20x25", unit: "in", confidence: "high", source: "spoken" }]).ducts.returnGrilleSqIn === 500);
ok("\"Packaged shingles\" is not a package unit", obs(["Packaged shingles stacked by the garage."]).existing.kind === "split-ac-furnace");
const m4 = modelFromSite({ address: "x", state: "TX", footprintSqft: 1500, storeys: 1, sources: {} });
applyWalkthrough(m4, { ...analysis, measurements: [{ label: "Square footage", value: "about 1,600", confidence: "low", source: "inferred" }] });
ok("An inferred figure does not override a measured footprint", m4.conditionedSqft === 1500 && m4.provenance.conditionedSqft.source === "measured");
applyStated(m3, "conditionedSqft", 2200);
ok("Typed answer is the strongest source", m3.conditionedSqft === 2200 && m3.provenance.conditionedSqft.source === "stated");
const before = m3.conditionedSqft;
applyWalkthrough(m3, { ...analysis, measurements: [{ label: "Square footage", value: "1,500", confidence: "high", source: "spoken" }] });
ok("A later spoken figure does not override a typed one", m3.conditionedSqft === before);

// ── engine end to end ───────────────────────────────────────────────────────
const res = runEngine(m, { catalog: STARTER_CATALOG });
ok("Engine resolves Collin County TX", res.conditions.county === "Collin" && res.conditions.coolingF >= 96, `${res.conditions.county} ${res.conditions.coolingF}`);
ok("Load in band for 2,400 sq ft, 9 ft ceilings, single-pane, dark roof, no shade, poor attic ducts", res.load.coolingTotalBtuh >= 40000 && res.load.coolingTotalBtuh <= 85000, `${res.load.coolingTotalBtuh}`);
ok("A starter unit was chosen", !!res.selection.chosen, res.selection.chosen?.item.model);
ok("A load past 40k → two systems, each sized to half", res.selection.systems === 2 && !!res.selection.perSystem && Math.abs(res.selection.perSystem.coolingTotalBtuh * 2 - res.load.coolingTotalBtuh) <= 500, `${res.selection.systems} × ${res.selection.perSystem?.coolingTotalBtuh} of ${res.load.coolingTotalBtuh}`);
ok("The split is explained in the notes", res.notes.some((x) => x.kind === "contractor" && /2 systems/.test(x.text)));
ok("Keep-gas house picks an AC (not a heat pump)", res.selection.chosen?.item.kind === "air-conditioner", res.selection.chosen?.item.kind);
ok("Assumption note names the era table", res.notes.some((n) => n.kind === "assumption" && /era table/.test(n.text)));
ok("Panel flagged for a 150 A house with electric dryer + 5-ton unit?", res.checks.some((c) => c.id === "service"), res.checks.find((c) => c.id === "service")?.status);
ok("TX incentive rows present", res.notes.some((n) => n.kind === "incentive"));
ok("Engine version stamped", typeof res.engineVersion === "string" && res.engineVersion.length > 0);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

// Flat roofs, commercial pricing, the valley estimate and the flat rule —
// the behaviour the 2026-09-14 design review asked to be pinned before ship.
//   npx tsx scripts/qa/lowSlope.check.ts
import { BUILTIN_LISTS } from "../../src/lib/roofPackage/catalog";
import { readBuilding } from "../../src/lib/roofPackage/commercial";
import { isFlatRoof } from "../../src/lib/roofPackage/flatRule";
import {
  buildRoofPackage,
  defaultSpec,
  estimateEdges,
  estimateValleys,
  withJobClass,
  withSystem,
  type RoofFacts,
  type RoofPackage,
} from "../../src/lib/roofPackage/takeoff";

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const total = (p: RoofPackage) => [...p.materials, ...p.labor].reduce((a, l) => a + l.quantity * l.unitPrice, 0);
const has = (p: RoofPackage, re: RegExp) => [...p.materials, ...p.labor].some((l) => re.test(l.name));
const line = (p: RoofPackage, re: RegExp) => [...p.materials, ...p.labor].find((l) => re.test(l.name));
const sys = (id: string) => BUILTIN_LISTS.systems.find((s) => s.id === id)!;

const house = (over: Partial<RoofFacts> = {}): RoofFacts => ({
  squares: 43.1,
  squaresBasis: "measured",
  pitchFamilies: [{ pitch12: 5, share: 1 }],
  pitchBasis: "measured",
  perimeterFt: 232,
  footprintSqft: 2880,
  chimney: false,
  rooftopAcCount: 0,
  shape: "Hip",
  facetCount: 6,
  measured: null,
  existingMaterial: "Tile",
  facetConfidence: null,
  buildingUse: null,
  ...over,
});
const flatRoof = (over: Partial<RoofFacts> = {}): RoofFacts =>
  house({ pitchFamilies: [{ pitch12: 0.5, share: 1 }], shape: "Flat", facetCount: 1, existingMaterial: "Flat", squares: 22, footprintSqft: 2200, perimeterFt: 196, ...over });

console.log("── valley estimate");
check("simple gable is a confident zero", estimateValleys(house({ shape: "Gable", facetCount: 2, footprintSqft: 1600, perimeterFt: 168, pitchFamilies: [{ pitch12: 6, share: 1 }] }))?.count === 0);
check("simple hip is a confident zero", estimateValleys(house({ facetCount: 4, footprintSqft: 1800, perimeterFt: 178 }))?.count === 0);
check("one extra facet on a hip is not a wing", estimateValleys(house({ facetCount: 5 }))?.count === 0);
const v6 = estimateValleys(house());
check("the asked-about house: 2 valleys, about 42 ft", v6?.count === 2 && Math.abs((v6?.totalFt ?? 0) - 42) < 1.5, JSON.stringify(v6));
check("billed total equals count × each", v6 != null && Math.abs(v6.totalFt - v6.count * v6.ftEach) < 0.051);
const v8 = estimateValleys(house({ facetCount: 8, footprintSqft: 2400, perimeterFt: 210, pitchFamilies: [{ pitch12: 6, share: 1 }] }));
check("8-facet hip: 4 valleys, 50–65 ft", v8?.count === 4 && (v8?.totalFt ?? 0) >= 50 && (v8?.totalFt ?? 0) <= 65, JSON.stringify(v8));
const v12 = estimateValleys(house({ facetCount: 12, shape: "Complex", footprintSqft: 3200, perimeterFt: 300, pitchFamilies: [{ pitch12: 8, share: 1 }] }));
check("12-facet complex: 2–4 ft of valley per square", v12 != null && v12.totalFt / 32 >= 2 && v12.totalFt / 32 <= 4, JSON.stringify(v12));
check("a zero footprint and no perimeter is no figure, never NaN", estimateValleys(house({ footprintSqft: 0, perimeterFt: null })) === null);
check("a low facet confidence is no figure", estimateValleys(house({ facetConfidence: 0.19 })) === null);
check("a trusted facet confidence gives a figure", estimateValleys(house({ facetConfidence: 0.8 }))?.count === 2);
check("facets below the shape's base is no figure", estimateValleys(house({ facetCount: 3 })) === null);
check("20+ facets is no figure", estimateValleys(house({ facetCount: 24 })) === null);
check("a tiny body is no figure", estimateValleys(house({ footprintSqft: 180, perimeterFt: 54 })) === null);
check("a flat roof has no valleys", estimateValleys(flatRoof({ facetCount: 5 }))?.count === 0);
const measuredZero = defaultSpec(house({ measured: { reportId: 9, eaveFt: 200, rakeFt: 30, ridgeFt: 40, hipFt: 80, valleyFt: 0, stepFlashFt: 0 } }));
check("a report that measured zero valleys stays zero", measuredZero.valleyCount === 0 && measuredZero.valleyBasis === "measured");
const est = defaultSpec(house());
check("the house opens with 2 estimated valleys", est.valleyCount === 2 && est.valleyBasis === "estimated");
check("a tile roof opens on raised-rib valleys", est.valleyTypeId === "raised_rib", est.valleyTypeId);
check("the hero reads the same valley feet", estimateEdges(house())?.valleyFt === v6?.totalFt);

console.log("── flat rule");
check("half the roof under 2/12 is flat", isFlatRoof(house({ pitchFamilies: [{ pitch12: 1, share: 0.6 }, { pitch12: 6, share: 0.4 }] })));
check("3/12 alone is not flat", !isFlatRoof(house({ pitchFamilies: [{ pitch12: 3, share: 1 }], existingMaterial: "Asphalt shingle" })));
check("3/12 with a flat shape word is flat", isFlatRoof(house({ pitchFamilies: [{ pitch12: 3, share: 1 }], shape: "Flat" })));
check("no pitch, TPO material is flat", isFlatRoof(house({ pitchFamilies: [], shape: null, existingMaterial: "TPO" })));
check("a report never overrides a stated 8/12 pitch", !isFlatRoof(house({ pitchFamilies: [{ pitch12: 8, share: 1 }], shape: null, existingMaterial: null, measured: { reportId: 1, eaveFt: 300, rakeFt: 0, ridgeFt: 5, hipFt: 0, valleyFt: 0, stepFlashFt: 0 } })));
const flatEdges = estimateEdges(flatRoof({ shape: "Complex" }));
check("a flat roof the data calls Complex has no ridge or hip", flatEdges?.ridgeFt === 0 && flatEdges?.hipFt === 0 && flatEdges?.rakeFt === 0);

console.log("── residential flat roof");
const rf = flatRoof();
const rs = defaultSpec(rf);
const rp = buildRoofPackage(rs, rf);
check("opens on a flat system", rs.systemFamily === "low-slope" && rs.systemId === "tpo", rs.systemId);
check("carries no shingle lines", !has(rp, /ridge cap|starter|ice & water|ridge vent|roofing nails|soffit|drip edge · f-style|underlayment/i));
check("has fasteners, seam sealant, cover board, edge metal, install, tear-off", has(rp, /membrane fasteners/i) && has(rp, /seam cleaner/i) && has(rp, /cover board/i) && has(rp, /edge metal/i) && has(rp, /^install · tpo/i) && has(rp, /^tear-off/i));
check("a house gets no crane, drains, cores, walkway or NDL warranty", !has(rp, /crane|roof drain|core cut|walkway|NDL/i));
check("a house gets a hoist and fall protection", has(rp, /ladder hoist/i) && has(rp, /fall protection/i));
check("no ventilation check on a membrane deck", rp.vent === null);
check("no commercial lines", !has(rp, /mobilization|general conditions|asbestos/i));
const rsq = total(rp) / (rf.squares * 100);
check("a residential flat TPO reroof lands at $5–11 per sq ft", rsq >= 5 && rsq <= 11, `$${rsq.toFixed(2)}/sq ft`);
const tiny = flatRoof({ squares: 4, footprintSqft: 400, perimeterFt: 84 });
const tp = buildRoofPackage(defaultSpec(tiny), tiny);
check("a 4-square porch roof stays under $8k", total(tp) < 8000, `$${Math.round(total(tp))}`);
check("every quantity is finite and positive", [...tp.materials, ...tp.labor, ...rp.materials, ...rp.labor].every((l) => Number.isFinite(l.quantity) && l.quantity > 0 && Number.isFinite(l.unitPrice) && l.unitPrice >= 0));

console.log("── like-for-like on flat roofs");
check("EPDM stays EPDM", defaultSpec(flatRoof({ existingMaterial: "EPDM rubber" })).systemId === "epdm");
const burSpec = defaultSpec(flatRoof({ existingMaterial: "Built-up gravel" }));
check("gravel built-up stays built-up, priced as gravel tear-off", burSpec.systemId === "bur" && burSpec.tearOffPerSqLayer === 195 && burSpec.disposalPerSqLayer === 110);
const burPkg = buildRoofPackage(burSpec, flatRoof({ existingMaterial: "Built-up gravel" }));
check("hot-mopped built-up gets a kettle and a gravel vacuum", has(burPkg, /kettle/i) && has(burPkg, /gravel vacuum/i));
check("a generic 'Flat' word uses the contractor's usual flat system", defaultSpec(flatRoof(), BUILTIN_LISTS, "mod_bit").systemId === "mod_bit");
check("a silicone-coated roof is recoated like-for-like", defaultSpec(flatRoof({ existingMaterial: "Silicone coating" })).systemId === "coat_silicone");
check("spray foam stays spray foam", defaultSpec(flatRoof({ existingMaterial: "Spray foam" })).systemId === "spf_silicone");
check("stone-coated steel is still metal, not a coating", defaultSpec(house({ existingMaterial: "Stone-coated steel" })).systemFamily === "metal");

console.log("── commercial");
const cf = flatRoof({ squares: 120, footprintSqft: 12000, perimeterFt: 450, rooftopAcCount: 4, existingMaterial: "Membrane", buildingUse: "commercial" });
const cs = defaultSpec(cf);
const cp = buildRoofPackage(cs, cf);
check("commercial deck: R-25 insulation, coping, base flashing, drains with overflows", has(cp, /Insulation · Polyiso R-25/) && has(cp, /coping cap/i) && has(cp, /base flashing/i) && line(cp, /retrofit insert$/i)?.quantity === 3 && has(cp, /overflow scupper/i));
check("commercial deck: RTU curbs from the aerial count, walkway, crane, cores, NDL 20", line(cp, /rooftop unit curb · flashing/i)?.quantity === 4 && has(cp, /walkway/i) && has(cp, /crane & operator/i) && has(cp, /core cuts/i) && has(cp, /NDL · 20-yr/));
check("commercial lines: mobilization, safety plan, asbestos survey, superintendent, valuation permit, general conditions", has(cp, /mobilization · setup/i) && has(cp, /safety plan/i) && has(cp, /asbestos/i) && has(cp, /superintendent/i) && has(cp, /valuation-based/i) && has(cp, /general conditions/i));
check("field install labor goes DOWN on a 120-square deck", line(cp, /^install · tpo/i)?.unitPrice === 140.25, String(line(cp, /^install · tpo/i)?.unitPrice));
check("the residential permit lump is gone", !has(cp, /^permit & inspection$/i));
const gc = line(cp, /general conditions/i)!;
const nonPass = [...cp.materials, ...cp.labor].filter((l) => !/general conditions|asbestos|valuation-based|NDL|manufacturer inspection|bond/i.test(l.name)).reduce((a, l) => a + l.quantity * l.unitPrice, 0);
check("general conditions is 10.5% of everything except the at-cost fees", Math.abs(gc.unitPrice - Math.round(nonPass * 0.105)) <= 1, `${gc.unitPrice} vs ${Math.round(nonPass * 0.105)}`);
const csq = total(cp) / (cf.squares * 100);
check("a commercial R-25 TPO reroof lands at $8–15 per sq ft", csq >= 8 && csq <= 15, `$${csq.toFixed(2)}/sq ft`);
const prevailing = buildRoofPackage({ ...cs, commercial: { ...cs.commercial, wage: "prevailing", shift: "night" } }, cf);
check("prevailing wage at night raises crew labor and adds payroll and light towers", (line(prevailing, /^install · tpo/i)?.unitPrice ?? 0) > 300 && has(prevailing, /certified payroll/i) && has(prevailing, /light towers/i));
check("a steep house is untouched by commercial when the contractor says residential", !has(buildRoofPackage(defaultSpec(house()), house()), /mobilization|general conditions/i));
const aptSteep = buildRoofPackage(withJobClass(defaultSpec(house()), house(), BUILTIN_LISTS, true), house());
check("commercial pricing also works on a steep roof", has(aptSteep, /mobilization/i) && has(aptSteep, /general conditions/i) && has(aptSteep, /^install · concrete tile/i));

console.log("── adhered R-30 regression (review)");
const af = flatRoof({ squares: 40, footprintSqft: 4000, perimeterFt: 260, existingMaterial: "TPO", buildingUse: "residential" });
let as = withSystem(defaultSpec(af), sys("tpo_60_adhered"), af, BUILTIN_LISTS);
as = { ...as, flat: { ...as.flat, insulationId: "iso_r30", insulationMatPerSq: 235, insulationLaborPerSq: 58, insulationThicknessIn: 5.2, taperedSqft: 400, nailersOn: true } };
const ap = buildRoofPackage(as, af);
const asq = total(ap) / 4000;
check("40-square adhered TPO, R-30, tapered, tear-off: $9–14 per sq ft", asq >= 9 && asq <= 14, `$${asq.toFixed(2)}/sq ft`);
check("adhered gets bonding adhesive, not plates", has(ap, /bonding adhesive/i) && !has(ap, /membrane fasteners/i));
check("nailers step up with the insulation height", /4 courses/.test(line(ap, /wood nailers · 2×/i)?.name ?? ""), line(ap, /wood nailers · 2×/i)?.name);

console.log("── switching systems");
const st = defaultSpec(house({ existingMaterial: "Asphalt shingle" }));
const toFlat = withSystem(st, sys("tpo"), house({ existingMaterial: "Asphalt shingle" }), BUILTIN_LISTS);
check("steep to flat drops the shingle package", toFlat.systemFamily === "low-slope" && toFlat.vents.length === 0 && toFlat.iceWater === "none" && !toFlat.starterOn);
const back = withSystem(toFlat, sys("architectural"), house({ existingMaterial: "Asphalt shingle" }), BUILTIN_LISTS);
check("flat back to steep restores the shingle package", back.systemFamily === "asphalt" && back.vents.length > 0 && back.iceWater === "eaves_valleys" && back.starterOn && back.hipFt > 0);
const insulated = { ...defaultSpec(cf) };
const torch = withSystem(insulated, sys("mod_bit"), cf, BUILTIN_LISTS);
check("insulated deck switched to torch-down gets a gypsum cover board", torch.flat.coverBoardId === "gypsum_14");
check("torch-down gets primer and a fire watch", has(buildRoofPackage(torch, cf), /primer · deck/i) && has(buildRoofPackage(torch, cf), /fire watch/i));
const coat = withSystem(defaultSpec(rf), sys("coat_acrylic"), rf, BUILTIN_LISTS);
const coatPkg = buildRoofPackage(coat, rf);
check("a coating goes over the existing roof: no tear-off, insulation or edge metal", coat.tearOffLayers === 0 && !has(coatPkg, /^tear-off|insulation ·|edge metal/i));
check("a coating gets wash, repair, primer (acrylic) and core cuts", has(coatPkg, /power wash/i) && has(coatPkg, /fabric reinforcement/i) && has(coatPkg, /coating primer/i) && coat.flat.coreCuts >= 3);
const backToTpo = withSystem(coat, sys("tpo"), rf, BUILTIN_LISTS);
check("coating back to TPO restores a tear-off", backToTpo.tearOffLayers === 1);
const toggled = withJobClass(rs, rf, BUILTIN_LISTS, true);
check("turning commercial on seeds the commercial deck", toggled.commercial.on && toggled.flat.insulationId === "iso_r25" && toggled.flat.warrantyId === "ndl_20");
check("and off again restores the house defaults", withJobClass(toggled, rf, BUILTIN_LISTS, false).flat.warrantyId === "none");

console.log("── commercial read");
const strong = readBuilding({ facts: cf, mainSquares: 120, minEaveFt: 20, confidence: null, occlusion: null, hasStructure: true });
check("a 120-square flat deck with 4 units and a 20 ft eave reads commercial", strong.level === "confirm", `${strong.score} ${strong.level}`);
const homeRead = readBuilding({ facts: house(), mainSquares: 43, minEaveFt: 10, confidence: null, occlusion: null, hasStructure: true });
check("a tile hip house reads nothing", homeRead.level === null, `${homeRead.score}`);
check("a small structure never gets a read", readBuilding({ facts: cf, mainSquares: 12, minEaveFt: 20, confidence: null, occlusion: null, hasStructure: true }).level === null);
check("no main structure, no read", readBuilding({ facts: cf, mainSquares: 120, minEaveFt: 20, confidence: null, occlusion: null, hasStructure: false }).level === null);
const matOnly = readBuilding({ facts: flatRoof({ pitchFamilies: [], shape: null, existingMaterial: "TPO", squares: 55 }), mainSquares: 55, minEaveFt: 10, confidence: null, occlusion: null, hasStructure: true });
check("the material is not counted twice when it is what made the roof flat", !matOnly.clauses.includes("a membrane surface"), matOnly.clauses.join(", "));
const flatHouse = readBuilding({ facts: flatRoof({ squares: 26 }), mainSquares: 26, minEaveFt: 10, confidence: null, occlusion: null, hasStructure: true });
check("a flat-roofed house alone does not read commercial", flatHouse.level === null, `${flatHouse.score}`);

console.log("── fuzz: no NaN, no negative quantity");
let fuzzBad = 0;
for (const sq of [0, 1, 4, 20, 150, 400]) {
  for (const fp of [null, 0, 300, 5000, 20000]) {
    for (const per of [null, 0, 80, 700]) {
      for (const id of ["tpo", "epdm_ballast", "mod_bit", "bur", "coat_silicone", "spf_silicone", "rolled", "green_roof", "architectural"]) {
        for (const use of ["residential", "commercial"] as const) {
          const facts = flatRoof({ squares: sq, footprintSqft: fp, perimeterFt: per, buildingUse: use, rooftopAcCount: sq > 100 ? 6 : 0 });
          const spec = withSystem(defaultSpec(facts), sys(id), facts, BUILTIN_LISTS);
          const pkg = buildRoofPackage(spec, facts);
          const ok = [...pkg.materials, ...pkg.labor].every((l) => Number.isFinite(l.quantity) && l.quantity >= 0 && Number.isFinite(l.unitPrice) && l.unitPrice >= 0) && Number.isFinite(total(pkg));
          if (!ok) {
            fuzzBad++;
            if (fuzzBad < 4) console.log("   bad:", { sq, fp, per, id, use });
          }
        }
      }
    }
  }
}
check("1,080 roofs priced without a NaN or a negative", fuzzBad === 0, `${fuzzBad} bad`);

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);

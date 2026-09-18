// The fence package engine (lib/fence/*), ported 2026-09-18 from the owner's
// FenceScan app: the catalog, the material takeoff, the slope rules, the
// market tables, the price book, the package lines with their material /
// labor halves, the tier ladder, the client scope and the contractor's
// checks. FenceScan's own expected numbers are held where the rule is the
// same; JobFlex's shapes (runs as polylines, openings by width) are checked
// on their own fixtures.
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/fence-package.check.ts
import { CATEGORY_LABEL, effectiveSpacingFt, FENCE_TYPES, fenceType, heightFactor, nearestHeight, spacingOptions, TERRAIN_FACTOR } from "../../src/lib/fence/catalog";
import { computeFenceTakeoff, concreteBagsPerPost, type FenceLayoutInput } from "../../src/lib/fence/takeoff";
import { burialFt, rackingLimitFt, summarizeSlope, terrainFromGrade, type SlopeSegment } from "../../src/lib/fence/slope";
import { BASIS_BY_TYPE, marketFrostIn, materialFactor, parseStateZip, resolveMarket, STATE_MARKETS } from "../../src/lib/fence/market";
import { driftFromStandard, effectiveRate, isCustomized, rateRows, sanitizeRateBook, standardRate } from "../../src/lib/fence/rates";
import { FENCE_JOB_MINIMUM, fenceChecks, fenceScope, fenceTiers, gateWidthFactor, jobRates, priceFencePackage, resolveFenceType, type CustomFenceType } from "../../src/lib/fence/pricing";
import { EMPTY_FENCE_CATALOG, fenceCatalogSchema } from "../../src/lib/fence/catalogSchema";
import { polylinesToRuns, typedRuns } from "../../src/lib/fence/layout";

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const bom = (t: ReturnType<typeof computeFenceTakeoff>, key: string) => t.bom.find((b) => b.key === key || b.key.startsWith(key + "-"));
const qty = (t: ReturnType<typeof computeFenceTakeoff>, key: string) => bom(t, key)?.qty ?? 0;
const lineOf = (p: ReturnType<typeof priceFencePackage>, id: string) => p.lines.find((l) => l.id === id || l.id.startsWith(id));
const amount = (p: ReturnType<typeof priceFencePackage>, id: string) => { const l = lineOf(p, id); return l ? l.quantity * l.unitPrice : 0; };

/** FenceScan's canonical fixture: cedar 6' privacy, 100 net LF + one 4' walk gate, two corners, open ends. */
const CEDAR_100: FenceLayoutInput = {
  type: "cedar-privacy",
  heightFt: 6,
  runs: [{ lengthFt: 104, corners: 2 }],
  openings: [{ widthFt: 4, kind: "gate", label: "Single gate", variant: "single" }],
  terrain: "flat",
  wastePct: 10,
};

console.log("── catalog");
check("fifteen types: FenceScan's fourteen plus composite privacy", FENCE_TYPES.length === 15 && FENCE_TYPES.some((t) => t.id === "composite-privacy"));
check("every type offers its default height and prices above zero", FENCE_TYPES.every((t) => t.heightsFt.includes(t.defaultHeightFt) && t.materialPerLf > 0 && t.laborPerLf > 0 && t.gateSingle > 0));
check("every type renders as one of the page's five looks", FENCE_TYPES.every((t) => ["cedar", "vinyl", "chain-link", "aluminum", "composite"].includes(t.family)));
check("every category has a label", FENCE_TYPES.every((t) => !!CATEGORY_LABEL[t.category]));
check("split rail is the one system without concrete", FENCE_TYPES.filter((t) => !t.spec.setInConcrete).map((t) => t.id).join() === "split-rail-2");
check("an unknown id falls back to cedar privacy", fenceType("no-such-type").id === "cedar-privacy");
check("height factor: 8' cedar is 4/3 of 6'; a 5' request on pine (4/6/8) reads the default", near(heightFactor(fenceType("cedar-privacy"), 8), 8 / 6) && heightFactor(fenceType("pt-pine-privacy"), 5) === 1);
check("nearest height: 5' on pine → 4' (ties break low), 7' on cedar → 6', 8' on aluminum → 6'", nearestHeight(fenceType("pt-pine-privacy"), 5) === 4 && nearestHeight(fenceType("cedar-privacy"), 7) === 6 && nearestHeight(fenceType("aluminum-ornamental"), 8) === 6);
check("spacing: stick caps at 8', mesh at 12', panels and rails fixed", effectiveSpacingFt(fenceType("cedar-privacy"), 10) === 8 && effectiveSpacingFt(fenceType("chain-link-galv"), 12) === 12 && effectiveSpacingFt(fenceType("vinyl-privacy"), 4) === 8 && effectiveSpacingFt(fenceType("split-rail-2"), 4) === 10 && spacingOptions(fenceType("vinyl-privacy")) === null);
check("terrain factors: flat 1, sloped 1.18, steep 1.4, rocky 1.55", TERRAIN_FACTOR.flat === 1 && TERRAIN_FACTOR.sloped === 1.18 && TERRAIN_FACTOR.steep === 1.4 && TERRAIN_FACTOR.rocky === 1.55);

console.log("── the takeoff on FenceScan's fixture");
{
  const t = computeFenceTakeoff(CEDAR_100);
  check("net 100 LF (the gate opening excluded), 13 sections", t.netFenceLf === 100 && t.sections === 13, `${t.netFenceLf} / ${t.sections}`);
  check("2 corner, 2 end, 2 gate posts; the rest line posts", t.posts.corner === 2 && t.posts.end === 2 && t.posts.gate === 2 && t.posts.total === t.posts.line + 6, JSON.stringify(t.posts));
  const pickets = qty(t, "picket");
  check("pickets ≈ 100 LF × 12 / 5.5\" × 1.1 waste (230–260)", pickets >= 230 && pickets <= 260, String(pickets));
  const tall = computeFenceTakeoff({ ...CEDAR_100, heightFt: 8 });
  check("a taller fence uses LONGER pickets, not more", qty(tall, "picket") === pickets);
  const concrete = qty(t, "concrete");
  check("concrete is volume-based: 2–3.5 bags per post", concrete >= t.posts.total * 2 && concrete <= t.posts.total * 3.5, `${concrete} bags for ${t.posts.total} posts`);
  check("crew hours: a 3-man crew does 100 LF in a day (15–40 h)", t.laborHours > 15 && t.laborHours < 40, String(t.laborHours));
  check("post length: 6' + 2' burial = 8'", t.postLengthFt.base === 8 && t.burialFt === 2);
  check("rails: 13 sections × 3 rails × 1.1", qty(t, "rail") === Math.ceil(13 * 3 * 1.1));
  check("caps for every post, one kit and one hinge set", qty(t, "post-cap") === t.posts.total && qty(t, "gate-kit") === 1 && qty(t, "gate-hardware") === 1);
}

console.log("── runs as polylines");
{
  const one = computeFenceTakeoff({ ...CEDAR_100, runs: [{ lengthFt: 102, corners: 2 }], openings: [] });
  const three = computeFenceTakeoff({ ...CEDAR_100, runs: [{ lengthFt: 34, corners: 0 }, { lengthFt: 34, corners: 0 }, { lengthFt: 34, corners: 0 }], openings: [] });
  check("three 34' runs need 15 sections, one 102' run 13", one.sections === 13 && three.sections === 15, `${one.sections} / ${three.sections}`);
  check("…and six end posts", three.posts.end === 6);
  const ring = computeFenceTakeoff({ ...CEDAR_100, runs: [{ lengthFt: 160, corners: 4, closed: true }], openings: [] });
  check("a closed ring carries no end posts", ring.posts.end === 0 && ring.posts.corner === 4);
  const withDouble = computeFenceTakeoff({ ...CEDAR_100, runs: [{ lengthFt: 110, corners: 2 }], openings: [{ widthFt: 10, kind: "gate", label: "Double gate" }] });
  check("a 10' gate subtracts 10' and takes two posts", withDouble.netFenceLf === 100 && withDouble.posts.gate === 2 && /Drive gate kit \(10'/.test(bom(withDouble, "gate-kit")?.label ?? ""));
  const door = computeFenceTakeoff({ ...CEDAR_100, openings: [{ widthFt: 3, kind: "door", label: "Solid door", variant: "solid" }] });
  check("a door is an opening too: its own kit, two posts", qty(door, "gate-kit") === 1 && /door kit/i.test(bom(door, "gate-kit")?.label ?? "") && door.posts.gate === 2);
}

console.log("── the traced path → runs");
{
  const L = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }];
  const one = polylinesToRuns(L);
  check("an L-shaped trace is one run of 70 ft with one corner, open", one.length === 1 && one[0].lengthFt === 70 && one[0].corners === 1 && !one[0].closed, JSON.stringify(one));
  const ring = polylinesToRuns([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }, { x: 0, y: 0 }]);
  check("a closed ring: 140 ft, four corners, no ends", ring.length === 1 && ring[0].lengthFt === 140 && ring[0].corners === 4 && ring[0].closed === true, JSON.stringify(ring));
  const two = polylinesToRuns([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 100, y: 0, gap: true }, { x: 100, y: 30 }, { x: 130, y: 30 }]);
  check("a gap starts a second fence: 40 ft straight + 60 ft with one corner", two.length === 2 && two[0].lengthFt === 40 && two[0].corners === 0 && two[1].lengthFt === 60 && two[1].corners === 1, JSON.stringify(two));
  const ledger = polylinesToRuns(L, (i) => (i === 0 ? 42 : 31));
  check("the ledger's lengths (along the ground, hand-edited) win over the map's", ledger[0].lengthFt === 73, JSON.stringify(ledger));
  check("a lone point or a sliver is no fence", polylinesToRuns([{ x: 0, y: 0 }]).length === 0 && polylinesToRuns([{ x: 0, y: 0 }, { x: 0.01, y: 0 }]).length === 0);
  const typed = typedRuns([40, 60, 40]);
  check("three typed runs are one 140 ft fence with two corners", typed.length === 1 && typed[0].lengthFt === 140 && typed[0].corners === 2 && !typed[0].closed);
  check("typed runs of nothing are no fence", typedRuns([0, NaN]).length === 0);
  const t3 = computeFenceTakeoff({ ...CEDAR_100, runs: typedRuns([40, 60, 40]), openings: [] });
  check("…and take off as 18 sections, 19 posts (15 line, 2 corner, 2 end)", t3.sections === 18 && t3.posts.line === 15 && t3.posts.corner === 2 && t3.posts.end === 2 && t3.posts.total === 19, JSON.stringify(t3.posts));
}

console.log("── families");
{
  const solid = computeFenceTakeoff(CEDAR_100);
  const shadow = computeFenceTakeoff({ ...CEDAR_100, type: "shadowbox" });
  check("shadowbox pickets ≈ double a solid face", qty(shadow, "picket") > qty(solid, "picket") * 1.2);
  const cl = computeFenceTakeoff({ ...CEDAR_100, type: "chain-link-galv", heightFt: 4 });
  check("chain link: fabric, top rail, tension wire — no pickets", !bom(cl, "picket") && !!bom(cl, "mesh") && !!bom(cl, "top-rail") && !!bom(cl, "tension-wire"));
  check("bands only on terminal posts (≤ 24)", qty(cl, "tension-band") <= 24 && qty(cl, "tension-band") > 0, String(qty(cl, "tension-band")));
  check("loop caps on line posts, domes on terminals", qty(cl, "cap-loop") === cl.posts.line && qty(cl, "cap-dome") === cl.posts.corner + cl.posts.end + cl.posts.gate);
  const vinyl = computeFenceTakeoff({ ...CEDAR_100, type: "vinyl-privacy" });
  check("vinyl: one panel per section, stiffeners, no brackets", qty(vinyl, "panel") === vinyl.sections && qty(vinyl, "rail-stiffener") === vinyl.sections && !bom(vinyl, "bracket"));
  const alu = computeFenceTakeoff({ ...CEDAR_100, type: "aluminum-ornamental", heightFt: 4 });
  check("aluminum: 6' panels with bracket pairs", alu.spacingFt === 6 && qty(alu, "bracket") === alu.sections * 2);
  const comp = computeFenceTakeoff({ ...CEDAR_100, type: "composite-privacy" });
  check("composite: panels plus rail sets", qty(comp, "panel") === comp.sections && qty(comp, "rail-set") === comp.sections);
  const split = computeFenceTakeoff({ ...CEDAR_100, type: "split-rail-2", heightFt: 3 });
  check("split rail: gravel, no concrete, no caps, 2 rails a section", !!bom(split, "gravel") && !bom(split, "concrete") && !bom(split, "post-cap") && qty(split, "rail") === Math.ceil(split.sections * 2 * 1.1));
  const horiz4 = computeFenceTakeoff({ ...CEDAR_100, type: "horizontal-modern", heightFt: 4 });
  const horiz6 = computeFenceTakeoff({ ...CEDAR_100, type: "horizontal-modern", heightFt: 6 });
  check("horizontal boards grow with height (courses), 6' bays", qty(horiz6, "picket") >= qty(horiz4, "picket") * 1.3 && horiz6.spacingFt === 6);
  const stained = computeFenceTakeoff({ ...CEDAR_100, stain: true, removalLf: 80 });
  check("stain (gallons, 2 coats) and tear-out lines; no stain on vinyl", !!bom(stained, "stain") && qty(stained, "removal") === 80 && !bom(computeFenceTakeoff({ ...CEDAR_100, type: "vinyl-privacy", stain: true }), "stain"));
  const steel = computeFenceTakeoff({ ...CEDAR_100, postUpgrade: "steel" });
  check("post upgrade counts every post once; not on chain link; not 6×6 on 6×6 stock", qty(steel, "post-upgrade") === steel.posts.total && !bom(computeFenceTakeoff({ ...CEDAR_100, type: "chain-link-galv", heightFt: 4, postUpgrade: "steel" }), "post-upgrade") && !bom(computeFenceTakeoff({ ...CEDAR_100, type: "horizontal-modern", postUpgrade: "6x6" }), "post-upgrade"));
  const tight = computeFenceTakeoff({ ...CEDAR_100, postSpacingFt: 4 });
  check("4' o.c. roughly doubles the sections; junk falls back; panels ignore it", tight.sections >= 25 && computeFenceTakeoff({ ...CEDAR_100, postSpacingFt: 99 }).sections === 13 && computeFenceTakeoff({ ...CEDAR_100, type: "vinyl-privacy", postSpacingFt: 4 }).sections === vinyl.sections, String(tight.sections));
  const stepped = computeFenceTakeoff({ ...CEDAR_100, steppedSections: 3 });
  check("stepped sections add extended posts and time", qty(stepped, "step-posts") === 3 && stepped.laborHours > solid.laborHours && stepped.postLengthFt.step === 10);
}

console.log("── slope");
{
  check("burial: a third of the height, never under 2', never above frost", burialFt(6, 0) === 2 && burialFt(6, 48) === 4 && burialFt(9, 0) === 3);
  check("racking limits: panel 0.5', mesh 1.5', stick 1'", rackingLimitFt("panel") === 0.5 && rackingLimitFt("mesh") === 1.5 && rackingLimitFt("stick") === 1);
  check("terrain from grade: 3% flat, 8% sloped, 15% steep, 25% rocky", terrainFromGrade(3, 6) === "flat" && terrainFromGrade(8, 15) === "sloped" && terrainFromGrade(15, 20) === "steep" && terrainFromGrade(25, 30) === "rocky");
  const segs: SlopeSegment[] = [
    { planFt: 40, gradeFt: 40.2, riseFt: 1, thetaDeg: 1.4, cls: "level" },
    { planFt: 40, gradeFt: 42, riseFt: 8, thetaDeg: 11.3, cls: "racked" },
    { planFt: 24, gradeFt: 27, riseFt: 12, thetaDeg: 26.6, cls: "stepped", steps: 3, stepDropFt: 4 },
  ];
  const s = summarizeSlope(segs, 6, 8, 0);
  check("a 12' drop over three 8' bays splits into 12 code-sized steps", s.steppedSections === 12 && s.maxStepFt === 1, `${s.steppedSections} · max ${s.maxStepFt}`);
  check("racked extra fabric = grade − plan on racked bays", s.rackedExtraLf === 2, String(s.rackedExtraLf));
  check("a 4' per-bay drop reads as a wall", s.wallSegments === 1 && s.wallLikeLf === 24);
  check("post lengths: 8' base, 10' at steps", s.basePostLengthFt === 8 && s.stepPostLengthFt === 10);
  // 2.4% × 40 + 20% × 40 + 50% × 24 over 104 ft = 20.2% average — rocky-grade digging time.
  check("suggested terrain follows the weighted grade (20.2% → rocky)", s.suggestedTerrain === "rocky" && near(s.avgGradePct, 20.2, 0.01), `${s.suggestedTerrain} ${s.avgGradePct}%`);
  const gentle = summarizeSlope([{ planFt: 60, gradeFt: 60.2, riseFt: 4, thetaDeg: 3.8, cls: "level" }, { planFt: 40, gradeFt: 40.5, riseFt: 5, thetaDeg: 7.1, cls: "racked" }], 6, 8, 0);
  check("a gentle yard reads as a gentle slope with no steps", gentle.suggestedTerrain === "sloped" && gentle.steppedSections === 0 && gentle.wallSegments === 0, `${gentle.suggestedTerrain} ${gentle.avgGradePct}%`);
  const fargo = summarizeSlope(segs, 6, 8, 48);
  check("a 48\" frost line makes 4' burial and 10' base posts", fargo.burialFt === 4 && fargo.basePostLengthFt === 10);
}

console.log("── market");
{
  const tx = resolveMarket({ state: "TX", zip: "75034" });
  check("Frisco TX resolves to the Dallas metro (ZIP3 750)", tx.resolution === "zip" && /Dallas/.test(tx.label) && tx.state === "TX", tx.label);
  check("…with Texas frost (6\") and a metro tax", tx.frostIn === 6 && tx.salesTaxRate === 0.0825);
  const nd = resolveMarket({ state: "ND" });
  check("North Dakota: state average, 48\" frost", nd.resolution === "state" && nd.frostIn === 48);
  const sf = resolveMarket({ address: "123 Main St, San Francisco, CA 94110" });
  check("an address string parses to the Bay Area", sf.state === "CA" && sf.zip === "94110" && sf.labor > 1.3, `${sf.label} labor ${sf.labor}`);
  const none = resolveMarket({ address: "somewhere" });
  check("nothing resolvable → national rates, 24\" frost", none.resolution === "national" && marketFrostIn(none) === 24);
  check("parseStateZip is case-insensitive", parseStateZip("austin, tx 78701").state === "TX");
  check("every state row has a frost depth and a region", Object.values(STATE_MARKETS).every((r) => r.frost >= 0 && r.region));
  check("every type has a commodity basis", FENCE_TYPES.every((t) => !!BASIS_BY_TYPE[t.id]));
  const dallas = computeFenceTakeoff({ ...CEDAR_100, frostIn: resolveMarket({ state: "TX" }).frostIn });
  const fargo = computeFenceTakeoff({ ...CEDAR_100, frostIn: 48 });
  check("frost country digs deeper and buys ≥1.7× the concrete", qty(fargo, "concrete") >= qty(dallas, "concrete") * 1.7, `${qty(fargo, "concrete")} vs ${qty(dallas, "concrete")}`);
  check("cedar is cheap in Seattle and dear in Atlanta", materialFactor(resolveMarket({ state: "WA" }), "cedar-privacy") < 0.95 && materialFactor(resolveMarket({ state: "GA" }), "cedar-privacy") > 1.05);
}

console.log("── the price book");
{
  const book = sanitizeRateBook({ "cedar-privacy": { materialPerLf: 26, laborPerLf: 14, gateSingle: "abc" }, "no-such": { materialPerLf: 5 }, "vinyl-privacy": { materialPerLf: 2200 } });
  check("sanitize keeps the changed figure, drops the catalog restatement, the unknown type and the fat finger", book["cedar-privacy"]?.materialPerLf === 26 && book["cedar-privacy"]?.laborPerLf === undefined && !("no-such" in book) && !("vinyl-privacy" in book), JSON.stringify(book));
  check("effective rate: the book where set, the catalog elsewhere", effectiveRate("cedar-privacy", book).materialPerLf === 26 && effectiveRate("cedar-privacy", book).laborPerLf === 14 && effectiveRate("shadowbox", book).materialPerLf === standardRate("shadowbox").materialPerLf);
  check("customized + drift", isCustomized("cedar-privacy", book) && !isCustomized("shadowbox", book) && near(driftFromStandard("cedar-privacy", "materialPerLf", book), 26 / 22 - 1, 0.01));
  check("rate rows list every type in catalog order", rateRows(book).length === FENCE_TYPES.length && rateRows(book)[0].id === FENCE_TYPES[0].id);
  const doc = fenceCatalogSchema.safeParse({ version: 1, rates: book, custom: [{ id: "custom-1", label: "Redwood privacy", like: "cedar-privacy", materialPerLf: 30, laborPerLf: 15 }] });
  check("the catalog document validates; empty is valid", doc.success && fenceCatalogSchema.safeParse(EMPTY_FENCE_CATALOG).success);
  check("a custom type with an unknown base is refused", !fenceCatalogSchema.safeParse({ version: 1, rates: {}, custom: [{ id: "x", label: "X", like: "nope", materialPerLf: 1, laborPerLf: 1 }] }).success);
}

console.log("── package pricing");
{
  const p = priceFencePackage(CEDAR_100);
  const mat = lineOf(p, "fence-materials")!;
  const lab = lineOf(p, "fence-labor")!;
  check("materials line: $22 × 1.1 waste per LF, 100 LF, taxable, all material", near(mat.unitPrice, 24.2, 0.001) && mat.quantity === 100 && mat.taxable && mat.laborCost === 0, `${mat.unitPrice}`);
  check("labor line: $14 per LF on flat ground, untaxed, all labor", lab.unitPrice === 14 && !lab.taxable && lab.materialCost === 0);
  const gate = lineOf(p, "gate-")!;
  check("a 4' walk gate at $385 split 65/35", gate.unitPrice === 385 && near(gate.materialCost, 250.25, 0.001) && near(gate.laborCost, 134.75, 0.001), JSON.stringify(gate));
  check("subtotal = material + labor halves; $/LF headline", near(p.subtotal, p.materialSubtotal + p.laborSubtotal, 0.0001) && near(p.subtotal, 2420 + 1400 + 385) && near(p.pricePerLf, p.subtotal / 100, 0.001));
  check("every line's halves add up to its unit price", p.lines.every((l) => Math.abs(l.materialCost + l.laborCost - l.unitPrice) < 0.011));
  const rocky = priceFencePackage({ ...CEDAR_100, terrain: "rocky" });
  check("terrain multiplies labor only", near(amount(rocky, "fence-labor") / amount(p, "fence-labor"), 1.55, 0.001) && amount(rocky, "fence-materials") === amount(p, "fence-materials"));
  const tall = priceFencePackage({ ...CEDAR_100, heightFt: 8 });
  check("8' prices at 4/3 on both rails and the gate", near(amount(tall, "fence-materials") / amount(p, "fence-materials"), 8 / 6, 0.001) && near(lineOf(tall, "gate-")!.unitPrice, 385 * (8 / 6), 0.01));
  const seven = priceFencePackage({ ...CEDAR_100, heightFt: 7 });
  check("7' cedar builds at 6' and the label says so", seven.builtHeightFt === 6 && /6' fence package/.test(lineOf(seven, "fence-materials")!.name) && fenceChecks(seven, { ...CEDAR_100, heightFt: 7 }).some((c) => /not offered/.test(c.text)));
  const custom = priceFencePackage({ ...CEDAR_100, openings: [{ widthFt: 6, kind: "gate", label: "Custom gate" }] });
  const g6 = lineOf(custom, "gate-")!.unitPrice;
  check("a 6' gate prices between the 4' walk ($385) and the 10' drive ($924)", g6 > 385 && g6 < 924, String(g6));
  let prev = gateWidthFactor(4);
  let monotone = true;
  for (let w = 4.5; w <= 10; w += 0.5) { const f = gateWidthFactor(w); if (!(f > prev && f - prev < prev * 0.2)) monotone = false; prev = f; }
  check("gate pricing is continuous through 4–10' and the 10' custom equals the drive gate", monotone && near(gateWidthFactor(10), 2.4, 0.0001));
  const arched = priceFencePackage({ ...CEDAR_100, openings: [{ widthFt: 4, kind: "gate", label: "Arched gate", variant: "arched" }] });
  const door = priceFencePackage({ ...CEDAR_100, openings: [{ widthFt: 3, kind: "door", label: "Solid door", variant: "solid" }] });
  check("an arched gate costs more than a plain one; a 3' door less", lineOf(arched, "gate-")!.unitPrice > 385 && lineOf(door, "gate-")!.unitPrice < 385);
  const override = priceFencePackage({ ...CEDAR_100, openings: [{ widthFt: 4, kind: "gate", label: "Single gate", variant: "single" }] }, { openingPrices: { single: 500 } });
  check("the shop's own opening price wins", lineOf(override, "gate-")!.unitPrice === 500);
  const steps = priceFencePackage({ ...CEDAR_100, steppedSections: 3 });
  check("slope steps: 3 × $28, 30% material", lineOf(steps, "fence-steps")!.quantity === 3 && near(lineOf(steps, "fence-steps")!.unitPrice, 28, 0.001) && near(lineOf(steps, "fence-steps")!.materialCost, 8.4, 0.01));
  const steel = priceFencePackage({ ...CEDAR_100, postUpgrade: "steel" });
  check("steel posts: every post at $24, all material", lineOf(steel, "fence-post-upgrade")!.quantity === p.takeoff.posts.total && lineOf(steel, "fence-post-upgrade")!.unitPrice === 24 && lineOf(steel, "fence-post-upgrade")!.laborCost === 0);
  const removal = priceFencePackage({ ...CEDAR_100, removalLf: 104 });
  check("tear-out: $4/LF labor, untaxed; the shop's rate overrides", lineOf(removal, "fence-removal")!.unitPrice === 4 && !lineOf(removal, "fence-removal")!.taxable && priceFencePackage({ ...CEDAR_100, removalLf: 104 }, { removalPerLf: 6 }).lines.find((l) => l.id === "fence-removal")!.unitPrice === 6);
  const stain = priceFencePackage({ ...CEDAR_100, stain: true });
  check("stain: 1,200 sq ft at $1.10, 35% material; none on vinyl", lineOf(stain, "fence-stain")!.quantity === 1200 && near(lineOf(stain, "fence-stain")!.unitPrice, 1.1, 0.001) && !lineOf(priceFencePackage({ ...CEDAR_100, type: "vinyl-privacy", stain: true }), "fence-stain"));
  const tiny = priceFencePackage({ ...CEDAR_100, runs: [{ lengthFt: 8, corners: 0 }], openings: [] });
  check("a tiny job floors at the $450 minimum", !!lineOf(tiny, "fence-job-minimum") && near(tiny.subtotal, FENCE_JOB_MINIMUM, 0.001) && !lineOf(p, "fence-job-minimum"));
  const tight = priceFencePackage({ ...CEDAR_100, postSpacingFt: 4 });
  check("tighter spacing raises the price 10–50%, panels ignore it", tight.subtotal > p.subtotal * 1.1 && tight.subtotal < p.subtotal * 1.5 && priceFencePackage({ ...CEDAR_100, type: "vinyl-privacy", postSpacingFt: 4 }).subtotal === priceFencePackage({ ...CEDAR_100, type: "vinyl-privacy" }).subtotal);
  const empty = priceFencePackage({ ...CEDAR_100, runs: [], openings: [] });
  check("no fence prices to zero without NaN", empty.subtotal === 0 && empty.pricePerLf === 0 && empty.lines.length === 0);
}

console.log("── rates: catalog, market, book");
{
  const tx = resolveMarket({ state: "TX", zip: "75034" });
  const r = jobRates(resolveFenceType("cedar-privacy"), { market: tx });
  check("with a market and no book, the catalog rate scales and says 'market'", r.source.materialPerLf === "market" && r.source.laborPerLf === "market" && near(r.laborPerLf, 14 * tx.labor, 0.01), JSON.stringify(r));
  const booked = jobRates(resolveFenceType("cedar-privacy"), { market: tx, rates: { "cedar-privacy": { laborPerLf: 20 } } });
  check("a typed rate is the number charged — no market scaling on it", booked.laborPerLf === 20 && booked.source.laborPerLf === "book" && booked.source.materialPerLf === "market");
  const national = jobRates(resolveFenceType("cedar-privacy"), {});
  check("no market, no book → catalog", national.materialPerLf === 22 && national.source.materialPerLf === "catalog");
  const pkg = priceFencePackage(CEDAR_100, { market: tx });
  check("the market's frost drives the takeoff's holes (Texas: 2' burial)", pkg.takeoff.burialFt === 2 && fenceChecks(pkg, CEDAR_100).some((c) => /24" deep/.test(c.text) && /Dallas/.test(c.text)));
  check("…and the checks say the rates were calibrated", fenceChecks(pkg, CEDAR_100).some((c) => /calibrated to Dallas/.test(c.text)));
  const custom: CustomFenceType = { id: "custom-1", label: "Redwood privacy", like: "cedar-privacy", materialPerLf: 30, laborPerLf: 15 };
  const cp = priceFencePackage({ ...CEDAR_100, type: "custom-1" }, { customs: [custom], market: tx });
  check("a custom type builds like its base and prices at its own rates", cp.resolved.label === "Redwood privacy" && cp.takeoff.sections === 13 && near(lineOf(cp, "fence-materials")!.unitPrice, 33, 0.001) && lineOf(cp, "fence-labor")!.unitPrice === 15 && cp.rates.gateSingle > 0);
}

console.log("── tiers");
{
  const tiers = fenceTiers("cedar-privacy", 6);
  const totals = tiers.map((t) => priceFencePackage({ ...CEDAR_100, type: t.type, stain: t.stain }).subtotal);
  check("Good ≤ Better ≤ Best for cedar at 6'", totals[0] < totals[1] && totals[1] < totals[2] && tiers[1].recommended === true, totals.join(" < "));
  check("steel at 8': aluminum does not come in 8' so Good quotes steel", fenceTiers("steel-ornamental", 8)[0].type === "steel-ornamental" && fenceTiers("steel-ornamental", 6)[0].type === "aluminum-ornamental");
  check("cedar at 5': pine has no 5' so Good stays cedar; at 8' pine is cheaper and swaps in", fenceTiers("cedar-privacy", 5)[0].type === "cedar-privacy" && fenceTiers("cedar-privacy", 8)[0].type === "pt-pine-privacy");
  check("vinyl privacy's Best steps up to composite; composite's Good is vinyl", fenceTiers("vinyl-privacy", 6)[2].type === "composite-privacy" && fenceTiers("composite-privacy", 6)[0].type === "vinyl-privacy");
}

console.log("── scope and checks");
{
  const layout: FenceLayoutInput = { ...CEDAR_100, steppedSections: 2, stain: true, removalLf: 60 };
  const pkg = priceFencePackage(layout);
  const scope = fenceScope(pkg, layout, "4518 Bluestem Hollow Dr");
  check("the scope says the fence, the posts, the gate, the steps, the stain and the tear-out", /100 linear ft of 6' cedar privacy at 4518/.test(scope[0]) && /Posts set in concrete, 8' on center — \d+ posts/.test(scope[1]) && scope.some((s) => /1 × Single gate \(4'\)/.test(s)) && scope.some((s) => /2 sections stepped/.test(s)) && scope.some((s) => /stain and seal/.test(s)) && scope.some((s) => /Tear-out and haul-away of 60/.test(s)), scope.join(" | "));
  check("no prices or estimate words in the scope", !scope.some((s) => /\$|estimat/i.test(s)));
  const checks = fenceChecks(pkg, layout);
  check("checks mention the steps and their post lengths", checks.some((c) => /2 steps down the slope — 10' posts there, 8' elsewhere/.test(c.text)), checks.map((c) => c.text).join(" | "));
  const tallAlu = priceFencePackage({ ...CEDAR_100, type: "aluminum-ornamental", heightFt: 8 });
  const tc = fenceChecks(tallAlu, { ...CEDAR_100, type: "aluminum-ornamental", heightFt: 8 });
  check("8' aluminum: not offered (built at 6'), pool-code note, no permit warning at 6'", tc.some((c) => /not offered/.test(c.text)) && tc.some((c) => /pool-barrier/.test(c.text)) && !tc.some((c) => /cap backyard/.test(c.text)));
  const eight = fenceChecks(priceFencePackage({ ...CEDAR_100, heightFt: 8 }), { ...CEDAR_100, heightFt: 8 });
  check("an 8' fence warns about the permit", eight.some((c) => c.level === "warn" && /cap backyard fences at 6'/.test(c.text)));
  const wide = fenceChecks(priceFencePackage({ ...CEDAR_100, openings: [{ widthFt: 14, kind: "gate", label: "Custom gate" }] }), { ...CEDAR_100, openings: [{ widthFt: 14, kind: "gate", label: "Custom gate" }] });
  check("a 14' swing gate suggests a slide gate", wide.some((c) => /cantilever or slide/.test(c.text)));
  const over = fenceChecks(priceFencePackage({ ...CEDAR_100, removalLf: 300 }), { ...CEDAR_100, removalLf: 300 });
  check("tear-out longer than the fence is flagged", over.some((c) => /longer than the new fence/.test(c.text)));
  check("nothing drawn → no checks", fenceChecks(priceFencePackage({ ...CEDAR_100, runs: [] }), { ...CEDAR_100, runs: [] }).length === 0);
  const bags = concreteBagsPerPost(6, 3.5, 0);
  check("a 4×4 at 2' burial takes about 2–3 bags", bags > 1.8 && bags < 3.2, bags.toFixed(2));
}

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);

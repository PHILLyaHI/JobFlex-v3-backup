// The pictures a proposal carries to the client (2026-09-23): the fence's
// layout drawn from the trace, the roof's outline over the aerial and as a
// plan. Pure, no database.
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/proposal-pictures.check.ts
import { fencePlanSvg, parseFencePlan } from "../../src/lib/fence/planSvg";
import { frameProject, roofFactsLine, roofFrameFor, roofFrameSvg, roofOverlayPoints, roofPlanSvg, roofRings } from "../../src/lib/roofPictures";
import { fenceConvertSchema } from "../../src/lib/fence/convertSchema";

let bad = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── the fence
const plan = {
  points: [{ x: 0, y: 0 }, { x: 104, y: 0 }, { x: 104, y: 60 }, { x: 0, y: 60 }, { x: 0, y: 0 }, { x: 140, y: 10, gap: true }, { x: 140, y: 50 }],
  gates: [{ segmentIndex: 0, t: 0.5, widthFt: 4, kind: "gate" as const, label: "Single gate" }, { segmentIndex: 1, t: 0.3, widthFt: 10, kind: "gate" as const, label: "Double gate" }],
  buildings: [{ ring: [{ x: 20, y: 15 }, { x: 80, y: 15 }, { x: 80, y: 45 }, { x: 20, y: 45 }], role: "subject" as const }, { ring: [{ x: -60, y: 10 }, { x: -20, y: 10 }, { x: -20, y: 40 }, { x: -60, y: 40 }], role: "neighbor" as const }],
  lots: [[{ x: -10, y: -10 }, { x: 150, y: -10 }, { x: 150, y: 70 }, { x: -10, y: 70 }]],
  origin: { lat: 47.77, lng: -122.2 },
  heightFt: 6,
  typeLabel: "Cedar privacy",
  totalLf: 364,
  address: "12103 202nd St SE, Snohomish, WA 98296",
};
const parsed = parseFencePlan(JSON.parse(JSON.stringify(plan)));
check("a stored plan reads back whole: points, gates, houses, lot, the facts", !!parsed && parsed.points.length === 7 && parsed.gates.length === 2 && parsed.buildings.length === 2 && parsed.lots.length === 1 && parsed.totalLf === 364);
check("a bad plan is no plan, never a crash", parseFencePlan(null) === null && parseFencePlan({ points: [{ x: 1 }] }) === null && parseFencePlan("x") === null);
const svg = fencePlanSvg(parsed!);
const lines = (svg.match(/<line [^>]*stroke="#0a0a0a" stroke-width="7"/g) ?? []).length;
check("the drawing has one fence line per traced segment, the gap not drawn (5 of 6 segments)", lines === 5, `${lines} lines`);
check("run lengths are labelled in feet, the gates named with their width, the house named", /104'/.test(svg) && /60'/.test(svg) && /Single gate 4'/.test(svg) && /Double gate 10'/.test(svg) && /HOUSE/.test(svg));
check("the title strip says the type, height, footage, runs and gates; the drawing says it is not a survey", /Cedar privacy · 6 ft tall · 364 ft of fence · 2 runs · 2 gates/.test(svg) && /NOT A SURVEY/.test(svg) && /12103 202ND ST SE/.test(svg));
check("north and a scale bar are on it", /<text y="30"[^>]*>N<\/text>/.test(svg) && / ft<\/text>/.test(svg));
check("the conversion schema takes the plan and refuses a broken one", fenceConvertSchema.safeParse({ title: "t", materials: [], labor: [], assumptions: [], plan }).success && !fenceConvertSchema.safeParse({ title: "t", materials: [], labor: [], assumptions: [], plan: { ...plan, points: [{ x: 0, y: 0 }] } }).success);

// ── the roof
const ring = [{ lat: 47.7700, lng: -122.2000 }, { lat: 47.7700, lng: -122.1998 }, { lat: 47.7702, lng: -122.1998 }, { lat: 47.7702, lng: -122.2000 }];
const instant = { lat: 47.7701, lng: -122.1999, structures: [{ outline: ring }, { outline: [] }], imagery: [{ token: "tok-wide", view: "ortho", masked: false, bbox: [-122.2004, 47.7697, -122.1994, 47.7705] as [number, number, number, number] }, { token: "tok-masked", view: "ortho", masked: true, bbox: [-122.2004, 47.7697, -122.1994, 47.7705] as [number, number, number, number] }] };
check("the rings are the structures' outlines with three or more points", roofRings(instant).length === 1);
const ortho = roofFrameFor(instant, { lat: 47.7701, lng: -122.1999 }, { ortho: true, satellite: true });
check("with EagleView on, the clear ortho is the frame (the masked one never is)", ortho?.kind === "ortho" && ortho.token === "tok-wide");
const sat = roofFrameFor(instant, { lat: 47.7701, lng: -122.1999 }, { ortho: false, satellite: true });
check("without EagleView, the satellite tile at the pin is the frame", sat?.kind === "satellite" && sat.lat === 47.7701 && sat.zoom === 20);
check("with neither key there is no aerial frame — the plan is the picture", roofFrameFor(instant, null, { ortho: false, satellite: false }) === null);
const c = frameProject({ lat: 47.7701, lng: -122.1999 }, sat!);
check("on the satellite frame the pin projects to the centre of the square", Math.abs(c.x - 500) < 0.01 && Math.abs(c.y - 500) < 0.01, `${c.x.toFixed(2)},${c.y.toFixed(2)}`);
const nw = frameProject({ lat: 47.7705, lng: -122.2004 }, ortho!);
const se = frameProject({ lat: 47.7697, lng: -122.1994 }, ortho!);
check("on the ortho frame the bbox corners are the square's corners", Math.abs(nw.x) < 0.01 && Math.abs(nw.y) < 0.01 && Math.abs(se.x - 1000) < 0.01 && Math.abs(se.y - 1000) < 0.01);
const ov = roofOverlayPoints(roofRings(instant), sat!);
// The static tile at zoom 20 is about 210 ft across at this latitude, so a
// 50 × 73 ft roof reads as roughly a quarter of the square, centred on the pin.
const ovPts = ov[0].split(" ").map((p) => p.split(",").map(Number));
const xs = ovPts.map((p) => p[0]), ys = ovPts.map((p) => p[1]);
check("the overlay is one points string per ring, centred on the pin and about a quarter of the tile wide", ov.length === 1 && Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 500) < 5 && Math.max(...xs) - Math.min(...xs) > 200 && Math.max(...xs) - Math.min(...xs) < 270 && Math.max(...ys) - Math.min(...ys) > 300 && Math.max(...ys) - Math.min(...ys) < 380, ov[0]);
const facts = roofFactsLine({ areaSqft: 2412, squares: 24.1, pitch: "6/12", facetCount: 8, measuredOn: "Sep 19, 2026" });
check("the facts line reads like a report", facts === "2,412 sq ft · 24.1 squares · 6/12 pitch · 8 facets · measured Sep 19, 2026", facts);
const planSvg = roofPlanSvg(roofRings(instant), facts);
check("the roof plan draws the outline with its edge lengths and the facts", /<polygon/.test(planSvg) && (planSvg.match(/\d+'<\/text>/g) ?? []).length === 4 && /2,412 SQ FT/.test(planSvg));
const frameSvg = roofFrameSvg(roofRings(instant), sat!, facts);
check("the stand-in for an aerial that cannot be fetched draws the outline where the overlay will land", /<polygon points="/.test(frameSvg) && frameSvg.includes(ov[0]));

console.log(bad ? `\n${bad} check(s) FAILED` : "\nall checks passed");
process.exit(bad ? 1 : 0);

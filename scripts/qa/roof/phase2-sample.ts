/**
 * Phase 2 breadth test — does the Instant path survive shapes other than the
 * three houses it was built on?
 *
 *   npx tsx scripts/qa/roof/phase2-sample.ts --fetch   pull OSM outlines once
 *   npx tsx scripts/qa/roof/phase2-sample.ts           run the sample (offline)
 *   npx tsx scripts/qa/roof/phase2-sample.ts --sens    threshold sensitivity
 *
 * Contours come from two places. OSM building footprints (Overpass, free, the
 * same mirror the fence feature uses) across six metros, cached to
 * sample/osm.json so every later run is offline; and a hand-drawn set covering
 * the shapes a US residential roof actually takes, including the ones expected
 * to be hard.
 *
 * The point is the FAILURE TABLE, not an average: which classes of contour the
 * phase-2 pipeline handles and which it does not.
 *
 * Caveat worth stating up front: an OSM footprint is traced by a mapper and is
 * usually simpler than the building — and it is the WALL line, not the eave.
 * It tests the pipeline's response to shape, not its response to tracing noise;
 * the Instant contours are the noisy ones.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { InstantRoofData, RoofModel, RoofPoint } from "../../../src/lib/eagleview";
import { buildIndexes, ringOf } from "../../../src/components/estimator/roof/roofGeometry";
import { validateRoofInvariants } from "../../../src/lib/roofDiagram/validate";
import { areaOf, isSimpleRing, signedArea, type FootprintPoint } from "../../../src/lib/roofRecon/footprint";
import { buildRoofV2, type ReconV2Tuning } from "../../../src/lib/roofRecon/reconV2";

const DIR = resolve("scripts/qa/roof/sample");
const OSM_FILE = resolve(DIR, "osm.json");
const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;

const args = process.argv.slice(2);
const FETCH = args.includes("--fetch");
const SENS = args.includes("--sens");

// ── the metros, chosen for different vintages and lot patterns ───────────────
const METROS = [
  { name: "seattle", lat: 47.674, lng: -122.1215 },
  { name: "phoenix", lat: 33.5722, lng: -112.074 },
  { name: "miami", lat: 25.73, lng: -80.28 },
  { name: "boston", lat: 42.35, lng: -71.14 },
  { name: "dallas", lat: 32.85, lng: -96.77 },
  { name: "chicago", lat: 41.95, lng: -87.76 },
];

interface Contour {
  id: string;
  klass: string;
  ring: FootprintPoint[];
}

// ── hand-drawn set: the shapes the sample must contain whether or not OSM
//    happens to hold them ──────────────────────────────────────────────────
const rect = (w: number, h: number): FootprintPoint[] => [
  { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
];
function drawn(): Contour[] {
  const out: Contour[] = [];
  const add = (id: string, klass: string, ring: FootprintPoint[]) => out.push({ id, klass, ring });

  add("rect-40x30", "rectangle", rect(40, 30));
  add("near-square-38x36", "near-square", rect(38, 36));
  add("elongated-4to1", "elongated 4:1", rect(80, 20));
  add("small-900", "small 900 sq ft", rect(36, 25));
  add("large-6000", "large 6000 sq ft", rect(100, 60));

  // L: 60×40 with a 25×18 bite out of the north-east
  add("L-shape", "L", [
    { x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 22 }, { x: 35, y: 22 }, { x: 35, y: 40 }, { x: 0, y: 40 },
  ]);
  // T: a 60×24 bar with a 20×22 stem south
  add("T-shape", "T", [
    { x: 0, y: 18 }, { x: 20, y: 18 }, { x: 20, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 18 },
    { x: 60, y: 18 }, { x: 60, y: 42 }, { x: 0, y: 42 },
  ]);
  // U: a 60×40 with a 20×24 court cut from the south
  add("U-shape", "U", [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 24 }, { x: 40, y: 24 }, { x: 40, y: 0 },
    { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 },
  ]);
  // Cross
  add("cross", "cross", [
    { x: 20, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 40 },
    { x: 40, y: 40 }, { x: 40, y: 60 }, { x: 20, y: 60 }, { x: 20, y: 40 }, { x: 0, y: 40 },
    { x: 0, y: 20 }, { x: 20, y: 20 },
  ]);
  // Bay window: a 10 ft bay 3 ft deep off a 50×30
  add("bay-window", "bay", [
    { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }, { x: 30, y: 30 },
    { x: 30, y: 33 }, { x: 20, y: 33 }, { x: 20, y: 30 }, { x: 0, y: 30 },
  ]);
  // 45° cut corner
  add("cut-corner-45", "45° cut corner", [
    { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 38, y: 32 }, { x: 0, y: 32 },
  ]);
  // Hexagonal bump (a turret-ish projection)
  add("hex-bump", "hex bump", [
    { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }, { x: 34, y: 30 },
    { x: 30, y: 37 }, { x: 22, y: 37 }, { x: 18, y: 30 }, { x: 0, y: 30 },
  ]);
  // Two wings of different widths — the classic blind valley
  add("blind-valley", "wings of unequal width", [
    { x: 0, y: 0 }, { x: 55, y: 0 }, { x: 55, y: 18 }, { x: 30, y: 18 }, { x: 30, y: 44 }, { x: 0, y: 44 },
  ]);
  // 135° corner, as Prairie has — the R12 case
  add("corner-135", "135° corner", [
    { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 24 }, { x: 32, y: 42 }, { x: 0, y: 42 },
  ]);
  // A deliberately awkward one: many small jogs, like a traced contour
  add("jogged", "many small jogs", [
    { x: 0, y: 0 }, { x: 18, y: 0 }, { x: 18, y: 3 }, { x: 30, y: 3 }, { x: 30, y: 0 },
    { x: 48, y: 0 }, { x: 48, y: 26 }, { x: 34, y: 26 }, { x: 34, y: 30 }, { x: 20, y: 30 },
    { x: 20, y: 26 }, { x: 0, y: 26 },
  ]);
  return out;
}

// ── OSM ──────────────────────────────────────────────────────────────────────
interface OsmCache {
  fetchedAt: string;
  metros: Array<{ name: string; buildings: Array<Array<{ lat: number; lng: number }>> }>;
}

async function fetchOsm(): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const metros: OsmCache["metros"] = [];
  for (const m of METROS) {
    const q =
      `[out:json][timeout:25];(` +
      `way["building"](around:600,${m.lat},${m.lng});` +
      `);out geom 900;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "JobFlex/3.0 (roof QA sample; contact: support@jobflex.app)",
      },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) {
      console.log(`${m.name}: Overpass ${res.status}`);
      metros.push({ name: m.name, buildings: [] });
      continue;
    }
    const data = (await res.json()) as {
      elements?: Array<{ type?: string; geometry?: Array<{ lat?: number; lon?: number }> }>;
    };
    const buildings: Array<Array<{ lat: number; lng: number }>> = [];
    for (const el of data.elements ?? []) {
      if (el.type !== "way" || !Array.isArray(el.geometry)) continue;
      const pts = el.geometry
        .filter((g) => typeof g?.lat === "number" && typeof g?.lon === "number")
        .map((g) => ({ lat: g.lat as number, lng: g.lon as number }));
      if (pts.length >= 4) buildings.push(pts);
    }
    console.log(`${m.name}: ${buildings.length} building ways`);
    metros.push({ name: m.name, buildings });
    await new Promise((r) => setTimeout(r, 1200)); // be polite to the mirror
  }
  writeFileSync(OSM_FILE, JSON.stringify({ fetchedAt: new Date().toISOString(), metros }, null, 1));
  console.log(`\ncached → ${OSM_FILE}`);
}

/** OSM rings → local feet, filtered to plausible detached houses, spread over
 *  the vertex counts so the sample is not all rectangles. */
function osmContours(perMetro: number): Contour[] {
  if (!existsSync(OSM_FILE)) return [];
  const cache = JSON.parse(readFileSync(OSM_FILE, "utf8")) as OsmCache;
  const out: Contour[] = [];
  for (const m of cache.metros) {
    const cands: Array<{ ring: FootprintPoint[]; verts: number; area: number }> = [];
    for (const b of m.buildings) {
      const o = b[0];
      let ring = b.map((p) => ({
        x: (p.lng - o.lng) * D2R * Math.cos(o.lat * D2R) * EARTH_R_M * FT_PER_M,
        y: (p.lat - o.lat) * D2R * EARTH_R_M * FT_PER_M,
      }));
      // OSM closes its ways; the pipeline wants an open ring.
      while (ring.length > 1 && Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 0.05) ring.pop();
      if (ring.length < 4) continue;
      if (signedArea(ring) < 0) ring = ring.reverse();
      const area = areaOf(ring);
      if (area < 700 || area > 8000) continue;
      if (!isSimpleRing(ring)) continue;
      cands.push({ ring, verts: ring.length, area });
    }
    // Spread across vertex counts: the simplest, the most complex, and a middle.
    cands.sort((a, b) => a.verts - b.verts);
    const picks = new Set<number>();
    if (cands.length) {
      picks.add(0);
      picks.add(cands.length - 1);
      for (let k = 1; k < perMetro - 1; k++) picks.add(Math.floor((cands.length * k) / (perMetro - 1)) % cands.length);
    }
    for (const i of [...picks].slice(0, perMetro)) {
      const c = cands[i];
      out.push({ id: `${m.name}-${c.verts}v-${Math.round(c.area)}sf`, klass: `osm ${m.name}`, ring: c.ring });
    }
  }
  return out;
}

// ── run one contour through phase 2 ──────────────────────────────────────────
/** Wrap a bare ring as an Instant response so the REAL buildRoofV2 runs. */
function asInstant(ring: FootprintPoint[], pitch: number, facetCount: number | null): { instant: InstantRoofData; origin: { lat: number; lng: number } } {
  const origin = { lat: 40, lng: -95 };
  const outline = ring.map((p) => ({
    lat: origin.lat + p.y / FT_PER_M / EARTH_R_M / D2R,
    lng: origin.lng + p.x / FT_PER_M / (EARTH_R_M * Math.cos(origin.lat * D2R)) / D2R,
  }));
  const sf = Math.sqrt(1 + (pitch / 12) ** 2);
  const area = areaOf(ring) * sf;
  return {
    origin,
    instant: {
      requestId: "synthetic",
      address: null,
      lat: origin.lat,
      lng: origin.lng,
      structures: [
        {
          areaSqft: area, squares: area / 100, pitch: `${pitch}/12`, eaveHeightFt: null,
          footprintSqft: areaOf(ring), outline, facetCount, shape: null, material: "shingle",
          conditionRating: null, roofAgeYears: null, chimney: null, solarPanels: null, rooftopAcCount: null,
        },
      ],
      imagery: [],
      totals: {
        areaSqft: area, squares: area / 100, predominantPitch: pitch, pitchLabel: `${pitch}/12`,
        maxEaveFt: null, facetCount, footprintSqft: areaOf(ring),
      },
    } as InstantRoofData,
  };
}

function toValidatorSchema(model: RoofModel, footprint: FootprintPoint[]): unknown {
  const idx = buildIndexes(model);
  const verts: number[][] = [];
  const seen = new Map<string, number>();
  const vid = (p: RoofPoint): number => {
    const k = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    if (!seen.has(k)) { seen.set(k, verts.length); verts.push([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]); }
    return seen.get(k) as number;
  };
  const facets: Array<{ id: string; pitch: number; v: number[] }> = [];
  for (const f of model.faces) {
    const ring = ringOf(f.lineIds, idx);
    if (!ring || ring.length < 3) continue;
    facets.push({ id: String(f.designator || f.id), pitch: Number(f.pitch) || 0, v: ring.map(vid) });
  }
  return { material: "asphalt", footprint: footprint.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]), vertices: verts, facets };
}

function runMjs(schema: unknown): { errors: number; warnings: number; codes: string[] } {
  const tmp = resolve(DIR, "_tmp-validator.json");
  writeFileSync(tmp, JSON.stringify(schema));
  let text = "";
  try {
    text = execFileSync(process.execPath, [resolve("scripts/qa/roof/validate-roof.mjs"), tmp], { encoding: "utf8" });
  } catch (e) {
    text = String((e as { stdout?: string }).stdout ?? "");
  }
  const m = text.match(/(\d+)\s+ошибок,\s*(\d+)\s+предупреждений/);
  const codes = [...new Set([...text.matchAll(/FAIL\s+\[(R\d+)[^\]]*\]/g)].map((x) => x[1]))];
  return { errors: m ? Number(m[1]) : -1, warnings: m ? Number(m[2]) : -1, codes };
}

interface Outcome {
  id: string;
  klass: string;
  rawVerts: number;
  areaSqft: number;
  regVerts: number;
  familyPct: number;
  skeleton: boolean;
  facets: number;
  euler: number | null;
  tilingPct: number | null;
  errors: number;
  warnings: number;
  codes: string[];
  smallestFacet: number | null;
  fail: string;
  /** Verdict under the phase-2 criteria (geometry only). */
  gateFail: string;
}

function euler(model: RoofModel): number {
  const key = (p: { x: number; y: number }) => `${Math.round(p.x / 0.05)}|${Math.round(p.y / 0.05)}`;
  const pts = new Map(model.points.map((p) => [p.id, p]));
  const V = new Set<string>();
  const E = new Set<string>();
  for (const l of model.lines) {
    const a = pts.get(l.aId); const b = pts.get(l.bId);
    if (!a || !b) continue;
    V.add(key(a)); V.add(key(b));
    E.add([key(a), key(b)].sort().join("#"));
  }
  return V.size - E.size + model.faces.length;
}

function runOne(c: Contour, pitch: number, tuning?: ReconV2Tuning): Outcome {
  const { instant, origin } = asInstant(c.ring, pitch, null);
  const { model, report } = buildRoofV2({ instant, origin, clusters: null, ...(tuning ? { tuning } : {}) });
  const s = report.structures[0];
  const base: Outcome = {
    id: c.id, klass: c.klass, rawVerts: c.ring.length, areaSqft: areaOf(c.ring),
    regVerts: s?.contourEdges ?? 0, familyPct: (s?.regularize.familyShare ?? 0) * 100,
    skeleton: !!model, facets: model?.faces.length ?? 0, euler: null, tilingPct: null,
    errors: -1, warnings: -1, codes: [], smallestFacet: null, fail: "", gateFail: "",
  };
  if (!model || !s?.ring) {
    base.fail = !s?.ring ? "contour rejected" : report.reasons[0] ?? "skeleton null";
    if (s && s.contourEdges > 64) base.fail = `${s.contourEdges} vertices > 64 cap`;
    base.gateFail = base.fail;
    return base;
  }
  const idx = buildIndexes(model);
  const plans = model.faces.map((f) => {
    const r = ringOf(f.lineIds, idx);
    return r && r.length >= 3 ? areaOf(r.map((p) => ({ x: p.x, y: p.y }))) : 0;
  });
  const contourArea = areaOf(s.ring);
  base.euler = euler(model);
  base.tilingPct = ((plans.reduce((a, b) => a + b, 0) - contourArea) / contourArea) * 100;
  base.smallestFacet = Math.min(...plans);
  const mjs = runMjs(toValidatorSchema(model, s.ring));
  const port = validateRoofInvariants(model, { footprint: s.ring.map((p) => [p.x, p.y] as [number, number]) });
  base.errors = mjs.errors;
  base.warnings = mjs.warnings;
  base.codes = mjs.codes;
  const problems: string[] = [];
  if (base.euler !== 1) problems.push(`Euler ${base.euler}`);
  if (Math.abs(base.tilingPct) >= 0.5) problems.push(`tiling ${base.tilingPct.toFixed(2)}%`);
  if (base.smallestFacet < 20) problems.push(`facet ${base.smallestFacet.toFixed(1)} sq ft`);
  if (mjs.errors !== port.errors || mjs.warnings !== port.warnings) problems.push("validators diverged");
  if (mjs.codes.length) problems.push(mjs.codes.join("+"));
  base.fail = problems.join(", ");
  // Verdict under the PHASE 2 criteria, which judge the model's own geometry:
  // Euler, tiling, R07, R12 on square corners only, no degenerate facet.
  // Everything else in `problems` is diagnostic — R11 and the 20 sq ft floor
  // are known invariant-wording defects, and facetCount is a detector.
  const rectilinear = s.ring!.every((p, i) => {
    const a = s.ring![(i - 1 + s.ring!.length) % s.ring!.length];
    const c = s.ring![(i + 1) % s.ring!.length];
    let turn = ((Math.atan2(c.y - p.y, c.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x)) * 180) / Math.PI;
    while (turn > 180) turn -= 360;
    while (turn < -180) turn += 360;
    return Math.abs(Math.abs(turn) - 90) < 2;
  });
  const r07 = port.results.filter((f) => f.id === "R07" && f.level === "error").length;
  const r12 = port.results.filter((f) => f.id === "R12" && f.level === "error").length;
  const r01 = port.results.filter((f) => (f.id === "R01" || f.id === "R02") && f.level === "error").length;
  const gate: string[] = [];
  if (base.euler !== 1) gate.push(`Euler ${base.euler}`);
  if (Math.abs(base.tilingPct) >= 0.5) gate.push(`tiling ${base.tilingPct.toFixed(2)}%`);
  if (r07) gate.push("R07");
  if (rectilinear && r12) gate.push("R12");
  if (r01) gate.push("R01/R02");
  if (mjs.errors !== port.errors || mjs.warnings !== port.warnings) gate.push("diverged");
  base.gateFail = gate.join(", ");
  return base;
}

function table(rows: Outcome[]): void {
  console.log(
    "\n  id                        class                    area   raw→reg  fam%   skel  facets  Euler  tiling%  err/warn  problems",
  );
  for (const r of rows) {
    console.log(
      "  " + r.id.padEnd(25) + " " + r.klass.slice(0, 23).padEnd(24) +
        String(Math.round(r.areaSqft)).padStart(5) + "  " +
        `${String(r.rawVerts).padStart(2)}→${String(r.regVerts).padEnd(2)}` + "  " +
        r.familyPct.toFixed(0).padStart(4) + "  " +
        (r.skeleton ? " ok " : "NULL").padStart(5) + "  " +
        String(r.facets).padStart(6) + "  " +
        String(r.euler ?? "-").padStart(5) + "  " +
        (r.tilingPct == null ? "-" : r.tilingPct.toFixed(2)).padStart(7) + "  " +
        `${r.errors}/${r.warnings}`.padStart(8) + "  " +
        (r.fail || "clean"),
    );
  }
  const clean = rows.filter((r) => r.skeleton && !r.fail).length;
  const passed = rows.filter((r) => r.skeleton && !r.gateFail).length;
  console.log(`\n  CLEAN (nothing reported at all)  ${clean}/${rows.length}`);
  console.log(`  PASSES THE PHASE 2 CRITERIA     ${passed}/${rows.length}`);
  const gateFails = rows.filter((r) => r.gateFail);
  if (gateFails.length) {
    console.log("\n  ---- fails the phase-2 criteria ----");
    for (const r of gateFails) console.log(`  ${r.id.padEnd(26)} ${r.gateFail}`);
  }
}

function main(): void {
  if (FETCH) {
    void fetchOsm();
    return;
  }
  mkdirSync(DIR, { recursive: true });
  const contours = [...drawn(), ...osmContours(3)];
  console.log(`sample: ${contours.length} contours (${drawn().length} drawn, ${osmContours(3).length} from OSM)`);

  if (!SENS) {
    const rows = contours.map((c) => runOne(c, c.id === "large-6000" ? 4 : 6));
    table(rows);
    // failure classes
    const byProblem = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.fail) continue;
      for (const p of r.fail.split(", ")) {
        const k = p.replace(/-?\d+(\.\d+)?/g, "N");
        byProblem.set(k, [...(byProblem.get(k) ?? []), r.id]);
      }
    }
    console.log("\n  ---- failure classes ----");
    for (const [k, ids] of [...byProblem.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${String(ids.length).padStart(2)}×  ${k.padEnd(24)} ${ids.slice(0, 8).join(", ")}${ids.length > 8 ? " …" : ""}`);
    }
    return;
  }

  // ── sensitivity ────────────────────────────────────────────────────────────
  const base: ReconV2Tuning = { simplifyFt: 1.5, maxCornerShiftFt: 3, minFamilyShare: 0.85, maxVertices: 14 };
  const score = (t: ReconV2Tuning) => {
    const rows = contours.map((c) => runOne(c, c.id === "large-6000" ? 4 : 6, t));
    return {
      clean: rows.filter((r) => r.skeleton && !r.fail).length,
      built: rows.filter((r) => r.skeleton).length,
      n: rows.length,
      rows,
    };
  };
  const b = score(base);
  console.log(`\nbaseline: built ${b.built}/${b.n}, clean ${b.clean}/${b.n}`);
  console.log("\n  knob                 value    built   clean");
  for (const [key, values] of [
    ["simplifyFt", [0.75, 1.5, 2.25]],
    ["maxCornerShiftFt", [1.5, 3, 4.5]],
    ["minFamilyShare", [0.425, 0.85, 1.0]],
    ["maxVertices", [7, 14, 21]],
  ] as Array<[keyof ReconV2Tuning, number[]]>) {
    for (const v of values) {
      const t = { ...base, [key]: v };
      const s = score(t);
      const mark = v === base[key] ? "  (base)" : "";
      console.log(`  ${String(key).padEnd(20)} ${String(v).padStart(6)}   ${String(s.built).padStart(5)}   ${String(s.clean).padStart(5)}${mark}`);
    }
  }

  // size dependence: is 3 ft the same thing on a 900 and a 6000 sq ft house?
  console.log("\n  ---- size dependence of the 3 ft effect-test threshold ----");
  console.log("  bucket            n   built  clean   median reg verts   median fam%");
  const buckets: Array<[string, (a: number) => boolean]> = [
    ["< 1500 sq ft", (a) => a < 1500],
    ["1500–3000", (a) => a >= 1500 && a < 3000],
    ["3000–5000", (a) => a >= 3000 && a < 5000],
    ["≥ 5000", (a) => a >= 5000],
  ];
  for (const [name, test] of buckets) {
    const rows = b.rows.filter((r) => test(r.areaSqft));
    if (!rows.length) continue;
    const med = (xs: number[]) => (xs.length ? [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)] : 0);
    console.log(
      `  ${name.padEnd(16)} ${String(rows.length).padStart(2)}  ${String(rows.filter((r) => r.skeleton).length).padStart(5)}  ${String(rows.filter((r) => r.skeleton && !r.fail).length).padStart(5)}   ${med(rows.map((r) => r.regVerts)).toFixed(0).padStart(15)}   ${med(rows.map((r) => r.familyPct)).toFixed(0).padStart(11)}`,
    );
  }

  // relative vs absolute: scale the shift threshold with sqrt(area)
  console.log("\n  ---- absolute 3 ft vs relative √area/13 ----");
  for (const mode of ["absolute", "relative"] as const) {
    let built = 0;
    let clean = 0;
    for (const c of contours) {
      const shift = mode === "absolute" ? 3 : Math.sqrt(areaOf(c.ring)) / 13;
      const r = runOne(c, c.id === "large-6000" ? 4 : 6, { ...base, maxCornerShiftFt: shift });
      if (r.skeleton) built++;
      if (r.skeleton && !r.fail) clean++;
    }
    console.log(`  ${mode.padEnd(10)} built ${built}/${contours.length}, clean ${clean}/${contours.length}`);
  }
}

main();

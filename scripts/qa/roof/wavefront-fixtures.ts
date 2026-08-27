/**
 * Weighted-wavefront reference fixtures — the engine must earn these BEFORE
 * it sees a live house.
 *
 *   npx tsx scripts/qa/roof/wavefront-fixtures.ts
 *
 * 1. UNIFORM EQUIVALENCE: with equal slopes on every edge the weighted
 *    wavefront must reproduce skeleton.ts facet for facet on the whole
 *    33-contour sample (drawn + OSM) — including every jogged-parallel-eave
 *    contour that killed the plane-minimum approaches. Exit 1 on any
 *    divergence.
 * 2. GABLE RECTANGLE 40×24, west end vertical: hand-computed layout —
 *    3 facets (S 408, N 408, E 144 sq ft plan), ridge (28,12)→(0,12),
 *    apex ON the west wall.
 * 3. PENT WING ON AN L: main mass + 12 ft wing whose end edge is vertical;
 *    the wing must carry a ridge to a gable apex at its end, and the whole
 *    roof must tile exactly.
 */
import { straightSkeleton, type SkelPt } from "../../../src/lib/roofDiagram/skeleton";
import { weightedSkeleton } from "../../../src/lib/roofRecon/weightedWavefront";
import { areaOf, regularizeRing } from "../../../src/lib/roofRecon/footprint";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const facetAreas = (facets: Array<{ edgeIndex: number; ring: SkelPt[] }>): Map<number, number> =>
  new Map(facets.map((f) => [f.edgeIndex, Math.abs(areaOf(f.ring))]));

// ── 1. uniform equivalence on the 33-sample ─────────────────────────────────
{
  const contours: Array<{ id: string; ring: SkelPt[] }> = [];
  // the drawn set, verbatim from phase2-sample.ts
  const add = (id: string, ring: SkelPt[]) => contours.push({ id, ring });
  add("rect", [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 24 }, { x: 0, y: 24 }]);
  add("L-shape", [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 28, y: 20 }, { x: 28, y: 34 }, { x: 0, y: 34 }]);
  add("jog-parallel", [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -4 }, { x: 44, y: -4 }, { x: 44, y: 24 }, { x: 0, y: 24 }]);
  add("T-shape", [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 18 }, { x: 40, y: 18 }, { x: 40, y: 32 }, { x: 20, y: 32 }, { x: 20, y: 18 }, { x: 0, y: 18 }]);
  add("hex-bump", [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }, { x: 34, y: 30 }, { x: 30, y: 37 }, { x: 22, y: 37 }, { x: 18, y: 30 }, { x: 0, y: 30 }]);
  // OSM contours, same conversion as phase2-sample
  const OSM = resolve("scripts/qa/roof/sample/osm.json");
  if (existsSync(OSM)) {
    const FT_PER_M = 3.28084, EARTH_R_M = 6378137, D2R = Math.PI / 180;
    const cache = JSON.parse(readFileSync(OSM, "utf8")) as { metros: Array<{ name: string; buildings: Array<Array<{ lat: number; lng: number }>> }> };
    for (const m of cache.metros) {
      let per = 0;
      for (const b of m.buildings) {
        if (per >= 3) break;
        const o = b[0];
        let ring = b.map((p) => ({
          x: (p.lng - o.lng) * D2R * Math.cos(o.lat * D2R) * EARTH_R_M * FT_PER_M,
          y: (p.lat - o.lat) * D2R * EARTH_R_M * FT_PER_M,
        }));
        while (ring.length > 1 && Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 0.05) ring.pop();
        if (ring.length < 4 || ring.length > 40) continue;
        if (areaOf(ring) < 0) ring = ring.reverse();
        const area = Math.abs(areaOf(ring));
        if (area < 700 || area > 8000) continue;
        // both engines get the same REGULARISED ring, like the pipeline does
        const reg = regularizeRing(ring, {});
        if (!reg.report.simple || reg.ring.length < 4) continue;
        contours.push({ id: `${m.name}-${reg.ring.length}v`, ring: reg.ring });
        per++;
      }
    }
  }

  let agree = 0, differ = 0, bothNull = 0, onlyOld = 0, onlyNew = 0;
  for (const c of contours) {
    const oldR = straightSkeleton(c.ring, { degenerateRetry: true });
    const newR = weightedSkeleton(c.ring, c.ring.map(() => 0.5), { degenerateRetry: true });
    if (!oldR && !newR) { bothNull++; continue; }
    if (oldR && !newR) { onlyOld++; console.log(`       uniform: ${c.id} — weighted returned null where skeleton succeeded`); continue; }
    if (!oldR && newR) { onlyNew++; continue; }
    const a = facetAreas(oldR!.facets);
    const b = facetAreas(newR!.facets);
    let maxD = 0;
    for (const [k, v] of a) maxD = Math.max(maxD, Math.abs(v - (b.get(k) ?? 0)));
    // Jitter slack: degenerate (exactly rectilinear) contours engage the same
    // deterministic perturbation in BOTH engines, but they may settle on
    // different attempts; 0.004 ft of jitter along a 20 ft edge is ~0.08 sq ft
    // of facet area. 0.1 sq ft is two orders under the smallest legal facet.
    if (maxD < 0.1 && a.size === b.size) agree++;
    else { differ++; console.log(`       uniform: ${c.id} — max facet area diff ${maxD.toFixed(3)} sq ft (facets ${a.size} vs ${b.size})`); }
  }
  check(
    `uniform equivalence on ${contours.length} contours`,
    differ === 0 && onlyOld === 0,
    `agree ${agree}, differ ${differ}, both-null ${bothNull}, only-old ${onlyOld}, only-new ${onlyNew}`,
  );
}

// ── 2. gable rectangle, hand-computed ───────────────────────────────────────
{
  const ring: SkelPt[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 24 }, { x: 0, y: 24 }];
  // edges: 0 S, 1 E, 2 N, 3 W(vertical)
  const res = weightedSkeleton(ring, [0.5, 0.5, 0.5, Number.POSITIVE_INFINITY], { degenerateRetry: true });
  check("gable rect: engine returns a result", !!res);
  if (res) {
    const areas = facetAreas(res.facets);
    check("gable rect: 3 facets (W emits none)", res.facets.length === 3 && res.gableEdges.length === 1 && res.gableEdges[0] === 3, `${res.facets.length} facets`);
    check("gable rect: S facet 408 sq ft", Math.abs((areas.get(0) ?? 0) - 408) < 0.01, `${(areas.get(0) ?? 0).toFixed(2)}`);
    check("gable rect: N facet 408 sq ft", Math.abs((areas.get(2) ?? 0) - 408) < 0.01, `${(areas.get(2) ?? 0).toFixed(2)}`);
    check("gable rect: E facet 144 sq ft", Math.abs((areas.get(1) ?? 0) - 144) < 0.01, `${(areas.get(1) ?? 0).toFixed(2)}`);
    const ridge = res.ridges.find(
      (r) =>
        Math.min(r.a.x, r.b.x) < 0.01 && Math.abs(Math.max(r.a.x, r.b.x) - 28) < 0.01 &&
        Math.abs(r.a.y - 12) < 0.01 && Math.abs(r.b.y - 12) < 0.01,
    );
    check("gable rect: ridge (0,12)→(28,12) reaches the west wall", !!ridge);
    const hips = res.ridges.filter((r) => Math.abs(r.a.y - r.b.y) > 0.01);
    check("gable rect: two hips at the east end", hips.length === 2, `${hips.length}`);
  }
}

// ── 3. pent wing on an L ────────────────────────────────────────────────────
{
  // main mass 40×24 + north wing x∈[28,40], y∈[24,36]; wing end (top) vertical
  const ring: SkelPt[] = [
    { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 36 }, { x: 28, y: 36 }, { x: 28, y: 24 }, { x: 0, y: 24 },
  ];
  // edges: 0 S, 1 E(full, incl. wing), 2 N-wing-end(vertical), 3 W-wing, 4 N-main, 5 W
  const slopes = [0.5, 0.5, Number.POSITIVE_INFINITY, 0.5, 0.5, 0.5];
  const res = weightedSkeleton(ring, slopes, { degenerateRetry: true });
  check("pent-L: engine returns a result", !!res);
  if (res) {
    const total = res.facets.reduce((s, f) => s + Math.abs(areaOf(f.ring)), 0);
    check("pent-L: facets tile the outline", Math.abs(total - Math.abs(areaOf(ring))) < 0.01 * Math.abs(areaOf(ring)), `${total.toFixed(1)} vs ${Math.abs(areaOf(ring)).toFixed(1)}`);
    check("pent-L: wing end emits no facet", res.gableEdges.length === 1 && res.gableEdges[0] === 2);
    // the wing's ridge must reach the vertical end: apex at (34, 36)
    const apex = res.ridges.some(
      (r) =>
        (Math.abs(r.a.x - 34) < 0.01 && Math.abs(r.a.y - 36) < 0.01) ||
        (Math.abs(r.b.x - 34) < 0.01 && Math.abs(r.b.y - 36) < 0.01),
    );
    check("pent-L: a ridge reaches the gable apex (34,36)", apex);
  }
}

console.log(failures === 0 ? "\nWAVEFRONT FIXTURES: all green" : `\nWAVEFRONT FIXTURES: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

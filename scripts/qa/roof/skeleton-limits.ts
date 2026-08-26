/**
 * Where does the straight skeleton ACTUALLY break?
 *
 *   npx tsx scripts/qa/roof/skeleton-limits.ts
 *
 * `MAX_VERTICES = 14` (synthesize.ts) and `n > 32` (skeleton.ts) are both
 * asserted, never measured: the spec says "inputs are 4–14-gons" as a given and
 * the skeleton's header claims "n ≤ 14 keeps every loop small" without a
 * number behind it. This measures the real limit on contours of rising
 * complexity — synthetic combs (every corner square, which is the WORST case
 * for the wavefront because it makes events exactly simultaneous) and real OSM
 * footprints — and reports time, degeneracy, tiling error and the smallest
 * facet, so the cap can be set from evidence.
 *
 * The uncapped column runs a copy of the skeleton with the n > 32 guard lifted;
 * shipping code is not modified.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { straightSkeleton } from "../../../src/lib/roofDiagram/skeleton";
import { straightSkeleton as skeletonUncapped } from "./_skeleton-uncapped";
import { areaOf, isSimpleRing, regularizeRing, signedArea, type FootprintPoint } from "../../../src/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;

/**
 * A rectangle with `teeth` square teeth along its top edge: 4 + 4·teeth
 * vertices, every corner exactly 90°, every tooth identical. Identical teeth
 * are the point — they make wavefront events collide exactly, which is the
 * case that broke the exact computation on Kirkland.
 */
function comb(teeth: number, w = 12, d = 10): FootprintPoint[] {
  const ring: FootprintPoint[] = [{ x: 0, y: 0 }];
  const width = teeth * 2 * w;
  ring.push({ x: width, y: 0 }, { x: width, y: 30 });
  for (let i = teeth - 1; i >= 0; i--) {
    const x1 = i * 2 * w + w;
    const x0 = i * 2 * w;
    ring.push({ x: x1 + w, y: 30 }, { x: x1 + w, y: 30 + d }, { x: x1, y: 30 + d }, { x: x1, y: 30 });
    if (i === 0) ring.push({ x: x0, y: 30 });
  }
  ring.push({ x: 0, y: 30 });
  // dedupe consecutive duplicates the loop above can leave at the seams
  const out: FootprintPoint[] = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(q.x - p.x, q.y - p.y) > 1e-6) out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 1e-6) out.pop();
  return signedArea(out) < 0 ? out.reverse() : out;
}

/** Real OSM footprints, regularised, bucketed by resulting vertex count. */
function osmByVertexCount(): Map<number, FootprintPoint[]> {
  const file = resolve("scripts/qa/roof/sample/osm.json");
  const by = new Map<number, FootprintPoint[]>();
  let cache: { metros: Array<{ buildings: Array<Array<{ lat: number; lng: number }>> }> };
  try {
    cache = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return by;
  }
  for (const m of cache.metros) {
    for (const b of m.buildings) {
      const o = b[0];
      let ring = b.map((p) => ({
        x: (p.lng - o.lng) * D2R * Math.cos(o.lat * D2R) * EARTH_R_M * FT_PER_M,
        y: (p.lat - o.lat) * D2R * EARTH_R_M * FT_PER_M,
      }));
      while (ring.length > 1 && Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 0.05) ring.pop();
      if (ring.length < 4) continue;
      if (signedArea(ring) < 0) ring = ring.reverse();
      if (areaOf(ring) < 400) continue;
      if (!isSimpleRing(ring)) continue;
      // Regularised with a cap far above anything, so the count is the
      // contour's own complexity rather than a clamp.
      const reg = regularizeRing(ring, { maxVertices: 512, minFamilyShare: 0 });
      if (!reg.report.simple) continue;
      const n = reg.ring.length;
      if (!by.has(n)) by.set(n, reg.ring);
    }
  }
  return by;
}

interface Row {
  label: string;
  n: number;
  areaSqft: number;
  capped: "ok" | "null";
  exact: "ok" | "null";
  retried: boolean;
  facets: number;
  tilingPct: number | null;
  smallest: number | null;
  ms: number;
}

function measure(label: string, ring: FootprintPoint[]): Row {
  const pts = ring.map((p) => ({ x: p.x, y: p.y }));
  const area = areaOf(ring);
  const capped = straightSkeleton(pts, { degenerateRetry: true }) ? "ok" : "null";
  const exactOnly = skeletonUncapped(pts, { degenerateRetry: false });
  // Time the uncapped, retry-enabled run — the work the pipeline would do.
  const runs: number[] = [];
  let res = null as ReturnType<typeof skeletonUncapped>;
  for (let i = 0; i < 5; i++) {
    const t0 = process.hrtime.bigint();
    res = skeletonUncapped(pts, { degenerateRetry: true });
    runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  runs.sort((a, b) => a - b);
  const ms = runs[Math.floor(runs.length / 2)];
  const facets = res?.facets.length ?? 0;
  const plans = res?.facets.map((f) => areaOf(f.ring)) ?? [];
  return {
    label,
    n: ring.length,
    areaSqft: area,
    capped,
    exact: res ? "ok" : "null",
    retried: !!res && !exactOnly,
    facets,
    tilingPct: res ? ((plans.reduce((a, b) => a + b, 0) - area) / area) * 100 : null,
    smallest: res && plans.length ? Math.min(...plans) : null,
    ms,
  };
}

function table(rows: Row[]): void {
  console.log(
    "\n  contour                    n    area   shipped  uncapped  jitter  facets   tiling%   smallest   median ms",
  );
  for (const r of rows) {
    console.log(
      "  " + r.label.padEnd(26) +
        String(r.n).padStart(3) + " " + String(Math.round(r.areaSqft)).padStart(7) + "   " +
        r.capped.padStart(7) + "  " + r.exact.padStart(8) + "  " +
        (r.retried ? "yes" : " no").padStart(6) + "  " +
        String(r.facets).padStart(6) + "  " +
        (r.tilingPct == null ? "-" : r.tilingPct.toFixed(4)).padStart(8) + "  " +
        (r.smallest == null ? "-" : r.smallest.toFixed(1)).padStart(9) + "  " +
        r.ms.toFixed(2).padStart(10),
    );
  }
}

function main(): void {
  console.log("SYNTHETIC COMBS — every corner exactly square, teeth identical (worst case for event ties)");
  const combRows: Row[] = [];
  for (const teeth of [1, 2, 3, 4, 5, 7, 9, 11, 15, 23, 31]) {
    const ring = comb(teeth);
    if (!isSimpleRing(ring)) {
      console.log(`  comb ${teeth} teeth: not simple, skipped`);
      continue;
    }
    combRows.push(measure(`comb ${teeth} teeth`, ring));
  }
  table(combRows);

  console.log("\n\nREAL OSM FOOTPRINTS, regularised, one per vertex count");
  const osm = osmByVertexCount();
  const counts = [...osm.keys()].sort((a, b) => a - b);
  const picks = counts.filter((n) => n >= 8);
  const osmRows: Row[] = [];
  for (const n of picks) {
    if (osmRows.length >= 14) break;
    if (osmRows.length && n - osmRows[osmRows.length - 1].n < 2) continue;
    osmRows.push(measure(`osm ${n}v`, osm.get(n) as FootprintPoint[]));
  }
  table(osmRows);

  console.log("\n\nWHERE IT ACTUALLY BREAKS");
  const all = [...combRows, ...osmRows];
  const failed = all.filter((r) => r.exact === "null");
  const bad = all.filter((r) => r.exact === "ok" && Math.abs(r.tilingPct ?? 0) > 0.5);
  const shippedBlocked = all.filter((r) => r.capped === "null" && r.exact === "ok");
  console.log(`  contours measured:                 ${all.length}`);
  console.log(`  skeleton returned null (uncapped): ${failed.length}${failed.length ? " — " + failed.map((r) => `${r.label} (${r.n}v)`).join(", ") : ""}`);
  console.log(`  tiling worse than 0.5%:            ${bad.length}${bad.length ? " — " + bad.map((r) => `${r.label} ${r.tilingPct?.toFixed(3)}%`).join(", ") : ""}`);
  console.log(`  blocked ONLY by the shipped caps:  ${shippedBlocked.length} (${shippedBlocked.map((r) => `${r.n}v`).join(", ")})`);
  const slowest = all.slice().sort((a, b) => b.ms - a.ms)[0];
  console.log(`  slowest:                           ${slowest.label} at ${slowest.n} v — ${slowest.ms.toFixed(2)} ms`);
  const worstTiling = all.filter((r) => r.tilingPct != null).sort((a, b) => Math.abs(b.tilingPct as number) - Math.abs(a.tilingPct as number))[0];
  console.log(`  worst tiling:                      ${worstTiling.label} — ${worstTiling.tilingPct?.toFixed(4)}%`);

  // memory: heap delta over a batch of the largest contour
  const big = all.slice().sort((a, b) => b.n - a.n)[0];
  const ring = big.label.startsWith("comb") ? comb(Number(big.label.split(" ")[1])) : (osm.get(big.n) as FootprintPoint[]);
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 200; i++) skeletonUncapped(ring.map((p) => ({ x: p.x, y: p.y })), { degenerateRetry: true });
  const after = process.memoryUsage().heapUsed;
  console.log(`  heap after 200 runs at ${big.n} v:       ${((after - before) / 1024 / 1024).toFixed(1)} MB delta (not a leak test, an order-of-magnitude check)`);
}

main();

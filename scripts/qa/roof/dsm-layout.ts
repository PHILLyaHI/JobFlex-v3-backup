/* Step 1 of "layout from measurement": what the DSM lays out INSIDE the
 * Instant contour — measurement only, nothing rebuilt.
 *
 *   npx tsx scripts/qa/roof/dsm-layout.ts           six addresses
 *   npx tsx scripts/qa/roof/dsm-layout.ts 12629     one
 *
 * What ablation run 2 did inside Google's mask, repeated inside the
 * REGULARISED, REGISTERED Instant contour:
 *   - DSM clusters as facets;
 *   - lines = intersections of adjacent clusters' fitted planes, typed by the
 *     SAME rule the lidar creases use (concave → VALLEY; convex → RIDGE when
 *     the line runs level within 0.5/12, else HIP);
 *   - gable ends from geometry at the contour: an edge whose dominant inside
 *     cluster drains ALONG it is a rake pair, across it an eave;
 *   - the share of contour area held by measured clusters vs left for fill;
 *   - clusters lying OUTSIDE the contour — the crown junk run 2's pink loop
 *     caught — counted and excluded, in their own column.
 *
 * Overlays per address: the DSM layout beside the current product output, same
 * ortho, same scale. Owner's traces for 12629/419 exist only as words — the
 * comparison there is by eye against the photo.
 */
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import { fetchPropertyImage } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { reconstructRoof } from "@/lib/roofRecon";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { Overlay } from "./overlay";
import { loadFixture, type FixtureMeta } from "./fixture";

const FT_PER_M = 3.28084;
/** Same figure the lidar creases use for "the line runs level" (creases.ts). */
const LEVEL_PITCH12 = 0.5;
/** Same probe the crease classifier uses for convex/concave. */
const PROBE_FT = 6;
/** An edge drains ALONG itself (rake) or ACROSS itself (eave) within this. */
const EDGE_TOL_DEG = 45;
const OUT = resolve(".cache/dsm-layout");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

interface Job { name: string; key: string; dir: string; fixture?: string }
const JOBS: Job[] = [
  { name: "12629 Kirkland", key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { name: "12621 Kirkland", key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { name: "12618 Kirkland", key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { name: "9903 Kirkland", key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { name: "419 Prairie IL", key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { name: "12117 Snohomish", key: "12117", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa" },
];

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

const inRing = (p: { x: number; y: number }, r: ReadonlyArray<{ x: number; y: number }>): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};

const angDiff = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
};

interface DsmLine { a: FootprintPoint; b: FootprintPoint; type: string; lengthFt: number; between: [number, number] }

(async () => {
  const only = process.argv[2];
  const jobs = only ? JOBS.filter((j) => j.key === only) : JOBS;

  console.log("address        clusters  in/out contour   measured%   RIDGE  HIP  VALLEY  rakeE  eaveE   junk-out sf");
  console.log("─".repeat(108));

  for (const job of jobs) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }
    const ground = meta.diagnostics.groundElevFt as number;
    const clustersN = (meta.diagnostics.clusters as number) ?? null;

    // The regularised Instant contour, REGISTERED onto the raster.
    const first = buildRoofV2({ instant, origin: meta.origin, clusters: clustersN });
    const kept = first.report.structures.filter((s) => s.ring);
    if (!kept.length || !first.model) { console.log(`${job.name.padEnd(14)} no contour`); continue; }
    const rings = kept.map((k) => k.ring as FootprintPoint[]);
    const reg = registerContourToRaster({ contour: rings[0], mask, dsm, groundElevFt: ground });
    const T = reg.applied ? reg.transform : { dxFt: 0, dyFt: 0, thetaDeg: 0 };
    const fwd = (p: FootprintPoint): FootprintPoint => {
      const th = (T.thetaDeg * Math.PI) / 180;
      return { x: p.x * Math.cos(th) - p.y * Math.sin(th) + T.dxFt, y: p.x * Math.sin(th) + p.y * Math.cos(th) + T.dyFt };
    };
    const inv = (p: FootprintPoint): FootprintPoint => {
      const th = (-T.thetaDeg * Math.PI) / 180;
      const x = p.x - T.dxFt;
      const y = p.y - T.dyFt;
      return { x: x * Math.cos(th) - y * Math.sin(th), y: x * Math.sin(th) + y * Math.cos(th) };
    };
    const movedRings = rings.map((r) => r.map(fwd)); // raster frame

    // The reconstruction's own clusters + assignment, straight from the source.
    const recon = reconstructRoof(dsm as never, mask as never);
    const d = recon.diagnostics as unknown as {
      clusterPlanes: Array<{ a: number; b: number; c: number }>;
      clusterAzimuthDeg: number[];
      pitches12: number[];
      assign: Int32Array;
    };
    const w = dsm.width;
    const h = dsm.height;
    const stepFt = dsm.pixelSizeM * FT_PER_M;
    const cx = w / 2;
    const cy = h / 2;
    const ftOf = (i: number) => ({ x: ((i % w) + 0.5 - cx) * stepFt, y: (cy - Math.floor(i / w) - 0.5) * stepFt });

    // Per-cluster: pixels inside/outside the moved contour.
    const nClusters = d.clusterPlanes.length;
    const insidePx = new Array(nClusters).fill(0);
    const outsidePx = new Array(nClusters).fill(0);
    let contourPx = 0;
    let measuredPx = 0;
    const inAny = (p: FootprintPoint) => movedRings.some((r) => inRing(p, r));
    for (let i = 0; i < w * h; i++) {
      const id = d.assign[i];
      const p = ftOf(i);
      const ins = inAny(p);
      if (ins) contourPx++;
      if (id < 0) continue;
      if (ins) { insidePx[id]++; measuredPx++; }
      else outsidePx[id]++;
    }
    // A cluster is IN when the majority of its pixels are inside the contour.
    const clusterIn = insidePx.map((n, i) => n > outsidePx[i] && n * stepFt * stepFt >= 12);
    const junkOutSqft = outsidePx.reduce((a, n, i) => a + (clusterIn[i] ? 0 : insidePx[i] + n ? n : 0), 0) * stepFt * stepFt;
    const droppedOutside = clusterIn.filter((v, i) => !v && insidePx[i] + outsidePx[i] > 0).length;

    // ── lines: intersections of ADJACENT in-contour clusters ──
    const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const shared = new Map<string, FootprintPoint[]>();
    for (let i = 0; i < w * h; i++) {
      const a = d.assign[i];
      if (a < 0 || !clusterIn[a]) continue;
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= w || ny >= h) continue;
        const b = d.assign[ny * w + nx];
        if (b < 0 || b === a || !clusterIn[b]) continue;
        const k = pairKey(a, b);
        const rec = shared.get(k) ?? [];
        rec.push(ftOf(i));
        shared.set(k, rec);
      }
    }
    const lines: DsmLine[] = [];
    for (const [k, pts] of shared) {
      if (pts.length * stepFt < 4) continue; // under 4 ft of shared border — noise
      const [ai, bi] = k.split("|").map(Number);
      const A = d.clusterPlanes[ai];
      const B = d.clusterPlanes[bi];
      // Intersection of z=Aax+Aby+Ac and z=Bax+Bby+Bc in plan:
      // (Aa-Ba)x + (Ab-Bb)y + (Ac-Bc) = 0 — direction is the line's own.
      const da = A.a - B.a;
      const db = A.b - B.b;
      const nrm = Math.hypot(da, db);
      if (nrm < 1e-4) continue; // near-coplanar — the merge should own these
      const dir = { x: -db / nrm, y: da / nrm };
      // Anchor: the point on the analytic line nearest the shared pixels' mean.
      const mx = pts.reduce((s2, p) => s2 + p.x, 0) / pts.length;
      const my = pts.reduce((s2, p) => s2 + p.y, 0) / pts.length;
      const off = (da * mx + db * my + (A.c - B.c)) / nrm;
      const px0 = { x: mx - (da / nrm) * off, y: my - (db / nrm) * off };
      let t0 = Infinity;
      let t1 = -Infinity;
      for (const p of pts) {
        const t = (p.x - px0.x) * dir.x + (p.y - px0.y) * dir.y;
        if (t < t0) t0 = t;
        if (t > t1) t1 = t;
      }
      const a2 = { x: px0.x + dir.x * t0, y: px0.y + dir.y * t0 };
      const b2 = { x: px0.x + dir.x * t1, y: px0.y + dir.y * t1 };
      // The crease classifier's own rule, verbatim (creases.ts): convex/concave
      // by the two planes' heights a PROBE off the line, level by along-line pitch.
      const creaseP12 = Math.abs(A.a * dir.x + A.b * dir.y) * 12;
      const sgn = Math.sign(da * (da / nrm) + db * (db / nrm)) || 1;
      const ncx2 = (da / nrm) * sgn;
      const ncy2 = (db / nrm) * sgn;
      const zc = A.a * px0.x + A.b * px0.y + A.c;
      const zL = A.a * (px0.x - ncx2 * PROBE_FT) + A.b * (px0.y - ncy2 * PROBE_FT) + A.c;
      const zR = B.a * (px0.x + ncx2 * PROBE_FT) + B.b * (px0.y + ncy2 * PROBE_FT) + B.c;
      const type = zL > zc && zR > zc ? "VALLEY" : zL < zc && zR < zc ? (creaseP12 <= LEVEL_PITCH12 ? "RIDGE" : "HIP") : "OTHER";
      if (type === "OTHER") continue; // bends without folding — not a roof line
      lines.push({ a: a2, b: b2, type, lengthFt: t1 - t0, between: [ai, bi] });
    }

    // ── contour edges: eave or rake, from the dominant inside cluster's drain ──
    let rakeEdges = 0;
    let eaveEdges = 0;
    const edgeTypes: Array<{ a: FootprintPoint; b: FootprintPoint; type: "RAKE" | "EAVE" | "?" }> = [];
    for (const ring of movedRings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 4) continue;
        // Sample the cluster a couple of feet inside the edge midpoint.
        const nx2 = -(b.y - a.y) / len;
        const ny2 = (b.x - a.x) / len;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        let id = -1;
        for (const off of [2, 4, 6]) {
          for (const s3 of [1, -1]) {
            const q = { x: mid.x + nx2 * off * s3, y: mid.y + ny2 * off * s3 };
            if (!inAny(q)) continue;
            const xi = Math.round(q.x / stepFt + cx - 0.5);
            const yi = Math.round(cy - 0.5 - q.y / stepFt);
            if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
            const c2 = d.assign[yi * w + xi];
            if (c2 >= 0 && clusterIn[c2]) { id = c2; break; }
          }
          if (id >= 0) break;
        }
        if (id < 0) { edgeTypes.push({ a, b, type: "?" }); continue; }
        const az = d.clusterAzimuthDeg[id];
        const edgeDeg = ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
        const alongDiff = Math.min(angDiff(az, edgeDeg), angDiff(az, (edgeDeg + 180) % 360));
        if (alongDiff <= EDGE_TOL_DEG) { rakeEdges++; edgeTypes.push({ a, b, type: "RAKE" }); }
        else { eaveEdges++; edgeTypes.push({ a, b, type: "EAVE" }); }
      }
    }

    // ── the current product output, for the side-by-side ──
    let product: RoofModel = first.model;
    if (reg.applied) {
      const meas = measurePitchFromDsm({ model: first.model, mask, dsm, transform: T, transformFor: () => T, sectionTolerance12: 0.75 });
      const sp = structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: instant.structures.some((s2) => s2.solarPanels === true) });
      product = buildRoofV2({ instant, origin: meta.origin, clusters: clustersN, pitchOverride12: sp.pitch12 }).model ?? first.model;
      if (kept.length === 1) {
        try {
          const g = tryWavefront({ contour: rings[0], skeletonModel: product, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 });
          if (g.model) product = g.model;
        } catch { /* keep */ }
      }
    }

    // ── overlays: DSM layout | product, same ortho ──
    const wide = instant.imagery
      .filter((im) => im.view === "ortho" && im.bbox && im.masked === false)
      .sort((x, y2) => (y2.bbox![2] - y2.bbox![0]) * (y2.bbox![3] - y2.bbox![1]) - (x.bbox![2] - x.bbox![0]) * (x.bbox![3] - x.bbox![1]))[0];
    if (wide?.bbox) {
      const cacheF = resolve(".cache/roof-diagram", `pair-${job.key}-wide-clear.png`);
      let bytes: Uint8Array;
      if (existsSync(cacheF)) bytes = new Uint8Array(readFileSync(cacheF));
      else {
        const r2 = await fetchPropertyImage(wide.token);
        bytes = new Uint8Array(r2.bytes);
        require("node:fs").writeFileSync(cacheF, Buffer.from(bytes));
      }
      const ov = new Overlay(bytes, wide.bbox, meta.origin);
      const COLORS: Record<string, [number, number, number]> = { RIDGE: [255, 60, 60], HIP: [255, 165, 0], VALLEY: [60, 120, 255], RAKE: [40, 200, 90], EAVE: [30, 30, 30] };
      // DSM layout (raster frame → Instant frame via the INVERSE registration,
      // because the ortho is EagleView's world and the Instant contour sits
      // correctly on it while Google's raster is offset by the transform).
      ov.reset();
      for (const e of edgeTypes) ov.seg(inv(e.a), inv(e.b), e.type === "RAKE" ? COLORS.RAKE : e.type === "EAVE" ? COLORS.EAVE : [140, 140, 140]);
      for (const l of lines) ov.seg(inv(l.a), inv(l.b), COLORS[l.type] ?? [255, 255, 255]);
      ov.save(join(OUT, `${job.key}-dsm.png`));
      ov.reset();
      ov.model(product);
      ov.save(join(OUT, `${job.key}-product.png`));
    }

    const ft = (t: string) => Math.round(lines.filter((l) => l.type === t).reduce((s3, l) => s3 + l.lengthFt, 0));
    const measuredShare = contourPx ? (measuredPx / contourPx) * 100 : 0;
    console.log(
      `${job.name.padEnd(14)} ${String(nClusters).padStart(6)}   ${String(clusterIn.filter(Boolean).length).padStart(3)}/${String(droppedOutside).padEnd(4)}      ` +
        `${measuredShare.toFixed(0).padStart(5)}%    ${String(ft("RIDGE")).padStart(5)} ${String(ft("HIP")).padStart(4)} ${String(ft("VALLEY")).padStart(6)}  ` +
        `${String(rakeEdges).padStart(5)} ${String(eaveEdges).padStart(6)}   ${junkOutSqft.toFixed(0).padStart(9)}`,
    );
    // Facet table.
    for (let i2 = 0; i2 < nClusters; i2++) {
      if (!clusterIn[i2]) continue;
      console.log(
        `    facet ${String(i2).padStart(2)}: ${(insidePx[i2] * stepFt * stepFt).toFixed(0).padStart(6)} sf · ${d.pitches12[i2].toFixed(1)}/12 · drains ${d.clusterAzimuthDeg[i2].toFixed(0)}°`,
      );
    }
    for (const l of lines.sort((x, y2) => y2.lengthFt - x.lengthFt).slice(0, 10)) {
      console.log(`    line ${l.type.padEnd(6)} ${l.lengthFt.toFixed(0).padStart(3)} ft between ${l.between[0]} and ${l.between[1]}`);
    }
  }
})();

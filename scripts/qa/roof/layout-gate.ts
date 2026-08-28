/* Part 3 — what the geometric gate throws away, and what survives it.
 *
 *   npx tsx scripts/qa/roof/layout-gate.ts           six addresses
 *   npx tsx scripts/qa/roof/layout-gate.ts 12629     one of them
 *
 * The gate's value is in REJECTION. The reader it filters was measured at
 * 45-60% correct drain directions against 38% for guessing, and the better
 * photograph and prompt did not move that. So the number that matters here is
 * not how many lines survive — it is whether the ones that survive are the
 * right ones, and whether the reasons given for the rest are true reasons.
 *
 * Two independent corroborators are offered to the gate:
 *   - LIDAR folds, from the 3DEP point cloud, where a project covers the
 *     address (nothing over the farm);
 *   - HOUGH segments over the contrast map of the same clear ortho the reader
 *     saw — the photograph's own straight edges, found without a model.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { fetchPropertyImage } from "@/lib/eagleview";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { readInstantSurvey } from "@/lib/roofDiagram/instantSurvey";
import { contrastMap } from "@/lib/roofDiagram/orthoPrep";
import { canny, houghP, grayFromPng } from "@/lib/roofDiagram/cv";
import { readRoofLayout } from "@/lib/roofDiagram/roofLayoutVision";
import { gateLayoutLines } from "@/lib/roofDiagram/layoutGate";
import { fetchCloud } from "@/lib/roofRecon/lidarCloud";
import { findCreases } from "@/lib/roofRecon/creases";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

const FT_PER_M = 3.28084;
const CACHE = resolve(".cache/roof-diagram");
const OUT = resolve(".cache/layout-vision");
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

function clearOrtho(instant: InstantRoofData, origin: { lat: number; lng: number }) {
  const area = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);
  return instant.imagery
    .filter((i) => i.view === "ortho" && i.bbox && i.masked === false)
    .filter((i) => {
      const [a, b, c, d] = i.bbox!;
      return origin.lng >= a && origin.lng <= c && origin.lat >= b && origin.lat <= d;
    })
    .sort((x, y) => area(x.bbox!) - area(y.bbox!))[0];
}

async function orthoBytes(key: string, token: string): Promise<Uint8Array> {
  const file = resolve(CACHE, `clear-${key}.png`);
  if (existsSync(file)) return new Uint8Array(readFileSync(file));
  const { bytes } = await fetchPropertyImage(token);
  const u = new Uint8Array(bytes);
  writeFileSync(file, Buffer.from(u));
  return u;
}

(async () => {
  const only = process.argv[2];
  const jobs = only ? JOBS.filter((j) => j.key === only) : JOBS;
  const totals = { proposed: 0, accepted: 0, byCheck: {} as Record<string, number> };

  for (const job of jobs) {
    console.log(`\n${"=".repeat(78)}\n${job.name}\n${"=".repeat(78)}`);
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }

    const ground = meta.diagnostics.groundElevFt as number;
    const clusters = (meta.diagnostics.clusters as number) ?? null;
    const first = buildRoofV2({ instant, origin: meta.origin, clusters });
    if (!first.model) { console.log("  no model"); continue; }
    const contour = first.report.structures.find((s) => s.ring)!.ring as FootprintPoint[];
    const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: ground });
    const meas = reg.applied
      ? measurePitchFromDsm({ model: first.model, mask, dsm, transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75 })
      : null;
    const sp = meas ? structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: instant.structures.some((s) => s.solarPanels === true) }) : null;
    const model = (sp ? buildRoofV2({ instant, origin: meta.origin, clusters, pitchOverride12: sp.pitch12 }).model : null) ?? first.model;

    // DSM roof points in frame feet, height above ground.
    const stepFt = dsm.pixelSizeM * FT_PER_M;
    const cx = dsm.width / 2;
    const cy = dsm.height / 2;
    const dsmPoints: Array<{ x: number; y: number; z: number }> = [];
    for (let py = 0; py < dsm.height; py++) {
      for (let px = 0; px < dsm.width; px++) {
        const i = py * dsm.width + px;
        if (mask.data[i] <= 0) continue;
        const z = dsm.data[i] * FT_PER_M - ground;
        if (!Number.isFinite(z) || z < 3) continue; // below 3 ft is ground, not roof
        dsmPoints.push({ x: (px + 0.5 - cx) * stepFt, y: (cy - py - 0.5) * stepFt, z });
      }
    }

    // ── corroborator 1: the photograph's own straight edges ──
    const img = clearOrtho(instant, meta.origin);
    const corroborators: Array<{ a: FootprintPoint; b: FootprintPoint; source: string }> = [];
    let photo: Uint8Array | null = null;
    let cm: ReturnType<typeof contrastMap> | null = null;
    if (img?.bbox) {
      photo = await orthoBytes(job.key, img.token);
      cm = contrastMap(photo);
      const g = grayFromPng(cm.bytes);
      const edges = canny(g.gray, g.w, g.h, 20, 70);
      const segs = houghP(edges, g.w, g.h, { threshold: 40, minLineLength: 25, maxLineGap: 6, linesMax: 400 });
      // image pixels → frame feet, through the ortho's bbox
      const [minLon, minLat, maxLon, maxLat] = img.bbox;
      const D2R = Math.PI / 180;
      const EARTH_R_M = 6378137;
      const toFrame = (px: number, py: number): FootprintPoint => {
        const lng = minLon + (px / g.w) * (maxLon - minLon);
        const lat = maxLat - (py / g.h) * (maxLat - minLat);
        return {
          x: (lng - meta.origin.lng) * D2R * Math.cos(meta.origin.lat * D2R) * EARTH_R_M * FT_PER_M,
          y: (lat - meta.origin.lat) * D2R * EARTH_R_M * FT_PER_M,
        };
      };
      for (const s of segs) corroborators.push({ a: toFrame(s.x1, s.y1), b: toFrame(s.x2, s.y2), source: "photograph's own edges" });
      console.log(`  Hough over the contrast map: ${segs.length} segments`);
    }

    // ── corroborator 2: folds in the lidar point cloud ──
    try {
      // The box is the roof plus a margin, in frame feet — the shape fetchCloud
      // actually takes. My first call passed a radius and crashed on `x0`.
      const xs = contour.map((p) => p.x);
      const ys = contour.map((p) => p.y);
      const pad = 20;
      const res = await fetchCloud({
        origin: meta.origin,
        box: { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad },
      });
      if ("cloud" in res && res.cloud.points.length) {
        const groundFt = Number.isFinite(res.cloud.groundFt) ? res.cloud.groundFt : ground;
        const found = findCreases({ model, cloud: res.cloud.points, groundFt });
        const kept = found.filter((c) => !c.refused);
        for (const c of kept) {
          const half = 40;
          corroborators.push({
            a: { x: c.through.x - c.dir.x * half, y: c.through.y - c.dir.y * half },
            b: { x: c.through.x + c.dir.x * half, y: c.through.y + c.dir.y * half },
            source: "lidar folds",
          });
        }
        console.log(`  lidar: ${res.cloud.points.length} points from ${res.cloud.project}; ${kept.length} folds kept of ${found.length} candidates`);
      } else {
        console.log(`  lidar: ${"reason" in res ? res.reason : "no points"}`);
      }
    } catch (err) {
      console.log(`  lidar: unavailable (${err instanceof Error ? err.message.slice(0, 70) : String(err)})`);
    }

    // ── the read, then the gate ──
    if (!photo || !cm) { console.log("  no clear ortho — cannot read this address"); continue; }
    const survey = readInstantSurvey(instant, meta.origin);
    const planes = ((meta.diagnostics.pitches12 as number[]) ?? []).map((p, i) => ({
      pitch12: p,
      azimuthDeg: (meta.diagnostics.clusterAzimuthDeg as number[] | undefined)?.[i] ?? 0,
      sqft: 0,
    }));
    const read = await readRoofLayout({
      photo,
      contrast: cm.bytes,
      instant,
      structure: instant.structures[0],
      contour,
      ours: {
        clusters: planes.length ? planes : undefined,
        occlusion: survey ? { occlusion: survey.occlusion, treeOverhang: survey.treeOverhang, confidence: survey.confidence } : null,
      },
      confidences: survey?.confidence,
    });

    const gate = gateLayoutLines({ model, lines: read.lines, contour, dsmPoints, corroborators });
    writeFileSync(resolve(OUT, `${job.key}-gate.json`), JSON.stringify({ read, gate }, null, 1));

    console.log(`  the reader proposed ${read.lines.length} lines; ${gate.accepted.length} survived the gate`);
    if (gate.eulerBefore != null) console.log(`  Euler ${gate.eulerBefore} → ${gate.eulerAfter}`);
    for (const g of gate.gated) {
      const tag = g.passed ? "KEPT   " : "REJECT ";
      const len = Math.hypot(g.line.b.x - g.line.a.x, g.line.b.y - g.line.a.y);
      console.log(`    ${tag}${g.line.type.padEnd(7)} ${len.toFixed(0).padStart(3)} ft  ${g.passed ? g.checks[g.checks.length - 1].detail : `[${g.rejectedBy}] ${g.reason}`}`);
    }
    totals.proposed += read.lines.length;
    totals.accepted += gate.accepted.length;
    for (const [k, v] of Object.entries(gate.rejectedByCheck)) totals.byCheck[k] = (totals.byCheck[k] ?? 0) + v;
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(`proposed ${totals.proposed} lines · kept ${totals.accepted} · rejected ${totals.proposed - totals.accepted}`);
  console.log("rejected by:");
  for (const [k, v] of Object.entries(totals.byCheck).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${v}`);
})();

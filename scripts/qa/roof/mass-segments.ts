/* Step 1 — does the elevation data split these roofs into masses, stably?
 *
 *   npx tsx scripts/qa/roof/mass-segments.ts          six addresses
 *   npx tsx scripts/qa/roof/mass-segments.ts 12629    one of them
 *
 * MEASUREMENT ONLY. Nothing is built, nothing is wired. The question is
 * narrow: is the split good enough to build a roof per mass on?
 *
 * Three independent cross-checks, none of which comes from the segmentation:
 *   FLASHING — the old calibrated path drew step flashing on 12629 totalling
 *              29.4 ft and none on Prairie. If a wall is real, the boundary
 *              should land where that flashing is.
 *   WAVEFRONT REFUSALS — the weighted wavefront refused on a co-normal contact
 *              at a measured drop: 12629 5.5 ft, 12618 13.9 ft. The
 *              segmentation must see the same joints.
 *   THE PHOTOGRAPH — the step pixels are rendered separately (see
 *              .cache/diag/*-walls.png, written by the diagnostic scripts) so
 *              the split can be looked at rather than argued about.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { segmentMasses } from "@/lib/roofRecon/massSegments";
import { ridgeTopology } from "@/lib/roofRecon/ridgeTopology";
import { ridgeLines } from "@/lib/roofRecon/ridgeLines";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

const FT_PER_M = 3.28084;
const OUT = resolve(".cache/mass-segments");
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

/** Flashing the OLD calibrated path drew, from the saved measurements. */
const FLASHING_EVIDENCE: Record<string, string> = {
  "12629": "4 lines, 29.4 ft total (old calibrated path, 2026-08-24..26)",
  "419": "none",
};
/** Where the weighted wavefront refused, and the drop it measured. */
const WAVEFRONT_REFUSALS: Record<string, string> = {
  "12629": "co-normal contact at a jog, drop 5.5 ft (edge e13)",
  "12618": "co-normal contact at a jog, drop 13.9 ft (edge e7)",
};

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

const compass = (deg: number): string => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(deg / 22.5) % 16];

(async () => {
  const only = process.argv[2];
  const jobs = only ? JOBS.filter((j) => j.key === only) : JOBS;

  for (const job of jobs) {
    console.log(`\n${"=".repeat(80)}\n${job.name}\n${"=".repeat(80)}`);
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }

    const ground = meta.diagnostics.groundElevFt as number;
    const clusters = (meta.diagnostics.clusters as number) ?? null;
    const first = buildRoofV2({ instant, origin: meta.origin, clusters });
    const contour = (first.report.structures.find((s) => s.ring)?.ring ?? []) as FootprintPoint[];
    // The contour has to be MOVED onto the raster before it can select pixels —
    // registration is up to 8.7 ft on this sample, which is several masses wide
    // at the scale of a wall.
    const reg = contour.length >= 3 ? registerContourToRaster({ contour, mask, dsm, groundElevFt: ground }) : null;
    const moved: FootprintPoint[] | undefined =
      reg?.applied && reg.transform
        ? contour.map((p) => {
            const th = (reg.transform.thetaDeg * Math.PI) / 180;
            return {
              x: p.x * Math.cos(th) - p.y * Math.sin(th) + reg.transform.dxFt,
              y: p.x * Math.sin(th) + p.y * Math.cos(th) + reg.transform.dyFt,
            };
          })
        : contour.length >= 3
          ? contour
          : undefined;

    // Height above ground per pixel.
    const stepFt = dsm.pixelSizeM * FT_PER_M;
    const heightFt = new Float32Array(dsm.width * dsm.height).fill(NaN);
    for (let i = 0; i < heightFt.length; i++) {
      if (mask.data[i] <= 0) continue;
      heightFt[i] = dsm.data[i] * FT_PER_M - ground;
    }

    const seg = segmentMasses({
      heightFt,
      width: dsm.width,
      height: dsm.height,
      pixelFt: stepFt,
      originPx: { x: (0.5 - dsm.width / 2) * stepFt, y: (dsm.height / 2 - 0.5) * stepFt },
      contour: moved,
    });

    console.log(
      `  step threshold ${seg.stepThresholdFt.toFixed(2)} ft (pixel ${stepFt.toFixed(3)} ft at the steepest roof we admit) · ` +
        `${seg.roofPx} roof pixels, ${seg.wallPx} on steps (removed), ${seg.keptPx} in kept masses · ${seg.droppedSmall} regions under the area floor`,
    );
    console.log(`\n  MASSES: ${seg.masses.length}`);
    console.log("   id   plan sf   height ft      pitch   long x short ft   long axis   centroid");
    for (const m of seg.masses) {
      console.log(
        `   ${String(m.id).padStart(2)} ${m.planSqft.toFixed(0).padStart(9)}   ` +
          `${m.minFt.toFixed(1).padStart(5)}–${m.maxFt.toFixed(1).padEnd(5)}  ` +
          `${m.pitch12.toFixed(1).padStart(5)}/12   ${m.longFt.toFixed(0).padStart(4)} x ${m.shortFt.toFixed(0).padEnd(4)}   ` +
          `${m.axisDeg.toFixed(0).padStart(3)}° ${compass(m.axisDeg).padEnd(3)}   (${m.centroid.x.toFixed(0)}, ${m.centroid.y.toFixed(0)})`,
      );
    }

    console.log(`\n  BOUNDARIES between masses: ${seg.boundaries.length}`);
    for (const b of seg.boundaries) {
      console.log(`   ${b.a}–${b.b}  ${b.lengthFt.toFixed(1).padStart(6)} ft long · step ${b.stepFt.toFixed(1)} ft · at (${b.at.x.toFixed(0)}, ${b.at.y.toFixed(0)})`);
    }

    const flash = FLASHING_EVIDENCE[job.key];
    const wave = WAVEFRONT_REFUSALS[job.key];
    if (flash) console.log(`\n  CROSS-CHECK flashing drawn by the old path: ${flash}`);
    if (wave) console.log(`  CROSS-CHECK wavefront refusal: ${wave}`);

    // ── RIDGE TOPOLOGY, the other question entirely ──
    // Height steps find walls. This finds summits and the saddles between them,
    // which is what separates masses that meet at a valley.
    const topo = ridgeTopology({
      heightFt,
      width: dsm.width,
      height: dsm.height,
      pixelFt: stepFt,
      originPx: { x: (0.5 - dsm.width / 2) * stepFt, y: (dsm.height / 2 - 0.5) * stepFt },
      contour: moved,
    });
    const real = topo.summits.filter((s) => s.persistenceFt >= topo.saddleFloorFt);
    console.log(`
  RIDGE TOPOLOGY — ${topo.summits.length} local maxima, ${real.length} clear the ${topo.saddleFloorFt} ft saddle floor`);
    console.log("   summit   peak ft   persistence   ridge run        drains sf");
    for (const s of real.slice(0, 12)) {
      console.log(
        `   ${String(s.id).padStart(6)} ${s.peakFt.toFixed(1).padStart(9)}   ` +
          `${(s.persistenceFt === Infinity ? "the roof" : `${s.persistenceFt.toFixed(2)} ft`).padStart(11)}   ` +
          `${s.ridgeFt.toFixed(0).padStart(3)} ft ${compass(s.ridgeDeg).padEnd(3)}   ${s.planSqft.toFixed(0).padStart(9)}`,
      );
    }
    if (real.length > 12) console.log(`   … and ${real.length - 12} more`);
    console.log(`  SADDLES: ${topo.saddles.length}; deepest —`);
    for (const sd of topo.saddles.slice(0, 8)) {
      console.log(`   between ${sd.a} and ${sd.b} at ${sd.atFt.toFixed(1)} ft · depth ${sd.depthFt.toFixed(2)} ft · at (${sd.where.x.toFixed(0)}, ${sd.where.y.toFixed(0)})`);
    }

    // ── RIDGES, and the ground each one claims ──
    const rl = ridgeLines({
      heightFt,
      width: dsm.width,
      height: dsm.height,
      pixelFt: stepFt,
      originPx: { x: (0.5 - dsm.width / 2) * stepFt, y: (dsm.height / 2 - 0.5) * stepFt },
      contour: moved,
    });
    console.log(
      `
  RIDGES — ${rl.ridges.length} kept (${rl.droppedShort} dropped under ${rl.minRidgeFt} ft, the length the lidar can confirm) · ` +
        `${rl.ridgePx} ridge pixels · ${rl.claimedPx} of ${rl.roofPx} roof pixels claimed`,
    );
    console.log("   id   len ft   height   bearing    pitches L/R    claims sf   at");
    for (const r of rl.ridges.slice(0, 10)) {
      console.log(
        `   ${String(r.id).padStart(2)} ${r.lengthFt.toFixed(0).padStart(7)} ${r.heightFt.toFixed(1).padStart(8)}   ` +
          `${r.dirDeg.toFixed(0).padStart(3)}° ${compass(r.dirDeg).padEnd(3)}  ` +
          `${r.pitchLeft12.toFixed(1).padStart(4)}/${r.pitchRight12.toFixed(1).padEnd(4)}  ` +
          `${r.claimSqft.toFixed(0).padStart(9)}   (${r.a.x.toFixed(0)},${r.a.y.toFixed(0)})–(${r.b.x.toFixed(0)},${r.b.y.toFixed(0)})`,
      );
    }
    if (rl.ridges.length > 10) console.log(`   … and ${rl.ridges.length - 10} more`);

    writeFileSync(resolve(OUT, `${job.key}.json`), JSON.stringify({ seg, topo, rl }, null, 1));
  }
})();

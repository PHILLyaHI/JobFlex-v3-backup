/* Step 2 — the stitch, measured across the six.
 *
 *   npx tsx scripts/qa/roof/stitch-run.ts
 *
 * buildMeasuredRoof per address: full reconstruction inside the registered
 * Instant contour, perimeter conformed onto it, hard guards, skeleton as the
 * whole-structure filler below the coverage floor. Prints footage before/after
 * by type and writes the было/стало overlays.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import { fetchPropertyImage } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { Overlay } from "./overlay";
import { loadFixture, type FixtureMeta } from "./fixture";

const OUT = resolve(".cache/stitch");
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

const ftOf = (m: RoofModel, t: string): number => Math.round((m.totals.footageByType?.[t as never] as number) ?? 0);

(async () => {
  console.log("address        engine         measured%  |  RIDGE до→после  HIP до→после  VALLEY до→после  RAKE до→после  |  Euler  tiling%  codes");
  console.log("─".repeat(132));

  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }
    const ground = meta.diagnostics.groundElevFt as number;
    const clustersN = (meta.diagnostics.clusters as number) ?? null;

    // BEFORE — the current product output (skeleton + wavefront), as today.
    const first = buildRoofV2({ instant, origin: meta.origin, clusters: clustersN });
    if (!first.model) { console.log(`${job.name.padEnd(14)} no model`); continue; }
    const contour = first.report.structures.find((s) => s.ring)!.ring as FootprintPoint[];
    const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: ground });
    let before: RoofModel = first.model;
    if (reg.applied) {
      const meas = measurePitchFromDsm({ model: first.model, mask, dsm, transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75 });
      const sp = structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: instant.structures.some((s) => s.solarPanels === true) });
      before = buildRoofV2({ instant, origin: meta.origin, clusters: clustersN, pitchOverride12: sp.pitch12 }).model ?? first.model;
      try {
        const g = tryWavefront({ contour, skeletonModel: before, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 });
        if (g.model) before = g.model;
      } catch { /* keep */ }
    }

    // AFTER — the stitch.
    const res = buildMeasuredRoof({
      dsm,
      mask,
      contour,
      transform: reg.applied ? reg.transform : { dxFt: 0, dyFt: 0, thetaDeg: 0 },
      skeleton: before,
    });
    const after = res.model ?? before;

    console.log(
      `${job.name.padEnd(14)} ${res.engine.padEnd(14)} ${(res.measuredShare * 100).toFixed(0).padStart(6)}%  |  ` +
        `${String(ftOf(before, "RIDGE")).padStart(5)}→${String(ftOf(after, "RIDGE")).padEnd(5)}  ` +
        `${String(ftOf(before, "HIP")).padStart(5)}→${String(ftOf(after, "HIP")).padEnd(5)}  ` +
        `${String(ftOf(before, "VALLEY")).padStart(6)}→${String(ftOf(after, "VALLEY")).padEnd(6)}  ` +
        `${String(ftOf(before, "RAKE")).padStart(5)}→${String(ftOf(after, "RAKE")).padEnd(5)}  |  ` +
        `${String(res.guards.euler).padStart(4)}  ${res.guards.tilingPct.toFixed(2).padStart(6)}  ${res.guards.errorCodes.join("/") || "clean"}`,
    );
    if (res.rejectedCandidate) {
      const c = res.rejectedCandidate;
      console.log(
        `    кандидат (отбракован): RIDGE ${ftOf(c, "RIDGE")} · HIP ${ftOf(c, "HIP")} · VALLEY ${ftOf(c, "VALLEY")} · RAKE ${ftOf(c, "RAKE")} ft · ${c.faces.length} граней`,
      );
    }
    for (const r2 of res.reasons) console.log(`    – ${r2}`);
    if (res.conform) console.log(`    conform: ${res.conform.vertsMoved} verts moved (max ${res.conform.maxMoveFt} ft), reverted ${res.conform.reverted}`);

    // ── overlays: было / стало on the wide clear ortho ──
    const wide = instant.imagery
      .filter((im) => im.view === "ortho" && im.bbox && im.masked === false)
      .sort((x, y) => (y.bbox![2] - y.bbox![0]) * (y.bbox![3] - y.bbox![1]) - (x.bbox![2] - x.bbox![0]) * (x.bbox![3] - x.bbox![1]))[0];
    if (wide?.bbox) {
      const cacheF = resolve(".cache/roof-diagram", `pair-${job.key}-wide-clear.png`);
      let bytes: Uint8Array;
      if (existsSync(cacheF)) bytes = new Uint8Array(readFileSync(cacheF));
      else {
        const r3 = await fetchPropertyImage(wide.token);
        bytes = new Uint8Array(r3.bytes);
        writeFileSync(cacheF, Buffer.from(bytes));
      }
      const ov = new Overlay(bytes, wide.bbox, meta.origin);
      ov.reset();
      ov.model(before);
      ov.save(join(OUT, `${job.key}-before.png`));
      ov.reset();
      ov.model(after);
      ov.save(join(OUT, `${job.key}-after.png`));
      if (res.rejectedCandidate) {
        ov.reset();
        ov.model(res.rejectedCandidate);
        ov.save(join(OUT, `${job.key}-candidate.png`));
      }
    }
    writeFileSync(join(OUT, `${job.key}.json`), JSON.stringify({ engine: res.engine, measuredShare: res.measuredShare, guards: res.guards, reasons: res.reasons }, null, 1));
  }
})();

/* The cell-fit census (§J). Historically: the dominance census that REJECTED
 * the 70% vote threshold (continuous 7/5/7/10/9/30 per decade — recorded in
 * ROOF-STATE). Now the cells are cluster regions and the recorded figure is
 * the plane-fit RMS per cell against the recon's own growth tolerance.
 *
 *   npx tsx scripts/qa/roof/cell-dominance.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";
import { productionSkeleton } from "./prodflow";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

interface Job { name: string; key: string; dir: string; fixture?: string }
const JOBS: Job[] = [
  { name: "12629", key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { name: "12621", key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { name: "12618", key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { name: "9903", key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { name: "419", key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { name: "12117", key: "12117", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa" },
];

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

(async () => {
  const all: Array<{ addr: string; area: number; dom: number; samples: number }> = [];
  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }
    // §J: производственный поток, не своя сборка
    const prod = productionSkeleton({ instant, origin: meta.origin, clusters: (meta.diagnostics.clusters as number) ?? null, dsm, mask, groundElevFt: meta.diagnostics.groundElevFt as number });
    if (!prod) continue;
    const contour = prod.contour;
    const res = buildMeasuredRoof({
      dsm, mask, contour,
      transform: prod.transform,
      skeleton: prod.skeleton,
    });
    for (const c of res.cellStats) all.push({ addr: job.name, area: c.areaSqft, dom: Math.min(1, c.rmsFt), samples: 0 });
    const rows = res.cellStats
      .slice()
      .sort((x, y) => x.rmsFt - y.rmsFt)
      .map((c) => `${Number.isFinite(c.rmsFt) ? c.rmsFt.toFixed(2) : "—"}(${Math.round(c.areaSqft)}sf${c.prov === "fill" ? "·fill" : ""})`)
      .join(" ");
    console.log(`${job.name.padEnd(6)} ${res.cellStats.length} ячеек, RMS ft: ${rows}`);
  }

  // histogram by cell count and by area, 10% bins
  const bins = new Array(10).fill(0);
  const areaBins = new Array(10).fill(0);
  for (const c of all) {
    const b = Math.min(9, Math.floor(c.dom * 10));
    bins[b]++;
    areaBins[b] += c.area;
  }
  console.log("\nдоля ведущего кластера, корзины по 10%:");
  console.log("bin      " + bins.map((_, i) => `${i * 10}-${i * 10 + 10}`.padStart(7)).join(""));
  console.log("ячеек    " + bins.map((n) => String(n).padStart(7)).join(""));
  console.log("площадь  " + areaBins.map((a) => String(Math.round(a)).padStart(7)).join(""));
})();

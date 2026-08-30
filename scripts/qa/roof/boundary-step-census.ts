/* Крео/ступень-перепись: |z_A − z_B| вдоль каждой межкластерной границы на
 * шести адресах. Складка — плоскости встречаются (Δz ~ шум подгонки);
 * ступень — перепад уровней (стена). Если распределение двугорбое, порог
 * читается из провала; если непрерывное — стоп с числами (§J).
 *
 *   npx tsx scripts/qa/roof/boundary-step-census.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { reconstructRoof } from "@/lib/roofRecon";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measureDsmLayout, type ReconLayoutDiagnostics } from "@/lib/roofRecon/measuredLines";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

interface Job { name: string; dir: string; fixture?: string }
const JOBS: Job[] = [
  { name: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { name: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { name: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { name: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { name: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { name: "12117", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa" },
];

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

(async () => {
  const all: number[] = [];
  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }
    const first = buildRoofV2({ instant, origin: meta.origin, clusters: (meta.diagnostics.clusters as number) ?? null });
    const contour = first.report.structures.find((s) => s.ring)?.ring as FootprintPoint[] | undefined;
    if (!contour || !first.model) continue;
    const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: meta.diagnostics.groundElevFt as number });
    const T = reg.applied ? reg.transform : { dxFt: 0, dyFt: 0, thetaDeg: 0 };
    const th = (T.thetaDeg * Math.PI) / 180;
    const movedRing = contour.map((p) => ({ x: p.x * Math.cos(th) - p.y * Math.sin(th) + T.dxFt, y: p.x * Math.sin(th) + p.y * Math.cos(th) + T.dyFt }));
    const recon = reconstructRoof(dsm as never, mask as never);
    const d = recon.diagnostics as unknown as ReconLayoutDiagnostics;
    const m = measureDsmLayout({ dsm, diagnostics: d, movedRings: [movedRing] });

    // Δz per adjacent cluster pair, sampled along the shared border pixels:
    // reuse the pair adjacency by scanning the assign map like the module does.
    const w = dsm.width;
    const h = dsm.height;
    const rows: Array<{ pair: string; dz: number; ft: number }> = [];
    const samples = new Map<string, number[]>();
    for (let i = 0; i < w * h; i++) {
      const a = d.assign[i];
      if (a < 0 || !m.clusterIn[a]) continue;
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= w || ny >= h) continue;
        const b = d.assign[ny * w + nx];
        if (b < 0 || b === a || !m.clusterIn[b]) continue;
        const p = m.ftOf(i);
        const A = d.clusterPlanes[a];
        const B = d.clusterPlanes[b];
        const dz = Math.abs((A.a * p.x + A.b * p.y + A.c) - (B.a * p.x + B.b * p.y + B.c));
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        const arr = samples.get(k) ?? [];
        arr.push(dz);
        samples.set(k, arr);
      }
    }
    for (const [pair, arr] of samples) {
      if (arr.length * m.stepFt < 4) continue;
      arr.sort((x2, y2) => x2 - y2);
      const med = arr[Math.floor(arr.length / 2)];
      rows.push({ pair, dz: med, ft: arr.length * m.stepFt });
      all.push(med);
    }
    rows.sort((x2, y2) => y2.dz - x2.dz);
    console.log(`${job.name.padEnd(6)} границ ${rows.length}: ${rows.map((r) => r.dz.toFixed(1)).join(" ")}`);
  }
  all.sort((a, b) => a - b);
  const bins = new Array(12).fill(0);
  for (const v of all) bins[Math.min(11, Math.floor(v))]++;
  console.log("\nΔz медианы по границам, корзины по 1 ft:");
  console.log("ft      " + bins.map((_, i) => String(i).padStart(4)).join(""));
  console.log("границ  " + bins.map((n) => String(n).padStart(4)).join(""));
})();

/* До/после слоя выпрямления по шести (п.3 приёмки): площадь, погонаж складок,
 * длиннейшие конёк/ендова, R03. Расход: ноль.
 *   npx tsx scripts/qa/roof/straighten-compare.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";
import { productionSkeleton } from "./prodflow";
loadHarnessEnv();
import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { areaOf } from "@/lib/roofRecon/footprint";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

const JOBS = [
  { key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa", fixture: undefined },
  { key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa", fixture: undefined },
  { key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa", fixture: undefined },
  { key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
];

const figures = (mo: RoofModel) => {
  // ПЛАНОВАЯ площадь из колец — один и тот же счёт до и после
  const idx = buildIndexes(mo);
  let area = 0;
  for (const f of mo.faces) {
    const r = ringOf(f.lineIds, idx);
    if (r && r.length >= 3) area += Math.abs(areaOf(r.map((q) => ({ x: q.x, y: q.y }))));
  }
  const sum = (t: string) => mo.lines.filter((l) => l.type === t).reduce((s, l) => s + l.lengthFt, 0);
  const longest = (t: string) => Math.max(0, ...mo.lines.filter((l) => l.type === t).map((l) => l.lengthFt));
  const r03 = validateRoofInvariants(mo).results.filter((r) => r.level === "error" && r.id === "R03").length;
  return { area, ridge: sum("RIDGE"), valley: sum("VALLEY"), hip: sum("HIP"), longR: longest("RIDGE"), longV: longest("VALLEY"), r03 };
};

(async () => {
  console.log("адрес   |  площадь до→после (Δ%) | RIDGE до→после | VALLEY до→после | длиннейший конёк | длиннейшая ендова | R03 до→после");
  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else {
      const r = (f: string): Raster => {
        const buf = gunzipSync(readFileSync(resolve(job.dir, f)));
        const data = new Float32Array(meta.raster.width * meta.raster.height);
        Buffer.from(data.buffer).set(buf);
        return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
      };
      dsm = r("dsm.f32.gz"); mask = r("mask.f32.gz");
    }
    // §J: производственный поток, не своя сборка
    const prod = productionSkeleton({ instant, origin: meta.origin, clusters: (meta.diagnostics.clusters as number) ?? null, dsm, mask, groundElevFt: meta.diagnostics.groundElevFt as number });
    if (!prod) continue;
    const contour = prod.contour;
    const res = buildMeasuredRoof({
      dsm, mask, contour,
      transform: prod.transform,
      skeleton: prod.skeleton,
      onStage: () => {},
    });
    const after = res.model ?? res.rejectedCandidate!;
    const before = res.preStraighten!;
    const A = figures(before);
    const B = figures(after);
    const dPct = A.area > 0 ? ((B.area - A.area) / A.area) * 100 : 0;
    console.log(
      `${job.key.padEnd(7)} | ${A.area.toFixed(0)}→${B.area.toFixed(0)} (${dPct >= 0 ? "+" : ""}${dPct.toFixed(2)}%) | ${A.ridge.toFixed(0)}→${B.ridge.toFixed(0)} | ${A.valley.toFixed(0)}→${B.valley.toFixed(0)} | ${B.longR.toFixed(0)} ft | ${B.longV.toFixed(0)} ft | ${A.r03}→${B.r03}`,
    );
  }
})();

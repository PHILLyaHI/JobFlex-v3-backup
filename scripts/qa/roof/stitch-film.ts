/* Лента по этапам НОВОГО пути — региональная сшивка, кадры конструкции.
 *
 *   npx tsx scripts/qa/roof/stitch-film.ts 12629
 *
 * Кадры: 1 кластеры+линии шага 1 · 2 регионы (границы как прослежены) ·
 * 3 спрямление · 4 узлы (точные встречи) · 5 терминалы (линия∩кольцо) ·
 * 6 полиэдр (рёбра по провенансу) · 7 типизация (финальная модель).
 * Всё в .cache/stitch-film/. Расход: ноль (кадры из кэша).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";
import { productionSkeleton } from "./prodflow";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import { fetchPropertyImage } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { reconstructRoof } from "@/lib/roofRecon";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measureDsmLayout, type ReconLayoutDiagnostics } from "@/lib/roofRecon/measuredLines";
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { Overlay } from "./overlay";
import { loadFixture, type FixtureMeta } from "./fixture";

const OUT = resolve(".cache/stitch-film");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const JOBS: Record<string, { dir: string; fixture?: string }> = {
  "12629": { dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  "12621": { dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  "12618": { dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  "9903": { dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  "419": { dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
};

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

(async () => {
  const key = process.argv[2] ?? "12629";
  const job = JOBS[key];
  if (!job) { console.error("нет такого адреса:", key); process.exit(1); }
  const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
  const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
  let dsm: Raster, mask: Raster;
  if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
  else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }
  const ground = meta.diagnostics.groundElevFt as number;

  // §J: стенд ходит производственным потоком (prodflow), не своей сборкой
  const prod = productionSkeleton({ instant, origin: meta.origin, clusters: (meta.diagnostics.clusters as number) ?? null, dsm, mask, groundElevFt: ground });
  if (!prod) throw new Error("производственный поток не построил скелет");
  const contour = prod.contour;
  const T = prod.transform;
  const th = (T.thetaDeg * Math.PI) / 180;
  const fwd = (p: FootprintPoint): FootprintPoint => ({ x: p.x * Math.cos(th) - p.y * Math.sin(th) + T.dxFt, y: p.x * Math.sin(th) + p.y * Math.cos(th) + T.dyFt });
  const inv = (p: FootprintPoint): FootprintPoint => {
    const x = p.x - T.dxFt;
    const y = p.y - T.dyFt;
    return { x: x * Math.cos(-th) - y * Math.sin(-th), y: x * Math.sin(-th) + y * Math.cos(-th) };
  };

  // stage geometry (the SECOND runCells pass — virtual lines included — wins)
  const stages = new Map<string, Array<{ pts: FootprintPoint[]; pair: [number, number] }>>();
  const res = buildMeasuredRoof({
    dsm, mask, contour,
    transform: T,
    skeleton: prod.skeleton,
    onStage: (stage, polys) => stages.set(stage, polys),
  });
  console.log(`engine: ${res.engine} · этапов снято: ${[...stages.keys()].join(", ")}`);

  const wide = instant.imagery
    .filter((im) => im.view === "ortho" && im.bbox && im.masked === false)
    .sort((x, y) => (y.bbox![2] - y.bbox![0]) * (y.bbox![3] - y.bbox![1]) - (x.bbox![2] - x.bbox![0]) * (x.bbox![3] - x.bbox![1]))[0]!;
  const cacheF = resolve(".cache/roof-diagram", `pair-${key}-wide-clear.png`);
  let bytes: Uint8Array;
  if (existsSync(cacheF)) bytes = new Uint8Array(readFileSync(cacheF));
  else {
    const r3 = await fetchPropertyImage(wide.token);
    bytes = new Uint8Array(r3.bytes);
    writeFileSync(cacheF, Buffer.from(bytes));
  }

  // step-1 layout (clusters+lines) — the same render the dsm-layout page used
  const recon = reconstructRoof(dsm as never, mask as never);
  const d = recon.diagnostics as unknown as ReconLayoutDiagnostics;
  const movedRing = contour.map(fwd);
  const m = measureDsmLayout({ dsm, diagnostics: d, movedRings: [movedRing] });
  const COLORS: Record<string, [number, number, number]> = { RIDGE: [255, 60, 60], HIP: [255, 165, 0], VALLEY: [60, 120, 255], RAKE: [40, 200, 90], EAVE: [30, 30, 30] };
  {
    const ov = new Overlay(bytes, wide.bbox!, meta.origin);
    ov.reset();
    for (const e of m.edges) ov.seg(inv(e.a), inv(e.b), e.type === "RAKE" ? COLORS.RAKE : e.type === "EAVE" ? COLORS.EAVE : [140, 140, 140]);
    for (const l of m.lines) ov.seg(inv(l.a), inv(l.b), COLORS[l.type] ?? [255, 255, 255]);
    ov.save(join(OUT, `${key}-1-clusters.png`));
  }
  // stages 2-5: boundary polylines per construction stage
  const stageFrames: Array<[string, string]> = [["traced", "2-regions"], ["straightened", "3-straighten"], ["nodes", "4-nodes"], ["terminals", "5-terminals"]];
  for (const [stage, name] of stageFrames) {
    const polys = stages.get(stage);
    if (!polys) continue;
    const ov = new Overlay(bytes, wide.bbox!, meta.origin);
    ov.reset();
    for (const vp of polys) {
      for (let i = 0; i + 1 < vp.pts.length; i++) ov.seg(inv(vp.pts[i]), inv(vp.pts[i + 1]), [255, 200, 40]);
    }
    ov.save(join(OUT, `${key}-${name}.png`));
  }
  // stage 5b: ДО выпрямления (модель со звеньями и огрызками)
  if (res.preStraighten) {
    const pt0 = new Map(res.preStraighten.points.map((p) => [p.id, p]));
    const ov = new Overlay(bytes, wide.bbox!, meta.origin);
    ov.reset();
    for (const l of res.preStraighten.lines) ov.seg(pt0.get(l.aId)!, pt0.get(l.bId)!, [230, 230, 230]);
    ov.save(join(OUT, `${key}-6a-prestraighten.png`));
  }
  // stage 6: полиэдр — final model lines uniformly (structure without types)
  const model = res.model ?? res.rejectedCandidate;
  if (model) {
    const ptById = new Map(model.points.map((p) => [p.id, p]));
    {
      const ov = new Overlay(bytes, wide.bbox!, meta.origin);
      ov.reset();
      for (const l of model.lines) ov.seg(ptById.get(l.aId)!, ptById.get(l.bId)!, [230, 230, 230]);
      ov.save(join(OUT, `${key}-6-polyhedron.png`));
    }
    // stage 7: типизация — the shipped drawing
    {
      const ov = new Overlay(bytes, wide.bbox!, meta.origin);
      ov.reset();
      ov.model(model);
      ov.save(join(OUT, `${key}-7-typed.png`));
    }
  }
  console.log("кадры в .cache/stitch-film/");
})();

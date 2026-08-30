/* Задача 2: грамматика G1–G4 по текущим шести сшитым моделям — полный список
 * нарушений с вырезками-картинками вокруг каждой точки.
 *
 *   npx tsx scripts/qa/roof/grammar-run.ts
 *
 * Вырезки в .cache/grammar/{key}-{n}-{code}.png (окно 30×30 ft вокруг точки,
 * нарушение помечено перекрестием). Расход: ноль.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { decode, encode } from "fast-png";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { Overlay } from "./overlay";
import { loadFixture, type FixtureMeta } from "./fixture";

const OUT = resolve(".cache/grammar");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const JOBS = [
  { key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa", fixture: undefined },
  { key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa", fixture: undefined },
  { key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa", fixture: undefined },
  { key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
];

const coordRe = /\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/;

(async () => {
  let totalG = 0;
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
    const first = buildRoofV2({ instant, origin: meta.origin, clusters: (meta.diagnostics.clusters as number) ?? null });
    const contour = first.report.structures.find((s) => s.ring)!.ring as FootprintPoint[];
    const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: meta.diagnostics.groundElevFt as number });
    const res = buildMeasuredRoof({
      dsm, mask, contour,
      transform: reg.applied ? reg.transform : { dxFt: 0, dyFt: 0, thetaDeg: 0 },
      skeleton: first.model!,
    });
    const model = res.model ?? res.rejectedCandidate!;
    // истинное кольцо — валидаторная сшивка периметра искажается швами
    const v = validateRoofInvariants(model, { footprint: contour.map((p2) => [p2.x, p2.y] as [number, number]) });
    const g = v.results.filter((r) => r.level === "error" && r.id.startsWith("G"));
    console.log(`\n${job.key}: engine ${res.engine} · G-нарушений ${g.length}`);
    totalG += g.length;

    // вырезки
    const wide = instant.imagery.filter((im) => im.view === "ortho" && im.bbox && im.masked === false)
      .sort((x, y) => (y.bbox![2] - y.bbox![0]) * (y.bbox![3] - y.bbox![1]) - (x.bbox![2] - x.bbox![0]) * (x.bbox![3] - x.bbox![1]))[0]!;
    const cacheF = resolve(".cache/roof-diagram", `pair-${job.key}-wide-clear.png`);
    if (!existsSync(cacheF)) { for (const r of g) console.log(`  [${r.id}] ${(r as { msg?: string }).msg}`); continue; }
    const bytes = new Uint8Array(readFileSync(cacheF));
    const ov = new Overlay(bytes, wide.bbox!, meta.origin);
    ov.reset();
    ov.model(model);
    // рисуем перекрестия на всех нарушениях, затем режем окна
    const marks: Array<{ x: number; y: number; code: string; msg: string }> = [];
    for (const r of g) {
      const msg = (r as { msg?: string }).msg ?? "";
      const mm = coordRe.exec(msg);
      if (mm) marks.push({ x: parseFloat(mm[1]), y: parseFloat(mm[2]), code: r.id, msg });
      else console.log(`  [${r.id}] (без координат) ${msg}`);
    }
    for (const mk of marks) {
      for (const dd of [-4, -3, -2, 2, 3, 4]) {
        ov.seg({ x: mk.x + dd, y: mk.y + dd }, { x: mk.x + dd + 0.01, y: mk.y + dd }, [255, 0, 255], 2);
        ov.seg({ x: mk.x + dd, y: mk.y - dd }, { x: mk.x + dd + 0.01, y: mk.y - dd }, [255, 0, 255], 2);
      }
    }
    const tmp = join(OUT, `${job.key}-full.png`);
    ov.save(tmp);
    const img = decode(new Uint8Array(readFileSync(tmp)));
    const ch = (img as unknown as { channels?: number }).channels ?? 4;
    marks.forEach((mk, i) => {
      const c = ov.toPx({ x: mk.x, y: mk.y });
      const W = 220;
      const x0 = Math.max(0, Math.round(c.x) - W / 2);
      const y0 = Math.max(0, Math.round(c.y) - W / 2);
      const w2 = Math.min(W, img.width - x0);
      const h2 = Math.min(W, img.height - y0);
      const outPx = new Uint8Array(w2 * h2 * 3);
      for (let yy = 0; yy < h2; yy++) for (let xx = 0; xx < w2; xx++) {
        for (let cc = 0; cc < 3; cc++) outPx[(yy * w2 + xx) * 3 + cc] = img.data[((y0 + yy) * img.width + (x0 + xx)) * ch + cc];
      }
      writeFileSync(join(OUT, `${job.key}-${i + 1}-${mk.code}.png`), Buffer.from(encode({ width: w2, height: h2, data: outPx, channels: 3, depth: 8 })));
      console.log(`  [${mk.code}] ${mk.msg}`);
    });
  }
  console.log(`\nИТОГО G-нарушений на пятёрке: ${totalG}`);
})();

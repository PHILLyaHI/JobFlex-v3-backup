/* Зрение-критик — второй эшелон ПОСЛЕ G* = 0 (грамматика мерит внутреннюю
 * связность; критик мерит модель О ФОТОГРАФИЮ). Рендер против ортофото:
 * модель зрения получает чистый орто-кадр и тот же кадр с наложенными
 * линиями чертежа и перечисляет ТОЛЬКО расхождения — складки фото, которых
 * нет в чертеже; линии чертежа, которых нет на фото; смещения.
 *
 *   npx tsx scripts/qa/roof/vision-critic.ts [--repeat=3] [ключ]
 *
 * Дисциплина:
 *   • --repeat=3 — три независимых прогона на дом; расхождение публикуется
 *     в сводке только если повторилось в ≥2 прогонах (кластеризация точек
 *     радиусом 6 ft — ширина пробника классификатора, §J);
 *   • критик НИЧЕГО не чинит: его сводка — список кандидатов, чинится лишь
 *     то, что затем подтверждено геометрией (DSM/маской) у источника;
 *   • расход: только вызовы модели зрения (кэшированные орто-кадры,
 *     ни одного лукапа EagleView).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { getOpenAI, getOpenAIModel, isOpenAIEnabled } from "@/lib/sdk/openai";
import { Overlay } from "./overlay";
import { loadFixture, type FixtureMeta } from "./fixture";

const OUT = resolve(".cache/critic");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const REPEAT = Number((process.argv.find((a) => a.startsWith("--repeat=")) ?? "--repeat=3").split("=")[1]);
const ONLY = process.argv.slice(2).find((a) => !a.startsWith("--"));
const CLUSTER_FT = 6; // ширина пробника классификатора (§J: величина уже в задаче)

const JOBS = [
  { key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa", fixture: undefined },
  { key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa", fixture: undefined },
  { key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa", fixture: undefined },
  { key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
];

interface Finding {
  x: number;
  y: number;
  kind: string;
  what: string;
}

const PROMPT = `Первое изображение — ортофото крыши сверху. Второе — то же фото с наложенным чертежом крыши (цветные линии: коньки, вальмы, ендовы, карнизы).
Перечисли ТОЛЬКО расхождения между чертежом и фотографией:
- "missing": складка/ребро, ЯВНО видимое на фото, но без линии в чертеже;
- "phantom": линия чертежа там, где на фото нет никакой складки;
- "offset": линия чертежа, смещённая от видимой складки более чем на ~2 фута.
НЕ перечисляй совпадения. НЕ комментируй стиль. Игнорируй тени, деревья, машины и соседние крыши. Если расхождений нет — верни пустой массив.
Ответ СТРОГО JSON-массивом: [{"px": <число, пиксель x на изображении>, "py": <число, пиксель y>, "kind": "missing|phantom|offset", "what": "<короткое описание>"}]`;

(async () => {
  if (!isOpenAIEnabled()) {
    console.error("OPENAI_API_KEY не задан — критик не может смотреть");
    process.exit(2);
  }
  const openai = getOpenAI();
  const report: string[] = [];
  for (const job of JOBS) {
    if (ONLY && job.key !== ONLY) continue;
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

    const wide = instant.imagery.filter((im) => im.view === "ortho" && im.bbox && im.masked === false)
      .sort((x, y) => (y.bbox![2] - y.bbox![0]) * (y.bbox![3] - y.bbox![1]) - (x.bbox![2] - x.bbox![0]) * (x.bbox![3] - x.bbox![1]))[0]!;
    const cacheF = resolve(".cache/roof-diagram", `pair-${job.key}-wide-clear.png`);
    if (!existsSync(cacheF)) { console.log(`${job.key}: нет кэшированного орто (${cacheF}) — пропуск`); continue; }
    const clearBytes = readFileSync(cacheF);
    const ov = new Overlay(new Uint8Array(clearBytes), wide.bbox!, meta.origin);
    ov.reset();
    ov.model(model);
    const overlayF = join(OUT, `${job.key}-overlay.png`);
    ov.save(overlayF);
    const overlayBytes = readFileSync(overlayF);

    const runs: Finding[][] = [];
    for (let r = 0; r < REPEAT; r++) {
      const resp = await openai.chat.completions.create({
        model: getOpenAIModel(),
        messages: [{
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: `data:image/png;base64,${clearBytes.toString("base64")}`, detail: "high" } },
            { type: "image_url", image_url: { url: `data:image/png;base64,${overlayBytes.toString("base64")}`, detail: "high" } },
          ],
        }],
      });
      const text = resp.choices[0]?.message?.content ?? "[]";
      const m = text.match(/\[[\s\S]*\]/);
      let items: Array<{ px: number; py: number; kind: string; what: string }> = [];
      try { items = m ? JSON.parse(m[0]) : []; } catch { /* мусорный ответ = пустой прогон */ }
      const fs2: Finding[] = [];
      for (const it of items) {
        if (typeof it.px !== "number" || typeof it.py !== "number") continue;
        const ft = ov.toFt({ x: it.px, y: it.py });
        fs2.push({ x: ft.x, y: ft.y, kind: String(it.kind), what: String(it.what ?? "") });
      }
      runs.push(fs2);
      console.log(`${job.key} прогон ${r + 1}: ${fs2.length} расхождений`);
      for (const f of fs2) console.log(`   [${f.kind}] (${f.x.toFixed(1)},${f.y.toFixed(1)}) ${f.what}`);
    }

    // сводка: кластер точек одного kind в радиусе CLUSTER_FT, ≥2 прогонов
    const all = runs.flatMap((fs2, ri) => fs2.map((f) => ({ ...f, ri })));
    const used = new Set<number>();
    const stable: Array<Finding & { votes: number }> = [];
    for (let i = 0; i < all.length; i++) {
      if (used.has(i)) continue;
      const group = [i];
      for (let j = i + 1; j < all.length; j++) {
        if (used.has(j) || all[j].kind !== all[i].kind) continue;
        if (Math.hypot(all[j].x - all[i].x, all[j].y - all[i].y) <= CLUSTER_FT) group.push(j);
      }
      const votes = new Set(group.map((g) => all[g].ri)).size;
      group.forEach((g) => used.add(g));
      if (votes >= 2) {
        const cx = group.reduce((s, g) => s + all[g].x, 0) / group.length;
        const cy = group.reduce((s, g) => s + all[g].y, 0) / group.length;
        stable.push({ x: cx, y: cy, kind: all[i].kind, what: all[i].what, votes });
      }
    }
    console.log(`${job.key}: устойчивых (≥2 из ${REPEAT}): ${stable.length}`);
    report.push(`${job.key}: ${stable.length} устойчивых из ${runs.flat().length} упоминаний`);
    for (const s of stable) {
      const line = `  [${s.kind} ×${s.votes}] (${s.x.toFixed(1)},${s.y.toFixed(1)}) ${s.what}`;
      console.log(line);
      report.push(line);
    }
  }
  writeFileSync(join(OUT, "report.txt"), report.join("\n"));
  console.log(`\nСводка → .cache/critic/report.txt — чинится лишь подтверждённое геометрией (DSM/маска), не словами модели`);
})();

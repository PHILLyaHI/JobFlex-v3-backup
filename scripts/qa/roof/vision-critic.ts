/* Зрение-критик v2 — второй эшелон ПОСЛЕ G* = 0 (грамматика мерит внутреннюю
 * связность; критик мерит модель О ФОТОГРАФИЮ). Провал v1 на проверке
 * владельца разобран (2026-08-30), чинится по всем трём пунктам диагноза:
 *   1. КРОПЫ ПО ЗОНАМ — квадранты контура с 2× увеличением, не весь лот
 *      (дом был ~6 px/ft, крошка 0.5–2 ft = 3–12 px — ниже разрешения);
 *   2. ЛЕГЕНДА ТИПОВ в промпте (цвета линий чертежа);
 *   3. вопрос «легальна ли линия ЭТОГО ТИПА в этом месте» (kind=illegal),
 *      не только missing/phantom/offset.
 * Порог 2/3 НЕ тронут — он работал как задуман.
 *
 *   npx tsx scripts/qa/roof/vision-critic.ts [--repeat=3] [ключ]
 *
 * Дисциплина прежняя: расхождение публикуется только если повторилось в ≥2
 * прогонах (кластер 6 ft — ширина пробника, §J); критик ничего не чинит —
 * чинится лишь подтверждённое геометрией (DSM/маской). Расход: только
 * вызовы модели зрения, ноль лукапов.
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
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import type { RoofModel } from "@/lib/eagleview";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { getOpenAI, getOpenAIModel, isOpenAIEnabled } from "@/lib/sdk/openai";
import { Overlay } from "./overlay";
import { loadFixture, type FixtureMeta } from "./fixture";

const OUT = resolve(".cache/critic");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const REPEAT = Number((process.argv.find((a) => a.startsWith("--repeat=")) ?? "--repeat=3").split("=")[1]);
const ONLY = process.argv.slice(2).find((a) => !a.startsWith("--"));
const CLUSTER_FT = 6; // ширина пробника классификатора (§J)
const MARGIN_FT = 6;

const JOBS = [
  { key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa", fixture: undefined },
  { key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa", fixture: undefined },
  { key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa", fixture: undefined },
  { key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { key: "12117", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa", fixture: undefined },
];

interface Finding { x: number; y: number; kind: string; what: string }

const PROMPT = `Первое изображение — фрагмент ортофото крыши сверху (увеличено 2×). Второе — тот же фрагмент с наложенным чертежом крыши.
ЛЕГЕНДА линий чертежа: красная = конёк (ridge), оранжевая = вальма (hip), синяя = ендова (valley), чёрная тонкая = карниз (eave), зелёная = фронтон (rake), пурпурная/розовая = флешинг (стык с вертикалью: стена, труба, ступень), белая = нейтральный переход.
ГРАММАТИКА (законы существования): карниз и фронтон живут ТОЛЬКО на внешнем краю крыши (исключение: верх настоящей ступени над нижней крышей); флешинг — только у видимой стены/трубы/перепада высоты; конёк — по гребню; вальма — по выпуклому ребру к углу; ендова — по вогнутой ложбине.
Перечисли ТОЛЬКО дефекты чертежа против фотографии и грамматики:
- "missing": складка/ребро, явно видимое на фото, но без линии;
- "phantom": линия там, где на фото нет никакой складки;
- "offset": линия смещена от видимой складки более чем на ~2 фута;
- "illegal": линия ЭТОГО ТИПА не имеет права быть в ЭТОМ месте (карниз посреди ската, флешинг на ровном краю без стены, вальма в ложбине и т.п.).
НЕ перечисляй совпадения. Игнорируй тени, деревья, машины, соседние крыши и обрез кадра. Если дефектов нет — верни пустой массив.
Ответ СТРОГО JSON-массивом: [{"px": <пиксель x>, "py": <пиксель y>, "kind": "missing|phantom|offset|illegal", "what": "<коротко>"}]`;

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
    // производственный поток скелета — критик смотрит то, что шьёт продакшен
    const clustersN = (meta.diagnostics.clusters as number) ?? null;
    const first = buildRoofV2({ instant, origin: meta.origin, clusters: clustersN });
    const contour = first.report.structures.find((s) => s.ring)!.ring as FootprintPoint[];
    const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: meta.diagnostics.groundElevFt as number });
    let skeleton: RoofModel = first.model!;
    if (reg.applied) {
      const meas = measurePitchFromDsm({ model: first.model!, mask, dsm, transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75 });
      const sp = structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: instant.structures.some((s2) => s2.solarPanels === true) });
      skeleton = buildRoofV2({ instant, origin: meta.origin, clusters: clustersN, pitchOverride12: sp.pitch12 }).model ?? first.model!;
      if (first.report.structures.filter((s2) => s2.ring).length === 1) {
        try {
          const g2 = tryWavefront({ contour, skeletonModel: skeleton, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 });
          if (g2.model) skeleton = g2.model;
        } catch { /* keep */ }
      }
    }
    const res = buildMeasuredRoof({
      dsm, mask, contour,
      transform: reg.applied ? reg.transform : { dxFt: 0, dyFt: 0, thetaDeg: 0 },
      skeleton,
    });
    const model = (res.model ?? res.rejectedCandidate ?? skeleton)!;

    const wide = instant.imagery.filter((im) => im.view === "ortho" && im.bbox && im.masked === false)
      .sort((x, y) => (y.bbox![2] - y.bbox![0]) * (y.bbox![3] - y.bbox![1]) - (x.bbox![2] - x.bbox![0]) * (x.bbox![3] - x.bbox![1]))[0]!;
    const cacheF = resolve(".cache/roof-diagram", `pair-${job.key}-wide-clear.png`);
    if (!existsSync(cacheF)) { console.log(`${job.key}: нет кэшированного орто (${cacheF}) — пропуск`); continue; }
    const clearBytes = readFileSync(cacheF);
    const ovClear = new Overlay(new Uint8Array(clearBytes), wide.bbox!, meta.origin);
    ovClear.reset();
    const clearF = join(OUT, `${job.key}-v2-clear.png`);
    ovClear.save(clearF);
    const ov = new Overlay(new Uint8Array(clearBytes), wide.bbox!, meta.origin);
    ov.reset();
    ov.model(model);
    const overlayF = join(OUT, `${job.key}-v2-overlay.png`);
    ov.save(overlayF);

    const imgClear = decode(new Uint8Array(readFileSync(clearF)));
    const imgOver = decode(new Uint8Array(readFileSync(overlayF)));
    const chC = (imgClear as unknown as { channels?: number }).channels ?? 3;
    const chO = (imgOver as unknown as { channels?: number }).channels ?? 3;

    // квадранты контура (+поля), в пикселях полного кадра
    const xs = contour.map((p) => p.x);
    const ys = contour.map((p) => p.y);
    const lo = ov.toPx({ x: Math.min(...xs) - MARGIN_FT, y: Math.max(...ys) + MARGIN_FT });
    const hi = ov.toPx({ x: Math.max(...xs) + MARGIN_FT, y: Math.min(...ys) - MARGIN_FT });
    const x0 = Math.max(0, Math.round(lo.x));
    const y0 = Math.max(0, Math.round(lo.y));
    const x1 = Math.min(imgOver.width, Math.round(hi.x));
    const y1 = Math.min(imgOver.height, Math.round(hi.y));
    const midX = Math.round((x0 + x1) / 2);
    const midY = Math.round((y0 + y1) / 2);
    const OVERLAP = 12; // px ≈ 2 ft перекрытия, чтобы дефект на шве зоны не потерялся
    const zones = [
      { x0, y0, x1: midX + OVERLAP, y1: midY + OVERLAP },
      { x0: midX - OVERLAP, y0, x1, y1: midY + OVERLAP },
      { x0, y0: midY - OVERLAP, x1: midX + OVERLAP, y1 },
      { x0: midX - OVERLAP, y0: midY - OVERLAP, x1, y1 },
    ];
    const crop2x = (img: { width: number; height: number; data: Uint8Array | Uint16Array }, ch: number, z: { x0: number; y0: number; x1: number; y1: number }): Buffer => {
      const w = z.x1 - z.x0;
      const h = z.y1 - z.y0;
      const out = new Uint8Array(w * 2 * h * 2 * 3);
      for (let yy = 0; yy < h * 2; yy++) for (let xx = 0; xx < w * 2; xx++) {
        const sx = z.x0 + (xx >> 1);
        const sy = z.y0 + (yy >> 1);
        for (let c = 0; c < 3; c++) out[(yy * w * 2 + xx) * 3 + c] = (img.data as Uint8Array)[(sy * img.width + sx) * ch + c];
      }
      return Buffer.from(encode({ width: w * 2, height: h * 2, data: out, channels: 3, depth: 8 }));
    };

    const runs: Finding[][] = [];
    for (let r = 0; r < REPEAT; r++) {
      const fs2: Finding[] = [];
      for (let zi = 0; zi < zones.length; zi++) {
        const z = zones[zi];
        const clearCrop = crop2x(imgClear as never, chC, z);
        const overCrop = crop2x(imgOver as never, chO, z);
        if (r === 0) writeFileSync(join(OUT, `${job.key}-v2-z${zi}.png`), overCrop);
        const resp = await openai.chat.completions.create({
          model: getOpenAIModel(),
          messages: [{
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: `data:image/png;base64,${clearCrop.toString("base64")}`, detail: "high" } },
              { type: "image_url", image_url: { url: `data:image/png;base64,${overCrop.toString("base64")}`, detail: "high" } },
            ],
          }],
        });
        const text = resp.choices[0]?.message?.content ?? "[]";
        const m = text.match(/\[[\s\S]*\]/);
        let items: Array<{ px: number; py: number; kind: string; what: string }> = [];
        try { items = m ? JSON.parse(m[0]) : []; } catch { /* мусор = пусто */ }
        for (const it of items) {
          if (typeof it.px !== "number" || typeof it.py !== "number") continue;
          const fullPx = { x: z.x0 + it.px / 2, y: z.y0 + it.py / 2 };
          const ft = ov.toFt(fullPx);
          fs2.push({ x: ft.x, y: ft.y, kind: String(it.kind), what: String(it.what ?? "") });
        }
      }
      runs.push(fs2);
      console.log(`${job.key} прогон ${r + 1}: ${fs2.length} упоминаний`);
      for (const f of fs2) console.log(`   [${f.kind}] (${f.x.toFixed(1)},${f.y.toFixed(1)}) ${f.what}`);
    }

    // сводка: кластер одного kind в радиусе CLUSTER_FT, ≥2 прогонов
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
  writeFileSync(join(OUT, "report-v2.txt"), report.join("\n"));
  console.log(`\nСводка → .cache/critic/report-v2.txt — чинится лишь подтверждённое геометрией`);
})();

/* Source ablation on ONE house — 12629 NE 100th Pl.
 *
 *   npx tsx scripts/qa/roof/ablation-12629.ts
 *
 * Each run enables EXACTLY ONE data source; the rest are off entirely. Nothing
 * is fixed, nothing imitated: where one source physically cannot build, the
 * output shows what it CAN build (a contour without facets, points without a
 * contour) and the stats say why. An empty result is a result.
 *
 * Then the LAYER ablation on the same house: bare skeleton, +wavefront,
 * +lidar folds, current output — same frame, to see where the cross of hips
 * is born and whether any layer removes it.
 *
 * Every overlay is drawn on the SAME wide clear ortho at the same scale, so
 * the owner compares by eye. Images and stats go to .cache/ablation/.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { decode, encode } from "fast-png";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData, InstantStructure, RoofModel } from "@/lib/eagleview";
import { reconstructRoof } from "@/lib/roofRecon";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import { fetchCloud } from "@/lib/roofRecon/lidarCloud";
import { findCreases } from "@/lib/roofRecon/creases";
import { applyCreases } from "@/lib/roofRecon/facetCut";
import { contrastMap, chooseVisionFrame } from "@/lib/roofDiagram/orthoPrep";
import { readRoofLayout, type LayoutRead } from "@/lib/roofDiagram/roofLayoutVision";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;
const DIR = "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl";
const OUT = resolve(".cache/ablation");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// ── the common frame: the wide clear ortho ──
const meta = JSON.parse(readFileSync(resolve(DIR, "meta.json"), "utf8")) as FixtureMeta;
const instant = JSON.parse(readFileSync(resolve(DIR, "instant.json"), "utf8")) as InstantRoofData;
const origin = meta.origin;
const wide = instant.imagery
  .filter((i) => i.view === "ortho" && i.bbox && i.masked === false)
  .sort((a, b) => (b.bbox![2] - b.bbox![0]) * (b.bbox![3] - b.bbox![1]) - (a.bbox![2] - a.bbox![0]) * (a.bbox![3] - a.bbox![1]))[0];
const ORTHO = decode(new Uint8Array(readFileSync(resolve(".cache/roof-diagram", "pair-12629-wide-clear.png"))));
const CH = (ORTHO as unknown as { channels?: number }).channels ?? 3;
const W = ORTHO.width;
const H = ORTHO.height;
const [minLon, minLat, maxLon, maxLat] = wide.bbox!;

const toPx = (p: { x: number; y: number }): { x: number; y: number } => {
  const lng = origin.lng + p.x / (D2R * Math.cos(origin.lat * D2R) * EARTH_R_M * FT_PER_M);
  const lat = origin.lat + p.y / (D2R * EARTH_R_M * FT_PER_M);
  return {
    x: ((lng - minLon) / (maxLon - minLon)) * W,
    y: ((maxLat - lat) / (maxLat - minLat)) * H,
  };
};

const COLORS: Record<string, [number, number, number]> = {
  RIDGE: [255, 60, 60],
  HIP: [255, 165, 0],
  VALLEY: [60, 120, 255],
  EAVE: [30, 30, 30],
  RAKE: [40, 200, 90],
  FLASHING: [255, 0, 255],
  STEPFLASH: [255, 0, 255],
  OTHER: [255, 255, 255],
};

function freshCanvas(dim = 1): Uint8Array {
  const img = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) img[i * 3 + c] = Math.round((ORTHO.data as Uint8Array)[i * CH + c] * dim);
  }
  return img;
}

function setPx(img: Uint8Array, x: number, y: number, rgb: [number, number, number]) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  img[i] = rgb[0];
  img[i + 1] = rgb[1];
  img[i + 2] = rgb[2];
}

function drawSeg(img: Uint8Array, a: { x: number; y: number }, b: { x: number; y: number }, rgb: [number, number, number]) {
  const A = toPx(a);
  const B = toPx(b);
  const steps = Math.max(2, Math.ceil(Math.hypot(B.x - A.x, B.y - A.y)));
  for (let s = 0; s <= steps; s++) {
    const x = A.x + ((B.x - A.x) * s) / steps;
    const y = A.y + ((B.y - A.y) * s) / steps;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) setPx(img, x + dx, y + dy, rgb);
  }
}

function drawModel(img: Uint8Array, model: RoofModel) {
  const pts = new Map(model.points.map((p) => [p.id, p]));
  for (const l of model.lines) {
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!a || !b) continue;
    drawSeg(img, a, b, COLORS[l.type] ?? COLORS.OTHER);
  }
}

const save = (name: string, img: Uint8Array) =>
  writeFileSync(resolve(OUT, name), Buffer.from(encode({ width: W, height: H, data: img, channels: 3, depth: 8 })));

const statsOf = (m: RoofModel | null) =>
  m
    ? {
        facets: m.faces.length,
        areaSqft: Math.round(m.totals.areaSqft),
        squares: Number(m.totals.squares.toFixed(1)),
        footage: Object.fromEntries(
          Object.entries(m.totals.footageByType ?? {}).map(([k, v]) => [k, Math.round(v as number)]),
        ),
        pitch: m.totals.predominantPitch ?? null,
      }
    : null;

interface RunResult {
  name: string;
  ms: number;
  stats: ReturnType<typeof statsOf> | Record<string, unknown> | null;
  cannot: string[];
  note: string;
}

(async () => {
  const fx = loadFixture("kirkland-12629-ne-100th-pl");
  const dsm = fx.dsm;
  const mask = fx.mask;
  const ground = meta.diagnostics.groundElevFt as number;
  const clusters = (meta.diagnostics.clusters as number) ?? null;
  const results: RunResult[] = [];
  const t = () => Number(process.hrtime.bigint() / 1_000_000n);

  // ── 1. INSTANT ONLY ──
  {
    const t0 = t();
    const r = buildRoofV2({ instant, origin, clusters: null });
    const ms = t() - t0;
    const img = freshCanvas();
    if (r.model) drawModel(img, r.model);
    save("src-1-instant.png", img);
    results.push({
      name: "1 · только EagleView Instant",
      ms,
      stats: statsOf(r.model),
      cannot: [
        "уклон только публикуемый (6/12) — измерить нечем, DSM выключен",
        "регистрации нет — контур стоит там, куда его положил геокодер EagleView",
        "покрытие, непризнанные грани, детект вложенности — всем нужен растр высот",
        "складок нет (лидар выключен), фронтонов нет (wavefront судит по измеренным уклонам)",
      ],
      note: "скелет от контура Instant на публикуемом уклоне — равноуклонная вальма",
    });
  }

  // ── 2. SOLAR ONLY ──
  {
    const t0 = t();
    const r = reconstructRoof(dsm as never, mask as never);
    const ms = t() - t0;
    const img = freshCanvas();
    drawModel(img, r.model);
    save("src-2-solar.png", img);
    results.push({
      name: "2 · только Google Solar (маска + DSM)",
      ms,
      stats: statsOf(r.model),
      cannot: [
        "контур — граница сегментации Google, не обмер: на этом доме маска захватывала 543 sq ft земли",
        "сверки с обмером нет — ни площади EagleView, ни публикуемого уклона",
        "это путь «бесплатной оценки»: рисуется, но не прайсится",
      ],
      note: "контур трассирован из маски, грани выращены по плоскостям DSM",
    });
  }

  // ── 3. LIDAR ONLY ──
  {
    const t0 = t();
    const halfW = ((maxLon - minLon) * D2R * Math.cos(origin.lat * D2R) * EARTH_R_M * FT_PER_M) / 2;
    const halfH = ((maxLat - minLat) * D2R * EARTH_R_M * FT_PER_M) / 2;
    const got = await fetchCloud({ origin, box: { x0: -halfW, x1: halfW, y0: -halfH, y1: halfH } });
    const ms = t() - t0;
    const img = freshCanvas(0.35);
    let n = 0;
    if (!("reason" in got)) {
      const zs = got.cloud.points.map((p) => p.z - got.cloud.groundFt).filter((z) => z > 3 && z < 45);
      const lo = Math.min(...zs);
      const hi = Math.max(...zs);
      for (const p of got.cloud.points) {
        const z = p.z - got.cloud.groundFt;
        if (z <= 3 || z >= 45) continue;
        n++;
        const tt = (z - lo) / (hi - lo || 1);
        setPx(img, toPx(p).x, toPx(p).y, [Math.round(60 + 195 * tt), Math.round(60 + 60 * (1 - tt)), Math.round(255 - 195 * tt)]);
      }
    }
    save("src-3-lidar.png", img);
    results.push({
      name: "3 · только лидар 3DEP",
      ms,
      stats: "reason" in got ? { reason: got.reason } : { points: got.cloud.points.length, roofPoints: n, project: got.cloud.project, groundFt: Number(got.cloud.groundFt.toFixed(1)) },
      cannot: [
        "контура нет: 1 точка на кв. фут — обрыв карниза шире шага сетки, кольцо из него не собирается",
        "складки существующий код ищет ТОЛЬКО поверх готовой модели (findCreases требует model) — без неё им не к чему привязаться",
        "граней нет, погонажа нет, площади нет — облако точек и есть весь вывод",
      ],
      note: "точки крыши, цвет — высота над землёй; это всё, что источник даёт один",
    });
  }

  // ── 4. REPORTALL ONLY ──
  {
    const img = freshCanvas(0.35);
    save("src-4-reportall.png", img);
    results.push({
      name: "4 · только ReportAll",
      ms: 0,
      stats: { ring: "нет в кэше" },
      cannot: [
        "кольца 12629 в кэше нет, и оно НЕ покупалось (квота ALLTIME); на соседях кольцо есть — и из него одного тоже строится ровно ничего",
        "кольцо участка — это ГДЕ искать крышу, а не какая она: ни контура здания, ни высот, ни уклонов",
      ],
      note: "пустой кадр и есть ответ: вклад источника — рамка поиска, не геометрия",
    });
  }

  // ── 5. VISION ONLY ──
  {
    const cacheFile = resolve(OUT, "vision-only-v2.json");
    let read: LayoutRead;
    let frameReason = "";
    let ms = 0;
    if (existsSync(cacheFile)) {
      const c = JSON.parse(readFileSync(cacheFile, "utf8")) as { read: LayoutRead; frameReason: string };
      read = c.read;
      frameReason = c.frameReason;
    } else {
      // The frame is CHOSEN, not first-found: clear only, least shadow, finest
      // scale — and the choice with its reason goes into the stats verbatim.
      const cands = instant.imagery
        .filter((im) => im.view === "ortho" && im.bbox && typeof im.masked === "boolean")
        .map((im) => {
          const wideArea = Math.max(...instant.imagery.filter((x) => x.bbox).map((x) => (x.bbox![2] - x.bbox![0]) * (x.bbox![3] - x.bbox![1])));
          const isWide = (im.bbox![2] - im.bbox![0]) * (im.bbox![3] - im.bbox![1]) === wideArea;
          const file = resolve(".cache/roof-diagram", `pair-12629-${isWide ? "wide" : "tight"}-${im.masked ? "masked" : "clear"}.png`);
          return { token: im.token, masked: im.masked, bbox: im.bbox!, bytes: new Uint8Array(readFileSync(file)) };
        });
      const choice = chooseVisionFrame(cands, origin, instant.structures[0].outline ?? undefined);
      if (!choice) throw new Error("no usable clear frame");
      frameReason = choice.reason;
      const chosen = cands[choice.index];
      const photo = chosen.bytes;
      const cm = contrastMap(photo);
      // A survey stub of nothing: vision-only means the reader gets pictures
      // and no numbers. Every brief line reads "unknown".
      const stub = {
        areaSqft: null, squares: null, pitch: null, facetCount: null, shape: null,
        footprintSqft: null, eaveHeightFt: null, material: null, conditionRating: null,
        roofAgeYears: null, chimney: null, solarPanels: null, rooftopAcCount: null, outline: [],
      } as unknown as InstantStructure;
      const t0 = t();
      read = await readRoofLayout({
        photo,
        contrast: cm.bytes,
        bbox: chosen.bbox,
        origin,
        instant: { ...instant, structures: [stub], totals: {} as never, imagery: [] },
        structure: stub,
        contour: [],
        ours: {},
      });
      ms = t() - t0;
      writeFileSync(cacheFile, JSON.stringify({ read, frameReason }, null, 1));
    }
    const img = freshCanvas();
    for (const f of read.facets) {
      for (let i = 0; i < f.polygon.length; i++) drawSeg(img, f.polygon[i], f.polygon[(i + 1) % f.polygon.length], [200, 200, 200]);
    }
    for (const l of read.lines) drawSeg(img, l.a, l.b, COLORS[l.type] ?? COLORS.OTHER);
    save("src-5-vision.png", img);
    results.push({
      name: "5 · только зрение (новый чтец, снимок EagleView)",
      ms,
      stats: {
        lines: read.lines.length,
        facets: read.facets.length,
        masses: read.masses.length,
        refused: read.refusedPasses,
        unreadable: read.unreadable.length,
        frame: frameReason,
        singleRun: "один прогон — по §J это одна реализация, не число",
      },
      cannot: [
        "координаты — со слов модели, без геометрической правки: масштаб и привязка плывут",
        "площади и погонажа нет — линии не обязаны замыкаться в грани",
        "точность направления стока измерена: 45–60 % против 38 % случайного; в чертёж это не идёт",
      ],
      note: "линии и грани ровно как отдала модель; сводка данных пустая — «unknown» во всех строках",
    });
  }

  // ── LAYERS + 6. CURRENT ──
  const layers: Array<{ tag: string; name: string; model: RoofModel; ms: number; note: string }> = [];
  {
    const t0 = t();
    const first = buildRoofV2({ instant, origin, clusters });
    const kept = first.report.structures.filter((s) => s.ring);
    const ring = kept[0].ring as FootprintPoint[];
    const reg = registerContourToRaster({ contour: ring, mask, dsm, groundElevFt: ground });
    const meas = reg.applied
      ? measurePitchFromDsm({ model: first.model!, mask, dsm, transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75 })
      : null;
    const sp = meas ? structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: instant.structures.some((s) => s.solarPanels === true) }) : null;
    const A = (sp ? buildRoofV2({ instant, origin, clusters, pitchOverride12: sp.pitch12 }).model : null) ?? first.model!;
    layers.push({ tag: "A", name: "A · голый скелет от контура (измеренный уклон)", model: A, ms: t() - t0, note: "равноуклонная вальма — единственное, что скелет умеет" });

    let B = A;
    let wfNote = "wavefront отказал — скелет остался";
    if (meas && sp) {
      try {
        const g = tryWavefront({ contour: ring, skeletonModel: A, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 });
        if (g.model) { B = g.model; wfNote = "wavefront принят"; }
      } catch (err) {
        wfNote = `wavefront: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`;
      }
    }
    layers.push({ tag: "B", name: "B · + wavefront", model: B, ms: t() - t0, note: wfNote });

    let C = B;
    let crNote = "лидар недоступен";
    {
      const xs = ring.map((p) => p.x);
      const ys = ring.map((p) => p.y);
      const got = await fetchCloud({ origin, box: { x0: Math.min(...xs) - 15, x1: Math.max(...xs) + 15, y0: Math.min(...ys) - 15, y1: Math.max(...ys) + 15 } });
      if (!("reason" in got)) {
        const rep = applyCreases(B, findCreases({ model: B, cloud: got.cloud.points, groundFt: got.cloud.groundFt }));
        C = rep.model;
        crNote = rep.applied.length ? `+${rep.applied.length} складка` : "ни одной складки не принято (все отбракованы гвардами)";
      }
    }
    layers.push({ tag: "C", name: "C · + лидарные складки", model: C, ms: t() - t0, note: crNote });
    layers.push({ tag: "D", name: "D · текущий вывод (= C: хирургии диагностируют, не правят)", model: C, ms: t() - t0, note: "полный продуктовый путь" });

    for (const L of layers) {
      const img = freshCanvas();
      drawModel(img, L.model);
      save(`layer-${L.tag}.png`, img);
    }
    const img6 = freshCanvas();
    drawModel(img6, layers[3].model);
    save("src-6-current.png", img6);
    results.push({
      name: "6 · текущий продуктовый вывод (всё включено)",
      ms: layers[3].ms,
      stats: statsOf(layers[3].model),
      cannot: [],
      note: `${wfNote}; ${crNote}`,
    });
  }

  // ── 7. plain ortho for the eye ──
  save("src-7-ortho.png", freshCanvas());
  results.push({
    name: "7 · ортофото (референс)",
    ms: 0,
    stats: null,
    cannot: [],
    note: "трасса владельца в данных не сохранена — сравнение глазами; словесное описание: основной объём восток-запад, восточное крыло, ендова между ними",
  });

  const layerStats = layers.map((L) => ({ tag: L.tag, name: L.name, note: L.note, stats: statsOf(L.model) }));
  writeFileSync(resolve(OUT, "ablation.json"), JSON.stringify({ results, layerStats }, null, 1));
  for (const r of results) {
    console.log(`\n${r.name}  [${r.ms} ms]`);
    console.log(`  ${JSON.stringify(r.stats)}`);
    for (const c of r.cannot) console.log(`  – нельзя: ${c}`);
  }
  console.log("\nLAYERS:");
  for (const L of layerStats) console.log(`  ${L.tag}: ${JSON.stringify(L.stats?.footage ?? {})} · ${L.note}`);
})();

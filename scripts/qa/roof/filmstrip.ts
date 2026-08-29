/* The filmstrip — one frame after EVERY pipeline step, for any ledger address.
 *
 *   npx tsx scripts/qa/roof/filmstrip.ts 12629
 *   npx tsx scripts/qa/roof/filmstrip.ts 12117
 *
 * A debugging tool for keeps, not a one-off report. The full product run, with
 * the geometry rendered over the EagleView ortho after each step — same frame
 * and scale throughout. A step that changed nothing still gets its frame,
 * marked "no change": the absence of an effect is information.
 *
 * Frames land in scripts/qa/roof/filmstrip/<slug>/NN-*.png with an index.html
 * strip beside them (open it in a browser). PNGs are gitignored — they
 * regenerate; the tool is what's versioned.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import { fetchPropertyImage } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { latLngRingToFrame } from "@/lib/roofRecon";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch, DSM_NOISE_FLOOR_FT } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import { detectUnrecognisedFacets } from "@/lib/roofRecon/surgeries";
import { fetchCloud } from "@/lib/roofRecon/lidarCloud";
import { findCreases } from "@/lib/roofRecon/creases";
import { applyCreases } from "@/lib/roofRecon/facetCut";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import { Overlay } from "./overlay";
import { loadFixture, type FixtureMeta } from "./fixture";

// ── the ledger: every address with a frozen Instant answer ──
const LEDGER: Array<{ key: string; slug: string; dir: string; fixture?: string }> = [
  { key: "12629", slug: "12629-ne-100th-pl", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { key: "12621", slug: "12621-ne-100th-pl", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { key: "12618", slug: "12618-ne-100th-st", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { key: "9903", slug: "9903-117th-pl-ne", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { key: "419", slug: "419-prairie-ridge-ln", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { key: "12117", slug: "12117-202nd-st-se", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa" },
];

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

interface Frame { file: string; step: string; changed: string; nums: string }

const eulerOf = (m: RoofModel): number =>
  new Set(m.points.map((p) => p.id)).size - new Set(m.lines.map((l) => l.id)).size + m.faces.length;

function numsOf(m: RoofModel, contourSqft: number): string {
  const idx = buildIndexes(m);
  let plan = 0;
  for (const f of m.faces) {
    const r = ringOf(f.lineIds, idx);
    if (r && r.length >= 3) plan += Math.abs(areaOf(r.map((q) => ({ x: q.x, y: q.y }))));
  }
  const tiling = contourSqft > 0 ? ((plan - contourSqft) / contourSqft) * 100 : 0;
  return `вершин ${m.points.length} · граней ${m.faces.length} · Euler ${eulerOf(m)} · замощение ${tiling >= 0 ? "+" : ""}${tiling.toFixed(2)}%`;
}

(async () => {
  const arg = process.argv[2];
  const job = LEDGER.find((j) => j.key === arg || j.slug.includes(arg ?? ""));
  if (!job) {
    console.error(`Адрес не найден. В леджере: ${LEDGER.map((j) => j.key).join(", ")}`);
    process.exit(1);
  }
  const OUT = resolve("scripts/qa/roof/filmstrip", job.slug);
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
  const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
  const origin = meta.origin;
  let dsm: Raster, mask: Raster;
  if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
  else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }
  const ground = meta.diagnostics.groundElevFt as number;
  const clusters = (meta.diagnostics.clusters as number) ?? null;

  // Ortho backdrop: the widest clear frame, byte-cached beside the strip.
  const wide = instant.imagery
    .filter((i) => i.view === "ortho" && i.bbox && i.masked === false)
    .sort((a, b) => (b.bbox![2] - b.bbox![0]) * (b.bbox![3] - b.bbox![1]) - (a.bbox![2] - a.bbox![0]) * (a.bbox![3] - a.bbox![1]))[0];
  if (!wide) { console.error("нет clear-ортофото в imagery — лента без подложки не строится"); process.exit(1); }
  const orthoFile = join(OUT, "_ortho.png");
  if (!existsSync(orthoFile)) {
    const { bytes } = await fetchPropertyImage(wide.token);
    writeFileSync(orthoFile, Buffer.from(new Uint8Array(bytes)));
  }
  const ov = new Overlay(new Uint8Array(readFileSync(orthoFile)), wide.bbox!, origin);

  const frames: Frame[] = [];
  let n = 0;
  const shoot = (step: string, changed: string, nums: string, draw: () => void) => {
    ov.reset();
    draw();
    const file = `${String(++n).padStart(2, "0")}-${step.replace(/[^\wа-яА-ЯёЁ-]+/g, "_").slice(0, 40)}.png`;
    ov.save(join(OUT, file));
    frames.push({ file, step, changed, nums });
    console.log(`  ${file}  ${changed}`);
  };

  // ── 1. the raw Instant contour ──
  const rawRings = instant.structures
    .filter((s) => (s.outline?.length ?? 0) >= 3)
    .map((s) => latLngRingToFrame(origin, s.outline!).ring);
  shoot("сырой контур Instant", `как пришёл: ${rawRings.map((r) => r.length).join("+")} вершин`, `структур ${rawRings.length} · площадь ${Math.round(rawRings.reduce((a, r) => a + Math.abs(areaOf(r)), 0))} sf`, () => {
    for (const r of rawRings) ov.ring(r, [255, 255, 255], 1);
  });

  // ── 2. regularisation, one frame per op (the REAL intermediates via the tap) ──
  let regSteps: Array<{ name: string; ring: FootprintPoint[] }> = [];
  const first = buildRoofV2({
    instant,
    origin,
    clusters,
    onRegularizeStep: (name, ring) => {
      if (name.startsWith("Дуглас")) regSteps = []; // the budget pass reruns the sequence — keep the last full one
      regSteps.push({ name, ring });
    },
  });
  let prevVerts = rawRings[0]?.length ?? 0;
  for (const st of regSteps) {
    const changed = st.ring.length === prevVerts ? "no change" : `${prevVerts} → ${st.ring.length} вершин`;
    shoot(`регуляризация: ${st.name}`, changed, `площадь ${Math.round(Math.abs(areaOf(st.ring)))} sf`, () => {
      for (const r of rawRings) ov.ring(r, [90, 90, 90], 0);
      ov.ring(st.ring, [255, 255, 255], 1);
    });
    prevVerts = st.ring.length;
  }

  if (!first.model) { console.log(`скелет не построился: ${first.report.reasons.join("; ")}`); process.exit(0); }
  const kept = first.report.structures.filter((s) => s.ring);
  const contourSqft = kept.reduce((a, s) => a + s.contourAreaSqft, 0);

  // ── 3-4. bare skeleton, then classified ──
  shoot("голый скелет", `${first.model.faces.length} граней от контура`, numsOf(first.model, contourSqft), () => ov.model(first.model!, [255, 255, 255]));
  shoot("классификация рёбер", "цвета по типам (конёк/вальма/ендова/карниз/фронтон)", numsOf(first.model, contourSqft), () => ov.model(first.model!));

  // ── 5. registration ──
  const ring0 = kept[0].ring as FootprintPoint[];
  const reg = registerContourToRaster({ contour: ring0, mask, dsm, groundElevFt: ground });
  const moved = reg.applied
    ? ring0.map((p) => {
        const th = (reg.transform.thetaDeg * Math.PI) / 180;
        return { x: p.x * Math.cos(th) - p.y * Math.sin(th) + reg.transform.dxFt, y: p.x * Math.sin(th) + p.y * Math.cos(th) + reg.transform.dyFt };
      })
    : null;
  shoot(
    "регистрация контура на DSM",
    reg.applied ? `сдвиг ${reg.transform.dxFt.toFixed(1)}, ${reg.transform.dyFt.toFixed(1)} ft · поворот ${reg.transform.thetaDeg.toFixed(1)}° · IoU ${reg.iouBefore.toFixed(2)} → ${(reg.iouAfter ?? 0).toFixed(2)}` : `отказ: ${"reason" in reg ? reg.reason : "?"}`,
    "жёлтый — до, зелёный — после",
    () => {
      ov.ring(ring0, [255, 255, 0], 1);
      if (moved) ov.ring(moved, [40, 220, 90], 1);
    },
  );

  // ── 6. DSM clusters over the facets ──
  // The frozen meta predates the samples diagnostic — recompute from the same
  // rasters, exactly as the shipping reconstruction does.
  const { reconstructRoof } = await import("@/lib/roofRecon");
  const freshDiag = reconstructRoof(dsm as never, mask as never).diagnostics as unknown as { clusterSamplesFt?: Array<Array<[number, number]>> };
  shoot("кластеры DSM поверх скелета", `${freshDiag.clusterSamplesFt?.length ?? 0} плоскостей из DSM`, "точки — сэмплы кластеров, цвет по номеру", () => {
    (freshDiag.clusterSamplesFt ?? []).forEach((pts, ci) => {
      const rgb: [number, number, number] = [(ci * 97) % 200 + 55, (ci * 57) % 200 + 55, (ci * 37) % 200 + 55];
      for (const [x, y] of pts) ov.dot({ x, y }, rgb, 2);
    });
    ov.model(first.model!, [255, 255, 255]);
  });

  // ── 7. per-facet pitches ──
  const meas = reg.applied
    ? measurePitchFromDsm({ model: first.model, mask, dsm, transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75 })
    : null;
  const sp = meas ? structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: instant.structures.some((s) => s.solarPanels === true) }) : null;
  shoot(
    "уклоны по граням",
    sp ? `структурный уклон ${sp.pitch12.toFixed(2)}/12 (${sp.source})` : "DSM недоступен — уклон публикуемый",
    "подписи: измеренный уклон грани; серым — не доверенные (residual выше пола)",
    () => {
      ov.model(first.model!);
      if (meas) {
        const idx = buildIndexes(first.model!);
        for (const f of first.model!.faces) {
          const r = ringOf(f.lineIds, idx);
          if (!r || r.length < 3) continue;
          const cx = r.reduce((a, p) => a + p.x, 0) / r.length;
          const cy = r.reduce((a, p) => a + p.y, 0) / r.length;
          const m = meas.facets.find((x) => x.id === String(f.designator || f.id));
          if (!m) continue;
          const trusted = m.residualP50Ft <= DSM_NOISE_FLOOR_FT;
          ov.label({ x: cx, y: cy }, m.pitch12.toFixed(1), trusted ? [255, 255, 0] : [150, 150, 150], 3);
        }
      }
    },
  );

  // ── 8. rebuilt at the measured pitch, then wavefront ──
  let model: RoofModel = first.model;
  if (sp) model = buildRoofV2({ instant, origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;
  let wfNote = "гейт не запускался (нет измерения или структур больше одной)";
  let wfChanged = false;
  if (meas && sp && kept.length === 1) {
    try {
      const g = tryWavefront({ contour: ring0, skeletonModel: model, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 });
      if (g.model) { model = g.model; wfNote = "wavefront ПРИНЯТ"; wfChanged = true; }
      else wfNote = `wavefront отказал: ${g.refused ?? "причина не названа"}`;
    } catch (err) {
      wfNote = `wavefront отказал: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`;
    }
  }
  shoot("wavefront", wfChanged ? wfNote : `no change — ${wfNote}`, numsOf(model, contourSqft), () => ov.model(model));

  // ── 9. lidar creases, one frame per candidate ──
  const xs = ring0.map((p) => p.x);
  const ys = ring0.map((p) => p.y);
  const cloud = await fetchCloud({ origin, box: { x0: Math.min(...xs) - 15, x1: Math.max(...xs) + 15, y0: Math.min(...ys) - 15, y1: Math.max(...ys) + 15 } });
  if ("reason" in cloud) {
    shoot("лидарные складки", `no change — облака нет: ${cloud.reason.slice(0, 70)}`, numsOf(model, contourSqft), () => ov.model(model));
  } else {
    const cands = findCreases({ model, cloud: cloud.cloud.points, groundFt: cloud.cloud.groundFt });
    if (!cands.length) shoot("лидарные складки", "no change — кандидатов нет", numsOf(model, contourSqft), () => ov.model(model));
    for (const c of cands) {
      const half = 30;
      shoot(
        `складка: грань ${c.facetLabel}`,
        c.refused ? `ОТБРОШЕНА: ${c.refused.slice(0, 90)}` : `кандидат ${c.type}, излом ${c.bendDeg.toFixed(0)}°, ступень ${c.stepFt.toFixed(2)} ft (допуск ${c.stepAllowedFt.toFixed(2)})`,
        `точек ${c.pointsLow}+${c.pointsHigh}`,
        () => {
          ov.model(model);
          ov.seg({ x: c.through.x - c.dir.x * half, y: c.through.y - c.dir.y * half }, { x: c.through.x + c.dir.x * half, y: c.through.y + c.dir.y * half }, c.refused ? [255, 0, 0] : [0, 255, 0], 2);
        },
      );
    }
    const rep = applyCreases(model, cands);
    const appliedN = rep.applied.length;
    model = rep.model;
    shoot("складки применены", appliedN ? `+${appliedN} разрез(а) · Euler ${rep.eulerBefore} → ${rep.eulerAfter}` : "no change — ни один кандидат не пережил гварды", numsOf(model, contourSqft), () => ov.model(model));
  }

  // ── 10. surgeries: diagnose, and say plainly that they do not edit ──
  const unrec = meas ? detectUnrecognisedFacets(model, meas) : [];
  shoot(
    "хирургии / слияния",
    `no change — детектор диагностирует, не правит: ${unrec.length} непризнанных граней${unrec.length ? ` (${unrec.map((u) => u.facet).join(", ")})` : ""}`,
    numsOf(model, contourSqft),
    () => {
      ov.model(model);
      if (meas) {
        const idx = buildIndexes(model);
        for (const u of unrec) {
          const f = model.faces.find((x) => String(x.designator || x.id) === u.facet);
          const r = f ? ringOf(f.lineIds, idx) : null;
          if (r && r.length >= 3) ov.ring(r.map((q) => ({ x: q.x, y: q.y })), [255, 0, 0], 1);
        }
      }
    },
  );

  // ── 11. penetrations ──
  const pen = model.faces.filter((f) => (f as { type?: string }).type === "ROOFPENETRATION");
  shoot("пенетрации", pen.length ? `${pen.length} шт.` : "no change — на V2-пути пенетрации не строятся (детект дымоходов живёт в продуктовом замере, вне этой ленты)", numsOf(model, contourSqft), () => ov.model(model));

  // ── 12. the final drawing ──
  shoot("финальный чертёж", `как уходит пользователю: ${model.faces.length} граней · ${Math.round(model.totals.areaSqft)} sf · ${model.totals.squares.toFixed(1)} sq`, numsOf(model, contourSqft), () => ov.model(model));

  // ── the strip page ──
  const html = `<!doctype html><meta charset="utf-8"><title>Лента ${job.slug}</title>
<style>body{background:#16181c;color:#e8e6df;font-family:Archivo,Arial,sans-serif;margin:0;padding:24px}
h1{font-size:20px}.s{color:#9a9da6;font-size:13px}
.strip{display:flex;gap:14px;overflow-x:auto;padding:16px 0}
.fr{flex:0 0 340px}.fr img{width:100%;border:1px solid #33363d}
.fr .t{font-weight:600;font-size:13px;margin:8px 0 2px}.fr .c{font-size:12px;color:#d9a63f}.fr .n{font-size:11px;color:#9a9da6;font-family:monospace}</style>
<h1>Покадровая лента · ${job.slug}</h1>
<div class="s">${frames.length} кадров · один кадр и масштаб · сгенерировано filmstrip.ts</div>
<div class="strip">${frames.map((f, i) => `<div class="fr"><img src="${f.file}" alt="${f.step}"><div class="t">${i + 1}. ${f.step}</div><div class="c">${f.changed}</div><div class="n">${f.nums}</div></div>`).join("")}</div>`;
  writeFileSync(join(OUT, "index.html"), html);
  console.log(`\n${frames.length} кадров → ${OUT}\\index.html`);
})();

/* Кольца нетронуты (приказ RM-A2AQ37): контур — обмер, его не правит
 * никакой слой. Повершинно: каждая КОНТУРНАЯ вершина кандидата (конец
 * ребра EAVE/RAKE, лежащего на кольце) обязана лежать на кольце Instant
 * (≤ 0.15 ft — сварочный бюджет), и все вершины кольца Instant обязаны
 * присутствовать в модели (≤ 0.7 ft — клетка сварки узлов).
 *
 *   npx tsx scripts/qa/roof/rings-check.ts        (exit 1 на любой FAIL)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";
loadHarnessEnv();
import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

const JOBS = [
  { key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa", fixture: undefined },
  { key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa", fixture: undefined },
  { key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa", fixture: undefined },
  { key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { key: "12117", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa", fixture: undefined },
];
let failures = 0;
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
  const res = buildMeasuredRoof({ dsm, mask, contour, transform: reg.applied ? reg.transform : { dxFt: 0, dyFt: 0, thetaDeg: 0 }, skeleton });
  const model = res.rejectedCandidate ?? res.model!;
  const ptById = new Map(model.points.map((p) => [p.id, p]));
  const distRing = (p: { x: number; y: number }): number => {
    let best = Infinity;
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
      best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
    }
    return best;
  };
  // 1. контурные рёбра модели — на кольце (концы в 0.15 ft)
  // шов (план-двойник с Δz ≥ переписи) — стена у кольца, не контур
  const twinKey = (p: { x: number; y: number }): string => `${Math.round(p.x * 2)}|${Math.round(p.y * 2)}`;
  const zsAt = new Map<string, number[]>();
  for (const p of model.points) {
    const k = twinKey(p);
    (zsAt.get(k) ?? zsAt.set(k, []).get(k)!).push(p.z);
  }
  const isSeamPt = (p: { x: number; y: number }): boolean => {
    const zs = zsAt.get(twinKey(p)) ?? [];
    return zs.length >= 2 && Math.max(...zs) - Math.min(...zs) >= 1.8;
  };
  let off = 0;
  for (const l of model.lines) {
    if (l.type !== "EAVE" && l.type !== "RAKE") continue;
    const a = ptById.get(l.aId)!;
    const b = ptById.get(l.bId)!;
    if (distRing(a) > 1 || distRing(b) > 1) continue; // внутренний край секции — не контур
    if (isSeamPt(a) || isSeamPt(b)) continue; // шов у кольца — стена, не контур
    if (distRing(a) > 0.15 || distRing(b) > 0.15) { off++; if (process.env.DBG_RINGS) console.log(`    [off] ${l.id} ${l.type} (${a.x.toFixed(2)},${a.y.toFixed(2)})d${distRing(a).toFixed(2)} → (${b.x.toFixed(2)},${b.y.toFixed(2)})d${distRing(b).toFixed(2)}`); }
  }
  // 2. вершины кольца присутствуют в модели
  let missing = 0;
  for (const v of contour) {
    let best = Infinity;
    for (const p of model.points) best = Math.min(best, Math.hypot(p.x - v.x, p.y - v.y));
    if (best > 0.7) missing++;
  }
  const ok = off === 0 && missing === 0;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${job.key}: контурных рёбер вне кольца ${off}, вершин кольца без модели ${missing}`);
}
console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

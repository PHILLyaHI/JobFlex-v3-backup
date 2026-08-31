/* Эталон расщепления уровней по прямому DSM-перепаду (§K8) — приказ
 * владельца 2026-08-30, отмашка vzOf/groupZ п.3.
 *
 *   npx tsx scripts/qa/roof/vzof-synth.ts        (exit 1 на любой FAIL)
 *
 * Стена с ВЫЦВЕТАЮЩИМ клифом: граница по x=0, перепад d(y) линейно
 * 2.5 ft (юг, y=−12) → 0 (север, y=+12). Закон: уровень (близнецы плана
 * с раздельными z) обязан сохраниться там, где перепад ≥ 2.0, и слиться
 * где ниже — фиктивных близнецов на гладкой части не рождается.
 * Запад: z = 16 + 0.3x; восток: z = 16 − 0.3x + d(y) — обе плоскости
 * честные (b-компонента востока от линейного d(y)).
 */
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import type { RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
const PX_M = 0.1;
const STEP_FT = PX_M * FT_PER_M;
const W = 140;
const H = 90;

let failures = 0;
const check = (label: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${got.toFixed(2)} (ожидание ${want}±${tol})`);
};

const cx = W / 2;
const cy = H / 2;
const dsm = new Float32Array(W * H);
const mask = new Float32Array(W * H);
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const i = py * W + px;
    const x = (px + 0.5 - cx) * STEP_FT;
    const y = (cy - py - 0.5) * STEP_FT;
    if (Math.abs(x) > 20 || Math.abs(y) > 12) { dsm[i] = 0; continue; }
    mask[i] = 1;
    const d = (2.5 * (12 - y)) / 24; // 2.5 на юге → 0 на севере
    const z = x < 0 ? 16 + 0.3 * x : 16 - 0.3 * x + d;
    dsm[i] = z / FT_PER_M;
  }
}

const contour: FootprintPoint[] = [
  { x: -20, y: -12 }, { x: 20, y: -12 }, { x: 20, y: 12 }, { x: -20, y: 12 },
];
const skeleton: RoofModel = {
  source: "synthetic",
  points: [], lines: [], faces: [],
  totals: { areaSqft: 0, squares: 0, footageByType: {} as never, bounds: { minX: -20, minY: -12, maxX: 20, maxY: 12 } },
} as unknown as RoofModel;

const res = buildMeasuredRoof({
  dsm: { width: W, height: H, pixelSizeM: PX_M, data: dsm } as Raster,
  mask: { width: W, height: H, pixelSizeM: PX_M, data: mask } as Raster,
  contour,
  transform: { dxFt: 0, dyFt: 0, thetaDeg: 0 },
  skeleton,
});
const model = res.rejectedCandidate ?? res.model;
if (!model) {
  console.log("FAIL: модель не построена — " + res.reasons.join("; "));
  process.exit(1);
}
console.log(`ВЫЦВЕТАЮЩИЙ КЛИФ — engine ${res.engine}`);
if (res.engine !== "measured-dsm") console.log("  причины: " + res.reasons.filter((r) => /fails|Euler/.test(r)).join(" | "));

if (process.env.DBG_PTS) {
  console.log(`точек ${model.points.length}, граней ${model.faces.length}, линий ${model.lines.length}`);
  for (const pt of model.points) console.log(`  pt (${pt.x.toFixed(1)},${pt.y.toFixed(1)},z${pt.z.toFixed(2)})`);
}
// близнецы плана: пары точек в одной 0.7-ft клетке с раздельными z
const twins: Array<{ x: number; y: number; dz: number }> = [];
const byCell = new Map<string, Array<{ x: number; y: number; z: number }>>();
for (const pt of model.points) {
  const k = `${Math.round(pt.x / 0.7)}|${Math.round(pt.y / 0.7)}`;
  (byCell.get(k) ?? byCell.set(k, []).get(k)!).push(pt);
}
for (const pts of byCell.values()) {
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const dz = Math.abs(pts[i].z - pts[j].z);
    if (dz >= 1.0) twins.push({ x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2, dz });
  }
}
// вдоль границы (|x| ≤ 2): юг (y ≤ −9, перепад ≥ 2.19) обязан нести
// уровень; север (y ≥ 0, перепад ≤ 1.25) — ни одного близнеца
const south = twins.filter((t) => Math.abs(t.x) <= 2 && t.y <= -9);
const north = twins.filter((t) => Math.abs(t.x) <= 2 && t.y >= 0);
check("близнецы уровня на юге (перепад ≥ 2.2): ≥ 1", south.length >= 1 ? 1 : 0, 1, 0);
check("фиктивные близнецы на севере (перепад ≤ 1.25): 0", north.length, 0, 0);
for (const t of [...south.slice(0, 3), ...north.slice(0, 3)]) console.log(`    близнец (${t.x.toFixed(1)},${t.y.toFixed(1)}) Δz ${t.dz.toFixed(2)}`);
// грани обязаны остаться плоскими (нет средних поперёк стены)
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
const idx = buildIndexes(model);
let worstDev = 0;
for (const f of model.faces) {
  const ring = ringOf(f.lineIds, idx);
  if (!ring || ring.length < 3) continue;
  let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0, n = 0;
  for (const p of ring) { sx += p.x; sy += p.y; sz += p.z; sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; sxz += p.x * p.z; syz += p.y * p.z; n++; }
  const det = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx);
  if (Math.abs(det) < 1e-9) continue;
  const a = (sxz * (syy * n - sy * sy) - sxy * (syz * n - sy * sz) + sx * (syz * sy - syy * sz)) / det;
  const b = (sxx * (syz * n - sy * sz) - sxz * (sxy * n - sx * sy) + sx * (sxy * sz - syz * sx)) / det;
  const c = (sz - a * sx - b * sy) / n;
  for (const p of ring) worstDev = Math.max(worstDev, Math.abs(a * p.x + b * p.y + c - p.z));
}
check("худшая вершинная невязка граней ≤ 0.9 (полстены)", worstDev <= 0.9 ? 0 : worstDev, 0, 0.001);

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

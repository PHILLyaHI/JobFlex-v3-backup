/* Эталон масс-границы по контуру (§K8) — класс 2 смотра RM-6KT8LW.
 *
 *   npx tsx scripts/qa/roof/lmass-synth.ts        (exit 1 на любой FAIL)
 *
 * Г-контур: верхняя масса 28×24 (конёк E-W, 6/12) + нижнее КРЫЛО 12×12
 * к востоку, плоское, на 3 ft ниже карниза. Ступень совпадает с изломом
 * контура (вертикаль x=14). Приёмка: вальма/границы верхней массы НЕ
 * тянутся в крыло — на линии x≈14 живёт край (близнецы уровня); у крыла
 * свои грани; G* кандидата — без изломов на границе.
 */
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import type { RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
const PX_M = 0.1;
const STEP_FT = PX_M * FT_PER_M;
const W = 160;
const H = 100;

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
    const inUpper = x >= -14 && x <= 14 && Math.abs(y) <= 12;
    const inWing = x > 14 && x <= 26 && Math.abs(y) <= 6;
    if (!inUpper && !inWing) { dsm[i] = 0; continue; }
    mask[i] = 1;
    // верхняя масса: конёк по y=0, 6/12; карниз 10 ft; крыло: плоское 7 ft
    const z = inUpper ? 10 + (12 - Math.abs(y)) * 0.5 : 7;
    dsm[i] = z / FT_PER_M;
  }
}
const contour: FootprintPoint[] = [
  { x: -14, y: -12 }, { x: 14, y: -12 }, { x: 14, y: -6 }, { x: 26, y: -6 },
  { x: 26, y: 6 }, { x: 14, y: 6 }, { x: 14, y: 12 }, { x: -14, y: 12 },
];
const skeleton: RoofModel = {
  source: "synthetic",
  points: [], lines: [], faces: [],
  totals: { areaSqft: 0, squares: 0, footageByType: {} as never, bounds: { minX: -14, minY: -12, maxX: 26, maxY: 12 } },
} as unknown as RoofModel;

const res = buildMeasuredRoof({
  dsm: { width: W, height: H, pixelSizeM: PX_M, data: dsm } as Raster,
  mask: { width: W, height: H, pixelSizeM: PX_M, data: mask } as Raster,
  contour,
  transform: { dxFt: 0, dyFt: 0, thetaDeg: 0 },
  skeleton,
});
const model = res.rejectedCandidate ?? res.model;
if (!model) { console.log("FAIL: модели нет — " + res.reasons.join("; ")); process.exit(1); }
console.log(`Г-КОНТУР С НИЖНИМ КРЫЛОМ — engine ${res.engine}`);
const ptById = new Map(model.points.map((p) => [p.id, p]));
// 1. ни одна линия ВЕРХНЕЙ массы (z > 8.5 на обоих концах) не заходит в крыло дальше x=15
let intrude = 0;
for (const l of model.lines) {
  const a = ptById.get(l.aId)!;
  const b = ptById.get(l.bId)!;
  if (a.z > 8.5 && b.z > 8.5 && (a.x > 15.5 || b.x > 15.5)) { intrude++; console.log(`    вторжение: ${l.id} ${l.type} (${a.x.toFixed(1)},${a.y.toFixed(1)},z${a.z.toFixed(1)})→(${b.x.toFixed(1)},${b.y.toFixed(1)},z${b.z.toFixed(1)})`); }
}
check("линий верхней массы в крыле: 0", intrude, 0, 0);
// 2. близнецы уровня на границе x≈14 (край массы над крылом): ≥ 1 пара Δz ≥ 2
let twins = 0;
const byCell = new Map<string, Array<{ z: number }>>();
for (const pt of model.points) {
  if (Math.abs(pt.x - 14) > 1.2 || Math.abs(pt.y) > 6.5) continue;
  const k = `${Math.round(pt.x / 0.7)}|${Math.round(pt.y / 0.7)}`;
  (byCell.get(k) ?? byCell.set(k, []).get(k)!).push(pt);
}
for (const pts of byCell.values()) for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.abs(pts[i].z - pts[j].z) >= 2) twins++;
check("близнецы уровня на крае x=14: ≥ 1", twins >= 1 ? 1 : 0, 1, 0);
// 3. у крыла своя грань на своём уровне (z ~7): есть точка z < 8 при x > 15
const wingPts = model.points.filter((p) => p.x > 15 && p.z < 8).length;
check("вершины крыла на своём уровне (z<8, x>15): ≥ 2", wingPts >= 2 ? 2 : wingPts, 2, 0);

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

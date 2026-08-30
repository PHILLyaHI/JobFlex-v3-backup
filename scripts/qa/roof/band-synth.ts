/* Эталон полосы краевой смеси (§K8) — приказ владельца 2026-08-30.
 *
 *   npx tsx scripts/qa/roof/band-synth.ts        (exit 1 на любой FAIL)
 *
 * Двускатка 40×24 ft, конёк E-W по y=0, уклоны 6/12. Вдоль внешнего
 * контура — полоса шумовых пикселей (±1.5 ft, ширина ~2 px): кайма
 * кровля+земля. Приёмка: шум каймы НЕ рождает hip/valley-крошку у края
 * (складка, целиком живущая в 2 ft от контура), конёк живёт (~40 ft),
 * грамматика на истинном контуре — 0.
 */
import { buildMeasuredRoof } from "@/lib/roofRecon/measuredRoof";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import type { RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
const PX_M = 0.1; // живое разрешение Solar DSM (~0.33 ft)
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
let noiseK = 0;
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const i = py * W + px;
    const x = (px + 0.5 - cx) * STEP_FT;
    const y = (cy - py - 0.5) * STEP_FT;
    if (Math.abs(x) > 20 || Math.abs(y) > 12) { dsm[i] = 0; continue; }
    mask[i] = 1;
    let z = 10 + (12 - Math.abs(y)) * 0.5; // конёк по y=0
    // кайма: внешние ~2 px — детерминированный шум ±1.5 ft
    const edgeFt = Math.min(20 - Math.abs(x), 12 - Math.abs(y));
    if (edgeFt <= 2 * STEP_FT) z += ((noiseK++ % 3) - 1) * 1.5;
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
const model = res.rejectedCandidate ?? res.model; // судим кандидата, заглушка скелета не модель
if (!model) {
  console.log("FAIL: модель не построена — " + res.reasons.join("; "));
  process.exit(1);
}
console.log(`ДВУСКАТКА С ШУМНОЙ КАЙМОЙ — engine ${res.engine}`);
if (res.engine !== "measured-dsm") console.log("  причины: " + res.reasons.join(" | "));
const ptById = new Map(model.points.map((p) => [p.id, p]));
const distRing = (p: { x: number; y: number }): number =>
  Math.min(20 - Math.abs(p.x), 12 - Math.abs(p.y));
let crumb = 0;
let ridgeFt = 0;
for (const l of model.lines) {
  const a = ptById.get(l.aId)!;
  const b = ptById.get(l.bId)!;
  if (l.type === "RIDGE") ridgeFt += l.lengthFt;
  if ((l.type === "HIP" || l.type === "VALLEY") && distRing(a) <= 2 && distRing(b) <= 2) crumb += 1;
}
check("hip/valley-крошка у края", crumb, 0, 0);
check("конёк, ft", ridgeFt, 40, 4);
const v = validateRoofInvariants(model, { footprint: contour.map((p) => [p.x, p.y] as [number, number]) });
const g = v.results.filter((r) => r.level === "error" && r.id.startsWith("G"));
for (const r of g) console.log(`  [${r.id}] ${(r as { msg?: string }).msg}`);
check("G-нарушений", g.length, 0, 0);

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

/* Эталон маски пенетраций (§K8: метрика проверяется на входе с известным
 * ответом) — приказ владельца 2026-08-30.
 *
 *   npx tsx scripts/qa/roof/pen-synth.ts        (exit 1 на любой FAIL)
 *
 * A. Скат 6/12 размером 30×24 ft с квадратом трубы 3×3 ft (+4 ft) посреди:
 *    плоскость обязана выйти чистой (один кластер, уклон 6, без осколков),
 *    труба — в маске пенетраций (штриховка в оверлее живых прогонов).
 * B. Тот же скат с ДОРМЕРОМ 6×5 ft (+2.5 ft, 30 sf > minFacetSqft): блоб
 *    больше грани — архитектура, в маску НЕ попадает, кластеров два.
 */
import { reconstructRoof } from "@/lib/roofRecon";
const FT_PER_M = 3.28084;
import type { Raster } from "@/lib/solar";

const PX_M = 0.5; // stepFt ≈ 1.64
const STEP_FT = PX_M * FT_PER_M;
const W = 40;
const H = 36;

let failures = 0;
const check = (label: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${got.toFixed(2)} (ожидание ${want}±${tol})`);
};

/** Скат: z растёт на юг (6/12), земля 0, крыша с 10 ft. */
function makeScene(bump: { x0: number; y0: number; wFt: number; hFt: number; dzFt: number } | null): { dsm: Raster; mask: Raster } {
  const dsm = new Float32Array(W * H);
  const mask = new Float32Array(W * H);
  const cx = W / 2;
  const cy = H / 2;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      const x = (px + 0.5 - cx) * STEP_FT;
      const y = (cy - py - 0.5) * STEP_FT;
      const onRoof = Math.abs(x) <= 15 && Math.abs(y) <= 12;
      if (!onRoof) { dsm[i] = 0; continue; }
      mask[i] = 1;
      let z = 10 + (12 - y) * 0.5; // 6/12 к югу
      if (bump && x >= bump.x0 && x < bump.x0 + bump.wFt && y >= bump.y0 && y < bump.y0 + bump.hFt) z += bump.dzFt;
      dsm[i] = z / FT_PER_M;
    }
  }
  return {
    dsm: { width: W, height: H, pixelSizeM: PX_M, data: dsm } as Raster,
    mask: { width: W, height: H, pixelSizeM: PX_M, data: mask } as Raster,
  };
}

// ── A. труба 3×3 ft ──
{
  console.log("ТРУБА 3×3 ft +4 ft посреди ската — плоскость чистая, труба в маске");
  const { dsm, mask } = makeScene({ x0: -1.5, y0: -1.5, wFt: 3, hFt: 3, dzFt: 4 });
  const r = reconstructRoof(dsm as never, mask as never);
  const d = r.diagnostics;
  check("кластеров", d.clusters, 1, 0);
  check("пикселей пенетраций (≥1)", d.penetrationPx.length >= 1 ? 1 : 0, 1, 0);
  // все пиксели трубы — в маске
  const cx = W / 2, cy = H / 2;
  let chim = 0, caught = 0;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const x = (px + 0.5 - cx) * STEP_FT;
    const y = (cy - py - 0.5) * STEP_FT;
    if (x >= -1.5 && x < 1.5 && y >= -1.5 && y < 1.5) {
      chim++;
      if (d.penetrationPx.includes(py * W + px)) caught++;
    }
  }
  check("покрытие трубы маской", caught / Math.max(1, chim), 1, 0.01);
  // чистота плоскости: уклон кластера = 6/12
  const pl = (d as unknown as { clusterPlanes: Array<{ a: number; b: number }> }).clusterPlanes[0];
  check("уклон/12", Math.hypot(pl.a, pl.b) * 12, 6, 0.3);
}

// ── B. дормер 6×5 ft — архитектура, маска её не ест ──
// (кластеризация 11-пиксельного дормера — не предмет маски; предмет —
// чтобы блоб больше/длиннее трубы в маску не попал, включая дуги обода)
{
  console.log("ДОРМЕР 6×5 ft +2.5 ft (30 sf > minFacetSqft) — архитектура, маска пуста");
  const { dsm, mask } = makeScene({ x0: -3, y0: -2.5, wFt: 6, hFt: 5, dzFt: 2.5 });
  const r = reconstructRoof(dsm as never, mask as never);
  const d = r.diagnostics;
  check("пикселей пенетраций", d.penetrationPx.length, 0, 0);
}
// ── C. ступень массы во всю ширину (+3 ft) — ребро не в маске ──
{
  console.log("СТУПЕНЬ ВО ВСЮ ШИРИНУ +3 ft — обод настоящей стены маска не трогает");
  const { dsm, mask } = makeScene({ x0: -15, y0: -12, wFt: 30, hFt: 8, dzFt: 3 });
  const r = reconstructRoof(dsm as never, mask as never);
  const d = r.diagnostics;
  check("пикселей пенетраций", d.penetrationPx.length, 0, 0);
}

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

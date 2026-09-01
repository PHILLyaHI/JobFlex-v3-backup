/* Эталон терминала у рваной кромки (§K8, отмашка 2026-08-31 «состав
 * колец у рваной кромки») — ручные числа.
 *
 *   npx tsx scripts/qa/roof/edgeterm-synth.ts    (exit 1 на любой FAIL)
 *
 * Случай 1: граница двух кластеров x≈0 (стена, d=2.5) с РВАНОЙ маской у
 * северной кромки: в верхних 5 ft граница шумит ±1.5 ft. Манхэттен
 * стены строит у кромки лесенку — терминал у рваной кромки обязан
 * заменить её ПРЯМЫМ звеном до кольца: интерьерных вершин цепи с
 * |x| > 1 в полосе последних 4 ft у кромки не остаётся.
 *
 * Случай 2 (контроль): настоящий ВЫРЕЗ контура (кольцо с зубом) не
 * заглаживается — кольцевые рёбра ячеек в точности несут вырез.
 */
import { buildRegionCells } from "@/lib/roofRecon/regionCells";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
const PX_M = 0.1;
const STEP_FT = PX_M * FT_PER_M;
const W = 120;
const H = 100;
const cx = W / 2;
const cy = H / 2;

let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${detail}`);
};

// детерминированный «рваный» сдвиг границы у кромки
const jag = (y: number): number => (y > 9 ? 1.5 * Math.sin(y * 9.7) : 0);

// ── Случай 1: рваная граница у кромки ──
{
  const labels = new Int32Array(W * H).fill(-1);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5 - cx) * STEP_FT;
      const y = (cy - py - 0.5) * STEP_FT;
      if (Math.abs(x) > 16 || Math.abs(y) > 14) continue;
      labels[py * W + px] = x < jag(y) ? 0 : 1;
    }
  }
  const ring: FootprintPoint[] = [
    { x: -16, y: -14 }, { x: 16, y: -14 }, { x: 16, y: 14 }, { x: -16, y: 14 },
  ];
  const rc = buildRegionCells({
    labels,
    regionKind: ["cluster", "cluster"],
    clusterOf: [0, 1],
    width: W,
    height: H,
    stepFt: STEP_FT,
    contour: ring,
    lines: [],
    minCellSqft: 15,
    wallDropOf: () => 2.5,
    wallSidesOf: () => ({ d: 2.5, zHi: 12.5, zLo: 10 }),
  });
  // вершины границы (|x| ≤ 3) в полосе последних 4 ft у кромки
  const offenders: FootprintPoint[] = [];
  for (const cell of rc.cells) {
    for (const e of cell.edges) {
      if (e.prov === "contour") continue;
      for (const q of [e.a, e.b]) {
        if (Math.abs(q.x) > 1 && Math.abs(q.x) <= 3 && q.y > 10 && q.y < 13.9) offenders.push(q);
      }
    }
  }
  console.log(`СЛУЧАЙ 1 — рваная граница у кромки (±1.5): ячеек ${rc.cells.length}, лесенка у кромки: вершин-нарушителей ${offenders.length}`);
  check("лесенки у кромки нет (|x|>1 в последних 4 ft — 0 вершин)", offenders.length === 0,
    offenders.length ? offenders.map((q) => `(${q.x.toFixed(1)},${q.y.toFixed(1)})`).slice(0, 4).join(" ") : "чисто");
}

// ── Случай 2 (контроль): настоящий вырез контура не заглаживается ──
{
  const notch: FootprintPoint[] = [
    { x: -16, y: -14 }, { x: 16, y: -14 }, { x: 16, y: 14 },
    { x: 4, y: 14 }, { x: 4, y: 8 }, { x: -4, y: 8 }, { x: -4, y: 14 },
    { x: -16, y: 14 },
  ];
  const inNotchRing = (x: number, y: number): boolean => {
    if (Math.abs(x) > 16 || Math.abs(y) > 14) return false;
    if (Math.abs(x) < 4 && y > 8) return false; // вырез
    return true;
  };
  const labels = new Int32Array(W * H).fill(-1);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5 - cx) * STEP_FT;
      const y = (cy - py - 0.5) * STEP_FT;
      if (!inNotchRing(x, y)) continue;
      labels[py * W + px] = x < 0 ? 0 : 1;
    }
  }
  const rc = buildRegionCells({
    labels,
    regionKind: ["cluster", "cluster"],
    clusterOf: [0, 1],
    width: W,
    height: H,
    stepFt: STEP_FT,
    contour: notch,
    lines: [],
    minCellSqft: 15,
    wallDropOf: () => 0.4,
    wallSidesOf: () => ({ d: 0.4, zHi: 10.4, zLo: 10 }),
  });
  // рёбра ячеек обязаны нести вырез: вершины у (±4, 8..14) и (0..±4, 8)
  const nearPt = (x0: number, y0: number): number => {
    let best = Infinity;
    for (const cell of rc.cells) for (const e of cell.edges) for (const q of [e.a, e.b]) best = Math.min(best, Math.hypot(q.x - x0, q.y - y0));
    return best;
  };
  console.log(`СЛУЧАЙ 2 — вырез контура: ячеек ${rc.cells.length}`);
  check("угол выреза (-4,8) жив (≤0.2)", nearPt(-4, 8) <= 0.2, `d=${nearPt(-4, 8).toFixed(2)}`);
  check("угол выреза (4,8) жив (≤0.2)", nearPt(4, 8) <= 0.2, `d=${nearPt(4, 8).toFixed(2)}`);
  check("плечо выреза (-4,14) живо (≤0.2)", nearPt(-4, 14) <= 0.2, `d=${nearPt(-4, 14).toFixed(2)}`);
}

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

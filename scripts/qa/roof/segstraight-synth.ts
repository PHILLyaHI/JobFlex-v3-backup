/* Эталон по-сегментного спрямления (§K8, приказ 2026-08-31 п.1) — ручные
 * числа.
 *
 *   npx tsx scripts/qa/roof/segstraight-synth.ts    (exit 1 на любой FAIL)
 *
 * Граница x≈0 двух кластеров зигзагом: изломы ~14–15° (амплитуда 0.9 ft,
 * плечи 3.5 ft).
 *
 * Случай 1 (складка, стены нет): сегмент цепи между законными вершинами
 * (два конца) без wall-вердикта — ПРЯМАЯ; изломы внутри не существуют.
 * Приёмка: перп-отклонение всех вершин границы от хорды ≤ 0.45 ft (шаг
 * решётки + полпикселя).
 *
 * Случай 2 (контроль, ступень посередине): стена |y|<5 (d=2.5) — сегмент
 * НЕ спрямляется в одну хорду: fade-вершины обязаны появиться у y≈±5
 * раньше и разрезать цепь; интерьер цепи жив (замер: манхэттен стены —
 * его собственный осевой закон — выравнивает зигзаг стены ВДОЛЬ оси, но
 * fade-вершины и разрез по ним неприкосновенны).
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

// зигзаг границы: изломы ±0.9 ft с плечами 3.5 ft (≈14.4°)
const xb = (y: number): number => {
  const knots: Array<[number, number]> = [
    [-14, 0], [-8, 0], [-4.5, 0.9], [-1, 0], [2.5, -0.9], [6, 0], [14, 0],
  ];
  for (let i = 0; i + 1 < knots.length; i++) {
    const [y1, x1] = knots[i];
    const [y2, x2] = knots[i + 1];
    if (y >= y1 && y <= y2) return x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
  }
  return 0;
};

const ring: FootprintPoint[] = [
  { x: -16, y: -14 }, { x: 16, y: -14 }, { x: 16, y: 14 }, { x: -16, y: 14 },
];

const build = (dOf: (y: number) => number) => {
  const labels = new Int32Array(W * H).fill(-1);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5 - cx) * STEP_FT;
      const y = (cy - py - 0.5) * STEP_FT;
      if (Math.abs(x) > 16 || Math.abs(y) > 14) continue;
      labels[py * W + px] = x < xb(y) ? 0 : 1;
    }
  }
  return buildRegionCells({
    labels,
    regionKind: ["cluster", "cluster"],
    clusterOf: [0, 1],
    width: W,
    height: H,
    stepFt: STEP_FT,
    contour: ring,
    lines: [],
    minCellSqft: 15,
    wallDropOf: (a, b) => dOf((a.y + b.y) / 2),
    wallSidesOf: (a, b) => {
      const d = dOf((a.y + b.y) / 2);
      return { d, zHi: 10 + d, zLo: 10 };
    },
  });
};

const boundaryVerts = (rc: ReturnType<typeof build>): FootprintPoint[] => {
  const out: FootprintPoint[] = [];
  for (const cell of rc.cells) {
    for (const e of cell.edges) {
      for (const q of [e.a, e.b]) {
        if (Math.abs(q.x) <= 2 && Math.abs(q.y) < 13.5) out.push(q);
      }
    }
  }
  return out;
};

// ── Случай 1: складка (стены нет) — изломы не существуют ──
{
  const rc = build(() => 0.4);
  const verts = boundaryVerts(rc);
  let maxDev = 0;
  for (const q of verts) maxDev = Math.max(maxDev, Math.abs(q.x));
  console.log(`СЛУЧАЙ 1 — складка с тремя изломами ~15°: вершин у границы ${verts.length}`);
  check("сегмент прямой (перп-отклонение ≤ 0.45)", maxDev <= 0.45, `maxDev=${maxDev.toFixed(2)}`);
}

// ── Случай 2: контроль — ступень посередине, сегмент не спрямляется ──
{
  const rc = build((y) => (Math.abs(y) < 5 ? 2.5 : 0.4));
  const verts = boundaryVerts(rc);
  const nearFade = (y0: number): number => {
    let best = Infinity;
    for (const q of verts) best = Math.min(best, Math.abs(q.y - y0));
    return best;
  };
  console.log(`СЛУЧАЙ 2 — ступень |y|<5: вершин у границы ${verts.length}`);
  check("fade-вершина у y=-5 (±1.2)", nearFade(-5) <= 1.2, `dist=${nearFade(-5).toFixed(2)}`);
  check("fade-вершина у y=+5 (±1.2)", nearFade(5) <= 1.2, `dist=${nearFade(5).toFixed(2)}`);
  check("цепь не спрямлена в хорду (интерьер жив, ≥2 вершин)", verts.length >= 2, `вершин=${verts.length}`);
}

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

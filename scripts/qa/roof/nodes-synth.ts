/* Эталон «узлов, оставленных трассой» (§K8) — приказ владельца 2026-08-30, п.4.
 *
 *   npx tsx scripts/qa/roof/nodes-synth.ts        (exit 1 на любой FAIL)
 *
 * A. ТЕРМИНАЛ: трасса границы пары уходит от несущей на 4 ft у кольца
 *    (изгиб к северу), несущая — x=0. Узел обязан встать в support∩кольцо:
 *    граница выходит на северное кольцо при |x| ≤ 0.7 (не в (−4,12)).
 * B. ФИКТИВНЫЙ СРЕДИННЫЙ УЗЕЛ: два пробега одной пары через блоб третьего
 *    региона (< пола ячейки — растворится), стык у x=+2. Узел между
 *    пробегами обязан лечь на несущую: все вершины границы |x| ≤ 0.7.
 */
import { buildRegionCells, type RegionLine } from "@/lib/roofRecon/regionCells";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
const PX_M = 0.1;
const STEP_FT = PX_M * FT_PER_M;
const W = 120;
const H = 80;
const cx = W / 2;
const cy = H / 2;

let failures = 0;
const check = (label: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${got.toFixed(2)} (ожидание ${want}±${tol})`);
};

const ring: FootprintPoint[] = [
  { x: -18, y: -12 }, { x: 18, y: -12 }, { x: 18, y: 12 }, { x: -18, y: 12 },
];

const run = (title: string, bnd: (y: number) => number, blob: boolean, lineB: FootprintPoint) => {
  const labels = new Int32Array(W * H).fill(-1);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5 - cx) * STEP_FT;
      const y = (cy - py - 0.5) * STEP_FT;
      if (Math.abs(x) > 18 || Math.abs(y) > 12) continue;
      let r = x < bnd(y) ? 0 : 1;
      if (blob && Math.hypot(x - 1.2, y) <= 0.9) r = 2;
      labels[py * W + px] = r;
    }
  }
  const lines: RegionLine[] = [
    { a: { x: 0, y: -12 }, b: lineB, between: [0, 1], sigmaPerpFt: 0.3, gradDiffPerFt: 0.5, snapCorridorFt: Number.POSITIVE_INFINITY },
  ];
  const rc = buildRegionCells({
    labels,
    regionKind: blob ? ["cluster", "cluster", "cluster"] : ["cluster", "cluster"],
    clusterOf: blob ? [0, 1, 2] : [0, 1],
    width: W,
    height: H,
    stepFt: STEP_FT,
    contour: ring,
    lines,
    minCellSqft: 15,
  });
  console.log(`${title}: ячеек ${rc.cells.length}, euler ${rc.euler}`);
  // все вершины границы пары 0|1 (не контур)
  const bx: number[] = [];
  let northX: number | null = null;
  for (const cell of rc.cells) {
    for (const e of cell.edges) {
      if (e.prov === "contour") continue;
      for (const p of [e.a, e.b]) {
        bx.push(Math.abs(p.x));
        if (p.y > 11.3 && (northX === null || Math.abs(p.x) < Math.abs(northX))) northX = p.x;
      }
    }
  }
  return { bx, northX, euler: rc.euler };
};

// ── A. терминал: трасса изгибается к (−4,12) у северного кольца ──
{
  const r = run("A. ТЕРМИНАЛ (трасса уходит на 4 ft)", (y) => (y <= 6 ? 0 : (-4 * (y - 6)) / 6), false, { x: 0, y: 6 });
  check("Euler", r.euler, 1, 0);
  check("выход границы на северное кольцо, |x|", r.northX === null ? 99 : Math.abs(r.northX), 0, 0.7);
}

// ── B. фиктивный срединный узел: два пробега через блоб ──
{
  const r = run("B. ДВА ПРОБЕГА ЧЕРЕЗ БЛОБ (стык у x≈+2)", () => 0, true, { x: 0, y: 12 });
  check("Euler", r.euler, 1, 0);
  const worst = Math.max(...r.bx);
  check("худший |x| вершин границы (узел на несущей)", worst, 0, 0.7);
}

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

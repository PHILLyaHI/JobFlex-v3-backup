/* Эталон fade-вершин (§K8, приказ 2026-08-31 п.3) — ручные числа.
 *
 *   npx tsx scripts/qa/roof/fade-synth.ts        (exit 1 на любой FAIL)
 *
 * Граница x=0 с ДВУМЯ сменами wallStrong: стена (d=2.5, y<−5) → складка
 * (d=0.4, |y|≤5) → стена (d=2.5, y>5). Приёмка: цепь границы несёт ДВЕ
 * fade-вершины у y≈±5 (середина гистерезисного перехода, ±1.2 ft — шаг
 * станций и полшага перехода), DP их держит (вершины присутствуют в
 * рёбрах клеток).
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
const check = (label: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${got.toFixed(2)} (ожидание ${want}±${tol})`);
};

const labels = new Int32Array(W * H).fill(-1);
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const x = (px + 0.5 - cx) * STEP_FT;
    const y = (cy - py - 0.5) * STEP_FT;
    if (Math.abs(x) > 16 || Math.abs(y) > 14) continue;
    labels[py * W + px] = x < 0 ? 0 : 1;
  }
}
const ring: FootprintPoint[] = [
  { x: -16, y: -14 }, { x: 16, y: -14 }, { x: 16, y: 14 }, { x: -16, y: 14 },
];
const dOf = (y: number): number => (Math.abs(y) > 5 ? 2.5 : 0.4);
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
  wallDropOf: (a, b) => dOf((a.y + b.y) / 2),
  wallSidesOf: (a, b) => {
    const d = dOf((a.y + b.y) / 2);
    return { d, zHi: 10 + d, zLo: 10 };
  },
});
// вершины рёбер клеток у границы x≈0
const verts: FootprintPoint[] = [];
for (const cell of rc.cells) {
  for (const e of cell.edges) {
    for (const q of [e.a, e.b]) if (Math.abs(q.x) <= 1) verts.push(q);
  }
}
const near = (y0: number): number => {
  let best = Infinity;
  for (const q of verts) best = Math.min(best, Math.abs(q.y - y0));
  return best;
};
console.log(`ГРАНИЦА С ДВУМЯ СМЕНАМИ wallStrong: клеток ${rc.cells.length}, вершин у границы ${verts.length}`);
check("fade-вершина у y=-5 (±1.2)", near(-5), 0, 1.2);
check("fade-вершина у y=+5 (±1.2)", near(5), 0, 1.2);
// профиль честен: три участка
const prs = rc.wallProfiles.get("0|1") ?? [];
const sts = prs.flatMap((pr) => pr.stations);
const southWall = sts.filter((st) => st.y < -6 && st.wall).length / Math.max(1, sts.filter((st) => st.y < -6).length);
const midWall = sts.filter((st) => Math.abs(st.y) < 4 && st.wall).length;
const northWall = sts.filter((st) => st.y > 6 && st.wall).length / Math.max(1, sts.filter((st) => st.y > 6).length);
check("юг — стена (доля wall)", southWall, 1, 0.01);
check("середина — складка (wall станций 0)", midWall, 0, 0);
check("север — стена (доля wall)", northWall, 1, 0.01);

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

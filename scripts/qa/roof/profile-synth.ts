/* Эталон WallProfile (§K8, приказ 2026-08-31 п.4) — ручные числа.
 *
 *   npx tsx scripts/qa/roof/profile-synth.ts     (exit 1 на любой FAIL)
 *
 * Граница двух регионов по x=0 (y от −12 до +12), перепад задан руками:
 * d(y) = 2.5 на юге → 1.2 в середине → 0 на севере (линейно по третям).
 * Приёмка:
 *  A. станции юга (d ≥ 2.0) — wall (ядро гистерезиса);
 *  B. гистерезис: станции 1.8–2.0, СМЕЖНЫЕ с ядром, прирастают к wall;
 *  C. станции d < 1.8 — НИКОГДА не wall (середина 1.2 и север 0 — crease);
 *  D. wallFrac профиля соответствует доле стены (~юг);
 *  E. уровни станций ядра: zHi−zLo = d (прямозамерные).
 */
import { buildRegionCells } from "@/lib/roofRecon/regionCells";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
const PX_M = 0.1;
const STEP_FT = PX_M * FT_PER_M;
const W = 120;
const H = 90;
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
    if (Math.abs(x) > 16 || Math.abs(y) > 12) continue;
    labels[py * W + px] = x < 0 ? 0 : 1;
  }
}
const ring: FootprintPoint[] = [
  { x: -16, y: -12 }, { x: 16, y: -12 }, { x: 16, y: 12 }, { x: -16, y: 12 },
];
// перепад руками: 2.5 (юг, y=−12) → 1.2 (y=0) → 0 (y=+12), кусочно-линейно
const dOf = (y: number): number => (y <= 0 ? 2.5 + ((y + 12) / 12) * (1.2 - 2.5) : 1.2 + (y / 12) * (0 - 1.2));
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
const prs = rc.wallProfiles.get("0|1") ?? [];
const stations = prs.flatMap((pr) => pr.stations).filter((st) => Math.abs(st.x) < 2);
console.log(`ПРОФИЛЬ x=0: цепей ${prs.length}, станций ${stations.length}`);
if (!stations.length) { console.log("FAIL: станций нет"); process.exit(1); }
// A. ядро: d≥2.0 → wall
const core = stations.filter((st) => st.d >= 2.0);
const coreWall = core.filter((st) => st.wall).length;
check("A. ядро (d≥2.0) всё wall", core.length ? coreWall / core.length : 0, 1, 0);
// B. гистерезис: 1.8–2.0 смежные с ядром — wall (мерим долю)
const hyst = stations.filter((st) => st.d >= 1.8 && st.d < 2.0);
const hystWall = hyst.filter((st) => st.wall).length;
check("B. гистерезис (1.8–2.0) прирос к ядру", hyst.length ? hystWall / hyst.length : 1, 1, 0.01);
// C. d<1.8 — не wall никогда
const low = stations.filter((st) => st.d < 1.8);
const lowWall = low.filter((st) => st.wall).length;
check("C. ниже удержания (d<1.8) wall = 0", lowWall, 0, 0);
// D. wallFrac ≈ доля границы с d≥1.8: y от −12 до точки d=1.8:
//    2.5+t·(−1.3)=1.8 → t=0.538 → y*≈−5.54; доля = (12−5.54)/24 ≈ 0.27
const frac = prs.reduce((s2, pr) => s2 + pr.wallFrac * pr.stations.length, 0) / prs.reduce((s2, pr) => s2 + pr.stations.length, 0);
check("D. wallFrac ≈ 0.27", frac, 0.27, 0.06);
// E. уровни ядра прямозамерные: zHi−zLo = d
const bad = core.filter((st) => st.zHi === undefined || Math.abs((st.zHi - (st.zLo ?? 0)) - st.d) > 1e-6).length;
check("E. уровни станций ядра: zHi−zLo = d", bad, 0, 0);

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

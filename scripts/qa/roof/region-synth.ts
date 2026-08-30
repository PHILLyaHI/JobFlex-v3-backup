/* Region-cells engine on synthetic label maps with hand-computed answers
 * (§K8) — the two new cases the owner ordered.
 *
 *   npx tsx scripts/qa/roof/region-synth.ts        (exit 1 on any FAIL)
 *
 * A. Three lines meeting at a node: Y-split of a 50×50 square into a 1250-sf
 *    half and two 625-sf quarters; the node resolves to the least-squares
 *    intersection (0,0) of the three controlling supports; boundaries fully
 *    straightened.
 * B. A ragged boundary with NO measured line: the zigzag stays (measured by
 *    pixel membership), cells match their pixel counts, and the shared
 *    boundary keeps the total tiling exact.
 */
import { buildRegionCells } from "@/lib/roofRecon/regionCells";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

const W = 60;
const H = 60;
const STEP = 1;
const RING: FootprintPoint[] = [{ x: -25, y: -25 }, { x: 25, y: -25 }, { x: 25, y: 25 }, { x: -25, y: 25 }];

let failures = 0;
const check = (label: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${got.toFixed(2)} (ожидание ${want}±${tol})`);
};

const centerOf = (ix: number, iy: number) => ({ x: ix + 0.5 - W / 2, y: H / 2 - iy - 0.5 });
const insideRing = (p: FootprintPoint) => p.x > -25 && p.x < 25 && p.y > -25 && p.y < 25;

// ── A. сход трёх линий в узел ──
{
  console.log("СХОД ТРЁХ ЛИНИЙ — A 1250, B 625, C 625, узел в (0,0), всё спрямлено");
  const labels = new Int32Array(W * H).fill(-1);
  for (let iy = 0; iy < H; iy++) {
    for (let ix = 0; ix < W; ix++) {
      const p = centerOf(ix, iy);
      if (!insideRing(p)) continue;
      labels[iy * W + ix] = p.x < 0 ? 0 : p.y >= 0 ? 1 : 2;
    }
  }
  const r = buildRegionCells({
    labels,
    regionKind: ["cluster", "cluster", "cluster"],
    clusterOf: [0, 1, 2],
    width: W, height: H, stepFt: STEP,
    contour: RING,
    lines: [
      { a: { x: 0, y: 2 }, b: { x: 0, y: 20 }, between: [0, 1], sigmaPerpFt: 0.3, gradDiffPerFt: 1 },
      { a: { x: 0, y: -20 }, b: { x: 0, y: -3 }, between: [0, 2], sigmaPerpFt: 0.3, gradDiffPerFt: 1 },
      { a: { x: 2, y: 0 }, b: { x: 22, y: 0 }, between: [1, 2], sigmaPerpFt: 0.3, gradDiffPerFt: 1 },
    ],
  });
  check("ячеек", r.cells.length, 3, 0);
  check("Euler", r.euler, 1, 0);
  check("замощение %", r.tilingPct, 0, 0.1);
  const areas = r.cells.map((c) => c.areaSqft).sort((a, b) => a - b);
  check("B sf", areas[0], 625, 3);
  check("C sf", areas[1], 625, 3);
  check("A sf", areas[2], 1250, 3);
  const shareStraight = r.straightenedFt / Math.max(1e-9, r.straightenedFt + r.raggedFt);
  check("доля спрямления", shareStraight, 1, 0.05);
  // the multi-way node: some cell must carry a vertex at (0,0)
  const nodeDist = Math.min(...r.cells.flatMap((c) => c.ring.map((p) => Math.hypot(p.x, p.y))));
  check("узел в (0,0), ft", nodeDist, 0, 0.15);
  for (const line of r.report) console.log(`    – ${line}`);
}

// ── B. рваная граница без линии ──
{
  console.log("РВАНАЯ ГРАНИЦА БЕЗ ЛИНИИ — зигзаг ±2 остаётся, ячейки равны счёту пикселей");
  const labels = new Int32Array(W * H).fill(-1);
  let leftPx = 0;
  let rightPx = 0;
  for (let iy = 0; iy < H; iy++) {
    const zig = iy % 8 < 4 ? 2 : -2;
    for (let ix = 0; ix < W; ix++) {
      const p = centerOf(ix, iy);
      if (!insideRing(p)) continue;
      const region = p.x < zig ? 0 : 1;
      labels[iy * W + ix] = region;
      if (region === 0) leftPx++;
      else rightPx++;
    }
  }
  const r = buildRegionCells({
    labels,
    regionKind: ["cluster", "cluster"],
    clusterOf: [0, 1],
    width: W, height: H, stepFt: STEP,
    contour: RING,
    lines: [],
  });
  check("ячеек", r.cells.length, 2, 0);
  check("Euler", r.euler, 1, 0);
  check("замощение %", r.tilingPct, 0, 0.1);
  check("спрямлено ft", r.straightenedFt, 0, 0.01);
  const rag = r.raggedFt;
  check("рваная граница длиннее высоты (≥50)", rag >= 50 ? 1 : 0, 1, 0);
  const areas = r.cells.map((c) => c.areaSqft).sort((a, b) => a - b);
  const want = [leftPx, rightPx].sort((a, b) => a - b);
  check("левая ячейка ≈ счёту пикселей", areas[0], want[0], 40);
  check("правая ячейка ≈ счёту пикселей", areas[1], want[1], 40);
}

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

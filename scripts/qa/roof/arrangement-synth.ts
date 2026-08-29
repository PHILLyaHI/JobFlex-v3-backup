/* Arrangement engine on synthetic inputs with hand-computed answers — the
 * §K8 discipline: the metric is proven on known inputs BEFORE any live number
 * is published.
 *
 *   npx tsx scripts/qa/roof/arrangement-synth.ts        (exit 1 on any FAIL)
 *
 * Cases: cross of lines · T-junction · valley to nowhere (pruned) · valley
 * chained to a ridge (junction weld) · two close parallel lines (sliver
 * merged). Square contour 20×20 throughout; undershoots of 0.5-0.7 ft are
 * baked into every input so the junction closing is exercised everywhere.
 */
import { buildArrangement } from "@/lib/roofRecon/arrangement";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

const SQ: FootprintPoint[] = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];

let failures = 0;
const check = (label: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${got.toFixed(2)} (ожидание ${want}±${tol})`);
};

const areasOf = (r: ReturnType<typeof buildArrangement>) => r.cells.map((c) => c.areaSqft).sort((a, b) => a - b);

// ── 1. крест: две перпендикулярные линии через центр, недотяг 0.5 ft ──
{
  console.log("КРЕСТ — 4 ячейки по 100 sf");
  const r = buildArrangement({
    contour: SQ,
    lines: [
      { a: { x: 10, y: 0.5 }, b: { x: 10, y: 19.5 } },
      { a: { x: 0.5, y: 10 }, b: { x: 19.5, y: 10 } },
    ],
  });
  check("ячеек", r.cells.length, 4, 0);
  check("Euler", r.euler, 1, 0);
  check("замощение %", r.tilingPct, 0, 0.01);
  check("отброшено линий", r.droppedLines.length, 0, 0);
  for (const [i, a] of areasOf(r).entries()) check(`ячейка ${i + 1} sf`, a, 100, 0.5);
}

// ── 2. Т-стык: линия упирается в середину другой ──
{
  console.log("Т-СТЫК — низ 200 sf, два верха по 100 sf");
  const r = buildArrangement({
    contour: SQ,
    lines: [
      { a: { x: 0.5, y: 10 }, b: { x: 19.5, y: 10 } },
      { a: { x: 10, y: 10.5 }, b: { x: 10, y: 19.5 } },
    ],
  });
  check("ячеек", r.cells.length, 3, 0);
  check("Euler", r.euler, 1, 0);
  check("замощение %", r.tilingPct, 0, 0.01);
  const a = areasOf(r);
  check("верх-лево sf", a[0], 100, 0.5);
  check("верх-право sf", a[1], 100, 0.5);
  check("низ sf", a[2], 200, 0.5);
}

// ── 3а. ендова в никуда: конец в 11+ ft от всего — честный прун ──
{
  console.log("ЕНДОВА В НИКУДА — 1 ячейка, линия отброшена с докладом");
  const r = buildArrangement({
    contour: SQ,
    lines: [{ a: { x: 0.4, y: 0.4 }, b: { x: 8, y: 8 } }],
  });
  check("ячеек", r.cells.length, 1, 0);
  check("Euler", r.euler, 1, 0);
  check("площадь sf", r.cells[0]?.areaSqft ?? 0, 400, 0.5);
  check("отброшено линий", r.droppedLines.length, 1, 0);
}

// ── 3б. ендова, сшитая с коньком: сварка концов, цепь до стены ──
{
  console.log("ЕНДОВА+КОНЁК — цепь угол→стена, низ 132.4 sf (шнуровка от точки сварки 8.25,8.25)");
  const r = buildArrangement({
    contour: SQ,
    lines: [
      { a: { x: 0.4, y: 0.4 }, b: { x: 8, y: 8 } },
      { a: { x: 8.5, y: 8.5 }, b: { x: 19.5, y: 8.5 } },
    ],
  });
  check("ячеек", r.cells.length, 2, 0);
  check("Euler", r.euler, 1, 0);
  check("замощение %", r.tilingPct, 0, 0.01);
  check("отброшено линий", r.droppedLines.length, 0, 0);
  check("нижняя ячейка sf", areasOf(r)[0], 132.4, 1.5);
}

// ── 4. две близкие параллельные: щель 12 sf < 15 — растворена ──
{
  console.log("ПАРАЛЛЕЛЬНЫЕ 0.6 ft — щель влита, 2 ячейки, грани ≥ 15 sf");
  const r = buildArrangement({
    contour: SQ,
    lines: [
      { a: { x: 0.5, y: 9.7 }, b: { x: 19.5, y: 9.7 } },
      { a: { x: 0.5, y: 10.3 }, b: { x: 19.5, y: 10.3 } },
    ],
  });
  check("ячеек", r.cells.length, 2, 0);
  check("Euler", r.euler, 1, 0);
  check("замощение %", r.tilingPct, 0, 0.01);
  check("граней < 15 sf", r.cells.filter((c) => c.areaSqft < 15).length, 0, 0);
  const dissolved = [...r.dissolvedFt.values()].reduce((s, v) => s + v, 0);
  check("растворено ft", dissolved, 19, 2);
}

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

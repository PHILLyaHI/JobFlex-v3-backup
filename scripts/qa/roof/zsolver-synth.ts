/* Эталоны единого z-солвера (§K8, приказ владельца 2026-08-30, блок 1 п.5).
 *
 *   npx tsx scripts/qa/roof/zsolver-synth.ts     (exit 1 на любой FAIL)
 *
 * A. Три плоскости в точке: точное пересечение — все три дают одинаковый
 *    z в вершине, солвер обязан вернуть ровно его (10.00).
 * B. Ступень 2.5 ft: два уровня — вершины уровней НЕ сглаживаются (у
 *    каждой свои инцидентные плоскости; расхождение ≥ переписи в одной
 *    точке идёт в счётчик crossLevel, побеждает большая опора).
 * C. Апекс с шумом ±0.3 ft: три плоскости дают 9.7 / 10.0 / 10.3 —
 *    сходится в МНК-точку по весам-опорам (600·9.7+300·10.0+100·10.3)
 *    / 1000 = 9.85.
 */
import { solveVertexZ } from "@/lib/roofRecon/zSolver";

let failures = 0;
const check = (label: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${got.toFixed(3)} (ожидание ${want}±${tol})`);
};

// ── A. точное пересечение трёх плоскостей ──
{
  console.log("A. ТРИ ПЛОСКОСТИ, ТОЧНОЕ ПЕРЕСЕЧЕНИЕ В (0,0,10)");
  const planes = [
    { a: 0.5, b: 0, c: 10 },   // z = 10 + 0.5x
    { a: -0.5, b: 0, c: 10 },  // z = 10 − 0.5x
    { a: 0, b: 0.6, c: 10 },   // z = 10 + 0.6y
  ];
  const res = solveVertexZ({
    points: [{ id: "apex", x: 0, y: 0 }],
    refsOf: () => planes.map((pl) => ({ evalAt: (x, y) => pl.a * x + pl.b * y + pl.c, w: 500 })),
    stepDzFt: 1.8,
  });
  check("z апекса", res.z.get("apex")!, 10, 1e-9);
  check("crossLevel", res.crossLevel, 0, 0);
}

// ── B. ступень 2.5 ft — уровни не сглаживаются ──
{
  console.log("B. СТУПЕНЬ 2.5 ft — ДВА УРОВНЯ, НЕ СГЛАЖЕНО");
  const upper = { evalAt: () => 12.5, w: 400 };
  const lower = { evalAt: () => 10.0, w: 300 };
  // топология уровней: у верхней вершины — только верхняя плоскость
  const res = solveVertexZ({
    points: [
      { id: "up", x: 0, y: 0 },
      { id: "dn", x: 0, y: 0 },
    ],
    refsOf: (pid) => (pid === "up" ? [upper] : [lower]),
    stepDzFt: 1.8,
  });
  check("z верхней", res.z.get("up")!, 12.5, 1e-9);
  check("z нижней", res.z.get("dn")!, 10.0, 1e-9);
  // нарушенная топология (обе плоскости на одной вершине): не сглаживать,
  // побеждает большая опора, счётчик наружу
  const res2 = solveVertexZ({
    points: [{ id: "shared", x: 0, y: 0 }],
    refsOf: () => [upper, lower],
    stepDzFt: 1.8,
  });
  check("нарушенная топология: z = уровень большей опоры", res2.z.get("shared")!, 12.5, 1e-9);
  check("crossLevel", res2.crossLevel, 1, 0);
}

// ── C. апекс с шумом ±0.3 — взвешенная МНК-точка ──
{
  console.log("C. АПЕКС С ШУМОМ ±0.3 ft — ВЗВЕШЕННАЯ МНК-ТОЧКА");
  const res = solveVertexZ({
    points: [{ id: "apex", x: 5, y: 5 }],
    refsOf: () => [
      { evalAt: () => 9.7, w: 600 },
      { evalAt: () => 10.0, w: 300 },
      { evalAt: () => 10.3, w: 100 },
    ],
    stepDzFt: 1.8,
  });
  check("z апекса", res.z.get("apex")!, 9.85, 1e-9);
  check("crossLevel", res.crossLevel, 0, 0);
}

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

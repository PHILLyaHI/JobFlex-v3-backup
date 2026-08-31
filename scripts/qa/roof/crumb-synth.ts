/* Эталон крошки у узлов (§K8, приказ 2026-08-31 п.3) — ручные числа.
 *
 *   npx tsx scripts/qa/roof/crumb-synth.ts       (exit 1 на любой FAIL)
 *
 * Граф руками, шаг решётки 1.0:
 * A. Звено 0.9×шаг между узлами ДВУХ разных цепей (линия L0 и трасса P) →
 *    втянуто: один узел, крошка исчезла, рёбра переключены.
 * B. Контроль: звено 1.5×шаг НЕ втягивается.
 * C. Звено 0.9×шаг ВНУТРИ одной цепи (обе стороны L0) НЕ втягивается
 *    (это звено цепи, не крошка).
 * D. Два кандидата, делящие узел, — применяется один (без цепочек).
 */
import { pullCrumbEdges } from "@/lib/roofRecon/arrangement";

let failures = 0;
const check = (label: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${got.toFixed(2)} (ожидание ${want}±${tol})`);
};
type E = { u: number; v: number; lineIndex?: number; pair?: [number, number] };

// A: узел линии L0 (0,0) и узел трассы P (0.9,0), крошка между ними
{
  const nodes = [
    { x: -5, y: 0 }, { x: 0, y: 0 }, { x: 0.9, y: 0 }, { x: 5.9, y: 0 },
    { x: 0, y: 5 }, { x: 0.9, y: -5 },
  ];
  const edges: E[] = [
    { u: 0, v: 1, lineIndex: 0 }, { u: 1, v: 4, lineIndex: 0 },
    { u: 1, v: 2 }, // крошка 0.9
    { u: 2, v: 3, pair: [1, 2] }, { u: 2, v: 5, pair: [1, 2] },
  ];
  const pulled = pullCrumbEdges(nodes, edges, 1.0);
  const crumbLeft = edges.some((e) => (e.u === 1 && e.v === 2) || (e.u === 2 && e.v === 1));
  check("A. втянуто звеньев", pulled, 1, 0);
  check("A. крошки нет", crumbLeft ? 1 : 0, 0, 0);
  check("A. рёбер осталось", edges.length, 4, 0);
}
// B: контроль 1.5×шаг
{
  const nodes = [
    { x: -5, y: 0 }, { x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 6.5, y: 0 },
    { x: 0, y: 5 }, { x: 1.5, y: -5 },
  ];
  const edges: E[] = [
    { u: 0, v: 1, lineIndex: 0 }, { u: 1, v: 4, lineIndex: 0 },
    { u: 1, v: 2 },
    { u: 2, v: 3, pair: [1, 2] }, { u: 2, v: 5, pair: [1, 2] },
  ];
  const pulled = pullCrumbEdges(nodes, edges, 1.0);
  check("B. контроль 1.5×шаг: втянуто 0", pulled, 0, 0);
  check("B. рёбер как было", edges.length, 5, 0);
}
// C: звено 0.9 внутри ОДНОЙ цепи L0
{
  const nodes = [
    { x: -5, y: 0 }, { x: 0, y: 0 }, { x: 0.9, y: 0 }, { x: 5.9, y: 0 },
    { x: 0, y: 5 }, { x: 0.9, y: -5 },
  ];
  const edges: E[] = [
    { u: 0, v: 1, lineIndex: 0 }, { u: 1, v: 4, lineIndex: 0 },
    { u: 1, v: 2, lineIndex: 0 },
    { u: 2, v: 3, lineIndex: 0 }, { u: 2, v: 5, lineIndex: 0 },
  ];
  const pulled = pullCrumbEdges(nodes, edges, 1.0);
  check("C. звено своей цепи: втянуто 0", pulled, 0, 0);
}
// D: два кандидата через общий узел — применяется один
{
  const nodes = [
    { x: -5, y: 0 }, { x: 0, y: 0 }, { x: 0.9, y: 0 }, { x: 1.8, y: 0 },
    { x: 0, y: 5 }, { x: 0.9, y: -5 }, { x: 1.8, y: 5 }, { x: 6.8, y: 0 },
  ];
  const edges: E[] = [
    { u: 0, v: 1, lineIndex: 0 }, { u: 1, v: 4, lineIndex: 0 },
    { u: 1, v: 2 }, // крошка-1 (0.9)
    { u: 2, v: 5, pair: [1, 2] },
    { u: 2, v: 3 }, // крошка-2 (0.9)
    { u: 3, v: 6, lineIndex: 1 }, { u: 3, v: 7, lineIndex: 1 },
  ];
  const pulled = pullCrumbEdges(nodes, edges, 1.0);
  check("D. цепочка из двух кандидатов: втянут один", pulled, 1, 0);
}
console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

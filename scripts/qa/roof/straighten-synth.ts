/* Эталоны слоя выпрямления (§K8, ручные числа).
 *
 *   npx tsx scripts/qa/roof/straighten-synth.ts      (exit 1 при FAIL)
 *
 * A. Прямой конёк, измеренный ломаной из трёх звеньев с шумом МЕНЬШЕ
 *    неопределённости (0.2 ft при кванте 0.33) → обязан стать одной прямой.
 * B. Излом 2.5 ft — БОЛЬШЕ неопределённости → обязан остаться изломом.
 */
import type { RoofModel } from "@/lib/eagleview";
import { mergeCollinearChains } from "@/lib/roofRecon/straighten";

let failures = 0;
const check = (label: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${got.toFixed(2)} (ожидание ${want}±${tol})`);
};

function chainModel(deflectFt: number): RoofModel {
  // конёк y=10+шум из трёх звеньев x: 0→10→20→30; две грани делят все звенья
  const P = (id: string, x: number, y: number, z: number) => ({ id, x, y, z });
  const points = [
    P("A", 0, 10, 20), P("m1", 10, 10 + deflectFt, 20), P("m2", 20, 10 - deflectFt, 20), P("B", 30, 10, 20),
    P("c1", 0, 0, 10), P("c2", 30, 0, 10), P("c3", 0, 20, 10), P("c4", 30, 20, 10),
  ];
  const L = (id: string, a: string, b: string, type: string) => {
    const pa = points.find((p) => p.id === a)!;
    const pb = points.find((p) => p.id === b)!;
    return { id, type: type as never, aId: a, bId: b, lengthFt: Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z) };
  };
  const lines = [
    L("r1", "A", "m1", "RIDGE"), L("r2", "m1", "m2", "RIDGE"), L("r3", "m2", "B", "RIDGE"),
    L("s1", "c1", "A", "RAKE"), L("s2", "c2", "B", "RAKE"), L("s3", "c3", "A", "RAKE"), L("s4", "c4", "B", "RAKE"),
    L("e1", "c1", "c2", "EAVE"), L("e2", "c3", "c4", "EAVE"),
  ];
  const faces = [
    { id: "F1", designator: "A1", pitch: 12, areaSqft: 300, orientation: 180, lineIds: ["r1", "r2", "r3", "s2", "e1", "s1"] },
    { id: "F2", designator: "A2", pitch: 12, areaSqft: 300, orientation: 0, lineIds: ["r1", "r2", "r3", "s4", "e2", "s3"] },
  ];
  return { location: {}, northOrientation: 0, points, lines, faces, penetrations: [], totals: { areaSqft: 600, squares: 6, facetCount: 2, predominantPitch: 12, footageByType: {} as never, bounds: { minX: 0, maxX: 30, minY: 0, maxY: 20, minZ: 10, maxZ: 20 } } } as RoofModel;
}

{
  console.log("А. ШУМ 0.2 ft < КВАНТА — конёк обязан стать одной прямой");
  const m = chainModel(0.2);
  const rep = mergeCollinearChains(m, 0.33);
  const ridges = m.lines.filter((l) => l.type === "RIDGE");
  check("огрызков схлопнуто (нет)", rep.collapsed, 0, 0);
  check("звеньев слито", rep.merged, 2, 0);
  check("линий RIDGE", ridges.length, 1, 0);
  check("длина конька", ridges[0]?.lengthFt ?? 0, 30, 0.05);
  check("вершин осталось", m.points.length, 6, 0);
  const ok1 = m.faces.every((f) => f.lineIds.length === 4);
  check("кольца граней по 4 линии", ok1 ? 1 : 0, 1, 0);
}
{
  console.log("B. ИЗЛОМ 2.5 ft > НЕОПРЕДЕЛЁННОСТИ — обязан остаться");
  const m = chainModel(2.5);
  const rep = mergeCollinearChains(m, 0.33);
  const ridges = m.lines.filter((l) => l.type === "RIDGE");
  check("звеньев слито (ноль)", rep.merged, 0, 0);
  check("линий RIDGE (все три)", ridges.length, 3, 0);
}

console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);

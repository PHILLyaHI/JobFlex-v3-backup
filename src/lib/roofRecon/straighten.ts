// Финишный слой — КОЛЛИНЕАРНОЕ СЛИЯНИЕ ЗВЕНЬЕВ на готовом полиэдре.
//
// Измерение решило, ГДЕ линия; конструкция решает, КАКАЯ она: крыша сделана
// из прямых балок, и цепочка рёбер одного типа через узлы степени 2, где
// излом меньше собственной неопределённости узла, — это ОДНА прямая, а не
// форма. Порог излома — перпендикуляр вершины к хорде соседей ≤ растровому
// кванту (шаг пикселя — данность задачи; излом больше кванта — настоящий:
// ступень или смена направления, не трогаем).
//
// Слияние — операция над моделью: вершина степени 2 уходит, её два ребра
// становятся одним (тип и провенанс наследуются), кольца обеих смежных
// граней теряют вершину. Планарность безопасна: вершина лежала на обеих
// плоскостях, хорда между её соседями — тоже.
import type { RoofModel } from "@/lib/eagleview";

export interface StraightenReport {
  merged: number;
  collapsed: number;
  passes: number;
}

/** Огрызки складок короче шумового пола ШАГА 1 (4 ft общей границы — под ним
 *  измерение само объявляет границу шумом) схлопываются: концы свариваются в
 *  вершину большей степени, узел теряет степень и открывается цепному
 *  слиянию. Контур (EAVE/RAKE) и швы не трогаются. */
function collapseShortCreases(model: RoofModel, minFt: number): number {
  let collapsed = 0;
  for (let guard = 0; guard < 500; guard++) {
    const deg = new Map<string, number>();
    for (const l of model.lines) {
      deg.set(l.aId, (deg.get(l.aId) ?? 0) + 1);
      deg.set(l.bId, (deg.get(l.bId) ?? 0) + 1);
    }
    // швы (FLASHING/STEPFLASH) не схлопываются: их плановые близнецы несут
    // парность уровней, и односторонняя сварка рвала Эйлер до −15
    const victim = model.lines
      .filter((l) => {
        if (l.type !== "RIDGE" && l.type !== "HIP" && l.type !== "VALLEY") return false;
        if (l.lengthFt >= minFt) return false;
        // сдвигать можно только ВИСЯЧИЙ конец (степень ≤ 2): стык-стык
        // огрызок — настоящий короткий конёк между апексами, и его снос
        // двигал узлы на футы (12618: площадь уехала на 1.8 %)
        return Math.min(deg.get(l.aId) ?? 0, deg.get(l.bId) ?? 0) <= 2;
      })
      .sort((x, y) => x.lengthFt - y.lengthFt)[0];
    if (!victim) break;
    const keep = (deg.get(victim.aId) ?? 0) >= (deg.get(victim.bId) ?? 0) ? victim.aId : victim.bId;
    const drop = keep === victim.aId ? victim.bId : victim.aId;
    model.lines = model.lines.filter((l) => l.id !== victim.id);
    for (const l of model.lines) {
      if (l.aId === drop) l.aId = keep;
      if (l.bId === drop) l.bId = keep;
    }
    // zero-length casualties die with their faces' references
    const dead = new Set(model.lines.filter((l) => l.aId === l.bId).map((l) => l.id));
    dead.add(victim.id);
    model.lines = model.lines.filter((l) => !dead.has(l.id));
    for (const f of model.faces) f.lineIds = f.lineIds.filter((id) => !dead.has(id));
    model.points = model.points.filter((pt) => pt.id !== drop);
    // recompute lengths of lines that moved an endpoint
    const ptById = new Map(model.points.map((pt) => [pt.id, pt]));
    for (const l of model.lines) {
      const a = ptById.get(l.aId);
      const b = ptById.get(l.bId);
      if (a && b) l.lengthFt = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    collapsed++;
  }
  return collapsed;
}

export function mergeCollinearChains(
  model: RoofModel,
  tolFt: number,
  /** Неопределённость узла по линии: коридор пары (planeTol/|∇A−∇B| + квант)
   *  — излом ниже её не форма. Нет данных — растровый квант. */
  tolOf?: (lineId: string) => number,
  /** Линии под запретом слияния (например, план-близнецы стен: слияние
   *  одной стороны пары ломает симметрию близнецов — лишнее ребро в
   *  план-графе, Эйлер падает, территория рвётся). */
  skipLine?: (lineId: string) => boolean,
): StraightenReport {
  const collapsed = collapseShortCreases(model, 4);
  let merged = 0;
  let passes = 0;
  for (let pass = 0; pass < 2000; pass++) {
    passes = pass + 1;
    const byPoint = new Map<string, string[]>(); // pointId -> lineIds
    for (const l of model.lines) {
      for (const pid of [l.aId, l.bId]) {
        const arr = byPoint.get(pid) ?? [];
        arr.push(l.id);
        byPoint.set(pid, arr);
      }
    }
    const lineById = new Map(model.lines.map((l) => [l.id, l]));
    const ptById = new Map(model.points.map((p) => [p.id, p]));
    let did = false;
    for (const [pid, lineIds] of byPoint) {
      if (lineIds.length !== 2) continue;
      const l1 = lineById.get(lineIds[0])!;
      const l2 = lineById.get(lineIds[1])!;
      if (l1.type !== l2.type) continue;
      // приёмка глазами — про складки; швы и контур несут парность
      // уровней и плановую чётность Эйлера, их звенья не трогаем
      if (l1.type !== "RIDGE" && l1.type !== "HIP" && l1.type !== "VALLEY") continue;
      if (skipLine && (skipLine(l1.id) || skipLine(l2.id))) continue;
      const aId = l1.aId === pid ? l1.bId : l1.aId;
      const bId = l2.aId === pid ? l2.bId : l2.aId;
      if (aId === bId) continue; // а degenerate loop is not a chain
      const P = ptById.get(pid)!;
      const A = ptById.get(aId)!;
      const B = ptById.get(bId)!;
      const chord = Math.hypot(B.x - A.x, B.y - A.y);
      if (chord < 1e-9) continue;
      const perp = Math.abs((P.x - A.x) * (B.y - A.y) - (P.y - A.y) * (B.x - A.x)) / chord;
      const tol = Math.max(tolFt, tolOf?.(l1.id) ?? 0, tolOf?.(l2.id) ?? 0);
      // §J: звено короче 2σ⊥ (коридор его опоры) направления НЕ НЕСЁТ —
      // излом с безнаправленным звеном не форма, а лесенка трассировки:
      // цепь 0.5–1.5 ft звеньев с углами 25–101° сливается в хорду
      const len1 = Math.hypot(P.x - A.x, P.y - A.y);
      const len2 = Math.hypot(B.x - P.x, B.y - P.y);
      const directionless = Math.min(len1, len2) < 2 * tol;
      if (perp > tol && !directionless) continue;
      // the faces on both sides must reference BOTH lines (degree-2 seam of
      // the same boundary), else the vertex carries other structure
      const owners = model.faces.filter((f) => f.lineIds.includes(l1.id) || f.lineIds.includes(l2.id));
      if (owners.some((f) => !(f.lineIds.includes(l1.id) && f.lineIds.includes(l2.id)))) continue;
      // хорда не смеет совпасть с существующей линией: каскадное слияние
      // изломанного близнеца выдавало точную копию его пары (dup план-ребра,
      // Эйлер 1 -> 0, разрыв территории на 419)
      const pkM = (q: { x: number; y: number }) => `${Math.round(q.x * 100)}|${Math.round(q.y * 100)}`;
      const chordKey = pkM(A) < pkM(B) ? `${pkM(A)}#${pkM(B)}` : `${pkM(B)}#${pkM(A)}`;
      let dupChord = false;
      for (const lx of model.lines) {
        if (lx === l1 || lx === l2) continue;
        const qa = ptById.get(lx.aId)!;
        const qb = ptById.get(lx.bId)!;
        const kx = pkM(qa) < pkM(qb) ? `${pkM(qa)}#${pkM(qb)}` : `${pkM(qb)}#${pkM(qa)}`;
        if (kx === chordKey) { dupChord = true; break; }
      }
      if (dupChord) continue;
      // merge: l1 becomes A—B, l2 and P die
      if (process.env.DBG_MERGE) {
        const pkE = new Map(model.points.map((q) => [q.id, `${Math.round(q.x * 1000)}|${Math.round(q.y * 1000)}`]));
        const vs = new Set(pkE.values());
        const es = new Set(model.lines.map((lx) => { const a3 = pkE.get(lx.aId)!; const b3 = pkE.get(lx.bId)!; return a3 < b3 ? a3 + "#" + b3 : b3 + "#" + a3; }));
        console.log(`[merge] ${l1.type} (${A.x.toFixed(1)},${A.y.toFixed(1)})-(${P.x.toFixed(1)},${P.y.toFixed(1)})-(${B.x.toFixed(1)},${B.y.toFixed(1)}) euler-до=${vs.size - es.size + model.faces.length}`);
      }
      l1.aId = aId;
      l1.bId = bId;
      l1.lengthFt = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
      for (const f of owners) f.lineIds = f.lineIds.filter((id) => id !== l2.id);
      model.lines = model.lines.filter((l) => l.id !== l2.id);
      model.points = model.points.filter((p) => p.id !== pid);
      merged++;
      did = true;
      break; // maps are stale — rebuild
    }
    if (!did) break;
  }
  return { merged, collapsed, passes };
}

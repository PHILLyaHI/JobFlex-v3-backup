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
        // сдвигать можно только ПО-НАСТОЯЩЕМУ висячий конец (степень 1):
        // deg 2 — это любое звено цепи, и после сварки переписным полом
        // (цепи стали складками, а не швами) схлопывание телепортировало
        // концы звеньев на футы — дыра 7.3 sf на 419 (грань A5 теряла
        // выпуклость 1.65 ft). Звенья цепей сливает mergeCollinearChains
        // по коридору, снос — только для огрызков из ниоткуда.
        return Math.min(deg.get(l.aId) ?? 0, deg.get(l.bId) ?? 0) <= 1;
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
  // поглощённые вершины каждой линии: хорда обязана держать в коридоре
  // ВСЕ съеденные точки, не только последнюю — пошаговый каскад с малым
  // перпом на каждом шаге накапливал дрейф 1.65 ft (дыра 7.3 sf на 419)
  const absorbedPts = new Map<string, Array<{ x: number; y: number }>>();
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
      const perpOf = (q: { x: number; y: number }): number => Math.abs((q.x - A.x) * (B.y - A.y) - (q.y - A.y) * (B.x - A.x)) / chord;
      const swallowed = [...(absorbedPts.get(l1.id) ?? []), ...(absorbedPts.get(l2.id) ?? []), { x: P.x, y: P.y }];
      const perp = Math.max(...swallowed.map(perpOf));
      const tol = Math.max(tolFt, tolOf?.(l1.id) ?? 0, tolOf?.(l2.id) ?? 0);
      // §J снимает УГОЛ короткого звена, но не позиционный коридор:
      // безусловная льгота коротким звеньям давала каскаду неограниченный
      // дрейф (выпуклость 1.65 ft съедена хордой на 419 — дыра 7.3 sf).
      // Единственный закон слияния — перп удаляемой вершины от хорды в
      // пределах коридора (tol с полом σ⊥ 0.5): позиция вершины измерена,
      // хорда дальше её неопределённости — выдумка
      if (perp > tol) continue;
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
      // кольца владельцев обязаны сшиваться и ПОСЛЕ слияния: щипок кольца
      // делает грань невидимой для покрытия/валидатора (дыра 7.3 sf на 419
      // от почти-коллинеарного слияния) — проверка с откатом
      const undoA = l1.aId;
      const undoB = l1.bId;
      const undoLen = l1.lengthFt;
      const undoFaces = owners.map((f) => ({ f, ids: f.lineIds.slice() }));
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
      {
        const { buildIndexes: bIm, ringOf: rOm } = require("@/components/estimator/roof/roofGeometry");
        const idxM = bIm(model);
        const broke = owners.some((f) => {
          const rm = rOm(f.lineIds, idxM);
          return !rm || rm.length < 3;
        });
        if (broke) {
          // откат
          l1.aId = undoA;
          l1.bId = undoB;
          l1.lengthFt = undoLen;
          for (const u of undoFaces) u.f.lineIds = u.ids;
          model.lines.push(l2);
          model.points.push(P);
          continue;
        }
      }
      absorbedPts.set(l1.id, swallowed);
      absorbedPts.delete(l2.id);
      merged++;
      did = true;
      break; // maps are stale — rebuild
    }
    if (!did) break;
  }
  return { merged, collapsed, passes };
}

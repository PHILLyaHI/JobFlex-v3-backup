// ЕДИНЫЙ ФИНАЛЬНЫЙ Z-СОЛВЕР (решение владельца, 2026-08-30).
//
// У высоты было шесть последовательных властей (сходимость плоскостей →
// flatten → слияния → пересадка → цепочная сварка → досварки типизации),
// каждая пересаживала маргиналы заново — R03-поля 0.17–0.47 пересдавались
// любой сменой геометрии, погоня была вечной (§J: к величине ведёт ОДИН
// путь). Теперь путь один: после всей планарной работы каждая вершина
// получает единственную z — взвешенную МНК-оценку по всем инцидентным
// ЧИСТЫМ плоскостям (вес — пиксельная опора плоскости; у заполнителя
// свидетельств нет — вес-пол 1).
//
// Ступени: раздельные уровни по переписи (STEP_DZ) — топология уже несёт
// вершину ступени двумя объектами по уровням (vzOf); солвер доверяет
// топологии и НЕ сглаживает через ступень: если инцидентные плоскости
// одной вершины расходятся на ≥ пол переписи, смешивается только
// цепочная группа с наибольшей суммарной опорой, остальные — в счётчик
// нарушенной топологии (наружу, не молча).
//
// Детерминизм: один проход, без итераций и случайности — одинаковый вход
// даёт одинаковый выход побитово.

export interface ZPlaneRef {
  /** z плоскости в точке (x, y) — кадр вызывающего. */
  evalAt: (x: number, y: number) => number;
  /** Пиксельная опора плоскости (число свидетельств); заполнитель — 1. */
  w: number;
}

export interface ZSolveInput {
  points: Array<{ id: string; x: number; y: number }>;
  /** Инцидентные чистые плоскости вершины (владельцы по кольцам). */
  refsOf: (pointId: string) => ZPlaneRef[];
  /** Переписной пол ступени: расхождение ≥ него не сглаживается. */
  stepDzFt: number;
}

export interface ZSolveResult {
  z: Map<string, number>;
  /** Вершины, где плоскости расходились на ≥ пол (топология должна была
   *  расщепить их по уровням — счётчик наружу, не молча). */
  crossLevel: number;
}

export function solveVertexZ(input: ZSolveInput): ZSolveResult {
  const out = new Map<string, number>();
  let crossLevel = 0;
  for (const p of input.points) {
    const refs = input.refsOf(p.id);
    if (!refs.length) continue;
    const evals = refs
      .map((r) => ({ z: r.evalAt(p.x, p.y), w: Math.max(r.w, 1) }))
      .filter((e) => Number.isFinite(e.z))
      .sort((a, b) => a.z - b.z);
    if (!evals.length) continue;
    // цепочная группировка по переписи; смешивается группа с наибольшей опорой
    const groups: Array<typeof evals> = [];
    let cur: typeof evals = [];
    for (const e of evals) {
      if (cur.length && e.z - cur[cur.length - 1].z >= input.stepDzFt) {
        groups.push(cur);
        cur = [];
      }
      cur.push(e);
    }
    groups.push(cur);
    if (groups.length > 1) crossLevel++;
    let best = groups[0];
    let bestW = best.reduce((s, e) => s + e.w, 0);
    for (const g of groups.slice(1)) {
      const wg = g.reduce((s, e) => s + e.w, 0);
      if (wg > bestW) {
        best = g;
        bestW = wg;
      }
    }
    const z = best.reduce((s, e) => s + e.w * e.z, 0) / bestW;
    out.set(p.id, z);
  }
  return { z: out, crossLevel };
}

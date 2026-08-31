// РАСЩЕПЛЕНИЕ КЛАСТЕРА ПО ВНУТРЕННЕЙ СТЕНЕ (отмашка 2026-08-31).
//
// Сегментация умеет склеить два ската через стену (12618: кластер 3 по
// обе стороны обрыва y≈−6.2 — плато 12.4–13.0 и 7.5–8.7 прямым замером).
// Стена ВНУТРИ кластера не рождает пары регионов ⇒ профиль стены не
// строится ⇒ vzOf не расщепляет уровни ⇒ кольцо грани несёт чужие z ⇒
// LS-градиент мусорный (G4 39°).
//
// Закон: непрерывная линия прямого DSM-обрыва (вторая разность — та же
// линейка, что directWallDrop/WallProfile: ядро ≥ 2.0, рост соседством
// ≥ 1.8), пересекающая кластер насквозь или упирающаяся в его границы
// обоими концами, режет регион на интра-секции. Секция — полноправный
// кластер (своя плоскость по своим пикселям); стена между секциями —
// штатная граница пары со ВСЕМИ читателями (WallProfile, vzOf-близнецы,
// fade, типы, масс-граница).
//
// Что НЕ режет (из данных, не выдумано):
// - обрыв-огрызок, не проходящий насквозь: снятие полосы оставляет один
//   компонент — раскроя нет;
// - замкнутая петля обрыва (труба/выступ): внутренний компонент не
//   касается внешней границы региона — отказ;
// - пенетрации: их пиксели исключены из замера (zOf → null) ещё маской.

export interface WallSplitInput {
  /** Регион на пиксель (мутируется: пиксели новых секций получают новые id). */
  region: Int32Array;
  /** Вид региона (мутируется push'ем новых секций). */
  regionKind: Array<"cluster" | "fill">;
  /** Кластер региона (мутируется: секции получают новые кластеры). */
  clusterOf: number[];
  width: number;
  height: number;
  stepFt: number;
  /** Пол грани: компонент меньше — не секция. */
  minFacetSqft: number;
  /** z (ft) в пикселе; null — вне маски/пенетрация (обрыв не мерится). */
  zOf: (pi: number) => number | null;
  /** Пиксель → кадр ft (для подгонки плоскости секции). */
  ftOf: (pi: number) => { x: number; y: number };
  /** Ядро гистерезиса обрыва (перепись 2.0 — как у WallProfile). */
  coreDzFt: number;
  /** Рост полосы соседством (1.8 — тот же гистерезис). */
  growDzFt: number;
  /**
   * Регистрация кластера секции: плоскость по пикселям секции; вызывающий
   * заводит id (d.clusterPlanes, m.clusterIn) и переназначает d.assign.
   */
  registerCluster: (plane: { a: number; b: number; c: number }, pixels: number[]) => number;
}

export interface WallSplitResult {
  splits: number;
  report: string[];
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** Направления второй разности: оси и диагонали, офсеты 2/4 px — те же
 *  2·шаг/4·шаг, что у станций профиля. */
const SCAN_DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;

export function splitClustersByInnerWall(input: WallSplitInput): WallSplitResult {
  const { region, regionKind, clusterOf, width: w, height: h, stepFt, zOf, ftOf } = input;
  const pxSqft = stepFt * stepFt;
  const report: string[] = [];
  let splits = 0;

  const nRegions0 = regionKind.length;
  const pixelsOf = new Map<number, number[]>();
  for (let i = 0; i < w * h; i++) {
    const r = region[i];
    if (r < 0 || regionKind[r] !== "cluster") continue;
    (pixelsOf.get(r) ?? pixelsOf.set(r, []).get(r)!).push(i);
  }

  const fitPlanePx = (pixels: number[]): { a: number; b: number; c: number } | null => {
    let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0, n = 0;
    for (const pi of pixels) {
      const z = zOf(pi);
      if (z === null) continue;
      const p = ftOf(pi);
      sx += p.x; sy += p.y; sz += z;
      sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y;
      sxz += p.x * z; syz += p.y * z;
      n++;
    }
    if (n < 6) return null;
    const d11 = sxx - (sx * sx) / n;
    const d12 = sxy - (sx * sy) / n;
    const d22 = syy - (sy * sy) / n;
    const b1 = sxz - (sx * sz) / n;
    const b2 = syz - (sy * sz) / n;
    const det = d11 * d22 - d12 * d12;
    if (Math.abs(det) < 1e-9) return null;
    const a = (b1 * d22 - b2 * d12) / det;
    const b = (b2 * d11 - b1 * d12) / det;
    return { a, b, c: (sz - a * sx - b * sy) / n };
  };

  for (const [r, pixels] of pixelsOf) {
    if (pixels.length * pxSqft < 2 * input.minFacetSqft) continue; // резать не на что
    // 1) карта обрыва: вторая разность поперёк пикселя (макс по направлениям)
    const dMax = new Map<number, number>();
    for (const pi of pixels) {
      const x = pi % w;
      const y = (pi - x) / w;
      let best = 0;
      for (const [dx, dy] of SCAN_DIRS) {
        const at = (k: number): number | null => {
          const nx = x + dx * k;
          const ny = y + dy * k;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) return null;
          return zOf(ny * w + nx);
        };
        // офсеты 2/3 px: двойка не видит размазанный на 2–3 px переход,
        // а от 4 px поправка наклона ломается на СКЛАДКАХ (|Δнаклона|·o
        // растёт с офсетом: замер — полосы 30–80% регионов, Euler 0);
        // на 3 px ошибка складки ≤ 1 ft < ядра 2.0
        for (const o of [2, 3]) {
          const z1 = at(o), z2 = at(-o), zo1 = at(2 * o), zo2 = at(-2 * o);
          if (z1 === null || z2 === null || zo1 === null || zo2 === null) continue;
          // ступень — разрыв, не градиент (класс 1c): наклон вычитается
          const d0 = Math.abs((z1 - z2) - (zo1 - z1) - (z2 - zo2));
          if (d0 > best) best = d0;
        }
      }
      if (best > 0) dMax.set(pi, best);
    }
    // 2) полоса: ядро ≥ core, рост соседством ≥ grow (гистерезис профиля)
    const band = new Set<number>();
    const queue: number[] = [];
    for (const pi of pixels) if ((dMax.get(pi) ?? 0) >= input.coreDzFt) { band.add(pi); queue.push(pi); }
    if (!band.size) continue;
    while (queue.length) {
      const pi = queue.pop()!;
      const x = pi % w;
      const y = (pi - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (region[k] !== r || band.has(k)) continue;
        if ((dMax.get(k) ?? 0) >= input.growDzFt) { band.add(k); queue.push(k); }
      }
    }
    // 3) компоненты региона без полосы (4-связность)
    const comp = new Map<number, number>();
    const comps: number[][] = [];
    for (const pi of pixels) {
      if (band.has(pi) || comp.has(pi)) continue;
      const id = comps.length;
      const cur: number[] = [];
      const st = [pi];
      comp.set(pi, id);
      while (st.length) {
        const j = st.pop()!;
        cur.push(j);
        const x = j % w;
        const y = (j - x) / w;
        for (const [dx, dy] of DIRS4) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (region[k] !== r || band.has(k) || comp.has(k)) continue;
          comp.set(k, id);
          st.push(k);
        }
      }
      comps.push(cur);
    }
    const bigIdx = comps.map((c, i) => ({ c, i })).filter((e) => e.c.length * pxSqft >= input.minFacetSqft);
    if (process.env.DBG_WSPLIT) {
      const cs = comps.map((c) => Math.round(c.length * pxSqft)).sort((a, b) => b - a).slice(0, 6);
      const bb = (list: Iterable<number>): string => {
        let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
        for (const pi of list) {
          const p = ftOf(pi);
          mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x);
          mny = Math.min(mny, p.y); mxy = Math.max(mxy, p.y);
        }
        return mnx > mxx ? "пусто" : `x ${mnx.toFixed(0)}..${mxx.toFixed(0)} y ${mny.toFixed(0)}..${mxy.toFixed(0)}`;
      };
      console.log(`[wsplit] регион ${r} (cl${clusterOf[r]}, ${Math.round(pixels.length * pxSqft)}sf, ${bb(pixels)}): полоса ${Math.round(band.size * pxSqft)}sf (${bb(band)}), компоненты [${cs.join(" ")}], крупных ${bigIdx.length}`);
    }
    if (bigIdx.length < 2) continue; // огрызок/кайма — раскроя нет
    // 4) законность: каждая секция касается ВНЕШНЕЙ границы региона
    //    (замкнутая петля рождает остров — отказ целиком, переборчиво)
    const touchesBoundary = (c: number[]): boolean => {
      for (const pi of c) {
        const x = pi % w;
        const y = (pi - x) / w;
        for (const [dx, dy] of DIRS4) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true;
          if (region[ny * w + nx] !== r) return true;
        }
      }
      return false;
    };
    if (!bigIdx.every((e) => touchesBoundary(e.c))) continue;
    // 5) полоса и мелочь — к ближайшей секции (мультиисточниковый BFS:
    //    граница пары ложится серединой полосы; стену дальше меряет профиль)
    const owner = new Map<number, number>();
    const bfs: number[] = [];
    bigIdx.forEach((e, bi) => { for (const pi of e.c) { owner.set(pi, bi); } });
    for (const e of bigIdx) for (const pi of e.c) bfs.push(pi);
    let head = 0;
    while (head < bfs.length) {
      const pi = bfs[head++];
      const bi = owner.get(pi)!;
      const x = pi % w;
      const y = (pi - x) / w;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (region[k] !== r || owner.has(k)) continue;
        owner.set(k, bi);
        bfs.push(k);
      }
    }
    // 6) перекрой: секция 0 наследует регион r, остальные — новые регионы;
    //    КАЖДАЯ секция — новый кластер со своей плоскостью
    const secPixels: number[][] = bigIdx.map(() => []);
    for (const pi of pixels) {
      const bi = owner.get(pi);
      if (bi === undefined) continue; // недостижимая мелочь — оставить как есть
      secPixels[bi].push(pi);
    }
    const newRegionIds: number[] = [];
    for (let bi = 0; bi < secPixels.length; bi++) {
      const rid = bi === 0 ? r : regionKind.length;
      if (bi > 0) {
        regionKind.push("cluster");
        clusterOf.push(clusterOf[r]);
        for (const pi of secPixels[bi]) region[pi] = rid;
      }
      newRegionIds.push(rid);
      const pl = fitPlanePx(secPixels[bi]);
      if (pl) clusterOf[rid] = input.registerCluster(pl, secPixels[bi]);
    }
    splits++;
    report.push(
      `расщепление кластера по внутренней стене: регион ${r} → ${bigIdx.length} секций (` +
        secPixels.map((c) => `${Math.round(c.length * pxSqft)}sf`).join(" | ") +
        `), полоса обрыва ${Math.round(band.size * pxSqft)}sf`,
    );
  }
  if (regionKind.length > nRegions0) report.push(`регионов было ${nRegions0}, стало ${regionKind.length}`);
  return { splits, report };
}

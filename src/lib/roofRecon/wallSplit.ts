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
  /** Пол плоскостности секции (та же линейка, что суд клетки —
   *  DEFAULT_PLANE_TOL_FT): секция, не держащая свою плоскость, не
   *  регистрируется, раскрой отклоняется (§J: без суда — никаких
   *  плоскостей). */
  planeTolFt: number;
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

  const rmsOf = (pixels: number[], pl: { a: number; b: number; c: number }): number => {
    let ss = 0, n = 0;
    for (const pi of pixels) {
      const z = zOf(pi);
      if (z === null) continue;
      const p = ftOf(pi);
      const dz = z - (pl.a * p.x + pl.b * p.y + pl.c);
      ss += dz * dz;
      n++;
    }
    return n >= 3 ? Math.sqrt(ss / n) : Number.POSITIVE_INFINITY;
  };

  // ── ЗАМЕР СКЛАДОЧНОГО ИЗЛОМА (п.2 отмашки): |Δнаклона| по 4px-плечам,
  //    печать распределения для вывода порога из данных ──
  const creaseMagOf = (pi: number): number => {
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
      // наклон плеча — LS по 5 сэмплам (сырые разности шумят 2–6/12,
      // складка 5.4/12 тонет; LS давит шум до ~1.2/12)
      const slopeLS = (sgn: number): number | null => {
        let sk = 0, sz = 0, skk = 0, skz = 0, n = 0;
        for (let k = 1; k <= 5; k++) {
          const z = at(sgn * k);
          if (z === null) return null;
          sk += k; sz += z; skk += k * k; skz += k * z;
        }
        n = 5;
        const den = n * skk - sk * sk;
        const unit = stepFt * Math.hypot(dx, dy);
        return ((n * skz - sk * sz) / den) * sgn / unit;
      };
      const sL = slopeLS(-1);
      const sR = slopeLS(1);
      if (sL === null || sR === null) continue;
      const d0 = Math.abs(sR - sL);
      if (d0 > best) best = d0;
    }
    return best;
  };
  if (process.env.DBG_CREASE) {
    for (const [r, pixels] of pixelsOf) {
      const mags = pixels.map(creaseMagOf).sort((a, b) => a - b);
      const q = (f: number) => (mags[Math.floor(f * (mags.length - 1))] * 12).toFixed(1);
      console.log(`[crease] регион ${r} (cl${clusterOf[r]}, ${Math.round(pixels.length * pxSqft)}sf): |Δs|·12 медиана ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)} p97 ${q(0.97)} max ${q(1)}`);
    }
  }

  for (const [r, pixels] of pixelsOf) {
    if (pixels.length * pxSqft < 2 * input.minFacetSqft) continue; // резать не на что
    // 1) карта обрыва: вторая разность поперёк пикселя (макс по
    //    направлениям); лучшая станция несёт НАПРАВЛЕНИЕ и УРОВНИ сторон
    //    (zHi/zLo) — по ним ниже судится когерентность линии (§J: суд
    //    не выключается, полоса обязана мериться как стена)
    interface BandSt { d: number; zHi: number; zLo: number }
    const dMax = new Map<number, BandSt>();
    for (const pi of pixels) {
      const x = pi % w;
      const y = (pi - x) / w;
      let best: BandSt | null = null;
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
          if (!best || d0 > best.d) best = { d: d0, zHi: Math.max(z1, z2), zLo: Math.min(z1, z2) };
        }
      }
      if (best && best.d > 0) dMax.set(pi, best);
    }
    // 2) полоса: ядро ≥ core, рост соседством ≥ grow (гистерезис профиля)
    const band = new Set<number>();
    const queue: number[] = [];
    for (const pi of pixels) if ((dMax.get(pi)?.d ?? 0) >= input.coreDzFt) { band.add(pi); queue.push(pi); }
    if (process.env.DBG_WSPLIT && band.size) {
      const core = [...band].slice(0, 400).filter((_, i) => i % 25 === 0);
      console.log(`[wsplit]   ядро региона ${r}: ${core.map((pi) => { const p = ftOf(pi); return `(${p.x.toFixed(0)},${p.y.toFixed(0)})d${(dMax.get(pi)?.d ?? 0).toFixed(1)}`; }).join(" ")}`);
    }
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
        if ((dMax.get(k)?.d ?? 0) >= input.growDzFt) { band.add(k); queue.push(k); }
      }
    }
    // 2b) Когерентность линии уровней — ЗАМЕР, не гейт. NB (2026-08-31):
    //     форма линейки «доля соседних пар с разрывом уровня ≥ переписи»
    //     ОТВЕРГНУТА замером — зазора нет (крона 12629: 12%; живые стены
    //     шестёрки: 8–24%; чистая синтетика: 0%). Полосу судит СУД СЕКЦИЙ
    //     ниже: обе стороны раскроя обязаны держать свою плоскость той же
    //     линейкой, что суд клетки, — интегральная форма «монотонности
    //     уровня вдоль линии» (у кроны секции rms 1.2–1.4 против пола
    //     0.35 — раскрой отклоняется). Цифра остаётся в отчёте.
    let ragPairs = 0;
    let allPairs = 0;
    for (const pi of band) {
      const si = dMax.get(pi);
      if (!si) continue;
      const x = pi % w;
      const y = (pi - x) / w;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
        const k = (y + dy) * w + (x + dx);
        if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h) continue;
        if (!band.has(k)) continue;
        const sj = dMax.get(k);
        if (!sj) continue;
        allPairs++;
        if (Math.abs(si.zHi - sj.zHi) >= input.coreDzFt || Math.abs(si.zLo - sj.zLo) >= input.coreDzFt) ragPairs++;
      }
    }
    const ragShare = allPairs ? ragPairs / allPairs : 0;
    if (process.env.DBG_WSPLIT) console.log(`[wsplit]   когерентность полосы региона ${r}: пар ${allPairs}, рваных ${ragPairs} (${(ragShare * 100).toFixed(0)}%)`);
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
    // 6a) СУД СЕКЦИЙ ТОЙ ЖЕ ЛИНЕЙКОЙ, что переподгонка клетки (§J:
    //     исключение из проверки дороже провала): каждая секция обязана
    //     держать СВОЮ плоскость (rms ≤ пола) на СВОЕЙ опоре (≥ пола
    //     грани). Не держит — раскрой региона отклоняется целиком, регион
    //     остаётся в родителе с честным провенансом. Крона в loose-маске
    //     (12629: секции rms 1.21/1.42, A3-фантом) валится именно здесь.
    const judged = secPixels.map((px2) => {
      const pl = fitPlanePx(px2);
      if (!pl) return null;
      const rms = rmsOf(px2, pl);
      const ownSf = px2.length * pxSqft;
      return { pl, rms, ownSf };
    });
    const bad = judged.findIndex((j) => !j || j.rms > input.planeTolFt || j.ownSf < input.minFacetSqft);
    if (bad >= 0) {
      const j = judged[bad];
      report.push(
        `расщепление региона ${r} ОТКЛОНЕНО судом секций: секция ${bad} ` +
          (j ? `rms ${j.rms.toFixed(2)} (пол ${input.planeTolFt}), опора ${Math.round(j.ownSf)}sf` : "без плоскости") +
          ` — полоса не стена (когерентность: рваных пар ${(ragShare * 100).toFixed(0)}%)`,
      );
      continue;
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
      clusterOf[rid] = input.registerCluster(judged[bi]!.pl, secPixels[bi]);
    }
    splits++;
    report.push(
      `расщепление кластера по внутренней стене: регион ${r} → ${bigIdx.length} секций (` +
        secPixels.map((c) => `${Math.round(c.length * pxSqft)}sf`).join(" | ") +
        `), полоса обрыва ${Math.round(band.size * pxSqft)}sf`,
    );
  }
  // ── РАСЩЕПЛЕНИЕ ПО СКЛАДКЕ (отмашка 2026-08-31 п.2): излом уклона при
  //    непрерывной высоте. NB (§J, замер): по-пиксельная линейка излома
  //    (|Δнаклона| плеч, сырые и LS-сглаженные) ОТВЕРГНУТА — фон гладких
  //    скатов 2.7–15/12 (медианы) против сигнала 5.4/12 на 12618: пол
  //    видимости 0.5/12 на пикселях честно не измерим. Измеримая форма —
  //    суд ПЛОСКОСТЕЙ: перебор прямых-кандидатов (8 направлений × позиции
  //    шагом ~1 ft); разрез принимается, когда ОБЕ стороны держат свою
  //    плоскость (тот же пол, что суд клетки) и их градиенты расходятся
  //    ≥ пола видимости перегиба 0.5/12 (LEVEL_SLOPE закона складок —
  //    на плоскостях он честен). Режутся только регионы, НЕ держащие
  //    собственную плоскость (иначе резать незачем — тот же rms-пол). ──
  {
    const LEVEL_SLOPE = 0.5 / 12;
    const pixelsOf2 = new Map<number, number[]>();
    for (let i = 0; i < w * h; i++) {
      const r = region[i];
      if (r < 0 || regionKind[r] !== "cluster") continue;
      (pixelsOf2.get(r) ?? pixelsOf2.set(r, []).get(r)!).push(i);
    }
    for (const [r, pixels] of pixelsOf2) {
      if (pixels.length * pxSqft < 2 * input.minFacetSqft) continue;
      const pl0 = fitPlanePx(pixels);
      if (!pl0) continue;
      const rms0 = rmsOf(pixels, pl0);
      // NB (§J, замер 2026-08-31, блок 6): расщепление ПЛАНАРНОГО региона
      // по слабой складке ОТВЕРГНУТО тремя линейками формы — на живой
      // черепице фон фантомных «форм» 0.6–2.9/12 массов и неотделим от
      // целевой 1.5/12: (1) мягкая V/Λ (3/5 станций) — 5 фантомных
      // резов 419, каскад R02/R03/R13/G1; (2) чистая V/Λ (5/5 +
      // амплитуда ≥ шума) — слепа к монотонному излому; (3) знак
      // кривизны (s1+s2−2sc) — резал скругления коньков (0.6/12) на
      // 12629/12618/419 и снова валил 419. Слабая складка на планарном
      // регионе живым DSM честно не измерима; условие возврата — слово
      // владельца по конкретному месту (тогда мерить место напрямую).
      if (rms0 <= input.planeTolFt) continue; // планарна — резать незачем
      // перебор прямых: 8 направлений × позиции по нормали шагом 3·шаг
      let bestCut: { nx: number; ny: number; c: number; rmsMax: number; plA: { a: number; b: number; c: number }; plB: { a: number; b: number; c: number } } | null = null;
      for (let di = 0; di < 8; di++) {
        const th = (di * Math.PI) / 8;
        const nx = Math.cos(th);
        const ny = Math.sin(th);
        let mn = Infinity, mx = -Infinity;
        for (const pi of pixels) {
          const p = ftOf(pi);
          const t = p.x * nx + p.y * ny;
          if (t < mn) mn = t;
          if (t > mx) mx = t;
        }
        for (let c0 = mn + 1; c0 < mx - 1; c0 += 3 * stepFt) {
          const A: number[] = [];
          const B: number[] = [];
          for (const pi of pixels) {
            const p = ftOf(pi);
            (p.x * nx + p.y * ny < c0 ? A : B).push(pi);
          }
          // пол секции складки — 2× пол грани: 17sf-огрызок на 12618
          // проходил полом грани и рождал R13/G2 (крошка — не скат)
          if (A.length * pxSqft < 2 * input.minFacetSqft || B.length * pxSqft < 2 * input.minFacetSqft) continue;
          const plA = fitPlanePx(A);
          const plB = fitPlanePx(B);
          if (!plA || !plB) continue;
          if (Math.hypot(plA.a - plB.a, plA.b - plB.b) < LEVEL_SLOPE) continue; // копланарные — не складка
          const rmsMax = Math.max(rmsOf(A, plA), rmsOf(B, plB));
          if (rmsMax > input.planeTolFt) continue;
          if (!bestCut || rmsMax < bestCut.rmsMax) bestCut = { nx, ny, c: c0, rmsMax, plA, plB };
        }
      }
      if (!bestCut) {
        if (process.env.DBG_CREASE) console.log(`[crease] регион ${r}: rms0=${rms0.toFixed(2)} — прямой складки, дающей две плоскости, нет`);
        continue;
      }
      // раскрой по прямой: стороны → компоненты, мусор — к ближайшей (BFS)
      const sideOf = new Map<number, number>();
      for (const pi of pixels) {
        const p = ftOf(pi);
        sideOf.set(pi, p.x * bestCut.nx + p.y * bestCut.ny < bestCut.c ? 0 : 1);
      }
      const secPx: number[][] = [[], []];
      for (const pi of pixels) secPx[sideOf.get(pi)!].push(pi);
      const newRid = regionKind.length;
      regionKind.push("cluster");
      clusterOf.push(clusterOf[r]);
      for (const pi of secPx[1]) region[pi] = newRid;
      clusterOf[r] = input.registerCluster(bestCut.plA, secPx[0]);
      clusterOf[newRid] = input.registerCluster(bestCut.plB, secPx[1]);
      splits++;
      report.push(
        `расщепление по складке: регион ${r} (rms ${rms0.toFixed(2)}) → 2 секции (${Math.round(secPx[0].length * pxSqft)}sf | ${Math.round(secPx[1].length * pxSqft)}sf), rms сторон ≤ ${bestCut.rmsMax.toFixed(2)}, |Δ∇| ${(Math.hypot(bestCut.plA.a - bestCut.plB.a, bestCut.plA.b - bestCut.plB.b) * 12).toFixed(1)}/12`,
      );
    }
  }
  if (regionKind.length > nRegions0) report.push(`регионов было ${nRegions0}, стало ${regionKind.length}`);
  return { splits, report };
}

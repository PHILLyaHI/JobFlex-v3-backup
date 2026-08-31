/* ── GOOGLE — АРБИТР СОСТАВА (приказ владельца 2026-08-30, блок 2 → конвейер) ──
 *
 * roofSegmentStats читается ЦЕЛИКОМ и судит СОСТАВ нашей сегментации, не
 * геометрию: арбитр ничего не двигает — он пишет вердикт в провенанс и
 * достоверность. Три сигнала:
 *   • сегмент Google без нашего кластера        → «пропущен скат»
 *   • наш кластер без сегмента Google           → «дроблён или фантом»
 *   • два+ наших кластера в одном сегменте      → кандидаты на слияние
 *
 * Instant facetCount (confidence 0.19 на поле) отставлен НАВСЕГДА как
 * детектор дефицита — его место занимает первый сигнал арбитра.
 *
 * Закон сопоставления — из замера блока 2 (b2-google.ts): компас ±30°,
 * затем ближайший по центру. Кадры сдвинуты регистрацией на единицы ft —
 * потолок расстояния выведен из данных: центр сегмента не может отстоять
 * от центра своего кластера дальше стороны эквивалентного квадрата
 * √(площадь) (на 12629 фактические расстояния были 0.2–1.9 ft при
 * сторонах 12–23 ft — сдвиг кадров тонет в этом пределе).
 */

export interface ArbiterSegment {
  /** Компас-азимут ската Google, градусы. */
  azDeg: number;
  /** Уклон, градусы. */
  pitchDeg: number;
  /** Площадь СКАТА (наклонная), sq ft. */
  areaSf: number;
  /** Центр сегмента в кадре, ft (проекция от origin вызывающим). */
  xFt: number;
  yFt: number;
}

export interface ArbiterCluster {
  cl: number;
  /** Компас-азимут нашего кластера, градусы. */
  compass: number;
  pitch12: number;
  sf: number;
  xFt: number;
  yFt: number;
}

export interface GoogleArbiterReport {
  segments: number;
  clusters: number;
  matched: Array<{ seg: number; cl: number; distFt: number }>;
  /** Сегменты Google, на которые не пришёлся ни один наш кластер. */
  missedSlopes: Array<{ azDeg: number; pitchDeg: number; areaSf: number; xFt: number; yFt: number }>;
  /** Наши кластеры без сегмента Google — дроблёные либо фантомные. */
  splitOrPhantom: number[];
  /** Сегменты, в которых сошлись ≥2 наших кластера — кандидаты на слияние. */
  mergeCandidates: Array<{ seg: number; cls: number[] }>;
  notes: string[];
}

const COMPASS_GATE_DEG = 30;

export function googleCompositionArbiter(
  segments: readonly ArbiterSegment[],
  clusters: readonly ArbiterCluster[],
): GoogleArbiterReport {
  const rep: GoogleArbiterReport = {
    segments: segments.length,
    clusters: clusters.length,
    matched: [],
    missedSlopes: [],
    splitOrPhantom: [],
    mergeCandidates: [],
    notes: [],
  };
  const dAz = (a: number, b: number): number => {
    let d = Math.abs(a - b) % 360;
    if (d > 180) d = 360 - d;
    return d;
  };
  // каждый кластер — к своему сегменту (компас-гейт, ближайший центр,
  // потолок √площади сегмента)
  const bySeg = new Map<number, Array<{ cl: number; distFt: number }>>();
  for (const c of clusters) {
    let best = -1;
    let bestDist = Infinity;
    segments.forEach((s, i) => {
      if (dAz(c.compass, s.azDeg) > COMPASS_GATE_DEG) return;
      const dist = Math.hypot(c.xFt - s.xFt, c.yFt - s.yFt);
      if (dist > Math.max(Math.sqrt(s.areaSf), Math.sqrt(c.sf))) return;
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    if (best < 0) { rep.splitOrPhantom.push(c.cl); continue; }
    rep.matched.push({ seg: best, cl: c.cl, distFt: bestDist });
    (bySeg.get(best) ?? bySeg.set(best, []).get(best)!).push({ cl: c.cl, distFt: bestDist });
  }
  segments.forEach((s, i) => {
    const got = bySeg.get(i);
    if (!got) rep.missedSlopes.push({ azDeg: s.azDeg, pitchDeg: s.pitchDeg, areaSf: s.areaSf, xFt: s.xFt, yFt: s.yFt });
    else if (got.length >= 2) rep.mergeCandidates.push({ seg: i, cls: got.map((g) => g.cl) });
  });
  rep.notes.push(
    `Google-арбитр состава: сегментов ${rep.segments}, наших кластеров ${rep.clusters}; ` +
      `пропущенных скатов ${rep.missedSlopes.length}, дроблёных/фантомных ${rep.splitOrPhantom.length}, ` +
      `кандидатов на слияние ${rep.mergeCandidates.length}`,
  );
  return rep;
}

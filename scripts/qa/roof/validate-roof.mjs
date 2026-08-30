#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars -- verbatim copy of the
   reference validator from the roof-geometry skill; kept byte-for-byte so its
   numbers stay comparable. Do not "clean up" — fix it upstream in the skill. */
/**
 * validate-roof.mjs — проверка сгенерированной модели крыши на физическую
 * достоверность. Ноль зависимостей, запуск: node validate-roof.mjs model.json
 *
 * Формат модели (все координаты в футах, план — XY, высота — Z):
 * {
 *   "address": "optional",
 *   "material": "asphalt" | "metal-shingle" | "tile" | "slate" | "wood" | "roll",
 *   "footprint": [[x,y], ...],            // CCW, замкнутый контур БЕЗ дубля первой точки
 *   "vertices": [[x,y,z], ...],
 *   "facets": [ { "id": "A1", "pitch": 6, "v": [0,1,5,4] }, ... ]   // pitch = rise/12
 * }
 *
 * Коды выхода: 0 — ошибок нет, 1 — есть ошибки (warn не влияет).
 */

import { readFileSync } from 'node:fs';

// ── допуски ───────────────────────────────────────────────────────────────
const EPS_XY = 0.05;      // ft, склейка вершин (~0.6 in)
const EPS_Z = 0.05;       // ft
// An edge is LEVEL by its slope, not by an absolute drop. The old test asked
// |za - zb| <= EPS_Z with no reference to the edge's length, so the longer a
// ridge was the flatter it had to be: a 40 ft ridge had to be level to 0.125 %
// to stay a ridge, and past that it was reclassified as a hip. Measured: three
// ridges of 16-23 ft dropping 0.06-0.17 ft (slopes 0.002-0.008 - level by any
// roofing standard, 0.03 in per foot) were classified hips, and R12 then
// demanded 45 degrees from them and got 0.3-1.0. The threshold is in the edge
// CLASSIFIER, so it also decides R08's counts and what R11 is asked about.
// The absolute value stays as a FLOOR so a 6-inch stub is not reclassified by
// numerical noise.
const LEVEL_SLOPE = 0.02;
const isLevelEdge = (a, b) => {
  const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return Math.abs(a[2] - b[2]) <= Math.max(EPS_Z, LEVEL_SLOPE * run);
};
const EPS_PLANE = 0.08;   // ft, отклонение от плоскости грани
const EPS_PITCH = 0.03;   // в единицах rise/12
const EPS_AREA_REL = 0.01;
const EPS_ANGLE_DEG = 2.0;
const STUB_FT = 1.0;      // короче — предупреждение
// R17's |dA - dB| is not a plan measurement: multiplied by the pitch it is how
// far the two facets' apex heights DISAGREE. So it is tested in feet of height
// against EPS_Z, the same tolerance R11 compares heights with, and there is no
// constant to choose. Not a fraction of the span: a foot off centre on a 12/12
// is a foot of height error whether the span is 12 ft or 50.
const ridgeCentreTolFt = (pitch12) => EPS_PLANE * (Math.abs(pitch12) > 0.1 ? 12 / Math.abs(pitch12) : 12); // R17: допуск на «конёк по центру пролёта»

// ── минимальные уклоны по IRC (rise/12) ───────────────────────────────────
const MIN_PITCH = {
  asphalt: 2, 'metal-shingle': 3, tile: 2.5, slate: 4, wood: 3, roll: 1,
};
const DOUBLE_UNDERLAY_BELOW = 4; // asphalt 2/12..4/12 требует двойной подкладки

// ── геометрия ─────────────────────────────────────────────────────────────
const key = (p) => `${Math.round(p[0] / EPS_XY)}|${Math.round(p[1] / EPS_XY)}`;
const eKey = (a, b) => [key(a), key(b)].sort().join('#');

function shoelace(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}
const area2 = (poly) => Math.abs(shoelace(poly));

function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function isSimple(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  return true;
}

/** Плоскость по МНК: z = a*x + b*y + c. Возвращает {a,b,c,maxDev} */
function fitPlane(pts3) {
  let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  const n = pts3.length;
  for (const [x, y, z] of pts3) {
    sx += x; sy += y; sz += z; sxx += x * x; sxy += x * y; syy += y * y;
    sxz += x * z; syz += y * z;
  }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const B = [sxz, syz, sz];
  const det =
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  if (Math.abs(det) < 1e-9) return null;
  const solve = (col) => {
    const A = M.map((r) => r.slice());
    for (let i = 0; i < 3; i++) A[i][col] = B[i];
    return (
      A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
      A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
      A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])
    ) / det;
  };
  const a = solve(0), b = solve(1), c = solve(2);
  let maxDev = 0;
  for (const [x, y, z] of pts3) maxDev = Math.max(maxDev, Math.abs(a * x + b * y + c - z));
  return { a, b, c, maxDev };
}

const planeZ = (pl, x, y) => pl.a * x + pl.b * y + pl.c;
const gradMag = (pl) => Math.hypot(pl.a, pl.b);          // = pitch/12
const slopeFactor = (p) => Math.sqrt(1 + (p / 12) ** 2);
const hipFactor = (p) => Math.sqrt(2 + (p / 12) ** 2);
const deg = (r) => (r * 180) / Math.PI;

// ── ядро ──────────────────────────────────────────────────────────────────
export function validateRoof(model) {
  const out = [];
  const add = (level, id, msg) => out.push({ level, id, msg });
  const err = (id, msg) => add('error', id, msg);
  const warn = (id, msg) => add('warn', id, msg);
  const ok = (id, msg) => add('ok', id, msg);

  const V = model.vertices || [];
  const F = model.facets || [];
  const fp = model.footprint || [];
  if (!V.length || !F.length || !fp.length) {
    err('INPUT', 'модель неполная: нужны footprint, vertices, facets');
    return { results: out, report: null };
  }

  // план-полигоны и плоскости
  const facets = F.map((f, i) => {
    const pts3 = f.v.map((idx) => V[idx]);
    const plan = pts3.map(([x, y]) => [x, y]);
    return {
      i, id: f.id ?? `F${i}`, pitch: f.pitch, pts3, plan,
      planArea: area2(plan), plane: fitPlane(pts3),
    };
  });

  // ─ 1. Простота и невырожденность граней
  for (const f of facets) {
    if (f.plan.length < 3) err('R01', `${f.id}: меньше 3 вершин`);
    else if (f.planArea < 0.5) err('R01', `${f.id}: вырожденная площадь ${f.planArea.toFixed(2)} sq ft`);
    else if (!isSimple(f.plan)) err('R02', `${f.id}: полигон самопересекается`);
    const seen = new Set();
    for (const p of f.plan) {
      const k = key(p);
      if (seen.has(k)) err('R02', `${f.id}: дубль вершины в контуре`);
      seen.add(k);
    }
  }
  if (!out.some((r) => r.id === 'R01' || r.id === 'R02'))
    ok('R01/R02', `${facets.length} граней — простые, невырожденные`);

  // ─ 2. Планарность и соответствие уклона
  for (const f of facets) {
    if (!f.plane) { err('R03', `${f.id}: не удалось построить плоскость`); continue; }
    if (f.plane.maxDev > EPS_PLANE)
      err('R03', `${f.id}: грань не плоская, отклонение ${f.plane.maxDev.toFixed(2)} ft`);
    const measured = gradMag(f.plane) * 12;
    if (f.pitch != null && Math.abs(measured / 12 - f.pitch / 12) > EPS_PITCH)
      err('R04', `${f.id}: заявлен уклон ${f.pitch}/12, по геометрии ${measured.toFixed(2)}/12`);
  }
  if (!out.some((r) => r.id === 'R03' || r.id === 'R04'))
    ok('R03/R04', 'все грани плоские, уклоны совпадают с геометрией');

  // ─ 3. Покрытие футпринта
  const fpArea = area2(fp);
  const sumPlan = facets.reduce((s, f) => s + f.planArea, 0);
  if (Math.abs(sumPlan - fpArea) / fpArea > EPS_AREA_REL)
    err('R05', `сумма проекций граней ${sumPlan.toFixed(0)} != площадь контура ${fpArea.toFixed(0)} sq ft`);
  else ok('R05', `проекции граней покрывают контур (${fpArea.toFixed(0)} sq ft)`);

  // ─ 4. Топология рёбер
  const edges = new Map(); // eKey -> { a, b, facets: [] }
  for (const f of facets) {
    for (let k = 0; k < f.pts3.length; k++) {
      const A = f.pts3[k], B = f.pts3[(k + 1) % f.pts3.length];
      const kk = eKey(A, B);
      if (!edges.has(kk)) edges.set(kk, { a: A, b: B, facets: [] });
      edges.get(kk).facets.push(f);
    }
  }
  const fpKeys = new Set(fp.map(key));
  let badShare = 0;
  for (const [, e] of edges) {
    if (e.facets.length > 2) { err('R06', `ребро делят ${e.facets.length} граней`); badShare++; }
  }
  if (!badShare) ok('R06', 'каждое ребро принадлежит 1 или 2 граням');

  // ─ 5. Эйлер: V - E + F = 1 для односвязной крыши
  const usedV = new Set();
  for (const f of facets) for (const p of f.pts3) usedV.add(key(p));
  const eulerV = usedV.size, eulerE = edges.size, eulerF = facets.length;
  const euler = eulerV - eulerE + eulerF;
  if (euler !== 1)
    err('R07', `Эйлер нарушен: V-E+F = ${eulerV}-${eulerE}+${eulerF} = ${euler} (ожидается 1) — крыша не односвязна или есть дыры`);
  else ok('R07', `топология односвязна (V-E+F = 1: ${eulerV}/${eulerE}/${eulerF})`);

  // ─ 6. Классификация рёбер
  const classify = (e) => {
    const level = isLevelEdge(e.a, e.b);
    if (e.facets.length === 1) return level ? 'eave' : 'rake';
    if (level) return 'ridge';
    // hip vs valley: смотрим, как ведут себя обе плоскости в стороны от ребра
    const mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    const dir = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
    const len = Math.hypot(dir[0], dir[1]) || 1;
    const perp = [-dir[1] / len, dir[0] / len];
    const d = 0.4;
    const zMid = (e.a[2] + e.b[2]) / 2;
    let lower = 0, higher = 0;
    for (const s of [1, -1]) {
      const probe = [mid[0] + perp[0] * d * s, mid[1] + perp[1] * d * s];
      const f = e.facets.find((ff) => pointInPoly(probe, ff.plan)) || e.facets[0];
      if (!f.plane) continue;
      const z = planeZ(f.plane, probe[0], probe[1]);
      if (z < zMid - 1e-4) lower++; else if (z > zMid + 1e-4) higher++;
    }
    if (lower === 2) return 'hip';
    if (higher === 2) return 'valley';
    return 'unknown';
  };

  const byType = { eave: [], rake: [], ridge: [], hip: [], valley: [], unknown: [] };
  for (const [, e] of edges) {
    e.type = classify(e);
    e.len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]);
    byType[e.type].push(e);
  }
  if (byType.unknown.length)
    warn('R08', `${byType.unknown.length} рёбер не удалось классифицировать (проверь геометрию складок)`);
  else ok('R08', `рёбра классифицированы: ${byType.eave.length} eave, ${byType.rake.length} rake, ${byType.ridge.length} ridge, ${byType.hip.length} hip, ${byType.valley.length} valley`);

  // ─ 7. Каждая грань имеет хотя бы один eave
  for (const f of facets) {
    const has = [...edges.values()].some(
      (e) => e.type === 'eave' && e.facets.includes(f)
    );
    if (!has) err('R09', `${f.id}: нет ни одного карниза (eave) — вода некуда не стекает`);
  }
  if (!out.some((r) => r.id === 'R09')) ok('R09', 'у каждой грани есть карниз');

  // ─ 8. Вода стекает к карнизу (направление уклона)
  for (const f of facets) {
    if (!f.plane) continue;
    const cx = f.plan.reduce((s, p) => s + p[0], 0) / f.plan.length;
    const cy = f.plan.reduce((s, p) => s + p[1], 0) / f.plan.length;
    const g = [-f.plane.a, -f.plane.b]; // downhill
    const gl = Math.hypot(g[0], g[1]);
    if (gl < 1e-6) { warn('R10', `${f.id}: плоская грань, уклон 0`); continue; }
    const step = [g[0] / gl, g[1] / gl];
    let t = 0.2, exitZ = null;
    while (t < 500) {
      const p = [cx + step[0] * t, cy + step[1] * t];
      if (!pointInPoly(p, f.plan)) { exitZ = planeZ(f.plane, p[0], p[1]); break; }
      t += 0.2;
    }
    const cz = planeZ(f.plane, cx, cy);
    if (exitZ != null && exitZ > cz + EPS_Z)
      err('R10', `${f.id}: уклон направлен внутрь крыши, а не к карнизу`);
  }
  if (!out.some((r) => r.id === 'R10' && r.level === 'error'))
    ok('R10', 'вода с каждой грани стекает наружу');

  // ─ 9. Ridge горизонтален и является верхней кромкой В СВОЁМ ПРОЛЁТЕ.
  // Раньше конёк сверялся с максимумом ВСЕЙ грани: L-образная грань с двумя
  // крыльями разной ширины (два конька на разных высотах) всегда «проваливала»
  // нижний конёк, хотя геометрия верна. Пролёт конька — интервал проекций его
  // концов на его же ось; кольцо грани отсекается до этого интервала, z на
  // границах отсечения интерполируется по ребру.
  for (const e of byType.ridge) {
    const ux = e.b[0] - e.a[0], uy = e.b[1] - e.a[1];
    const ul = Math.hypot(ux, uy) || 1;
    const sOf = (p) => ((p[0] - e.a[0]) * ux + (p[1] - e.a[1]) * uy) / ul;
    const topZ = Math.max(e.a[2], e.b[2]);
    for (const f of e.facets) {
      let spanMax = -Infinity;
      for (let i = 0; i < f.pts3.length; i++) {
        const p = f.pts3[i], q = f.pts3[(i + 1) % f.pts3.length];
        const sp = sOf(p), sq = sOf(q);
        const lo = Math.max(0, Math.min(sp, sq));
        const hi = Math.min(ul, Math.max(sp, sq));
        if (hi < lo) continue;
        const zAt = (t) => (Math.abs(sq - sp) < 1e-9 ? Math.max(p[2], q[2]) : p[2] + ((t - sp) / (sq - sp)) * (q[2] - p[2]));
        spanMax = Math.max(spanMax, zAt(lo), zAt(hi));
      }
      if (spanMax > topZ + EPS_Z)
        err('R11', `${f.id}: конёк не является верхней кромкой грани в своём пролёте`);
    }
  }
  if (!out.some((r) => r.id === 'R11')) ok('R11', 'коньки горизонтальны и лежат по верху граней в своих пролётах');

  // ─ 10. Правило угла в плане: θ от карниза A = arctan(pB / pA)
  for (const e of [...byType.hip, ...byType.valley]) {
    if (e.facets.length !== 2) continue;
    const [A, B] = e.facets;
    if (!A.plane || !B.plane) continue;
    const pA = gradMag(A.plane) * 12, pB = gradMag(B.plane) * 12;
    if (pA < 0.1 || pB < 0.1) continue;
    // направление карниза грани A = перпендикуляр к её уклону в плане
    const eaveA = [-A.plane.b, A.plane.a];
    const el = Math.hypot(eaveA[0], eaveA[1]) || 1;
    const dir = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const cos = Math.abs((eaveA[0] / el) * (dir[0] / dl) + (eaveA[1] / el) * (dir[1] / dl));
    const observed = deg(Math.acos(Math.min(1, cos)));
    // arctan(pB/pA) — частный случай ПРЯМОГО угла контура. В общем виде гребень
    // — геометрическое место равных высот: sin(α)·pA = sin(γ−α)·pB, где γ —
    // внутренний угол между карнизами (180° минус угол между градиентами).
    // На срезанном угле 135° при равных уклонах это даёт 67.5° — половину угла
    // контура, а не 45°.
    const gdot = A.plane.a * B.plane.a + A.plane.b * B.plane.b;
    const gnorm = Math.hypot(A.plane.a, A.plane.b) * Math.hypot(B.plane.a, B.plane.b) || 1;
    const gamma = Math.PI - Math.acos(Math.max(-1, Math.min(1, gdot / gnorm)));
    const predicted = deg(Math.atan2(pB * Math.sin(gamma), pA + pB * Math.cos(gamma)));
    const diff = Math.min(Math.abs(observed - predicted), Math.abs(180 - observed - predicted));
    if (diff > EPS_ANGLE_DEG)
      err('R12', `${e.type} между ${A.id}(${pA.toFixed(1)}/12) и ${B.id}(${pB.toFixed(1)}/12): угол в плане ${observed.toFixed(1)}°, по пересечению плоскостей должен быть ${predicted.toFixed(1)}° (угол контура ${deg(gamma).toFixed(0)}°)`);
  }
  if (!out.some((r) => r.id === 'R12'))
    ok('R12', 'углы вальм/ендов в плане соответствуют уклонам и углу контура (45° при равных уклонах на прямом углу)');

  // ─ 11. Hip на выпуклом углу, valley на вогнутом
  const fpOrient = shoelace(fp) > 0 ? 1 : -1;
  const convexity = new Map();
  for (let i = 0; i < fp.length; i++) {
    const p0 = fp[(i - 1 + fp.length) % fp.length], p1 = fp[i], p2 = fp[(i + 1) % fp.length];
    const cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
    convexity.set(key(p1), cross * fpOrient > 0 ? 'convex' : 'concave');
  }
  for (const e of [...byType.hip, ...byType.valley]) {
    const low = e.a[2] <= e.b[2] ? e.a : e.b;
    const c = convexity.get(key(low));
    if (!c) continue;
    if (e.type === 'hip' && c !== 'convex')
      err('R13', `вальма (hip) выходит из вогнутого угла контура — там должна быть ендова`);
    if (e.type === 'valley' && c !== 'concave')
      err('R13', `ендова (valley) выходит из выпуклого угла контура — там должна быть вальма`);
  }
  if (!out.some((r) => r.id === 'R13'))
    ok('R13', 'вальмы на выпуклых углах, ендовы на вогнутых');

  // ── G1–G4: ГРАММАТИКА ЛИНИЙ (skill roof-geometry: существование и
  //    терминация — линия есть прямая балка от узла до узла) ──
  // грамматика судит ЗАЯВЛЕННЫЕ типы, когда модель их несёт (schema-поле
  // lines: [{a:[x,y], b:[x,y], type}]); геометрия — фолбэк для чистых фикстур
  // Граф грамматики — из ЗАЯВЛЕННЫХ ЛИНИЙ напрямую (schema lines:
  // [{a:[x,y,z], b, type, facets}]): кольцо грани с щипком не сшивается и
  // прятало от графа половину мира (швы, соседние складки) — легальная
  // терминация на шве читалась «обрывом в поле». Фолбэк — рёбра колец.
  const gAllEdges0 = [];
  const gMap = (t) =>
    t === 'RIDGE' ? 'ridge' : t === 'HIP' ? 'hip' : t === 'VALLEY' ? 'valley' :
    t === 'EAVE' ? 'eave' : t === 'RAKE' ? 'rake' :
    t === 'FLASHING' || t === 'STEPFLASH' ? 'seam' : 'unknown';
  if (model.lines?.length) {
    for (const l of model.lines) {
      if (Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) < 1e-6) continue;
      gAllEdges0.push({
        a: [l.a[0], l.a[1], l.a[2] ?? 0],
        b: [l.b[0], l.b[1], l.b[2] ?? 0],
        t: gMap(l.type),
        d: l.type,
        facets: (l.facets ?? []).map((id) => ({ id })),
      });
    }
  } else {
    for (const e of [...byType.eave, ...byType.rake, ...byType.ridge, ...byType.hip, ...byType.valley, ...byType.unknown])
      gAllEdges0.push({ a: e.a, b: e.b, t: e.type ?? 'unknown', d: '', facets: e.facets });
  }
  const gTypeOf = (e) => e.t;
  const gCreases = gAllEdges0.filter((e) => ['ridge', 'hip', 'valley'].includes(e.t));
  const gAllEdges = gAllEdges0;
  const gSeams = gAllEdges0.filter((e) => gTypeOf(e) === 'seam');
  const gIsSeam = new Set(gSeams);
  const gDeg = new Map();
  for (const e of gAllEdges) {
    for (const p of [e.a, e.b]) {
      const k = key([p[0], p[1]]);
      const arr = gDeg.get(k) ?? [];
      arr.push(e);
      gDeg.set(k, arr);
    }
  }
  const gDistSeg = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
  };
  const gRingDist = (p) => {
    let best = Infinity;
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i];
      const b = fp[(i + 1) % fp.length];
      best = Math.min(best, gDistSeg(p, [a[0], a[1], 0], [b[0], b[1], 0]));
    }
    return best;
  };
  const gCorner = (p) => {
    for (const v of fp) {
      if (Math.hypot(p[0] - v[0], p[1] - v[1]) <= STUB_FT) return convexity.get(key(v)) ?? null;
    }
    return null;
  };
  const gOn = (p, list) => list.some((r) => gDistSeg(p, r.a, r.b) <= STUB_FT);
  // G1 — перелом без узла: точка степени 2 с двумя складками одного типа,
  // излом больше atan(EPS_PLANE / min(L)) — лишний угол в прямой балке
  for (const [k, arr] of gDeg) {
    if (arr.length !== 2) continue;
    const [e1, e2] = arr;
    if (gTypeOf(e1) !== gTypeOf(e2) || !gCreases.includes(e1)) continue;
    const set1 = e1.facets.map((f) => f.id).sort().join('|');
    const set2 = e2.facets.map((f) => f.id).sort().join('|');
    if (set1 !== set2) continue;
    const other = (e) => (key([e.a[0], e.a[1]]) === k ? e.b : e.a);
    const P = key([e1.a[0], e1.a[1]]) === k ? e1.a : e1.b;
    const A = other(e1);
    const B = other(e2);
    const l1 = Math.hypot(P[0] - A[0], P[1] - A[1]);
    const l2 = Math.hypot(B[0] - P[0], B[1] - P[1]);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const a1 = Math.atan2(P[1] - A[1], P[0] - A[0]);
    const a2 = Math.atan2(B[1] - P[1], B[0] - P[0]);
    let dth = Math.abs(a2 - a1);
    if (dth > Math.PI) dth = 2 * Math.PI - dth;
    const chord = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    const perpP = Math.abs((P[0] - A[0]) * (B[1] - A[1]) - (P[1] - A[1]) * (B[0] - A[0])) / chord;
    if (perpP > EPS_PLANE)
      err('G1', `${e1.t}: излом ${((dth * 180) / Math.PI).toFixed(1)}° в точке (${P[0].toFixed(1)},${P[1].toFixed(1)}) без узла — прямая балка так не гнётся`);
  }
  if (!out.some((r) => r.id === 'G1')) ok('G1', "каждая складка — прямая от узла до узла");
  // G2/G3 — терминация по типам и висячие концы
  for (const e of gCreases) {
    if (gIsSeam.has(e)) continue;
    for (const p of [e.a, e.b]) {
      const k = key([p[0], p[1]]);
      const arr = gDeg.get(k) ?? [];
      if (arr.length === 1) {
        err('G3', `${gTypeOf(e)}: висячий конец в (${p[0].toFixed(1)},${p[1].toFixed(1)}) — линий из ниоткуда не бывает`);
        continue;
      }
      if (arr.length === 2 && gTypeOf(arr[0]) === gTypeOf(arr[1])) continue;
      const isNode = arr.length >= 3;
      const corner = gCorner(p);
      const ringD = gRingDist(p);
      const t = gTypeOf(e);
      let okEnd = false;
      let why = "";
      const onSeam = gOn(p, gSeams);
      if (t === 'valley') {
        okEnd = isNode || corner === 'concave' || gOn(p, gAllEdges0.filter((o) => gTypeOf(o) === 'ridge')) || onSeam;
        why = ringD > STUB_FT ? "обрывается в поле" : corner ? `упирается в ${corner === 'convex' ? "выпуклый" : ""} угол` : "выходит на карниз серединой";
      } else if (t === 'hip') {
        okEnd = isNode || corner === 'convex' || gOn(p, gAllEdges0.filter((o) => gTypeOf(o) === 'ridge')) || onSeam;
        why = ringD > STUB_FT ? "обрывается в поле" : corner ? "упирается не в свой угол" : "выходит на карниз серединой";
      } else {
        // узел легализует конец конька только со СКЛАДКОЙ в составе:
        // узел из одних осколков (OTHER/STEPFLASH) — не вальмовый узел
        const creasesAt = arr.filter((o) => o !== e && ['ridge', 'hip', 'valley'].includes(gTypeOf(o))).length;
        okEnd = (isNode && creasesAt >= 1) || corner !== null || gOn(p, gAllEdges0.filter((o) => gTypeOf(o) === 'rake')) || onSeam;
        why = "конёк висит без вальм/ендов/фронтона";
      }
      if (!okEnd) err('G2', `${t}: терминация вне грамматики в (${p[0].toFixed(1)},${p[1].toFixed(1)}) — ${why}`);
    }
  }
  // G2 для rake: фронтонное ребро живёт только на контуре
  for (const e of gAllEdges0.filter((o) => gTypeOf(o) === 'rake')) {
    if (gIsSeam.has(e)) continue;
    if (gRingDist(e.a) > STUB_FT || gRingDist(e.b) > STUB_FT)
      err('G2', `rake в (${e.a[0].toFixed(1)},${e.a[1].toFixed(1)}) не лежит на контуре`);
  }
  if (!out.some((r) => r.id === 'G2')) ok('G2', "терминация линий по грамматике (углы, узлы, коньки, фронтоны)");
  if (!out.some((r) => r.id === 'G3')) ok('G3', "висячих концов нет");
  // G4 — конёк есть горизонталь своей плоскости, а горизонталь плоскости
  // перпендикулярна её градиенту. Допуск — собственная неопределённость
  // направления линии atan(2σ⊥/L) при σ⊥ = 0.5 ft; линия короче 2σ⊥
  // направления не несёт (§J). Прежняя форма «параллелен карнизам» — прокси,
  // ломавшийся на гранях, чей низ — ендовы и ступени, а карниза почти нет.
  const G4_SIGMA = 0.5; // σ⊥ измеренной складки, ft
  const LEVEL_G = 0.5 / 12; // ровная грань направления градиента не несёт
  const gGrad = new Map();
  for (const f of facets) if (f.plane) gGrad.set(f.id, [f.plane.a, f.plane.b]);
  for (const e of gAllEdges0.filter((o) => o.t === 'ridge')) {
    const gLen = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    if (gLen < 2 * G4_SIGMA) continue; // §J: 2σ⊥ ≥ L — направления нет
    const G4_DEG = (Math.atan((2 * G4_SIGMA) / gLen) * 180) / Math.PI;
    const rd = Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
    let worst = null;
    for (const f of e.facets) {
      const g = gGrad.get(f.id);
      if (!g || Math.hypot(g[0], g[1]) < LEVEL_G) continue;
      const gd = Math.atan2(g[1], g[0]);
      let d = Math.abs(rd - gd) % Math.PI;
      if (d > Math.PI / 2) d = Math.PI - d;
      const off = Math.abs(Math.PI / 2 - d);
      if (worst === null || off > worst) worst = off;
    }
    if (worst !== null && (worst * 180) / Math.PI > G4_DEG)
      err('G4', `конёк (${e.a[0].toFixed(1)},${e.a[1].toFixed(1)})→(${e.b[0].toFixed(1)},${e.b[1].toFixed(1)}) не перпендикулярен градиенту своей грани (${((worst * 180) / Math.PI).toFixed(1)}°)`);
  }
  if (!out.some((r) => r.id === 'G4')) ok('G4', "коньки параллельны своим карнизам");

  // ── G5–G7 (2026-08-30): существование по месту и связность — пятёрка
  //    мест владельца на 12629, которую G1–G4 пропускала ──
  const gPairKey = (e) => {
    const ka = key([e.a[0], e.a[1]]);
    const kb = key([e.b[0], e.b[1]]);
    return ka < kb ? ka + "#" + kb : kb + "#" + ka;
  };
  const gByPair = new Map();
  for (const e of gAllEdges0) {
    const k = gPairKey(e);
    const arr = gByPair.get(k) ?? [];
    arr.push(e);
    gByPair.set(k, arr);
  }
  // СТУПЕНЬ (стена) существует только от переписного пола Δz: бимодальный
  // census перепадов дал зазор 1.8–2.2 ft между «невязкой подгонки» и
  // «стеной массы» — порог 2.0. Меньший Δz близнецов — не архитектура.
  const G_STEP_DZ = 2.0;
  const gTwinDz = (e) => {
    const zMid = (e.a[2] + e.b[2]) / 2;
    return (gByPair.get(gPairKey(e)) ?? [])
      .filter((o) => o !== e)
      .reduce((m2, o) => Math.max(m2, Math.abs((o.a[2] + o.b[2]) / 2 - zMid)), 0);
  };
  const gMid = (e) => [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, 0];
  // G5 — EAVE и RAKE существуют ТОЛЬКО на внешнем контуре структуры:
  // любой внутренний отрезок этих типов — нарушение (приказ владельца,
  // 2026-08-30, без исключений). «Внутри поля» = середина внутри полигона
  // контура И дальше STUB_FT от его границы; чужая структура (вне
  // полигона) не судится об этот контур.
  for (const e of gAllEdges0) {
    if (e.d !== 'EAVE' && e.d !== 'RAKE') continue;
    const m5 = gMid(e);
    if (!pointInPoly([m5[0], m5[1]], fp)) continue;
    const worst = Math.max(gRingDist(e.a), gRingDist(e.b), gRingDist(m5));
    if (worst <= STUB_FT) continue;
    // единственное законное исключение — верх НАСТОЯЩЕЙ ступени (близнец
    // с Δz от переписного пола): над нижней крышей карниз настоящий
    if (gTwinDz(e) >= G_STEP_DZ) continue;
    err('G5', `${e.d} (${e.a[0].toFixed(1)},${e.a[1].toFixed(1)})→(${e.b[0].toFixed(1)},${e.b[1].toFixed(1)}) внутри поля крыши (до контура ${worst.toFixed(1)} ft) — карниз/фронтон живёт только на внешнем контуре`);
  }
  if (!out.some((r) => r.id === 'G5')) ok('G5', "карнизы и фронтоны только на контуре");
  // G6 — FLASHING существует только на стыке с вертикалью (есть Δz):
  // на внешнем контуре без ступени-близнеца запрещён.
  for (const e of gAllEdges0) {
    if (e.d !== 'FLASHING') continue;
    const onRing = Math.max(gRingDist(e.a), gRingDist(e.b), gRingDist(gMid(e))) <= STUB_FT;
    if (!onRing) continue;
    const dz = gTwinDz(e);
    if (dz < G_STEP_DZ)
      err('G6', `FLASHING (${e.a[0].toFixed(1)},${e.a[1].toFixed(1)})→(${e.b[0].toFixed(1)},${e.b[1].toFixed(1)}) на внешнем контуре без ступени (Δz близнеца ${dz.toFixed(2)} ft) — флешинг живёт на стыке с вертикалью`);
  }
  if (!out.some((r) => r.id === 'G6')) ok('G6', "флешинг только на стыках с вертикалью");
  // G7 — связность: конец внутренней линии обязан лежать в узле — совпадать
  // с концом другой линии, точкой контура или лежать на другой линии
  // (Т-стык, легальный по G2) в допуске сварки STUB_FT. Зазоров нет.
  for (const e of gAllEdges0) {
    for (const p of [e.a, e.b]) {
      if (gRingDist(p) <= STUB_FT) continue;
      if (!pointInPoly([p[0], p[1]], fp)) continue; // чужая структура — не об этот контур
      let best = Infinity;
      for (const o of gAllEdges0) {
        if (o === e) continue;
        best = Math.min(best, gDistSeg(p, o.a, o.b));
        if (best <= STUB_FT) break;
      }
      if (best > STUB_FT)
        err('G7', `${e.t}: конец (${p[0].toFixed(1)},${p[1].toFixed(1)}) висит в зазоре ${Number.isFinite(best) ? best.toFixed(1) : '∞'} ft от ближайшей линии — концы лежат в узлах`);
    }
  }
  if (!out.some((r) => r.id === 'G7')) ok('G7', "все концы в узлах — зазоров нет");



  // ─ 11b. R17: конёк по центру пролёта при равных уклонах (инвариант №13)
  //   Предикат на «два почти-параллельных конька»: если обе смежные грани
  //   одного уклона, перпендикулярные расстояния от конька до их карнизов
  //   равны. Разъехавшийся конёк — это две разные высоты у одной секции.
  const perpDistToEaves = (e, f) => {
    const dir = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const nrm = [-dir[1] / dl, dir[0] / dl];
    let best = null;
    for (const [, other] of edges) {
      if (other === e || other.type !== 'eave' || !other.facets.includes(f)) continue;
      const mid = [(other.a[0] + other.b[0]) / 2, (other.a[1] + other.b[1]) / 2];
      const d = Math.abs((mid[0] - e.a[0]) * nrm[0] + (mid[1] - e.a[1]) * nrm[1]);
      if (best == null || d > best) best = d; // the far eave of that facet
    }
    return best;
  };
  for (const e of byType.ridge) {
    if (e.facets.length !== 2) continue;
    const [A, B] = e.facets;
    if (!A.plane || !B.plane) continue;
    const pA = gradMag(A.plane) * 12, pB = gradMag(B.plane) * 12;
    if (Math.abs(pA - pB) > 0.1) continue;      // unequal pitches: ridge is off-centre by design
    const dA = perpDistToEaves(e, A), dB = perpDistToEaves(e, B);
    if (dA == null || dB == null) continue;
    if (Math.abs(dA - dB) > ridgeCentreTolFt(pA))
      err('R17', `конёк не по центру пролёта: ${A.id} ${dA.toFixed(1)} ft против ${B.id} ${dB.toFixed(1)} ft при равном уклоне ${pA.toFixed(1)}/12`);
  }
  if (!out.some((r) => r.id === 'R17')) ok('R17', 'коньки по центру пролёта при равных уклонах');

  // ─ 11c. R18: у чистой вальмы над выпуклым контуром граней ровно n (№7)
  //   Условие применимости: контур выпуклый и гейблов нет — иначе предикат
  //   неопределён (гейбл сливает две грани в одну).
  {
    let convex = true;
    for (let i = 0; i < fp.length && convex; i++) {
      const p0 = fp[(i - 1 + fp.length) % fp.length], p1 = fp[i], p2 = fp[(i + 1) % fp.length];
      const cr = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
      if (cr * fpOrient < 0) convex = false;
    }
    if (convex && byType.rake.length === 0) {
      if (facets.length !== fp.length)
        warn('R18', `выпуклый контур из ${fp.length} сторон без гейблов должен дать ${fp.length} граней, а их ${facets.length}`);
      else ok('R18', `чистая вальма: ${facets.length} граней на ${fp.length} сторон контура`);
    } else {
      ok('R18', `пропущено (контур ${convex ? 'выпуклый' : 'невыпуклый'}, гейблов ${byType.rake.length})`);
    }
  }

  // ─ 12. Нормативы: минимальный уклон материала
  const mat = model.material || 'asphalt';
  const minP = MIN_PITCH[mat];
  if (minP == null) warn('R14', `неизвестный материал "${mat}", проверка минимального уклона пропущена`);
  else {
    for (const f of facets) {
      const p = f.plane ? gradMag(f.plane) * 12 : f.pitch;
      if (p + EPS_PITCH * 12 < minP)
        err('R14', `${f.id}: уклон ${p.toFixed(1)}/12 ниже минимума ${minP}/12 для ${mat} (IRC R905)`);
      else if (mat === 'asphalt' && p < DOUBLE_UNDERLAY_BELOW)
        warn('R14', `${f.id}: уклон ${p.toFixed(1)}/12 — нужна двойная подкладка (IRC R905.2.2)`);
    }
  }
  if (!out.some((r) => r.id === 'R14')) ok('R14', `уклоны допустимы для материала «${mat}»`);

  // ─ 13. Микро-сегменты
  const stubs = [...edges.values()].filter((e) => e.len < STUB_FT);
  if (stubs.length) warn('R15', `${stubs.length} рёбер короче ${STUB_FT} ft — слей коллинеарные сегменты перед выводом`);
  else ok('R15', 'нет рёбер-обрубков');

  // ─ 14. Нумерация граней: от меньшей площади к большей
  const ids = facets.map((f) => f.id);
  const sorted = facets.slice().sort((a, b) => a.planArea - b.planArea).map((f) => f.id);
  if (ids.join() !== sorted.join())
    warn('R16', `нумерация граней не по возрастанию площади (EagleView-конвенция): сейчас ${ids.join(',')}, ожидается ${sorted.join(',')}`);
  else ok('R16', 'грани пронумерованы от меньшей площади к большей');

  // ── отчёт в формате EagleView ───────────────────────────────────────────
  const lenOf = (t) => byType[t].reduce((s, e) => s + e.len, 0);
  const totalSloped = facets.reduce((s, f) => {
    const p = f.plane ? gradMag(f.plane) * 12 : f.pitch ?? 0;
    return s + f.planArea * slopeFactor(p);
  }, 0);
  const pitchCount = new Map();
  for (const f of facets) {
    const p = Math.round((f.plane ? gradMag(f.plane) * 12 : f.pitch) * 2) / 2;
    pitchCount.set(p, (pitchCount.get(p) || 0) + f.planArea);
  }
  const predominant = [...pitchCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const waste = byType.valley.length ? (byType.hip.length ? 0.18 : 0.12)
    : byType.hip.length ? 0.15 : 0.10;

  const report = {
    totalPlanArea: +fpArea.toFixed(1),
    totalSlopedArea: +totalSloped.toFixed(1),
    totalFacets: facets.length,
    predominantPitch: `${predominant}/12`,
    lengths: {
      ridges: { ft: +lenOf('ridge').toFixed(1), count: byType.ridge.length },
      hips: { ft: +lenOf('hip').toFixed(1), count: byType.hip.length },
      valleys: { ft: +lenOf('valley').toFixed(1), count: byType.valley.length },
      rakes: { ft: +lenOf('rake').toFixed(1), count: byType.rake.length },
      eaves: { ft: +lenOf('eave').toFixed(1), count: byType.eave.length },
    },
    dripEdgeFt: +(lenOf('eave') + lenOf('rake')).toFixed(1),
    wasteFactor: waste,
    squares: Math.ceil((totalSloped / 100) * (1 + waste) * 100) / 100,
    squaresRounded: Math.ceil((totalSloped / 100) * (1 + waste)),
    hipValleyFactorAtPredominant: +hipFactor(predominant).toFixed(3),
    slopeFactorAtPredominant: +slopeFactor(predominant).toFixed(3),
  };

  return { results: out, report };
}

// ── CLI ───────────────────────────────────────────────────────────────────
// Windows argv[1] carries backslashes while import.meta.url is a file:// URL
// with forward slashes — split on BOTH, or main never runs and every model
// "passes" with exit 0 and no output.
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isMain) {
  const path = process.argv[2];
  if (!path) { console.error('usage: node validate-roof.mjs <model.json>'); process.exit(2); }
  const model = JSON.parse(readFileSync(path, 'utf8'));
  const { results, report } = validateRoof(model);

  const errors = results.filter((r) => r.level === 'error');
  const warns = results.filter((r) => r.level === 'warn');

  for (const r of results) {
    const tag = r.level === 'ok' ? 'PASS' : r.level === 'warn' ? 'WARN' : 'FAIL';
    console.log(`${tag}  [${r.id}] ${r.msg}`);
  }
  if (report) {
    console.log('\n── ОТЧЁТ ──');
    console.log(JSON.stringify(report, null, 2));
  }
  console.log(`\n${errors.length} ошибок, ${warns.length} предупреждений`);
  process.exit(errors.length ? 1 : 0);
}

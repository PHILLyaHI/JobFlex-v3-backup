// DSM survey — the DATA half of what the old reconstruction did, split out of
// the origin monolith (src/lib/roofRecon.ts) so the Instant data path never
// loads the drawing engine: building isolation, ground level, penetration
// pixels, mask component areas — plus the lat/lng→frame projection the Instant
// outlines need. Pure computation: no I/O, no env, no fetch.
//
// Brought over from the JobFlex-roofcore clone (its data-only cut of the same
// file); the geometry that used to follow (clustering, planes, model assembly)
// lives only in the monolith and is untouched here.


const FT_PER_M = 3.28084;

export interface ReconRaster {
  width: number;
  height: number;
  data: Float32Array;
  pixelSizeM: number;
}

export interface ReconOptions {
  normalWindow?: number; //    half-width in px for the normal fit (default 2 → 5x5)
  angleTolDeg?: number; //     max normal deviation when growing a plane (default 14)
  planeTolFt?: number; //      max distance from the fitted plane (default 0.6)
  minFacetSqft?: number; //    clusters below this are dropped or become penetrations
  simplifyTolFt?: number; //   Douglas–Peucker tolerance on the traced ring
  snapTolDeg?: number; //      snap an edge to a dominant orientation within this
  weldTolFt?: number; //       corner welding radius
  maxCornerShiftFt?: number; //  reject a corner intersection further than this
  parcel?: ParcelFrame; //       scopes which structures belong to the property
  mergeAngleDeg?: number; //     coplanar-merge normal tolerance (0 disables)
  mergeOffsetFt?: number; //     coplanar-merge height tolerance
  /** Candidate pitches in rise/12 — typically Google's per-segment values,
   *  rounded. Empty = snap to the nearest integer. */
  pitchPriors12?: number[];
  pitchSnapMax12?: number; //    refuse to move a pitch further than this (0 disables)
  /** Заявленные кольца пенетраций (Instant ROOFPENETRATION), в футах
   *  РАСТРОВОГО кадра (x восток, y север от центра растра). Их пиксели
   *  исключаются из подгонки плоскостей и роста регионов. */
  penetrationRingsFt?: Array<Array<{ x: number; y: number }>>;
  maxPitch12?: number; //        steeper than this is a wall, not roof (default 24)
  wallProbeFt?: number; //       how far past an edge to look for a wall
  wallStepFt?: number; //        height rise that counts as a wall
  azimuthSnapMaxDeg?: number; // snap facet azimuth onto the roof axes (0 disables)
}

// lat/lng → the tile's local-feet frame. Equirectangular about the tile centre,
// same approach the fence studio uses at this scale. Note UTM grid convergence
// means the raster's axes can sit up to ~3 deg off true north, so a converted
// parcel ring can be a few feet out at the tile edge — harmless here, because it
// is only used for a centroid-inside test and structures sit well inside a lot.
export function latLngRingToFrame(
  origin: { lat: number; lng: number },
  ring: Array<{ lat: number; lng: number }>,
): ParcelFrame {
  const D2R = Math.PI / 180;
  const EARTH_R_M = 6378137;
  return {
    ring: ring.map((p) => ({
      x: (p.lng - origin.lng) * D2R * Math.cos(origin.lat * D2R) * EARTH_R_M * FT_PER_M,
      y: (p.lat - origin.lat) * D2R * EARTH_R_M * FT_PER_M,
    })),
  };
}

// ReconResult удалён вместе с движком (roofcore): обмер отдаёт DsmSurvey

// ── small vector / geometry helpers ──────────────────────────────────────────

export interface Plane {
  a: number; //  z = a*x + b*y + c, in feet
  b: number;
  c: number;
}

// Pitch as rise per 12 (EagleView's convention).
export function planePitch12(p: Plane): number {
  return Math.hypot(p.a, p.b) * 12;
}


export function fitPlane(pts: Array<{ x: number; y: number; z: number }>): Plane | null {
  // Normal equations for z = ax + by + c.
  let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  const n = pts.length;
  if (n < 3) return null;
  for (const p of pts) {
    sx += p.x; sy += p.y; sz += p.z;
    sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y;
    sxz += p.x * p.z; syz += p.y * p.z;
  }
  // Solve the 3x3 system by Cramer's rule.
  const m = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const rhs = [sxz, syz, sz];
  const det3 = (M: number[][]) =>
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det3(m);
  if (Math.abs(D) < 1e-9) return null;
  const col = (i: number) => {
    const M = m.map((r) => r.slice());
    for (let r = 0; r < 3; r++) M[r][i] = rhs[r];
    return det3(M) / D;
  };
  return { a: col(0), b: col(1), c: col(2) };
}







// ── 1. isolate the subject building ──────────────────────────────────────────
// The Solar mask covers EVERY building in the tile. Keep only the connected
// component under the tile centre (the queried address).

// Parcel ring expressed in the tile's local-feet frame (+x east, +y north, origin
// at the tile centre = the queried address).
export interface ParcelFrame {
  ring: Array<{ x: number; y: number }>;
}

function pointInRingFt(x: number, y: number, ring: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y, xj = ring[j].x, yj = ring[j].y;
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function isolateBuilding(
  mask: ReconRaster,
  report?: { componentPx: number[]; keptComponents: number },
  parcel?: ParcelFrame,
  stepFt = 0,
): Uint8Array {
  const { width: w, height: h, data } = mask;
  const label = new Int32Array(w * h).fill(-1);
  const comps: Array<{ id: number; size: number; sx: number; sy: number }> = [];
  let next = 0;
  const stack: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] < 0.5 || label[i] !== -1) continue;
    const id = next++;
    let size = 0, sx = 0, sy = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % w, py = (p - px) / w;
      size++; sx += px; sy += py;
      // 8-connectivity: roof pixels can touch diagonally across a valley.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (data[q] >= 0.5 && label[q] === -1) { label[q] = id; stack.push(q); }
        }
      }
    }
    comps.push({ id, size, sx: sx / size, sy: sy / size });
  }
  const out = new Uint8Array(w * h);
  if (report) {
    report.componentPx = comps
      .map((c) => c.size)
      .sort((a, b) => b - a)
      .slice(0, 8);
  }
  if (!comps.length) return out;

  const cx = w / 2, cy = h / 2;
  const centreIdx = Math.floor(cy) * w + Math.floor(cx);

  // With a parcel ring, keep EVERY structure whose centroid falls inside it — a
  // property's detached garage or wing is a separate mask component, and taking
  // only the one under the pin understated multi-structure roofs badly (measured:
  // -62% on a San Antonio lot with 4 buildings). Note the largest component is
  // NOT a safe proxy: at 419 Prairie Ridge Ln the biggest blob in the tile is the
  // NEIGHBOUR's house (3769 sqft vs the subject's 3403), which is exactly why the
  // parcel boundary is required rather than a size or distance heuristic.
  if (parcel && parcel.ring.length >= 3 && stepFt > 0) {
    const keep = new Set<number>();
    for (const c of comps) {
      const fx = (c.sx + 0.5 - cx) * stepFt;
      const fy = (cy - c.sy - 0.5) * stepFt;
      if (pointInRingFt(fx, fy, parcel.ring)) keep.add(c.id);
    }
    // Never return nothing: if the parcel excludes everything (bad geocode, or
    // the ring is offset), fall back to the component under the pin.
    if (keep.size) {
      for (let i = 0; i < out.length; i++) if (keep.has(label[i])) out[i] = 1;
      if (report) report.keptComponents = keep.size;
      return out;
    }
  }

  // Prefer the component actually under the centre pixel; otherwise the largest
  // component whose centroid is nearest the centre (the pin can land on a gap
  // between facets, or slightly off the structure).
  let chosen = label[centreIdx] >= 0 ? label[centreIdx] : -1;
  if (chosen < 0) {
    let bestScore = -Infinity;
    for (const c of comps) {
      const dist = Math.hypot(c.sx - cx, c.sy - cy);
      const score = c.size / (1 + dist * dist);
      if (score > bestScore) { bestScore = score; chosen = c.id; }
    }
  }
  for (let i = 0; i < out.length; i++) if (label[i] === chosen) out[i] = 1;
  if (report) report.keptComponents = 1;
  return out;
}


/**
 * ОБМЕР DSM (data-only, roofcore): изоляция строения, уровень земли и
 * маска пенетраций — то, что осталось от reconstructRoof после удаления
 * движка построения (кластеризация/плоскости/модель вырезаны по
 * подтверждению владельца; §J: маска пенетраций и ground — добыча).
 */
export interface DsmSurvey {
  buildingPx: number;
  groundElevFt: number;
  penetrationPx: number[];
  maskPerimeterFt: number;
  maskComponentsSqft: number[];
  keptComponents: number;
  planPolygonSqft: number;
}

export function surveyDsm(
  dsm: ReconRaster,
  mask: ReconRaster,
  opts: ReconOptions = {},
): DsmSurvey {
  const { width: w, height: h, pixelSizeM } = dsm;
  const stepFt = pixelSizeM * FT_PER_M;
  const minFacetSqft = opts.minFacetSqft ?? 12; // тот же пол грани, что у движка
  const maskReport = { componentPx: [] as number[], keptComponents: 0 };
  const building = isolateBuilding(mask, maskReport, opts.parcel, stepFt);
  let buildingPx = 0;
  for (let i = 0; i < building.length; i++) buildingPx += building[i];

  // True outline length of the isolated footprint, straight off the raster. This
  // is the yardstick for the polygons: the sum of their perimeter edges has to
  // land near it, and a shortfall means they are not following the roof edge.
  // (Counted as boundary-pixel edge segments, then scaled by 0.95 to undo the
  // staircase overestimate a rasterized outline always carries.)
  let boundarySegments = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (!building[py * w + px]) continue;
      if (px === 0 || !building[py * w + px - 1]) boundarySegments++;
      if (px === w - 1 || !building[py * w + px + 1]) boundarySegments++;
      if (py === 0 || !building[(py - 1) * w + px]) boundarySegments++;
      if (py === h - 1 || !building[(py + 1) * w + px]) boundarySegments++;
    }
  }
  const maskPerimeterFt = boundarySegments * stepFt * 0.95;

  // Ground reference: a low percentile of the terrain OUTSIDE the building, so
  // z=0 sits at grade rather than at the lowest roof pixel.
  const offRoof: number[] = [];
  for (let i = 0; i < dsm.data.length; i++) if (!building[i]) offRoof.push(dsm.data[i]);
  offRoof.sort((a, b) => a - b);
  const groundElevFt =
    (offRoof.length ? offRoof[Math.floor(offRoof.length * 0.2)] : 0) * FT_PER_M;

  // ── МАСКА ПЕНЕТРАЦИЙ (2026-08-30) ──────────────────────────────────────────
  // Труба/вент загрязняет подгонку плоскостей и рост регионов ИЗНУТРИ
  // кластера (12629: z-рассогласование A7/A3 до 3.8 ft у гребня, куст
  // осколков A1, шпилька ендовы). Пиксели пенетраций исключаются ДО
  // кластеризации, не постфактум. Источники: заявленные кольца
  // (opts.penetrationRingsFt) и DSM-клифы — блоб пикселей над медианой
  // окружающего кольца на ≥ переписной пол ступени (2.0 ft, бимодальный
  // зазор 1.8–2.2) площадью ≤ minFacetSqft (меньше грани — не
  // архитектура). Радиусы кольца — из того же minFacetSqft: полуширина
  // блоба √12/2 ≈ 1.7 ft → внутренний 2 ft, внешний 4 ft.
  const pen = new Uint8Array(w * h);
  {
    const PEN_DZ_FT = 2.0;
    const rIn = Math.max(1, Math.ceil(2 / stepFt));
    const rOut = Math.max(rIn + 1, Math.ceil(4 / stepFt));
    const zft = (i: number): number => dsm.data[i] * FT_PER_M - groundElevFt;
    const cand = new Uint8Array(w * h);
    const base = new Float32Array(w * h);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = py * w + px;
        if (!building[i]) continue;
        const ringZ: number[] = [];
        for (let dy = -rOut; dy <= rOut; dy++) {
          for (let dx = -rOut; dx <= rOut; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < rIn) continue;
            const qx = px + dx;
            const qy = py + dy;
            if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
            const q = qy * w + qx;
            if (building[q]) ringZ.push(zft(q));
          }
        }
        if (ringZ.length < 8) continue;
        ringZ.sort((a2, b2) => a2 - b2);
        const med = ringZ[Math.floor(ringZ.length / 2)];
        if (zft(i) - med >= PEN_DZ_FT) { cand[i] = 1; base[i] = med; }
      }
    }
    const capPx = Math.ceil(minFacetSqft / (stepFt * stepFt));
    const seenP = new Uint8Array(w * h);
    for (let s2 = 0; s2 < cand.length; s2++) {
      if (!cand[s2] || seenP[s2]) continue;
      // возвышенный объект мерится ЦЕЛИКОМ: разлив от кандидата по всем
      // пикселям выше ЕГО базы (медианы кольца) на ≥ порог — угол дормера
      // локально неотличим от трубы, но разлив охватывает весь дормер
      // (30 sf > cap → архитектура), а трубу — только её квадрат
      const med0 = base[s2];
      const blob: number[] = [s2];
      seenP[s2] = 1;
      for (let bi = 0; bi < blob.length; bi++) {
        const i = blob[bi];
        const bx = i % w;
        const by = Math.floor(i / w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const qx = bx + dx;
          const qy = by + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const q = qy * w + qx;
          if (seenP[q] || !building[q]) continue;
          if (zft(q) - med0 >= PEN_DZ_FT) { seenP[q] = 1; blob.push(q); }
        }
      }
      // компактность: пенетрация — квадратный блоб (труба), не дуга вдоль
      // ребра настоящей ступени/дормера (обод даёт кандидатов шириной в
      // пиксель — маска не смеет есть архитектуру). Сторона bbox ≤
      // √minFacetSqft ≈ 3.5 ft — из того же закона «меньше грани».
      let minX = w, maxX = 0, minY = h, maxY = 0;
      for (const i of blob) {
        const bx = i % w;
        const by = Math.floor(i / w);
        minX = Math.min(minX, bx); maxX = Math.max(maxX, bx);
        minY = Math.min(minY, by); maxY = Math.max(maxY, by);
      }
      const sidePx = Math.ceil(Math.sqrt(minFacetSqft) / stepFt);
      const compact = maxX - minX + 1 <= sidePx && maxY - minY + 1 <= sidePx;
      if (compact && blob.length <= capPx) for (const i of blob) pen[i] = 1;
    }
    const inPoly = (x: number, y: number, ring: Array<{ x: number; y: number }>): boolean => {
      let ins = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a2 = ring[i];
        const b2 = ring[j];
        if (a2.y > y !== b2.y > y && x < ((b2.x - a2.x) * (y - a2.y)) / (b2.y - a2.y) + a2.x) ins = !ins;
      }
      return ins;
    };
    const cx2 = w / 2;
    const cy2 = h / 2;
    for (const ring of opts.penetrationRingsFt ?? []) {
      if (ring.length < 3) continue;
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const i = py * w + px;
          if (!building[i] || pen[i]) continue;
          if (inPoly((px + 0.5 - cx2) * stepFt, (cy2 - py - 0.5) * stepFt, ring)) pen[i] = 1;
        }
      }
    }
  }
  const penetrationPx: number[] = [];
  for (let i = 0; i < pen.length; i++) if (pen[i]) penetrationPx.push(i);
  // partic — участники измерения: контур/периметр/земля остаются на building
  const partic = building.slice() as Uint8Array;
  for (const i of penetrationPx) partic[i] = 0;
  void partic;
  return {
    buildingPx,
    groundElevFt,
    penetrationPx,
    maskPerimeterFt,
    maskComponentsSqft: maskReport.componentPx.map((n) => n * stepFt * stepFt),
    keptComponents: maskReport.keptComponents,
    planPolygonSqft: buildingPx * stepFt * stepFt,
  };
}

// Splitting a roof into MASSES by height, with adjacency — measurement only.
//
// Four detectors have now failed to say how many masses a house has: cluster
// count against contour edges, pitch spread (§K6), EagleView's `shape` (which
// answers a different question), and the vision read (which adds nothing over
// the skeleton). This does not detect. It SEGMENTS, always, and the answer
// "one level" is a perfectly good answer that changes nothing downstream.
//
// WHY A HEIGHT THRESHOLD ALONE CANNOT WORK, measured: the spread of ridge
// heights WITHIN one mass on 12629 is 3.5 ft, wider than the gap BETWEEN the
// two top masses of 12621, which is 2.3 ft. No cut on the height histogram
// separates those two cases. So the split is not made on height VALUES at all —
// it is made on height DISCONTINUITY between neighbouring pixels, and then only
// where the resulting regions are each connected in plan.
//
// THE THRESHOLD IS DERIVED, not chosen. Between two adjacent roof pixels the
// height can rise at most by the steepest slope this pipeline will call roof:
//
//     maxRisePerPixel = pixelSizeFt * MAX_ROOF_PITCH_12 / 12
//
// MAX_ROOF_PITCH_12 is roofRecon's own `maxPitch12` default of 24 — the figure
// it already uses for "steeper than this is a wall, not roof". Anything beyond
// that between neighbours is not a slope; it is a step, which is to say a wall.
// At 0.1 m per pixel that is 0.66 ft.
import { fitPlane } from "@/lib/roofRecon";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

/** roofRecon's own ceiling on what counts as roof rather than wall. */
const MAX_ROOF_PITCH_12 = 24;
/** Same floor as everywhere else: below this a region is a dormer, not a mass. */
const MIN_MASS_SQFT = 100;

export interface MassSegment {
  id: number;
  /** Plan area, square feet. */
  planSqft: number;
  /** Height above ground, feet. */
  minFt: number;
  maxFt: number;
  medianFt: number;
  /** Median local slope over the mass, rise per 12. */
  pitch12: number;
  /** Axis-aligned plan extent, feet. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Long axis: length, and its compass bearing. */
  longFt: number;
  shortFt: number;
  axisDeg: number;
  centroid: FootprintPoint;
}

export interface MassBoundary {
  a: number;
  b: number;
  /** Total run of the shared step, feet. */
  lengthFt: number;
  /** Median height difference across it, feet. */
  stepFt: number;
  /** Where it sits, frame feet — the midpoint of the shared pixels. */
  at: FootprintPoint;
}

export interface MassSegmentation {
  masses: MassSegment[];
  boundaries: MassBoundary[];
  /** Roof pixels considered, and how many fell in kept masses. */
  roofPx: number;
  keptPx: number;
  /** Pixels sitting on a step and therefore removed before components. */
  wallPx: number;
  /** The derived step, printed so the reader can check it against the pixel size. */
  stepThresholdFt: number;
  /** Regions found but below the area floor — reported, never silently dropped. */
  droppedSmall: number;
}

export interface MassSegmentInput {
  /** Height above ground per pixel, feet; NaN or <=0 where not roof. */
  heightFt: Float32Array;
  width: number;
  height: number;
  /** Ground size of one pixel, feet. */
  pixelFt: number;
  /** Frame-feet position of pixel (0,0)'s centre; x east, y north. */
  originPx: { x: number; y: number };
  /** Only pixels inside this ring are considered, when given. */
  contour?: readonly FootprintPoint[];
  /** Below this height above ground a pixel is ground, not roof. */
  minRoofFt?: number;
}

const inRing = (p: FootprintPoint, r: readonly FootprintPoint[]): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};

const median = (v: number[]): number => {
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function segmentMasses(input: MassSegmentInput): MassSegmentation {
  const { heightFt, width: w, height: h, pixelFt, originPx } = input;
  const minRoofFt = input.minRoofFt ?? 3;
  const stepThresholdFt = (pixelFt * MAX_ROOF_PITCH_12) / 12;

  const px = (i: number) => ({ x: originPx.x + (i % w) * pixelFt, y: originPx.y - Math.floor(i / w) * pixelFt });

  // Which pixels are roof at all.
  const isRoof = new Uint8Array(w * h);
  let roofPx = 0;
  for (let i = 0; i < w * h; i++) {
    const z = heightFt[i];
    if (!Number.isFinite(z) || z < minRoofFt) continue;
    if (input.contour && !inRing(px(i), input.contour)) continue;
    isRoof[i] = 1;
    roofPx++;
  }

  // WALL PIXELS, removed before components are found.
  //
  // Cutting only the EDGES between steep neighbours does not separate anything:
  // a flood fill leaks through any single pair the step missed, and measured on
  // 12629 that left the whole roof as one component even though 3.3% of
  // neighbour pairs exceed the threshold and the survey drew 29.4 ft of step
  // flashing across it. A wall in a stereo-derived DSM is a ragged line, not a
  // clean cut, so the line has to be made solid before it can separate.
  //
  // A pixel is on a wall if it is steeply above or below ANY neighbour. Taking
  // those out of the roof set turns the ragged edge into a gap of real width.
  const isWall = new Uint8Array(w * h);
  let wallPx = 0;
  for (let i = 0; i < w * h; i++) {
    if (!isRoof[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!isRoof[j]) continue;
      if (Math.abs(heightFt[j] - heightFt[i]) > stepThresholdFt) { isWall[i] = 1; wallPx++; break; }
    }
  }
  for (let i = 0; i < w * h; i++) if (isWall[i]) isRoof[i] = 0;

  // Connected components, cutting where neighbours differ by more than one
  // pixel of the steepest roof this pipeline admits.
  const label = new Int32Array(w * h).fill(-1);
  const regions: number[][] = [];
  for (let seed = 0; seed < w * h; seed++) {
    if (!isRoof[seed] || label[seed] !== -1) continue;
    const id = regions.length;
    const pixels: number[] = [];
    const stack = [seed];
    label[seed] = id;
    while (stack.length) {
      const i = stack.pop() as number;
      pixels.push(i);
      const x = i % w;
      const y = (i - x) / w;
      const zi = heightFt[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!isRoof[j] || label[j] !== -1) continue;
        if (Math.abs(heightFt[j] - zi) > stepThresholdFt) continue; // a step, not a slope
        label[j] = id;
        stack.push(j);
      }
    }
    regions.push(pixels);
  }

  // Keep the ones big enough to be a mass. Adjacency is already guaranteed:
  // a region is one connected component by construction, which is exactly the
  // "each level connected in plan" requirement — a level scattered over the
  // roof in unconnected patches never becomes a mass here.
  const areaOfPx = pixelFt * pixelFt;
  const kept: Array<{ id: number; pixels: number[] }> = [];
  let droppedSmall = 0;
  regions.forEach((pixels, id) => {
    if (pixels.length * areaOfPx >= MIN_MASS_SQFT) kept.push({ id, pixels });
    else droppedSmall++;
  });

  const idOf = new Map(kept.map((k, n) => [k.id, n]));
  const masses: MassSegment[] = kept.map((k, n) => {
    const pts = k.pixels.map((i) => ({ ...px(i), z: heightFt[i] }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const zs = pts.map((p) => p.z);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;

    // Long axis by second moments — the direction the mass actually runs, which
    // is what a ridge would follow.
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const n2 = pts.length;
    sxx /= n2; syy /= n2; sxy /= n2;
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ax = Math.cos(theta), ay = Math.sin(theta);
    let lo1 = Infinity, hi1 = -Infinity, lo2 = Infinity, hi2 = -Infinity;
    for (const p of pts) {
      const u = (p.x - cx) * ax + (p.y - cy) * ay;
      const v = -(p.x - cx) * ay + (p.y - cy) * ax;
      if (u < lo1) lo1 = u; if (u > hi1) hi1 = u;
      if (v < lo2) lo2 = v; if (v > hi2) hi2 = v;
    }

    // Pitch: the median local slope, sampled by fitting a plane to each pixel's
    // small neighbourhood inside this mass. A single fit over the whole mass
    // would average a gable's two sides to nearly flat.
    const slopes: number[] = [];
    for (let s = 0; s < k.pixels.length; s += Math.max(1, Math.floor(k.pixels.length / 400))) {
      const i = k.pixels[s];
      const x = i % w, y = (i - x) / w;
      const nb: Array<{ x: number; y: number; z: number }> = [];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx2 = x + dx, ny2 = y + dy;
          if (nx2 < 0 || ny2 < 0 || nx2 >= w || ny2 >= h) continue;
          const j = ny2 * w + nx2;
          if (label[j] !== k.id) continue;
          nb.push({ x: dx * pixelFt, y: -dy * pixelFt, z: heightFt[j] });
        }
      }
      if (nb.length < 8) continue;
      const pl = fitPlane(nb);
      if (pl) slopes.push(Math.hypot(pl.a, pl.b) * 12);
    }

    return {
      id: n,
      planSqft: k.pixels.length * areaOfPx,
      minFt: Math.min(...zs),
      maxFt: Math.max(...zs),
      medianFt: median(zs),
      pitch12: median(slopes),
      bbox: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
      longFt: hi1 - lo1,
      shortFt: hi2 - lo2,
      axisDeg: ((Math.atan2(ax, ay) * 180) / Math.PI + 360) % 360,
      centroid: { x: cx, y: cy },
    };
  });

  // The wall between two masses. They no longer touch — a strip of wall pixels
  // sits between them — so the boundary is read from the WALL pixels: each one
  // is attributed to the pair of masses it separates.
  const pairs = new Map<string, { steps: number[]; xs: number[]; ys: number[] }>();
  for (let i = 0; i < w * h; i++) {
    if (!isWall[i]) continue;
    const x = i % w, y = (i - x) / w;
    const touching = new Map<number, number>();
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (label[j] < 0) continue;
        const m = idOf.get(label[j]);
        if (m === undefined) continue;
        touching.set(m, heightFt[j]);
      }
    }
    if (touching.size !== 2) continue;
    const [[a, za], [b, zb]] = [...touching.entries()].sort((u, v) => u[0] - v[0]);
    const key = `${a}|${b}`;
    const rec = pairs.get(key) ?? { steps: [], xs: [], ys: [] };
    rec.steps.push(Math.abs(za - zb));
    const p = px(i);
    rec.xs.push(p.x);
    rec.ys.push(p.y);
    pairs.set(key, rec);
  }
  const boundaries: MassBoundary[] = [...pairs.entries()].map(([key, rec]) => {
    const [a, b] = key.split("|").map(Number);
    return {
      a,
      b,
      lengthFt: rec.steps.length * pixelFt,
      stepFt: median(rec.steps),
      at: { x: rec.xs.reduce((s, v) => s + v, 0) / rec.xs.length, y: rec.ys.reduce((s, v) => s + v, 0) / rec.ys.length },
    };
  });

  return {
    masses,
    boundaries: boundaries.sort((x, y) => y.lengthFt - x.lengthFt),
    roofPx,
    wallPx,
    keptPx: kept.reduce((s, k) => s + k.pixels.length, 0),
    stepThresholdFt,
    droppedSmall,
  };
}

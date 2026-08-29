// Masses from their RIDGES, not from what lies between them.
//
// Six attempts looked for a BOUNDARY between masses and found none, for a
// reason now established: on these roofs the masses are not separated by
// anything. The surface runs continuously and monotonically down from one mass
// into the next, so there is no step to cut on and no saddle to cut on.
//
// The reformulation: a mass is defined by its OWN ridge — its direction, its
// height, its eaves — not by what sits between it and its neighbour. Ridges we
// can already find; the lidar crease detector does it, and 9903's main ridge
// came from exactly that (36 -> 72 ft of ridge footage). This does the same
// search over the WHOLE roof surface rather than inside the facets the current
// model happens to have drawn, and then lets each ridge claim the ground that
// drains to it. Valleys then fall out as the places two claims meet — a
// consequence, not an input.
//
// THE RIDGE TEST is the crease test, localised: at a ridge the surface falls
// away on both sides, and the two sides drain in OPPOSITE directions. A pixel
// qualifies when, stepping along its own downslope direction both ways, the
// height drops both times AND the far-side bearings are opposed. A peak passes
// the first half and fails the second, which is what keeps chimneys out — 419
// showed a 12 ft saddle over a 17 sq ft chimney, so that distinction earns its
// keep.
import { fitPlane } from "@/lib/roofRecon";
import { DSM_NOISE_FLOOR_FT } from "@/lib/roofRecon/pitchFromDsm";
import { COVERAGE_CLEAR } from "@/lib/roofDiagram/confidence";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

/**
 * How far to either side the test looks, feet. The lidar crease detector
 * samples its two half-planes over a 5 ft band (BAND_FT in creases.ts) — the
 * same reach, for the same reason: closer in and the two sides are the same
 * plane, further out and a second crease enters the window.
 */
const PROBE_FT = 5;
/**
 * Two sides count as opposed when their bearings differ by more than this. A
 * true ridge is 180 degrees; the allowance is the same 45 that the drainage
 * checks elsewhere use before calling a direction wrong.
 */
const OPPOSED_MIN_DEG = 120;
/**
 * A ridge shorter than this cannot be confirmed by the lidar at 1 point per
 * square foot — measured, 61 of 90 lines checkable at 8 ft. Kept as the floor
 * here so the DSM's ridges and the lidar's are comparable.
 */
const MIN_RIDGE_FT = 8;

export interface RidgeLine {
  id: number;
  a: FootprintPoint;
  b: FootprintPoint;
  lengthFt: number;
  /** Median height above ground along it. */
  heightFt: number;
  /** Compass bearing of the run. */
  dirDeg: number;
  /** Median pitch of the two flanks, rise per 12. */
  pitchLeft12: number;
  pitchRight12: number;
  /** Ground draining to this ridge, square feet — the mass it defines. */
  claimSqft: number;
  pixels: number;
}

export interface RidgeMassing {
  ridges: RidgeLine[];
  /** Share of the roof some ridge accounts for, 0-1. */
  claimShare: number;
  /**
   * Whether the massing may be BUILT ON. The threshold is COVERAGE_CLEAR, and
   * it is not a new number nor a chosen one: that constant states how much of a
   * roof may be inferred rather than measured before the figures stop fitting
   * inside the waste factor a contractor already carries. Roof no ridge claims
   * is roof this method cannot draw, which is inference in exactly that sense.
   *
   * Measured 2026-08-28 on six addresses: 93, 71, 58, 54, 32, 19 per cent.
   * NOTHING clears 95. 9903 misses by two points, and it is the one address
   * where the split is demonstrably right. Relaxing the bar to 90 would admit
   * exactly that one address, which is a threshold chosen to fit an answer, so
   * it is not done here — the bar stays where the pipeline already put it and
   * the shortfall is reported.
   */
  accepted: boolean;
  /** Roof pixels, and how many were claimed by some ridge. */
  roofPx: number;
  claimedPx: number;
  /** Ridge pixels found before grouping and the length filter. */
  ridgePx: number;
  /** Segments dropped for being shorter than the lidar could confirm. */
  droppedShort: number;
  minRidgeFt: number;
}

export interface RidgeLinesInput {
  heightFt: Float32Array;
  width: number;
  height: number;
  pixelFt: number;
  originPx: { x: number; y: number };
  contour?: readonly FootprintPoint[];
  minRoofFt?: number;
}

const inRing = (p: FootprintPoint, r: readonly FootprintPoint[]): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};

const angDiff = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
};

const median = (v: number[]): number => {
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function ridgeLines(input: RidgeLinesInput): RidgeMassing {
  const { heightFt, width: w, height: h, pixelFt, originPx } = input;
  const minRoofFt = input.minRoofFt ?? 3;
  const px = (i: number) => ({ x: originPx.x + (i % w) * pixelFt, y: originPx.y - Math.floor(i / w) * pixelFt });
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);

  const roof = new Uint8Array(w * h);
  let roofPx = 0;
  for (let i = 0; i < w * h; i++) {
    const z = heightFt[i];
    if (!Number.isFinite(z) || z < minRoofFt) continue;
    if (input.contour && !inRing(px(i), input.contour)) continue;
    roof[i] = 1;
    roofPx++;
  }

  // ── local plane per pixel: which way it drains, and how steeply ──
  const azm = new Float32Array(w * h).fill(NaN);
  const pit = new Float32Array(w * h).fill(NaN);
  const R = 2;
  for (let i = 0; i < w * h; i++) {
    if (!roof[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    const pts: Array<{ x: number; y: number; z: number }> = [];
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const j = at(x + dx, y + dy);
        if (j < 0 || !roof[j]) continue;
        pts.push({ x: dx * pixelFt, y: -dy * pixelFt, z: heightFt[j] });
      }
    }
    if (pts.length < 8) continue;
    const pl = fitPlane(pts);
    if (!pl) continue;
    azm[i] = ((Math.atan2(-pl.a, -pl.b) * 180) / Math.PI + 360) % 360;
    pit[i] = Math.hypot(pl.a, pl.b) * 12;
  }

  // ── ridge pixels ──
  const probePx = Math.max(2, Math.round(PROBE_FT / pixelFt));
  const isRidge = new Uint8Array(w * h);
  let ridgePx = 0;
  for (let i = 0; i < w * h; i++) {
    if (!roof[i] || !Number.isFinite(azm[i])) continue;
    const x = i % w;
    const y = (i - x) / w;
    // Unit step along this pixel's own downslope, in raster terms. Compass
    // bearing: 0 = north = -y in raster rows.
    const th = (azm[i] * Math.PI) / 180;
    const ux = Math.sin(th);
    const uy = -Math.cos(th);
    const fwd = at(Math.round(x + ux * probePx), Math.round(y + uy * probePx));
    const bwd = at(Math.round(x - ux * probePx), Math.round(y - uy * probePx));
    if (fwd < 0 || bwd < 0 || !roof[fwd] || !roof[bwd]) continue;
    if (!Number.isFinite(azm[fwd]) || !Number.isFinite(azm[bwd])) continue;
    // Falls away on BOTH sides — by more than the DSM's own scatter, so a flat
    // patch of noise cannot pass.
    if (heightFt[fwd] >= heightFt[i] - DSM_NOISE_FLOOR_FT) continue;
    if (heightFt[bwd] >= heightFt[i] - DSM_NOISE_FLOOR_FT) continue;
    // …and the two sides drain OPPOSITE ways. This is what separates a ridge
    // from a chimney: a chimney also falls away on all sides.
    if (angDiff(azm[fwd], azm[bwd]) < OPPOSED_MIN_DEG) continue;
    isRidge[i] = 1;
    ridgePx++;
  }

  // ── group into segments: connected ridge pixels are one ridge ──
  const label = new Int32Array(w * h).fill(-1);
  const groups: number[][] = [];
  for (let seed = 0; seed < w * h; seed++) {
    if (!isRidge[seed] || label[seed] !== -1) continue;
    const id = groups.length;
    const pixels: number[] = [];
    const stack = [seed];
    label[seed] = id;
    while (stack.length) {
      const i = stack.pop() as number;
      pixels.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = at(x + dx, y + dy);
          if (j < 0 || !isRidge[j] || label[j] !== -1) continue;
          label[j] = id;
          stack.push(j);
        }
      }
    }
    groups.push(pixels);
  }

  // ── describe each, and drop the ones the lidar could never confirm ──
  const ridges: RidgeLine[] = [];
  const keptLabel = new Int32Array(w * h).fill(-1);
  let droppedShort = 0;
  groups.forEach((pixels, gi) => {
    const pts = pixels.map(px);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ax = Math.cos(theta), ay = Math.sin(theta);
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) {
      const u = (p.x - cx) * ax + (p.y - cy) * ay;
      if (u < lo) lo = u;
      if (u > hi) hi = u;
    }
    const lengthFt = hi - lo;
    if (lengthFt < MIN_RIDGE_FT) { droppedShort++; return; }

    // Flank pitches, sampled either side of each ridge pixel.
    const left: number[] = [];
    const right: number[] = [];
    for (const i of pixels) {
      const x = i % w, y = (i - x) / w;
      const th = (azm[i] * Math.PI) / 180;
      const ux = Math.sin(th), uy = -Math.cos(th);
      const f = at(Math.round(x + ux * probePx), Math.round(y + uy * probePx));
      const b = at(Math.round(x - ux * probePx), Math.round(y - uy * probePx));
      if (f >= 0 && Number.isFinite(pit[f])) left.push(pit[f]);
      if (b >= 0 && Number.isFinite(pit[b])) right.push(pit[b]);
    }
    const id = ridges.length;
    for (const i of pixels) keptLabel[i] = id;
    ridges.push({
      id,
      a: { x: cx + ax * lo, y: cy + ay * lo },
      b: { x: cx + ax * hi, y: cy + ay * hi },
      lengthFt,
      heightFt: median(pixels.map((i) => heightFt[i])),
      dirDeg: ((Math.atan2(ax, ay) * 180) / Math.PI + 360) % 360,
      pitchLeft12: median(left),
      pitchRight12: median(right),
      claimSqft: 0,
      pixels: pixels.length,
    });
    void gi;
  });

  // ── each ridge claims what drains to it ──
  // Walk uphill from every roof pixel until a ridge pixel is reached. The land
  // that reaches a given ridge is the mass that ridge defines, and where two
  // claims meet is a valley — which is why valleys are an output here and not
  // an input.
  const claim = new Int32Array(w * h).fill(-1);
  const maxWalk = Math.ceil(200 / pixelFt);
  for (let start = 0; start < w * h; start++) {
    if (!roof[start] || !Number.isFinite(azm[start])) continue;
    let i = start;
    const path: number[] = [];
    let found = -1;
    for (let step = 0; step < maxWalk; step++) {
      if (keptLabel[i] >= 0) { found = keptLabel[i]; break; }
      if (claim[i] >= 0) { found = claim[i]; break; }
      path.push(i);
      // Steepest ascent among the eight neighbours, NOT a step along the fitted
      // bearing. Measured: following the fitted direction died within a few
      // steps on most pixels — the DSM's scatter is enough to point it at a
      // neighbour that is not actually higher — and left 10% of 12621 claimed.
      // Reading the neighbours directly is what the surface says rather than
      // what a 5x5 fit of it says.
      const x = i % w, y = (i - x) / w;
      let best = -1;
      let bestZ = heightFt[i];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j2 = at(x + dx, y + dy);
          if (j2 < 0 || !roof[j2]) continue;
          if (heightFt[j2] > bestZ) { bestZ = heightFt[j2]; best = j2; }
        }
      }
      if (best < 0) break; // a local top that is not a kept ridge — a bump
      i = best;
    }
    if (found >= 0) for (const p of path) claim[p] = found;
  }
  let claimedPx = 0;
  for (let i = 0; i < w * h; i++) {
    if (claim[i] < 0 && keptLabel[i] >= 0) claim[i] = keptLabel[i];
    if (claim[i] >= 0) { ridges[claim[i]].claimSqft += pixelFt * pixelFt; claimedPx++; }
  }

  ridges.sort((a, b) => b.claimSqft - a.claimSqft);
  const claimShare = roofPx ? claimedPx / roofPx : 0;
  return {
    ridges,
    claimShare,
    accepted: claimShare >= COVERAGE_CLEAR && ridges.length > 0,
    roofPx,
    claimedPx,
    ridgePx,
    droppedShort,
    minRidgeFt: MIN_RIDGE_FT,
  };
}

// Masses by RIDGE TOPOLOGY, not by height discontinuity — measurement only.
//
// Height segmentation was measured on 2026-08-28 and answered no: it finds
// WALLS, and the masses in this sample are not separated by walls. 12629's main
// block and east wing, 12618's wing and 12621's four ridge levels all meet at
// VALLEYS, where the roof surface runs continuously down to shared eaves. No
// threshold on a height step can see that, because there is no step.
//
// What there IS, on a continuous surface, is topology. A hip roof has ONE
// summit — a ridge, connected. A house with two masses has two summits at
// different heights, and between them the surface dips through a SADDLE: the
// low point of the valley where the two roofs meet. The depth of that saddle
// below the lower summit is the quantity that separates masses, and it exists
// precisely where the height step does not.
//
// This is persistence on the height function, computed the standard way: flood
// the roof from the top down and watch components merge. Each local maximum
// starts a component; when two components meet, the younger one dies, and its
// PERSISTENCE is its own summit height minus the height they met at. That
// meeting height is the saddle. Nothing here is tuned — the only threshold is
// how deep a saddle must be to count, and that comes from the DSM's own noise.
import { DSM_NOISE_FLOOR_FT } from "@/lib/roofRecon/pitchFromDsm";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

/**
 * A saddle shallower than this is indistinguishable from the scatter of one
 * fitted slope. Not chosen here: pitchFromDsm measured facets sitting on ONE
 * slope at p50 0.02–0.12 ft of residual and mixed ones at 0.5–1.45, and took
 * 0.2 as the boundary. The same boundary applies to a dip in the same surface.
 *
 * The full spectrum of saddle depths is reported regardless, so the reader can
 * see whether the data separates cleanly or whether this number is doing work
 * it should not.
 */
const SADDLE_FLOOR_FT = DSM_NOISE_FLOOR_FT;

export interface Summit {
  id: number;
  /** Highest point of this mass, feet above ground. */
  peakFt: number;
  /** Where that point is. */
  at: FootprintPoint;
  /**
   * How far the near-peak set runs — the ridge's own length, feet. Measured as
   * the widest separation within the pixels lying inside one noise floor of the
   * summit, which is what a ridge IS: the flat top of the surface.
   */
  ridgeFt: number;
  /** Bearing of that run, compass degrees. */
  ridgeDeg: number;
  /** Plan area draining to this summit before it merged into another. */
  planSqft: number;
  /** Summit height minus the saddle it died at; Infinity for the last survivor. */
  persistenceFt: number;
}

export interface Saddle {
  /** The two summits it joins. */
  a: number;
  b: number;
  /** Height of the meeting point, feet above ground. */
  atFt: number;
  where: FootprintPoint;
  /** Depth below the LOWER of the two summits — the separating quantity. */
  depthFt: number;
}

export interface RidgeTopology {
  /** Every local maximum found, deepest-lived first. */
  summits: Summit[];
  saddles: Saddle[];
  /** Summits whose persistence clears the floor — the masses. */
  massCount: number;
  saddleFloorFt: number;
  roofPx: number;
}

export interface RidgeTopologyInput {
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

export function ridgeTopology(input: RidgeTopologyInput): RidgeTopology {
  const { heightFt, width: w, height: h, pixelFt, originPx } = input;
  const minRoofFt = input.minRoofFt ?? 3;
  const px = (i: number) => ({ x: originPx.x + (i % w) * pixelFt, y: originPx.y - Math.floor(i / w) * pixelFt });

  const roof: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const z = heightFt[i];
    if (!Number.isFinite(z) || z < minRoofFt) continue;
    if (input.contour && !inRing(px(i), input.contour)) continue;
    roof.push(i);
  }
  // Flood from the summit down.
  roof.sort((a, b) => heightFt[b] - heightFt[a]);

  const parent = new Int32Array(w * h).fill(-1);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) { const n = parent[i]; parent[i] = r; i = n; }
    return r;
  };

  /** Component bookkeeping, keyed by its root pixel. */
  const peak = new Map<number, { id: number; peakFt: number; at: number; size: number; alive: boolean; persistence: number }>();
  const summits: Summit[] = [];
  const saddles: Saddle[] = [];
  let nextId = 0;

  for (const i of roof) {
    const x = i % w;
    const y = (i - x) / w;
    const neighbours: number[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (parent[j] !== -1) neighbours.push(find(j));
    }
    parent[i] = i;
    const roots = [...new Set(neighbours)];
    if (!roots.length) {
      // A new local maximum: nothing higher touches it.
      peak.set(i, { id: nextId++, peakFt: heightFt[i], at: i, size: 1, alive: true, persistence: Infinity });
      continue;
    }
    // Join the tallest neighbouring component; the rest merge into it, and each
    // merge is a saddle at this pixel's height.
    roots.sort((a, b) => (peak.get(b)?.peakFt ?? -Infinity) - (peak.get(a)?.peakFt ?? -Infinity));
    const keep = roots[0];
    const kRec = peak.get(keep)!;
    parent[i] = keep;
    kRec.size++;
    for (const other of roots.slice(1)) {
      const oRec = peak.get(other)!;
      const depth = oRec.peakFt - heightFt[i];
      saddles.push({ a: kRec.id, b: oRec.id, atFt: heightFt[i], where: px(i), depthFt: depth });
      // The younger (lower) summit dies here; its persistence is that depth.
      summits.push({
        id: oRec.id,
        peakFt: oRec.peakFt,
        at: px(oRec.at),
        ridgeFt: 0,
        ridgeDeg: 0,
        planSqft: oRec.size * pixelFt * pixelFt,
        persistenceFt: depth,
      });
      oRec.alive = false;
      kRec.size += oRec.size;
      parent[other] = keep;
      peak.delete(other);
    }
  }
  // Whatever is still alive is the roof's own summit — it never dies.
  for (const rec of peak.values()) {
    if (!rec.alive) continue;
    summits.push({
      id: rec.id,
      peakFt: rec.peakFt,
      at: px(rec.at),
      ridgeFt: 0,
      ridgeDeg: 0,
      planSqft: rec.size * pixelFt * pixelFt,
      persistenceFt: Infinity,
    });
  }

  // Ridge run: how far the near-peak set of each surviving summit extends. A
  // ridge is the flat top of the surface, so "within one noise floor of the
  // peak" is its natural definition rather than a chosen band.
  for (const s of summits) {
    if (s.persistenceFt < SADDLE_FLOOR_FT) continue;
    const band: FootprintPoint[] = [];
    for (const i of roof) {
      if (Math.abs(heightFt[i] - s.peakFt) > DSM_NOISE_FLOOR_FT) continue;
      const p = px(i);
      if (Math.hypot(p.x - s.at.x, p.y - s.at.y) > 60) continue; // this summit's own neighbourhood
      band.push(p);
    }
    let best = 0;
    let bx = 0;
    let by = 0;
    for (let a = 0; a < band.length; a++) {
      for (let b = a + 1; b < band.length; b++) {
        const d = Math.hypot(band[a].x - band[b].x, band[a].y - band[b].y);
        if (d > best) { best = d; bx = band[b].x - band[a].x; by = band[b].y - band[a].y; }
      }
    }
    s.ridgeFt = best;
    s.ridgeDeg = ((Math.atan2(bx, by) * 180) / Math.PI + 360) % 360;
  }

  summits.sort((a, b) => b.persistenceFt - a.persistenceFt);
  return {
    summits,
    saddles: saddles.sort((a, b) => b.depthFt - a.depthFt),
    massCount: summits.filter((s) => s.persistenceFt >= SADDLE_FLOOR_FT).length,
    saddleFloorFt: SADDLE_FLOOR_FT,
    roofPx: roof.length,
  };
}

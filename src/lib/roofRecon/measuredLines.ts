// Step-1 measurement of "layout from the DSM", as a library: the SAME code the
// dsm-layout harness printed tables from, extracted so the stitch consumes the
// identical measurement (a re-implementation would be §K7). Nothing here
// builds a model — it measures lines, types them, and types the contour edges.
//
//   clusters   reconstructRoof's own diagnostics (not a re-segmentation)
//   lines      analytic intersections of adjacent clusters' fitted planes,
//              clipped to the pair's shared border, typed by the lidar crease
//              rule with the normal ORIENTED EMPIRICALLY (§K12: the algebraic
//              orientation was a constant and no valley could ever appear)
//   adjacency  direct border, or bridged across an unassigned strip up to one
//              classifier probe wide (valley pixels are the noisiest on the
//              roof and region growing drops them)
//   edges      contour edges typed EAVE/RAKE by the dominant inside cluster's
//              drain direction
import type { Raster } from "@/lib/solar";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
/** Same figure the lidar creases use for "the line runs level" (creases.ts). */
const LEVEL_PITCH12 = 0.5;
/** Same probe the crease classifier uses for convex/concave. */
export const PROBE_FT = 6;
/** An edge drains ALONG itself (rake) or ACROSS itself (eave) within this. */
const EDGE_TOL_DEG = 45;

export interface ReconLayoutDiagnostics {
  clusterPlanes: Array<{ a: number; b: number; c: number }>;
  clusterAzimuthDeg: number[];
  pitches12: number[];
  assign: Int32Array;
}

export interface MeasuredLine {
  a: FootprintPoint;
  b: FootprintPoint;
  type: "RIDGE" | "HIP" | "VALLEY";
  lengthFt: number;
  between: [number, number];
  medGapFt: number;
}

export interface TypedContourEdge {
  a: FootprintPoint;
  b: FootprintPoint;
  type: "RAKE" | "EAVE" | "?";
}

export interface DsmLayoutMeasurement {
  lines: MeasuredLine[];
  edges: TypedContourEdge[];
  clusterIn: boolean[];
  insidePx: number[];
  outsidePx: number[];
  droppedOutside: number;
  junkOutSqft: number;
  /** Share of contour pixels held by in-contour clusters. */
  measuredShare: number;
  stepFt: number;
  /** Raster pixel index -> plan feet (pixel centre), raster frame. */
  ftOf: (i: number) => FootprintPoint;
  /** Plan feet -> raster pixel index, or -1 outside the raster. */
  pxOf: (p: FootprintPoint) => number;
}

const inRing = (p: FootprintPoint, r: ReadonlyArray<FootprintPoint>): boolean => {
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

export interface MeasureDsmLayoutInput {
  dsm: Raster;
  /** reconstructRoof diagnostics for THIS dsm/mask pair. */
  diagnostics: ReconLayoutDiagnostics;
  /** Regularised Instant rings, already moved into the raster frame. */
  movedRings: FootprintPoint[][];
}

export function measureDsmLayout(input: MeasureDsmLayoutInput): DsmLayoutMeasurement {
  const { dsm, diagnostics: d, movedRings } = input;
  const w = dsm.width;
  const h = dsm.height;
  const stepFt = dsm.pixelSizeM * FT_PER_M;
  const cx = w / 2;
  const cy = h / 2;
  const ftOf = (i: number): FootprintPoint => ({ x: ((i % w) + 0.5 - cx) * stepFt, y: (cy - Math.floor(i / w) - 0.5) * stepFt });
  const pxOf = (p: FootprintPoint): number => {
    const xi = Math.round(p.x / stepFt + cx - 0.5);
    const yi = Math.round(cy - 0.5 - p.y / stepFt);
    return xi < 0 || yi < 0 || xi >= w || yi >= h ? -1 : yi * w + xi;
  };
  const inAny = (p: FootprintPoint) => movedRings.some((r) => inRing(p, r));

  // Per-cluster: pixels inside/outside the moved contour.
  const nClusters = d.clusterPlanes.length;
  const insidePx = new Array<number>(nClusters).fill(0);
  const outsidePx = new Array<number>(nClusters).fill(0);
  let contourPx = 0;
  let measuredPx = 0;
  for (let i = 0; i < w * h; i++) {
    const id = d.assign[i];
    const p = ftOf(i);
    const ins = inAny(p);
    if (ins) contourPx++;
    if (id < 0) continue;
    if (ins) { insidePx[id]++; measuredPx++; }
    else outsidePx[id]++;
  }
  // A cluster is IN when the majority of its pixels are inside the contour.
  const clusterIn = insidePx.map((n, i) => n > outsidePx[i] && n * stepFt * stepFt >= 12);
  const junkOutSqft = outsidePx.reduce((a, n, i) => a + (clusterIn[i] ? 0 : insidePx[i] + n ? n : 0), 0) * stepFt * stepFt;
  const droppedOutside = clusterIn.filter((v, i) => !v && insidePx[i] + outsidePx[i] > 0).length;

  // ── lines: intersections of ADJACENT in-contour clusters ──
  const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  // Shared borders, and pairs separated only by a thin strip of UNASSIGNED
  // pixels. Valley pixels are the noisiest on the roof (water line, debris,
  // deepest shadows), so region growing drops them and two clusters that
  // really meet at a valley can fail plain adjacency. The bridge width is
  // DERIVED: one probe of the crease classifier — the distance at which two
  // planes are still being compared about the same fold.
  const BRIDGE_PX = Math.max(1, Math.round(PROBE_FT / stepFt));
  const shared = new Map<string, FootprintPoint[]>();
  const gapWidths = new Map<string, number[]>();
  for (let i = 0; i < w * h; i++) {
    const a = d.assign[i];
    if (a < 0 || !clusterIn[a]) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      // Walk up to BRIDGE_PX unassigned pixels; the first assigned pixel on
      // the far side decides whether this is a border (0 gap) or a bridge.
      let gap = 0;
      let b = -1;
      for (let step2 = 1; step2 <= BRIDGE_PX + 1; step2++) {
        const nx = x + dx * step2;
        const ny = y + dy * step2;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
        const v = d.assign[ny * w + nx];
        if (v === a) { b = -1; break; }
        if (v >= 0) { b = v; break; }
        gap++;
      }
      if (b < 0 || b === a || !clusterIn[b]) continue;
      const k = pairKey(a, b);
      const rec = shared.get(k) ?? [];
      rec.push(ftOf(i));
      shared.set(k, rec);
      const gw = gapWidths.get(k) ?? [];
      gw.push(gap * stepFt);
      gapWidths.set(k, gw);
    }
  }
  const lines: MeasuredLine[] = [];
  for (const [k, pts] of shared) {
    if (pts.length * stepFt < 4) continue; // under 4 ft of shared border — noise
    const [ai, bi] = k.split("|").map(Number);
    const A = d.clusterPlanes[ai];
    const B = d.clusterPlanes[bi];
    // Intersection of z=Aax+Aby+Ac and z=Bax+Bby+Bc in plan:
    // (Aa-Ba)x + (Ab-Bb)y + (Ac-Bc) = 0 — direction is the line's own.
    const da = A.a - B.a;
    const db = A.b - B.b;
    const nrm = Math.hypot(da, db);
    if (nrm < 1e-4) continue; // near-coplanar — the merge should own these
    const dir = { x: -db / nrm, y: da / nrm };
    // Anchor: the point on the analytic line nearest the shared pixels' mean.
    const mx = pts.reduce((s2, p) => s2 + p.x, 0) / pts.length;
    const my = pts.reduce((s2, p) => s2 + p.y, 0) / pts.length;
    const off = (da * mx + db * my + (A.c - B.c)) / nrm;
    const px0 = { x: mx - (da / nrm) * off, y: my - (db / nrm) * off };
    let t0 = Infinity;
    let t1 = -Infinity;
    for (const p of pts) {
      const t = (p.x - px0.x) * dir.x + (p.y - px0.y) * dir.y;
      if (t < t0) t0 = t;
      if (t > t1) t1 = t;
    }
    const a2 = { x: px0.x + dir.x * t0, y: px0.y + dir.y * t0 };
    const b2 = { x: px0.x + dir.x * t1, y: px0.y + dir.y * t1 };
    // The crease classifier's rule — with the normal ORIENTED EMPIRICALLY
    // from cluster A's own pixels (§K12: sign(da·da/nrm + db·db/nrm) is
    // sign(nrm), always positive — a classifier whose valley branch was
    // algebraically unreachable).
    const creaseP12 = Math.abs(A.a * dir.x + A.b * dir.y) * 12;
    let aSide = 0;
    {
      // Which side of the line does cluster A actually occupy?
      let n2 = 0;
      for (let ii = 0; ii < w * h && n2 < 400; ii++) {
        if (d.assign[ii] !== ai) continue;
        const p2 = ftOf(ii);
        if (Math.hypot(p2.x - px0.x, p2.y - px0.y) > 30) continue;
        aSide += Math.sign((p2.x - px0.x) * (da / nrm) + (p2.y - px0.y) * (db / nrm));
        n2++;
      }
    }
    const sgn = Math.sign(aSide) || 1;
    const ncx2 = (da / nrm) * sgn; // points INTO cluster A's side
    const ncy2 = (db / nrm) * sgn;
    const zc = A.a * px0.x + A.b * px0.y + A.c;
    const zA = A.a * (px0.x + ncx2 * PROBE_FT) + A.b * (px0.y + ncy2 * PROBE_FT) + A.c;
    const zB = B.a * (px0.x - ncx2 * PROBE_FT) + B.b * (px0.y - ncy2 * PROBE_FT) + B.c;
    const type = zA > zc && zB > zc ? "VALLEY" : zA < zc && zB < zc ? (creaseP12 <= LEVEL_PITCH12 ? "RIDGE" : "HIP") : "OTHER";
    if (type === "OTHER") continue; // bends without folding — not a roof line
    const gaps = (gapWidths.get(k) ?? []).sort((x2, y3) => x2 - y3);
    const medGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    lines.push({ a: a2, b: b2, type, lengthFt: t1 - t0, between: [ai, bi], medGapFt: medGap });
  }

  // ── contour edges: eave or rake, from the dominant inside cluster's drain ──
  const edges: TypedContourEdge[] = [];
  for (const ring of movedRings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 4) continue;
      // Sample the cluster a couple of feet inside the edge midpoint.
      const nx2 = -(b.y - a.y) / len;
      const ny2 = (b.x - a.x) / len;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let id = -1;
      for (const off of [2, 4, 6]) {
        for (const s3 of [1, -1]) {
          const q = { x: mid.x + nx2 * off * s3, y: mid.y + ny2 * off * s3 };
          if (!inAny(q)) continue;
          const pi = pxOf(q);
          if (pi < 0) continue;
          const c2 = d.assign[pi];
          if (c2 >= 0 && clusterIn[c2]) { id = c2; break; }
        }
        if (id >= 0) break;
      }
      if (id < 0) { edges.push({ a, b, type: "?" }); continue; }
      const az = d.clusterAzimuthDeg[id];
      const edgeDeg = ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
      const alongDiff = Math.min(angDiff(az, edgeDeg), angDiff(az, (edgeDeg + 180) % 360));
      edges.push({ a, b, type: alongDiff <= EDGE_TOL_DEG ? "RAKE" : "EAVE" });
    }
  }

  return {
    lines,
    edges,
    clusterIn,
    insidePx,
    outsidePx,
    droppedOutside,
    junkOutSqft,
    measuredShare: contourPx ? measuredPx / contourPx : 0,
    stepFt,
    ftOf,
    pxOf,
  };
}

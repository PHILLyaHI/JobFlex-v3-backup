// Pure procedural fence geometry — the core engine. THREE-free: given the path
// points (local feet) and optional gates, it returns flat per-instance arrays the
// 3D component streams straight into InstancedMesh matrices, plus the single
// source of truth for total length (reused by pricing so the number can't drift).
//
// Output is HEIGHT- and MATERIAL-independent: posts/pickets/rails are authored at
// unit height and aligned by yaw, so height changes are a cheap matrix re-write
// and material changes a cheap material swap. Only a change in instance COUNT
// (the path or gates) forces a rebuild.
import type { PathPoint, GateSpec, OpeningKind, OpeningVariant } from "./fenceTypes";

export const POST_SPACING_FT = 8; // max bay width; runs subdivide evenly to stay ≤ this
export const PICKET_WIDTH_FT = 0.46; // ~5.5"
export const PICKET_GAP_FT = 0.04; // small reveal so butted privacy pickets don't z-fight
export const PICKET_PITCH_FT = PICKET_WIDTH_FT + PICKET_GAP_FT;

const EPS = 1e-4;
const CLOSE_TOL_FT = 0.5; // last point within this of the first ⇒ closed loop

// A rendered gate opening, in world feet: centre of the opening + run heading.
export interface GateUnit {
  x: number;
  y: number;
  yaw: number;
  widthFt: number;
  kind: OpeningKind;
  variant: OpeningVariant;
}

export interface FenceLayout {
  posts: Float32Array; // [x, y, yaw] × postCount   — ground-plane local feet
  pickets: Float32Array; // [x, y, yaw] × picketCount
  rails: Float32Array; // [x, y, yaw, len, top] × railCount  (top: 1 = top rail, 0 = bottom)
  segments: Float32Array; // [midX, midY, yaw, len] × segCount  (for chain-link infill)
  gateUnits: GateUnit[];
  postCount: number;
  picketCount: number;
  railCount: number;
  segCount: number;
  totalLengthFt: number;
  closed: boolean;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function emptyLayout(): FenceLayout {
  return {
    posts: new Float32Array(0),
    pickets: new Float32Array(0),
    rails: new Float32Array(0),
    segments: new Float32Array(0),
    gateUnits: [],
    postCount: 0,
    picketCount: 0,
    railCount: 0,
    segCount: 0,
    totalLengthFt: 0,
    closed: false,
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
}

export function computeFenceLayout(points: PathPoint[], gates: GateSpec[] = []): FenceLayout {
  if (!points || points.length < 2) return emptyLayout();

  const first = points[0];
  const last = points[points.length - 1];
  const closed = points.length > 2 && Math.hypot(last.x - first.x, last.y - first.y) < CLOSE_TOL_FT;

  const posts: number[] = [];
  const pickets: number[] = [];
  const rails: number[] = [];
  const segments: number[] = [];
  const gateUnits: GateUnit[] = [];
  let totalLengthFt = 0;
  let lastYaw = 0;

  // Iterate ORIGINAL point indices so gate.segmentIndex maps correctly even when
  // a degenerate (zero-length) segment is skipped.
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < EPS) continue; // skip duplicate consecutive points

    const ux = dx / len;
    const uy = dy / len;
    const yaw = Math.atan2(dy, dx);
    lastYaw = yaw;
    totalLengthFt += len;

    // Posts: one per bay edge, bays ≤ 8 ft, remainder distributed evenly. Emit
    // k = 0..bays-1 (start + intermediates, NOT the end) so a shared corner post
    // is emitted exactly once by the next segment.
    const bays = Math.max(1, Math.ceil(len / POST_SPACING_FT));
    const step = len / bays;
    for (let k = 0; k < bays; k++) {
      const d = step * k;
      posts.push(a.x + ux * d, a.y + uy * d, yaw);
    }

    // Gate openings on this segment → emit gate units + intervals to skip pickets.
    const openings: Array<[number, number]> = [];
    for (const g of gates) {
      if (g.segmentIndex !== i) continue;
      const w = Math.min(g.widthFt, len);
      const c = Math.min(Math.max(g.t, 0), 1) * len;
      const half = w / 2;
      openings.push([c - half, c + half]);
      gateUnits.push({ x: a.x + ux * c, y: a.y + uy * c, yaw, widthFt: w, kind: g.kind, variant: g.variant });
    }

    // Pickets: centred, evenly distributed, skipping any gate opening.
    const n = Math.floor(len / PICKET_PITCH_FT);
    const slack = len - n * PICKET_PITCH_FT;
    for (let j = 0; j < n; j++) {
      const d = (j + 0.5) * PICKET_PITCH_FT + slack / 2;
      if (openings.some(([s0, s1]) => d >= s0 && d <= s1)) continue;
      pickets.push(a.x + ux * d, a.y + uy * d, yaw);
    }

    // Rails: continuous top + bottom per straight run.
    const mx = a.x + ux * (len / 2);
    const my = a.y + uy * (len / 2);
    rails.push(mx, my, yaw, len, 1);
    rails.push(mx, my, yaw, len, 0);
    segments.push(mx, my, yaw, len);
  }

  // Detached openings (dropped away from any run): emit standalone units with a
  // default east-west heading. They carry no picket-skipping (not on a segment).
  for (const g of gates) {
    if (g.segmentIndex >= 0) continue;
    if (typeof g.x !== "number" || typeof g.y !== "number") continue;
    gateUnits.push({ x: g.x, y: g.y, yaw: 0, widthFt: g.widthFt, kind: g.kind, variant: g.variant });
  }

  // Final end post: open runs need the trailing corner; closed loops already have
  // it (the last segment returns to points[0], emitted by segment 0).
  if (!closed) {
    posts.push(last.x, last.y, lastYaw);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  // Fold detached openings into the bounds so the 3D view frames them too.
  for (const g of gates) {
    if (g.segmentIndex >= 0 || typeof g.x !== "number" || typeof g.y !== "number") continue;
    if (g.x < minX) minX = g.x;
    if (g.y < minY) minY = g.y;
    if (g.x > maxX) maxX = g.x;
    if (g.y > maxY) maxY = g.y;
  }

  return {
    posts: new Float32Array(posts),
    pickets: new Float32Array(pickets),
    rails: new Float32Array(rails),
    segments: new Float32Array(segments),
    gateUnits,
    postCount: posts.length / 3,
    picketCount: pickets.length / 3,
    railCount: rails.length / 5,
    segCount: segments.length / 4,
    totalLengthFt,
    closed,
    bounds: { minX, minY, maxX, maxY },
  };
}

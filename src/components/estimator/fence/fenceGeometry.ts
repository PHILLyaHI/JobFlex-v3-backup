// Pure procedural fence geometry — the core engine. THREE-free: given the path
// points (local feet) and optional gates, it returns flat per-instance arrays the
// 3D component streams straight into InstancedMesh matrices, plus the single
// source of truth for total length (reused by pricing so the number can't drift).
//
// Output is HEIGHT- and MATERIAL-independent: posts/pickets/rails are authored at
// unit height and aligned by yaw, so height changes are a cheap matrix re-write
// and material changes a cheap material swap. Only a change in instance COUNT
// (the path or gates) forces a rebuild.
//
// GROUND. With `groundAt` the layout also carries where the fence meets the
// land: the ground under every post, and per BAY (post to post) the panel's
// base at each end. A bay follows the ground (racked — rails parallel to the
// grade) unless its segment is priced STEPPED, in which case the bay is level
// at its uphill end and the run drops a step at every post, exactly the
// `ceil(plan / POST_SPACING_FT)` steps fenceTerrain charges for. A post carries
// the highest panel of the bays it holds, so a step post is the taller one.
// Without `groundAt` every height is 0 and the result is the old flat fence.
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
  /** Level base of the leaf: gates hang level, clear of the uphill edge. */
  base: number;
}

export type BayClass = "level" | "racked" | "stepped";

export interface FenceLayoutOptions {
  /** Ground height (ft, any datum) at a local-feet point. Absent ⇒ flat at 0. */
  groundAt?: (x: number, y: number) => number;
  /** The priced slope class of the segment points[i] → points[i + 1]. */
  segClass?: (segIndex: number) => BayClass | null | undefined;
  /** Where a run ends ON a house wall: the post there becomes a wall mount. */
  wallMounts?: PathPoint[];
}

/** A run end within this of a wall-mount point is that mount. */
const MOUNT_TOL_FT = 0.35;

export interface FenceLayout {
  posts: Float32Array; // [x, y, yaw] × postCount   — ground-plane local feet
  pickets: Float32Array; // [x, y, yaw] × picketCount
  rails: Float32Array; // [x, y, yaw, len, top] × railCount  (top: 1 = top rail, 0 = bottom)
  segments: Float32Array; // [midX, midY, yaw, len] × segCount  (for chain-link infill)
  /** Ground height under each post (same order as `posts`). */
  postBase: Float32Array;
  /** Highest panel base among the bays each post carries. */
  postPanel: Float32Array;
  /** 1 where the post is a wall mount on a house (nothing set in the ground). */
  postMount: Uint8Array;
  /** Panel base under each picket (same order as `pickets`). */
  picketBase: Float32Array;
  /** [x0, y0, z0, x1, y1, z1, stepped] × bayCount — z = panel base at each end. */
  bays: Float32Array;
  bayCount: number;
  steppedBays: number;
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
    postBase: new Float32Array(0),
    postPanel: new Float32Array(0),
    postMount: new Uint8Array(0),
    picketBase: new Float32Array(0),
    bays: new Float32Array(0),
    bayCount: 0,
    steppedBays: 0,
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

export function computeFenceLayout(
  points: PathPoint[],
  gates: GateSpec[] = [],
  opts: FenceLayoutOptions = {},
): FenceLayout {
  if (!points || points.length < 2) return emptyLayout();
  const groundAt = opts.groundAt;
  const g = (x: number, y: number) => {
    const v = groundAt ? groundAt(x, y) : 0;
    return Number.isFinite(v) ? v : 0;
  };
  const mounts = opts.wallMounts ?? [];
  const isMount = (x: number, y: number) =>
    mounts.some((m) => Math.hypot(m.x - x, m.y - y) <= MOUNT_TOL_FT);

  const first = points[0];
  const last = points[points.length - 1];
  const closed = points.length > 2 && Math.hypot(last.x - first.x, last.y - first.y) < CLOSE_TOL_FT;

  const posts: number[] = [];
  const pickets: number[] = [];
  const rails: number[] = [];
  const segments: number[] = [];
  const postBase: number[] = [];
  const postPanel: number[] = [];
  const postMount: number[] = [];
  const picketBase: number[] = [];
  const bays: number[] = [];
  let steppedBays = 0;
  const gateUnits: GateUnit[] = [];
  let totalLengthFt = 0;
  const pushPost = (x: number, y: number, yaw: number, panel: number) => {
    posts.push(x, y, yaw);
    const base = g(x, y);
    postBase.push(base);
    postPanel.push(Math.max(base, panel));
    // Only a run END can sit on a wall; a mid-run post near a house is a post.
    postMount.push(0);
    return posts.length / 3 - 1;
  };

  // Multi-run support: a point with `gap` starts a NEW disconnected run — no
  // segment is emitted between it and the previous point. Each run manages its
  // own closure (last ≈ first ⇒ closed) and its own trailing end post.
  let runStart = 0; // index of the current run's first point
  let runLastYaw = 0;
  let runHasSegment = false;
  let runFirstPost = -1; // post index of the run's first post
  /** Panel base the previous bay left at the corner the next segment starts on. */
  let cornerPanel = -Infinity;
  const endRun = (runEnd: number) => {
    if (!runHasSegment) return;
    const rs = points[runStart];
    const re = points[runEnd];
    const runClosed = runEnd - runStart > 1 && Math.hypot(re.x - rs.x, re.y - rs.y) < CLOSE_TOL_FT;
    // Open runs need the trailing corner post; closed runs already have it (the
    // final segment returns to the run's first point, emitted by its first bay).
    if (!runClosed) {
      const idx = pushPost(re.x, re.y, runLastYaw, cornerPanel);
      if (isMount(re.x, re.y)) postMount[idx] = 1;
      if (runFirstPost >= 0 && isMount(rs.x, rs.y)) postMount[runFirstPost] = 1;
    } else if (runFirstPost >= 0) {
      // The closing bay ends on the run's first post.
      postPanel[runFirstPost] = Math.max(postPanel[runFirstPost], cornerPanel);
    }
  };

  // Iterate ORIGINAL point indices so gate.segmentIndex maps correctly even when
  // a degenerate (zero-length) or gap segment is skipped.
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b.gap) {
      // Run boundary: finish the current run, start the next at b.
      endRun(i);
      runStart = i + 1;
      runHasSegment = false;
      runFirstPost = -1;
      cornerPanel = -Infinity;
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < EPS) continue; // skip duplicate consecutive points

    const ux = dx / len;
    const uy = dy / len;
    const yaw = Math.atan2(dy, dx);
    runLastYaw = yaw;
    runHasSegment = true;
    totalLengthFt += len;

    // Posts: one per bay edge, bays ≤ 8 ft, remainder distributed evenly. Emit
    // k = 0..bays-1 (start + intermediates, NOT the end) so a shared corner post
    // is emitted exactly once by the next segment.
    const bayN = Math.max(1, Math.ceil(len / POST_SPACING_FT));
    const step = len / bayN;
    const stepped = opts.segClass?.(i) === "stepped";
    const first = posts.length / 3;
    for (let k = 0; k < bayN; k++) {
      const d = step * k;
      const idx = pushPost(a.x + ux * d, a.y + uy * d, yaw, k === 0 ? cornerPanel : -Infinity);
      if (runFirstPost < 0) runFirstPost = idx;
    }
    // Bays: the panel base at each end — on the ground, or level at the uphill
    // end of a stepped segment.
    const endGround = g(b.x, b.y);
    const segBays: Array<[number, number]> = [];
    for (let k = 0; k < bayN; k++) {
      const ga = postBase[first + k];
      const gb = k + 1 < bayN ? postBase[first + k + 1] : endGround;
      const za = stepped ? Math.max(ga, gb) : ga;
      const zb = stepped ? Math.max(ga, gb) : gb;
      segBays.push([za, zb]);
      bays.push(
        a.x + ux * step * k, a.y + uy * step * k, za,
        a.x + ux * step * (k + 1), a.y + uy * step * (k + 1), zb,
        stepped ? 1 : 0,
      );
      if (stepped) steppedBays++;
      postPanel[first + k] = Math.max(postPanel[first + k], za);
      if (k + 1 < bayN) postPanel[first + k + 1] = Math.max(postPanel[first + k + 1], zb);
      else cornerPanel = zb;
    }

    // Gate openings on this segment → emit gate units + intervals to skip pickets.
    const openings: Array<[number, number]> = [];
    for (const gate of gates) {
      if (gate.segmentIndex !== i) continue;
      const w = Math.min(gate.widthFt, len);
      const c = Math.min(Math.max(gate.t, 0), 1) * len;
      const half = w / 2;
      openings.push([c - half, c + half]);
      const s0 = Math.max(0, c - half);
      const s1 = Math.min(len, c + half);
      const base = Math.max(g(a.x + ux * s0, a.y + uy * s0), g(a.x + ux * s1, a.y + uy * s1));
      gateUnits.push({ x: a.x + ux * c, y: a.y + uy * c, yaw, widthFt: w, kind: gate.kind, variant: gate.variant, base });
    }

    // Pickets: centred, evenly distributed, skipping any gate opening.
    const n = Math.floor(len / PICKET_PITCH_FT);
    const slack = len - n * PICKET_PITCH_FT;
    for (let j = 0; j < n; j++) {
      const d = (j + 0.5) * PICKET_PITCH_FT + slack / 2;
      if (openings.some(([s0, s1]) => d >= s0 && d <= s1)) continue;
      pickets.push(a.x + ux * d, a.y + uy * d, yaw);
      const k = Math.min(bayN - 1, Math.max(0, Math.floor(d / step)));
      const t = Math.min(1, Math.max(0, d / step - k));
      picketBase.push(segBays[k][0] + (segBays[k][1] - segBays[k][0]) * t);
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
  for (const gate of gates) {
    if (gate.segmentIndex >= 0) continue;
    if (typeof gate.x !== "number" || typeof gate.y !== "number") continue;
    const half = gate.widthFt / 2;
    const base = Math.max(g(gate.x - half, gate.y), g(gate.x + half, gate.y));
    gateUnits.push({ x: gate.x, y: gate.y, yaw: 0, widthFt: gate.widthFt, kind: gate.kind, variant: gate.variant, base });
  }

  // Final run's end post (earlier runs got theirs at each gap boundary).
  endRun(points.length - 1);

  // Posts at the same spot (a run joining another, a T) must stand identical:
  // with different panel heights their faces overlap and textured materials
  // flicker. All take the tallest; a wall mount survives only if every post
  // there is one.
  if (groundAt || mounts.length) {
    const byKey = new Map<string, number[]>();
    for (let i = 0; i < posts.length / 3; i++) {
      const k = `${Math.round(posts[i * 3] * 1000)}_${Math.round(posts[i * 3 + 1] * 1000)}`;
      const arr = byKey.get(k);
      if (arr) arr.push(i);
      else byKey.set(k, [i]);
    }
    for (const group of byKey.values()) {
      if (group.length < 2) continue;
      const panel = Math.max(...group.map((i) => postPanel[i]));
      const base = Math.min(...group.map((i) => postBase[i]));
      const allMount = group.every((i) => postMount[i] === 1);
      for (const i of group) {
        postPanel[i] = panel;
        postBase[i] = base;
        postMount[i] = allMount ? 1 : 0;
      }
    }
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
  for (const gate of gates) {
    if (gate.segmentIndex >= 0 || typeof gate.x !== "number" || typeof gate.y !== "number") continue;
    if (gate.x < minX) minX = gate.x;
    if (gate.y < minY) minY = gate.y;
    if (gate.x > maxX) maxX = gate.x;
    if (gate.y > maxY) maxY = gate.y;
  }

  return {
    posts: new Float32Array(posts),
    pickets: new Float32Array(pickets),
    rails: new Float32Array(rails),
    segments: new Float32Array(segments),
    postBase: new Float32Array(postBase),
    postPanel: new Float32Array(postPanel),
    postMount: new Uint8Array(postMount),
    picketBase: new Float32Array(picketBase),
    bays: new Float32Array(bays),
    bayCount: bays.length / 7,
    steppedBays,
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

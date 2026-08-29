// The planar arrangement of measured roof lines — the stitch engine.
//
// The wholesale stitch (adopt reconstructRoof's model, conform the perimeter)
// was measured 2026-08-29 and rejected by its own guards on 5/5 suburban
// addresses: the measured LINES land on real creases, but cluster-ring
// tracing tangles the topology (Euler −9…0). So the stitched model is built
// the other way around: from the lines themselves. Segments clipped into the
// contour, junctions closed, the plane subdivided into cells — Euler and
// tiling then hold BY CONSTRUCTION, and the guards verify that the
// construction really is what it claims (the skeleton was also "correct by
// construction" until WELD).
//
// Degeneracies are handled first, not later — this is where welding broke:
//   - node coincidence tolerances follow the skeleton.ts law (1e-6 × scale),
//     never absolute;
//   - nearby nodes collapse at the outline-normalisation quantum (0.05 ft —
//     the same figure ring regularisation merges vertices at);
//   - undershot endpoints close junctions bilaterally: the census across the
//     six addresses (line-gaps.ts) showed undershoot is measured in FEET
//     (cluster-border erosion near junctions, per-address medians 1.6-3.8 ft)
//     and does NOT scale with line length — 2-ft fragments needed 10× their
//     length while 50-ft ridges needed 3% — so the allowance is the crease
//     classifier's own probe (6 ft), the distance at which two planes are
//     still talking about the same fold, and junction cost is
//     max(own extension, partner extension), never own alone (the greedy
//     nearest-hit choice picked near-parallel supports 1400 ft out);
//   - a closing whose extension path crosses an unrelated segment is refused;
//   - segments that still dangle after closing are pruned and REPORTED, not
//     silently kept (a dangling edge cannot bound two cells).
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { signedArea } from "@/lib/roofRecon/footprint";
import { PROBE_FT } from "@/lib/roofRecon/measuredLines";

/** Ring-regularisation vertex-merge quantum — nearby arrangement nodes collapse at the same scale. */
const MERGE_FT = 0.05;
/** Minimum surviving interior sub-edge; shorter pieces collapse into a node. */
const MIN_EDGE_FT = 0.25;

export type SegSource =
  | { kind: "contour"; index: number }
  | { kind: "line"; index: number };

export interface ArrangeLine {
  a: FootprintPoint;
  b: FootprintPoint;
  /** Measured crease type — typed closings use roof-geometry identities. */
  kind?: "RIDGE" | "HIP" | "VALLEY";
}

export interface ArrangeInput {
  /** Simple ring, no duplicate closing point. */
  contour: FootprintPoint[];
  lines: ArrangeLine[];
  /** EAVE/RAKE per INPUT ring edge (edge i = contour[i]->contour[i+1]). */
  contourEdgeTypes?: Array<"RAKE" | "EAVE" | undefined>;
  allowanceFt?: number;
  minCellSqft?: number;
}

export interface ArrangeCellEdge {
  a: FootprintPoint;
  b: FootprintPoint;
  source: SegSource;
}

export interface ArrangeCell {
  ring: FootprintPoint[];
  edges: ArrangeCellEdge[]; // edges[i] runs ring[i] -> ring[i+1]
  areaSqft: number;
}

export interface Arrangement {
  cells: ArrangeCell[];
  /** V - E + F for the cells + outer face check, computed on the final graph. */
  euler: number;
  tilingPct: number;
  droppedLines: Array<{ index: number; lengthFt: number; reason: string }>;
  /** Footage of measured lines lost in sliver merges, by input line index. */
  dissolvedFt: Map<number, number>;
  report: string[];
}

interface Seg {
  a: FootprintPoint;
  b: FootprintPoint;
  source: SegSource;
}

const sub = (p: FootprintPoint, q: FootprintPoint) => ({ x: p.x - q.x, y: p.y - q.y });
const cross = (u: FootprintPoint, v: FootprintPoint) => u.x * v.y - u.y * v.x;

/** Intersection of segments as params (t on pq, u on rs), or null if parallel. */
function segParams(p: FootprintPoint, q: FootprintPoint, r: FootprintPoint, s: FootprintPoint): { t: number; u: number } | null {
  const d1 = sub(q, p);
  const d2 = sub(s, r);
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(r, p), d2) / den;
  const u = cross(sub(r, p), d1) / den;
  return { t, u };
}

function pointInRing(p: FootprintPoint, r: ReadonlyArray<FootprintPoint>): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
}

/** Does the open segment (a,b) properly cross any segment in segs (excluding indices in skip)? */
function crossesAny(a: FootprintPoint, b: FootprintPoint, segs: Seg[], skip: Set<number>, eps: number): boolean {
  for (let i = 0; i < segs.length; i++) {
    if (skip.has(i)) continue;
    const s = segs[i];
    const pr = segParams(a, b, s.a, s.b);
    if (!pr) continue;
    if (pr.t > eps && pr.t < 1 - eps && pr.u > eps && pr.u < 1 - eps) return true;
  }
  return false;
}

export function buildArrangement(input: ArrangeInput): Arrangement {
  const allowance = input.allowanceFt ?? PROBE_FT;
  const minCell = input.minCellSqft ?? 15;
  const report: string[] = [];
  const droppedLines: Arrangement["droppedLines"] = [];
  const dissolvedFt = new Map<number, number>();

  // ── frame and tolerances, the skeleton.ts law ──
  let ring = input.contour.slice();
  if (ring.length >= 2 && Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 1e-9) ring = ring.slice(0, -1);
  const reversed = signedArea(ring) < 0;
  if (reversed) ring = ring.slice().reverse(); // CCW
  const inputEdgeIndex = (j: number): number => (reversed ? (ring.length - 2 - j + ring.length) % ring.length : j);
  const edgeTypeOf = (j: number): "RAKE" | "EAVE" | undefined => input.contourEdgeTypes?.[inputEdgeIndex(j)];
  let scale = 1;
  for (const p of ring) scale = Math.max(scale, Math.abs(p.x), Math.abs(p.y));
  const EPS = 1e-9 * scale;
  const contourArea = Math.abs(signedArea(ring));

  // ── 1. clip lines into the contour (keep the longest inside piece) ──
  const lines: Array<{ a: FootprintPoint; b: FootprintPoint; index: number }> = [];
  for (let li = 0; li < input.lines.length; li++) {
    const L = input.lines[li];
    const cuts: number[] = [0, 1];
    for (let i = 0; i < ring.length; i++) {
      const pr = segParams(L.a, L.b, ring[i], ring[(i + 1) % ring.length]);
      if (pr && pr.t > 0 && pr.t < 1 && pr.u >= 0 && pr.u <= 1) cuts.push(pr.t);
    }
    cuts.sort((x, y) => x - y);
    let best: { a: FootprintPoint; b: FootprintPoint; len: number } | null = null;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const t0 = cuts[i];
      const t1 = cuts[i + 1];
      if (t1 - t0 < 1e-9) continue;
      const a = { x: L.a.x + (L.b.x - L.a.x) * t0, y: L.a.y + (L.b.y - L.a.y) * t0 };
      const b = { x: L.a.x + (L.b.x - L.a.x) * t1, y: L.a.y + (L.b.y - L.a.y) * t1 };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!pointInRing(mid, ring)) continue;
      const l2 = Math.hypot(b.x - a.x, b.y - a.y);
      if (!best || l2 > best.len) best = { a, b, len: l2 };
    }
    if (!best) {
      droppedLines.push({ index: li, lengthFt: Math.hypot(L.b.x - L.a.x, L.b.y - L.a.y), reason: "outside the contour" });
      continue;
    }
    lines.push({ a: best.a, b: best.b, index: li });
  }

  // ── 2. junction closing ──
  // The census (line-gaps.ts) split the problem in two. An analytic line's
  // DIRECTION comes from the plane-pair intersection and is trustworthy; its
  // EXTENT comes from eroded pixel support and is not. So typed closings from
  // the roof-geometry identities go first — a valley starts on a reflex
  // contour corner, a hip on a convex one, a ridge runs out to its gable
  // (RAKE) wall, and crease apexes join where at least one participant's
  // measured extent reaches within one classifier probe — with the LATERAL
  // deviation bounded by the probe, never the along-support extension. The
  // generic small closings (≤ probe in every direction) mop up afterwards.
  // Every closing is refused if its extension path crosses an unrelated
  // segment, and every application locks the endpoint it settled.
  const contourSegs: Seg[] = ring.map((p, i) => ({ a: p, b: ring[(i + 1) % ring.length], source: { kind: "contour", index: inputEdgeIndex(i) } }));
  const locked = new Set<string>(); // "li|0" / "li|1"
  const allSegsNow = (): Seg[] => [
    ...contourSegs,
    ...lines.map((l): Seg => ({ a: l.a, b: l.b, source: { kind: "line", index: l.index } })),
  ];
  const kindOf = (li: number): "RIDGE" | "HIP" | "VALLEY" | undefined => input.lines[li]?.kind;

  // corner convexity on the CCW ring
  const cornerConvex: boolean[] = ring.map((v, i) => {
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const next = ring[(i + 1) % ring.length];
    return cross(sub(v, prev), sub(next, v)) > 0;
  });

  interface Closing { cost: number; apply: () => void; check: () => boolean }
  const endGeom = (i: number, end: 0 | 1) => {
    const l = lines[i];
    const o = end === 0 ? l.a : l.b;
    const far = end === 0 ? l.b : l.a;
    const myLen = Math.hypot(o.x - far.x, o.y - far.y);
    const d = myLen > EPS ? { x: (o.x - far.x) / myLen, y: (o.y - far.y) / myLen } : null;
    return { l, o, far, myLen, d };
  };
  const moveEnd = (i: number, end: 0 | 1, p: FootprintPoint) => {
    if (end === 0) lines[i].a = p;
    else lines[i].b = p;
    locked.add(`${i}|${end}`);
  };
  const pathClearFor = (i: number, o: FootprintPoint, p: FootprintPoint): boolean => {
    const segs = allSegsNow();
    return !crossesAny(o, p, segs, new Set([contourSegs.length + i]), 1e-7);
  };

  // A closing family runs until it has nothing left to apply, cheapest first.
  const runFamily = (gen: (i: number, end: 0 | 1) => Closing[]) => {
    for (let guard = 0; guard < 400; guard++) {
      let cheapest: Closing | null = null;
      for (let i = 0; i < lines.length; i++) {
        for (const end of [0, 1] as const) {
          if (locked.has(`${i}|${end}`)) continue;
          const cands = gen(i, end).sort((x, y) => x.cost - y.cost);
          const c = cands.find((x) => x.check());
          if (c && (!cheapest || c.cost < cheapest.cost)) cheapest = c;
        }
      }
      if (!cheapest) break;
      cheapest.apply();
    }
  };

  // ── family A: corner identities — valley→reflex, hip→convex; lateral ≤ probe ──
  runFamily((i, end) => {
    const kind = kindOf(lines[i].index);
    if (kind !== "VALLEY" && kind !== "HIP") return [];
    const { o, far, myLen, d } = endGeom(i, end);
    if (!d) return [];
    const out: Closing[] = [];
    for (let vi = 0; vi < ring.length; vi++) {
      if (kind === "VALLEY" ? cornerConvex[vi] : !cornerConvex[vi]) continue;
      const C = ring[vi];
      const perp = Math.abs(cross(d, sub(C, far)));
      if (perp > allowance) continue;
      const along = sub(C, far).x * d.x + sub(C, far).y * d.y;
      if (along < myLen - allowance) continue; // the corner must sit at THIS end
      out.push({ cost: perp, apply: () => moveEnd(i, end, C), check: () => pathClearFor(i, o, C) });
    }
    return out;
  });

  // ── family B: a ridge runs out to its gable (RAKE) wall along its own ray ──
  runFamily((i, end) => {
    if (kindOf(lines[i].index) !== "RIDGE") return [];
    const { o, d } = endGeom(i, end);
    if (!d) return [];
    const out: Closing[] = [];
    for (let j = 0; j < contourSegs.length; j++) {
      if (edgeTypeOf(j) !== "RAKE") continue;
      const sSeg = contourSegs[j];
      const pr = segParams(o, { x: o.x + d.x, y: o.y + d.y }, sSeg.a, sSeg.b);
      if (!pr || pr.t <= EPS || pr.u < -1e-9 || pr.u > 1 + 1e-9) continue;
      const p = { x: o.x + d.x * pr.t, y: o.y + d.y * pr.t };
      out.push({ cost: pr.t, apply: () => moveEnd(i, end, p), check: () => pathClearFor(i, o, p) });
    }
    return out;
  });

  // ── family C: crease apexes — support × support, junction believable when
  //             at least ONE participant's measured extent reaches within a
  //             probe of it (direction trusted, extent not) ──
  runFamily((i, end) => {
    if (!kindOf(lines[i].index)) return [];
    const { o, d } = endGeom(i, end);
    if (!d) return [];
    const out: Closing[] = [];
    for (let j = 0; j < lines.length; j++) {
      if (j === i || !kindOf(lines[j].index)) continue;
      const sLn = lines[j];
      const eLen = Math.hypot(sLn.b.x - sLn.a.x, sLn.b.y - sLn.a.y) || 1;
      const pr = segParams(o, { x: o.x + d.x, y: o.y + d.y }, sLn.a, sLn.b);
      if (!pr || pr.t <= EPS) continue;
      const pExt = pr.u < 0 ? -pr.u * eLen : pr.u > 1 ? (pr.u - 1) * eLen : 0;
      if (Math.min(pr.t, pExt) > allowance) continue;
      const p = { x: o.x + d.x * pr.t, y: o.y + d.y * pr.t };
      out.push({
        cost: Math.max(pr.t, pExt),
        apply: () => {
          moveEnd(i, end, p);
          if (pExt > 0) {
            if (pr.u < 0) { sLn.a = p; locked.add(`${j}|0`); }
            else { sLn.b = p; locked.add(`${j}|1`); }
          }
        },
        check: () => pathClearFor(i, o, p),
      });
    }
    return out;
  });

  // ── family D: the generic small closings (everything within one probe) ──
  runFamily((i, end) => {
    const { o, myLen, d } = endGeom(i, end);
    if (!d || myLen < EPS) return [];
    const out: Closing[] = [];
    // contour vertex
    for (const v of ring) {
      const dist = Math.hypot(v.x - o.x, v.y - o.y);
      if (dist <= allowance) out.push({ cost: dist, apply: () => moveEnd(i, end, v), check: () => pathClearFor(i, o, v) });
    }
    // another line's endpoint — mutual weld to the midpoint
    for (let j = 0; j < lines.length; j++) {
      if (j === i) continue;
      for (const jEnd of [0, 1] as const) {
        const e2 = jEnd === 0 ? lines[j].a : lines[j].b;
        const dist = Math.hypot(e2.x - o.x, e2.y - o.y);
        if (dist > allowance || dist < EPS) continue;
        const mid = { x: (o.x + e2.x) / 2, y: (o.y + e2.y) / 2 };
        out.push({
          cost: dist,
          apply: () => {
            moveEnd(i, end, mid);
            if (jEnd === 0) lines[j].a = mid;
            else lines[j].b = mid;
            locked.add(`${j}|${jEnd}`);
          },
          check: () => pathClearFor(i, o, mid),
        });
      }
    }
    // ray to a contour segment
    for (const sSeg of contourSegs) {
      const pr = segParams(o, { x: o.x + d.x, y: o.y + d.y }, sSeg.a, sSeg.b);
      if (!pr || pr.t <= EPS || pr.u < -1e-9 || pr.u > 1 + 1e-9) continue;
      if (pr.t <= allowance) {
        const p = { x: o.x + d.x * pr.t, y: o.y + d.y * pr.t };
        out.push({ cost: pr.t, apply: () => moveEnd(i, end, p), check: () => pathClearFor(i, o, p) });
      }
    }
    // ray to another line's support, bilateral
    for (let j = 0; j < lines.length; j++) {
      if (j === i) continue;
      const sLn = lines[j];
      const eLen = Math.hypot(sLn.b.x - sLn.a.x, sLn.b.y - sLn.a.y) || 1;
      const pr = segParams(o, { x: o.x + d.x, y: o.y + d.y }, sLn.a, sLn.b);
      if (!pr || pr.t <= EPS) continue;
      const pExt = pr.u < 0 ? -pr.u * eLen : pr.u > 1 ? (pr.u - 1) * eLen : 0;
      const cost = Math.max(pr.t, pExt);
      if (cost > allowance) continue;
      const p = { x: o.x + d.x * pr.t, y: o.y + d.y * pr.t };
      out.push({
        cost,
        apply: () => {
          moveEnd(i, end, p);
          if (pExt > 0) {
            if (pr.u < 0) { sLn.a = p; locked.add(`${j}|0`); }
            else { sLn.b = p; locked.add(`${j}|1`); }
          }
        },
        check: () => pathClearFor(i, o, p),
      });
    }
    return out;
  });

  // ── 3. split everything at intersections, weld nodes ──
  const segs = allSegsNow();
  const cutsPer: number[][] = segs.map(() => [0, 1]);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      // consecutive contour edges share a vertex by construction
      const pr = segParams(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
      if (!pr) continue;
      const tol = 1e-7;
      if (pr.t >= -tol && pr.t <= 1 + tol && pr.u >= -tol && pr.u <= 1 + tol) {
        cutsPer[i].push(Math.min(1, Math.max(0, pr.t)));
        cutsPer[j].push(Math.min(1, Math.max(0, pr.u)));
      }
    }
  }
  // node store with MERGE_FT collapse
  const nodes: FootprintPoint[] = [];
  const nodeAt = (p: FootprintPoint): number => {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) <= MERGE_FT) return i;
    }
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };
  interface GEdge { u: number; v: number; source: SegSource }
  const edgeKeys = new Set<string>();
  const edges: GEdge[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const ts = [...new Set(cutsPer[i])].sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      const a = { x: s.a.x + (s.b.x - s.a.x) * ts[k], y: s.a.y + (s.b.y - s.a.y) * ts[k] };
      const b = { x: s.a.x + (s.b.x - s.a.x) * ts[k + 1], y: s.a.y + (s.b.y - s.a.y) * ts[k + 1] };
      const u = nodeAt(a);
      const v = nodeAt(b);
      if (u === v) continue;
      if (s.source.kind === "line" && Math.hypot(b.x - a.x, b.y - a.y) < MIN_EDGE_FT) continue;
      const key = u < v ? `${u}|${v}` : `${v}|${u}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ u, v, source: s.source });
    }
  }

  // ── 4. prune dangles (a dangling edge cannot bound two cells) ──
  const dropFt = new Map<number, number>();
  for (let pass = 0; pass < 100; pass++) {
    const deg = new Map<number, number>();
    for (const e of edges) {
      deg.set(e.u, (deg.get(e.u) ?? 0) + 1);
      deg.set(e.v, (deg.get(e.v) ?? 0) + 1);
    }
    let removed = false;
    for (let i = edges.length - 1; i >= 0; i--) {
      const e = edges[i];
      if ((deg.get(e.u) ?? 0) <= 1 || (deg.get(e.v) ?? 0) <= 1) {
        if (e.source.kind === "line") {
          const ftLen = Math.hypot(nodes[e.u].x - nodes[e.v].x, nodes[e.u].y - nodes[e.v].y);
          dropFt.set(e.source.index, (dropFt.get(e.source.index) ?? 0) + ftLen);
        }
        edges.splice(i, 1);
        removed = true;
      }
    }
    if (!removed) break;
  }
  for (const [index, ftLen] of dropFt) {
    if (ftLen < MIN_EDGE_FT) continue;
    droppedLines.push({ index, lengthFt: ftLen, reason: "dangling after junction closing — pruned" });
  }

  // ── 5. planarity re-check: nothing may cross except at shared nodes ──
  let recross = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      if (a.u === b.u || a.u === b.v || a.v === b.u || a.v === b.v) continue;
      const pr = segParams(nodes[a.u], nodes[a.v], nodes[b.u], nodes[b.v]);
      if (!pr) continue;
      const tol = 1e-7;
      if (pr.t > tol && pr.t < 1 - tol && pr.u > tol && pr.u < 1 - tol) recross++;
    }
  }
  if (recross > 0) report.push(`ПРОВЕРКА НЕ ПРОШЛА: ${recross} пар рёбер пересеклись после нормализации`);

  // ── 6. face walk (half-edges, next = clockwise-most turn) ──
  interface Half { from: number; to: number; edge: number; next?: number }
  const halves: Half[] = [];
  for (let ei = 0; ei < edges.length; ei++) {
    halves.push({ from: edges[ei].u, to: edges[ei].v, edge: ei });
    halves.push({ from: edges[ei].v, to: edges[ei].u, edge: ei });
  }
  const outAt = new Map<number, number[]>();
  for (let hi = 0; hi < halves.length; hi++) {
    const arr = outAt.get(halves[hi].from) ?? [];
    arr.push(hi);
    outAt.set(halves[hi].from, arr);
  }
  for (const [n, arr] of outAt) {
    arr.sort((x, y) => {
      const hx = halves[x];
      const hy = halves[y];
      const ax = Math.atan2(nodes[hx.to].y - nodes[n].y, nodes[hx.to].x - nodes[n].x);
      const ay = Math.atan2(nodes[hy.to].y - nodes[n].y, nodes[hy.to].x - nodes[n].x);
      return ax - ay;
    });
  }
  const twinOf = (hi: number) => (hi % 2 === 0 ? hi + 1 : hi - 1);
  for (let hi = 0; hi < halves.length; hi++) {
    const tw = twinOf(hi);
    const at = halves[hi].to;
    const arr = outAt.get(at)!;
    const pos = arr.indexOf(tw);
    // next outgoing CLOCKWISE from the twin => faces keep interior on the left
    halves[hi].next = arr[(pos - 1 + arr.length) % arr.length];
  }
  const seen = new Array<boolean>(halves.length).fill(false);
  interface RawFace { ring: number[]; halfEdges: number[]; area: number }
  const rawFaces: RawFace[] = [];
  for (let h0 = 0; h0 < halves.length; h0++) {
    if (seen[h0]) continue;
    const idxs: number[] = [];
    let h = h0;
    for (let k = 0; k < halves.length + 1; k++) {
      seen[h] = true;
      idxs.push(h);
      h = halves[h].next!;
      if (h === h0) break;
    }
    const ringIds = idxs.map((x) => halves[x].from);
    const pts = ringIds.map((n) => nodes[n]);
    rawFaces.push({ ring: ringIds, halfEdges: idxs, area: signedArea(pts) });
  }
  let cellsRaw = rawFaces.filter((f) => f.area > EPS);

  // ── 7. sliver merge: cells under the facet floor dissolve into the
  //       neighbour they share the most boundary with ──
  const edgeCellCount = () => {
    const m = new Map<number, RawFace[]>();
    for (const f of cellsRaw) for (const hi of f.halfEdges) {
      const arr = m.get(halves[hi].edge) ?? [];
      arr.push(f);
      m.set(halves[hi].edge, arr);
    }
    return m;
  };
  for (let pass = 0; pass < 50; pass++) {
    const small = cellsRaw.filter((f) => f.area < minCell).sort((x, y) => x.area - y.area)[0];
    if (!small) break;
    const byEdge = edgeCellCount();
    const shareLen = new Map<RawFace, number>();
    for (const hi of small.halfEdges) {
      const ei = halves[hi].edge;
      for (const f2 of byEdge.get(ei) ?? []) {
        if (f2 === small) continue;
        const l2 = Math.hypot(nodes[edges[ei].u].x - nodes[edges[ei].v].x, nodes[edges[ei].u].y - nodes[edges[ei].v].y);
        shareLen.set(f2, (shareLen.get(f2) ?? 0) + l2);
      }
    }
    const host = [...shareLen.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    if (!host) break; // bounded by contour alone — the guard will count it
    const sharedEdges = new Set<number>();
    for (const hi of small.halfEdges) {
      const ei = halves[hi].edge;
      if ((byEdge.get(ei) ?? []).includes(host)) sharedEdges.add(ei);
    }
    for (const ei of sharedEdges) {
      const e = edges[ei];
      if (e.source.kind === "line") {
        const l2 = Math.hypot(nodes[e.u].x - nodes[e.v].x, nodes[e.u].y - nodes[e.v].y);
        dissolvedFt.set(e.source.index, (dissolvedFt.get(e.source.index) ?? 0) + l2);
      }
    }
    const keep = [...host.halfEdges, ...small.halfEdges].filter((hi) => !sharedEdges.has(halves[hi].edge));
    // chain the surviving directed edges into one ring
    const byFrom = new Map<number, number[]>();
    for (const hi of keep) {
      const arr = byFrom.get(halves[hi].from) ?? [];
      arr.push(hi);
      byFrom.set(halves[hi].from, arr);
    }
    const chained: number[] = [];
    let cur = keep[0];
    for (let k = 0; k < keep.length; k++) {
      chained.push(cur);
      const nexts = byFrom.get(halves[cur].to) ?? [];
      const nx = nexts.find((hi) => !chained.includes(hi));
      if (nx === undefined) break;
      cur = nx;
    }
    if (chained.length !== keep.length) { report.push(`слияние ячейки ${small.area.toFixed(1)} sf не замкнулось — оставлена`); break; }
    const merged: RawFace = {
      ring: chained.map((hi) => halves[hi].from),
      halfEdges: chained,
      area: host.area + small.area,
    };
    cellsRaw = cellsRaw.filter((f) => f !== host && f !== small);
    cellsRaw.push(merged);
  }

  // ── 8. output + the by-construction claims, verified ──
  const usedNodes = new Set<number>();
  const usedEdges = new Set<number>();
  for (const f of cellsRaw) for (const hi of f.halfEdges) {
    usedNodes.add(halves[hi].from);
    usedEdges.add(halves[hi].edge);
  }
  const euler = usedNodes.size - usedEdges.size + cellsRaw.length;
  const totalCellArea = cellsRaw.reduce((s, f) => s + f.area, 0);
  const tilingPct = contourArea > 0 ? (Math.abs(totalCellArea - contourArea) / contourArea) * 100 : 0;

  const cells: ArrangeCell[] = cellsRaw.map((f) => ({
    ring: f.ring.map((n) => ({ x: nodes[n].x, y: nodes[n].y })),
    edges: f.halfEdges.map((hi) => ({
      a: { x: nodes[halves[hi].from].x, y: nodes[halves[hi].from].y },
      b: { x: nodes[halves[hi].to].x, y: nodes[halves[hi].to].y },
      source: edges[halves[hi].edge].source,
    })),
    areaSqft: f.area,
  }));

  return { cells, euler, tilingPct, droppedLines, dissolvedFt, report };
}

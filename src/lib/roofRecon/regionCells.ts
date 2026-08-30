// Region cells — the owner's chosen base, carried to its conclusion: «грань
// определяется своим кластером». Cells come from the CLUSTER REGIONS
// themselves (the assignment map), not from lines; the measured lines only
// STRAIGHTEN region boundaries where they run along them. Where no line
// exists, the boundary stays as traced — it is measured by pixel membership,
// which is more honest than a straight line from nowhere.
//
//   boundaries   lattice edges between 4-adjacent pixels of different regions,
//                chained into polylines (one polyline separates one pair)
//   nodes        3+ boundaries meet MULTI-WAY: one node, never pairwise —
//                position from the least-squares intersection of the
//                controlling measured lines' supports when at least two
//                control it, else the traced junction point stays
//   control      a line controls geometry only within its allowed extension
//                E = L·probe/σ⊥ (direction error ~ σ⊥/L; beyond E the drift
//                exceeds one classifier probe) — a fragment whose E does not
//                reach the node does not govern it
//   straighten   covered polyline vertices project onto the line's support;
//                uncovered runs keep their traced pixel geometry; everything
//                simplifies at one raster step
//   contour      region|outside boundaries are DISCARDED — the exact Instant
//                ring replaces them, split where boundaries terminate on it
//   faces        the shared half-edge walk (walkPlanarFaces) — Euler and
//                tiling by construction, verified by the guards downstream
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { signedArea } from "@/lib/roofRecon/footprint";
import { PROBE_FT } from "@/lib/roofRecon/measuredLines";
import { walkPlanarFaces, mergeSmallFaces, pruneDanglingEdges } from "@/lib/roofRecon/arrangement";
import { DEFAULT_PLANE_TOL_FT } from "@/lib/roofRecon";

export type RegionEdgeProv = "measured-line" | "region-boundary" | "contour";

export interface RegionLine {
  a: FootprintPoint;
  b: FootprintPoint;
  /** Cluster ids the line separates. */
  between: [number, number];
  sigmaPerpFt: number;
  /** |∇A − ∇B| of the pair; the straightening corridor derives from it. */
  gradDiffPerFt: number;
}

export interface RegionCellsInput {
  /** Per raster pixel: region id >= 0, or -1 (outside — ignored). */
  labels: Int32Array;
  regionKind: Array<"cluster" | "fill">;
  /** region id -> cluster id, or -1 for fill regions. */
  clusterOf: number[];
  width: number;
  height: number;
  stepFt: number;
  /** Exact ring, same ft frame as the pixel grid. */
  contour: FootprintPoint[];
  lines: RegionLine[];
  /** Per-vertex membership-ambiguity test: true when the surface at p fits
   *  BOTH planes of the line's pair within the growth tolerance — measured on
   *  12621: 80% of border pixels do, med 0.35 ft from the analytic line. When
   *  given, straightening trusts it instead of the corridor width. */
  dualFit?: (p: FootprintPoint, line: RegionLine) => boolean;
  /** True when p lies in dilation-absorbed territory (no assigned pixels). */
  absorbed?: (p: FootprintPoint) => boolean;
  probeFt?: number;
  minCellSqft?: number;
}

export interface RegionCellEdge {
  a: FootprintPoint;
  b: FootprintPoint;
  prov: RegionEdgeProv;
  /** For measured-line edges: index into input.lines. */
  lineIndex?: number;
  /** For region-boundary edges: the region pair. */
  pair?: [number, number];
  /** For contour edges: input ring edge index. */
  contourIndex?: number;
}

export interface RegionCell {
  ring: FootprintPoint[];
  edges: RegionCellEdge[];
  regionId: number;
  areaSqft: number;
}

export interface RegionCellsResult {
  cells: RegionCell[];
  euler: number;
  tilingPct: number;
  /** Inter-cluster boundary accounting — the stop-condition numbers. */
  straightenedFt: number;
  raggedFt: number;
  /** Straightened only by the absorbed-territory rule (dilation artifacts). */
  artifactFt: number;
  report: string[];
}

const dp = (pts: FootprintPoint[], tol: number): FootprintPoint[] => {
  if (pts.length <= 2) return pts;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let worst = -1;
  let wi = -1;
  for (let i = 1; i + 1 < pts.length; i++) {
    const d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / len;
    if (d > worst) { worst = d; wi = i; }
  }
  if (worst <= tol) return [a, b];
  const left = dp(pts.slice(0, wi + 1), tol);
  const right = dp(pts.slice(wi), tol);
  return [...left.slice(0, -1), ...right];
};

export function buildRegionCells(input: RegionCellsInput): RegionCellsResult {
  const { labels, width: w, height: h, stepFt, lines } = input;
  const probe = input.probeFt ?? PROBE_FT;
  const minCell = input.minCellSqft ?? 15;
  const report: string[] = [];
  const cx = w / 2;
  const cy = h / 2;
  const cornerFt = (ix: number, iy: number): FootprintPoint => ({ x: (ix - cx) * stepFt, y: (cy - iy) * stepFt });

  let ring = input.contour.slice();
  if (ring.length >= 2 && Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 1e-9) ring = ring.slice(0, -1);
  const ringReversed = signedArea(ring) < 0;
  if (ringReversed) ring = ring.slice().reverse();
  const contourIndexOf = (j: number): number => (ringReversed ? (ring.length - 2 - j + ring.length) % ring.length : j);
  const contourArea = Math.abs(signedArea(ring));
  let scale = 1;
  for (const p of ring) scale = Math.max(scale, Math.abs(p.x), Math.abs(p.y));
  const EPS = 1e-9 * scale;
  const WELD = 1e-6 * scale; // node coincidence — the skeleton.ts law

  // ── 1. boundary lattice edges between different regions ──
  // Lattice point key: iy * (w + 1) + ix.
  const lp = (ix: number, iy: number) => iy * (w + 1) + ix;
  interface LEdge { p: number; q: number; pair: string }
  const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const lEdges: LEdge[] = [];
  const at = (ix: number, iy: number): number => (ix < 0 || iy < 0 || ix >= w || iy >= h ? -1 : labels[iy * w + ix]);
  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      const me = at(ix, iy);
      if (me < 0) continue;
      const right = at(ix + 1, iy);
      if (right >= 0 && right !== me) lEdges.push({ p: lp(ix + 1, iy), q: lp(ix + 1, iy + 1), pair: pairKey(me, right) });
      const down = at(ix, iy + 1);
      if (down >= 0 && down !== me) lEdges.push({ p: lp(ix, iy + 1), q: lp(ix + 1, iy + 1), pair: pairKey(me, down) });
    }
  }

  // ── 2. chain lattice edges into polylines (constant pair, node to node) ──
  const incident = new Map<number, number[]>();
  for (let i = 0; i < lEdges.length; i++) {
    for (const n of [lEdges[i].p, lEdges[i].q]) {
      const arr = incident.get(n) ?? [];
      arr.push(i);
      incident.set(n, arr);
    }
  }
  const isNode = (n: number): boolean => {
    const inc = incident.get(n) ?? [];
    if (inc.length !== 2) return true;
    return lEdges[inc[0]].pair !== lEdges[inc[1]].pair;
  };
  interface Poly { pts: number[]; pair: string }
  const polys: Poly[] = [];
  const used = new Array<boolean>(lEdges.length).fill(false);
  for (let start = 0; start < lEdges.length; start++) {
    if (used[start]) continue;
    // find a node endpoint to start from; closed loops start anywhere
    let e0 = start;
    let head = lEdges[e0].p;
    if (!isNode(head) && !isNode(lEdges[e0].q)) {
      // walk back to a node or until loop closes
      let cur = e0;
      let from = lEdges[e0].p;
      const seenE = new Set<number>([e0]);
      for (let guard = 0; guard < lEdges.length; guard++) {
        if (isNode(from)) break;
        const inc = (incident.get(from) ?? []).filter((x) => x !== cur && !used[x]);
        const nx = inc.find((x) => lEdges[x].pair === lEdges[cur].pair);
        if (nx === undefined || seenE.has(nx)) break;
        seenE.add(nx);
        cur = nx;
        from = lEdges[nx].p === from ? lEdges[nx].q : lEdges[nx].p;
      }
      e0 = cur;
      head = from;
    } else if (!isNode(head)) {
      head = lEdges[e0].q;
    }
    // walk forward collecting the polyline
    const pts: number[] = [head];
    let cur = e0;
    let from = head;
    for (let guard = 0; guard <= lEdges.length; guard++) {
      if (used[cur]) break;
      used[cur] = true;
      const to = lEdges[cur].p === from ? lEdges[cur].q : lEdges[cur].p;
      pts.push(to);
      if (isNode(to) || to === head) break;
      const inc = (incident.get(to) ?? []).filter((x) => x !== cur && !used[x] && lEdges[x].pair === lEdges[cur].pair);
      if (!inc.length) break;
      cur = inc[0];
      from = to;
    }
    if (pts.length >= 2) polys.push({ pts, pair: lEdges[e0].pair });
  }

  // ── 3. to ft coordinates; terminals onto the exact ring ──
  const ptFt = (n: number): FootprintPoint => cornerFt(n % (w + 1), Math.floor(n / (w + 1)));
  const ringSegs = ring.map((p, i) => ({ a: p, b: ring[(i + 1) % ring.length], index: i }));
  const projectToRing = (p: FootprintPoint): { pt: FootprintPoint; seg: number; t: number; dist: number } => {
    let best = { pt: p, seg: 0, t: 0, dist: Infinity };
    for (let i = 0; i < ringSegs.length; i++) {
      const s = ringSegs[i];
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2));
      const q = { x: s.a.x + dx * t, y: s.a.y + dy * t };
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      if (dist < best.dist) best = { pt: q, seg: i, t, dist };
    }
    return best;
  };
  // a terminal = a polyline end that is NOT a 3-way junction (its lattice
  // point had degree 1 or a pair change against outside) — near the contour
  const degreeOf = (n: number) => (incident.get(n) ?? []).length;

  interface VPoly {
    pts: FootprintPoint[];
    pair: [number, number];
    endsOnRing: [{ seg: number; t: number } | null, { seg: number; t: number } | null];
  }
  const vpolys: VPoly[] = [];
  for (const poly of polys) {
    const [ra, rb] = poly.pair.split("|").map(Number);
    const pts = poly.pts.map(ptFt);
    const ends: VPoly["endsOnRing"] = [null, null];
    for (const endI of [0, 1] as const) {
      const n = endI === 0 ? poly.pts[0] : poly.pts[poly.pts.length - 1];
      if (poly.pts[0] === poly.pts[poly.pts.length - 1]) continue; // closed loop
      if (degreeOf(n) === 1) {
        // reaches the contour: snap onto the exact ring
        const pr = projectToRing(endI === 0 ? pts[0] : pts[pts.length - 1]);
        if (endI === 0) pts[0] = pr.pt;
        else pts[pts.length - 1] = pr.pt;
        ends[endI] = { seg: pr.seg, t: pr.t };
      }
    }
    vpolys.push({ pts, pair: [ra, rb], endsOnRing: ends });
  }

  // ── 4. multi-way node resolution ──
  // Junction positions are traced; when >= 2 measured lines CONTROL the node
  // (perp <= probe and support-parameter within [-E, L+E], E = L·probe/σ⊥),
  // the node moves to the least-squares intersection of their supports —
  // capped at one probe, else it stays and the cap is reported.
  const lineGeom = lines.map((l) => {
    const L = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
    const d = L > EPS ? { x: (l.b.x - l.a.x) / L, y: (l.b.y - l.a.y) / L } : { x: 1, y: 0 };
    const n = { x: -d.y, y: d.x };
    const E = l.sigmaPerpFt > 1e-6 ? (L * probe) / l.sigmaPerpFt : Number.POSITIVE_INFINITY;
    // The straightening corridor is NOT the probe: a traced border pixel is
    // ambiguous only where the two planes differ by less than the growth
    // tolerance — half-width planeTol/|∇A−∇B| — plus one raster step of
    // quantisation. The first run used the probe (6 ft) and the projections
    // dragged vertices sideways across neighbouring boundaries (planarity
    // census: measured-line×region-boundary was the dominant crossing kind).
    const corridor = l.gradDiffPerFt > 1e-6 ? DEFAULT_PLANE_TOL_FT / l.gradDiffPerFt + stepFt : stepFt;
    return { ...l, L, d, n, E, corridor };
  });
  const lineForPair = new Map<string, number>();
  const clusterPairKey = (ca: number, cb: number) => (ca < cb ? `${ca}|${cb}` : `${cb}|${ca}`);
  lineGeom.forEach((l, i) => lineForPair.set(clusterPairKey(l.between[0], l.between[1]), i));
  const clusterOfRegion = (r: number): number => input.clusterOf[r] ?? -1;
  const controls = (li: number, p: FootprintPoint): boolean => {
    const l = lineGeom[li];
    const rel = { x: p.x - l.a.x, y: p.y - l.a.y };
    const perp = Math.abs(rel.x * l.n.x + rel.y * l.n.y);
    if (perp > l.corridor) return false;
    const t = rel.x * l.d.x + rel.y * l.d.y;
    return t >= -l.E && t <= l.L + l.E;
  };

  const vKeyQ = (p: FootprintPoint) => `${Math.round(p.x / Math.max(WELD, 1e-6))}|${Math.round(p.y / Math.max(WELD, 1e-6))}`;
  const junctionAt = new Map<string, { p: FootprintPoint; polyEnds: Array<{ poly: number; end: 0 | 1 }> }>();
  vpolys.forEach((vp, pi) => {
    for (const end of [0, 1] as const) {
      if (vp.endsOnRing[end]) continue;
      const p = end === 0 ? vp.pts[0] : vp.pts[vp.pts.length - 1];
      const k = vKeyQ(p);
      const rec = junctionAt.get(k) ?? { p, polyEnds: [] };
      rec.polyEnds.push({ poly: pi, end });
      junctionAt.set(k, rec);
    }
  });
  let nodeMoves = 0;
  let nodeCapped = 0;
  for (const rec of junctionAt.values()) {
    if (rec.polyEnds.length < 3) continue;
    const ctrl = new Set<number>();
    for (const pe of rec.polyEnds) {
      const vp = vpolys[pe.poly];
      const ca = clusterOfRegion(vp.pair[0]);
      const cb = clusterOfRegion(vp.pair[1]);
      if (ca < 0 || cb < 0) continue;
      const li = lineForPair.get(clusterPairKey(ca, cb));
      if (li !== undefined && controls(li, rec.p)) ctrl.add(li);
    }
    if (ctrl.size < 2) continue;
    // least-squares point: minimise Σ ((p − a_i)·n_i)²
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (const li of ctrl) {
      const l = lineGeom[li];
      const rhs = l.a.x * l.n.x + l.a.y * l.n.y;
      a11 += l.n.x * l.n.x;
      a12 += l.n.x * l.n.y;
      a22 += l.n.y * l.n.y;
      b1 += l.n.x * rhs;
      b2 += l.n.y * rhs;
    }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-9) continue;
    const px = (b1 * a22 - b2 * a12) / det;
    const py = (a11 * b2 - a12 * b1) / det;
    const move = Math.hypot(px - rec.p.x, py - rec.p.y);
    const moveCap = Math.max(...[...ctrl].map((li) => lineGeom[li].corridor));
    if (move > moveCap) { nodeCapped++; continue; }
    const np = { x: px, y: py };
    nodeMoves++;
    for (const pe of rec.polyEnds) {
      const vp = vpolys[pe.poly];
      if (pe.end === 0) vp.pts[0] = np;
      else vp.pts[vp.pts.length - 1] = np;
    }
  }
  if (nodeMoves || nodeCapped) report.push(`узлы: ${nodeMoves} сведено по линиям, ${nodeCapped} за пробником — оставлены измеренными`);

  // ── 5. straightening: simplify first, then project vertex by vertex with
  //       the normalisation rule — a move that makes an adjacent segment
  //       cross another boundary is REFUSED, never applied ──
  interface FinalEdge { u: number; v: number; prov: RegionEdgeProv; lineIndex?: number; pair?: [number, number]; contourIndex?: number }
  const nodes: FootprintPoint[] = [];
  const nodeIds = new Map<string, number>();
  const nodeAt = (p: FootprintPoint): number => {
    const k = vKeyQ(p);
    let id = nodeIds.get(k);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ x: p.x, y: p.y });
      nodeIds.set(k, id);
    }
    return id;
  };
  const inRingPt = (p: FootprintPoint): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (ring[i].y > p.y !== ring[j].y > p.y && p.x < ((ring[j].x - ring[i].x) * (p.y - ring[i].y)) / (ring[j].y - ring[i].y) + ring[i].x) inside = !inside;
    }
    return inside;
  };
  interface SimpPoly { pts: Array<FootprintPoint & { c?: boolean }>; pair: [number, number]; li?: number; interCluster: boolean }
  const simped: SimpPoly[] = vpolys.map((vp) => {
    const ca = clusterOfRegion(vp.pair[0]);
    const cb = clusterOfRegion(vp.pair[1]);
    const li = ca >= 0 && cb >= 0 ? lineForPair.get(clusterPairKey(ca, cb)) : undefined;
    const pts = dp(vp.pts, stepFt).map((p) => ({ ...p })) as Array<FootprintPoint & { c?: boolean }>;
    // clamp stray vertices into the exact ring (half-pixel excursions)
    for (let i = 1; i + 1 < pts.length; i++) {
      if (!inRingPt(pts[i])) {
        const pr = projectToRing(pts[i]);
        pts[i] = { ...pr.pt };
      }
    }
    return { pts, pair: vp.pair, li, interCluster: ca >= 0 && cb >= 0 };
  });
  const segsCross = (a: FootprintPoint, b: FootprintPoint, skipPoly: number, skipIdx: number[]): boolean => {
    // the exact ring participates: a projection must not cross the contour
    for (const rs of ringSegs) {
      const d1 = { x: b.x - a.x, y: b.y - a.y };
      const d2 = { x: rs.b.x - rs.a.x, y: rs.b.y - rs.a.y };
      const den = d1.x * d2.y - d1.y * d2.x;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((rs.a.x - a.x) * d2.y - (rs.a.y - a.y) * d2.x) / den;
      const u = ((rs.a.x - a.x) * d1.y - (rs.a.y - a.y) * d1.x) / den;
      const tol = 1e-7;
      if (t > tol && t < 1 - tol && u > tol && u < 1 - tol) return true;
    }
    for (let pi = 0; pi < simped.length; pi++) {
      const sp = simped[pi];
      for (let i = 0; i + 1 < sp.pts.length; i++) {
        if (pi === skipPoly && skipIdx.includes(i)) continue;
        const p1 = sp.pts[i];
        const p2 = sp.pts[i + 1];
        const d1 = { x: b.x - a.x, y: b.y - a.y };
        const d2 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const den = d1.x * d2.y - d1.y * d2.x;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((p1.x - a.x) * d2.y - (p1.y - a.y) * d2.x) / den;
        const u = ((p1.x - a.x) * d1.y - (p1.y - a.y) * d1.x) / den;
        const tol = 1e-7;
        if (t > tol && t < 1 - tol && u > tol && u < 1 - tol) return true;
      }
    }
    return false;
  };
  for (let pi = 0; pi < simped.length; pi++) {
    const sp = simped[pi];
    if (sp.li === undefined) continue;
    const l = lineGeom[sp.li];
    for (let i = 0; i < sp.pts.length; i++) {
      const isEnd = i === 0 || i === sp.pts.length - 1;
      const p = sp.pts[i];
      const rel = { x: p.x - l.a.x, y: p.y - l.a.y };
      const perp = rel.x * l.n.x + rel.y * l.n.y;
      const t = rel.x * l.d.x + rel.y * l.d.y;
      if (t < -l.E || t > l.L + l.E) continue;
      // The polyhedron commitment: in the drawn model the fold IS the pair's
      // plane intersection, so the traced boundary straightens onto it along
      // its whole run — the surface's wander around the fold (measured: real
      // creases meander 1-2 ft, roofs sag) is the model's honest error, not
      // its topology. One probe bounds the reach; the per-vertex crossing
      // refusal below guards the topology.
      if (Math.abs(perp) > probe) continue;
      if (isEnd) { sp.pts[i].c = true; continue; }
      const target = { x: p.x - perp * l.n.x, y: p.y - perp * l.n.y };
      // the normalisation rule: both adjacent segments must stay clean
      const prev = sp.pts[i - 1];
      const next = sp.pts[i + 1];
      if (segsCross(prev, target, pi, [i - 1, i]) || segsCross(target, next, pi, [i - 1, i]) || !inRingPt(target)) continue;
      sp.pts[i] = { ...target, c: true };
    }
  }
  const edges: FinalEdge[] = [];
  let straightenedFt = 0;
  let raggedFt = 0;
  // artifactFt stays 0 until the absorbed-territory straightening lands with
  // the in-graph exact construction (see ROOF-STATE, final-block record).
  const artifactFt = 0;
  for (const sp of simped) {
    for (let i = 0; i + 1 < sp.pts.length; i++) {
      const u = nodeAt(sp.pts[i]);
      const v = nodeAt(sp.pts[i + 1]);
      if (u === v) continue;
      const segLen = Math.hypot(sp.pts[i + 1].x - sp.pts[i].x, sp.pts[i + 1].y - sp.pts[i].y);
      const straight = sp.li !== undefined && (sp.pts[i].c ?? false) && (sp.pts[i + 1].c ?? false);
      if (sp.interCluster) {
        if (straight) straightenedFt += segLen;
        else raggedFt += segLen;
      }
      edges.push(
        straight
          ? { u, v, prov: "measured-line", lineIndex: sp.li }
          : { u, v, prov: "region-boundary", pair: sp.pair },
      );
    }
  }

  // ── 6. the exact ring, split where polylines terminate on it ──
  const splitsPer: number[][] = ringSegs.map(() => [0, 1]);
  for (const vp of vpolys) {
    for (const end of [0, 1] as const) {
      const e = vp.endsOnRing[end];
      if (!e) continue;
      splitsPer[e.seg].push(e.t);
      // ensure the terminal node exists at the ring point
      nodeAt(end === 0 ? vp.pts[0] : vp.pts[vp.pts.length - 1]);
    }
  }
  for (let i = 0; i < ringSegs.length; i++) {
    const s = ringSegs[i];
    const ts = [...new Set(splitsPer[i])].sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      const a = { x: s.a.x + (s.b.x - s.a.x) * ts[k], y: s.a.y + (s.b.y - s.a.y) * ts[k] };
      const b = { x: s.a.x + (s.b.x - s.a.x) * ts[k + 1], y: s.a.y + (s.b.y - s.a.y) * ts[k + 1] };
      const u = nodeAt(a);
      const v = nodeAt(b);
      if (u === v) continue;
      edges.push({ u, v, prov: "contour", contourIndex: contourIndexOf(i) });
    }
  }

  // ── 6b. planarity census: crossings break the face walk — count them by
  //        source pair so the mechanism has a name, not a guess ──
  {
    const segOf = (e: FinalEdge) => ({ a: nodes[e.u], b: nodes[e.v] });
    const kinds = new Map<string, number>();
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i];
        const e2 = edges[j];
        if (e1.u === e2.u || e1.u === e2.v || e1.v === e2.u || e1.v === e2.v) continue;
        const s1 = segOf(e1);
        const s2 = segOf(e2);
        const d1 = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y };
        const d2 = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y };
        const den = d1.x * d2.y - d1.y * d2.x;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((s2.a.x - s1.a.x) * d2.y - (s2.a.y - s1.a.y) * d2.x) / den;
        const u = ((s2.a.x - s1.a.x) * d1.y - (s2.a.y - s1.a.y) * d1.x) / den;
        const tol = 1e-7;
        if (t > tol && t < 1 - tol && u > tol && u < 1 - tol) {
          const k = [e1.prov, e2.prov].sort().join("×");
          kinds.set(k, (kinds.get(k) ?? 0) + 1);
        }
      }
    }
    if (kinds.size) {
      report.push(
        `ПЛАНАРНОСТЬ НАРУШЕНА: ${[...kinds.entries()].map(([k, n]) => `${k}: ${n}`).join(" · ")}`,
      );
    }
  }

  // ── 7. faces from the shared walk ──
  const removed = pruneDanglingEdges(edges);
  if (removed.length) report.push(`${removed.length} висячих рёбер границ отсечено`);
  const { faces, halves } = walkPlanarFaces(nodes, edges);
  let cells0 = faces.filter((f) => f.area > EPS);
  const merged = mergeSmallFaces(nodes, edges, halves, cells0, minCell, report);
  cells0 = merged.faces;

  // ── 8. cell -> region by sampling the label map inside the face ──
  const inRingPts = (p: FootprintPoint, r: ReadonlyArray<FootprintPoint>): boolean => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
    }
    return inside;
  };
  const regionOfCell = (ringPts: FootprintPoint[]): number => {
    const xs = ringPts.map((p) => p.x);
    const ys = ringPts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const step = Math.max(stepFt, Math.min(maxX - minX, maxY - minY) / 10);
    const counts = new Map<number, number>();
    for (let y = minY + step / 2; y < maxY; y += step) {
      for (let x = minX + step / 2; x < maxX; x += step) {
        if (!inRingPts({ x, y }, ringPts)) continue;
        const ix = Math.floor(x / stepFt + cx);
        const iy = Math.floor(cy - y / stepFt);
        const lb = at(ix, iy);
        if (lb >= 0) counts.set(lb, (counts.get(lb) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  };

  const cells: RegionCell[] = cells0.map((f) => {
    const ringPts = f.ring.map((n) => ({ x: nodes[n].x, y: nodes[n].y }));
    return {
      ring: ringPts,
      edges: f.halfEdges.map((hi) => {
        const e = edges[halves[hi].edge];
        return {
          a: { x: nodes[halves[hi].from].x, y: nodes[halves[hi].from].y },
          b: { x: nodes[halves[hi].to].x, y: nodes[halves[hi].to].y },
          prov: e.prov,
          lineIndex: e.lineIndex,
          pair: e.pair,
          contourIndex: e.contourIndex,
        };
      }),
      regionId: regionOfCell(ringPts),
      areaSqft: f.area,
    };
  });

  const usedNodes = new Set<number>();
  const usedEdges = new Set<number>();
  for (const f of cells0) for (const hi of f.halfEdges) {
    usedNodes.add(halves[hi].from);
    usedEdges.add(halves[hi].edge);
  }
  const euler = usedNodes.size - usedEdges.size + cells0.length;
  const total = cells0.reduce((s, f) => s + f.area, 0);
  const tilingPct = contourArea > 0 ? (Math.abs(total - contourArea) / contourArea) * 100 : 0;

  return { cells, euler, tilingPct, straightenedFt, raggedFt, artifactFt, report };
}

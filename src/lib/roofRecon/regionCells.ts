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
  /**
   * Линия поставлена на аналитическое пересечение плоскостей пары (приказ
   * 2026-08-30): допуск проекции трассы на неё = max(probe, это значение) —
   * измеренное смещение трассы + окно; трасса обязана дойти до пересечения.
   */
  snapCorridorFt?: number;
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
  /** Прямой DSM-перепад поперёк сегмента (максимум станций): гейт
   *  атомарного переноса конца — конец СТЕНЫ живёт трассой. */
  wallDropOf?: (a: FootprintPoint, b: FootprintPoint) => number;
  probeFt?: number;
  minCellSqft?: number;
  /** Лента по этапам: copies of the boundary geometry after each construction
   *  stage, raster frame — purely observational. */
  onStage?: (stage: "traced" | "straightened" | "nodes" | "terminals", polys: Array<{ pts: FootprintPoint[]; pair: [number, number] }>) => void;
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
  /** Финишный слой: линии, доведённые до канона (оси дома, ±45°). */
  canonSnapped: number;
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
  // ── КАНОН НАПРАВЛЕНИЙ ──
  // Крыша сделана из прямых балок под каноническими углами: оси дома (из
  // рёбер контура, взвешенно по длине, mod 90°) и диагонали ±45°. Линия,
  // чьё направление в пределах СВОЕЙ угловой неопределённости от канона —
  // доводится (поворот вокруг середины); предел θmax = atan(2σ⊥/L): поворот
  // на θmax сдвигает концы на ≤ σ⊥ — внутри разброса измерения, не поверх
  // него. Вне предела линия остаётся измеренной: дом бывает неканоническим,
  // измерение главнее красоты.
  let canonSnapped = 0;
  {
    // house axis from the ring, length-weighted circular mean mod 90°
    let cs = 0;
    let sn = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const len2 = Math.hypot(b.x - a.x, b.y - a.y);
      const th4 = Math.atan2(b.y - a.y, b.x - a.x) * 4; // mod 90° = period π/2
      cs += len2 * Math.cos(th4);
      sn += len2 * Math.sin(th4);
    }
    const axis = Math.atan2(sn, cs) / 4;
    const canon = [axis, axis + Math.PI / 4, axis + Math.PI / 2, axis + (3 * Math.PI) / 4];
    for (const l of lineGeom) {
      if (l.L < EPS) continue;
      // Линия на аналитическом пересечении плоскостей (приказ 2026-08-30):
      // её направление — измерение с точностью плоскостей, не трассы; канон
      // (красота осей) её не трогает — измерение главнее красоты.
      if (l.snapCorridorFt !== undefined) continue;
      const th2 = Math.atan2(l.d.y, l.d.x);
      const thMax = Math.atan((2 * Math.max(l.sigmaPerpFt, stepFt)) / l.L);
      let best: number | null = null;
      let bestD = Infinity;
      for (const c2 of canon) {
        // direction is unsigned (period π)
        let dd = th2 - c2;
        while (dd > Math.PI / 2) dd -= Math.PI;
        while (dd < -Math.PI / 2) dd += Math.PI;
        if (Math.abs(dd) < bestD) { bestD = Math.abs(dd); best = th2 - dd; }
      }
      if (best === null || bestD > thMax || bestD < 1e-9) continue;
      const mid = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
      const half = l.L / 2;
      const d2 = { x: Math.cos(best), y: Math.sin(best) };
      l.a = { x: mid.x - d2.x * half, y: mid.y - d2.y * half };
      l.b = { x: mid.x + d2.x * half, y: mid.y + d2.y * half };
      l.d = d2;
      l.n = { x: -d2.y, y: d2.x };
      canonSnapped++;
    }
    if (canonSnapped) report.push(`канон: ${canonSnapped} линий доведено до осей/диагоналей (в пределах atan(2σ⊥/L))`);
  }
  const lineForPair = new Map<string, number>();
  const clusterPairKey = (ca: number, cb: number) => (ca < cb ? `${ca}|${cb}` : `${cb}|${ca}`);
  lineGeom.forEach((l, i) => lineForPair.set(clusterPairKey(l.between[0], l.between[1]), i));
  const clusterOfRegion = (r: number): number => input.clusterOf[r] ?? -1;

  const vKeyQ = (p: FootprintPoint) => `${Math.round(p.x / Math.max(WELD, 1e-6))}|${Math.round(p.y / Math.max(WELD, 1e-6))}`;


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
  const emitStage = (stage: "traced" | "straightened" | "nodes" | "terminals"): void => {
    input.onStage?.(stage, simped.map((sp) => ({ pts: sp.pts.map((q) => ({ x: q.x, y: q.y })), pair: sp.pair })));
  };
  emitStage("traced");
  const refuse = { reach: 0, perp: 0, cross: 0 };
  let lastCross = "";
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
      if (t > tol && t < 1 - tol && u > tol && u < 1 - tol) { lastCross = "ring"; return true; }
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
        if (t > tol && t < 1 - tol && u > tol && u < 1 - tol) { lastCross = `poly ${pi} [${sp.pair[0]}|${sp.pair[1]}] seg ${i} (${sp.pts[i].x.toFixed(1)},${sp.pts[i].y.toFixed(1)})`; return true; }
      }
    }
    return false;
  };
  {
    // one pass, ordered by |perp| ascending: the smallest projections land
    // first and clear the way for larger ones (index order tripped the
    // crossing guard on not-yet-projected neighbours of the same run)
    interface StraightCand { pi: number; i: number; perpAbs: number }
    const cands: StraightCand[] = [];
    for (let pi = 0; pi < simped.length; pi++) {
      const sp = simped[pi];
      if (sp.li === undefined) continue;
      const l = lineGeom[sp.li];
      for (let i = 0; i < sp.pts.length; i++) {
        const p = sp.pts[i];
        const rel = { x: p.x - l.a.x, y: p.y - l.a.y };
        const perp = rel.x * l.n.x + rel.y * l.n.y;
        cands.push({ pi, i, perpAbs: Math.abs(perp) });
      }
    }
    cands.sort((x, y) => x.perpAbs - y.perpAbs);
    for (const cd of cands) {
      const sp = simped[cd.pi];
      const l = lineGeom[sp.li!];
      const i = cd.i;
      const isEnd = i === 0 || i === sp.pts.length - 1;
      const p = sp.pts[i];
      const rel = { x: p.x - l.a.x, y: p.y - l.a.y };
      const perp = rel.x * l.n.x + rel.y * l.n.y;
      const t = rel.x * l.d.x + rel.y * l.d.y;
      if (t < -l.E || t > l.L + l.E) { refuse.reach++; continue; }
      const perpAllow = l.snapCorridorFt !== undefined ? Math.max(probe, l.snapCorridorFt) : probe;
      const viaAbsorbed = Math.abs(perp) > perpAllow;
      if (viaAbsorbed && !input.absorbed?.(p)) { refuse.perp++; continue; }
      if (isEnd) { sp.pts[i].c = true; continue; }
      const target = { x: p.x - perp * l.n.x, y: p.y - perp * l.n.y };
      const prev = sp.pts[i - 1];
      const next = sp.pts[i + 1];
      if (segsCross(prev, target, cd.pi, [i - 1, i]) || segsCross(target, next, cd.pi, [i - 1, i]) || !inRingPt(target)) { refuse.cross++; if (process.env.DBG_CROSS) report.push(`  x-отказ poly ${cd.pi} [${sp.pair[0]}|${sp.pair[1]}] v(${p.x.toFixed(1)},${p.y.toFixed(1)}) perp ${perp.toFixed(1)} блок: ${lastCross}`); continue; }
      sp.pts[i] = { ...target, c: true };
    }
  }
  // NB (класс 2, стоп с описанием): проход спрямления БЕСХОЗНЫХ стеновых
  // цепей (кластер|fill) на продолжение рёбер кольца снят — рвал 12618
  // (G1: концы цепи не проецируются, излом на стыке), а зигзаг 12629
  // сложен из кусков < 3 ft, которым нужно СЛИЯНИЕ вдоль одного
  // контурного направления до спрямления. Кластерные пары покрыты
  // масс-границами в measuredRoof (12621, 419).
  emitStage("straightened");
  // ── 5b. NODE CONSTRUCTION — exact, per junction, AFTER straightening ──
  // Order matters: nodes resolve against STRAIGHTENED neighbours, so their
  // new first segments are checked against final geometry (resolving before
  // straightening tripped the crossing guard on still-ragged traces).
  // Per-junction resolution replaces positional pre-gathering: the raster
  // splits one apex into pieces, but each piece resolves onto the SAME exact
  // intersection of the same lines — they meet in one node by construction;
  // two REAL apexes nearby (a 4-ft ridge between hip peaks) resolve to their
  // own two points, which pre-gathering wrongly fused. Only junctions that
  // FAIL resolution gather (pair-sharing union-find within one probe) so a
  // split apex without enough candidates still closes as one traced node.
  let lastCrossRef = "";
  const crossesSimped = (a: FootprintPoint, b: FootprintPoint, skipEnds: Array<{ poly: number; end: 0 | 1 }>): boolean => {
    const skip = new Set(skipEnds.map((pe) => `${pe.poly}|${pe.end}`));
    const segHit = (p1: FootprintPoint, p2: FootprintPoint): boolean => {
      const d1 = { x: b.x - a.x, y: b.y - a.y };
      const d2 = { x: p2.x - p1.x, y: p2.y - p1.y };
      const den = d1.x * d2.y - d1.y * d2.x;
      if (Math.abs(den) < 1e-12) return false;
      const t = ((p1.x - a.x) * d2.y - (p1.y - a.y) * d2.x) / den;
      const u = ((p1.x - a.x) * d1.y - (p1.y - a.y) * d1.x) / den;
      const tol = 1e-7;
      return t > tol && t < 1 - tol && u > tol && u < 1 - tol;
    };
    for (let pi = 0; pi < simped.length; pi++) {
      const pts = simped[pi].pts;
      for (let i = 0; i + 1 < pts.length; i++) {
        if (i === 0 && skip.has(`${pi}|0`)) continue;
        if (i === pts.length - 2 && skip.has(`${pi}|1`)) continue;
        if (segHit(pts[i], pts[i + 1])) { lastCrossRef = `poly ${pi} [${simped[pi].pair[0]}|${simped[pi].pair[1]}] seg ${i} (${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)})→(${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)})`; return true; }
      }
    }
    for (let ri = 0; ri < ringSegs.length; ri++) if (segHit(ringSegs[ri].a, ringSegs[ri].b)) { lastCrossRef = `ring seg ${ri} (${ringSegs[ri].a.x.toFixed(1)},${ringSegs[ri].a.y.toFixed(1)})→(${ringSegs[ri].b.x.toFixed(1)},${ringSegs[ri].b.y.toFixed(1)})`; return true; }
    return false;
  };
  const inRingPt0 = inRingPt;
  interface Junction { p: FootprintPoint; polyEnds: Array<{ poly: number; end: 0 | 1 }> }
  const junctions: Junction[] = [];
  {
    const at = new Map<string, Junction>();
    simped.forEach((sp, pi) => {
      for (const end of [0, 1] as const) {
        if (vpolys[pi].endsOnRing[end]) continue;
        const pt = end === 0 ? sp.pts[0] : sp.pts[sp.pts.length - 1];
        const k = vKeyQ(pt);
        const rec = at.get(k) ?? { p: pt, polyEnds: [] };
        rec.polyEnds.push({ poly: pi, end });
        at.set(k, rec);
      }
    });
    junctions.push(...at.values());
  }
  const applyNode = (j: Junction, np: FootprintPoint, mark: boolean): void => {
    for (const pe of j.polyEnds) {
      const sp = simped[pe.poly];
      const moved = { ...np, c: mark && sp.li !== undefined ? true : undefined } as FootprintPoint & { c?: boolean };
      if (pe.end === 0) sp.pts[0] = moved;
      else sp.pts[sp.pts.length - 1] = moved;
    }
  };
  let nodeMoves = 0;
  const failed: Junction[] = [];
  // a resolved point may be SHARED only by junctions sharing a boundary pair
  // (the split-apex law); an unrelated junction claiming an occupied point is
  // refused — otherwise distinct nodes fused and bred mega-faces (44 dup
  // vertices in one ring on 12629)
  const claimed: Array<{ pt: FootprintPoint; pairs: Set<string> }> = [];
  const pairsOfJ = (j: Junction): Set<string> => new Set(j.polyEnds.map((pe) => `${simped[pe.poly].pair[0]}|${simped[pe.poly].pair[1]}`));
  for (const j of junctions) {
    const cand = new Set<number>();
    for (const pe of j.polyEnds) {
      const sp = simped[pe.poly];
      if (sp.li !== undefined) {
        const l = lineGeom[sp.li];
        const t = (j.p.x - l.a.x) * l.d.x + (j.p.y - l.a.y) * l.d.y;
        if (t >= -l.E && t <= l.L + l.E) cand.add(sp.li);
      }
    }
    if (process.env.DBG_NODE) {
      const [qx, qy] = process.env.DBG_NODE.split(",").map(Number);
      if (Math.hypot(j.p.x - qx, j.p.y - qy) <= 2)
        console.log(`[node] узел (${j.p.x.toFixed(1)},${j.p.y.toFixed(1)}): цепей ${j.polyEnds.length} [${j.polyEnds.map((pe) => `p${pe.poly}(${simped[pe.poly].pair[0]}|${simped[pe.poly].pair[1]})li=${simped[pe.poly].li ?? "-"}`).join(" ")}] контролирующих линий ${cand.size}`);
    }
    let np: FootprintPoint | null = null;
    if (cand.size === 1) {
      // NB (2026-08-30, стоп с описанием): узел одиночной линии У КОЛЬЦА
      // должен стоять на НЕСУЩАЯ ∩ КОЛЬЦО (узел трассы в 3.9 ft травил
      // кольцо A7 на 12621 чужим план-эвалом 16.75 — R03). Два захода
      // (перенос узла; перенос + ринг-сплит терминалом) ломали смежные
      // цепи (R02; tiling 34.7% — vpolys/simped узла расходятся). Нужна
      // согласованная развязка ВСЕХ цепей узла с расщеплением кольца —
      // отдельный механизм, замер в ROOF-STATE.
      // a joint between two runs of ONE boundary is a point ON its line
      const l = lineGeom[[...cand][0]];
      const rel = { x: j.p.x - l.a.x, y: j.p.y - l.a.y };
      const perp = rel.x * l.n.x + rel.y * l.n.y;
      if (!np && Math.abs(perp) <= probe) {
        const pt = { x: j.p.x - perp * l.n.x, y: j.p.y - perp * l.n.y };
        let ok = inRingPt0(pt);
        if (ok) {
          for (const pe of j.polyEnds) {
            const sp = simped[pe.poly];
            const adj = pe.end === 0 ? sp.pts[1] : sp.pts[sp.pts.length - 2];
            if (adj && crossesSimped(pt, adj, j.polyEnds)) { ok = false; break; }
          }
        }
        if (ok) np = pt;
      }
    }
    if (cand.size >= 2) {
      const arr = [...cand];
      let best: { i: number; j: number; x: number } | null = null;
      for (let i = 0; i < arr.length; i++) {
        for (let k2 = i + 1; k2 < arr.length; k2++) {
          const c2 = Math.abs(lineGeom[arr[i]].d.x * lineGeom[arr[k2]].d.y - lineGeom[arr[i]].d.y * lineGeom[arr[k2]].d.x);
          if (!best || c2 > best.x) best = { i: arr[i], j: arr[k2], x: c2 };
        }
      }
      if (best && best.x > 1e-3) {
        const l1 = lineGeom[best.i];
        const l2 = lineGeom[best.j];
        const den = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
        const t1 = ((l2.a.x - l1.a.x) * l2.d.y - (l2.a.y - l1.a.y) * l2.d.x) / den;
        const pt = { x: l1.a.x + l1.d.x * t1, y: l1.a.y + l1.d.y * t1 };
        let ok = Math.hypot(pt.x - j.p.x, pt.y - j.p.y) <= probe && inRingPt0(pt);
        if (ok) {
          for (const li of cand) {
            const l = lineGeom[li];
            const perp = Math.abs((pt.x - l.a.x) * l.n.x + (pt.y - l.a.y) * l.n.y);
            if (perp > l.corridor) { ok = false; break; }
          }
        }
        if (ok) {
          for (const pe of j.polyEnds) {
            const sp = simped[pe.poly];
            const adj = pe.end === 0 ? sp.pts[1] : sp.pts[sp.pts.length - 2];
            if (adj && crossesSimped(pt, adj, j.polyEnds)) { ok = false; break; }
          }
        }
        if (ok) {
          const myPairs = pairsOfJ(j);
          for (const c3 of claimed) {
            if (Math.hypot(c3.pt.x - pt.x, c3.pt.y - pt.y) > 0.3) continue;
            let shares = false;
            for (const kk of myPairs) if (c3.pairs.has(kk)) { shares = true; break; }
            if (!shares) { ok = false; break; }
          }
          if (ok) {
            claimed.push({ pt, pairs: myPairs });
          }
        }
        if (ok) np = pt;
      }
    }
    if (np) { nodeMoves++; applyNode(j, np, true); }
    else failed.push(j);
  }
  // failed junctions: pair-sharing gathering within one probe, traced mean
  let nodeKept = 0;
  {
    const parent = failed.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const pairsOf = (j: Junction): Set<string> => new Set(j.polyEnds.map((pe) => `${simped[pe.poly].pair[0]}|${simped[pe.poly].pair[1]}`));
    for (let i = 0; i < failed.length; i++) {
      for (let k2 = i + 1; k2 < failed.length; k2++) {
        if (Math.hypot(failed[i].p.x - failed[k2].p.x, failed[i].p.y - failed[k2].p.y) > probe) continue;
        const pa = pairsOf(failed[i]);
        let shares = false;
        for (const kk of pairsOf(failed[k2])) if (pa.has(kk)) { shares = true; break; }
        if (shares) parent[find(i)] = find(k2);
      }
    }
    const groups3 = new Map<number, Junction[]>();
    for (let i = 0; i < failed.length; i++) {
      const r = find(i);
      const arr = groups3.get(r) ?? [];
      arr.push(failed[i]);
      groups3.set(r, arr);
    }
    for (const arr of groups3.values()) {
      nodeKept++;
      if (arr.length < 2) continue;
      const mx2 = arr.reduce((s2, j) => s2 + j.p.x, 0) / arr.length;
      const my2 = arr.reduce((s2, j) => s2 + j.p.y, 0) / arr.length;
      const mean = { x: mx2, y: my2 };
      let ok = true;
      for (const j of arr) {
        for (const pe of j.polyEnds) {
          const sp = simped[pe.poly];
          const adj = pe.end === 0 ? sp.pts[1] : sp.pts[sp.pts.length - 2];
          if (adj && crossesSimped(mean, adj, arr.flatMap((j2) => j2.polyEnds))) { ok = false; break; }
        }
        if (!ok) break;
      }
      if (ok) for (const j of arr) applyNode(j, mean, false);
    }
  }
  if (nodeMoves || nodeKept) report.push(`узлы: ${nodeMoves} построено в точных встречах, ${nodeKept} несходящихся — оставлены измеренными`);
  emitStage("nodes");

  // ── 5c. TERMINAL CONSTRUCTION — a line's boundary end on the contour
  //        belongs at the LINE ∩ RING point ──
  let termMoves = 0;
  const termRefused: number[] = [];
  {
    // one pass, deterministic order: nearest targets land first so a
    // neighbour's not-yet-moved ragged end cannot block an exact terminal
    interface TermCand { pi: number; end: 0 | 1; pt: FootprintPoint; seg: number; t: number; dist: number }
    const cands: TermCand[] = [];
    simped.forEach((sp, pi) => {
      if (sp.li === undefined) return;
      const l = lineGeom[sp.li];
      const vp = vpolys[pi];
      for (const end of [0, 1] as const) {
        if (!vp.endsOnRing[end]) continue;
        const cur = end === 0 ? sp.pts[0] : sp.pts[sp.pts.length - 1];
        let best: { pt: FootprintPoint; seg: number; t: number; dist: number } | null = null;
        for (let j = 0; j < ringSegs.length; j++) {
          const rs = ringSegs[j];
          const ex = rs.b.x - rs.a.x;
          const ey = rs.b.y - rs.a.y;
          const den = l.d.x * ey - l.d.y * ex;
          if (Math.abs(den) < 1e-12) continue;
          const tt = ((rs.a.x - l.a.x) * ey - (rs.a.y - l.a.y) * ex) / den;
          const u = ((rs.a.x - l.a.x) * l.d.y - (rs.a.y - l.a.y) * l.d.x) / -den;
          if (u < -1e-9 || u > 1 + 1e-9) continue;
          if (tt < -l.E || tt > l.L + l.E) continue;
          const pt = { x: l.a.x + l.d.x * tt, y: l.a.y + l.d.y * tt };
          const dist = Math.hypot(pt.x - cur.x, pt.y - cur.y);
          if (!best || dist < best.dist) best = { pt, seg: j, t: Math.max(0, Math.min(1, u)), dist };
        }
        for (let j = 0; j < ring.length; j++) {
          const v = ring[j];
          const perpV = Math.abs((v.x - l.a.x) * l.n.x + (v.y - l.a.y) * l.n.y);
          if (perpV > l.corridor) continue;
          const tV = (v.x - l.a.x) * l.d.x + (v.y - l.a.y) * l.d.y;
          if (tV < -l.E || tV > l.L + l.E) continue;
          const dist = Math.hypot(v.x - cur.x, v.y - cur.y);
          if (!best || dist < best.dist) best = { pt: { x: v.x, y: v.y }, seg: j, t: 0, dist };
        }
        // Отказ судится РАЗЛОЖЕНИЕМ, не евклидовым расстоянием: сдвиг
        // ВДОЛЬ несущей — законное продление линии (она аналитическая),
        // и мерить его пробником — душить вальму в 0.6 ft от своего угла
        // (12629: отказ 6.6 при пробнике 6.0 → хвост трассы → излом G1
        // 36.6°). Пробник — на перпендикуляр; продление — не дальше
        // собственной длины линии (граница не продлевается больше себя).
        const okTerm = ((): boolean => {
          if (!best) return false;
          const dx3 = best.pt.x - cur.x;
          const dy3 = best.pt.y - cur.y;
          const perp3 = Math.abs(dx3 * l.n.x + dy3 * l.n.y);
          const along3 = Math.abs(dx3 * l.d.x + dy3 * l.d.y);
          return perp3 <= probe && along3 <= l.L;
        })();
        if (!okTerm) {
          if (process.env.DBG_TERM) console.log(`[term] ОТКАЗ poly ${pi} li=${sp.li} pair=[${sp.pair}] конец (${cur.x.toFixed(1)},${cur.y.toFixed(1)}) цель ${best ? `(${best.pt.x.toFixed(1)},${best.pt.y.toFixed(1)}) dist ${best.dist.toFixed(1)}` : "нет"}`);
          termRefused.push(best ? best.dist : -1);
          continue;
        }
        if (process.env.DBG_TERM) console.log(`[term] OK poly ${pi} li=${sp.li} pair=[${sp.pair}] конец (${cur.x.toFixed(1)},${cur.y.toFixed(1)}) → (${best!.pt.x.toFixed(1)},${best!.pt.y.toFixed(1)}) dist ${best!.dist.toFixed(1)}`);
        cands.push({ pi, end, ...best! });
      }
    });
    cands.sort((a, b) => a.dist - b.dist);
    for (const c3 of cands) {
      const sp = simped[c3.pi];
      const adj = c3.end === 0 ? sp.pts[1] : sp.pts[sp.pts.length - 2];
      if (adj && crossesSimped(c3.pt, adj, [{ poly: c3.pi, end: c3.end }])) {
        if (process.env.DBG_TERM) console.log(`[term] X-ОТКАЗ poly ${c3.pi} цель (${c3.pt.x.toFixed(1)},${c3.pt.y.toFixed(1)}) блок: ${lastCrossRef}`);
        termRefused.push(0);
        continue;
      }
      const moved = { ...c3.pt, c: true } as FootprintPoint & { c?: boolean };
      if (c3.end === 0) sp.pts[0] = moved;
      else sp.pts[sp.pts.length - 1] = moved;
      vpolys[c3.pi].endsOnRing[c3.end] = { seg: c3.seg, t: c3.t };
      termMoves++;
    }
  }
  if (termMoves) report.push(`терминалы: ${termMoves} построено в точках линия∩кольцо`);
  emitStage("terminals");
  if (termRefused.length) report.push(`терминалы-отказы: ${termRefused.map((d2) => (d2 < 0 ? "нет цели" : d2.toFixed(1))).join(", ")}`);
  if (refuse.reach + refuse.perp + refuse.cross > 0) report.push(`отказы спрямления: reach ${refuse.reach} · perp ${refuse.perp} · crossing ${refuse.cross}`);

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

  // ── 5d. LINE CANONICALISATION — every crossing guard is blind to
  //        COLLINEAR overlap (parallel denominators), so two runs of one
  //        boundary straightened onto the same support could overlap along it
  //        silently and fuse faces in the walk. Each line's edges re-emit as
  //        one monotone chain of its t-breakpoints — overlap-free by
  //        construction. ──
  {
    const byLine = new Map<number, number[]>();
    edges.forEach((e, ei) => {
      if (e.prov === "measured-line" && e.lineIndex !== undefined) {
        const arr = byLine.get(e.lineIndex) ?? [];
        arr.push(ei);
        byLine.set(e.lineIndex, arr);
      }
    });
    const drop = new Set<number>();
    const added: FinalEdge[] = [];
    for (const [li, eis] of byLine) {
      if (eis.length < 2) continue;
      const l = lineGeom[li];
      const tOf = (n: number) => (nodes[n].x - l.a.x) * l.d.x + (nodes[n].y - l.a.y) * l.d.y;
      // node ids that sit ON this line (endpoints of its edges)
      const lineNodes = new Map<number, number>();
      for (const ei of eis) for (const n of [edges[ei].u, edges[ei].v]) lineNodes.set(n, tOf(n));
      // Замер 12621 (механизм 2): пере-эмит ПО КАЖДОМУ ребру размножал
      // общие пролёты перекрывающихся пробегов в 2–4 копии — обход строил
      // нулевые грани и щели. Закон: объединение t-интервалов пробегов,
      // один эмит на пролёт; разрывы покрытия не заполняются — граница
      // не изобретается.
      const ivs = eis
        .map((ei) => {
          const tu = tOf(edges[ei].u);
          const tv = tOf(edges[ei].v);
          return [Math.min(tu, tv), Math.max(tu, tv)] as [number, number];
        })
        .sort((x, y) => x[0] - y[0]);
      const covered: Array<[number, number]> = [];
      for (const iv of ivs) {
        const last = covered[covered.length - 1];
        if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1]);
        else covered.push([iv[0], iv[1]]);
      }
      for (const ei of eis) drop.add(ei);
      const chain = [...lineNodes.entries()].sort((x, y) => x[1] - y[1]);
      for (let k2 = 0; k2 + 1 < chain.length; k2++) {
        const [n1, t1] = chain[k2];
        const [n2, t2] = chain[k2 + 1];
        if (n1 === n2) continue;
        const mid = (t1 + t2) / 2;
        if (!covered.some((iv) => mid >= iv[0] - 1e-6 && mid <= iv[1] + 1e-6)) continue;
        added.push({ u: n1, v: n2, prov: "measured-line", lineIndex: li });
      }
    }
    edges.push(...added);
    if (drop.size) {
      const kept = edges.filter((_, ei) => !drop.has(ei));
      edges.length = 0;
      edges.push(...kept);
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

  // ── 6a'. СВАРКА БЛИЗНЕЦОВ И ДЕДУП РЁБЕР (приказ 2026-08-30, механизм 2) ──
  // Замер 12621: пары узлов в 0.001–0.33 ft друг от друга (суб-пиксельные
  // копии одного угла от разных цепей) и пары узлов, повторённые рёбрами.
  // Обход на этом строил нулевые грани и щели — Euler −8, граница cl0|cl2
  // не делила ничего (мега-ячейка 1283 sf). Порог сварки ВЫВЕДЕН: шаг
  // решётки — ниже пикселя решётка две точки границы не различает.
  const weldAndDedupe = (label: string): void => {
    const parent = nodes.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const used = new Set<number>();
    for (const e of edges) { used.add(e.u); used.add(e.v); }
    const un = [...used];
    let weldsN = 0;
    for (let i = 0; i < un.length; i++) {
      for (let j = i + 1; j < un.length; j++) {
        const a = nodes[un[i]];
        const b = nodes[un[j]];
        if (Math.hypot(a.x - b.x, a.y - b.y) <= stepFt && find(un[i]) !== find(un[j])) {
          parent[find(un[j])] = find(un[i]);
          weldsN++;
        }
      }
    }
    let dropsN = 0;
    if (weldsN) for (const e of edges) { e.u = find(e.u); e.v = find(e.v); }
    const seenE = new Map<string, number>();
    const keep: FinalEdge[] = [];
    for (const e of edges) {
      if (e.u === e.v) { dropsN++; continue; }
      const k = e.u < e.v ? `${e.u}|${e.v}` : `${e.v}|${e.u}`;
      const prev = seenE.get(k);
      if (prev === undefined) { seenE.set(k, keep.length); keep.push(e); }
      else {
        dropsN++;
        // измеренная линия главнее трассы в дубле
        if (keep[prev].prov !== "measured-line" && e.prov === "measured-line") keep[prev] = e;
      }
    }
    edges.length = 0;
    edges.push(...keep);
    if (weldsN || dropsN) report.push(`сварка графа${label}: ${weldsN} узлов-близнецов слито (порог — шаг решётки ${stepFt.toFixed(2)} ft), ${dropsN} рёбер-дублей/петель убрано`);
  };
  weldAndDedupe("");

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
  // ── 6b'. УЗЛЫ, ОСТАВЛЕННЫЕ ТРАССОЙ (приказ 2026-08-30) ──
  // Узел — точка согласия кольца и трассы. Операция атомарна и живёт на
  // ГРАФЕ (полилинийная стадия рвала vpolys/simped: R02, tiling 34.7%):
  // (1) конец цепи несущей линии, пришитый к кольцу не в точке
  //     support ∩ контур, переносится в неё: контурное ребро расщепляется
  //     в точке пересечения, конец цепи перешивается атомарно; старый
  //     узел остаётся рядовой точкой кольца. Гейт — разложение: сдвиг
  //     вдоль несущей ≤ её длины (продление линии законно), перпендикуляр
  //     ≤ пробника; страж — запрет пересечений.
  // (2) узел строго между двумя рёбрами ОДНОЙ несущей (два пробега одной
  //     пары — одна аналитическая линия, узел фиктивен) проецируется на
  //     несущую: излом умирает (12629: 36.6° в середине вальмы A2|A7).
  {
    const segCrossB = (a: FootprintPoint, b: FootprintPoint, skipNodes: Set<number>): boolean => {
      for (const e of edges) {
        if (skipNodes.has(e.u) && skipNodes.has(e.v)) continue;
        const p1 = nodes[e.u];
        const p2 = nodes[e.v];
        const d1 = { x: b.x - a.x, y: b.y - a.y };
        const d2 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const den = d1.x * d2.y - d1.y * d2.x;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((p1.x - a.x) * d2.y - (p1.y - a.y) * d2.x) / den;
        const u = ((p1.x - a.x) * d1.y - (p1.y - a.y) * d1.x) / den;
        const tol = 1e-7;
        if (t > tol && t < 1 - tol && u > tol && u < 1 - tol) return true;
      }
      return false;
    };
    let termMoved = 0;
    let midProjected = 0;
    const degB = new Map<number, FinalEdge[]>();
    const rebuildDeg = (): void => {
      degB.clear();
      for (const e of edges) {
        (degB.get(e.u) ?? degB.set(e.u, []).get(e.u)!).push(e);
        (degB.get(e.v) ?? degB.set(e.v, []).get(e.v)!).push(e);
      }
    };
    rebuildDeg();
    // (1) атомарные терминалы: экстремальные узлы каждой несущей на кольце
    const byLineB = new Map<number, FinalEdge[]>();
    for (const e of edges) if (e.prov === "measured-line" && e.lineIndex !== undefined) {
      (byLineB.get(e.lineIndex) ?? byLineB.set(e.lineIndex, []).get(e.lineIndex)!).push(e);
    }
    for (const [li, les] of byLineB) {
      const l = lineGeom[li];
      const tOfN = (n: number): number => (nodes[n].x - l.a.x) * l.d.x + (nodes[n].y - l.a.y) * l.d.y;
      const nodeSet = new Set<number>();
      for (const e of les) { nodeSet.add(e.u); nodeSet.add(e.v); }
      const ext = [...nodeSet].sort((x, y) => tOfN(x) - tOfN(y));
      for (const n0 of [ext[0], ext[ext.length - 1]]) {
        const inc = degB.get(n0) ?? [];
        if (inc.length < 2) continue; // висячий — судьба решится в 6c
        // конец, стоящий НА своей несущей, уже согласован; чинится только
        // конец, ушедший с неё (перпендикуляр больше шага решётки)
        const relN = { x: nodes[n0].x - l.a.x, y: nodes[n0].y - l.a.y };
        const perpN = Math.abs(relN.x * l.n.x + relN.y * l.n.y);
        if (perpN <= stepFt) continue;
        // ближайшее пересечение несущей с ЧУЖИМИ рёбрами графа (кольцо,
        // трасса стены, чужая цепь) — узел = точка согласия двух свидетелей
        let bestQ: { pt: FootprintPoint; ei: number; d: number; moveNode?: boolean } | null = null;
        for (let ei = 0; ei < edges.length; ei++) {
          const e = edges[ei];
          if (e.prov === "measured-line" && e.lineIndex === li) continue;
          const p1 = nodes[e.u];
          const p2 = nodes[e.v];
          const ex = p2.x - p1.x;
          const ey = p2.y - p1.y;
          const den = l.d.x * ey - l.d.y * ex;
          if (Math.abs(den) < 1e-9) continue;
          const tt = ((p1.x - l.a.x) * ey - (p1.y - l.a.y) * ex) / den;
          const u2 = ((p1.x - l.a.x) * l.d.y - (p1.y - l.a.y) * l.d.x) / den;
          const L2 = Math.hypot(ex, ey);
          const incident = e.u === n0 || e.v === n0;
          // у чужого узла новый узел не рождается; но пересечение на
          // ребре, ИНЦИДЕНТНОМ n0, — это показание «узел должен стоять
          // здесь»: не расщепление, а перенос самого n0 (все цепи следуют)
          const nearFar = e.u === n0 ? (1 - u2) * L2 : e.v === n0 ? u2 * L2 : Math.min(u2 * L2, (1 - u2) * L2);
          if (!incident && (u2 * L2 <= stepFt || (1 - u2) * L2 <= stepFt)) continue;
          if (incident && nearFar <= stepFt) continue; // за дальним узлом хозяина
          const q = { x: l.a.x + l.d.x * tt, y: l.a.y + l.d.y * tt };
          const dd = Math.hypot(q.x - nodes[n0].x, q.y - nodes[n0].y);
          // чужая цепь (стена/трасса) свидетельствует только У УЗЛА —
          // пересечение дальше пробника от него не её показание; кольцу
          // хватает разложения ниже (продление вдоль несущей законно)
          if (e.prov !== "contour" && dd > probe) continue;
          if (incident && dd > probe) continue;
          if (!bestQ || dd < bestQ.d) bestQ = { pt: q, ei, d: dd, moveNode: incident };
        }
        const dbgA = process.env.DBG_ANODE ? ((): boolean => { const [ax, ay] = process.env.DBG_ANODE!.split(",").map(Number); return Math.hypot(nodes[n0].x - ax, nodes[n0].y - ay) <= 3; })() : false;
        if (!bestQ || bestQ.d < stepFt) { if (dbgA) console.log(`[anode] li=${li} n0 (${nodes[n0].x.toFixed(1)},${nodes[n0].y.toFixed(1)}): ${bestQ ? `уже на месте d=${bestQ.d.toFixed(2)}` : "пересечения нет"}`); continue; }
        // гейт разложением от старого узла
        const dxq = bestQ.pt.x - nodes[n0].x;
        const dyq = bestQ.pt.y - nodes[n0].y;
        const perpQ = Math.abs(dxq * l.n.x + dyq * l.n.y);
        const alongQ = Math.abs(dxq * l.d.x + dyq * l.d.y);
        if (dbgA) console.log(`[anode] li=${li} n0 (${nodes[n0].x.toFixed(1)},${nodes[n0].y.toFixed(1)}) → q (${bestQ.pt.x.toFixed(1)},${bestQ.pt.y.toFixed(1)}) d=${bestQ.d.toFixed(2)} perp=${perpQ.toFixed(2)} along=${alongQ.toFixed(2)} L=${l.L.toFixed(1)}`);
        if (perpQ > probe || alongQ > l.L) continue;
        // конец цепи: ребро несущей у n0, его другой узел — опора шва
        const lineEdge = inc.find((e) => e.prov === "measured-line" && e.lineIndex === li);
        if (!lineEdge) continue;
        const prevN = lineEdge.u === n0 ? lineEdge.v : lineEdge.u;
        // конец СТЕНЫ живёт трассой: при перепаде поперёк последнего
        // сегмента >= переписи перенос дальше ширины размытия клифа
        // (4·step) — фикция «пересечения плоскостей» (юг vzof-synth уезжал
        // на 2.8 ft к сланту); сдвиг в пределах размытия — уточнение
        // (12621: 1.23 ft чинил кольцо A7)
        if ((input.wallDropOf?.(nodes[prevN], nodes[n0]) ?? 0) >= 1.8 && bestQ.d > 4 * stepFt) continue;
        if (segCrossB(nodes[prevN], bestQ.pt, new Set([n0, prevN, edges[bestQ.ei].u, edges[bestQ.ei].v]))) { if (dbgA) console.log(`[anode]   X-отказ пересечением`); continue; }
        if (bestQ.moveNode) {
          // перенос узла в точку согласия: все инцидентные цепи следуют;
          // страж — ни один сдвинутый сегмент не создаёт пересечения
          let okM = true;
          for (const e of inc) {
            const far = e.u === n0 ? e.v : e.u;
            if (segCrossB(nodes[far], bestQ.pt, new Set([n0, far]))) { okM = false; break; }
          }
          if (!okM) continue;
          nodes[n0] = { x: bestQ.pt.x, y: bestQ.pt.y };
          termMoved++;
          continue;
        }
        // атомарно: расщепить контурное ребро, перешить конец цепи
        const host = edges[bestQ.ei];
        const newN = nodes.length;
        nodes.push({ x: bestQ.pt.x, y: bestQ.pt.y });
        const tail = { ...host, u: newN, v: host.v };
        host.v = newN;
        edges.push(tail);
        if (lineEdge.u === n0) lineEdge.u = newN;
        else lineEdge.v = newN;
        termMoved++;
        rebuildDeg();
      }
    }
    // (2) фиктивные срединные узлы: строго два ребра одной несущей
    for (const [n0, inc] of degB) {
      if (inc.length !== 2) continue;
      const [e1, e2] = inc;
      if (e1.prov !== "measured-line" || e2.prov !== "measured-line") continue;
      if (e1.lineIndex === undefined || e1.lineIndex !== e2.lineIndex) continue;
      const l = lineGeom[e1.lineIndex];
      const rel = { x: nodes[n0].x - l.a.x, y: nodes[n0].y - l.a.y };
      const perp = rel.x * l.n.x + rel.y * l.n.y;
      if (Math.abs(perp) < 1e-6 || Math.abs(perp) > probe) continue;
      const q = { x: nodes[n0].x - perp * l.n.x, y: nodes[n0].y - perp * l.n.y };
      const others = [e1.u === n0 ? e1.v : e1.u, e2.u === n0 ? e2.v : e2.u];
      if (segCrossB(nodes[others[0]], q, new Set([n0, others[0]])) || segCrossB(q, nodes[others[1]], new Set([n0, others[1]]))) continue;
      nodes[n0] = { x: q.x, y: q.y };
      midProjected++;
    }
    if (termMoved || midProjected) report.push(`узлы трассы: ${termMoved} концов несущих переведено в support∩контур (атомарно, с расщеплением кольца), ${midProjected} фиктивных срединных узлов спроецировано на несущую`);
  }

  // ── 6c. СШИВКА ВИСЯЧИХ ХВОСТОВ (приказ 2026-08-30, механизм 2) ──
  // Висячесть — свойство ГРАФА, не полилинии: тройник соединяет цепи трёх
  // попарно разных пар, и хвост, «пришитый» к точке встречи, всё равно
  // висит, если дерево целиком не замыкается в разбиение. Прежде пруна
  // молча съедала такой хвост вместе с границей (23 ребра на 12621 —
  // среди них вся граница cl0|cl2, отсюда мега-ячейка 1283 sf). Закон:
  // конец степени 1 шьётся в ближайший узел графа в пределах пробника
  // (страж — запрет пересечений и кольцо); недошиваемое честно уходит
  // в пруну с отчётом.
  {
    const segCross = (a: FootprintPoint, b: FootprintPoint, skipNodes: Set<number>): boolean => {
      for (const e of edges) {
        if (skipNodes.has(e.u) && skipNodes.has(e.v)) continue;
        const p1 = nodes[e.u];
        const p2 = nodes[e.v];
        const d1 = { x: b.x - a.x, y: b.y - a.y };
        const d2 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const den = d1.x * d2.y - d1.y * d2.x;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((p1.x - a.x) * d2.y - (p1.y - a.y) * d2.x) / den;
        const u = ((p1.x - a.x) * d1.y - (p1.y - a.y) * d1.x) / den;
        const tol = 1e-7;
        if (t > tol && t < 1 - tol && u > tol && u < 1 - tol) return true;
      }
      return false;
    };
    let tailWelds = 0;
    let tailSplits = 0;
    for (let pass = 0; pass < 50; pass++) {
      const deg = new Map<number, number>();
      for (const e of edges) {
        deg.set(e.u, (deg.get(e.u) ?? 0) + 1);
        deg.set(e.v, (deg.get(e.v) ?? 0) + 1);
      }
      const tips = [...deg.entries()].filter(([, dg]) => dg === 1).map(([n]) => n).sort((x, y) => x - y);
      let progress = false;
      for (const tip of tips) {
        if ((deg.get(tip) ?? 0) !== 1) continue; // мог зашиться в этом же проходе
        const inc = edges.filter((e) => e.u === tip || e.v === tip);
        if (inc.length !== 1) continue;
        const other = inc[0].u === tip ? inc[0].v : inc[0].u;
        interface TailTarget { d: number; n?: number; ei?: number; t?: number; pt?: FootprintPoint }
        const cand: TailTarget[] = [];
        // АНАЛИТИЧЕСКИЙ ТЕРМИНАЛ ПРЕЖДЕ БЛИЗОСТИ: хвост цепи измеренной/
        // виртуальной линии у контура обязан сесть на НЕСУЩАЯ ∩ КОЛЬЦО —
        // линия стоит на пересечении плоскостей, и только в этой точке обе
        // плоскости согласны на кольце (узел трассы в 3.9 ft травил кольцо
        // A7 на 12621: чужой план-эвал 16.75 в грани cl4). В пределах
        // пробника от хвоста; дальше — обычные цели.
        if (inc[0].prov === "measured-line" && inc[0].lineIndex !== undefined) {
          const lg = lineGeom[inc[0].lineIndex];
          for (let ei = 0; ei < edges.length; ei++) {
            const e = edges[ei];
            if (e.prov !== "contour") continue;
            const p1 = nodes[e.u];
            const p2 = nodes[e.v];
            const ex = p2.x - p1.x;
            const ey = p2.y - p1.y;
            const den = lg.d.x * ey - lg.d.y * ex;
            if (Math.abs(den) < 1e-9) continue;
            const tt = ((p1.x - lg.a.x) * ey - (p1.y - lg.a.y) * ex) / den;
            const u2 = ((p1.x - lg.a.x) * lg.d.y - (p1.y - lg.a.y) * lg.d.x) / den;
            if (u2 < 1e-3 || u2 > 1 - 1e-3) continue;
            const q = { x: lg.a.x + lg.d.x * tt, y: lg.a.y + lg.d.y * tt };
            const dd = Math.hypot(q.x - nodes[tip].x, q.y - nodes[tip].y);
            const L1 = Math.hypot(ex, ey);
            if (dd <= probe && u2 * L1 > stepFt && (1 - u2) * L1 > stepFt) cand.push({ d: dd - probe, ei, t: u2, pt: q });
          }
        }
        cand.push(...[...deg.entries()]
          .filter(([n]) => n !== tip && n !== other)
          .map(([n]) => ({ n, d: Math.hypot(nodes[n].x - nodes[tip].x, nodes[n].y - nodes[tip].y) }))
          .filter((c2) => c2.d <= probe));
        // T-стык: проекция хвоста внутрь ребра (кольцо в том числе) —
        // «терминал — в ближайшую точку кольца» (механизм 3)
        for (let ei = 0; ei < edges.length; ei++) {
          const e = edges[ei];
          if (e.u === tip || e.v === tip) continue;
          const a = nodes[e.u];
          const b = nodes[e.v];
          const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
          if (L2 < 1e-12) continue;
          const t2 = ((nodes[tip].x - a.x) * (b.x - a.x) + (nodes[tip].y - a.y) * (b.y - a.y)) / L2;
          // зажим МЕТРИЧЕСКИЙ (шаг решётки), не параметрический: t=0.01 на
          // 25-ft ребре — это 0.25 ft от узла, и новый узел вырождался в
          // близнеца (нулевое ребро 59 на 12621)
          const L1 = Math.sqrt(L2);
          if (t2 * L1 <= stepFt || (1 - t2) * L1 <= stepFt) continue; // концы покрыты узлами
          const q = { x: a.x + (b.x - a.x) * t2, y: a.y + (b.y - a.y) * t2 };
          const dd = Math.hypot(q.x - nodes[tip].x, q.y - nodes[tip].y);
          if (dd <= probe) cand.push({ d: dd, ei, t: t2, pt: q });
        }
        cand.sort((x, y) => x.d - y.d || (x.n ?? 1e9) - (y.n ?? 1e9));
        const dbgT = !!process.env.DBG_TAIL;
        if (dbgT) console.log(`[tail] хвост (${nodes[tip].x.toFixed(1)},${nodes[tip].y.toFixed(1)}) ${inc[0].prov} li=${inc[0].lineIndex ?? "-"}: целей ${cand.length}`);
        for (const c2 of cand) {
          if (c2.n !== undefined) {
            // не создавать дубль ребра other—target
            if (edges.some((e) => (e.u === other && e.v === c2.n) || (e.v === other && e.u === c2.n))) continue;
            if (segCross(nodes[other], nodes[c2.n], new Set([tip, other, c2.n]))) continue;
            for (const e of edges) {
              if (e.u === tip) e.u = c2.n;
              if (e.v === tip) e.v = c2.n;
            }
            deg.set(c2.n, (deg.get(c2.n) ?? 0) + 1);
            deg.set(tip, 0);
            tailWelds++;
          } else {
            // расщепить ребро в точке проекции, хвост — в новый узел
            const host = edges[c2.ei!];
            if (segCross(nodes[other], c2.pt!, new Set([tip, other, host.u, host.v]))) continue;
            const newN = nodes.length;
            nodes.push({ x: c2.pt!.x, y: c2.pt!.y });
            const tail = { ...host, u: newN, v: host.v };
            host.v = newN;
            edges.push(tail);
            for (const e of edges) {
              if (e === tail) continue;
              if (e.u === tip) e.u = newN;
              if (e.v === tip) e.v = newN;
            }
            deg.set(newN, 3);
            deg.set(tip, 0);
            tailSplits++;
          }
          if (dbgT) console.log(`[tail]   → ${c2.n !== undefined ? `узел (${nodes[c2.n].x.toFixed(1)},${nodes[c2.n].y.toFixed(1)})` : `T-стык (${c2.pt!.x.toFixed(1)},${c2.pt!.y.toFixed(1)})`} d=${c2.d.toFixed(2)}`);
          progress = true;
          break;
        }
      }
      if (!progress) break;
    }
    if (tailWelds || tailSplits) report.push(`сшивка хвостов: ${tailWelds} концов сшито в узлы, ${tailSplits} T-стыков в рёбра/кольцо (пробник ${probe} ft)`);
    if (tailWelds || tailSplits) weldAndDedupe(" (после сшивки)");
  }
  const removed = pruneDanglingEdges(edges);
  if (removed.length) report.push(`${removed.length} висячих рёбер границ отсечено`);
  const { faces, halves } = walkPlanarFaces(nodes, edges);
  if (process.env.DBG_HOLE) {
    const [hx, hy] = process.env.DBG_HOLE.split(",").map(Number);
    for (const f of faces) {
      const near = f.ring.some((ni) => Math.hypot(nodes[ni].x - hx, nodes[ni].y - hy) < 4);
      if (!near) continue;
      const pts = f.ring.map((ni) => `(${nodes[ni].x.toFixed(1)},${nodes[ni].y.toFixed(1)})`).join(" ");
      console.log(`[hole] цикл area=${f.area.toFixed(1)}: ${pts.slice(0, 400)}`);
    }
  }
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

  if (process.env.DBG_NEAR) {
    const [nx, ny, nr] = process.env.DBG_NEAR.split(",").map(Number);
    const near = (p: FootprintPoint) => Math.hypot(p.x - nx, p.y - ny) <= nr;
    const deg2 = new Map<number, number>();
    for (const e of edges) { deg2.set(e.u, (deg2.get(e.u) ?? 0) + 1); deg2.set(e.v, (deg2.get(e.v) ?? 0) + 1); }
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      if (!near(nodes[e.u]) && !near(nodes[e.v])) continue;
      console.log(`[near] ребро ${ei} ${e.prov} li=${e.lineIndex ?? "-"} pair=${e.pair ?? "-"} (${nodes[e.u].x.toFixed(1)},${nodes[e.u].y.toFixed(1)})[deg${deg2.get(e.u)}]→(${nodes[e.v].x.toFixed(1)},${nodes[e.v].y.toFixed(1)})[deg${deg2.get(e.v)}]`);
    }
    for (let ri = 0; ri < ring.length; ri++) if (near(ring[ri])) console.log(`[near] ring[${ri}] (${ring[ri].x.toFixed(1)},${ring[ri].y.toFixed(1)})`);
  }
  const usedNodes = new Set<number>();
  const usedEdges = new Set<number>();
  for (const f of cells0) for (const hi of f.halfEdges) {
    usedNodes.add(halves[hi].from);
    usedEdges.add(halves[hi].edge);
  }
  const euler = usedNodes.size - usedEdges.size + cells0.length;
  if (process.env.DBG_RC) {
    console.log(`[rc] nodes ${nodes.length} (used ${usedNodes.size}) · edges ${edges.length} (used ${usedEdges.size}) · faces walk ${faces.length} · cells0 ${cells0.length} · euler ${euler}`);
    // щели: ребро, обе половинки которого в одной грани
    const faceOfHalf = new Map<number, number>();
    faces.forEach((f, fi) => { for (const hi of f.halfEdges) faceOfHalf.set(hi, fi); });
    for (let ei = 0; ei < edges.length; ei++) {
      const f1 = faceOfHalf.get(2 * ei);
      const f2 = faceOfHalf.get(2 * ei + 1);
      if (f1 !== undefined && f1 === f2) {
        const e = edges[ei];
        console.log(`[rc]   ЩЕЛЬ: ребро ${ei} ${e.prov} li=${e.lineIndex ?? "-"} pair=${e.pair ?? "-"} deg(u)=${edges.filter((x) => x.u === e.u || x.v === e.u).length} deg(v)=${edges.filter((x) => x.u === e.v || x.v === e.v).length} (${nodes[e.u].x.toFixed(1)},${nodes[e.u].y.toFixed(1)})→(${nodes[e.v].x.toFixed(1)},${nodes[e.v].y.toFixed(1)}) в грани ${f1} area ${faces[f1!].area.toFixed(0)}`);
      }
    }
    const pairSeen = new Map<string, number>();
    for (const e of edges) {
      const k = e.u < e.v ? `${e.u}|${e.v}` : `${e.v}|${e.u}`;
      pairSeen.set(k, (pairSeen.get(k) ?? 0) + 1);
    }
    for (const [k, n] of pairSeen) if (n > 1) {
      const [u, v] = k.split("|").map(Number);
      console.log(`[rc]   ДУБЛЬ x${n}: узлы ${k} (${nodes[u].x.toFixed(1)},${nodes[u].y.toFixed(1)})→(${nodes[v].x.toFixed(1)},${nodes[v].y.toFixed(1)})`);
    }
    console.log(`[rc]   нулевых граней обхода: ${faces.filter((f) => Math.abs(f.area) <= EPS).length}`);
    const usedN = new Set<number>();
    for (const e of edges) { usedN.add(e.u); usedN.add(e.v); }
    const un = [...usedN];
    for (let i = 0; i < un.length; i++) for (let j = i + 1; j < un.length; j++) {
      const dd = Math.hypot(nodes[un[i]].x - nodes[un[j]].x, nodes[un[i]].y - nodes[un[j]].y);
      if (dd < stepFt) console.log(`[rc]   БЛИЗКИЕ УЗЛЫ ${un[i]}|${un[j]} dist ${dd.toFixed(3)} ft (${nodes[un[i]].x.toFixed(2)},${nodes[un[i]].y.toFixed(2)})`);
    }
    for (const f of cells0) console.log(`[rc]   cell area ${f.area.toFixed(0)}`);
  }
  const total = cells0.reduce((s, f) => s + f.area, 0);
  const tilingPct = contourArea > 0 ? (Math.abs(total - contourArea) / contourArea) * 100 : 0;

  return { cells, euler, tilingPct, straightenedFt, raggedFt, artifactFt, canonSnapped, report };
}

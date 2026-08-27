// WEIGHTED straight skeleton — the Felkel/Obdržálek wavefront generalised to
// one slope per outline edge, in its own module. skeleton.ts is NOT touched:
// it stays the foundation and the fallback, and this engine mirrors its
// architecture (LAV/SLAV, edge + split events, arc welding, per-edge face
// tracing, the scaled-tolerance law) rather than inventing a new one.
//
// Why it exists (2026-08-28): three approaches in a row — plane minimum,
// gable surgery, coplanar merge — hit one mechanism: at jogged parallel
// eaves a PLANE cannot express the grassfire over SEGMENTS. The wavefront
// is the grassfire, so the pent family (trapezoid ends reaching the ridge,
// shed wings) falls out of it natively instead of being patched in.
//
// The generalisation, precisely:
//   - time is HEIGHT h (ft). Edge i's front is its line offset inward by
//     c_i·h where c_i = 1/slope_i is the PLAN SPEED per foot of height. A
//     GABLE edge has slope = ∞ ⇒ c = 0: its front never moves, its facet is
//     the vertical end wall (zero plan area, no facet emitted), and the arcs
//     its endpoints trace lie ON the outline edge — the rakes.
//   - a wavefront vertex between edges L and R moves with the velocity v
//     solving  n_L·v = c_L,  n_R·v = c_R  (2×2; the unweighted bisector is
//     the c_L = c_R = 1 special case).
//   - an edge event: both endpoints of a front edge ride the SAME moving
//     line, so the collapse is found on that line's tangential coordinate —
//     linear in h.
//   - a split event keeps its unweighted form with c_j·h on the right side.
//
// Contract, checks and output format are skeleton.ts's own: facets must be
// simple, CCW, tile the polygon to 1 %, every arc separates two facets;
// anything failing returns null — NEVER a wrong skeleton. The caller falls
// back to the unweighted skeleton and says so in provenance.

export interface WPt {
  x: number;
  y: number;
}

export interface WFacet {
  edgeIndex: number;
  ring: WPt[];
}

export interface WavefrontResult {
  facets: WFacet[];
  ridges: Array<{ a: WPt; b: WPt; leftEdge: number; rightEdge: number }>;
  /** Edges whose slope was ∞ — they emitted no facet; their outline segments
   *  are rakes on the neighbouring facets. */
  gableEdges: number[];
}

interface Vec {
  x: number;
  y: number;
}

const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;

const MAX_OUTLINE_VERTICES = 256;
/** Golden-angle phase — the same deterministic jitter law as skeleton.ts. */
const JITTER_PHASE = 2.399963229728653;

export interface WavefrontOptions {
  degenerateRetry?: boolean;
  /** Diagnostics: called with the reason each time the exact pass refuses. */
  onRefuse?: (reason: string) => void;
  /**
   * Called when the EXACT (unjittered) pass meets two co-normal fronts running
   * at different speeds — a genuine parallel-edge event, not a numerical tie.
   * The retry can hide it by tilting the two walls a fraction of a degree, but
   * what comes out is a long thin sliver where the roof really has a vertical
   * step, and whether it comes out at all is decided by the fourth decimal of
   * the pitch (measured on 12629: fails 32 of 51 pitches across a 0.5/12
   * band). A caller that cares about reproducibility should refuse.
   */
  onParallelContact?: () => void;
}

/**
 * @param outline CCW simple polygon, feet.
 * @param slopes  rise/run per edge i (outline[i] → outline[i+1]).
 *                Number.POSITIVE_INFINITY marks a gable (vertical) edge.
 */
export function weightedSkeleton(outline: WPt[], slopes: number[], opts: WavefrontOptions = {}): WavefrontResult | null {
  let sawParallelContact = false;
  const noteExact = (reason: string) => {
    if (reason.startsWith("co-normal parallel contact")) sawParallelContact = true;
    opts.onRefuse?.(reason);
  };
  const exact = wavefrontExact(outline, slopes, noteExact);
  if (sawParallelContact) opts.onParallelContact?.();
  if (exact || !opts.degenerateRetry) return exact;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const eps = 0.001 * attempt;
    const moved = outline.map((p, i) => ({
      x: p.x + eps * Math.cos(JITTER_PHASE * (i + attempt)),
      y: p.y + eps * Math.sin(JITTER_PHASE * (i + attempt)),
    }));
    const res = wavefrontExact(moved, slopes, opts.onRefuse);
    if (!res) continue;
    const tol = eps * 3;
    const fix = (p: WPt): WPt => {
      for (let i = 0; i < moved.length; i++) {
        if (Math.hypot(p.x - moved[i].x, p.y - moved[i].y) <= tol) return { x: outline[i].x, y: outline[i].y };
      }
      return p;
    };
    return {
      facets: res.facets.map((f) => ({ edgeIndex: f.edgeIndex, ring: f.ring.map(fix) })),
      ridges: res.ridges.map((r) => ({ a: fix(r.a), b: fix(r.b), leftEdge: r.leftEdge, rightEdge: r.rightEdge })),
      gableEdges: res.gableEdges,
    };
  }
  return null;
}

function wavefrontExact(outline: WPt[], slopes: number[], onRefuse?: (reason: string) => void): WavefrontResult | null {
  const refuse = (why: string): null => { onRefuse?.(why); return null; };
  const n = outline.length;
  if (n < 3 || n > MAX_OUTLINE_VERTICES || slopes.length !== n) return refuse("site 2");
  for (const p of outline) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return refuse("site 3");
  for (const s of slopes) if (!(s > 0)) return refuse("0 or negative slope is meaningless here");

  // ---- local frame, scaled tolerances (the skeleton.ts law) ---------------
  let cx = 0, cy = 0;
  for (const p of outline) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  const pts: Vec[] = outline.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  let scale = 1;
  for (const p of pts) scale = Math.max(scale, Math.abs(p.x), Math.abs(p.y));
  const EPS = 1e-9 * scale;
  const WELD = 1e-6 * scale;
  const ORIENT_TOL = 1e-9 * scale * scale;
  const SECTOR_TOL = 1e-7;
  // plan speeds per foot of height; a gable edge stands still
  const speed: number[] = slopes.map((s) => (Number.isFinite(s) ? 1 / s : 0));
  const maxSpeed = Math.max(...speed, 1e-9);
  const EPS_H = EPS / maxSpeed; // height comparisons at matching resolution

  // ---- outline validation --------------------------------------------------
  interface WEdge { p: Vec; q: Vec; d: Vec; nrm: Vec }
  const edges: WEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-4 * scale) return refuse("site 5");
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    edges.push({ p: a, q: b, d, nrm: { x: -d.y, y: d.x } });
  }
  let area2 = 0;
  for (let i = 0; i < n; i++) area2 += cross(pts[i], pts[(i + 1) % n]);
  if (area2 <= ORIENT_TOL) return refuse("site 6");
  const polyArea = area2 / 2;

  const orient = (a: Vec, b: Vec, c: Vec): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const properCross = (a: Vec, b: Vec, c: Vec, d: Vec): boolean => {
    const d1 = orient(a, b, c);
    const d2 = orient(a, b, d);
    const d3 = orient(c, d, a);
    const d4 = orient(c, d, b);
    return (
      ((d1 > ORIENT_TOL && d2 < -ORIENT_TOL) || (d1 < -ORIENT_TOL && d2 > ORIENT_TOL)) &&
      ((d3 > ORIENT_TOL && d4 < -ORIENT_TOL) || (d3 < -ORIENT_TOL && d4 > ORIENT_TOL))
    );
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (cross(edges[i].d, edges[j].d) > -SECTOR_TOL && cross(edges[i].d, edges[j].d) < SECTOR_TOL && dot(edges[i].d, edges[j].d) < 0) return refuse("site 7");
    for (let k = i + 2; k < n; k++) {
      if (i === 0 && k === n - 1) continue;
      if (properCross(edges[i].p, edges[i].q, edges[k].p, edges[k].q)) return refuse("site 8");
    }
  }
  // Two adjacent gable edges pin their shared vertex (v = 0) — legal: the
  // corner of two vertical walls simply never moves, and dies when a moving
  // front collapses onto it. The solver below handles c_L = c_R = 0 exactly.

  // ---- LAV ----------------------------------------------------------------
  interface WVtx {
    id: number;
    p: Vec; //     position at creation
    h0: number; // creation height
    eL: number;
    eR: number;
    vel: Vec; //   plan velocity per foot of height
    reflex: boolean;
    valid: boolean;
    prev: WVtx;
    next: WVtx;
  }
  let nextId = 0;
  const allVerts: WVtx[] = [];

  /** v solving n_L·v = c_L, n_R·v = c_R. Null when the normals are parallel. */
  /** Set by solveVelocity when it refuses, so the caller can name the case. */
  let velReason = "";
  const solveVelocity = (eL: number, eR: number): Vec | null => {
    const nL = edges[eL].nrm;
    const nR = edges[eR].nrm;
    const den = cross(nL, nR);
    if (Math.abs(den) < SECTOR_TOL) {
      if (dot(nL, nR) > 0) {
        // collinear continuation: same front; only equal speeds are coherent
        if (Math.abs(speed[eL] - speed[eR]) > 1e-9) {
          velReason =
            `co-normal parallel contact: edges ${eL} and ${eR} face the same way but run at ` +
            `${speed[eL].toFixed(4)} and ${speed[eR].toFixed(4)} plan-ft per ft of height`;
          return refuse(velReason);
        }
        return { x: nL.x * speed[eL], y: nL.y * speed[eL] };
      }
      return refuse("antiparallel strip — unsupported here, caller falls back");
    }
    // v = (c_L·perp(n_R) − c_R·perp(n_L)) / cross(n_L, n_R), perp(a) = (a.y, −a.x)
    const cL = speed[eL];
    const cR = speed[eR];
    return {
      x: (cL * nR.y - cR * nL.y) / den,
      y: (cL * -nR.x - cR * -nL.x) / den,
    };
  };

  /** Can a wavefront vertex exist between these two edges? A co-normal
   *  parallel pair with different speeds cannot ride a constant plan velocity
   *  — that is the weighted skeleton's genuine "parallel-edge event". Split
   *  candidates that would BIRTH such a vertex are skipped up front: the
   *  front either closes through other events or refuses honestly. */
  const solvable = (eL: number, eR: number): boolean => {
    const nL = edges[eL].nrm;
    const nR = edges[eR].nrm;
    if (Math.abs(cross(nL, nR)) >= SECTOR_TOL) return true;
    if (dot(nL, nR) > 0) return Math.abs(speed[eL] - speed[eR]) <= 1e-9;
    return false; // antiparallel strip — unsupported
  };

  let velFail = false;
  const makeVertex = (p: Vec, h0: number, eL: number, eR: number): WVtx => {
    const turn = cross(edges[eL].d, edges[eR].d);
    const reflex = turn < -SECTOR_TOL;
    const vel = solveVelocity(eL, eR);
    if (!vel) velFail = true;
    const v: WVtx = {
      id: nextId++,
      p,
      h0,
      eL,
      eR,
      vel: vel ?? { x: 0, y: 0 },
      reflex,
      valid: true,
      prev: undefined as unknown as WVtx,
      next: undefined as unknown as WVtx,
    };
    allVerts.push(v);
    return v;
  };

  const initial: WVtx[] = [];
  for (let i = 0; i < n; i++) initial.push(makeVertex(pts[i], 0, (i + n - 1) % n, i));
  if (velFail) return refuse(velReason || "initial: unsolvable wavefront vertex");
  for (let i = 0; i < n; i++) {
    initial[i].prev = initial[(i + n - 1) % n];
    initial[i].next = initial[(i + 1) % n];
  }

  const posAt = (v: WVtx, h: number): Vec => ({ x: v.p.x + (h - v.h0) * v.vel.x, y: v.p.y + (h - v.h0) * v.vel.y });

  // ---- events -------------------------------------------------------------
  interface EdgeEv { kind: 0; h: number; p: Vec; va: WVtx; vb: WVtx }
  interface SplitEv { kind: 1; h: number; p: Vec; v: WVtx; opp: number }
  type WEv = EdgeEv | SplitEv;

  /** Both endpoints ride edge u.eR's moving line; the edge dies when their
   *  tangential coordinates meet — linear in h. */
  const edgeEvent = (u: WVtx, w: WVtx): EdgeEv | null => {
    if (u.eR !== w.eL) return null;
    const e = edges[u.eR];
    const xiU0 = dot(e.d, u.p) - u.h0 * dot(e.d, u.vel);
    const kU = dot(e.d, u.vel);
    const xiW0 = dot(e.d, w.p) - w.h0 * dot(e.d, w.vel);
    const kW = dot(e.d, w.vel);
    const dk = kU - kW;
    if (Math.abs(dk) < 1e-12) return null;
    const h = (xiW0 - xiU0) / dk;
    const hMin = Math.max(u.h0, w.h0);
    if (h < hMin - EPS_H) return null;
    const p = posAt(u, h);
    const pw = posAt(w, h);
    if (Math.hypot(p.x - pw.x, p.y - pw.y) > Math.max(WELD * 8, EPS * 8)) return null;
    return { kind: 0, h, p: { x: (p.x + pw.x) / 2, y: (p.y + pw.y) / 2 }, va: u, vb: w };
  };

  const splitEvents = (v: WVtx): SplitEv[] => {
    if (!v.reflex) return [];
    const out: SplitEv[] = [];
    for (let j = 0; j < n; j++) {
      if (j === v.eL || j === v.eR) continue;
      if (!solvable(v.eL, j) || !solvable(j, v.eR)) continue; // parallel-edge event — do not birth an unsolvable vertex
      const e = edges[j];
      const a = dot(e.nrm, v.vel);
      const cj = speed[j];
      if (a - cj >= -1e-12) continue; // not approaching that front
      const d0 = dot(e.nrm, { x: v.p.x - e.p.x, y: v.p.y - e.p.y });
      const h = (v.h0 * a - d0) / (a - cj);
      if (h < v.h0 + EPS_H) continue;
      out.push({ kind: 1, h, p: posAt(v, h), v, opp: j });
    }
    return out;
  };

  const queue: WEv[] = [];
  const evBefore = (a: WEv, b: WEv): boolean => {
    if (a.h < b.h - EPS_H) return true;
    if (a.h > b.h + EPS_H) return false;
    if (a.kind !== b.kind) return a.kind > b.kind; // splits win ties (skeleton.ts law)
    const ia = a.kind === 0 ? a.va.id : a.v.id;
    const ib = b.kind === 0 ? b.va.id : b.v.id;
    if (ia !== ib) return ia < ib;
    const ja = a.kind === 0 ? a.vb.id : a.opp;
    const jb = b.kind === 0 ? b.vb.id : b.opp;
    return ja < jb;
  };
  const pushEventsFor = (v: WVtx): void => {
    const ep = edgeEvent(v.prev, v);
    if (ep) queue.push(ep);
    const en = edgeEvent(v, v.next);
    if (en) queue.push(en);
    for (const s of splitEvents(v)) queue.push(s);
  };
  for (const v of initial) pushEventsFor(v);
  if (velFail) return refuse(velReason || "queue seed: unsolvable wavefront vertex");

  // ---- arcs ---------------------------------------------------------------
  const arcs: Array<{ a: Vec; b: Vec }> = [];
  const emitArc = (a: Vec, b: Vec): void => {
    if (Math.hypot(b.x - a.x, b.y - a.y) >= WELD) arcs.push({ a, b });
  };
  const closePair = (u: WVtx, w: WVtx): void => {
    emitArc(u.p, w.p);
    u.valid = false;
    w.valid = false;
  };
  const cycleLength = (v: WVtx): number => {
    let len = 1;
    let c = v.next;
    const cap = allVerts.length + 2;
    while (c !== v && len <= cap) {
      len++;
      c = c.next;
    }
    return c === v ? len : -1;
  };
  const locateSegment = (p: Vec, opp: number, h: number): WVtx | null => {
    for (const x of allVerts) {
      if (!x.valid || x.eR !== opp) continue;
      const y = x.next;
      const px = posAt(x, h);
      const py = posAt(y, h);
      const e = edges[opp];
      const xi = dot(e.d, p);
      const xiX = dot(e.d, px);
      const xiY = dot(e.d, py);
      if (xi < Math.min(xiX, xiY) - WELD * 8 || xi > Math.max(xiX, xiY) + WELD * 8) continue;
      return x;
    }
    return null;
  };

  // ---- main loop ----------------------------------------------------------
  let guard = 0;
  while (queue.length > 0) {
    if (++guard > 20000) return refuse("site 18");
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (evBefore(queue[i], queue[best])) best = i;
    const ev = queue[best];
    queue.splice(best, 1);

    if (ev.kind === 0) {
      const { va, vb, p } = ev;
      if (!va.valid || !vb.valid || va.next !== vb) continue;
      if (va.prev === vb.next) {
        const vc = va.prev;
        emitArc(va.p, p);
        emitArc(vb.p, p);
        emitArc(vc.p, p);
        va.valid = false;
        vb.valid = false;
        vc.valid = false;
        continue;
      }
      emitArc(va.p, p);
      emitArc(vb.p, p);
      const vNew = makeVertex(p, ev.h, va.eL, vb.eR);
      if (velFail) return refuse(velReason || "edge event: unsolvable wavefront vertex");
      vNew.prev = va.prev;
      vNew.next = vb.next;
      va.prev.next = vNew;
      vb.next.prev = vNew;
      va.valid = false;
      vb.valid = false;
      if (vNew.next.next === vNew) closePair(vNew, vNew.next);
      else pushEventsFor(vNew);
    } else {
      const { v, p, opp } = ev;
      if (!v.valid) continue;
      const x = locateSegment(p, opp, ev.h);
      if (!x) continue;
      const y = x.next;
      emitArc(v.p, p);
      const v1 = makeVertex(p, ev.h, v.eL, opp);
      const v2 = makeVertex(p, ev.h, opp, v.eR);
      if (velFail) return refuse(velReason || "split event: unsolvable wavefront vertex");
      v1.prev = v.prev;
      v1.next = y;
      v.prev.next = v1;
      y.prev = v1;
      v2.prev = x;
      v2.next = v.next;
      x.next = v2;
      v.next.prev = v2;
      v.valid = false;
      for (const vi of [v1, v2]) {
        if (!vi.valid) continue;
        const len = cycleLength(vi);
        if (len < 0) return refuse("site 21");
        if (len === 2) closePair(vi, vi.next);
        else pushEventsFor(vi);
      }
    }
  }
  for (const v of allVerts) if (v.valid) return refuse("site 22");

  // ---- weld nodes, planar graph -------------------------------------------
  const nodes: Vec[] = pts.map((p) => ({ x: p.x, y: p.y }));
  const nodeOf = (p: Vec): number => {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) < WELD * 8) return i;
    }
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };
  const graphEdges: Array<[number, number]> = [];
  const seenPair = new Set<string>();
  const addGraphEdge = (i: number, j: number): void => {
    if (i === j) return;
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    if (seenPair.has(key)) return;
    seenPair.add(key);
    graphEdges.push([i, j]);
  };

  // A gable edge's endpoints slide along it and its apex lands on it: the
  // outline edge must enter the graph SUBDIVIDED by every welded node that
  // lies on it, or the graph double-covers the segment.
  const onEdgeNodes = (i: number): number[] => {
    const e = edges[i];
    const len = Math.hypot(e.q.x - e.p.x, e.q.y - e.p.y);
    const found: Array<{ t: number; k: number }> = [{ t: 0, k: i }, { t: 1, k: (i + 1) % n }];
    for (let k = 0; k < nodes.length; k++) {
      if (k === i || k === (i + 1) % n) continue;
      const dxp = nodes[k].x - e.p.x;
      const dyp = nodes[k].y - e.p.y;
      const t = (dxp * e.d.x + dyp * e.d.y) / len;
      if (t <= 1e-9 || t >= 1 - 1e-9) continue;
      const off = Math.abs(dxp * e.nrm.x + dyp * e.nrm.y);
      if (off < WELD * 8) found.push({ t, k });
    }
    found.sort((a, b) => a.t - b.t);
    return found.map((f) => f.k);
  };

  // arcs first, so their endpoints exist as nodes before subdividing outline edges
  const arcNodePairs: Array<[number, number]> = [];
  for (const arc of arcs) {
    const i = nodeOf(arc.a);
    const j = nodeOf(arc.b);
    if (i !== j) arcNodePairs.push([i, j]);
  }
  const gableEdges: number[] = [];
  for (let i = 0; i < n; i++) {
    if (speed[i] === 0) {
      gableEdges.push(i);
      const chain = onEdgeNodes(i);
      for (let k = 0; k + 1 < chain.length; k++) addGraphEdge(chain[k], chain[k + 1]);
    } else {
      addGraphEdge(i, (i + 1) % n);
    }
  }
  const arcPairs: Array<[number, number]> = [];
  const onGableLine = (i: number, j: number): boolean => {
    for (const g of gableEdges) {
      const e = edges[g];
      const offI = Math.abs((nodes[i].x - e.p.x) * e.nrm.x + (nodes[i].y - e.p.y) * e.nrm.y);
      const offJ = Math.abs((nodes[j].x - e.p.x) * e.nrm.x + (nodes[j].y - e.p.y) * e.nrm.y);
      if (offI < WELD * 8 && offJ < WELD * 8) return true;
    }
    return false;
  };
  for (const [i, j] of arcNodePairs) {
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    const isOutlineAdj = (Math.abs(i - j) === 1 || Math.abs(i - j) === n - 1) && i < n && j < n;
    if (isOutlineAdj && !onGableLine(i, j)) return refuse("arc collapsed onto a live outline edge");
    if (onGableLine(i, j)) {
      // slide arcs on a gable line coincide with its subdivided outline —
      // already in the graph, not an interior ridge
      addGraphEdge(i, j);
      continue;
    }
    if (!seenPair.has(key)) arcPairs.push([i, j]);
    addGraphEdge(i, j);
  }

  const adj: number[][] = nodes.map(() => []);
  for (const [i, j] of graphEdges) {
    adj[i].push(j);
    adj[j].push(i);
  }
  for (let i = 0; i < nodes.length; i++) {
    const here = nodes[i];
    adj[i].sort(
      (a, b) => Math.atan2(nodes[a].y - here.y, nodes[a].x - here.x) - Math.atan2(nodes[b].y - here.y, nodes[b].x - here.x),
    );
  }

  // ---- trace one facet per NON-GABLE outline edge -------------------------
  const walkCap = 4 * (nodes.length + graphEdges.length) + 8;
  const traceFace = (u0: number, v0: number): number[] | null => {
    const ring: number[] = [];
    let u = u0;
    let v = v0;
    do {
      ring.push(u);
      if (ring.length > walkCap) return refuse("site 24");
      const list = adj[v];
      const k = list.indexOf(u);
      if (k < 0) return refuse("site 25");
      const w = list[(k - 1 + list.length) % list.length];
      u = v;
      v = w;
    } while (!(u === u0 && v === v0));
    return ring;
  };

  const facets: WFacet[] = [];
  const rings: number[][] = [];
  const facetEdgeOf: number[] = [];
  const outPt = (k: number): WPt => (k < n ? { x: outline[k].x, y: outline[k].y } : { x: nodes[k].x + cx, y: nodes[k].y + cy });

  let areaSum = 0;
  for (let i = 0; i < n; i++) {
    if (speed[i] === 0) continue; // gable: no facet, its area belongs to the neighbours
    const ring = traceFace(i, (i + 1) % n);
    if (!ring || ring.length < 3) return refuse("site 26");
    if (new Set(ring).size !== ring.length) return refuse("site 27");
    const m = ring.length;
    for (let a = 0; a < m; a++) {
      for (let b = a + 2; b < m; b++) {
        if (a === 0 && b === m - 1) continue;
        if (properCross(nodes[ring[a]], nodes[ring[(a + 1) % m]], nodes[ring[b]], nodes[ring[(b + 1) % m]])) return refuse("site 28");
      }
    }
    let a2 = 0;
    for (let a = 0; a < m; a++) a2 += cross(nodes[ring[a]], nodes[ring[(a + 1) % m]]);
    if (a2 <= ORIENT_TOL) return refuse("site 29");
    areaSum += a2 / 2;
    rings.push(ring);
    facetEdgeOf.push(i);
    facets.push({ edgeIndex: i, ring: ring.map(outPt) });
  }
  if (Math.abs(areaSum - polyArea) > 0.01 * polyArea) return refuse("site 30");

  // inter-ring crossings (skeleton.ts escape hatch)
  for (let i = 0; i < rings.length; i++) {
    const ri = rings[i];
    for (let j = i + 1; j < rings.length; j++) {
      const rj = rings[j];
      for (let a = 0; a < ri.length; a++) {
        const a0 = ri[a];
        const a1 = ri[(a + 1) % ri.length];
        for (let b = 0; b < rj.length; b++) {
          const b0 = rj[b];
          const b1 = rj[(b + 1) % rj.length];
          if (a0 === b0 || a0 === b1 || a1 === b0 || a1 === b1) continue;
          if (properCross(nodes[a0], nodes[a1], nodes[b0], nodes[b1])) return refuse("site 31");
        }
      }
    }
  }
  // equal-HEIGHT spot-check: at every interior node the heights implied by
  // every incident facet's edge must agree (the weighted version of the
  // equidistance check — slope_i · dist_i is the roof height there)
  const facetsAtNode: number[][] = nodes.map(() => []);
  for (let fi = 0; fi < rings.length; fi++) for (const k of rings[fi]) facetsAtNode[k].push(facetEdgeOf[fi]);
  for (let k = n; k < nodes.length; k++) {
    if (facetsAtNode[k].length < 2) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (const i of facetsAtNode[k]) {
      const e = edges[i];
      const d = dot(e.nrm, { x: nodes[k].x - e.p.x, y: nodes[k].y - e.p.y });
      const hgt = d * slopes[i];
      lo = Math.min(lo, hgt);
      hi = Math.max(hi, hgt);
    }
    if (hi - lo > Math.max(1e-6 * Math.max(Math.abs(lo), Math.abs(hi)), 2 * WELD * Math.max(...slopes.filter(Number.isFinite)))) return refuse("site 32");
  }

  // ---- label arcs ---------------------------------------------------------
  const dirOwner = new Map<string, number>();
  for (let fi = 0; fi < rings.length; fi++) {
    const ring = rings[fi];
    const m = ring.length;
    for (let a = 0; a < m; a++) {
      const key = `${ring[a]}:${ring[(a + 1) % m]}`;
      if (dirOwner.has(key)) return refuse("site 33");
      dirOwner.set(key, facetEdgeOf[fi]);
    }
  }
  const ridges: WavefrontResult["ridges"] = [];
  for (const [i, j] of arcPairs) {
    const left = dirOwner.get(`${i}:${j}`);
    const right = dirOwner.get(`${j}:${i}`);
    if (left === undefined || right === undefined || left === right) return refuse("site 34");
    ridges.push({ a: outPt(i), b: outPt(j), leftEdge: left, rightEdge: right });
  }

  return { facets, ridges, gableEdges };
}

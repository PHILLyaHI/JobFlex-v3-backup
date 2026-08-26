// Roof diagram — STRAIGHT SKELETON (drawing-rules spec §6 step 2). The
// synthesis core: an unweighted straight skeleton of a simple CCW building
// outline, computed with the classic LAV/SLAV wavefront algorithm of Felkel &
// Obdržálek (edge events collapse a wavefront edge, split events let a reflex
// vertex tear the front in two). Every outline edge sweeps exactly one facet;
// the skeleton arcs ARE the ridges/hips/valleys by construction — centered
// ridges, 45° hips from convex corners, valleys from reflex corners,
// watertight and crossing-free.
//
// Inputs are simplified building outlines (4–14 vertices, feet, x east /
// y north). Robustness choices, per the spec: the whole computation runs in a
// local frame centred on the outline centroid; comparisons use 1e-9-relative
// epsilons with a deterministic tie-break (smaller vertex index first) for
// simultaneous events — the rectilinear outlines this feeds on make exact
// event ties the NORMAL case, not the exception. Facets are not tracked
// through event history (fragile under ties); instead the finished arc set is
// welded into a planar graph with the outline and each edge's facet is traced
// as the face on the interior side of that edge.
//
// Contract: the output is validated before it is returned — facet rings must
// be simple and non-degenerate, every arc must separate exactly two facets,
// and the facet plan areas must sum to the polygon area within 1 %. Any check
// failing returns null, NEVER a wrong skeleton (synthesis failing never
// blocks the pipeline — the repaired recon model remains, spec §6 step 5).
//
// Pure and self-contained: zero imports, no I/O, input never mutated, no
// recursion (n ≤ 14 keeps every loop small).

export interface SkelPt {
  x: number;
  y: number;
}

/** One facet, swept by one outline edge. Ring is CCW and NOT closed; ring[0]
 *  and ring[1] are the generating outline edge's endpoints in outline order. */
export interface SkeletonFacet {
  edgeIndex: number;
  ring: SkelPt[];
}

/** facets: one per outline edge. ridges: ALL interior skeleton arcs (ridges,
 *  hips and valleys alike), each labelled with the generating outline edges of
 *  the facet on its left (traverses a→b) and right (traverses b→a). */
export interface SkeletonResult {
  facets: SkeletonFacet[];
  ridges: Array<{ a: SkelPt; b: SkelPt; leftEdge: number; rightEdge: number }>;
}

interface Vec {
  x: number;
  y: number;
}

interface SkelEdge {
  p: Vec; //   start point (centered frame)
  q: Vec; //   end point
  d: Vec; //   unit direction p→q
  nrm: Vec; // unit inward normal (left of d for a CCW outline)
}

/** List-of-Active-Vertices node: one wavefront vertex. */
interface LAVtx {
  id: number;
  p: Vec; //       position at creation (centered frame)
  tc: number; //   creation time = offset distance of p from its own edges
  eL: number; //   original outline edge arriving (prev → this)
  eR: number; //   original outline edge leaving (this → next)
  bis: Vec; //     unit bisector direction
  reflex: boolean;
  strip: boolean; // eL/eR fronts antiparallel (parallel-strip collapse): zero offset speed, bis = centreline direction
  valid: boolean;
  prev: LAVtx;
  next: LAVtx;
}

interface EdgeEv {
  kind: 0;
  t: number;
  p: Vec;
  va: LAVtx;
  vb: LAVtx;
}

interface SplitEv {
  kind: 1;
  t: number;
  p: Vec;
  v: LAVtx;
  opp: number;
}

type SkelEv = EdgeEv | SplitEv;

const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;

export interface SkeletonOptions {
  /**
   * Retry a degenerate outline under a deterministic sub-millimetre
   * perturbation (symbolic perturbation / "simulation of simplicity").
   *
   * OFF by default, and deliberately: the old path must keep seeing exactly
   * the skeletons it has always seen, including the ones it never got.
   *
   * Why it is needed at all — measured on 12629 NE 100th Pl. Regularising the
   * contour to the 0/90/45 family makes every corner EXACTLY square, which
   * makes wavefront events exactly simultaneous, which makes the face walk
   * revisit a node and trip the simplicity guard below. Making the outline
   * perfectly square is precisely what breaks the exact computation. Jittering
   * each vertex by 0.001 ft — 0.012 inch, 50× under the validator's own 0.05 ft
   * coincidence epsilon — succeeded on 12 of 12 trials at three magnitudes.
   * Outline vertices are snapped back to their exact input positions before
   * returning, so the eaves come out on the contour, not beside it.
   */
  degenerateRetry?: boolean;
}

/** Golden-angle phase: spreads the jitter directions evenly over the ring so
 *  no two neighbours move the same way, and does it without an RNG — the same
 *  outline always produces the same skeleton. */
const JITTER_PHASE = 2.399963229728653;

export function straightSkeleton(outline: SkelPt[], opts: SkeletonOptions = {}): SkeletonResult | null {
  const exact = skeletonExact(outline);
  if (exact || !opts.degenerateRetry) return exact;

  for (let attempt = 1; attempt <= 4; attempt++) {
    const eps = 0.001 * attempt;
    const moved = outline.map((p, i) => ({
      x: p.x + eps * Math.cos(JITTER_PHASE * (i + attempt)),
      y: p.y + eps * Math.sin(JITTER_PHASE * (i + attempt)),
    }));
    const res = skeletonExact(moved);
    if (!res) continue;
    // Snap anything that landed on a jittered outline vertex back onto the
    // exact one. The perturbation only ever chose the topology; it must not
    // survive into the geometry.
    const tol = eps * 3;
    const fix = (p: SkelPt): SkelPt => {
      for (let i = 0; i < moved.length; i++) {
        if (Math.hypot(p.x - moved[i].x, p.y - moved[i].y) <= tol) return { x: outline[i].x, y: outline[i].y };
      }
      return p;
    };
    return {
      facets: res.facets.map((f) => ({ edgeIndex: f.edgeIndex, ring: f.ring.map(fix) })),
      ridges: res.ridges.map((r) => ({ a: fix(r.a), b: fix(r.b), leftEdge: r.leftEdge, rightEdge: r.rightEdge })),
    };
  }
  return null;
}

function skeletonExact(outline: SkelPt[]): SkeletonResult | null {
  const n = outline.length;
  if (n < 3 || n > 32) return null;
  for (const p of outline) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  }

  // ---- local frame centred on the centroid -------------------------------
  let cx = 0;
  let cy = 0;
  for (const p of outline) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;
  const pts: Vec[] = outline.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  let scale = 1;
  for (const p of pts) scale = Math.max(scale, Math.abs(p.x), Math.abs(p.y));
  const EPS = 1e-9 * scale; //  length comparisons
  const WELD = 1e-6 * scale; // node coincidence
  const ORIENT_TOL = 1e-9 * scale * scale; // cross-product (area) comparisons
  const SECTOR_TOL = 1e-7; //   cross of unit vectors

  // ---- outline validation: finite CCW simple polygon, no degenerate edges -
  const edges: SkelEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-4 * scale) return null; // degenerate edge — outline not simplified
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    edges.push({ p: a, q: b, d, nrm: { x: -d.y, y: d.x } });
  }
  let area2 = 0;
  for (let i = 0; i < n; i++) area2 += cross(pts[i], pts[(i + 1) % n]);
  if (area2 <= ORIENT_TOL) return null; // not CCW (or degenerate)
  const polyArea = area2 / 2;

  const orient = (a: Vec, b: Vec, c: Vec): number =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
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
    // spike: consecutive edges folding straight back on each other
    const j = (i + 1) % n;
    if (cross(edges[i].d, edges[j].d) > -SECTOR_TOL && cross(edges[i].d, edges[j].d) < SECTOR_TOL && dot(edges[i].d, edges[j].d) < 0) {
      return null;
    }
    for (let k = i + 2; k < n; k++) {
      if (i === 0 && k === n - 1) continue; // adjacent around the wrap
      if (properCross(edges[i].p, edges[i].q, edges[k].p, edges[k].q)) return null;
    }
  }

  // ---- LAV construction ---------------------------------------------------
  let nextId = 0;
  const allVerts: LAVtx[] = [];
  const makeVertex = (p: Vec, tc: number, eL: number, eR: number): LAVtx => {
    const dL = edges[eL].d;
    const dR = edges[eR].d;
    const turn = cross(dL, dR);
    // Parallel-strip vertex (symmetric-U regression): eL and eR are
    // antiparallel, so their two fronts face each other and have already met
    // along the line through p — the wavefront there is a shrinking strip.
    // The vertex has ZERO offset speed along its bisector normal, and its
    // bisector IS the strip's centreline direction (dR = −dL). Such a strip
    // never outraces another front: it closes by direct pairing of the two
    // antiparallel fronts (closePair on a 2-cycle emits the centreline arc)
    // or by a triangle collapse when a cap front is still live.
    const strip = Math.abs(turn) < SECTOR_TOL && dot(dL, dR) < 0;
    const reflex = !strip && turn < -SECTOR_TOL;
    let bis: Vec;
    if (strip) {
      bis = { x: dR.x, y: dR.y };
    } else {
      let bx = -dL.x + dR.x;
      let by = -dL.y + dR.y;
      if (reflex) {
        bx = -bx;
        by = -by;
      }
      const bl = Math.hypot(bx, by);
      if (bl < SECTOR_TOL) {
        // straight vertex between collinear edges — march along the inward normal
        bis = { x: edges[eL].nrm.x, y: edges[eL].nrm.y };
      } else {
        bis = { x: bx / bl, y: by / bl };
      }
    }
    const v: LAVtx = {
      id: nextId++,
      p,
      tc,
      eL,
      eR,
      bis,
      reflex,
      strip,
      valid: true,
      prev: undefined as unknown as LAVtx,
      next: undefined as unknown as LAVtx,
    };
    allVerts.push(v);
    return v;
  };

  const initial: LAVtx[] = [];
  for (let i = 0; i < n; i++) initial.push(makeVertex(pts[i], 0, (i + n - 1) % n, i));
  for (let i = 0; i < n; i++) {
    initial[i].prev = initial[(i + n - 1) % n];
    initial[i].next = initial[(i + 1) % n];
  }

  // ---- event candidates ---------------------------------------------------
  const edgeEvent = (u: LAVtx, w: LAVtx): EdgeEv | null => {
    if (u.eR !== w.eL) return null; // LAV invariant broken — never queue it
    const den = cross(u.bis, w.bis);
    if (Math.abs(den) < 1e-12) return null; // parallel bisectors — no collapse here
    const dp = { x: w.p.x - u.p.x, y: w.p.y - u.p.y };
    const s = cross(dp, w.bis) / den;
    const r = cross(dp, u.bis) / den;
    if (s < -WELD || r < -WELD) return null; // intersection behind a ray
    const p = { x: u.p.x + s * u.bis.x, y: u.p.y + s * u.bis.y };
    const e = edges[u.eR];
    const t = dot(e.nrm, { x: p.x - e.p.x, y: p.y - e.p.y });
    if (t < -WELD) return null;
    return { kind: 0, t, p, va: u, vb: w };
  };

  const splitEvents = (v: LAVtx): SplitEv[] => {
    if (!v.reflex) return [];
    const nL = edges[v.eL].nrm;
    const speed = dot(nL, v.bis); // offset speed along own edges — bounded away from 0 for reflex
    if (speed < SECTOR_TOL) return [];
    const vel = { x: v.bis.x / speed, y: v.bis.y / speed }; // unit-offset velocity
    const out: SplitEv[] = [];
    for (let j = 0; j < n; j++) {
      if (j === v.eL || j === v.eR) continue;
      const e = edges[j];
      const d0 = dot(e.nrm, { x: v.p.x - e.p.x, y: v.p.y - e.p.y });
      const den = 1 - dot(e.nrm, vel);
      if (den < SECTOR_TOL) continue; // moving with (or away from) that front
      const dt = (d0 - v.tc) / den;
      if (dt < EPS) continue;
      const p = { x: v.p.x + dt * vel.x, y: v.p.y + dt * vel.y };
      out.push({ kind: 1, t: v.tc + dt, p, v, opp: j });
    }
    return out;
  };

  // ---- priority queue: linear-scan min with deterministic tie-break -------
  const queue: SkelEv[] = [];
  const evBefore = (a: SkelEv, b: SkelEv): boolean => {
    if (a.t < b.t - EPS) return true;
    if (a.t > b.t + EPS) return false;
    // Ties: SPLIT events first. A strip vertex (antiparallel eL/eR) has zero
    // offset speed, so the edge events computed for it carry a FROZEN time —
    // the offset at which it was born. When such an edge event ties with a
    // legitimate reflex split at the same time and point, processing the edge
    // event first restructures the front and kills the split (its wavefront
    // segment can no longer be located), collapsing the strip onto the wrong
    // point. Splits never suffer the frozen-time artefact, so they win ties.
    if (a.kind !== b.kind) return a.kind > b.kind;
    const ia = a.kind === 0 ? a.va.id : a.v.id;
    const ib = b.kind === 0 ? b.va.id : b.v.id;
    if (ia !== ib) return ia < ib; // then smaller vertex index first
    const ja = a.kind === 0 ? a.vb.id : a.opp;
    const jb = b.kind === 0 ? b.vb.id : b.opp;
    return ja < jb;
  };
  const pushEventsFor = (v: LAVtx): void => {
    const ep = edgeEvent(v.prev, v);
    if (ep) queue.push(ep);
    const en = edgeEvent(v, v.next);
    if (en) queue.push(en);
    for (const s of splitEvents(v)) queue.push(s);
  };
  for (const v of initial) pushEventsFor(v);

  // ---- arc collection -----------------------------------------------------
  const arcs: Array<{ a: Vec; b: Vec }> = [];
  const emitArc = (a: Vec, b: Vec): void => {
    if (Math.hypot(b.x - a.x, b.y - a.y) >= WELD) arcs.push({ a, b });
  };

  const cycleLength = (v: LAVtx): number => {
    let len = 1;
    let c = v.next;
    const cap = allVerts.length + 2;
    while (c !== v && len <= cap) {
      len++;
      c = c.next;
    }
    return c === v ? len : -1;
  };

  /** Two-vertex LAV: the two remaining fronts collapse onto each other and
   *  the arc between the vertices closes the component. For a parallel strip
   *  (u or w carrying the `strip` flag) those fronts are the two antiparallel
   *  ones and the emitted arc is exactly the strip's centreline. */
  const closePair = (u: LAVtx, w: LAVtx): void => {
    emitArc(u.p, w.p);
    u.valid = false;
    w.valid = false;
  };

  /** Find the LAV vertex x whose wavefront segment of original edge `opp`
   *  contains p: x.eR === opp and p lies between the bisector rays of x and
   *  x.next (boundary-inclusive — exact ties are normal on rectilinear input). */
  const locateSegment = (p: Vec, opp: number): LAVtx | null => {
    for (const x of allVerts) {
      if (!x.valid || x.eR !== opp) continue;
      const y = x.next;
      const dx = { x: p.x - x.p.x, y: p.y - x.p.y };
      const lx = Math.hypot(dx.x, dx.y);
      if (lx > WELD && cross(x.bis, dx) / lx > SECTOR_TOL) continue; // p left of x's ray
      const dy = { x: p.x - y.p.x, y: p.y - y.p.y };
      const ly = Math.hypot(dy.x, dy.y);
      if (ly > WELD && cross(y.bis, dy) / ly < -SECTOR_TOL) continue; // p right of y's ray
      return x;
    }
    return null;
  };

  // ---- main loop ----------------------------------------------------------
  let guard = 0;
  while (queue.length > 0) {
    if (++guard > 20000) return null;
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (evBefore(queue[i], queue[best])) best = i;
    const ev = queue[best];
    queue.splice(best, 1);

    if (ev.kind === 0) {
      const { va, vb, p } = ev;
      if (!va.valid || !vb.valid || va.next !== vb) continue; // stale
      if (va.prev === vb.next) {
        // triangle collapse: the whole LAV meets in one point
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
      const vNew = makeVertex(p, ev.t, va.eL, vb.eR);
      vNew.prev = va.prev;
      vNew.next = vb.next;
      va.prev.next = vNew;
      vb.next.prev = vNew;
      va.valid = false;
      vb.valid = false;
      if (vNew.next.next === vNew) {
        closePair(vNew, vNew.next);
      } else {
        pushEventsFor(vNew);
      }
    } else {
      const { v, p, opp } = ev;
      if (!v.valid) continue;
      const x = locateSegment(p, opp);
      if (!x) continue; // that wavefront segment no longer exists
      const y = x.next;
      emitArc(v.p, p);
      const v1 = makeVertex(p, ev.t, v.eL, opp);
      const v2 = makeVertex(p, ev.t, opp, v.eR);
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
        if (len < 0) return null; // corrupted linkage
        if (len === 2) closePair(vi, vi.next);
        else pushEventsFor(vi);
      }
    }
  }
  for (const v of allVerts) if (v.valid) return null; // wavefront never closed

  // ---- weld nodes, build the planar graph ---------------------------------
  const nodes: Vec[] = pts.map((p) => ({ x: p.x, y: p.y })); // outline vertices are canonical anchors
  const nodeOf = (p: Vec): number => {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) < WELD) return i;
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
  for (let i = 0; i < n; i++) addGraphEdge(i, (i + 1) % n);
  const arcPairs: Array<[number, number]> = [];
  for (const arc of arcs) {
    const i = nodeOf(arc.a);
    const j = nodeOf(arc.b);
    if (i === j) continue;
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    const isOutline = (Math.abs(i - j) === 1 || Math.abs(i - j) === n - 1) && i < n && j < n;
    if (isOutline) return null; // an arc collapsed onto the outline — broken skeleton
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
      (a, b) =>
        Math.atan2(nodes[a].y - here.y, nodes[a].x - here.x) -
        Math.atan2(nodes[b].y - here.y, nodes[b].x - here.x),
    );
  }

  // ---- trace one facet per outline edge (interior on the left) ------------
  const walkCap = 4 * (nodes.length + graphEdges.length) + 8;
  const traceFace = (u0: number, v0: number): number[] | null => {
    const ring: number[] = [];
    let u = u0;
    let v = v0;
    do {
      ring.push(u);
      if (ring.length > walkCap) return null;
      const list = adj[v];
      const k = list.indexOf(u);
      if (k < 0) return null;
      const w = list[(k - 1 + list.length) % list.length];
      u = v;
      v = w;
    } while (!(u === u0 && v === v0));
    return ring;
  };

  const facets: SkeletonFacet[] = [];
  const rings: number[][] = [];
  const outPt = (k: number): SkelPt =>
    k < n ? { x: outline[k].x, y: outline[k].y } : { x: nodes[k].x + cx, y: nodes[k].y + cy };

  let areaSum = 0;
  for (let i = 0; i < n; i++) {
    const ring = traceFace(i, (i + 1) % n);
    if (!ring || ring.length < 3) return null;
    // simple: no repeated node …
    if (new Set(ring).size !== ring.length) return null;
    // … and no crossing pair of non-adjacent ring segments
    const m = ring.length;
    for (let a = 0; a < m; a++) {
      for (let b = a + 2; b < m; b++) {
        if (a === 0 && b === m - 1) continue;
        if (
          properCross(nodes[ring[a]], nodes[ring[(a + 1) % m]], nodes[ring[b]], nodes[ring[(b + 1) % m]])
        ) {
          return null;
        }
      }
    }
    let a2 = 0;
    for (let a = 0; a < m; a++) a2 += cross(nodes[ring[a]], nodes[ring[(a + 1) % m]]);
    if (a2 <= ORIENT_TOL) return null; // degenerate or wrongly oriented facet
    areaSum += a2 / 2;
    rings.push(ring);
    facets.push({ edgeIndex: i, ring: ring.map(outPt) });
  }
  if (Math.abs(areaSum - polyArea) > 0.01 * polyArea) return null; // coverage broken

  // ---- escape hatches (review #7) -----------------------------------------
  // Inter-ring crossings: no segment of one facet ring may properly cross a
  // segment of ANOTHER facet's ring. Pairs sharing a welded node are the
  // normal case (shared facet boundaries) and are skipped; anything else is a
  // broken skeleton — never drawn.
  for (let i = 0; i < n; i++) {
    const ri = rings[i];
    for (let j = i + 1; j < n; j++) {
      const rj = rings[j];
      for (let a = 0; a < ri.length; a++) {
        const a0 = ri[a];
        const a1 = ri[(a + 1) % ri.length];
        for (let b = 0; b < rj.length; b++) {
          const b0 = rj[b];
          const b1 = rj[(b + 1) % rj.length];
          if (a0 === b0 || a0 === b1 || a1 === b0 || a1 === b1) continue;
          if (properCross(nodes[a0], nodes[a1], nodes[b0], nodes[b1])) return null;
        }
      }
    }
  }
  // Equidistance spot-check: a straight-skeleton node is by definition
  // equidistant from the generating outline edge's line of EVERY facet
  // incident to it. Checked at every interior welded node, 1e-6 relative,
  // floored at twice the weld tolerance so canonicalising a node's position
  // cannot fail the check by itself.
  const facetsAtNode: number[][] = nodes.map(() => []);
  for (let i = 0; i < n; i++) for (const k of rings[i]) facetsAtNode[k].push(i);
  for (let k = n; k < nodes.length; k++) {
    if (facetsAtNode[k].length < 2) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (const i of facetsAtNode[k]) {
      const e = edges[i];
      const d = dot(e.nrm, { x: nodes[k].x - e.p.x, y: nodes[k].y - e.p.y });
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    if (hi - lo > Math.max(1e-6 * Math.max(Math.abs(lo), Math.abs(hi)), 2 * WELD)) return null;
  }

  // ---- label every arc with its two facets --------------------------------
  const dirOwner = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const ring = rings[i];
    const m = ring.length;
    for (let a = 0; a < m; a++) {
      const key = `${ring[a]}:${ring[(a + 1) % m]}`;
      if (dirOwner.has(key)) return null; // two facets claim the same directed edge
      dirOwner.set(key, i);
    }
  }
  const ridges: SkeletonResult["ridges"] = [];
  for (const [i, j] of arcPairs) {
    const left = dirOwner.get(`${i}:${j}`);
    const right = dirOwner.get(`${j}:${i}`);
    if (left === undefined || right === undefined || left === right) return null;
    ridges.push({ a: outPt(i), b: outPt(j), leftEdge: left, rightEdge: right });
  }

  return { facets, ridges };
}

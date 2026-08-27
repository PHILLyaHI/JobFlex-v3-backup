// Phase 4, path 2 — local surgeries on the skeleton's output.
//
// The decision (2026-08-28): the straight skeleton is the one module that has
// never once been the source of a bug on this branch; rewriting it as a
// weighted wavefront for three field cases is the worst risk-to-coverage
// trade available. Instead the skeleton keeps building what it builds, and
// two LOCAL surgeries correct the topology the DSM measured to be wrong —
// each one exact, each one checked, each one reversible by refusing.
//
// SURGERY 1 — GABLE. A hip end facet whose own drain azimuth fights its DSM
// azimuth by ≥ GABLE_MIN_DEG while an adjacent facet drains the same way is a
// real gable the skeleton drew as a hip (step-1 signature, confirmed against
// the owner's traces). The surgery: extend the ridge to the end eave, split
// the end facet along the extension, absorb each triangle into its side
// facet. The absorbed triangles are EXACTLY coplanar with the sides — the
// extension point M lies on the ridge line, which both side planes contain —
// and the guard demands it to INV_EPS_PLANE rather than trusting the proof.
// The end eave becomes two rakes; the hips vanish; the ridge grows.
//
// SURGERY 2 — COPLANAR MERGE. Adjacent facets of one structure lying on one
// plane (within INV_EPS_PLANE) are one slope drawn twice; their rings union
// by cancelling the shared edges.
//
// One surgery at a time. After each: the structure's plan must still tile its
// outline (< 0.5 %), every ring must stay simple, and the welded Euler
// characteristic must stay at one per structure. A surgery that cannot meet
// the checks is refused with its reason recorded — never bent through.
//
// THE UNRECOGNISED-CASE DETECTOR closes the "open list of cases" by field
// evidence instead of enumeration: after the surgeries, any facet whose
// measured DSM azimuth still disagrees with the drain of the face now
// covering it by more than CLUSTER_AZ_TOL_DEG is logged, carried in
// provenance, and surfaced in the confidence assessment. New cases arrive
// from the field, not from imagination. (First known resident: the pent
// wing — a band the DSM reads as ONE outward slope where the skeleton grew a
// full hip set.)

import type { EvLineType, RoofFace, RoofLine, RoofModel, RoofPoint } from "@/lib/eagleview";
import { DSM_NOISE_FLOOR_FT, type PitchMeasurement } from "@/lib/roofRecon/pitchFromDsm";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import { CLUSTER_AZ_TOL_DEG, GABLE_MIN_DEG } from "@/lib/roofRecon/refineClusters";

/** The validators' own facet-planarity tolerance — the coplanarity guard. */
export const EPS_PLANE_FT = 0.08;
/** Level-vs-sloped, the validators' own figure. */
const LEVEL_SLOPE = 0.02;
/** Weld quantum, ft. */
const Q = 1e-3;

type P3 = { x: number; y: number; z: number };

const azDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

/** Least-squares plane z = ax + by + c through ≥3 points; null if degenerate. */
function fitPlane3(pts: P3[]): { a: number; b: number; c: number } | null {
  let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  const n = pts.length;
  if (n < 3) return null;
  for (const p of pts) { sx += p.x; sy += p.y; sz += p.z; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y; sxz += p.x * p.z; syz += p.y * p.z; }
  const d = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx);
  if (Math.abs(d) < 1e-9) return null;
  return {
    a: (sxz * (syy * n - sy * sy) - sxy * (syz * n - sy * sz) + sx * (syz * sy - syy * sz)) / d,
    b: (sxx * (syz * n - sz * sy) - sxz * (sxy * n - sx * sy) + sx * (sxy * sz - syz * sx)) / d,
    c: (sxx * (syy * sz - sy * syz) - sxy * (sxy * sz - sx * syz) + sxz * (sxy * sy - syy * sx)) / d,
  };
}

const drainAz = (pl: { a: number; b: number }): number => ((Math.atan2(-pl.a, -pl.b) * 180) / Math.PI + 360) % 360;

interface Facet {
  label: string;
  si: number;
  ring: P3[];
  pitch12: number;
  dsmAz: number | null;
  dsmPitch: number | null;
  trusted: boolean;
}

export interface GableRecord {
  facet: string;
  absorbedInto: [string, string];
  /** Which evidence converted it. instant-shape is reserved for the §I fallback. */
  source: "dsm-cluster" | "instant-shape";
}

export interface UnrecognisedFacet {
  facet: string;
  dsmAz: number;
  faceAz: number;
  diffDeg: number;
}

export interface SurgeryStructureReport {
  prefix: string;
  gables: GableRecord[];
  merges: Array<{ faces: string[] }>;
  /** Candidates refused, with the reason — the honest remainder. */
  refused: Array<{ facet: string; reason: string }>;
  /** Facets the surgeries did not explain — the field-driven case list. */
  unrecognised: UnrecognisedFacet[];
  facetsBefore: number;
  facetsAfter: number;
}

export interface SurgeryInput {
  model: RoofModel;
  measurement: PitchMeasurement;
  registeredStructures: Set<number>;
  structureRings: Map<number, FootprintPoint[]>;
}

export interface SurgeryResult {
  model: RoofModel;
  report: SurgeryStructureReport[];
  changed: boolean;
}

const structIdx = (rawId: string): number => {
  const m = /^s(\d+):/.exec(rawId);
  return m ? Number(m[1]) : 0;
};
const qk2 = (x: number, y: number) => `${Math.round(x / Q)}|${Math.round(y / Q)}`;

/** Welded V−E+F over plan rings (one expected per simply-connected structure). */
function eulerOfRings(rings: P3[][]): number {
  const vs = new Set<string>();
  const es = new Set<string>();
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      const ka = qk2(a.x, a.y), kb = qk2(b.x, b.y);
      if (ka === kb) continue;
      vs.add(ka);
      es.add([ka, kb].sort().join("#"));
    }
  }
  return vs.size - es.size + rings.length;
}

function isSimple(r: FootprintPoint[]): boolean {
  for (let i = 0; i < r.length; i++) {
    const a1 = r[i], a2 = r[(i + 1) % r.length];
    for (let j = i + 1; j < r.length; j++) {
      if (j === i || (j + 1) % r.length === i || j === (i + 1) % r.length) continue;
      const b1 = r[j], b2 = r[(j + 1) % r.length];
      const d1x = a2.x - a1.x, d1y = a2.y - a1.y, d2x = b2.x - b1.x, d2y = b2.y - b1.y;
      const den = d1x * d2y - d1y * d2x;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
      const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / den;
      if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) return false;
    }
  }
  return true;
}

export function applyRoofSurgeries(input: SurgeryInput): SurgeryResult {
  const { model, measurement } = input;
  const byLabel = new Map(measurement.facets.map((f) => [f.id, f]));
  const pointsById = new Map(model.points.map((p) => [p.id, p]));
  const linesById = new Map(model.lines.map((l) => [l.id, l]));

  // ── extract facets as ordered 3D rings ──
  const facets: Facet[] = [];
  for (const f of model.faces) {
    const ids: string[] = [];
    for (const lid of f.lineIds) {
      const l = linesById.get(lid);
      if (!l) continue;
      if (ids.length === 0) ids.push(l.aId, l.bId);
      else {
        const last = ids[ids.length - 1];
        if (l.aId === last) ids.push(l.bId);
        else if (l.bId === last) ids.push(l.aId);
        else if (l.aId === ids[0]) ids.unshift(l.bId);
        else if (l.bId === ids[0]) ids.unshift(l.aId);
        else ids.push(l.aId, l.bId);
      }
    }
    if (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
    const ring = ids.map((pid) => pointsById.get(pid)).filter((p): p is RoofPoint => !!p).map((p) => ({ x: p.x, y: p.y, z: p.z }));
    if (ring.length < 3) continue;
    const label = String(f.designator || f.id);
    const m = byLabel.get(label);
    facets.push({
      label,
      si: structIdx(String(f.id)),
      ring,
      pitch12: f.pitch,
      dsmAz: m ? m.azimuthDeg : null,
      dsmPitch: m ? m.pitch12 : null,
      trusted: !!m && m.residualP50Ft <= DSM_NOISE_FLOOR_FT,
    });
  }

  const reports: SurgeryStructureReport[] = [];
  let changed = false;
  const structures = [...new Set(facets.map((f) => f.si))].sort((a, b) => a - b);

  for (const si of structures) {
    const members = () => facets.filter((f) => f.si === si);
    const before = members().length;
    const prefix = String.fromCharCode(65 + si);
    const rep: SurgeryStructureReport = { prefix, gables: [], merges: [], refused: [], unrecognised: [], facetsBefore: before, facetsAfter: before };
    reports.push(rep);
    const contour = input.structureRings.get(si);
    if (!input.registeredStructures.has(si) || !contour || contour.length < 3) continue;
    const outlineArea = Math.abs(areaOf(contour));

    const onOutline = (a: FootprintPoint, b: FootprintPoint): boolean => {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      for (let i = 0; i < contour.length; i++) {
        const p = contour[i], q = contour[(i + 1) % contour.length];
        const dx = q.x - p.x, dy = q.y - p.y;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1e-12) continue;
        const t = ((mid.x - p.x) * dx + (mid.y - p.y) * dy) / l2;
        if (t < -0.01 || t > 1.01) continue;
        if (Math.hypot(mid.x - (p.x + t * dx), mid.y - (p.y + t * dy)) < 0.05) return true;
      }
      return false;
    };
    // adjacency across the segment u–v, chain-tolerant: some edge of `b`
    // must lie along u–v (midpoint within 0.05 ft of the segment)
    const onSeg = (p: FootprintPoint, u: FootprintPoint, v: FootprintPoint): boolean => {
      const dx = v.x - u.x, dy = v.y - u.y;
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-12) return false;
      const t = ((p.x - u.x) * dx + (p.y - u.y) * dy) / l2;
      if (t < -0.01 || t > 1.01) return false;
      return Math.hypot(p.x - (u.x + t * dx), p.y - (u.y + t * dy)) < 0.05;
    };
    const sharesEdge = (a: Facet, b: Facet, e1: P3, e2: P3): boolean => {
      for (let i = 0; i < b.ring.length; i++) {
        const p = b.ring[i], q = b.ring[(i + 1) % b.ring.length];
        const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        if (Math.hypot(q.x - p.x, q.y - p.y) < Q) continue;
        if (onSeg(p, e1, e2) && onSeg(q, e1, e2) && onSeg(mid, e1, e2)) return true;
      }
      return false;
    };
    const checks = (why: string): string | null => {
      const rings = members().map((f) => f.ring);
      const tiled = rings.reduce((s, r) => s + Math.abs(areaOf(r.map((p) => ({ x: p.x, y: p.y })))), 0);
      const pct = (Math.abs(tiled - outlineArea) / outlineArea) * 100;
      if (pct >= 0.5) return `${why}: tiling off by ${pct.toFixed(2)}%`;
      for (const f of members()) if (!isSimple(f.ring)) return `${why}: ring of ${f.label} self-intersects`;
      const e = eulerOfRings(rings);
      if (e !== 1) return `${why}: Euler ${e}`;
      return null;
    };

    // ── SURGERY 1: gable GROUPS, one connected component at a time ──
    //
    // Candidates adjacent to each other must convert TOGETHER: sequential
    // single conversions tore every time because a candidate's rim bordered
    // another candidate, whose measured-wrong plane can cover nothing
    // (12629's north-west knot is five candidates holding hands). The joint
    // form is exact: the skeleton IS the minimum of all its facet planes, so
    // the minimum over the KEPT planes agrees with the old surface everywhere
    // on the group's rim with kept facets — any kept plane lower at the rim
    // would have owned that rim in the skeleton already. Continuity at the
    // rim is therefore a THEOREM, and the guard below asserts it instead of
    // trusting it (the validators' own planarity tolerance).
    const candidates = members()
      .filter((f) => f.dsmAz != null && azDiff(drainAzOf(f), f.dsmAz) >= GABLE_MIN_DEG)
      .filter((f) => members().some((nb) => nb !== f && nb.dsmAz != null && azDiff(nb.dsmAz!, f.dsmAz!) <= CLUSTER_AZ_TOL_DEG));
    const candidateSet = new Set(candidates);
    const touches = (a: Facet, b: Facet): boolean => {
      for (let i = 0; i < a.ring.length; i++) {
        if (sharesEdge(a, b, a.ring[i], a.ring[(i + 1) % a.ring.length])) return true;
      }
      return false;
    };
    const groups: Facet[][] = [];
    {
      const seen = new Set<Facet>();
      for (const c of candidates) {
        if (seen.has(c)) continue;
        const comp: Facet[] = [];
        const stack = [c];
        seen.add(c);
        while (stack.length) {
          const cur = stack.pop()!;
          comp.push(cur);
          for (const other of candidates) {
            if (seen.has(other) || !touches(cur, other)) continue;
            seen.add(other);
            stack.push(other);
          }
        }
        groups.push(comp);
      }
    }

    for (const group of groups) {
      const label = group.map((f) => f.label).join("+");
      const fail = (reason: string) => rep.refused.push({ facet: label, reason });

      // union of the group's plan rings
      const dirEdges = new Map<string, [FootprintPoint, FootprintPoint]>();
      for (const f of group) {
        const plan = f.ring.map((pp) => ({ x: pp.x, y: pp.y }));
        const r = areaOf(plan) >= 0 ? plan : [...plan].reverse();
        for (let i = 0; i < r.length; i++) {
          const a = r[i], b = r[(i + 1) % r.length];
          if (Math.hypot(b.x - a.x, b.y - a.y) <= Q) continue;
          const fw = `${qk2(a.x, a.y)}>${qk2(b.x, b.y)}`;
          const bw = `${qk2(b.x, b.y)}>${qk2(a.x, a.y)}`;
          if (dirEdges.has(bw)) dirEdges.delete(bw);
          else dirEdges.set(fw, [a, b]);
        }
      }
      const edges0 = [...dirEdges.values()];
      if (!edges0.length) { fail("group union cancelled to nothing"); continue; }
      const unionRing: FootprintPoint[] = [edges0[0][0], edges0[0][1]];
      edges0.shift();
      let guard0 = edges0.length * 2 + 4;
      while (edges0.length && guard0-- > 0) {
        const endK = qk2(unionRing[unionRing.length - 1].x, unionRing[unionRing.length - 1].y);
        const i2 = edges0.findIndex(([a]) => qk2(a.x, a.y) === endK);
        if (i2 < 0) break;
        unionRing.push(edges0.splice(i2, 1)[0][1]);
      }
      if (edges0.length) { fail("group region is not simply connected"); continue; }
      if (unionRing.length > 1 && qk2(unionRing[0].x, unionRing[0].y) === qk2(unionRing[unionRing.length - 1].x, unionRing[unionRing.length - 1].y)) unionRing.pop();
      if (unionRing.length < 3) { fail("group region collapsed"); continue; }
      const groupArea = group.reduce((s2, f) => s2 + planAreaOf(f), 0);
      if (Math.abs(Math.abs(areaOf(unionRing)) - groupArea) / Math.max(groupArea, 1) > 0.005) { fail("group union lost area"); continue; }

      // rim neighbours: kept facets sharing boundary with any group member
      const neighbours = members().filter((nb) => !candidateSet.has(nb) && group.some((f) => touches(f, nb)));
      if (neighbours.length < 2) { fail("fewer than two kept neighbours around the group"); continue; }
      const planes = neighbours
        .map((nb) => ({ nb, pl: fitPlane3(nb.ring) }))
        .filter((x): x is { nb: Facet; pl: NonNullable<ReturnType<typeof fitPlane3>> } => !!x.pl);
      if (planes.length < 2) { fail("kept neighbour planes could not be fitted"); continue; }
      const zOfPl = (pl: { a: number; b: number; c: number }, x: number, y: number) => pl.a * x + pl.b * y + pl.c;

      // triangulate the union, split by every pairwise bisector, pick winners
      const ringCCW = areaOf(unionRing) > 0 ? unionRing : [...unionRing].reverse();
      const tris: FootprintPoint[][] = [];
      {
        const cross = (o: FootprintPoint, a: FootprintPoint, b: FootprintPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const inTri = (pp: FootprintPoint, a: FootprintPoint, b: FootprintPoint, c: FootprintPoint) =>
          cross(a, b, pp) >= -1e-9 && cross(b, c, pp) >= -1e-9 && cross(c, a, pp) >= -1e-9;
        const idxs = ringCCW.map((_, i) => i);
        let guard = ringCCW.length * ringCCW.length + 10;
        while (idxs.length > 3 && guard-- > 0) {
          let clipped = false;
          for (let k = 0; k < idxs.length; k++) {
            const i0 = idxs[(k - 1 + idxs.length) % idxs.length];
            const i1 = idxs[k];
            const i2 = idxs[(k + 1) % idxs.length];
            const a = ringCCW[i0], b = ringCCW[i1], c = ringCCW[i2];
            if (cross(a, b, c) <= 1e-9) continue;
            let ear = true;
            for (const j2 of idxs) {
              if (j2 === i0 || j2 === i1 || j2 === i2) continue;
              if (inTri(ringCCW[j2], a, b, c)) { ear = false; break; }
            }
            if (!ear) continue;
            tris.push([a, b, c]);
            idxs.splice(k, 1);
            clipped = true;
            break;
          }
          if (!clipped) break;
        }
        if (idxs.length === 3) tris.push([ringCCW[idxs[0]], ringCCW[idxs[1]], ringCCW[idxs[2]]]);
      }
      {
        const triArea = tris.reduce((s2, t) => s2 + Math.abs(areaOf(t)), 0);
        if (Math.abs(triArea - groupArea) / Math.max(groupArea, 1) > 0.005) { fail("group triangulation failed"); continue; }
      }
      let pieces: FootprintPoint[][] = tris;
      for (let i = 0; i < planes.length; i++) for (let j2 = i + 1; j2 < planes.length; j2++) {
        const p1 = planes[i].pl, p2 = planes[j2].pl;
        const la = p1.a - p2.a, lb = p1.b - p2.b, lc = p1.c - p2.c;
        if (Math.hypot(la, lb) < 1e-7) continue;
        const next: FootprintPoint[][] = [];
        for (const piece of pieces) {
          const side = piece.map((pp) => la * pp.x + lb * pp.y + lc);
          const hasPos = side.some((v) => v > 1e-7);
          const hasNeg = side.some((v) => v < -1e-7);
          if (!hasPos || !hasNeg) { next.push(piece); continue; }
          const pos: FootprintPoint[] = [];
          const neg: FootprintPoint[] = [];
          for (let k = 0; k < piece.length; k++) {
            const a = piece[k], b = piece[(k + 1) % piece.length];
            const sa = side[k], sb = side[(k + 1) % piece.length];
            if (sa >= -1e-7) pos.push(a);
            if (sa <= 1e-7) neg.push(a);
            if ((sa > 1e-7 && sb < -1e-7) || (sa < -1e-7 && sb > 1e-7)) {
              const t = sa / (sa - sb);
              const ip = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
              pos.push(ip);
              neg.push(ip);
            }
          }
          if (pos.length >= 3 && Math.abs(areaOf(pos)) > 1e-6) next.push(pos);
          if (neg.length >= 3 && Math.abs(areaOf(neg)) > 1e-6) next.push(neg);
        }
        pieces = next;
      }
      const perNb = new Map<Facet, FootprintPoint[][]>();
      for (const piece of pieces) {
        const cx = piece.reduce((s2, pp) => s2 + pp.x, 0) / piece.length;
        const cy = piece.reduce((s2, pp) => s2 + pp.y, 0) / piece.length;
        let best: { nb: Facet; z: number } | null = null;
        for (const { nb, pl } of planes) {
          const z = zOfPl(pl, cx, cy);
          if (!best || z < best.z) best = { nb, z };
        }
        const arr = perNb.get(best!.nb) ?? [];
        arr.push(piece);
        perNb.set(best!.nb, arr);
      }

      // THE GUARD (the theorem, asserted): on the group's rim with kept
      // facets, the winner's height equals the old surface height to the
      // validators' planarity tolerance. The group's own eaves are exempt —
      // rising there IS the gable (they become rakes).
      const oldZ = (x: number, y: number): number | null => {
        for (const f of group) {
          for (let i = 0; i < f.ring.length; i++) {
            const a = f.ring[i], b = f.ring[(i + 1) % f.ring.length];
            const dx = b.x - a.x, dy = b.y - a.y;
            const l2 = dx * dx + dy * dy;
            if (l2 < 1e-12) continue;
            const t = ((x - a.x) * dx + (y - a.y) * dy) / l2;
            if (t < -0.01 || t > 1.01) continue;
            if (Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)) < 0.05) return a.z + t * (b.z - a.z);
          }
        }
        return null;
      };
      const onUnionRim = (pp: FootprintPoint): boolean => {
        for (let i = 0; i < unionRing.length; i++) {
          const a = unionRing[i], b = unionRing[(i + 1) % unionRing.length];
          const dx = b.x - a.x, dy = b.y - a.y;
          const l2 = dx * dx + dy * dy;
          if (l2 < 1e-12) continue;
          const t = ((pp.x - a.x) * dx + (pp.y - a.y) * dy) / l2;
          if (t < -0.01 || t > 1.01) continue;
          if (Math.hypot(pp.x - (a.x + t * dx), pp.y - (a.y + t * dy)) < 0.05) return true;
        }
        return false;
      };
      let rimTear: string | null = null;
      outer2: for (const [nb, arr] of perNb) {
        const pl = planes.find((x) => x.nb === nb)!.pl;
        for (const piece of arr) for (const pp of piece) {
          if (!onUnionRim(pp)) continue;
          if (onOutline(pp, pp)) continue; // group eave → rake, allowed to rise
          const zo = oldZ(pp.x, pp.y);
          if (zo == null) continue;
          const zn = zOfPl(pl, pp.x, pp.y);
          if (Math.abs(zn - zo) > EPS_PLANE_FT) {
            rimTear = `winner ${nb.label} misses the rim at (${pp.x.toFixed(1)}, ${pp.y.toFixed(1)}) by ${(zn - zo).toFixed(2)} ft`;
            break outer2;
          }
        }
      }
      if (rimTear) { fail(rimTear); continue; }

      // T-heal all pieces, then union each winner's pieces into its facet
      {
        const verts: FootprintPoint[] = [];
        const seenV = new Set<string>();
        for (const piece of pieces) for (const pp of piece) {
          const k = qk2(pp.x, pp.y);
          if (!seenV.has(k)) { seenV.add(k); verts.push(pp); }
        }
        const grow = (poly: FootprintPoint[]): FootprintPoint[] => {
          const out2: FootprintPoint[] = [];
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length];
            out2.push(a);
            const dx = b.x - a.x, dy = b.y - a.y;
            const l2 = dx * dx + dy * dy;
            if (l2 < 1e-12) continue;
            const hits: Array<{ t: number; p: FootprintPoint }> = [];
            for (const v of verts) {
              const t = ((v.x - a.x) * dx + (v.y - a.y) * dy) / l2;
              if (t <= 1e-6 || t >= 1 - 1e-6) continue;
              if (Math.hypot(v.x - (a.x + t * dx), v.y - (a.y + t * dy)) < 5e-4) hits.push({ t, p: v });
            }
            hits.sort((x, y) => x.t - y.t);
            for (const h of hits) out2.push(h.p);
          }
          return out2;
        };
        for (const [nb, arr] of perNb) perNb.set(nb, arr.map(grow));
      }
      const backup = new Map<Facet, P3[]>([...perNb.keys()].map((nb) => [nb, nb.ring.slice()]));
      let attachFail: string | null = null;
      for (const [nb, arr] of perNb) {
        const pl = planes.find((x) => x.nb === nb)!.pl;
        const de = new Map<string, [FootprintPoint, FootprintPoint]>();
        const feed = (poly: FootprintPoint[]) => {
          const r = areaOf(poly) >= 0 ? poly : [...poly].reverse();
          for (let i = 0; i < r.length; i++) {
            const a = r[i], b = r[(i + 1) % r.length];
            if (Math.hypot(b.x - a.x, b.y - a.y) <= Q) continue;
            const fw = `${qk2(a.x, a.y)}>${qk2(b.x, b.y)}`;
            const bw = `${qk2(b.x, b.y)}>${qk2(a.x, a.y)}`;
            if (de.has(bw)) de.delete(bw);
            else de.set(fw, [a, b]);
          }
        };
        feed(nb.ring.map((pp) => ({ x: pp.x, y: pp.y })));
        for (const piece of arr) feed(piece);
        const edges = [...de.values()];
        if (!edges.length) { attachFail = `${nb.label}: union cancelled to nothing`; break; }
        const ring: FootprintPoint[] = [edges[0][0], edges[0][1]];
        edges.shift();
        let guard = edges.length * 2 + 4;
        while (edges.length && guard-- > 0) {
          const endK = qk2(ring[ring.length - 1].x, ring[ring.length - 1].y);
          const i2 = edges.findIndex(([a]) => qk2(a.x, a.y) === endK);
          if (i2 < 0) break;
          ring.push(edges.splice(i2, 1)[0][1]);
        }
        if (edges.length) { attachFail = `${nb.label}: union did not chain`; break; }
        if (ring.length > 1 && qk2(ring[0].x, ring[0].y) === qk2(ring[ring.length - 1].x, ring[ring.length - 1].y)) ring.pop();
        if (ring.length < 3) { attachFail = `${nb.label}: union collapsed`; break; }
        nb.ring = ring.map((pp) => ({ x: pp.x, y: pp.y, z: zOfPl(pl, pp.x, pp.y) }));
      }
      if (attachFail) {
        for (const [nb, r2] of backup) nb.ring = r2;
        fail(attachFail);
        continue;
      }
      for (const f of group) facets.splice(facets.indexOf(f), 1);
      const err = checks(`gable group ${label}`);
      if (err) {
        for (const [nb, r2] of backup) nb.ring = r2;
        for (const f of group) facets.push(f);
        fail(err);
        continue;
      }
      changed = true;
      for (const f of group) {
        rep.gables.push({ facet: f.label, absorbedInto: [...perNb.keys()].map((nb) => nb.label).slice(0, 2) as [string, string], source: "dsm-cluster" });
      }
    }

    // ── SURGERY 2: coplanar adjacent merges, one at a time ──
    let mergedSomething = true;
    while (mergedSomething) {
      mergedSomething = false;
      const ms = members();
      outer: for (const A of ms) {
        for (const B of ms) {
          if (A === B) continue;
          // adjacency: share at least one edge
          let adjacent = false;
          for (let i = 0; i < A.ring.length && !adjacent; i++) {
            adjacent = sharesEdge(A, B, A.ring[i], A.ring[(i + 1) % A.ring.length]);
          }
          if (!adjacent) continue;
          const pl = fitPlane3([...A.ring, ...B.ring]);
          if (!pl) continue;
          const maxOff = Math.max(...[...A.ring, ...B.ring].map((p) => Math.abs(pl.a * p.x + pl.b * p.y + pl.c - p.z)));
          if (maxOff > EPS_PLANE_FT) continue;
          // union by directed-edge cancellation
          const dirEdges = new Map<string, [P3, P3]>();
          for (const f2 of [A, B]) {
            const plan = f2.ring.map((p) => ({ x: p.x, y: p.y }));
            const ordered = areaOf(plan) >= 0 ? f2.ring : [...f2.ring].reverse();
            for (let i = 0; i < ordered.length; i++) {
              const a = ordered[i], b = ordered[(i + 1) % ordered.length];
              if (Math.hypot(b.x - a.x, b.y - a.y) <= Q) continue;
              const fw = `${qk2(a.x, a.y)}>${qk2(b.x, b.y)}`;
              const bw = `${qk2(b.x, b.y)}>${qk2(a.x, a.y)}`;
              if (dirEdges.has(bw)) dirEdges.delete(bw);
              else dirEdges.set(fw, [a, b]);
            }
          }
          const edges = [...dirEdges.values()];
          if (!edges.length) continue;
          const ring: P3[] = [edges[0][0], edges[0][1]];
          edges.shift();
          let guard = edges.length * 2 + 4;
          while (edges.length && guard-- > 0) {
            const endK = qk2(ring[ring.length - 1].x, ring[ring.length - 1].y);
            const i2 = edges.findIndex(([a]) => qk2(a.x, a.y) === endK);
            if (i2 < 0) break;
            ring.push(edges.splice(i2, 1)[0][1]);
          }
          if (edges.length) continue; // not simply connected — leave them
          if (ring.length > 1 && qk2(ring[0].x, ring[0].y) === qk2(ring[ring.length - 1].x, ring[ring.length - 1].y)) ring.pop();
          if (ring.length < 3) continue;
          const keepA = A.ring.slice();
          const keepB = B.ring.slice();
          A.ring = ring;
          facets.splice(facets.indexOf(B), 1);
          const err = checks(`merge ${A.label}+${B.label}`);
          if (err) {
            A.ring = keepA;
            B.ring = keepB;
            facets.push(B);
            continue;
          }
          changed = true;
          rep.merges.push({ faces: [A.label, B.label] });
          mergedSomething = true;
          break outer;
        }
      }
    }

    // ── the unrecognised-case detector ──
    for (const f of members()) {
      if (f.dsmAz == null || !f.trusted) continue;
      const pl = fitPlane3(f.ring);
      if (!pl) continue;
      const faceAz = drainAz(pl);
      const diff = azDiff(faceAz, f.dsmAz);
      if (diff > CLUSTER_AZ_TOL_DEG) {
        rep.unrecognised.push({ facet: f.label, dsmAz: f.dsmAz, faceAz, diffDeg: diff });
      }
    }
    rep.facetsAfter = members().length;
  }

  if (!changed) return { model, report: reports, changed };

  // ── reassemble the model ──
  const points: RoofPoint[] = [];
  const pIds = new Map<string, string>();
  const pt = (p: P3): string => {
    const k = `${Math.round(p.x / Q)}|${Math.round(p.y / Q)}|${Math.round(p.z / Q)}`;
    let id = pIds.get(k);
    if (!id) {
      id = `SP${points.length + 1}`;
      pIds.set(k, id);
      points.push({ id, x: p.x, y: p.y, z: p.z });
    }
    return id;
  };
  const lines: RoofLine[] = [];
  const lIds = new Map<string, string>();
  interface Pending { ids: string[]; facet: Facet }
  const pend: Pending[] = [];
  for (const f of facets) {
    const ids: string[] = [];
    for (let i = 0; i < f.ring.length; i++) {
      const a = f.ring[i], b = f.ring[(i + 1) % f.ring.length];
      const aId = pt(a), bId = pt(b);
      if (aId === bId) continue;
      const k = [aId, bId].sort().join("#");
      let id = lIds.get(k);
      if (!id) {
        id = `SL${lines.length + 1}`;
        lIds.set(k, id);
        lines.push({ id, type: "OTHER", aId, bId, lengthFt: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) });
      }
      ids.push(id);
    }
    pend.push({ ids, facet: f });
  }
  const lineOwners = new Map<string, Pending[]>();
  for (const f of pend) for (const id of f.ids) {
    const arr = lineOwners.get(id) ?? [];
    arr.push(f);
    lineOwners.set(id, arr);
  }
  const planeOf = new Map<Pending, { a: number; b: number; c: number } | null>(pend.map((f) => [f, fitPlane3(f.facet.ring)]));
  for (const l of lines) {
    const a = points.find((p) => p.id === l.aId)!;
    const b = points.find((p) => p.id === l.bId)!;
    const run = Math.hypot(b.x - a.x, b.y - a.y);
    const level = Math.abs(a.z - b.z) <= Math.max(0.08, LEVEL_SLOPE * run);
    const own = lineOwners.get(l.id) ?? [];
    if (own.length <= 1) {
      l.type = level ? "EAVE" : "RAKE";
    } else if (level) {
      l.type = "RIDGE";
    } else {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zc = (a.z + b.z) / 2;
      const dir = { x: (b.x - a.x) / (run || 1), y: (b.y - a.y) / (run || 1) };
      const per = { x: -dir.y, y: dir.x };
      const zSide = (f: Pending, sx: number, sy: number): number => {
        const pl = planeOf.get(f);
        return pl ? pl.a * (mid.x + sx) + pl.b * (mid.y + sy) + pl.c : zc;
      };
      const z1 = zSide(own[0], per.x * 0.5, per.y * 0.5);
      const z2 = zSide(own[1], -per.x * 0.5, -per.y * 0.5);
      l.type = z1 <= zc && z2 <= zc ? "HIP" : "VALLEY";
    }
  }
  const order = [...pend].sort((x, y) => {
    const ax = Math.abs(areaOf(x.facet.ring.map((p) => ({ x: p.x, y: p.y }))));
    const ay = Math.abs(areaOf(y.facet.ring.map((p) => ({ x: p.x, y: p.y }))));
    return ax - ay;
  });
  const faces: RoofFace[] = [];
  let totalArea = 0;
  for (const [rank, f] of order.entries()) {
    const plan = Math.abs(areaOf(f.facet.ring.map((p) => ({ x: p.x, y: p.y }))));
    const sf = Math.sqrt(1 + (f.facet.pitch12 / 12) ** 2);
    const area = plan * sf;
    totalArea += area;
    const pl = planeOf.get(f);
    faces.push({
      id: `s${f.facet.si}:SF${rank + 1}`,
      designator: `${String.fromCharCode(65 + Math.floor(rank / 9))}${(rank % 9) + 1}`,
      pitch: f.facet.pitch12,
      areaSqft: area,
      orientation: pl ? drainAz(pl) : 0,
      lineIds: f.ids,
    });
  }
  const footageByType = {} as Record<EvLineType, number>;
  for (const l of lines) footageByType[l.type] = (footageByType[l.type] ?? 0) + l.lengthFt;
  for (const t of ["EAVE", "RIDGE", "VALLEY", "HIP", "RAKE", "FLASHING", "STEPFLASH", "OTHER"] as EvLineType[]) footageByType[t] = footageByType[t] ?? 0;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y), zs = points.map((p) => p.z);
  const out: RoofModel = {
    ...model,
    points,
    lines,
    faces,
    totals: {
      ...model.totals,
      areaSqft: totalArea,
      squares: totalArea / 100,
      facetCount: faces.length,
      footageByType,
      bounds: {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
        minZ: Math.min(...zs), maxZ: Math.max(...zs),
      },
    },
  };
  return { model: out, report: reports, changed };
}

/**
 * The detector alone, product-safe: no geometry is touched. Any facet whose
 * TRUSTED DSM azimuth disagrees with its own drawn drain by more than the
 * clustering tolerance is an unrecognised case: logged, carried in
 * provenance, surfaced in confidence. The case list grows from the field.
 */
export function detectUnrecognisedFacets(model: RoofModel, measurement: PitchMeasurement): UnrecognisedFacet[] {
  const byLabel = new Map(measurement.facets.map((f) => [f.id, f]));
  const pointsById = new Map(model.points.map((p) => [p.id, p]));
  const linesById = new Map(model.lines.map((l) => [l.id, l]));
  const out: UnrecognisedFacet[] = [];
  for (const f of model.faces) {
    const label = String(f.designator || f.id);
    const m = byLabel.get(label);
    if (!m || m.residualP50Ft > DSM_NOISE_FLOOR_FT) continue;
    const ids: string[] = [];
    for (const lid of f.lineIds) {
      const l = linesById.get(lid);
      if (!l) continue;
      if (ids.length === 0) ids.push(l.aId, l.bId);
      else {
        const last = ids[ids.length - 1];
        if (l.aId === last) ids.push(l.bId);
        else if (l.bId === last) ids.push(l.aId);
        else if (l.aId === ids[0]) ids.unshift(l.bId);
        else if (l.bId === ids[0]) ids.unshift(l.aId);
        else ids.push(l.aId, l.bId);
      }
    }
    if (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
    const ring = ids.map((pid) => pointsById.get(pid)).filter((pp): pp is RoofPoint => !!pp).map((pp) => ({ x: pp.x, y: pp.y, z: pp.z }));
    if (ring.length < 3) continue;
    const pl = fitPlane3(ring);
    if (!pl) continue;
    const faceAz = drainAz(pl);
    const diff = azDiff(faceAz, m.azimuthDeg);
    if (diff > CLUSTER_AZ_TOL_DEG) out.push({ facet: label, dsmAz: m.azimuthDeg, faceAz, diffDeg: diff });
  }
  return out;
}

function planAreaOf(f: Facet): number {
  return Math.abs(areaOf(f.ring.map((p) => ({ x: p.x, y: p.y }))));
}
function drainAzOf(f: Facet): number {
  const pl = fitPlane3(f.ring);
  return pl ? drainAz(pl) : 0;
}

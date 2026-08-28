// Cutting a facet along a line the point cloud found, safely.
//
// A cut from edge to edge inside one facet OUGHT to leave the topology alone:
// one face becomes two, one line is added, and the two boundary lines the cut
// crosses each become two. The part that can really break is that a boundary
// line is SHARED with the neighbouring face, so it has to be split there too.
//
// MEASURED, 2026-08-28: nine of ten cuts on the field set are clean — Euler
// 1 → 1, the validator's error set unchanged. The tenth, 12621 A6, left one
// half with no eave, and the validator said so (R09), along with an existing
// ridge that stopped being its facet's top edge (R11). That is the reason for
// the eave predicate below and for rolling a cut back rather than trusting it.
//
// Every cut is applied to a copy, checked, and kept only if it survives. The
// refusal reason travels to provenance; a fallback is never silent.

import type { EvLineType, RoofLine, RoofModel } from "@/lib/eagleview";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { areaOf } from "@/lib/roofRecon/footprint";
import type { CreaseCandidate } from "@/lib/roofRecon/creases";

export interface AppliedCut {
  facet: string;
  type: EvLineType;
  lengthFt: number;
  bendDeg: number;
}
export interface RefusedCut {
  facet: string;
  reason: string;
}
export interface CutReport {
  model: RoofModel;
  applied: AppliedCut[];
  refused: RefusedCut[];
  /** Euler characteristic before and after the whole batch. */
  eulerBefore: number;
  eulerAfter: number;
}

const eulerOf = (m: RoofModel): number =>
  new Set(m.points.map((p) => p.id)).size - new Set(m.lines.map((l) => l.id)).size + m.faces.length;
const errorCodesOf = (m: RoofModel): string[] =>
  [...new Set(validateRoofInvariants(m).results.filter((r) => r.level === "error").map((r) => r.id))];

/**
 * Split `faceId` along the plan line through `p` in direction `d`.
 * Returns the new model, or the reason it could not be done.
 */
export function cutFace(
  model: RoofModel,
  faceId: string,
  p: { x: number; y: number },
  d: { x: number; y: number },
  type: EvLineType,
): { model: RoofModel; lengthFt: number } | { error: string } {
  const m: RoofModel = JSON.parse(JSON.stringify(model)) as RoofModel;
  const face = m.faces.find((f) => f.id === faceId);
  if (!face) return { error: "facet not found" };
  const pById = new Map(m.points.map((q) => [q.id, q]));
  const lById = new Map(m.lines.map((l) => [l.id, l]));
  const ring0 = ringOf(face.lineIds, buildIndexes(m));
  const before = ring0 && ring0.length >= 3 ? Math.abs(areaOf(ring0.map((q) => ({ x: q.x, y: q.y })))) : 0;

  // walk the boundary in order, as (line, from, to)
  const walk: Array<{ lineId: string; aId: string; bId: string }> = [];
  {
    const remaining = new Set(face.lineIds);
    const firstLine = lById.get(face.lineIds[0]);
    if (!firstLine) return { error: "facet references a missing line" };
    let cur = firstLine.aId;
    let guard = 0;
    while (remaining.size && guard++ < 500) {
      let hit: RoofLine | null = null;
      for (const id of remaining) {
        const l = lById.get(id);
        if (l && (l.aId === cur || l.bId === cur)) { hit = l; break; }
      }
      if (!hit) break;
      remaining.delete(hit.id);
      const from = cur;
      const to = hit.aId === cur ? hit.bId : hit.aId;
      walk.push({ lineId: hit.id, aId: from, bId: to });
      cur = to;
    }
    if (remaining.size) return { error: "the facet boundary is not a single ring" };
  }

  // where the cut meets that boundary
  const hits: Array<{ i: number; x: number; y: number; z: number }> = [];
  for (let i = 0; i < walk.length; i++) {
    const A = pById.get(walk[i].aId), B = pById.get(walk[i].bId);
    if (!A || !B) return { error: "the facet boundary references a missing point" };
    const ex = B.x - A.x, ey = B.y - A.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (d.x * (A.y - p.y) - d.y * (A.x - p.x)) / -den;
    if (t <= 1e-6 || t >= 1 - 1e-6) continue;
    hits.push({ i, x: A.x + ex * t, y: A.y + ey * t, z: A.z + (B.z - A.z) * t });
  }
  if (hits.length !== 2) return { error: `the cut meets the boundary ${hits.length} times, not twice` };

  // split each crossed boundary line EVERYWHERE it is referenced, so the
  // neighbouring face keeps a matching edge
  const newPointIds: string[] = [];
  for (const h of hits.sort((a, b) => b.i - a.i)) {
    const seg = walk[h.i];
    const old = lById.get(seg.lineId);
    if (!old) return { error: "a boundary line vanished mid-cut" };
    const pid = `${faceId}-x${newPointIds.length}`;
    m.points.push({ id: pid, x: h.x, y: h.y, z: h.z });
    const at = (id: string) => (id === pid ? { x: h.x, y: h.y, z: h.z } : pById.get(id));
    const mk = (id: string, aId: string, bId: string): RoofLine | null => {
      const A = at(aId), B = at(bId);
      if (!A || !B) return null;
      return { id, type: old.type, aId, bId, lengthFt: Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) };
    };
    const l1 = mk(`${old.id}a`, old.aId, pid), l2 = mk(`${old.id}b`, pid, old.bId);
    if (!l1 || !l2) return { error: "could not split a boundary line" };
    m.lines = m.lines.filter((l) => l.id !== old.id).concat([l1, l2]);
    for (const f of m.faces) {
      const k = f.lineIds.indexOf(old.id);
      if (k >= 0) f.lineIds.splice(k, 1, l1.id, l2.id);
    }
    newPointIds.push(pid);
    walk.splice(h.i, 1, { lineId: l1.id, aId: seg.aId, bId: pid }, { lineId: l2.id, aId: pid, bId: seg.bId });
  }

  const pA = m.points.find((q) => q.id === newPointIds[0]);
  const pB = m.points.find((q) => q.id === newPointIds[1]);
  if (!pA || !pB) return { error: "lost the cut points" };
  const lengthFt = Math.hypot(pB.x - pA.x, pB.y - pA.y, pB.z - pA.z);

  // Split the boundary by GEOMETRY, not by walk order. Following the ring is
  // fragile where two edges meet at a shared point, and a mis-ordered arc makes
  // a half that cannot be closed. Which side of the cut an edge lies on is not
  // ambiguous: take its midpoint.
  const nx = -d.y, ny = d.x; // the cut's normal
  const sideOf = (lineId: string): number => {
    const l = m.lines.find((q) => q.id === lineId);
    if (!l) return 0;
    const A = m.points.find((q) => q.id === l.aId), B = m.points.find((q) => q.id === l.bId);
    if (!A || !B) return 0;
    const mx = (A.x + B.x) / 2 - p.x, my = (A.y + B.y) / 2 - p.y;
    const s = mx * nx + my * ny;
    return Math.abs(s) < 1e-9 ? 0 : Math.sign(s);
  };
  const side1: string[] = [];
  const side2: string[] = [];
  for (const id of face.lineIds) {
    const s = sideOf(id);
    if (s > 0) side1.push(id);
    else if (s < 0) side2.push(id);
    else return { error: "a boundary edge lies along the cut" };
  }
  if (side1.length < 2 || side2.length < 2) return { error: "the cut does not divide the facet into two closable halves" };

  const crease: RoofLine = { id: `${faceId}-fold`, type, aId: pA.id, bId: pB.id, lengthFt };
  m.lines.push(crease);
  m.faces = m.faces.filter((f) => f.id !== faceId).concat([
    { ...face, id: `${face.id}1`, designator: `${face.designator}1`, lineIds: [...side1, crease.id] },
    { ...face, id: `${face.id}2`, designator: `${face.designator}2`, lineIds: [...side2, crease.id] },
  ]);

  // Both halves must close, and together they must still cover the facet. A
  // half that cannot be walked into a ring silently loses its area from every
  // total downstream, which is exactly the tiling failure this catches.
  const idx = buildIndexes(m);
  let halved = 0;
  for (const id of [`${face.id}1`, `${face.id}2`]) {
    const f = m.faces.find((x) => x.id === id);
    const r = f ? ringOf(f.lineIds, idx) : null;
    if (!r || r.length < 3) return { error: `half ${id} does not close into a ring` };
    halved += Math.abs(areaOf(r.map((q) => ({ x: q.x, y: q.y }))));
  }
  if (before > 0 && Math.abs(halved - before) / before > 0.01) {
    return { error: `the two halves cover ${halved.toFixed(0)} sq ft of the facet's ${before.toFixed(0)}` };
  }
  return { model: m, lengthFt };
}

/** Does every face still drain over an eave? The predicate 12621 A6 taught us. */
function halvesHaveEaves(m: RoofModel, faceIds: string[]): boolean {
  const byId = new Map(m.lines.map((l) => [l.id, l]));
  for (const id of faceIds) {
    const f = m.faces.find((x) => x.id === id);
    if (!f) return false;
    if (!f.lineIds.some((lid) => byId.get(lid)?.type === "EAVE")) return false;
  }
  return true;
}

/**
 * Apply every candidate that survives its guards, one at a time, checking the
 * whole model after each and rolling that cut back if it made things worse.
 */
export function applyCreases(model: RoofModel, creases: readonly CreaseCandidate[]): CutReport {
  const applied: AppliedCut[] = [];
  const refused: RefusedCut[] = [];
  const eulerBefore = eulerOf(model);
  let working = model;
  let baseline = errorCodesOf(model);

  for (const c of creases) {
    if (c.refused) { refused.push({ facet: c.facetLabel, reason: c.refused }); continue; }
    if (c.type !== "RIDGE" && c.type !== "HIP" && c.type !== "VALLEY") {
      refused.push({ facet: c.facetLabel, reason: `cannot type a ${c.type} line` });
      continue;
    }
    const cut = cutFace(working, c.facetId, c.through, c.dir, c.type);
    if ("error" in cut) { refused.push({ facet: c.facetLabel, reason: cut.error }); continue; }

    if (!halvesHaveEaves(cut.model, [`${c.facetId}1`, `${c.facetId}2`])) {
      refused.push({ facet: c.facetLabel, reason: "one half would be left with no eave — water would have nowhere to leave it" });
      continue;
    }
    const after = errorCodesOf(cut.model);
    const fresh = after.filter((x) => !baseline.includes(x));
    if (fresh.length) {
      refused.push({ facet: c.facetLabel, reason: `the cut breaks ${fresh.join(", ")}` });
      continue;
    }
    if (eulerOf(cut.model) !== eulerOf(working)) {
      refused.push({ facet: c.facetLabel, reason: "the cut changed the Euler characteristic" });
      continue;
    }
    working = cut.model;
    baseline = after;
    applied.push({ facet: c.facetLabel, type: c.type, lengthFt: cut.lengthFt, bendDeg: c.bendDeg });
  }

  // keep the printed totals honest about what is now drawn
  if (applied.length) {
    const foot: Record<string, number> = {};
    for (const l of working.lines) foot[l.type] = (foot[l.type] ?? 0) + l.lengthFt;
    working = {
      ...working,
      totals: {
        ...working.totals,
        facetCount: working.faces.length,
        footageByType: { ...working.totals.footageByType, ...(foot as Record<EvLineType, number>) },
      },
    };
  }
  return { model: working, applied, refused, eulerBefore, eulerAfter: eulerOf(working) };
}

/** Plan area of the drawn facets, for the tiling check. */
export const planAreaOf = (m: RoofModel): number => {
  const idx = buildIndexes(m);
  return m.faces.reduce((s, f) => {
    const r = ringOf(f.lineIds, idx);
    return s + (r && r.length >= 3 ? Math.abs(areaOf(r.map((p) => ({ x: p.x, y: p.y })))) : 0);
  }, 0);
};

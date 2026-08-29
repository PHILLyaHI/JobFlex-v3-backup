// Roof diagram — GRAFT: put the dormers and sub-roofs BACK on the synthesized
// base. The straight-skeleton synthesis (spec §6) draws the ideal primary roof
// from the Instant outline, but by construction it knows nothing the outline
// doesn't say — every dormer, porch cap and lower sub-roof the imagery traced
// is lost (Prairie: 12 facets vs the report's 22, flashing 0 vs 97 ft). The
// repair candidate (refined recon) still HAS those facets as evidence. This
// module finds the evidence facets the base cannot explain and grafts them —
// points, lines, types and all — on top of their host base facet.
//
// Semantics:
//   • UNEXPLAINED evidence facet — its plan centroid lies inside some base
//     facet ring AND it differs materially from that base facet: pitch label
//     ≥ 2 rise/12 apart, OR plan down-slope direction ≥ 30° apart, OR its
//     ring's mean z is ≥ 1.5 ft off the base facet's least-squares plane.
//     The PITCH test first snaps the raw evidence label onto the same kept
//     pitch set / forced pitch the base's synthesized labels were quantised
//     to, when the caller passes them via GraftOptions (keptPitches /
//     forcePitch — hand it exactly what synthesizeRoofModel got); comparing
//     raw against snapped flagged legitimately explained planes whose true
//     pitch was dropped from the kept set. Without options, raw labels
//     compare directly (legacy behavior).
//     The two models live on different z DATUMS (recon z is height above
//     ground; the synthesized base starts its eaves at z = 0), so the
//     AREA-WEIGHTED median per-facet plane offset across hosted evidence
//     facets is treated as the datum shift and removed before the 1.5 ft
//     test — weighting by facet plan area keeps a handful of chained dormer
//     faces from dragging the datum when the big main facets fail to chain,
//     and without the shift every facet reads "unexplained" and the whole
//     mesh clumps into one cluster (measured on Prairie: 8 clusters, 7
//     rejected as oversized sections). The datum is TRUSTED — and the 1.5 ft
//     z test applied at all — only when the hosted facets' plan area covers
//     ≥ DATUM_COVERAGE_MIN of the hosts' plan area; below that the weighted
//     median itself can invert onto a dormer offset (the big main facets are
//     absent from the weights), so z-only differences are ignored and only
//     the pitch and direction tests flag a facet unexplained.
//   • CLUSTER unexplained facets by shared line ids (a dormer is usually 2–3
//     facets sharing a ridge). A cluster is rejected when its total plan area
//     is < 15 sq ft (noise), > 40 % of its host facet's plan area (that is a
//     section, not a dormer), its ring geometry fails to chain, it touches
//     the base outline (sections belong to the repair candidate), its plan
//     bbox does not fit inside the host's bbox expanded 2 ft, or two of its
//     own lines properly cross (evidence should be planar within itself —
//     when it is not, we refuse to draw it rather than draw it torn).
//   • GRAFT a surviving cluster with fresh "g{n}:"-prefixed ids, keeping the
//     evidence line TYPES exactly (VALLEY/FLASHING/STEPFLASH/RAKE/EAVE/
//     RIDGE/HIP), and SUBTRACT the cluster's plan area × the host's pitch
//     factor from the host facet's areaSqft (floor 1 sq ft) so the printed
//     totals stay honest. The host RING is not re-cut: a drafted plan draws a
//     dormer atop its parent facet. (The finisher re-derives every face's
//     area from its ring, which restores the host's full figure — the
//     `hostAttribution` entries in the report exist so it can re-apply the
//     transfer exactly once, post-scale.)
//   • A grafted segment that properly CROSSES a base STRUCTURAL line
//     (perimeter EAVE/RAKE or interior RIDGE/HIP/VALLEY of any base face), or
//     an earlier cluster's structural line, is SPLIT at the crossing with the
//     dormer's own interpolated z. The crossing becomes an endpoint of the
//     overlay pieces, so planarize P1 sees a junction rather than a proper
//     crossing and never mints a mean-z vertex into the base facet's ring
//     (that vertex sat ~1 ft off the host plane and failed R03). The cluster
//     ring stays simple, closed and on the dormer's own plane. A collinear
//     OVERLAP with a structural line cannot be resolved by a split and
//     rejects the cluster instead.
//   • IDEMPOTENT — a cluster whose evidence face id already sits behind a
//     graft marker in the base is skipped, and graft numbering continues from
//     the highest existing g{n} prefix, so re-running graft on a grafted
//     (even composed "s{i}:g{n}:…") base adds nothing and mints no colliding
//     ids.
//
// NOTE for validate.ts's owner: grafted faces are OVERLAYS — their plan area
// is already inside their host facet's figure, so summing facet plans over a
// grafted model double-counts. `overlayFaceIds(model)` returns the marked
// face ids — the marker matches anywhere in the id ("g1:F7" and the composed
// "s0:g1:F7" alike); exclude them from the R05 plan-coverage sum (and from
// any footprint chaining — their lines are single-owner but interior).
//
// Totals: facet count, area and bounds are refreshed on the grafted model,
// but footageByType is NOT touched here — finishCalibration recomputes the
// footage from scratch downstream, and a graft-time increment silently
// diverged from that recompute. `report.linesAdded` still counts the overlay
// line pieces added.
//
// The caller planarizes afterwards (spec §5); grafted lines never properly
// cross base structural lines (split here), and never each other within a
// cluster — that is checked here and is a rejection, not a repair.
//
// Pure and client-safe: no I/O, no side effects, inputs never mutated.

import type { RoofFace, RoofLine, RoofModel, RoofPoint } from "@/lib/eagleview";
import { buildIndexes, ringOf, type RoofIndexes } from "@/components/estimator/roof/roofGeometry";

/** Host attribution of one grafted overlay face — what finishCalibration
 *  needs to subtract the dormer footprint from the HOST's ring-derived area
 *  exactly once (the graft-time areaSqft transfer is recomputed away when the
 *  finisher re-derives every face's area from its ring). `planSqft` is the
 *  overlay's plan area in the evidence frame, PRE-scale — multiply by k² and
 *  by `hostPitchFactor` (slopeFactor of the host's pitch label at graft time)
 *  to get the sloped area to remove from the host. */
export interface GraftHostAttribution {
  /** Overlay face id as minted: "g{n}:" + the evidence face id. */
  overlayFaceId: string;
  /** Base face whose ring contains the overlay's plan footprint. */
  hostFaceId: string;
  /** Overlay face plan area, sq ft (evidence frame, pre-scale). */
  planSqft: number;
  /** slopeFactor(host pitch) used by the graft-time transfer. */
  hostPitchFactor: number;
}

export interface GraftReport {
  clusters: number;
  grafted: number;
  facetsAdded: number;
  linesAdded: number;
  areaTransferredSqft: number;
  rejected: string[];
  /** How many grafted segments were split where they properly crossed a base
   *  structural line (see header). Absent on rows saved before the split. */
  baseCrossingsSplit?: number;
  /** One entry per grafted overlay face. Absent on rows saved before it. */
  hostAttribution?: GraftHostAttribution[];
}

/** Optional quantisation context so the pitch test compares like with like —
 *  pass exactly what synthesizeRoofModel got (calibrate's keptPitchSet and
 *  Instant's predominant pitch). Absent → raw labels compare directly. */
export interface GraftOptions {
  /** The kept pitch set the base's synthesized labels were quantised onto. */
  keptPitches?: number[];
  /** Raw labels within PITCH_FORCE_WINDOW of this are pulled onto it. */
  forcePitch?: number | null;
}

/** Pitch labels this many rise/12 apart read as different planes. */
const PITCH_DIFF = 2;
/** Plan down-slope directions this many degrees apart read as different planes. */
const SLOPE_DIR_DIFF_DEG = 30;
/** Mean z offset from the host plane that reads as a separate surface. */
const Z_OFF_FT = 1.5;
/** The z-datum (area-weighted median plane offset) is trusted — and z-only
 *  unexplained flags are honored — only when the hosted evidence facets' plan
 *  area covers at least this fraction of the hosts' plan area. Below it the
 *  "bulk of the roof is explained" premise behind the median is unverifiable
 *  and the datum can invert onto a dormer offset (measured: Prairie hosted
 *  coverage 0.97; the inversion repro sits at 0.08). */
const DATUM_COVERAGE_MIN = 0.5;
/** Plan slope (rise per ft of run) below which a down-slope direction is noise. */
const MIN_GRADE = 0.05;
/** Clusters smaller than this are imagery noise, not dormers. */
const MIN_CLUSTER_SQFT = 35;
/** Narrowest a cluster may be in plan before it reads as a blade rather than a
 *  roof. Reconstruction slivers along valleys come out 2–3 ft wide; a dormer
 *  wide enough to hold a window is 4 ft and up. */
const MIN_CLUSTER_WIDTH_FT = 4;
/** Longest span ÷ min width. A dormer footprint is compact; a mis-segmented
 *  fin is long and thin (measured on 419 Prairie Ridge Ln: the two false
 *  dormers came out 4.4:1 and 2.9:1, 17 and 24 sq ft, one of them rising
 *  11.6 ft across a 10 ft span — they drew as spikes through the roof). */
const MAX_CLUSTER_SLENDERNESS = 3.5;
/** Steepest the cluster's own geometry may run across its footprint (rise/run,
 *  same 18/12 ceiling the synthesis uses): past that it is a wall or a fin, not
 *  a roof. An absolute rise cap would also reject a large, legitimate wing —
 *  a 30 ft section at 10/12 climbs 12 ft honestly. */
const MAX_CLUSTER_SLOPE = 18 / 12;
/** A cluster bigger than this fraction of its host is a section, not a dormer. */
const MAX_HOST_FRACTION = 0.4;
/** Cluster bbox must fit inside the host bbox expanded by this much. */
const HOST_BBOX_PAD_FT = 2;
/** Within this distance of a base perimeter line = touching the outline. */
const OUTLINE_TOUCH_FT = 0.75;
/** Endpoint contact within this distance is a junction, not a crossing. */
const TOUCH_FT = 0.05;
/** Labels within this (rise/12) of forcePitch are pulled onto it — keep in
 *  sync with synthesize.ts's PITCH_FORCE_WINDOW (calibrate's quantisation). */
const PITCH_FORCE_WINDOW = 1.5;
/** Matches a graft-minted id, fresh ("g1:F7") and composed ("s0:g1:F7"). */
const GRAFT_MARKER = /(^|:)g\d+:/;
/** Base line types a grafted segment may not properly cross (split instead). */
const STRUCTURAL_TYPES: ReadonlySet<RoofLine["type"]> = new Set<RoofLine["type"]>([
  "EAVE", "RAKE", "RIDGE", "HIP", "VALLEY",
]);

type P2 = { x: number; y: number };
type Plane = { a: number; b: number; c: number };
type BBox = { minX: number; maxX: number; minY: number; maxY: number };

/** Least-squares plane z = a·x + b·y + c over 3D ring points (centered for
 *  conditioning); null when the plan footprint is degenerate. */
function fitPlane(pts: RoofPoint[]): Plane | null {
  if (pts.length < 3) return null;
  let mx = 0, my = 0, mz = 0;
  for (const p of pts) { mx += p.x; my += p.y; mz += p.z; }
  mx /= pts.length; my /= pts.length; mz /= pts.length;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const p of pts) {
    const dx = p.x - mx, dy = p.y - my, dz = p.z - mz;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-6) return null;
  const a = (sxz * syy - syz * sxy) / det;
  const b = (syz * sxx - sxz * sxy) / det;
  return { a, b, c: mz - a * mx - b * my };
}

/** Plan DOWN-slope unit direction of a plane (steepest descent = −gradient);
 *  null when flatter than MIN_GRADE (no direction to speak of). */
function downSlopeDir(plane: Plane): P2 | null {
  const g = Math.hypot(plane.a, plane.b);
  if (g < MIN_GRADE) return null;
  return { x: -plane.a / g, y: -plane.b / g };
}

function shoelaceArea(ring: P2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

function pointInPoly(x: number, y: number, ring: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i], pj = ring[j];
    if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distPointSeg(p: P2, a: P2, b: P2): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/** Classify plan segment p1–p2 against q1–q2 for the graft-time split:
 *  a transverse proper crossing (farther than TOUCH_FT from every endpoint —
 *  shared vertices and T-contacts are junctions) returns its parameter t
 *  along p; a collinear overlap longer than TOUCH_FT returns { overlap:true }
 *  (it cannot be resolved by a split); everything else null. A non-finite
 *  coordinate on either segment (a poisoned upstream model) is null — NaN
 *  slips past every range check (all comparisons read false), so without the
 *  guard a poisoned base structural line minted a NaN split point into every
 *  non-parallel grafted segment. */
function crossParam(
  p1: P2, p2: P2, q1: P2, q2: P2,
): { overlap: true } | { overlap: false; t: number } | null {
  const rx = p2.x - p1.x, ry = p2.y - p1.y;
  const sx = q2.x - q1.x, sy = q2.y - q1.y;
  const qpx = q1.x - p1.x, qpy = q1.y - p1.y;
  const denom = rx * sy - ry * sx;
  if (!Number.isFinite(denom) || !Number.isFinite(qpx) || !Number.isFinite(qpy)) return null;
  if (Math.abs(denom) < 1e-9) {
    if (Math.abs(qpx * ry - qpy * rx) > 1e-6) return null; // parallel, apart
    const rlen2 = rx * rx + ry * ry;
    if (rlen2 < 1e-12) return null;
    const t0 = (qpx * rx + qpy * ry) / rlen2;
    const t1 = t0 + (sx * rx + sy * ry) / rlen2;
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
    const lo = Math.max(Math.min(t0, t1), 0);
    const hi = Math.min(Math.max(t0, t1), 1);
    return (hi - lo) * Math.sqrt(rlen2) > TOUCH_FT ? { overlap: true } : null;
  }
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (!Number.isFinite(t) || !Number.isFinite(u)) return null;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  const ix = p1.x + t * rx, iy = p1.y + t * ry;
  const near = (e: P2): boolean => Math.hypot(ix - e.x, iy - e.y) <= TOUCH_FT;
  return near(p1) || near(p2) || near(q1) || near(q2) ? null : { overlap: false, t };
}

/** True when the two plan segments properly cross: they intersect at a point
 *  farther than TOUCH_FT from every endpoint (shared vertices and T-contacts
 *  are junctions, not crossings), or overlap collinearly by more than TOUCH_FT. */
function properCross(p1: P2, p2: P2, q1: P2, q2: P2): boolean {
  return crossParam(p1, p2, q1, q2) !== null;
}

/** Snap a raw evidence pitch label onto the kept set / forced pitch the base
 *  labels were quantised to (mirrors synthesize's snapTo + force window);
 *  identity when no options are given. */
function snapEvidencePitch(raw: number, opts?: GraftOptions): number {
  let p = raw;
  const kept = opts?.keptPitches;
  if (kept && kept.length > 0) {
    let bestD = Infinity;
    for (const k of kept) {
      const d = Math.abs(raw - k);
      if (d < bestD) { bestD = d; p = k; }
    }
  }
  const fp = opts?.forcePitch;
  if (fp != null && Math.abs(raw - fp) <= PITCH_FORCE_WINDOW) p = fp;
  return p;
}

function bboxOf(pts: P2[]): BBox {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/** ringOf, hardened: null unless the face's lines chain into ONE closed loop
 *  (every endpoint used exactly twice, no silent truncation). */
function closedRingOf(face: RoofFace, idx: RoofIndexes): RoofPoint[] | null {
  const segs: RoofLine[] = [];
  for (const id of face.lineIds) {
    const l = idx.linesById.get(id);
    if (!l) return null;
    segs.push(l);
  }
  if (segs.length < 3) return null;
  const deg = new Map<string, number>();
  for (const s of segs) {
    deg.set(s.aId, (deg.get(s.aId) ?? 0) + 1);
    deg.set(s.bId, (deg.get(s.bId) ?? 0) + 1);
  }
  for (const d of deg.values()) if (d !== 2) return null;
  const ring = ringOf(face.lineIds, idx);
  return ring && ring.length === segs.length ? ring : null;
}

interface BaseFacet {
  face: RoofFace;
  ring: P2[];
  plane: Plane;
  planArea: number;
  bbox: BBox;
}

interface Unexplained {
  face: RoofFace;
  ring: RoofPoint[];
  planArea: number;
  hostId: string;
}

function cloneModel(m: RoofModel): RoofModel {
  const face = (f: RoofFace): RoofFace => ({ ...f, lineIds: [...f.lineIds] });
  return {
    ...m,
    provenance: m.provenance ? { ...m.provenance } : undefined,
    location: { ...m.location },
    points: m.points.map((p) => ({ ...p })),
    lines: m.lines.map((l) => ({ ...l })),
    faces: m.faces.map(face),
    penetrations: m.penetrations.map(face),
    totals: {
      ...m.totals,
      footageByType: { ...m.totals.footageByType },
      bounds: { ...m.totals.bounds },
    },
  };
}

const slopeFactor = (pitch: number): number => Math.sqrt(1 + (pitch / 12) ** 2);

/** Ids of overlay (grafted) faces — their plan area already lives inside the
 *  host facet's figure, so coverage sums must exclude them. The marker matches
 *  anywhere in the id, so composed models ("s0:g1:F7") report their overlays
 *  too, not only fresh grafts ("g1:F7"). */
export function overlayFaceIds(model: RoofModel): Set<string> {
  const ids = new Set<string>();
  for (const f of model.faces) if (GRAFT_MARKER.test(f.id)) ids.add(f.id);
  return ids;
}

/** Graft the evidence model's unexplained sub-roofs (dormers, porch caps,
 *  lower roofs) onto the synthesized base. See the header for the semantics. */
export function graftSubRoofs(
  base: RoofModel,
  evidence: RoofModel,
  opts?: GraftOptions,
): { model: RoofModel; report: GraftReport } {
  const model = cloneModel(base);
  const hostAttribution: GraftHostAttribution[] = [];
  const report: GraftReport = {
    clusters: 0,
    grafted: 0,
    facetsAdded: 0,
    linesAdded: 0,
    areaTransferredSqft: 0,
    rejected: [],
    baseCrossingsSplit: 0,
    hostAttribution,
  };

  const baseIdx = buildIndexes(base);
  const evIdx = buildIndexes(evidence);

  // Base facets that can host: chained ring + fitted plane. Overlay faces
  // from an earlier graft never host, never bound, and never count toward the
  // perimeter — re-running graft on a grafted base is a no-op, not a cascade.
  const hosts: BaseFacet[] = [];
  for (const f of base.faces) {
    if (GRAFT_MARKER.test(f.id)) continue;
    const ring3 = closedRingOf(f, baseIdx);
    if (!ring3) continue;
    const plane = fitPlane(ring3);
    if (!plane) continue;
    const ring = ring3.map((p) => ({ x: p.x, y: p.y }));
    hosts.push({ face: f, ring, plane, planArea: shoelaceArea(ring), bbox: bboxOf(ring) });
  }
  const hostById = new Map(hosts.map((h) => [h.face.id, h]));

  // Base outline = lines referenced by exactly one base ROOF face.
  const useCount = new Map<string, number>();
  for (const f of base.faces) {
    if (GRAFT_MARKER.test(f.id)) continue;
    for (const id of f.lineIds) useCount.set(id, (useCount.get(id) ?? 0) + 1);
  }
  const perimeter: Array<[P2, P2]> = [];
  for (const [id, n] of useCount) {
    if (n !== 1) continue;
    const l = baseIdx.linesById.get(id);
    if (!l) continue;
    const a = baseIdx.pointsById.get(l.aId);
    const b = baseIdx.pointsById.get(l.bId);
    if (a && b) perimeter.push([a, b]);
  }

  // Base STRUCTURAL segments (perimeter EAVE/RAKE + interior RIDGE/HIP/VALLEY
  // of every base face, prior overlays included): a grafted segment may not
  // properly cross one — it is split at the crossing instead (see header).
  // Each grafted cluster's own structural pieces join the list so later
  // clusters cannot cross earlier ones either.
  const structural: Array<{ a: P2; b: P2 }> = [];
  {
    const seen = new Set<string>();
    for (const f of base.faces) {
      for (const id of f.lineIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        const l = baseIdx.linesById.get(id);
        if (!l || !STRUCTURAL_TYPES.has(l.type)) continue;
        const a = baseIdx.pointsById.get(l.aId);
        const b = baseIdx.pointsById.get(l.bId);
        if (a && b) structural.push({ a, b });
      }
    }
  }

  // 1a. Pair every chained evidence facet with the base facet containing its
  //     plan centroid, and measure its mean offset from that facet's plane.
  //     Faces whose rings fail to chain cannot be tested — remember their
  //     line ids so any cluster they touch is rejected.
  const unchainedLineIds = new Set<string>();
  const hosted: Array<{
    face: RoofFace; ring: RoofPoint[]; planArea: number; host: BaseFacet; meanOff: number;
  }> = [];
  for (const f of evidence.faces) {
    const ring = closedRingOf(f, evIdx);
    if (!ring) {
      for (const id of f.lineIds) unchainedLineIds.add(id);
      continue;
    }
    const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p.y, 0) / ring.length;
    const host = hosts.find((h) => pointInPoly(cx, cy, h.ring));
    if (!host) continue;
    let zSum = 0;
    for (const p of ring) zSum += p.z - (host.plane.a * p.x + host.plane.b * p.y + host.plane.c);
    hosted.push({ face: f, ring, planArea: shoelaceArea(ring), host, meanOff: zSum / ring.length });
  }

  // 1b. Datum shift between the models = AREA-WEIGHTED median per-facet plane
  //     offset (the offset minimising the area-weighted absolute deviation).
  //     The bulk of the roof's AREA is explained, so the weighted median sits
  //     on the main planes even when the big main facets fail closedRingOf
  //     and a swarm of chained dormer faces outnumbers the rest — a plain
  //     head-count median then landed on the dormer offset and every
  //     genuinely explained facet failed the 1.5 ft test. Falls back to the
  //     unweighted median when every hosted ring is degenerate (zero area).
  //     The datum is only TRUSTED when the hosted faces' plan area covers at
  //     least DATUM_COVERAGE_MIN of the hosts' plan area — under that the
  //     "bulk is explained" premise is unverifiable (the weighted median can
  //     land on a dormer offset when the big main facets are absent from the
  //     weights entirely), and z-only unexplained flags are skipped rather
  //     than risk ghost-grafting a legitimately explained facet while the
  //     real dormers read explained under the inverted datum.
  // The datum is not only a detection aid: the evidence carries ABSOLUTE
  // reconstruction heights (eaves 14–24 ft above the pin's ground) while a
  // synthesized base is built from its own outline at z = 0, so minting an
  // overlay with raw evidence z hangs it ~20 ft over the roof (measured on
  // 419 Prairie Ridge Ln: facets B8 and C2 floated 21.2 and 20.9 ft up, and
  // read in 3D as detached spikes). Every minted point is therefore rebased by
  // zDatum, which keeps a dormer's true height ABOVE its host while removing
  // the systematic difference between the two frames.
  const byOff = [...hosted].sort((a, b) => a.meanOff - b.meanOff);
  const hostedPlanArea = hosted.reduce((s, h) => s + h.planArea, 0);
  const hostsPlanArea = hosts.reduce((s, h) => s + h.planArea, 0);
  const datumTrusted = hostedPlanArea >= DATUM_COVERAGE_MIN * hostsPlanArea && hostedPlanArea > 0;
  let zDatum = 0;
  if (byOff.length > 0) {
    const totalW = byOff.reduce((s, h) => s + h.planArea, 0);
    if (totalW > 0) {
      let acc = 0;
      zDatum = byOff[byOff.length - 1].meanOff;
      for (const h of byOff) {
        acc += h.planArea;
        if (acc >= totalW / 2) { zDatum = h.meanOff; break; }
      }
    } else {
      zDatum = byOff[Math.floor(byOff.length / 2)].meanOff;
    }
  }

  // 1c. Unexplained = materially different from the host once the datum is
  //     out. The evidence pitch is snapped onto the same kept set the base
  //     labels were quantised to (see header) before the PITCH_DIFF test.
  const unexplained: Unexplained[] = [];
  for (const { face: f, ring, planArea, host, meanOff } of hosted) {
    const pitchDiffers =
      Math.abs(snapEvidencePitch(f.pitch, opts) - host.face.pitch) >= PITCH_DIFF;

    let dirDiffers = false;
    const evPlane = fitPlane(ring);
    const hostDir = downSlopeDir(host.plane);
    const evDir = evPlane ? downSlopeDir(evPlane) : null;
    if (hostDir && evDir) {
      const dot = Math.max(-1, Math.min(1, hostDir.x * evDir.x + hostDir.y * evDir.y));
      dirDiffers = (Math.acos(dot) * 180) / Math.PI >= SLOPE_DIR_DIFF_DEG;
    }

    const zDiffers = datumTrusted && Math.abs(meanOff - zDatum) >= Z_OFF_FT;

    if (pitchDiffers || dirDiffers || zDiffers) {
      unexplained.push({ face: f, ring, planArea, hostId: host.face.id });
    }
  }

  // 2. Cluster by shared line ids (union-find).
  const parent = unexplained.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const lineOwner = new Map<string, number>();
  unexplained.forEach((u, i) => {
    for (const id of u.face.lineIds) {
      const prev = lineOwner.get(id);
      if (prev === undefined) lineOwner.set(id, i);
      else parent[find(i)] = find(prev);
    }
  });
  const clusters = new Map<number, Unexplained[]>();
  unexplained.forEach((u, i) => {
    const r = find(i);
    const arr = clusters.get(r);
    if (arr) arr.push(u);
    else clusters.set(r, [u]);
  });
  report.clusters = clusters.size;

  // 3. Vet and graft each cluster. Graft numbering continues past any g{n}
  //    already in the base — a re-run must not mint colliding ids — and a
  //    cluster whose evidence face id is already behind a graft marker was
  //    consumed by an earlier run and is skipped (header: idempotence).
  let graftN = 0;
  for (const it of [...model.faces, ...model.lines, ...model.points]) {
    const m = /(?:^|:)g(\d+):/.exec(it.id);
    if (m) graftN = Math.max(graftN, parseInt(m[1], 10));
  }
  const consumedEvidenceIds = new Set<string>();
  for (const f of model.faces) {
    const m = /(?:^|:)g\d+:(.+)$/.exec(f.id);
    if (m) consumedEvidenceIds.add(m[1]);
  }
  for (const members of clusters.values()) {
    const label = `cluster ${members.map((m) => m.face.designator).join("+")}`;
    if (members.some((m) => consumedEvidenceIds.has(m.face.id))) {
      report.rejected.push(`${label}: already grafted onto this base — skipped`);
      continue;
    }
    const totalArea = members.reduce((s, m) => s + m.planArea, 0);

    // Host = the base facet the cluster's plan OVERLAPS most, sampled on a
    // grid (≤ ~400 cells per member). Centroid attribution mis-hosts a dormer
    // that straddles a facet seam onto whichever small facet caught the
    // centroid, and the 40 % rule then kills a genuine dormer (measured on
    // Prairie: B7, 66 sq ft, centred on a 133 sq ft sliver of its real host).
    const overlapCells = new Map<string, number>();
    for (const m of members) {
      const ring2 = m.ring.map((p) => ({ x: p.x, y: p.y }));
      const bb = bboxOf(ring2);
      const span = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
      if (span <= 0) continue;
      const step = Math.max(0.5, span / 20);
      for (let x = bb.minX + step / 2; x < bb.maxX; x += step) {
        for (let y = bb.minY + step / 2; y < bb.maxY; y += step) {
          if (!pointInPoly(x, y, ring2)) continue;
          const h = hosts.find((hh) => pointInPoly(x, y, hh.ring));
          if (h) overlapCells.set(h.face.id, (overlapCells.get(h.face.id) ?? 0) + 1);
        }
      }
    }
    let hostId = members[0].hostId;
    let best = -1;
    for (const [id, n] of overlapCells) if (n > best) { best = n; hostId = id; }
    if (best < 0) {
      // Degenerate sampling — fall back to member-centroid dominance by area.
      const areaByHost = new Map<string, number>();
      for (const m of members) areaByHost.set(m.hostId, (areaByHost.get(m.hostId) ?? 0) + m.planArea);
      for (const [id, a] of areaByHost) if (a > best) { best = a; hostId = id; }
    }
    const host = hostById.get(hostId);
    if (!host) continue; // unreachable — hostId came from hosts

    if (members.some((m) => m.face.lineIds.some((id) => unchainedLineIds.has(id)))) {
      report.rejected.push(`${label}: shares lines with an unchained evidence facet`);
      continue;
    }
    if (totalArea < MIN_CLUSTER_SQFT) {
      report.rejected.push(`${label}: plan area ${totalArea.toFixed(1)} sq ft < ${MIN_CLUSTER_SQFT}`);
      continue;
    }
    // SHAPE: a dormer is a compact box on the roof. The reconstruction also
    // emits slivers (segmentation noise along valleys, chimney skirts, tree
    // shadow) whose plan area passes the size gate but whose shape cannot be a
    // roof plane — those are what stood up out of the roof as fins.
    {
      const pts = members.flatMap((m) => m.ring);
      let minWidth = Infinity;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const ex = pts[j].x - pts[i].x;
          const ey = pts[j].y - pts[i].y;
          const len = Math.hypot(ex, ey);
          if (len < 1e-6) continue;
          let far = 0;
          for (const q of pts) far = Math.max(far, Math.abs((q.x - pts[i].x) * ey - (q.y - pts[i].y) * ex) / len);
          minWidth = Math.min(minWidth, far);
        }
      }
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const rise = Math.max(...pts.map((q) => q.z)) - Math.min(...pts.map((q) => q.z));
      const slenderness = span / Math.max(minWidth, 0.01);
      if (!(minWidth >= MIN_CLUSTER_WIDTH_FT)) {
        report.rejected.push(`${label}: ${minWidth.toFixed(1)} ft wide in plan — a blade, not a dormer`);
        continue;
      }
      if (slenderness > MAX_CLUSTER_SLENDERNESS) {
        report.rejected.push(`${label}: ${slenderness.toFixed(1)}:1 long and thin — a mis-segmented sliver, not a dormer`);
        continue;
      }
      if (rise / Math.max(span, 0.01) > MAX_CLUSTER_SLOPE) {
        report.rejected.push(
          `${label}: rises ${rise.toFixed(1)} ft across a ${span.toFixed(1)} ft span (${((rise / Math.max(span, 0.01)) * 12).toFixed(0)}/12 — steeper than a roof)`,
        );
        continue;
      }
    }
    if (totalArea > MAX_HOST_FRACTION * host.planArea) {
      report.rejected.push(
        `${label}: ${totalArea.toFixed(0)} sq ft is > ${MAX_HOST_FRACTION * 100}% of host ${host.face.designator}'s ${host.planArea.toFixed(0)} sq ft — a section, not a dormer`,
      );
      continue;
    }
    const allPts: RoofPoint[] = members.flatMap((m) => m.ring);
    if (allPts.some((p) => perimeter.some(([a, b]) => distPointSeg(p, a, b) <= OUTLINE_TOUCH_FT))) {
      report.rejected.push(`${label}: touches the base outline — a section, left to the repair candidate`);
      continue;
    }
    const cb = bboxOf(allPts);
    const hb = host.bbox;
    if (
      cb.minX < hb.minX - HOST_BBOX_PAD_FT || cb.maxX > hb.maxX + HOST_BBOX_PAD_FT ||
      cb.minY < hb.minY - HOST_BBOX_PAD_FT || cb.maxY > hb.maxY + HOST_BBOX_PAD_FT
    ) {
      report.rejected.push(`${label}: bbox does not fit host ${host.face.designator} + ${HOST_BBOX_PAD_FT} ft`);
      continue;
    }

    // Unique lines of the cluster; internal proper crossings are a rejection.
    const lineIds: string[] = [];
    const seenLine = new Set<string>();
    for (const m of members) {
      for (const id of m.face.lineIds) {
        if (!seenLine.has(id)) { seenLine.add(id); lineIds.push(id); }
      }
    }
    const segs: Array<{ line: RoofLine; a: RoofPoint; b: RoofPoint }> = [];
    let broken = false;
    for (const id of lineIds) {
      const l = evIdx.linesById.get(id);
      const a = l && evIdx.pointsById.get(l.aId);
      const b = l && evIdx.pointsById.get(l.bId);
      if (!l || !a || !b) { broken = true; break; }
      segs.push({ line: l, a, b });
    }
    if (broken) {
      report.rejected.push(`${label}: a member line is missing its endpoints`);
      continue;
    }
    let crosses = false;
    outer: for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        if (properCross(segs[i].a, segs[i].b, segs[j].a, segs[j].b)) { crosses = true; break outer; }
      }
    }
    if (crosses) {
      report.rejected.push(`${label}: two of its own lines cross in plan`);
      continue;
    }

    // Grafted-vs-base structural crossings (header): compute every split
    // param BEFORE minting anything, so an unsplittable collinear overlap
    // still rejects the whole cluster with nothing half-added.
    const cutsBySeg = new Map<number, number[]>();
    let overlapsStructural = false;
    outer2: for (let i = 0; i < segs.length; i++) {
      for (const st of structural) {
        const hit = crossParam(segs[i].a, segs[i].b, st.a, st.b);
        if (!hit) continue;
        if (hit.overlap) { overlapsStructural = true; break outer2; }
        const arr = cutsBySeg.get(i);
        if (arr) arr.push(hit.t);
        else cutsBySeg.set(i, [hit.t]);
      }
    }
    if (overlapsStructural) {
      report.rejected.push(
        `${label}: collinearly overlaps a base structural line — no split keeps a simple ring`,
      );
      continue;
    }

    // Graft: deep-copy with fresh "g{n}:" ids, evidence types kept exactly.
    // Segments that properly cross a base structural line are split at the
    // crossing with the dormer's own interpolated z — the crossing becomes an
    // overlay ENDPOINT, so planarize P1 sees a junction and leaves the base
    // ring alone. footageByType is NOT incremented here (header: the finisher
    // recomputes it from scratch).
    graftN++;
    const pfx = `g${graftN}:`;
    const pointIds = new Set<string>();
    for (const s of segs) { pointIds.add(s.line.aId); pointIds.add(s.line.bId); }
    for (const pid of pointIds) {
      const p = evIdx.pointsById.get(pid);
      if (p) model.points.push({ ...p, id: pfx + p.id, z: p.z - zDatum });
    }
    const mintedByEvLine = new Map<string, string[]>();
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const ts = (cutsBySeg.get(i) ?? [])
        // Defensive: only finite, strictly interior params may mint a split
        // point (crossParam already guarantees this; a NaN here would mint
        // NaN geometry and inflate baseCrossingsSplit).
        .filter((t) => Number.isFinite(t) && t > 0 && t < 1)
        .sort((a, b) => a - b)
        .filter((t, k, arr) => k === 0 || t - arr[k - 1] > 1e-6);
      const stops: Array<{ t: number; id: string }> = [{ t: 0, id: pfx + s.line.aId }];
      ts.forEach((t, k) => {
        const P: RoofPoint = {
          id: `${pfx}${s.line.id}@x${k + 1}`,
          x: s.a.x + t * (s.b.x - s.a.x),
          y: s.a.y + t * (s.b.y - s.a.y),
          z: s.a.z + t * (s.b.z - s.a.z) - zDatum,
        };
        model.points.push(P);
        stops.push({ t, id: P.id });
      });
      stops.push({ t: 1, id: pfx + s.line.bId });
      report.baseCrossingsSplit = (report.baseCrossingsSplit ?? 0) + ts.length;
      const minted: string[] = [];
      for (let k = 0; k + 1 < stops.length; k++) {
        const id = k === 0 ? pfx + s.line.id : `${pfx}${s.line.id}#${k + 1}`;
        model.lines.push({
          ...s.line,
          id,
          aId: stops[k].id,
          bId: stops[k + 1].id,
          lengthFt: s.line.lengthFt * (stops[k + 1].t - stops[k].t),
        });
        minted.push(id);
        report.linesAdded++;
      }
      mintedByEvLine.set(s.line.id, minted);
      if (STRUCTURAL_TYPES.has(s.line.type)) {
        // Later clusters may not cross THIS cluster either.
        for (let k = 0; k + 1 < stops.length; k++) {
          structural.push({
            a: {
              x: s.a.x + stops[k].t * (s.b.x - s.a.x),
              y: s.a.y + stops[k].t * (s.b.y - s.a.y),
            },
            b: {
              x: s.a.x + stops[k + 1].t * (s.b.x - s.a.x),
              y: s.a.y + stops[k + 1].t * (s.b.y - s.a.y),
            },
          });
        }
      }
    }
    let addedAreaSqft = 0;
    for (const m of members) {
      model.faces.push({
        ...m.face,
        id: pfx + m.face.id,
        lineIds: m.face.lineIds.flatMap((id) => mintedByEvLine.get(id) ?? [pfx + id]),
      });
      addedAreaSqft += m.face.areaSqft;
      report.facetsAdded++;
      hostAttribution.push({
        overlayFaceId: pfx + m.face.id,
        hostFaceId: hostId,
        planSqft: m.planArea,
        hostPitchFactor: slopeFactor(host.face.pitch),
      });
    }

    // Keep the totals honest: the cluster's plan sat inside the host's figure.
    const hostFace = model.faces.find((f) => f.id === hostId);
    let transferred = totalArea * slopeFactor(host.face.pitch);
    if (hostFace) {
      transferred = Math.min(transferred, Math.max(0, hostFace.areaSqft - 1));
      hostFace.areaSqft -= transferred;
    }
    report.areaTransferredSqft += transferred;
    model.totals.areaSqft += addedAreaSqft - transferred;
    report.grafted++;
  }

  if (report.grafted > 0) {
    model.totals.squares = model.totals.areaSqft / 100;
    model.totals.facetCount = model.faces.length;
    const b = model.totals.bounds;
    for (const p of model.points) {
      if (p.x < b.minX) b.minX = p.x;
      if (p.x > b.maxX) b.maxX = p.x;
      if (p.y < b.minY) b.minY = p.y;
      if (p.y > b.maxY) b.maxY = p.y;
      if (p.z < b.minZ) b.minZ = p.z;
      if (p.z > b.maxZ) b.maxZ = p.z;
    }
  }
  return { model, report };
}

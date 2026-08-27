// Phase 4 — the skeleton guessed the topology, the DSM corrects it.
//
// The straight skeleton assumes an equal-pitch hip roof: every outline edge
// grows a facet, every end gets a hip. Real houses are gabled and multi-mass,
// and the owner's traces over the orthos showed exactly that: our outer
// contour is right, our interior lines are the skeleton's assumption. The
// measurement (step 1, 2026-08-27) confirmed the signature per facet: a hip
// end facet on a real gable drains WITH its side neighbour (12629 B6/B3:
// skeleton says 1°/181°, the DSM says 87°/90° at p50 0.07–0.19 ft), and
// adjacent facets of one real slope share a DSM azimuth.
//
// This module rebuilds each measured structure's interior from the clusters:
//
//   cluster   = adjacent facets whose DSM planes agree in azimuth and pitch —
//               one REAL slope the skeleton carved up
//   gable     = a cluster member whose own skeleton azimuth disagrees with the
//               cluster (≥ GABLE_MIN_DEG): its eave stops anchoring a plane,
//               its region is covered by the side slopes, the end edge becomes
//               a rake
//   surface   = the LOWER ENVELOPE of the surviving eave-anchored planes over
//               the outline. Ridges/hips/valleys are then plane intersections
//               BY CONSTRUCTION — no post-hoc welding of guessed lines — and
//               the envelope tiles the outline exactly, which the checks
//               assert per structure (Euler = 1, tiling < 0.5 %).
//
// Planes stay anchored to their eave lines at eave height with the measured
// pitch — NOT the raw fitted DSM planes. A fitted plane never passes exactly
// through a level eave, and adopting it would un-level every eave and break
// planarity at the outline (R03/R04). The DSM decides WHICH facets share a
// plane and HOW STEEP it is; the eave decides where it sits.
//
// A structure the refinement cannot solve honestly — a donor plane whose
// envelope region vanishes, a tiling gap, an Euler break — is LEFT AS THE
// SKELETON BUILT IT and the reason is reported (mergeReport.stopped). Stop and
// show, never bend.

import type { EvLineType, RoofFace, RoofLine, RoofModel, RoofPoint } from "@/lib/eagleview";
import { DSM_NOISE_FLOOR_FT, MIN_TRUSTED_SQFT, type PitchMeasurement } from "@/lib/roofRecon/pitchFromDsm";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";

/**
 * Facets whose DSM azimuths differ by at most this belong to one slope.
 * Category: absolute tolerance on an angle. From the step-1 measurement, not
 * assigned: across the four measurable houses, same-slope pairs disagreed by
 * at most 19° (12621 A6→B6) while distinct slopes sat at 42° and beyond —
 * roof azimuth families are 90° apart, so the gap is structural.
 */
export const CLUSTER_AZ_TOL_DEG = 20;
/**
 * A member whose own skeleton azimuth disagrees with its cluster by at least
 * this is a converted end — a gable candidate. Measured: real gable ends read
 * 80–98° (the side family is a quarter turn away); noisy same-slope members
 * stayed ≤ 28°. Halfway between the families (45°) would also do; 60 keeps a
 * conservative margin toward "leave it a hip".
 */
export const GABLE_MIN_DEG = 60;
/** Level-vs-sloped for line classification — the validators' own figure. */
const LEVEL_SLOPE = 0.02;
/** Sliver faces below this are arrangement dust, sq ft. */
const SLIVER_SQFT = 0.05;
/** Plan-coordinate weld quantum, ft — the validators' own point quantum. */
const Q = 1e-3;

const azDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

interface Plane {
  /** z = z0 + slope · ((p − anchor) · n) */
  anchor: FootprintPoint;
  n: FootprintPoint; //   unit, pointing up-slope (into the polygon)
  dir: FootprintPoint; // unit along the eave line
  /**
   * The eave STRIP along `dir`: the plane competes only for tmin ≤ t ≤ tmax.
   * A half-plane domain extends the eave's INFINITE line through the far wing
   * of an L, where its z≈0 wins the minimum and cuts a cliff into a foreign
   * slope (measured: 116 double-height points along one extended eave line on
   * 12621). The real grassfire grows radially past a segment's end; capping
   * the strip at the segment's span is the planar version of that.
   */
  tmin: number;
  tmax: number;
  slope: number; //       rise per ft of run
  z0: number;
  clusterId: number;
  pitch12: number;
}

const inDomain = (pl: Plane, x: number, y: number): boolean => {
  const dxp = x - pl.anchor.x;
  const dyp = y - pl.anchor.y;
  if (dxp * pl.n.x + dyp * pl.n.y < -1e-7) return false;
  const t = dxp * pl.dir.x + dyp * pl.dir.y;
  return t >= pl.tmin - 1e-7 && t <= pl.tmax + 1e-7;
};

const planeZ = (pl: Plane, x: number, y: number): number =>
  pl.z0 + pl.slope * ((x - pl.anchor.x) * pl.n.x + (y - pl.anchor.y) * pl.n.y);

export interface StructureMergeReport {
  prefix: string;
  source: "dsm-cluster" | "none";
  /** Multi-facet clusters dissolved into one slope each. */
  merges: Array<{ cluster: string[]; pitch12: number }>;
  /** Facets converted hip-end → part of the side slope (their eave became a rake). */
  gables: string[];
  facetsBefore: number;
  facetsAfter: number;
  /** Set when refinement was refused and the skeleton kept — the reason, verbatim. */
  stopped?: string;
}

export interface RefineInput {
  model: RoofModel;
  measurement: PitchMeasurement;
  /** usable-structure index → registered (structures without one keep the skeleton). */
  registeredStructures: Set<number>;
  /** The whole-structure pitch (consistency-gated) — the fallback plane pitch. */
  structurePitch12: number;
  /**
   * usable-structure index → its regularised contour (the ring the skeleton
   * grew from). The outline is taken from here, not re-chained out of the
   * model's single-owner edges — chaining picked a wrong continuation at a
   * coincident corner on the 12621 wedge and produced a bowtie whose
   * triangulation spilled outside the building.
   */
  structureRings: Map<number, FootprintPoint[]>;
  /** Diagnostics only: receives every structure's winner regions and planes. */
  debugSink?: (info: {
    prefix: string;
    outline: FootprintPoint[];
    wedges: Array<{ label: string; pitch12: number; anchor: FootprintPoint; n: FootprintPoint; dir: FootprintPoint; tmin: number; tmax: number }>;
    regions: Array<{ wedge: number; ring: FootprintPoint[] }>;
    stopped?: string;
  }) => void;
}

export interface RefineResult {
  model: RoofModel;
  report: StructureMergeReport[];
  /** True when at least one structure was actually rebuilt. */
  changed: boolean;
}

interface FaceInfo {
  face: RoofFace;
  si: number;
  label: string;
  ring: Array<{ x: number; y: number; z: number }>;
  plan: FootprintPoint[];
  planArea: number;
  skelAz: number;
  dsmAz: number | null;
  dsmPitch: number | null;
  trusted: boolean;
}

const structIdx = (rawId: string): number => {
  const m = /^s(\d+):/.exec(rawId);
  return m ? Number(m[1]) : 0;
};

export function refineModelWithClusters(input: RefineInput): RefineResult {
  const { model, measurement } = input;
  const byLabel = new Map(measurement.facets.map((f) => [f.id, f]));
  const pointsById = new Map(model.points.map((p) => [p.id, p]));
  const linesById = new Map(model.lines.map((l) => [l.id, l]));

  // ── face info ──
  const infos: FaceInfo[] = [];
  for (const f of model.faces) {
    const ring: Array<{ x: number; y: number; z: number }> = [];
    // walk the face ring through its lines (they are stored in ring order)
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
    for (const pid of ids) {
      const p = pointsById.get(pid);
      if (p) ring.push({ x: p.x, y: p.y, z: p.z });
    }
    if (ring.length < 3) continue;
    const plan = ring.map((p) => ({ x: p.x, y: p.y }));
    // skeleton azimuth from the face's own plane (normal equations, tiny n)
    let sa = 0, sb = 0;
    {
      let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
      const n = ring.length;
      for (const p of ring) { sx += p.x; sy += p.y; sz += p.z; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y; sxz += p.x * p.z; syz += p.y * p.z; }
      const d = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx);
      if (Math.abs(d) > 1e-9) {
        sa = (sxz * (syy * n - sy * sy) - sxy * (syz * n - sy * sz) + sx * (syz * sy - syy * sz)) / d;
        sb = (sxx * (syz * n - sz * sy) - sxz * (sxy * n - sx * sy) + sx * (sxy * sz - syz * sx)) / d;
      }
    }
    const label = String(f.designator || f.id);
    const m = byLabel.get(label);
    infos.push({
      face: f,
      si: structIdx(String(f.id)),
      label,
      ring,
      plan,
      planArea: areaOf(plan),
      skelAz: ((Math.atan2(-sa, -sb) * 180) / Math.PI + 360) % 360,
      dsmAz: m ? m.azimuthDeg : null,
      dsmPitch: m ? m.pitch12 : null,
      trusted: !!m && m.residualP50Ft <= DSM_NOISE_FLOOR_FT,
    });
  }

  // adjacency by shared line ids
  const owners = new Map<string, FaceInfo[]>();
  for (const fi of infos) for (const lid of fi.face.lineIds) {
    const arr = owners.get(lid) ?? [];
    arr.push(fi);
    owners.set(lid, arr);
  }
  const adj = new Map<FaceInfo, Set<FaceInfo>>();
  for (const arr of owners.values()) for (const a of arr) for (const b of arr) {
    if (a === b) continue;
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  }

  const structures = [...new Set(infos.map((fi) => fi.si))].sort((a, b) => a - b);
  const reports: StructureMergeReport[] = [];
  const keptFaces: Array<{ ring: Array<{ x: number; y: number; z: number }>; pitch12: number; orientation: number; onOutline: (a: FootprintPoint, b: FootprintPoint) => boolean }> = [];
  let changed = false;

  for (const si of structures) {
    const members = infos.filter((fi) => fi.si === si);
    const prefix = String.fromCharCode(65 + si);
    const rep: StructureMergeReport = { prefix, source: "none", merges: [], gables: [], facetsBefore: members.length, facetsAfter: members.length };
    reports.push(rep);

    const measurable = input.registeredStructures.has(si) && members.some((m) => m.dsmAz != null);
    const contour = input.structureRings.get(si) ?? null;
    const outlineSegs: Array<[FootprintPoint, FootprintPoint]> = contour
      ? contour.map((pp, i) => [pp, contour[(i + 1) % contour.length]] as [FootprintPoint, FootprintPoint])
      : [];
    const onOutline = (a: FootprintPoint, b: FootprintPoint): boolean => {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      for (const [p, q] of outlineSegs) {
        const dx = q.x - p.x, dy = q.y - p.y;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1e-12) continue;
        const t = ((mid.x - p.x) * dx + (mid.y - p.y) * dy) / l2;
        if (t < -0.01 || t > 1.01) continue;
        const px = p.x + t * dx, py = p.y + t * dy;
        if (Math.hypot(mid.x - px, mid.y - py) < 0.05) return true;
      }
      return false;
    };

    const keepSkeleton = (why?: string) => {
      if (why) rep.stopped = why;
      for (const m of members) {
        keptFaces.push({ ring: m.ring, pitch12: m.face.pitch, orientation: m.face.orientation, onOutline });
      }
    };

    if (!measurable || !contour || contour.length < 3) {
      keepSkeleton();
      continue;
    }

    // ── clustering: adjacency + azimuth + pitch (the step-1 rule) ──
    const cluster = new Map<FaceInfo, number>();
    let cid = 0;
    for (const m of members) {
      if (m.dsmAz == null || cluster.has(m)) continue;
      cid++;
      const stack = [m];
      cluster.set(m, cid);
      while (stack.length) {
        const cur = stack.pop()!;
        for (const nb of adj.get(cur) ?? []) {
          if (nb.si !== si || nb.dsmAz == null || cluster.has(nb)) continue;
          if (azDiff(cur.dsmAz!, nb.dsmAz) <= CLUSTER_AZ_TOL_DEG && Math.abs((cur.dsmPitch ?? 0) - (nb.dsmPitch ?? 0)) <= 0.75) {
            cluster.set(nb, cid);
            stack.push(nb);
          }
        }
      }
    }
    // unmeasured facets follow the neighbouring cluster whose plane fits their
    // current geometry best — the cluster decides their fate, not their own
    // azimuth (a 15 sq ft sliver has no azimuth worth trusting).
    for (const m of members) {
      if (cluster.has(m)) continue;
      let best: { c: number; err: number } | null = null;
      for (const nb of adj.get(m) ?? []) {
        const c = cluster.get(nb);
        if (c == null) continue;
        const err = m.ring.reduce((s, p) => s + Math.abs(p.z - nb.ring[0].z), 0);
        if (!best || err < best.err) best = { c, err };
      }
      if (best) cluster.set(m, best.c);
    }
    if (![...cluster.values()].length) { keepSkeleton(); continue; }

    const clusterMembers = new Map<number, FaceInfo[]>();
    for (const [fi, c] of cluster) {
      const arr = clusterMembers.get(c) ?? [];
      arr.push(fi);
      clusterMembers.set(c, arr);
    }
    // reattach: a facet with the gable SIGNATURE (its own skeleton azimuth
    // fights its measured azimuth) whose cluster would be left with no eave
    // donor joins the adjacent cluster its DSM azimuth agrees with — the end
    // triangle of a real gable physically lies on the side slope, so azimuth
    // adjacency, not skeleton adjacency, decides where it belongs.
    const clusterMeanAz = (arr: FaceInfo[]): number | null => {
      const az = arr.filter((f) => f.dsmAz != null);
      if (!az.length) return null;
      const a =
        (Math.atan2(
          az.reduce((s2, f) => s2 + Math.sin((f.dsmAz! * Math.PI) / 180) * f.planArea, 0),
          az.reduce((s2, f) => s2 + Math.cos((f.dsmAz! * Math.PI) / 180) * f.planArea, 0),
        ) *
          180) /
        Math.PI;
      return ((a % 360) + 360) % 360;
    };
    for (const m of members) {
      const c = cluster.get(m);
      if (c == null || m.dsmAz == null) continue;
      const own = clusterMembers.get(c) ?? [];
      const wouldConvert = azDiff(m.skelAz, m.dsmAz) >= GABLE_MIN_DEG;
      const donorsLeft = own.filter((f) => f !== m && azDiff(f.skelAz, clusterMeanAz(own) ?? f.skelAz) < GABLE_MIN_DEG).length;
      if (!wouldConvert || donorsLeft > 0) continue;
      for (const nb of adj.get(m) ?? []) {
        const c2 = cluster.get(nb);
        if (c2 == null || c2 === c) continue;
        const mean2 = clusterMeanAz(clusterMembers.get(c2) ?? []);
        if (mean2 == null || azDiff(m.dsmAz, mean2) > CLUSTER_AZ_TOL_DEG) continue;
        cluster.set(m, c2);
        clusterMembers.set(c, own.filter((f) => f !== m));
        clusterMembers.get(c2)!.push(m);
        if (!clusterMembers.get(c)!.length) clusterMembers.delete(c);
        break;
      }
    }

    const multi = [...clusterMembers.values()].filter((arr) => arr.length > 1);
    // gable conversions: a member whose own skeleton azimuth fights the cluster
    const gableOf = new Map<FaceInfo, number>();
    for (const [c, arr] of clusterMembers) {
      const meanAz = clusterMeanAz(arr);
      if (meanAz == null) continue;
      const converted = arr.filter((f) => azDiff(f.skelAz, meanAz) >= GABLE_MIN_DEG);
      // a slope must keep at least one eave donor; a cluster that would lose
      // them all keeps its members un-converted (an honest hip, noted)
      if (converted.length === arr.length) continue;
      for (const f of converted) gableOf.set(f, c);
    }
    if (!multi.length && !gableOf.size) { keepSkeleton(); continue; }

    // ── plane groups: the merge unit ──
    // A cluster may span eaves on DIFFERENT supporting lines (a jogged wall):
    // those are physically parallel-but-offset planes and must stay separate
    // faces. The unit of merging is therefore the PLANE GROUP — the member
    // facets whose eaves share one supporting line — plus the gable-converted
    // facets attached to the adjacent group of their cluster.
    const eaveZs: number[] = [];
    for (const m of members) for (let i = 0; i < m.ring.length; i++) {
      const a = m.ring[i], b = m.ring[(i + 1) % m.ring.length];
      if (!onOutline({ x: a.x, y: a.y }, { x: b.x, y: b.y })) continue;
      if (Math.abs(a.z - b.z) <= Math.max(0.08, LEVEL_SLOPE * Math.hypot(b.x - a.x, b.y - a.y))) eaveZs.push(a.z, b.z);
    }
    eaveZs.sort((x, y) => x - y);
    const z0 = eaveZs.length ? eaveZs[Math.floor(eaveZs.length / 2)] : 0;
    const outlineRing: FootprintPoint[] = contour.slice();
    const outlineArea = Math.abs(areaOf(outlineRing));
    const inward = areaOf(outlineRing) > 0 ? 1 : -1;

    interface Group { plane: Plane; faces: FaceInfo[]; clusterId: number }
    const groups: Group[] = [];
    let anchorFail: string | null = null;
    for (const [c, arr] of clusterMembers) {
      const donors = arr.filter((f) => !gableOf.has(f));
      const tr = arr.filter((f) => f.trusted && f.dsmPitch != null);
      const trArea = tr.reduce((s2, f) => s2 + f.planArea, 0);
      const pitch12 = trArea >= MIN_TRUSTED_SQFT ? tr.reduce((s2, f) => s2 + f.dsmPitch! * f.planArea, 0) / trArea : input.structurePitch12;
      const local: Array<{ anchor: FootprintPoint; dir: FootprintPoint; n: FootprintPoint; faces: FaceInfo[]; tmin: number; tmax: number }> = [];
      for (const f of donors) {
        let assigned = false;
        for (let i = 0; i < f.ring.length; i++) {
          const a = f.ring[i], b = f.ring[(i + 1) % f.ring.length];
          const pa = { x: a.x, y: a.y }, pb = { x: b.x, y: b.y };
          if (!onOutline(pa, pb)) continue;
          if (Math.abs(a.z - b.z) > Math.max(0.08, LEVEL_SLOPE * Math.hypot(b.x - a.x, b.y - a.y))) continue;
          const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
          if (len < 0.5) continue;
          let dir = { x: (pb.x - pa.x) / len, y: (pb.y - pa.y) / len };
          let n = { x: -dir.y * inward, y: dir.x * inward };
          // face rings carry no orientation contract: the plane must ASCEND
          // toward its own facet, so point n at the donor's centroid (A1 on
          // 12621 tilted the other way and its low plane swallowed the roof).
          const cxf = f.plan.reduce((s2, pp) => s2 + pp.x, 0) / f.plan.length;
          const cyf = f.plan.reduce((s2, pp) => s2 + pp.y, 0) / f.plan.length;
          if ((cxf - pa.x) * n.x + (cyf - pa.y) * n.y < 0) {
            dir = { x: -dir.x, y: -dir.y };
            n = { x: -n.x, y: -n.y };
          }
          let g = local.find(
            (gr) =>
              Math.abs(gr.dir.x * dir.y - gr.dir.y * dir.x) < 0.02 &&
              Math.abs((pa.x - gr.anchor.x) * gr.n.x + (pa.y - gr.anchor.y) * gr.n.y) < 0.5,
          );
          if (!g) {
            g = { anchor: pa, dir, n, faces: [], tmin: Infinity, tmax: -Infinity };
            local.push(g);
          }
          for (const ep of [pa, pb]) {
            const t = (ep.x - g.anchor.x) * g.dir.x + (ep.y - g.anchor.y) * g.dir.y;
            g.tmin = Math.min(g.tmin, t);
            g.tmax = Math.max(g.tmax, t);
          }
          if (!g.faces.includes(f)) g.faces.push(f);
          assigned = true;
        }
        if (!assigned) anchorFail = `facet ${f.label} donates no level outline edge to anchor a plane on`;
      }
      if (!donors.length && arr.length) anchorFail = `cluster ${arr.map((f) => f.label).join("+")} is all gable-converted — nothing anchors its plane`;
      for (const g of local) {
        // Cap the strip where the eave's SUPPORTING LINE leaves the building
        // silhouette, not at the segment's own ends: a jogged wall splits one
        // physical eave into segments, and capping at a segment end plants a
        // seam mid-roof (measured: 0.4–1.9 ft height steps at such caps). The
        // connected on-outline interval containing the eave is the honest
        // extent; beyond the silhouette the far wing stays protected.
        let lo = g.tmin;
        let hi = g.tmax;
        {
          const ts: number[] = [];
          for (const [a2, b2] of outlineSegs) {
            // intersect the supporting line (anchor + t·dir) with segment a2–b2
            const ex = b2.x - a2.x, ey = b2.y - a2.y;
            const den = g.dir.x * ey - g.dir.y * ex;
            if (Math.abs(den) < 1e-9) continue;
            const u = ((a2.x - g.anchor.x) * ey - (a2.y - g.anchor.y) * ex) / den;
            const v = ((a2.x - g.anchor.x) * g.dir.y - (a2.y - g.anchor.y) * g.dir.x) / -den;
            if (v < -1e-9 || v > 1 + 1e-9) continue;
            ts.push(u);
          }
          ts.sort((x, y) => x - y);
          // dedupe crossings THROUGH outline vertices (each contributes twice)
          const uniq2: number[] = [];
          for (const t of ts) if (!uniq2.length || t - uniq2[uniq2.length - 1] > 1e-6) uniq2.push(t);
          // choose the INSIDE interval that contains the eave's own span, by
          // testing each interval's midpoint against the outline polygon —
          // parameter parity alone mispairs at vertex crossings
          const inPoly = (px2: number, py2: number): boolean => {
            let hit = false;
            const r = outlineRing;
            for (let i2 = 0, j3 = r.length - 1; i2 < r.length; j3 = i2++) {
              if (r[i2].y > py2 !== r[j3].y > py2 && px2 < ((r[j3].x - r[i2].x) * (py2 - r[i2].y)) / (r[j3].y - r[i2].y) + r[i2].x) hit = !hit;
            }
            return hit;
          };
          const mid0 = (g.tmin + g.tmax) / 2;
          for (let i2 = 0; i2 + 1 < uniq2.length; i2++) {
            if (uniq2[i2] > mid0 || uniq2[i2 + 1] < mid0) continue;
            const tm = (uniq2[i2] + uniq2[i2 + 1]) / 2;
            const px2 = g.anchor.x + tm * g.dir.x + 0.05 * g.n.x;
            const py2 = g.anchor.y + tm * g.dir.y + 0.05 * g.n.y;
            if (!inPoly(px2, py2)) continue;
            lo = Math.min(uniq2[i2], g.tmin);
            hi = Math.max(uniq2[i2 + 1], g.tmax);
            break;
          }
        }
        groups.push({
          plane: { anchor: g.anchor, n: g.n, dir: g.dir, tmin: lo, tmax: hi, slope: pitch12 / 12, z0, clusterId: c, pitch12 },
          faces: g.faces,
          clusterId: c,
        });
      }
    }
    if (anchorFail) { keepSkeleton(anchorFail); continue; }
    // attach gable-converted and unmeasured leftovers to the adjacent group of
    // their cluster with the longest shared boundary — the cluster decides
    // their fate, not their own azimuth.
    const faceGroup = new Map<FaceInfo, Group>();
    for (const g of groups) for (const f of g.faces) faceGroup.set(f, g);
    let attachFail: string | null = null;
    for (const m of members) {
      if (faceGroup.has(m)) continue;
      const c = cluster.get(m);
      let best: { g: Group; len: number } | null = null;
      for (const nb of adj.get(m) ?? []) {
        const g = faceGroup.get(nb);
        if (!g) continue;
        if (c != null && g.clusterId !== c && gableOf.has(m)) continue;
        // shared boundary length between m and nb
        let shared = 0;
        for (let i = 0; i < m.plan.length; i++) {
          const a = m.plan[i], b = m.plan[(i + 1) % m.plan.length];
          for (let j2 = 0; j2 < nb.plan.length; j2++) {
            const c2 = nb.plan[j2], d2 = nb.plan[(j2 + 1) % nb.plan.length];
            if ((Math.hypot(a.x - c2.x, a.y - c2.y) < 0.05 && Math.hypot(b.x - d2.x, b.y - d2.y) < 0.05) ||
                (Math.hypot(a.x - d2.x, a.y - d2.y) < 0.05 && Math.hypot(b.x - c2.x, b.y - c2.y) < 0.05)) {
              shared += Math.hypot(b.x - a.x, b.y - a.y);
            }
          }
        }
        if (shared > 0 && (!best || shared > best.len)) best = { g, len: shared };
      }
      if (!best) { attachFail = `facet ${m.label} has no adjacent group to join`; break; }
      best.g.faces.push(m);
      faceGroup.set(m, best.g);
    }
    if (attachFail) { keepSkeleton(attachFail); continue; }
    if (groups.length < 2) { keepSkeleton("fewer than two planes survive — nothing to intersect"); continue; }

    // ── the exact construction ──
    // A face's plane is valid only on ITS side of its own eave (the domain
    // half-plane): that is what makes the minimum-height rule the roof and
    // not the global plane envelope, whose far-side planes dive below eave
    // level and steal foreign wings (measured: every structure STOPPED under
    // the global envelope).  The surface is:
    //
    //     roof(p) = min { z_i(p) : p ∈ domain_i }
    //
    // computed EXACTLY: triangulate the outline, split every piece by every
    // pairwise bisector line (z_i = z_j) and every domain boundary, pick each
    // piece's winner, and union the pieces per winner.  Ridges, hips, valleys
    // and rakes then ARE plane intersections by construction — including the
    // four-plane meetings that honestly resolve into two junctions and a
    // short connector, which vertex relocation could never express (that is
    // what tore 12621's north corner apart in the previous attempt).
    interface Wedge { faces: FaceInfo[]; plane: Plane }
    const wedges: Wedge[] = groups.map((g) => ({ faces: g.faces, plane: g.plane }));

    // triangulate the outline (ear clipping; outlineRing is simple)
    const tri: FootprintPoint[][] = [];
    {
      const ring = areaOf(outlineRing) > 0 ? outlineRing.slice() : [...outlineRing].reverse();
      const cross = (o: FootprintPoint, a: FootprintPoint, b: FootprintPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const inTri = (pp: FootprintPoint, a: FootprintPoint, b: FootprintPoint, c: FootprintPoint) =>
        cross(a, b, pp) >= -1e-9 && cross(b, c, pp) >= -1e-9 && cross(c, a, pp) >= -1e-9;
      const idxs = ring.map((_, i) => i);
      let guard = ring.length * ring.length + 10;
      while (idxs.length > 3 && guard-- > 0) {
        let clipped = false;
        for (let k = 0; k < idxs.length; k++) {
          const i0 = idxs[(k - 1 + idxs.length) % idxs.length];
          const i1 = idxs[k];
          const i2 = idxs[(k + 1) % idxs.length];
          const a = ring[i0], b = ring[i1], c = ring[i2];
          if (cross(a, b, c) <= 1e-9) continue;
          let ear = true;
          for (const j2 of idxs) {
            if (j2 === i0 || j2 === i1 || j2 === i2) continue;
            if (inTri(ring[j2], a, b, c)) { ear = false; break; }
          }
          if (!ear) continue;
          tri.push([a, b, c]);
          idxs.splice(k, 1);
          clipped = true;
          break;
        }
        if (!clipped) break;
      }
      if (idxs.length === 3) tri.push([ring[idxs[0]], ring[idxs[1]], ring[idxs[2]]]);
      const triArea = tri.reduce((s2, t) => s2 + Math.abs(areaOf(t)), 0);
      if (Math.abs(triArea - outlineArea) / outlineArea > 0.005) { keepSkeleton("outline triangulation failed"); continue; }
    }

    // split every convex piece by every line, in one global order
    type Line = { a: number; b: number; c: number }; // a·x + b·y + c = 0
    const lines2: Line[] = [];
    for (let i = 0; i < wedges.length; i++) {
      const pl = wedges[i].plane;
      // domain boundaries: the eave line and the strip's two lateral caps
      lines2.push({ a: pl.n.x, b: pl.n.y, c: -(pl.anchor.x * pl.n.x + pl.anchor.y * pl.n.y) });
      const d0 = pl.anchor.x * pl.dir.x + pl.anchor.y * pl.dir.y;
      lines2.push({ a: pl.dir.x, b: pl.dir.y, c: -(d0 + pl.tmin) });
      lines2.push({ a: pl.dir.x, b: pl.dir.y, c: -(d0 + pl.tmax) });
      for (let j2 = i + 1; j2 < wedges.length; j2++) {
        const p2 = wedges[j2].plane;
        const ax = pl.slope * pl.n.x - p2.slope * p2.n.x;
        const ay = pl.slope * pl.n.y - p2.slope * p2.n.y;
        const cc =
          pl.z0 + pl.slope * -(pl.anchor.x * pl.n.x + pl.anchor.y * pl.n.y) -
          (p2.z0 + p2.slope * -(p2.anchor.x * p2.n.x + p2.anchor.y * p2.n.y));
        if (Math.hypot(ax, ay) > 1e-7) lines2.push({ a: ax, b: ay, c: cc });
      }
    }
    let pieces: FootprintPoint[][] = tri;
    for (const ln of lines2) {
      const next: FootprintPoint[][] = [];
      for (const piece of pieces) {
        const side = piece.map((pp) => ln.a * pp.x + ln.b * pp.y + ln.c);
        const hasPos = side.some((v) => v > 1e-7);
        const hasNeg = side.some((v) => v < -1e-7);
        if (!hasPos || !hasNeg) { next.push(piece); continue; }
        const pos: FootprintPoint[] = [];
        const neg: FootprintPoint[] = [];
        for (let i = 0; i < piece.length; i++) {
          const a = piece[i], b = piece[(i + 1) % piece.length];
          const sa = side[i], sb = side[(i + 1) % piece.length];
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

    // T-vertex healing across ALL pieces: a split line that ends ON a piece
    // boundary subdivides one side and not the other; insert every vertex into
    // every edge it lies on, so shared boundaries carry identical point sets
    // and the directed-edge cancellation can weld them.
    {
      const verts: FootprintPoint[] = [];
      const seenV = new Set<string>();
      const vk = (pp: FootprintPoint) => `${Math.round(pp.x / Q)}|${Math.round(pp.y / Q)}`;
      for (const piece of pieces) for (const pp of piece) {
        const k = vk(pp);
        if (!seenV.has(k)) { seenV.add(k); verts.push(pp); }
      }
      pieces = pieces.map((piece) => {
        const grown: FootprintPoint[] = [];
        for (let i = 0; i < piece.length; i++) {
          const a = piece[i], b = piece[(i + 1) % piece.length];
          grown.push(a);
          const dx = b.x - a.x, dy = b.y - a.y;
          const len2 = dx * dx + dy * dy;
          if (len2 < 1e-12) continue;
          const hits: Array<{ t: number; p: FootprintPoint }> = [];
          for (const v of verts) {
            const t = ((v.x - a.x) * dx + (v.y - a.y) * dy) / len2;
            if (t <= 1e-6 || t >= 1 - 1e-6) continue;
            const px2 = a.x + t * dx, py2 = a.y + t * dy;
            if (Math.hypot(v.x - px2, v.y - py2) < 5e-4) hits.push({ t, p: v });
          }
          hits.sort((x, y) => x.t - y.t);
          for (const h of hits) grown.push(h.p);
        }
        return grown;
      });
    }

    // winner per piece
    const winnerPieces = new Map<number, FootprintPoint[][]>();
    let uncovered = 0;
    for (const piece of pieces) {
      const cx = piece.reduce((s2, pp) => s2 + pp.x, 0) / piece.length;
      const cy = piece.reduce((s2, pp) => s2 + pp.y, 0) / piece.length;
      let best = -1;
      let bestZ = Infinity;
      for (let i = 0; i < wedges.length; i++) {
        const pl = wedges[i].plane;
        if (!inDomain(pl, cx, cy)) continue;
        const z = planeZ(pl, cx, cy);
        if (z < bestZ) { bestZ = z; best = i; }
      }
      if (best < 0) { uncovered += Math.abs(areaOf(piece)); continue; }
      const arr = winnerPieces.get(best) ?? [];
      arr.push(piece);
      winnerPieces.set(best, arr);
    }
    if (uncovered / outlineArea > 0.005) { keepSkeleton(`${uncovered.toFixed(0)} sq ft of the outline is on no slope's domain`); continue; }
    // every eave-donating slope must survive with a region — a slope whose
    // intersections squeezed it to nothing means the clustering lied
    const gone = wedges.filter((_, i) => !winnerPieces.has(i));
    if (gone.length) {
      keepSkeleton(`slope of ${gone.map((w) => w.faces.map((f) => f.label).join("+")).join(" and ")} has no region — its plane intersections left the roof`);
      continue;
    }

    // union each winner's pieces (directed-edge cancellation; splits share
    // coordinates because every piece was cut by the same global line list)
    const qk = (pp: FootprintPoint) => `${Math.round(pp.x / Q)}|${Math.round(pp.y / Q)}`;
    interface NewFace { wedge: Wedge; ring: FootprintPoint[] }
    const newFaces: NewFace[] = [];
    let unionFail: string | null = null;
    for (const [wi, arr] of winnerPieces) {
      const dirEdges = new Map<string, [FootprintPoint, FootprintPoint]>();
      for (const piece of arr) {
        const r = areaOf(piece) >= 0 ? piece : [...piece].reverse();
        for (let i = 0; i < r.length; i++) {
          const a = r[i], b = r[(i + 1) % r.length];
          if (Math.hypot(b.x - a.x, b.y - a.y) <= Q) continue;
          const fw = `${qk(a)}>${qk(b)}`;
          const bw = `${qk(b)}>${qk(a)}`;
          if (dirEdges.has(bw)) dirEdges.delete(bw);
          else dirEdges.set(fw, [a, b]);
        }
      }
      const edges = [...dirEdges.values()];
      let guard = edges.length + 4;
      while (edges.length && guard-- > 0) {
        const ring: FootprintPoint[] = [edges[0][0], edges[0][1]];
        edges.shift();
        let g2 = edges.length * 2 + 4;
        while (edges.length && g2-- > 0) {
          const endK = qk(ring[ring.length - 1]);
          if (qk(ring[0]) === endK) break;
          const i2 = edges.findIndex(([a]) => qk(a) === endK);
          if (i2 < 0) break;
          ring.push(edges.splice(i2, 1)[0][1]);
        }
        if (ring.length > 1 && qk(ring[0]) === qk(ring[ring.length - 1])) ring.pop();
        else if (ring.length > 1) { unionFail = `region of ${wedges[wi].faces.map((f) => f.label).join("+")} left an open chain`; break; }
        // NOTE: collinear subdivision points are kept deliberately. Slimming a
        // ring on its own deletes vertices its neighbour still carries, the
        // shared edges stop welding at assembly, and the footage doubles while
        // Euler collapses (measured: −11 on the first attempt). Extra
        // collinear vertices are harmless; unshared edges are not.
        if (ring.length >= 3 && Math.abs(areaOf(ring)) > SLIVER_SQFT) newFaces.push({ wedge: wedges[wi], ring });
      }
      if (edges.length) { unionFail = `region of ${wedges[wi].faces.map((f) => f.label).join("+")} did not chain into rings`; break; }
    }
    if (unionFail) { keepSkeleton(unionFail); continue; }
    {
      const tiled = newFaces.reduce((s2, f) => s2 + Math.abs(areaOf(f.ring)), 0);
      const pct = (Math.abs(tiled - outlineArea) / outlineArea) * 100;
      if (pct >= 0.5) { keepSkeleton(`arrangement tiling off by ${pct.toFixed(2)}%`); continue; }
      // a roof surface is a function of plan: one height per plan point. Two
      // faces disagreeing at a shared vertex is a cliff — a torn topology.
      let cliff: string | null = null;
      const zAt = new Map<string, { z: number; who: string }>();
      outer: for (const f of newFaces) {
        const who = f.wedge.faces.map((x) => x.label).join("+") + "@" + f.wedge.plane.pitch12.toFixed(2);
        for (const pp of f.ring) {
          const k = `${Math.round(pp.x * 200)}|${Math.round(pp.y * 200)}`;
          const z = planeZ(f.wedge.plane, pp.x, pp.y);
          const prev = zAt.get(k);
          if (prev != null && Math.abs(prev.z - z) > 0.05) {
            cliff = `height discontinuity at (${pp.x.toFixed(1)}, ${pp.y.toFixed(1)}): ${prev.who} says ${prev.z.toFixed(2)}, ${who} says ${z.toFixed(2)} ft`;
            break outer;
          }
          if (prev == null) zAt.set(k, { z, who });
        }
      }
      if (cliff) {
        input.debugSink?.({
          prefix,
          outline: outlineRing,
          wedges: wedges.map((w) => ({ label: w.faces.map((f) => f.label).join("+"), pitch12: w.plane.pitch12, anchor: w.plane.anchor, n: w.plane.n, dir: w.plane.dir, tmin: w.plane.tmin, tmax: w.plane.tmax })),
          regions: newFaces.map((f) => ({ wedge: wedges.indexOf(f.wedge), ring: f.ring })),
          stopped: cliff,
        });
        keepSkeleton(cliff);
        continue;
      }
    }
    input.debugSink?.({
      prefix,
      outline: outlineRing,
      wedges: wedges.map((w) => ({ label: w.faces.map((f) => f.label).join("+"), pitch12: w.plane.pitch12, anchor: w.plane.anchor, n: w.plane.n, dir: w.plane.dir, tmin: w.plane.tmin, tmax: w.plane.tmax })),
      regions: newFaces.map((f) => ({ wedge: wedges.indexOf(f.wedge), ring: f.ring })),
    });

    // accepted
    changed = true;
    rep.source = "dsm-cluster";
    for (const g of groups) {
      if (g.faces.length > 1) rep.merges.push({ cluster: g.faces.map((f) => f.label), pitch12: g.plane.pitch12 });
    }
    rep.gables = [...gableOf.keys()].map((f) => f.label);
    rep.facetsAfter = newFaces.length;
    for (const f of newFaces) {
      const ring3 = f.ring.map((pp) => ({ x: pp.x, y: pp.y, z: planeZ(f.wedge.plane, pp.x, pp.y) }));
      const orientation = ((Math.atan2(-f.wedge.plane.n.x, -f.wedge.plane.n.y) * 180) / Math.PI + 360) % 360;
      keptFaces.push({ ring: ring3, pitch12: f.wedge.plane.pitch12, orientation, onOutline });
    }
  }

  // ── assemble the model ──
  const pKey = (x: number, y: number, z: number) => `${Math.round(x / Q)}|${Math.round(y / Q)}|${Math.round(z / Q)}`;
  const points: RoofPoint[] = [];
  const pIds = new Map<string, string>();
  const pt = (x: number, y: number, z: number): string => {
    const k = pKey(x, y, z);
    let id = pIds.get(k);
    if (!id) {
      id = `RP${points.length + 1}`;
      pIds.set(k, id);
      points.push({ id, x, y, z });
    }
    return id;
  };
  const lines: RoofLine[] = [];
  const lIds = new Map<string, string>();
  interface PendingFace { ids: string[]; pitch12: number; orientation: number; ring: Array<{ x: number; y: number; z: number }>; onOutline: (a: FootprintPoint, b: FootprintPoint) => boolean }
  const pend: PendingFace[] = [];
  for (const kf of keptFaces) {
    const ids: string[] = [];
    for (let i = 0; i < kf.ring.length; i++) {
      const a = kf.ring[i];
      const b = kf.ring[(i + 1) % kf.ring.length];
      const aId = pt(a.x, a.y, a.z);
      const bId = pt(b.x, b.y, b.z);
      if (aId === bId) continue;
      const k = [aId, bId].sort().join("#");
      let id = lIds.get(k);
      if (!id) {
        id = `RL${lines.length + 1}`;
        lIds.set(k, id);
        lines.push({ id, type: "OTHER", aId, bId, lengthFt: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) });
      }
      ids.push(id);
    }
    pend.push({ ids, pitch12: kf.pitch12, orientation: kf.orientation, ring: kf.ring, onOutline: kf.onOutline });
  }
  // classify lines
  const lineOwners = new Map<string, PendingFace[]>();
  for (const f of pend) for (const id of f.ids) {
    const arr = lineOwners.get(id) ?? [];
    arr.push(f);
    lineOwners.set(id, arr);
  }
  const zOf = (f: PendingFace, x: number, y: number): number => {
    // barycentric-free: fit from the ring's plane (all rings are planar by construction)
    const r = f.ring;
    for (let i = 1; i + 1 < r.length; i++) {
      const p0 = r[0], p1 = r[i], p2 = r[i + 1];
      const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
      const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (Math.abs(nz) < 1e-9) continue;
      return p0.z - (nx * (x - p0.x) + ny * (y - p0.y)) / nz;
    }
    return r[0].z;
  };
  for (const l of lines) {
    const a = points.find((p) => p.id === l.aId)!;
    const b = points.find((p) => p.id === l.bId)!;
    const run = Math.hypot(b.x - a.x, b.y - a.y);
    const level = Math.abs(a.z - b.z) <= Math.max(0.08, LEVEL_SLOPE * run);
    const own = lineOwners.get(l.id) ?? [];
    let type: EvLineType;
    if (own.length <= 1) {
      const boundaryish = own.length === 1;
      type = boundaryish && !level ? "RAKE" : "EAVE";
    } else if (level) {
      type = "RIDGE";
    } else {
      // step off the crease midpoint perpendicular into each face
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zc = (a.z + b.z) / 2;
      const dir = { x: (b.x - a.x) / (run || 1), y: (b.y - a.y) / (run || 1) };
      const per = { x: -dir.y, y: dir.x };
      const z1 = zOf(own[0], mid.x + per.x * 0.5, mid.y + per.y * 0.5);
      const z2 = zOf(own[1], mid.x - per.x * 0.5, mid.y - per.y * 0.5);
      type = z1 <= zc && z2 <= zc ? "HIP" : "VALLEY";
    }
    l.type = type;
  }

  // faces with EagleView-convention designators (area ascending)
  const order = [...pend].sort((x, y) => {
    const ax = Math.abs(areaOf(x.ring.map((p) => ({ x: p.x, y: p.y }))));
    const ay = Math.abs(areaOf(y.ring.map((p) => ({ x: p.x, y: p.y }))));
    return ax - ay;
  });
  const faces: RoofFace[] = [];
  let totalArea = 0;
  for (const [rank, f] of order.entries()) {
    const plan = Math.abs(areaOf(f.ring.map((p) => ({ x: p.x, y: p.y }))));
    const sf = Math.sqrt(1 + (f.pitch12 / 12) ** 2);
    const area = plan * sf;
    totalArea += area;
    faces.push({
      id: `RF${rank + 1}`,
      designator: `${String.fromCharCode(65 + Math.floor(rank / 9))}${(rank % 9) + 1}`,
      pitch: f.pitch12,
      areaSqft: area,
      orientation: f.orientation,
      lineIds: f.ids,
    });
  }
  const footageByType = {} as Record<EvLineType, number>;
  for (const l of lines) footageByType[l.type] = (footageByType[l.type] ?? 0) + l.lengthFt;
  for (const t of ["EAVE", "RIDGE", "VALLEY", "HIP", "RAKE", "FLASHING", "STEPFLASH", "OTHER"] as EvLineType[]) footageByType[t] = footageByType[t] ?? 0;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y), zs = points.map((p) => p.z);
  const byPitchArea = new Map<number, number>();
  for (const f of faces) byPitchArea.set(Math.round(f.pitch * 100) / 100, (byPitchArea.get(Math.round(f.pitch * 100) / 100) ?? 0) + f.areaSqft);
  const predominant = [...byPitchArea.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? model.totals.predominantPitch;

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
      predominantPitch: predominant,
      footageByType,
      bounds: {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
        minZ: Math.min(...zs), maxZ: Math.max(...zs),
      },
    },
  };
  return { model: changed ? out : model, report: reports, changed };
}

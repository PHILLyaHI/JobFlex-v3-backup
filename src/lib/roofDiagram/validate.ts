// Roof diagram — VALIDATION GATE. TypeScript port of the roof-geometry skill's
// validate-roof.mjs (checks R01–R15; R16 is presentation-only and dropped),
// adapted to the app's RoofModel graph per the spec
// (docs/superpowers/specs/2026-08-24-roof-drawing-rules.md §4):
//
//   • facet rings come from ringOf over face.lineIds — with truncation
//     detection, because ringOf silently truncates when the chain breaks;
//   • edge incidence is by SHARED LINE ID — exact, never coordinate snapping;
//   • the footprint is chained from the lines referenced by exactly one ROOF
//     face, per structure prefix ("s0:" ids from multi-structure reports);
//   • tolerances vary by source: "eagleview" (ordered, human-QC'd) is strict,
//     "recon" (DSM reconstruction) gets the wider warn/error bands and its
//     drainage / eave / corner / IRC checks demoted to warnings.
//
// The quality score (0–100) weighs topology, coverage, pitch agreement,
// planarity and line-classification agreement — comparable between two models
// of the SAME roof, which is what the refine gate needs (refine may never
// lower the score). The report block is recomputed from geometry as a
// cross-check surface; the app's PRINTED figures stay lengthFt/areaSqft.
//
// Pure and client-safe: no I/O, no side effects, input never mutated, zero
// dependencies beyond the shared pure geometry helpers.

import type { EvLineType, RoofFace, RoofLine, RoofModel, RoofPoint } from "@/lib/eagleview";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";

export type CheckLevel = "ok" | "warn" | "error";

export interface CheckResult {
  id: string;
  level: CheckLevel;
  msg: string;
}

export interface RoofValidation {
  results: CheckResult[];
  errors: number;
  warns: number;
  score: number;
  report: {
    totalPlanArea: number;
    totalSlopedArea: number;
    totalFacets: number;
    predominantPitch: string;
    footage: Array<{ type: string; ft: number; count: number }>;
    dripEdgeFt: number;
  };
}

// IRC R905 minimum pitches (rise/12) — verbatim from the skill's validator.
export const MIN_PITCH: Record<string, number> = {
  asphalt: 2,
  "metal-shingle": 3,
  tile: 2.5,
  slate: 4,
  wood: 3,
  roll: 1,
};

const DOUBLE_UNDERLAY_BELOW = 4; // asphalt 2/12..4/12 → double underlayment (IRC R905.2.2)
const STUB_FT = 1.0;

type Source = "eagleview" | "recon";

interface SourceTol {
  planeWarn: number; //  ft, facet deviation from its fitted plane
  planeErr: number;
  pitchWarn: number; //  slope units: |fitted gradient − declared pitch/12|
  pitchErr: number;
  covWarn: number; //    relative footprint-coverage mismatch
  covErr: number;
  epsZ: number; //       ft, "level" test for eave/ridge classification
  angleWarn: number; //  degrees, crease plan angle vs arctan(pB/pA)
  angleErr: number;
  soft: CheckLevel; //   level for R09 / R10 / R13 / R14
  eulerLevel: CheckLevel; // level for R07
}

const TOL: Record<Source, SourceTol> = {
  eagleview: {
    planeWarn: 0.08,
    planeErr: 0.08,
    pitchWarn: 0.05,
    pitchErr: 0.05,
    covWarn: 0.01,
    covErr: 0.01,
    epsZ: 0.05,
    angleWarn: 2,
    angleErr: 2,
    soft: "error",
    eulerLevel: "error",
  },
  recon: {
    planeWarn: 0.25,
    planeErr: 0.5,
    pitchWarn: 0.06,
    pitchErr: 0.15,
    covWarn: 0.03,
    covErr: 0.08,
    epsZ: 0.5,
    angleWarn: 6,
    angleErr: 12,
    soft: "warn",
    eulerLevel: "warn",
  },
};

const EDGE_TYPES: EvLineType[] = [
  "EAVE",
  "RIDGE",
  "VALLEY",
  "RAKE",
  "HIP",
  "FLASHING",
  "STEPFLASH",
  "OTHER",
];

// ── pure 2D/3D helpers (ported from the reference; ids replace snapping) ─────

type XY = { x: number; y: number };

const finite = (n: number, fallback = 0): number => (Number.isFinite(n) ? n : fallback);
const clampPct = (n: number): number => Math.max(0, Math.min(100, finite(n)));
const round1 = (n: number): number => Math.round(finite(n) * 10) / 10;
const deg = (r: number): number => (r * 180) / Math.PI;
const slopeFactor = (p: number): number => Math.sqrt(1 + (finite(p) / 12) ** 2);

function shoelace(poly: XY[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}
const areaOf = (poly: XY[]): number => Math.abs(finite(shoelace(poly)));

function pointInPoly(pt: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function segIntersect(p1: XY, p2: XY, p3: XY, p4: XY): boolean {
  const d = (a: XY, b: XY, c: XY): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function isSimple(poly: XY[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Least-squares plane z = a·x + b·y + c over a ring's 3D points. */
interface FitPlane {
  a: number;
  b: number;
  c: number;
  maxDev: number;
}

function fitPlane(pts: RoofPoint[]): FitPlane | null {
  const n = pts.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sz += p.z;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
    syy += p.y * p.y;
    sxz += p.x * p.z;
    syz += p.y * p.z;
  }
  const M: number[][] = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const B: number[] = [sxz, syz, sz];
  const det3 = (A: number[][]): number =>
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  const det = det3(M);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const solve = (col: number): number => {
    const A = M.map((r) => r.slice());
    for (let i = 0; i < 3; i++) A[i][col] = B[i];
    return det3(A) / det;
  };
  const a = solve(0);
  const b = solve(1);
  const c = solve(2);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;
  let maxDev = 0;
  for (const p of pts) maxDev = Math.max(maxDev, Math.abs(a * p.x + b * p.y + c - p.z));
  return { a, b, c, maxDev: finite(maxDev) };
}

const planeZ = (pl: FitPlane, x: number, y: number): number => pl.a * x + pl.b * y + pl.c;
/** Gradient magnitude in slope units (= pitch/12). */
const gradOf = (pl: FitPlane): number => Math.hypot(pl.a, pl.b);

/** Structure prefix of an id ("s0:C5" → "s0:", "C5" → ""). */
const structOf = (id: string): string => {
  const i = id.indexOf(":");
  return i >= 0 ? id.slice(0, i + 1) : "";
};

// ── internal working shapes ──────────────────────────────────────────────────

interface FacetGeo {
  face: RoofFace;
  /** Full, un-truncated ring — or null (reported by R01). */
  ring: RoofPoint[] | null;
  plan: XY[];
  planArea: number;
  plane: FitPlane | null;
}

type GeoClass = "eave" | "rake" | "ridge" | "hip" | "valley" | "unknown";

/**
 * Chain a set of single-owner boundary lines into closed ring(s) by point id.
 * Returns null when the chain fails (a point with degree ≠ 2, a missing point,
 * or an unclosable loop) — callers skip R05/R13 with a warn in that case.
 */
function chainRings(lines: RoofLine[], pointsById: Map<string, RoofPoint>): RoofPoint[][] | null {
  if (lines.length < 3) return null;
  const at = new Map<string, RoofLine[]>();
  for (const l of lines) {
    if (!pointsById.has(l.aId) || !pointsById.has(l.bId)) return null;
    const la = at.get(l.aId) ?? [];
    la.push(l);
    at.set(l.aId, la);
    const lb = at.get(l.bId) ?? [];
    lb.push(l);
    at.set(l.bId, lb);
  }
  for (const [, ls] of at) if (ls.length !== 2) return null;

  const used = new Set<string>();
  const rings: RoofPoint[][] = [];
  for (const start of lines) {
    if (used.has(start.id)) continue;
    used.add(start.id);
    const ringIds: string[] = [start.aId];
    let cur = start.bId;
    let prevId = start.id;
    let guard = 0;
    while (cur !== start.aId) {
      ringIds.push(cur);
      const nextLine = (at.get(cur) ?? []).find((l) => l.id !== prevId && !used.has(l.id));
      if (!nextLine) return null;
      used.add(nextLine.id);
      cur = nextLine.aId === cur ? nextLine.bId : nextLine.aId;
      prevId = nextLine.id;
      if (++guard > lines.length) return null;
    }
    if (ringIds.length < 3) return null;
    const ring: RoofPoint[] = [];
    for (const id of ringIds) {
      const p = pointsById.get(id);
      if (!p) return null;
      ring.push(p);
    }
    rings.push(ring);
  }
  return rings;
}

/** Geometric classifier: level test + single-owner boundary + plane probing. */
function classifyLine(
  line: RoofLine,
  fs: FacetGeo[],
  pointsById: Map<string, RoofPoint>,
  epsZ: number,
): GeoClass {
  const a = pointsById.get(line.aId);
  const b = pointsById.get(line.bId);
  if (!a || !b) return "unknown";
  const level = Math.abs(a.z - b.z) <= epsZ;
  if (fs.length === 1) return level ? "eave" : "rake";
  if (fs.length !== 2) return "unknown";
  if (level) return "ridge";

  // Hip vs valley: probe both fitted planes 1.0 ft perpendicular of the
  // midpoint, clamped inside the plan rings (the probe shrinks toward the
  // midpoint until it lands inside a facet; a too-thin sliver falls back to
  // the side's raw plane at 1.0 ft).
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return "unknown";
  const perp: XY = { x: -dy / len, y: dx / len };
  const mid: XY = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const zMid = (a.z + b.z) / 2;
  let lower = 0;
  let higher = 0;
  const sides: number[] = [1, -1];
  for (const s of sides) {
    let probe: XY = { x: mid.x + perp.x * s, y: mid.y + perp.y * s };
    let fg: FacetGeo | undefined;
    for (const d of [1.0, 0.5, 0.2, 0.1]) {
      const p: XY = { x: mid.x + perp.x * d * s, y: mid.y + perp.y * d * s };
      fg = fs.find((f) => f.ring !== null && pointInPoly(p, f.plan));
      if (fg) {
        probe = p;
        break;
      }
    }
    if (!fg) {
      // All probes on this side landed outside both plan rings. Pick the
      // fallback face GEOMETRICALLY — the face whose plan-ring centroid lies
      // on this side of the crease (sign of the cross product with the crease
      // direction) — never by array order. Ambiguity (neither or both faces
      // on this side) means the geometry cannot answer: unknown.
      const candidates = fs.filter((f) => {
        if (f.ring === null || f.plan.length < 3) return false;
        const cx = f.plan.reduce((acc, p) => acc + p.x, 0) / f.plan.length;
        const cy = f.plan.reduce((acc, p) => acc + p.y, 0) / f.plan.length;
        const cross = dx * (cy - mid.y) - dy * (cx - mid.x);
        return Math.sign(cross) === s;
      });
      if (candidates.length !== 1) return "unknown";
      fg = candidates[0];
    }
    if (!fg.plane) continue;
    const z = planeZ(fg.plane, probe.x, probe.y);
    if (z < zMid - 1e-3) lower++;
    else if (z > zMid + 1e-3) higher++;
  }
  if (lower === 2) return "hip";
  if (higher === 2) return "valley";
  return "unknown";
}

const emptyReport = (): RoofValidation["report"] => ({
  totalPlanArea: 0,
  totalSlopedArea: 0,
  totalFacets: 0,
  predominantPitch: "0/12",
  footage: EDGE_TYPES.map((t) => ({ type: t as string, ft: 0, count: 0 })),
  dripEdgeFt: 0,
});

// ── the gate ─────────────────────────────────────────────────────────────────

export function validateRoofModel(
  model: RoofModel,
  opts?: {
    source?: Source;
    material?: keyof typeof MIN_PITCH;
    /** Face ids drawn ATOP a host facet (grafted sub-roof overlays): their
     *  plan areas are excluded from the R05 coverage sum, because the figure
     *  under each overlay already transferred to its host facet — counting
     *  both would double the footprint. Additive; absent = no overlays. */
    overlayFaceIds?: Set<string>;
  },
): RoofValidation {
  const results: CheckResult[] = [];
  const add = (level: CheckLevel, id: string, msg: string): void => {
    results.push({ id, level, msg });
  };
  const err = (id: string, msg: string): void => add("error", id, msg);
  const warn = (id: string, msg: string): void => add("warn", id, msg);
  const ok = (id: string, msg: string): void => add("ok", id, msg);
  const none = (id: string): boolean => !results.some((r) => r.id === id && r.level !== "ok");
  const tally = (): { errors: number; warns: number } => ({
    errors: results.filter((r) => r.level === "error").length,
    warns: results.filter((r) => r.level === "warn").length,
  });

  const source: Source =
    opts?.source ?? (model.source == null || model.source === "eagleview" ? "eagleview" : "recon");
  const tol = TOL[source];
  const material = String(opts?.material ?? "asphalt");

  // ── empty model: one error, score 0 ────────────────────────────────────────
  if (!model.points.length || !model.lines.length || !model.faces.length) {
    err("INPUT", "model is incomplete: points, lines and faces are all required");
    return { results, ...tally(), score: 0, report: emptyReport() };
  }

  const idx = buildIndexes(model);
  const { pointsById, linesById } = idx;

  // Facet rings with truncation detection: ringOf silently stops when the
  // chain breaks, so a full ring must use every present segment (one ring
  // point per segment) and every referenced line must exist.
  const facets: FacetGeo[] = model.faces.map((face) => {
    const present = face.lineIds.filter((id) => linesById.has(id));
    const raw = ringOf(face.lineIds, idx);
    let full =
      raw !== null && present.length === face.lineIds.length && raw.length === present.length;
    // Length alone is not closure: ringOf can return a ring of the right size
    // whose closing hop (last → first) is not a real segment. Every
    // consecutive pair — INCLUDING the wrap — must be a segment of the
    // face's own line set.
    if (full && raw !== null) {
      const segs = new Set<string>();
      for (const id of present) {
        const l = linesById.get(id);
        if (!l) continue;
        segs.add(`${l.aId}|${l.bId}`);
        segs.add(`${l.bId}|${l.aId}`);
      }
      for (let i = 0; i < raw.length; i++) {
        const a = raw[i];
        const b = raw[(i + 1) % raw.length];
        if (!segs.has(`${a.id}|${b.id}`)) {
          full = false;
          break;
        }
      }
    }
    const ring = full ? raw : null;
    const plan: XY[] = ring ? ring.map((p) => ({ x: p.x, y: p.y })) : [];
    return {
      face,
      ring,
      plan,
      planArea: ring ? areaOf(plan) : 0,
      plane: ring ? fitPlane(ring) : null,
    };
  });

  // Incidence by shared line id (ROOF faces only; penetrations excluded).
  const owners = new Map<string, FacetGeo[]>();
  for (const fg of facets) {
    for (const id of fg.face.lineIds) {
      const list = owners.get(id) ?? [];
      list.push(fg);
      owners.set(id, list);
    }
  }

  // ── R01/R02: ring assembly, degeneracy, simplicity ────────────────────────
  for (const fg of facets) {
    const label = fg.face.designator || fg.face.id;
    if (fg.ring === null) {
      err("R01", `${label}: boundary chain broken — ring cannot be assembled from its lines`);
      continue;
    }
    if (fg.planArea < 0.5) {
      err("R01", `${label}: degenerate plan area ${fg.planArea.toFixed(2)} sq ft`);
    } else if (!isSimple(fg.plan)) {
      err("R02", `${label}: plan polygon self-intersects`);
    }
    const seen = new Set<string>();
    for (const p of fg.ring) {
      if (seen.has(p.id)) err("R02", `${label}: duplicate vertex ${p.id} in ring`);
      seen.add(p.id);
    }
  }
  if (none("R01") && none("R02")) {
    ok("R01/R02", `${facets.length} facets — rings closed, simple, non-degenerate`);
  }

  // ── R03/R04: planarity, declared pitch vs fitted gradient ─────────────────
  for (const fg of facets) {
    if (fg.ring === null) continue;
    const label = fg.face.designator || fg.face.id;
    if (!fg.plane) {
      err("R03", `${label}: could not fit a plane`);
      continue;
    }
    if (fg.plane.maxDev > tol.planeErr) {
      err("R03", `${label}: facet not planar, deviation ${fg.plane.maxDev.toFixed(2)} ft`);
    } else if (fg.plane.maxDev > tol.planeWarn) {
      warn("R03", `${label}: facet barely planar, deviation ${fg.plane.maxDev.toFixed(2)} ft`);
    }
    const grad = gradOf(fg.plane);
    const dPitch = Math.abs(grad - fg.face.pitch / 12);
    if (dPitch > tol.pitchErr) {
      err("R04", `${label}: declared pitch ${fg.face.pitch}/12, fitted ${(grad * 12).toFixed(2)}/12`);
    } else if (dPitch > tol.pitchWarn) {
      warn(
        "R04",
        `${label}: declared pitch ${fg.face.pitch}/12 vs fitted ${(grad * 12).toFixed(2)}/12`,
      );
    }
  }
  if (none("R03") && none("R04")) ok("R03/R04", "all facets planar, pitches match the geometry");

  // ── footprint chaining (boundary lines, per structure prefix) ─────────────
  // A structure's boundary is its single-owner lines PLUS any line whose two
  // owners live in DIFFERENT structure prefixes: composeStructures welds the
  // shared wall line of attached buildings into ONE line owned by faces on
  // both sides, and that line is each structure's footprint edge — treating
  // it as interior left both chains with degree-1 endpoints, so chaining
  // failed and R05 collapsed to the flat 25 for exactly the attached-building
  // compositions the weld was built for.
  // Overlay faces (opts.overlayFaceIds — grafted sub-roofs drawn atop a host
  // facet) are interior drawings: their lines are single-owner but must not
  // chain into a phantom footprint ring (or break the chaining outright), and
  // their plan areas are excluded from the R05 coverage sum below, because
  // each overlay's footprint is already inside its host facet's figure.
  const overlay = opts?.overlayFaceIds;
  const boundaryByStruct = new Map<string, RoofLine[]>();
  const pushBoundary = (s: string, line: RoofLine): void => {
    const list = boundaryByStruct.get(s) ?? [];
    list.push(line);
    boundaryByStruct.set(s, list);
  };
  for (const [id, fs] of owners) {
    const line = linesById.get(id);
    if (!line) continue;
    if (fs.length === 1) {
      if (overlay?.has(fs[0].face.id)) continue;
      pushBoundary(structOf(line.id), line);
    } else if (fs.length === 2) {
      const sA = structOf(fs[0].face.id);
      const sB = structOf(fs[1].face.id);
      if (sA === sB) continue; // interior crease of one structure
      if (overlay?.has(fs[0].face.id) || overlay?.has(fs[1].face.id)) continue;
      // Shared wall line of a compose-time weld: boundary for BOTH chains.
      pushBoundary(sA, line);
      pushBoundary(sB, line);
    }
  }
  let chainFailed = false;
  const footprintRings: RoofPoint[][] = [];
  for (const [, ls] of boundaryByStruct) {
    const rings = chainRings(ls, pointsById);
    if (rings === null) {
      chainFailed = true;
      continue;
    }
    footprintRings.push(...rings);
  }
  const outlineArea = footprintRings.reduce(
    (s, ring) => s + areaOf(ring.map((p) => ({ x: p.x, y: p.y }))),
    0,
  );

  // ── R05: footprint coverage (overlay faces excluded — see above) ──────────
  const sumPlan = facets.reduce(
    (s, fg) => s + (overlay?.has(fg.face.id) ? 0 : fg.planArea),
    0,
  );
  let covRel: number | null = null;
  if (chainFailed || outlineArea <= 0) {
    warn("R05", "footprint chaining failed — coverage check skipped");
  } else {
    covRel = Math.abs(sumPlan - outlineArea) / outlineArea;
    const msg = `facet plan projections ${sumPlan.toFixed(0)} sq ft vs outline ${outlineArea.toFixed(
      0,
    )} sq ft (${(covRel * 100).toFixed(1)} % off)`;
    if (covRel > tol.covErr) err("R05", msg);
    else if (covRel > tol.covWarn) warn("R05", msg);
    else ok("R05", `facet projections cover the outline (${outlineArea.toFixed(0)} sq ft)`);
  }

  // ── R06: line incidence (shared line id, never snapped) ───────────────────
  let overShare = 0;
  let orphans = 0;
  for (const l of model.lines) {
    const n = owners.get(l.id)?.length ?? 0;
    if (n > 2) {
      err("R06", `line ${l.id} (${l.type}) is shared by ${n} facets`);
      overShare++;
    } else if (n === 0 && l.type !== "FLASHING" && l.type !== "STEPFLASH" && l.type !== "OTHER") {
      warn("R06", `line ${l.id} (${l.type}) is referenced by no facet (orphan)`);
      orphans++;
    }
  }
  if (!overShare && !orphans) ok("R06", "every structural line belongs to 1 or 2 facets");

  // ── R07: Euler characteristic per structure over ROOF faces ───────────────
  const facesByStruct = new Map<string, FacetGeo[]>();
  for (const fg of facets) {
    const s = structOf(fg.face.id);
    const list = facesByStruct.get(s) ?? [];
    list.push(fg);
    facesByStruct.set(s, list);
  }
  let eulerFails = 0;
  for (const [s, fgs] of facesByStruct) {
    // A structure prefix can legitimately hold several detached roof pieces
    // (e.g. a detached garage sharing the "" prefix). Split its faces into
    // connected components by union-find over shared line ids and require
    // V−E+F = 1 per component, so only genuinely broken components dock.
    const parent = fgs.map((_, i) => i);
    const find = (i: number): number => {
      let r = i;
      while (parent[r] !== r) {
        parent[r] = parent[parent[r]];
        r = parent[r];
      }
      return r;
    };
    const firstOwner = new Map<string, number>();
    for (let i = 0; i < fgs.length; i++) {
      for (const id of fgs[i].face.lineIds) {
        if (!linesById.has(id)) continue;
        const prev = firstOwner.get(id);
        if (prev == null) firstOwner.set(id, i);
        else {
          const a = find(prev);
          const b = find(i);
          if (a !== b) parent[a] = b;
        }
      }
    }
    const components = new Map<number, FacetGeo[]>();
    for (let i = 0; i < fgs.length; i++) {
      const root = find(i);
      const list = components.get(root) ?? [];
      list.push(fgs[i]);
      components.set(root, list);
    }
    for (const comp of components.values()) {
      const lineSet = new Set<string>();
      const ptSet = new Set<string>();
      for (const fg of comp) {
        for (const id of fg.face.lineIds) {
          const l = linesById.get(id);
          if (!l) continue;
          lineSet.add(l.id);
          ptSet.add(l.aId);
          ptSet.add(l.bId);
        }
      }
      const euler = ptSet.size - lineSet.size + comp.length;
      if (euler !== 1) {
        const label = comp[0].face.designator || comp[0].face.id;
        add(
          tol.eulerLevel,
          "R07",
          `structure "${s || "main"}", component at ${label}: V−E+F = ${ptSet.size}−${lineSet.size}+${comp.length} = ${euler} (expected 1) — not simply connected`,
        );
        eulerFails++;
      }
    }
  }
  if (!eulerFails) ok("R07", "topology simply connected per component (V−E+F = 1)");

  // ── R08: geometric edge classification ────────────────────────────────────
  const geoClass = new Map<string, GeoClass>();
  const classCount: Record<GeoClass, number> = {
    eave: 0,
    rake: 0,
    ridge: 0,
    hip: 0,
    valley: 0,
    unknown: 0,
  };
  for (const l of model.lines) {
    const fs = owners.get(l.id);
    if (!fs || !fs.length) continue;
    const c = classifyLine(l, fs, pointsById, tol.epsZ);
    geoClass.set(l.id, c);
    classCount[c]++;
  }
  if (classCount.unknown) {
    warn("R08", `${classCount.unknown} edges could not be classified (check crease geometry)`);
  } else {
    ok(
      "R08",
      `edges classified: ${classCount.eave} eave, ${classCount.rake} rake, ${classCount.ridge} ridge, ${classCount.hip} hip, ${classCount.valley} valley`,
    );
  }

  // ── R09: every facet drains over at least one eave ────────────────────────
  for (const fg of facets) {
    if (fg.ring === null) continue;
    const label = fg.face.designator || fg.face.id;
    const has = fg.face.lineIds.some((id) => geoClass.get(id) === "eave");
    if (!has) add(tol.soft, "R09", `${label}: no eave — water has nowhere to leave`);
  }
  if (none("R09")) ok("R09", "every facet has an eave");

  // ── R10: water drains outward, not into the roof ──────────────────────────
  for (const fg of facets) {
    if (fg.ring === null || !fg.plane || fg.plan.length < 3) continue;
    const label = fg.face.designator || fg.face.id;
    const cx = fg.plan.reduce((s, p) => s + p.x, 0) / fg.plan.length;
    const cy = fg.plan.reduce((s, p) => s + p.y, 0) / fg.plan.length;
    const gx = -fg.plane.a;
    const gy = -fg.plane.b;
    const gl = Math.hypot(gx, gy);
    if (!Number.isFinite(gl) || gl < 1e-6) {
      warn("R10", `${label}: flat facet, zero slope`);
      continue;
    }
    const sx = gx / gl;
    const sy = gy / gl;
    let exitZ: number | null = null;
    for (let t = 0.2; t < 500; t += 0.2) {
      const px = cx + sx * t;
      const py = cy + sy * t;
      if (!pointInPoly({ x: px, y: py }, fg.plan)) {
        exitZ = planeZ(fg.plane, px, py);
        break;
      }
    }
    const cz = planeZ(fg.plane, cx, cy);
    if (exitZ != null && exitZ > cz + tol.epsZ) {
      add(tol.soft, "R10", `${label}: slope drains into the roof, not toward an eave`);
    }
  }
  if (none("R10")) ok("R10", "water drains outward from every facet");

  // ── R11: ridges are level and sit at the top of both facets ───────────────
  for (const l of model.lines) {
    if (geoClass.get(l.id) !== "ridge") continue;
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (!a || !b) continue;
    const topZ = Math.max(a.z, b.z);
    // Judged WITHIN the ridge's own span (see validateRoofInvariants R11): a
    // facet spanning two wings carries two ridges at two heights legitimately.
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const ul = Math.hypot(ux, uy) || 1;
    const sOf = (px: number, py: number) => ((px - a.x) * ux + (py - a.y) * uy) / ul;
    for (const fg of owners.get(l.id) ?? []) {
      if (fg.ring === null) continue;
      const label = fg.face.designator || fg.face.id;
      let spanMax = -Infinity;
      for (let i = 0; i < fg.ring.length; i++) {
        const p = fg.ring[i];
        const q = fg.ring[(i + 1) % fg.ring.length];
        const sp = sOf(p.x, p.y);
        const sq = sOf(q.x, q.y);
        const lo = Math.max(0, Math.min(sp, sq));
        const hi = Math.min(ul, Math.max(sp, sq));
        if (hi < lo) continue;
        const zAt = (t: number) => (Math.abs(sq - sp) < 1e-9 ? Math.max(p.z, q.z) : p.z + ((t - sp) / (sq - sp)) * (q.z - p.z));
        spanMax = Math.max(spanMax, zAt(lo), zAt(hi));
      }
      if (spanMax > topZ + tol.epsZ) {
        err("R11", `${label}: ridge ${l.id} is not the facet's top edge within its own span`);
      }
    }
  }
  if (none("R11")) ok("R11", "ridges are level and lie along facet tops within their spans");

  // ── R12: crease plan angle obeys arctan(pB/pA) ────────────────────────────
  for (const l of model.lines) {
    const cls = geoClass.get(l.id);
    if (cls !== "hip" && cls !== "valley") continue;
    const fs = owners.get(l.id) ?? [];
    if (fs.length !== 2) continue;
    const [A, B] = fs;
    if (!A.plane || !B.plane) continue;
    const pA = gradOf(A.plane) * 12;
    const pB = gradOf(B.plane) * 12;
    if (pA < 0.1 || pB < 0.1) continue;
    const a = pointsById.get(l.aId);
    const b = pointsById.get(l.bId);
    if (!a || !b) continue;
    // Facet A's eave direction = perpendicular of its plan gradient.
    const ex = -A.plane.b;
    const ey = A.plane.a;
    const el = Math.hypot(ex, ey) || 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dl = Math.hypot(dx, dy) || 1;
    const cos = Math.abs((ex / el) * (dx / dl) + (ey / el) * (dy / dl));
    const observed = deg(Math.acos(Math.min(1, cos)));
    // General-corner rule (see validateRoofInvariants R12): γ is the interior
    // eave angle; arctan(pB/pA) is its right-angle special case.
    const gdot = A.plane.a * B.plane.a + A.plane.b * B.plane.b;
    const gnorm = Math.hypot(A.plane.a, A.plane.b) * Math.hypot(B.plane.a, B.plane.b) || 1;
    const gamma = Math.PI - Math.acos(Math.max(-1, Math.min(1, gdot / gnorm)));
    const predicted = deg(Math.atan2(pB * Math.sin(gamma), pA + pB * Math.cos(gamma)));
    const diff = Math.min(Math.abs(observed - predicted), Math.abs(180 - observed - predicted));
    const labelA = A.face.designator || A.face.id;
    const labelB = B.face.designator || B.face.id;
    const msg = `${cls} between ${labelA} (${pA.toFixed(1)}/12) and ${labelB} (${pB.toFixed(
      1,
    )}/12): plan angle ${observed.toFixed(1)}°, the plane intersection predicts ${predicted.toFixed(1)}° (eave corner ${deg(gamma).toFixed(0)}°)`;
    if (diff > tol.angleErr) err("R12", msg);
    else if (diff > tol.angleWarn) warn("R12", msg);
  }
  if (none("R12")) ok("R12", "hip/valley plan angles match the pitches and the eave corner (45° at equal pitches on a square corner)");

  // ── R13: hip from a convex footprint corner, valley from a reflex one ─────
  if (chainFailed) {
    warn("R13", "footprint chaining failed — corner provenance check skipped");
  } else {
    const convexity = new Map<string, "convex" | "concave">();
    for (const ring of footprintRings) {
      const xy = ring.map((p) => ({ x: p.x, y: p.y }));
      const orient = shoelace(xy) > 0 ? 1 : -1;
      for (let i = 0; i < ring.length; i++) {
        const p0 = xy[(i - 1 + ring.length) % ring.length];
        const p1 = xy[i];
        const p2 = xy[(i + 1) % ring.length];
        const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
        convexity.set(ring[i].id, cross * orient > 0 ? "convex" : "concave");
      }
    }
    for (const l of model.lines) {
      const cls = geoClass.get(l.id);
      if (cls !== "hip" && cls !== "valley") continue;
      const a = pointsById.get(l.aId);
      const b = pointsById.get(l.bId);
      if (!a || !b) continue;
      const low = a.z <= b.z ? a : b;
      const c = convexity.get(low.id);
      if (!c) continue;
      if (cls === "hip" && c !== "convex") {
        add(tol.soft, "R13", `hip ${l.id} emerges from a reflex corner — a valley belongs there`);
      }
      if (cls === "valley" && c !== "concave") {
        add(tol.soft, "R13", `valley ${l.id} emerges from a convex corner — a hip belongs there`);
      }
    }
    if (none("R13")) ok("R13", "hips on convex corners, valleys on reflex corners");
  }

  // ── R14: IRC minimum pitch for the material ───────────────────────────────
  const minP = MIN_PITCH[material];
  if (minP == null) {
    warn("R14", `unknown material "${material}" — minimum-pitch check skipped`);
  } else {
    for (const fg of facets) {
      if (fg.ring === null) continue;
      const label = fg.face.designator || fg.face.id;
      const p = fg.plane ? gradOf(fg.plane) * 12 : fg.face.pitch;
      if (!Number.isFinite(p)) continue;
      if (p + tol.pitchWarn * 12 < minP) {
        add(
          tol.soft,
          "R14",
          `${label}: pitch ${p.toFixed(1)}/12 is below the ${minP}/12 minimum for ${material} (IRC R905)`,
        );
      } else if (material === "asphalt" && p < DOUBLE_UNDERLAY_BELOW) {
        warn("R14", `${label}: pitch ${p.toFixed(1)}/12 needs double underlayment (IRC R905.2.2)`);
      }
    }
    if (none("R14")) ok("R14", `pitches are acceptable for "${material}"`);
  }

  // ── R15: stub segments ────────────────────────────────────────────────────
  const stubs = model.lines.filter(
    (l) => l.type !== "FLASHING" && l.type !== "STEPFLASH" && l.lengthFt < STUB_FT,
  );
  if (stubs.length) {
    warn("R15", `${stubs.length} lines shorter than ${STUB_FT} ft — merge collinear segments`);
  } else {
    ok("R15", "no stub segments");
  }

  // ── quality score ─────────────────────────────────────────────────────────
  // 0.30·topology + 0.20·coverage + 0.20·pitch + 0.15·planarity + 0.15·lines,
  // each component 0..100, clamped — comparable between two models of the
  // same roof (the refine gate's currency).
  const validCount = facets.filter((fg) => fg.ring !== null).length;
  const selfX = results.filter((r) => r.id === "R02" && r.level === "error").length;
  let sTopo = facets.length ? (100 * validCount) / facets.length : 0;
  sTopo -= 10 * overShare + 10 * eulerFails + 5 * selfX;
  sTopo = clampPct(sTopo);

  // Unmeasurable coverage must never out-score measurable coverage: a model
  // whose footprint cannot even be chained is in worse shape than one whose
  // mismatch we actually measured at the WARN bound, so it scores a flat 25 —
  // below the old 50 placeholder and below the recon warn-bound score
  // (100·(1 − covWarn/covErr) = 62.5). It stays comparable between two models
  // of the same roof: chaining success alone is worth the difference.
  const sCov = covRel == null ? 25 : clampPct(100 * (1 - covRel / tol.covErr));

  let wSum = 0;
  let pitchAcc = 0;
  let planAcc = 0;
  for (const fg of facets) {
    if (fg.ring === null) continue;
    const w = Math.max(fg.planArea, 1e-6);
    wSum += w;
    if (fg.plane) {
      const d = Math.abs(gradOf(fg.plane) - fg.face.pitch / 12);
      pitchAcc += w * clampPct(100 * (1 - d / tol.pitchErr));
      planAcc += w * clampPct(100 * (1 - fg.plane.maxDev / tol.planeErr));
    }
  }
  const sPitch = wSum > 0 ? pitchAcc / wSum : 0;
  const sPlan = wSum > 0 ? planAcc / wSum : 0;

  // S_lines: declared vs geometric classification agreement.
  const classedTypes: EvLineType[] = ["EAVE", "RAKE", "RIDGE", "HIP", "VALLEY"];
  let classed = 0;
  let agreed = 0;
  for (const l of model.lines) {
    if (!classedTypes.includes(l.type)) continue;
    const c = geoClass.get(l.id);
    // "unknown" is excluded: an unclassifiable line is neutral, not a
    // disagreement — geometry could not answer, so it must not drag S_lines.
    if (c == null || c === "unknown") continue;
    classed++;
    if (c === l.type.toLowerCase()) agreed++;
  }
  const sLines = classed ? (100 * agreed) / classed : 0;

  const score = round1(
    clampPct(0.3 * sTopo + 0.2 * sCov + 0.2 * sPitch + 0.15 * sPlan + 0.15 * sLines),
  );

  // ── report block — recomputed from geometry as a cross-check surface ──────
  const totalSloped = facets.reduce((s, fg) => s + fg.planArea * slopeFactor(fg.face.pitch), 0);
  const byPitch = new Map<number, number>();
  for (const fg of facets) {
    const w = fg.planArea * slopeFactor(fg.face.pitch);
    byPitch.set(fg.face.pitch, (byPitch.get(fg.face.pitch) ?? 0) + w);
  }
  let predominant = 0;
  let bestW = -1;
  for (const p of [...byPitch.keys()].sort((x, y) => x - y)) {
    const w = byPitch.get(p) ?? 0;
    if (w > bestW) {
      bestW = w;
      predominant = p;
    }
  }
  const footage = EDGE_TYPES.map((t) => {
    const ls = model.lines.filter((l) => l.type === t);
    return {
      type: t as string,
      ft: round1(ls.reduce((s, l) => s + finite(l.lengthFt), 0)),
      count: ls.length,
    };
  });
  const dripRaw = model.lines
    .filter((l) => l.type === "EAVE" || l.type === "RAKE")
    .reduce((s, l) => s + finite(l.lengthFt), 0);

  const report: RoofValidation["report"] = {
    totalPlanArea: round1(!chainFailed && outlineArea > 0 ? outlineArea : sumPlan),
    totalSlopedArea: round1(totalSloped),
    totalFacets: facets.length,
    predominantPitch: `${predominant}/12`,
    footage,
    dripEdgeFt: round1(dripRaw),
  };

  return { results, ...tally(), score, report };
}
// ── R01–R16: the roof-geometry invariants, ported verbatim ───────────────────
//
// The same rules, codes and tolerances as scripts/qa/roof/validate-roof.mjs, as
// a pure function of a RoofModel so the gate runs in the app, not only in CI.
// Verified to reproduce the .mjs counts on the three QA fixtures
// (Redmond 23/6, Kirkland 32/3, Prairie 10/2).
//
// The .mjs takes a `footprint` polygon; a RoofModel has none (ROOF-DIAGNOSIS.md
// §B.1), so R05 and R13 measure against the model's bounding box unless the
// caller supplies one — exactly what the fixture export does.
//
// Deliberately SEPARATE from validateRoofModel above: that one is the shipping
// gate of the current pipeline and its scoring must not shift under it.

const INV_EPS_XY = 0.05;
const INV_EPS_Z = 0.05;
/**
 * An edge is LEVEL by its slope, not by an absolute drop — see the same
 * constant in validate-roof.mjs. Asking |za − zb| ≤ 0.05 ft with no reference
 * to the edge's length made the test stricter the longer the ridge: 40 ft had
 * to be level to 0.125 %. Three real ridges of 16–23 ft dropping 0.06–0.17 ft
 * (slope 0.002–0.008) were classified as hips, and R12 then demanded 45° from
 * them. The absolute value remains a FLOOR so a 6-inch stub is not
 * reclassified by numerical noise.
 */
const INV_LEVEL_SLOPE = 0.02;
const invIsLevelEdge = (a: IPt3, b: IPt3): boolean =>
  Math.abs(a[2] - b[2]) <= Math.max(INV_EPS_Z, INV_LEVEL_SLOPE * Math.hypot(b[0] - a[0], b[1] - a[1]));
const INV_EPS_PLANE = 0.08;
const INV_EPS_PITCH = 0.03;
const INV_EPS_AREA_REL = 0.01;
const INV_EPS_ANGLE_DEG = 2.0;
const INV_STUB_FT = 1.0;
/**
 * R17 asks how far a ridge may sit off mid-span when both pitches are equal.
 * It used to be a flat 0.5 ft of plan asymmetry, an absolute distance compared
 * against spans of any width AND roofs of any pitch — 0.5 ft off centre is
 * 0.5 ft of height on a 12/12 and one inch on a 2/12, and the rule could not
 * tell those apart.
 *
 * But there is no constant to choose here, because |dA − dB| is not really a
 * plan measurement: multiplied by the pitch it is the amount by which the two
 * facets' apex heights DISAGREE. So the test is made in feet of height and
 * compared against a tolerance the validator already states.
 *
 * Which one matters. INV_EPS_Z is for two z values of actual POINTS, and using
 * it flagged ridges 17.7 ft against 17.8 — a 0.05 ft height gap, at the noise
 * floor. This quantity is not point-derived: it comes through a fitted plane,
 * its gradient, the farthest eave and a perpendicular projection. The
 * validator's own statement of how much a fitted plane may be off is
 * INV_EPS_PLANE, and that is the honest tolerance for something built out of
 * one.
 *
 * Not a fraction of the span, deliberately: 1 ft off centre on a 12/12 roof is
 * a foot of height error whether the span is 12 ft or 50, so scaling by span
 * would excuse it on a big house.
 */
const invRidgeCentreTolFt = (pitch12: number): number =>
  INV_EPS_PLANE * (Math.abs(pitch12) > 0.1 ? 12 / Math.abs(pitch12) : 12);
const INV_DOUBLE_UNDERLAY_BELOW = 4;

export interface InvariantFinding {
  level: "ok" | "warn" | "error";
  id: string;
  msg: string;
}

export interface InvariantReport {
  results: InvariantFinding[];
  errors: number;
  warnings: number;
  /** Error codes only, de-duplicated, in rule order — what the UI shows. */
  errorCodes: string[];
}

export interface InvariantOptions {
  /** Building outline in plan (feet). Defaults to the model's bounding box. */
  footprint?: Array<[number, number]>;
  material?: string;
}

type IPt = [number, number];
type IPt3 = [number, number, number];

/** The precision validate-roof.mjs is fed — see validateRoofInvariants. */
const invQ = (n: number): number => Math.round(n * 1000) / 1000;

const invKey = (p: IPt | IPt3): string =>
  Math.round(p[0] / INV_EPS_XY) + "|" + Math.round(p[1] / INV_EPS_XY);
const invEdgeKey = (a: IPt3, b: IPt3): string => [invKey(a), invKey(b)].sort().join("#");

function invShoelace(poly: IPt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}
const invArea2 = (poly: IPt[]): number => Math.abs(invShoelace(poly));

function invPointInPoly(pt: IPt, poly: IPt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function invSegIntersect(p1: IPt, p2: IPt, p3: IPt, p4: IPt): boolean {
  const d = (a: IPt, b: IPt, c: IPt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function invIsSimple(poly: IPt[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (invSegIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

interface InvPlane {
  a: number;
  b: number;
  c: number;
  maxDev: number;
}

function invFitPlane(pts3: IPt3[]): InvPlane | null {
  let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  const n = pts3.length;
  for (const [x, y, z] of pts3) {
    sx += x; sy += y; sz += z; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z;
  }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const B = [sxz, syz, sz];
  const det =
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  if (Math.abs(det) < 1e-9) return null;
  const solve = (col: number): number => {
    const A = M.map((r) => r.slice());
    for (let i = 0; i < 3; i++) A[i][col] = B[i];
    return (
      (A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
        A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
        A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])) /
      det
    );
  };
  const a = solve(0);
  const b = solve(1);
  const c = solve(2);
  let maxDev = 0;
  for (const [x, y, z] of pts3) maxDev = Math.max(maxDev, Math.abs(a * x + b * y + c - z));
  return { a, b, c, maxDev };
}

const invPlaneZ = (pl: InvPlane, x: number, y: number): number => pl.a * x + pl.b * y + pl.c;
const invGrad = (pl: InvPlane): number => Math.hypot(pl.a, pl.b);
const invDeg = (r: number): number => (r * 180) / Math.PI;

/**
 * Run R01–R16 over a drawn model. Pure: reads the model, returns findings.
 */
export function validateRoofInvariants(model: RoofModel, opts: InvariantOptions = {}): InvariantReport {
  const out: InvariantFinding[] = [];
  const add = (level: InvariantFinding["level"], id: string, msg: string) => out.push({ level, id, msg });
  const err = (id: string, msg: string) => add("error", id, msg);
  const warn = (id: string, msg: string) => add("warn", id, msg);
  const ok = (id: string, msg: string) => add("ok", id, msg);

  const idx = buildIndexes(model);
  const facets = model.faces
    .map((f, i) => {
      const ring = ringOf(f.lineIds, idx);
      if (!ring || ring.length < 3) return null;
      // Quantised to the SAME 3 decimals validate-roof.mjs receives. The two
      // implementations of R14 are line-for-line identical, yet on a 100x60
      // rectangle at exactly 4/12 they disagreed: the reference reads an
      // export rounded to 3 places and fits a gradient of 4.00001, this one
      // read the model at full precision and fitted 3.99998 — one side of
      // `p < 4`, one warning each way. Every code threshold (2/12 asphalt,
      // 4/12 double underlayment, 3/12 metal, 4/12 slate) is an exact number a
      // real roof lands on, so the divergence is not a corner case; it is a
      // house with a 4/12 roof. Same input, same verdict.
      const pts3 = ring.map((p) => [invQ(p.x), invQ(p.y), invQ(p.z)] as IPt3);
      const plan = pts3.map(([x, y]) => [x, y] as IPt);
      return {
        i,
        id: String(f.designator || f.id),
        pitch: Number(f.pitch),
        pts3,
        plan,
        planArea: invArea2(plan),
        plane: invFitPlane(pts3),
      };
    })
    .filter(Boolean) as Array<{
    i: number;
    id: string;
    pitch: number;
    pts3: IPt3[];
    plan: IPt[];
    planArea: number;
    plane: InvPlane | null;
  }>;

  // KNOWN INPUT DEFECT, not fixed here. When the caller supplies no contour the
  // footprint falls back to the model's BOUNDING BOX, and a box is not a
  // contour: on an L-shaped roof it contains the notch, which the facets
  // rightly do not cover, so R05 fails on correct geometry. Same species as the
  // vent drawn in the yard inside the L (chimneyVision.dropOutsideRoof) — a
  // roof is a polygon and every "is this on the roof" test has to be one.
  //
  // Skipping R05 here alone breaks the thing that has caught real drift: the
  // reference validator is ALWAYS handed a footprint (its schema requires one),
  // so the two would answer differently and check.ts would diverge. The fix is
  // at the call sites — pass the real contour, as the V2 path already does and
  // as phase2.ts shows by passing R05 cleanly. See ROOF-DIAGNOSIS §H.
  const b = model.totals?.bounds;
  const fp: IPt[] = (
    opts.footprint ??
    (b
      ? [
          [b.minX, b.minY],
          [b.maxX, b.minY],
          [b.maxX, b.maxY],
          [b.minX, b.maxY],
        ]
      : [])
  ).map(([x, y]) => [invQ(x), invQ(y)] as IPt);

  if (!facets.length || !fp.length) {
    err("INPUT", "модель неполная: нужны footprint, vertices, facets");
    return { results: out, errors: 1, warnings: 0, errorCodes: ["INPUT"] };
  }

  // R01 / R02 — simple, non-degenerate rings
  for (const f of facets) {
    if (f.plan.length < 3) err("R01", f.id + ": меньше 3 вершин");
    else if (f.planArea < 0.5) err("R01", f.id + ": вырожденная площадь " + f.planArea.toFixed(2) + " sq ft");
    else if (!invIsSimple(f.plan)) err("R02", f.id + ": полигон самопересекается");
    const seen = new Set<string>();
    for (const p of f.plan) {
      const k = invKey(p);
      if (seen.has(k)) err("R02", f.id + ": дубль вершины в контуре");
      seen.add(k);
    }
  }
  if (!out.some((r) => r.id === "R01" || r.id === "R02")) ok("R01/R02", facets.length + " граней — простые, невырожденные");

  // R03 / R04 — planarity and declared pitch vs geometry
  for (const f of facets) {
    if (!f.plane) {
      err("R03", f.id + ": не удалось построить плоскость");
      continue;
    }
    if (f.plane.maxDev > INV_EPS_PLANE) err("R03", f.id + ": грань не плоская, отклонение " + f.plane.maxDev.toFixed(2) + " ft");
    const measured = invGrad(f.plane) * 12;
    if (Number.isFinite(f.pitch) && Math.abs(measured / 12 - f.pitch / 12) > INV_EPS_PITCH)
      err("R04", f.id + ": заявлен уклон " + f.pitch + "/12, по геометрии " + measured.toFixed(2) + "/12");
  }
  if (!out.some((r) => r.id === "R03" || r.id === "R04")) ok("R03/R04", "все грани плоские, уклоны совпадают с геометрией");

  // R05 — facet projections cover the footprint
  const fpArea = invArea2(fp);
  const sumPlan = facets.reduce((s, f) => s + f.planArea, 0);
  if (fpArea > 0 && Math.abs(sumPlan - fpArea) / fpArea > INV_EPS_AREA_REL)
    err("R05", "сумма проекций граней " + sumPlan.toFixed(0) + " != площадь контура " + fpArea.toFixed(0) + " sq ft");
  else ok("R05", "проекции граней покрывают контур (" + fpArea.toFixed(0) + " sq ft)");

  // R06 — an edge belongs to one or two facets
  interface InvEdge {
    a: IPt3;
    b: IPt3;
    facets: typeof facets;
    type?: string;
    len?: number;
  }
  const edges = new Map<string, InvEdge>();
  for (const f of facets) {
    for (let k = 0; k < f.pts3.length; k++) {
      const A = f.pts3[k];
      const B = f.pts3[(k + 1) % f.pts3.length];
      const kk = invEdgeKey(A, B);
      if (!edges.has(kk)) edges.set(kk, { a: A, b: B, facets: [] as unknown as typeof facets });
      (edges.get(kk) as InvEdge).facets.push(f);
    }
  }
  let badShare = 0;
  for (const [, e] of edges) {
    if (e.facets.length > 2) {
      err("R06", "ребро делят " + e.facets.length + " граней");
      badShare++;
    }
  }
  if (!badShare) ok("R06", "каждое ребро принадлежит 1 или 2 граням");

  // R07 — Euler
  const usedV = new Set<string>();
  for (const f of facets) for (const p of f.pts3) usedV.add(invKey(p));
  const eulerV = usedV.size;
  const eulerE = edges.size;
  const eulerF = facets.length;
  const euler = eulerV - eulerE + eulerF;
  if (euler !== 1)
    err(
      "R07",
      "Эйлер нарушен: V-E+F = " + eulerV + "-" + eulerE + "+" + eulerF + " = " + euler + " (ожидается 1) — крыша не односвязна или есть дыры",
    );
  else ok("R07", "топология односвязна (V-E+F = 1: " + eulerV + "/" + eulerE + "/" + eulerF + ")");

  // R08 — edge classification
  const classify = (e: InvEdge): string => {
    const level = invIsLevelEdge(e.a, e.b);
    if (e.facets.length === 1) return level ? "eave" : "rake";
    if (level) return "ridge";
    const mid: IPt = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    const dir = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
    const len = Math.hypot(dir[0], dir[1]) || 1;
    const perp = [-dir[1] / len, dir[0] / len];
    const d = 0.4;
    const zMid = (e.a[2] + e.b[2]) / 2;
    let lower = 0;
    let higher = 0;
    for (const s of [1, -1]) {
      const probe: IPt = [mid[0] + perp[0] * d * s, mid[1] + perp[1] * d * s];
      const f = e.facets.find((ff) => invPointInPoly(probe, ff.plan)) || e.facets[0];
      if (!f.plane) continue;
      const z = invPlaneZ(f.plane, probe[0], probe[1]);
      if (z < zMid - 1e-4) lower++;
      else if (z > zMid + 1e-4) higher++;
    }
    if (lower === 2) return "hip";
    if (higher === 2) return "valley";
    return "unknown";
  };
  const byType: Record<string, InvEdge[]> = { eave: [], rake: [], ridge: [], hip: [], valley: [], unknown: [] };
  for (const [, e] of edges) {
    e.type = classify(e);
    e.len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]);
    byType[e.type].push(e);
  }
  if (byType.unknown.length) warn("R08", byType.unknown.length + " рёбер не удалось классифицировать (проверь геометрию складок)");
  else
    ok(
      "R08",
      "рёбра классифицированы: " + byType.eave.length + " eave, " + byType.rake.length + " rake, " + byType.ridge.length + " ridge, " + byType.hip.length + " hip, " + byType.valley.length + " valley",
    );

  // R09 — every facet has an eave
  for (const f of facets) {
    const has = [...edges.values()].some((e) => e.type === "eave" && e.facets.includes(f));
    if (!has) err("R09", f.id + ": нет ни одного карниза (eave) — вода некуда не стекает");
  }
  if (!out.some((r) => r.id === "R09")) ok("R09", "у каждой грани есть карниз");

  // R10 — water runs to the eave
  for (const f of facets) {
    if (!f.plane) continue;
    const cx = f.plan.reduce((s, p) => s + p[0], 0) / f.plan.length;
    const cy = f.plan.reduce((s, p) => s + p[1], 0) / f.plan.length;
    const g = [-f.plane.a, -f.plane.b];
    const gl = Math.hypot(g[0], g[1]);
    if (gl < 1e-6) {
      warn("R10", f.id + ": плоская грань, уклон 0");
      continue;
    }
    const step = [g[0] / gl, g[1] / gl];
    let t = 0.2;
    let exitZ: number | null = null;
    while (t < 500) {
      const p: IPt = [cx + step[0] * t, cy + step[1] * t];
      if (!invPointInPoly(p, f.plan)) {
        exitZ = invPlaneZ(f.plane, p[0], p[1]);
        break;
      }
      t += 0.2;
    }
    const cz = invPlaneZ(f.plane, cx, cy);
    if (exitZ != null && exitZ > cz + INV_EPS_Z) err("R10", f.id + ": уклон направлен внутрь крыши, а не к карнизу");
  }
  if (!out.some((r) => r.id === "R10" && r.level === "error")) ok("R10", "вода с каждой грани стекает наружу");

  // R11 — a ridge is the top edge of both facets WITHIN ITS OWN SPAN. The
  // whole-facet maximum failed every L-shaped facet with two wings of unequal
  // width (two ridges at two heights). The span is the projection interval of
  // the ridge's endpoints on its own axis; the facet ring is clipped to it and
  // z is interpolated at the clip points.
  for (const e of byType.ridge) {
    const ux = e.b[0] - e.a[0];
    const uy = e.b[1] - e.a[1];
    const ul = Math.hypot(ux, uy) || 1;
    const sOf = (p: IPt3) => ((p[0] - e.a[0]) * ux + (p[1] - e.a[1]) * uy) / ul;
    const topZ = Math.max(e.a[2], e.b[2]);
    for (const f of e.facets) {
      let spanMax = -Infinity;
      for (let i = 0; i < f.pts3.length; i++) {
        const p = f.pts3[i];
        const q = f.pts3[(i + 1) % f.pts3.length];
        const sp = sOf(p);
        const sq = sOf(q);
        const lo = Math.max(0, Math.min(sp, sq));
        const hi = Math.min(ul, Math.max(sp, sq));
        if (hi < lo) continue;
        const zAt = (t: number) => (Math.abs(sq - sp) < 1e-9 ? Math.max(p[2], q[2]) : p[2] + ((t - sp) / (sq - sp)) * (q[2] - p[2]));
        spanMax = Math.max(spanMax, zAt(lo), zAt(hi));
      }
      if (spanMax > topZ + INV_EPS_Z) err("R11", f.id + ": конёк не является верхней кромкой грани в своём пролёте");
    }
  }
  if (!out.some((r) => r.id === "R11")) ok("R11", "коньки горизонтальны и лежат по верху граней в своих пролётах");

  // R12 — plan angle of a hip/valley follows arctan(pB / pA)
  for (const e of [...byType.hip, ...byType.valley]) {
    if (e.facets.length !== 2) continue;
    const [A, B] = e.facets;
    if (!A.plane || !B.plane) continue;
    const pA = invGrad(A.plane) * 12;
    const pB = invGrad(B.plane) * 12;
    if (pA < 0.1 || pB < 0.1) continue;
    const eaveA = [-A.plane.b, A.plane.a];
    const el = Math.hypot(eaveA[0], eaveA[1]) || 1;
    const dir = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const cos = Math.abs((eaveA[0] / el) * (dir[0] / dl) + (eaveA[1] / el) * (dir[1] / dl));
    const observed = invDeg(Math.acos(Math.min(1, cos)));
    // General corner: the crease is the equal-height locus, sin(α)·pA =
    // sin(γ−α)·pB with γ the interior angle between the eaves (180° minus the
    // angle between the plan gradients). arctan(pB/pA) is its γ=90° special
    // case; a 135° cut corner at equal pitches predicts 67.5°, not 45°.
    const gdot = A.plane.a * B.plane.a + A.plane.b * B.plane.b;
    const gnorm = Math.hypot(A.plane.a, A.plane.b) * Math.hypot(B.plane.a, B.plane.b) || 1;
    const gamma = Math.PI - Math.acos(Math.max(-1, Math.min(1, gdot / gnorm)));
    const predicted = invDeg(Math.atan2(pB * Math.sin(gamma), pA + pB * Math.cos(gamma)));
    const diff = Math.min(Math.abs(observed - predicted), Math.abs(180 - observed - predicted));
    if (diff > INV_EPS_ANGLE_DEG)
      err(
        "R12",
        e.type + " между " + A.id + "(" + pA.toFixed(1) + "/12) и " + B.id + "(" + pB.toFixed(1) + "/12): угол в плане " + observed.toFixed(1) + "°, по пересечению плоскостей должен быть " + predicted.toFixed(1) + "° (угол контура " + invDeg(gamma).toFixed(0) + "°)",
      );
  }
  if (!out.some((r) => r.id === "R12")) ok("R12", "углы вальм/ендов в плане соответствуют уклонам и углу контура (45° при равных уклонах на прямом углу)");

  // R13 — hips on convex corners, valleys on concave
  const fpOrient = invShoelace(fp) > 0 ? 1 : -1;
  const convexity = new Map<string, string>();
  for (let i = 0; i < fp.length; i++) {
    const p0 = fp[(i - 1 + fp.length) % fp.length];
    const p1 = fp[i];
    const p2 = fp[(i + 1) % fp.length];
    const cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
    convexity.set(invKey(p1), cross * fpOrient > 0 ? "convex" : "concave");
  }
  for (const e of [...byType.hip, ...byType.valley]) {
    const low = e.a[2] <= e.b[2] ? e.a : e.b;
    const c = convexity.get(invKey(low));
    if (!c) continue;
    if (e.type === "hip" && c !== "convex") err("R13", "вальма (hip) выходит из вогнутого угла контура — там должна быть ендова");
    if (e.type === "valley" && c !== "concave") err("R13", "ендова (valley) выходит из выпуклого угла контура — там должна быть вальма");
  }
  if (!out.some((r) => r.id === "R13")) ok("R13", "вальмы на выпуклых углах, ендовы на вогнутых");

  // R17 — a ridge sits at mid-span when both facets share a pitch (invariant 13)
  const perpDistToEaves = (e: InvEdge, f: (typeof facets)[number]): number | null => {
    const dir = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const nrm = [-dir[1] / dl, dir[0] / dl];
    let best: number | null = null;
    for (const [, other] of edges) {
      if (other === e || other.type !== "eave" || !other.facets.includes(f)) continue;
      const mid = [(other.a[0] + other.b[0]) / 2, (other.a[1] + other.b[1]) / 2];
      const d = Math.abs((mid[0] - e.a[0]) * nrm[0] + (mid[1] - e.a[1]) * nrm[1]);
      if (best == null || d > best) best = d;
    }
    return best;
  };
  for (const e of byType.ridge) {
    if (e.facets.length !== 2) continue;
    const [A, B] = e.facets;
    if (!A.plane || !B.plane) continue;
    const pA = invGrad(A.plane) * 12;
    const pB = invGrad(B.plane) * 12;
    if (Math.abs(pA - pB) > 0.1) continue;
    const dA = perpDistToEaves(e, A);
    const dB = perpDistToEaves(e, B);
    if (dA == null || dB == null) continue;
    if (Math.abs(dA - dB) > invRidgeCentreTolFt(pA))
      err(
        "R17",
        `конёк не по центру пролёта: ${A.id} ${dA.toFixed(1)} ft против ${B.id} ${dB.toFixed(1)} ft ` +
          `при равном уклоне ${pA.toFixed(1)}/12 — расхождение высот ${(Math.abs(dA - dB) * Math.abs(pA) / 12).toFixed(2)} ft`,
      );
  }
  if (!out.some((r) => r.id === "R17")) ok("R17", "коньки по центру пролёта при равных уклонах");

  // R18 — a clean hip over a convex outline has one facet per side (invariant 7)
  {
    let convex = true;
    for (let i = 0; i < fp.length && convex; i++) {
      const p0 = fp[(i - 1 + fp.length) % fp.length];
      const p1 = fp[i];
      const p2 = fp[(i + 1) % fp.length];
      const cr = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
      if (cr * fpOrient < 0) convex = false;
    }
    if (convex && byType.rake.length === 0) {
      if (facets.length !== fp.length)
        warn("R18", `выпуклый контур из ${fp.length} сторон без гейблов должен дать ${fp.length} граней, а их ${facets.length}`);
      else ok("R18", `чистая вальма: ${facets.length} граней на ${fp.length} сторон контура`);
    } else {
      ok("R18", `пропущено (контур ${convex ? "выпуклый" : "невыпуклый"}, гейблов ${byType.rake.length})`);
    }
  }

  // R14 — code minimum pitch for the material
  const mat = opts.material || "asphalt";
  const minP = MIN_PITCH[mat];
  if (minP == null) warn("R14", 'неизвестный материал "' + mat + '", проверка минимального уклона пропущена');
  else {
    for (const f of facets) {
      const p = f.plane ? invGrad(f.plane) * 12 : f.pitch;
      if (p + INV_EPS_PITCH * 12 < minP) err("R14", f.id + ": уклон " + p.toFixed(1) + "/12 ниже минимума " + minP + "/12 для " + mat + " (IRC R905)");
      else if (mat === "asphalt" && p < INV_DOUBLE_UNDERLAY_BELOW) warn("R14", f.id + ": уклон " + p.toFixed(1) + "/12 — нужна двойная подкладка (IRC R905.2.2)");
    }
  }
  if (!out.some((r) => r.id === "R14")) ok("R14", "уклоны допустимы для материала «" + mat + "»");

  // R15 — stub edges
  const stubs = [...edges.values()].filter((e) => (e.len ?? 0) < INV_STUB_FT);
  if (stubs.length) warn("R15", stubs.length + " рёбер короче " + INV_STUB_FT + " ft — слей коллинеарные сегменты перед выводом");
  else ok("R15", "нет рёбер-обрубков");

  // R16 — EagleView facet lettering runs smallest area first
  const ids = facets.map((f) => f.id);
  const sorted = facets.slice().sort((a, c) => a.planArea - c.planArea).map((f) => f.id);
  if (ids.join() !== sorted.join())
    warn("R16", "нумерация граней не по возрастанию площади (EagleView-конвенция): сейчас " + ids.join(",") + ", ожидается " + sorted.join(","));
  else ok("R16", "грани пронумерованы от меньшей площади к большей");

  const errors = out.filter((r) => r.level === "error").length;
  const warnings = out.filter((r) => r.level === "warn").length;
  const errorCodes = [...new Set(out.filter((r) => r.level === "error").map((r) => r.id))];
  return { results: out, errors, warnings, errorCodes };
}

// DSM → RoofModel reconstruction. Pure computation: no I/O, no env, no fetch —
// so it can be exercised straight from a script (scripts/roof-recon-eval.ts)
// against EagleView reports as ground truth.
//
// The output is the SAME RoofModel that src/lib/eagleview.ts produces, which is
// what makes this work at all: RoofWireframe, RoofModel3D, RoofFacetTable and
// roofGeometry.ts all consume that interface and nothing else, so a synthesized
// model renders through the existing blueprint viewers unchanged.
//
// Pipeline
//   1. isolateBuilding  — flood-fill the mask so neighbours' roofs are excluded
//   2. computeNormals   — least-squares gradient over a small window
//   3. segmentPlanes    — region-grow on (normal, plane offset), refit as we go
//   4. traceBoundary    — Moore-neighbour trace → pixel ring per facet
//   5. regularize       — fit lines to boundary runs, snap to the roof's dominant
//                         orientations, replace shared edges with the analytic
//                         plane-plane intersection, then re-intersect for corners
//   6. weldVertices     — snap coincident corners so facets share points/lines
//   7. classifyLines    — EAVE / RAKE / RIDGE / HIP / VALLEY from the dihedral
//
// Step 5 is what makes the result read as a blueprint rather than a blob: traced
// pixel boundaries are staircases, and only line fitting + intersection produces
// straight ridges that two facets genuinely share.

import type { EvLineType, RoofFace, RoofLine, RoofModel, RoofPoint } from "./eagleview";
import { EV_LINE_TYPES } from "./eagleview";

const FT_PER_M = 3.28084;

export interface ReconRaster {
  width: number;
  height: number;
  data: Float32Array;
  pixelSizeM: number;
}

export interface ReconOptions {
  normalWindow?: number; //    half-width in px for the normal fit (default 2 → 5x5)
  angleTolDeg?: number; //     max normal deviation when growing a plane (default 14)
  planeTolFt?: number; //      max distance from the fitted plane (default 0.6)
  minFacetSqft?: number; //    clusters below this are dropped or become penetrations
  simplifyTolFt?: number; //   Douglas–Peucker tolerance on the traced ring
  snapTolDeg?: number; //      snap an edge to a dominant orientation within this
  weldTolFt?: number; //       corner welding radius
  maxCornerShiftFt?: number; //  reject a corner intersection further than this
  parcel?: ParcelFrame; //       scopes which structures belong to the property
  mergeAngleDeg?: number; //     coplanar-merge normal tolerance (0 disables)
  mergeOffsetFt?: number; //     coplanar-merge height tolerance
  /** Candidate pitches in rise/12 — typically Google's per-segment values,
   *  rounded. Empty = snap to the nearest integer. */
  pitchPriors12?: number[];
  pitchSnapMax12?: number; //    refuse to move a pitch further than this (0 disables)
  /** Заявленные кольца пенетраций (Instant ROOFPENETRATION), в футах
   *  РАСТРОВОГО кадра (x восток, y север от центра растра). Их пиксели
   *  исключаются из подгонки плоскостей и роста регионов. */
  penetrationRingsFt?: Array<Array<{ x: number; y: number }>>;
  maxPitch12?: number; //        steeper than this is a wall, not roof (default 24)
  wallProbeFt?: number; //       how far past an edge to look for a wall
  wallStepFt?: number; //        height rise that counts as a wall
  azimuthSnapMaxDeg?: number; // snap facet azimuth onto the roof axes (0 disables)
}

// lat/lng → the tile's local-feet frame. Equirectangular about the tile centre,
// same approach the fence studio uses at this scale. Note UTM grid convergence
// means the raster's axes can sit up to ~3 deg off true north, so a converted
// parcel ring can be a few feet out at the tile edge — harmless here, because it
// is only used for a centroid-inside test and structures sit well inside a lot.
export function latLngRingToFrame(
  origin: { lat: number; lng: number },
  ring: Array<{ lat: number; lng: number }>,
): ParcelFrame {
  const D2R = Math.PI / 180;
  const EARTH_R_M = 6378137;
  return {
    ring: ring.map((p) => ({
      x: (p.lng - origin.lng) * D2R * Math.cos(origin.lat * D2R) * EARTH_R_M * FT_PER_M,
      y: (p.lat - origin.lat) * D2R * EARTH_R_M * FT_PER_M,
    })),
  };
}

export interface ReconResult {
  model: RoofModel;
  diagnostics: {
    buildingPx: number;
    /** Пиксели маски пенетраций (индексы растра) — для штриховки и учёта. */
    penetrationPx: number[];
    clusters: number;
    droppedClusters: number;
    groundElevFt: number;
    planPolygonSqft: number;
    lineCount: number;
    branch: Record<"crease" | "sameFacet" | "perimeter" | "offRoof", number>;
    branchFt: Record<"crease" | "sameFacet" | "perimeter" | "offRoof", number>;
    maskPerimeterFt: number;
    tracePx: number[]; //  traced boundary pixels per facet
    corners: number[]; //  corners surviving simplification per facet
    maskComponentsSqft: number[]; //  every structure in the tile, largest first
    keptComponents: number; //        how many were measured
    parcelScoped: boolean; //         whether a parcel ring drove that choice
    fragmentsBefore: number; //       clusters before coplanar merging
    fragmentsMerged: number; //       how many were absorbed
    droppedSteep: number; //          rejected as too steep to be roof
    pitches12: number[]; //           final per-facet pitch, rise/12
    clusterSqft: number[]; //         3D surface area of each, same order as pitches12
    clusterAzimuthDeg: number[]; //   downslope compass bearing of each, same order
    clusterCentroidFt: Array<[number, number]>; // plan centroid, frame feet
    /** Up to 64 sample points per cluster, frame feet. A centroid is not enough:
     *  an L-shaped or crescent facet has its centroid off itself, so "which plane
     *  is on this side of that line" cannot be answered from centroids alone. */
    clusterSamplesFt: Array<Array<[number, number]>>;
    /** Fitted plane z = a·x + b·y + c per cluster (frame feet), same order. */
    clusterPlanes: Array<{ a: number; b: number; c: number }>;
    /** Per-pixel cluster id (-1 = none). Same raster grid as the DSM. Heavy
     *  (w·h int32) but the DSM-layout measurement needs adjacency, and
     *  re-deriving it outside would be a second segmentation (§K7). */
    assign: Int32Array;
    clusterTopFt: number[]; //        highest point of each cluster above ground
    clusterBotFt: number[]; //        lowest point of each cluster above ground
  };
}

// ── small vector / geometry helpers ──────────────────────────────────────────

interface P2 {
  x: number;
  y: number;
}
export interface Plane {
  a: number; //  z = a*x + b*y + c, in feet
  b: number;
  c: number;
}
interface Line2 {
  //  implicit form nx*x + ny*y = d, with (nx,ny) unit
  nx: number;
  ny: number;
  d: number;
}

const planeZ = (p: Plane, x: number, y: number): number => p.a * x + p.b * y + p.c;

// Upward unit normal of z = ax + by + c.
function planeNormal(p: Plane): { x: number; y: number; z: number } {
  const n = Math.hypot(p.a, p.b, 1);
  return { x: -p.a / n, y: -p.b / n, z: 1 / n };
}

// Pitch as rise per 12 (EagleView's convention).
export function planePitch12(p: Plane): number {
  return Math.hypot(p.a, p.b) * 12;
}

// Down-slope azimuth in degrees, 0 = north, 90 = east.
function planeAzimuth(p: Plane): number {
  // Down-slope direction is -(a, b) in (east, north).
  const deg = (Math.atan2(-p.a, -p.b) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function fitPlane(pts: Array<{ x: number; y: number; z: number }>): Plane | null {
  // Normal equations for z = ax + by + c.
  let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  const n = pts.length;
  if (n < 3) return null;
  for (const p of pts) {
    sx += p.x; sy += p.y; sz += p.z;
    sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y;
    sxz += p.x * p.z; syz += p.y * p.z;
  }
  // Solve the 3x3 system by Cramer's rule.
  const m = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const rhs = [sxz, syz, sz];
  const det3 = (M: number[][]) =>
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det3(m);
  if (Math.abs(D) < 1e-9) return null;
  const col = (i: number) => {
    const M = m.map((r) => r.slice());
    for (let r = 0; r < 3; r++) M[r][i] = rhs[r];
    return det3(M) / D;
  };
  return { a: col(0), b: col(1), c: col(2) };
}

// Total-least-squares line through 2D points → implicit form.
function fitLine(pts: P2[]): Line2 | null {
  const n = pts.length;
  if (n < 2) return null;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = p.x - mx, dy = p.y - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  // Principal direction = eigenvector of the scatter matrix with the larger
  // eigenvalue; the normal is the perpendicular one.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dirX = Math.cos(theta), dirY = Math.sin(theta);
  const nx = -dirY, ny = dirX;
  return { nx, ny, d: nx * mx + ny * my };
}

function lineFromPointDir(p: P2, dirX: number, dirY: number): Line2 {
  const len = Math.hypot(dirX, dirY) || 1;
  const nx = -dirY / len, ny = dirX / len;
  return { nx, ny, d: nx * p.x + ny * p.y };
}

function intersectLines(l1: Line2, l2: Line2): P2 | null {
  const det = l1.nx * l2.ny - l1.ny * l2.nx;
  if (Math.abs(det) < 1e-6) return null; // parallel
  return {
    x: (l1.d * l2.ny - l1.ny * l2.d) / det,
    y: (l1.nx * l2.d - l1.d * l2.nx) / det,
  };
}

// Where two roof planes meet, projected to plan view. Their intersection is the
// locus where z is equal on both, which is a straight line: (a1-a2)x + (b1-b2)y
// = c2-c1.
function planeIntersectionLine(p1: Plane, p2: Plane): Line2 | null {
  const ax = p1.a - p2.a;
  const by = p1.b - p2.b;
  const len = Math.hypot(ax, by);
  if (len < 1e-6) return null; // parallel planes
  return { nx: ax / len, ny: by / len, d: (p2.c - p1.c) / len };
}

function polygonAreaSigned(ring: P2[]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return s / 2;
}

function perpDist(p: P2, a: P2, b: P2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Douglas–Peucker on a CLOSED ring: keeps the two extreme points as anchors so
// the ring stays closed.
function simplifyRing(ring: P2[], tol: number): number[] {
  const n = ring.length;
  if (n <= 4) return ring.map((_, i) => i);
  // Anchor at the point furthest from the centroid, and its antipode.
  let cx = 0, cy = 0;
  for (const p of ring) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  let a0 = 0, best = -1;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(ring[i].x - cx, ring[i].y - cy);
    if (d > best) { best = d; a0 = i; }
  }
  const a1 = (a0 + Math.floor(n / 2)) % n;
  const keep = new Array<boolean>(n).fill(false);
  keep[a0] = true;
  keep[a1] = true;
  // Walk the two arcs a0→a1 and a1→a0.
  const arcs: number[][] = [[], []];
  for (let k = 0, i = a0; ; k++) {
    arcs[0].push(i);
    if (i === a1) break;
    i = (i + 1) % n;
    if (k > n) break;
  }
  for (let k = 0, i = a1; ; k++) {
    arcs[1].push(i);
    if (i === a0) break;
    i = (i + 1) % n;
    if (k > n) break;
  }
  for (const arc of arcs) {
    const stack: Array<[number, number]> = [[0, arc.length - 1]];
    while (stack.length) {
      const seg = stack.pop();
      if (!seg) break;
      const [s, e] = seg;
      if (e <= s + 1) continue;
      let maxD = 0, idx = -1;
      for (let i = s + 1; i < e; i++) {
        const d = perpDist(ring[arc[i]], ring[arc[s]], ring[arc[e]]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tol && idx > 0) {
        keep[arc[idx]] = true;
        stack.push([s, idx], [idx, e]);
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

// ── 1. isolate the subject building ──────────────────────────────────────────
// The Solar mask covers EVERY building in the tile. Keep only the connected
// component under the tile centre (the queried address).

// Parcel ring expressed in the tile's local-feet frame (+x east, +y north, origin
// at the tile centre = the queried address).
export interface ParcelFrame {
  ring: Array<{ x: number; y: number }>;
}

function pointInRingFt(x: number, y: number, ring: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y, xj = ring[j].x, yj = ring[j].y;
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function isolateBuilding(
  mask: ReconRaster,
  report?: { componentPx: number[]; keptComponents: number },
  parcel?: ParcelFrame,
  stepFt = 0,
): Uint8Array {
  const { width: w, height: h, data } = mask;
  const label = new Int32Array(w * h).fill(-1);
  const comps: Array<{ id: number; size: number; sx: number; sy: number }> = [];
  let next = 0;
  const stack: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] < 0.5 || label[i] !== -1) continue;
    const id = next++;
    let size = 0, sx = 0, sy = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % w, py = (p - px) / w;
      size++; sx += px; sy += py;
      // 8-connectivity: roof pixels can touch diagonally across a valley.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (data[q] >= 0.5 && label[q] === -1) { label[q] = id; stack.push(q); }
        }
      }
    }
    comps.push({ id, size, sx: sx / size, sy: sy / size });
  }
  const out = new Uint8Array(w * h);
  if (report) {
    report.componentPx = comps
      .map((c) => c.size)
      .sort((a, b) => b - a)
      .slice(0, 8);
  }
  if (!comps.length) return out;

  const cx = w / 2, cy = h / 2;
  const centreIdx = Math.floor(cy) * w + Math.floor(cx);

  // With a parcel ring, keep EVERY structure whose centroid falls inside it — a
  // property's detached garage or wing is a separate mask component, and taking
  // only the one under the pin understated multi-structure roofs badly (measured:
  // -62% on a San Antonio lot with 4 buildings). Note the largest component is
  // NOT a safe proxy: at 419 Prairie Ridge Ln the biggest blob in the tile is the
  // NEIGHBOUR's house (3769 sqft vs the subject's 3403), which is exactly why the
  // parcel boundary is required rather than a size or distance heuristic.
  if (parcel && parcel.ring.length >= 3 && stepFt > 0) {
    const keep = new Set<number>();
    for (const c of comps) {
      const fx = (c.sx + 0.5 - cx) * stepFt;
      const fy = (cy - c.sy - 0.5) * stepFt;
      if (pointInRingFt(fx, fy, parcel.ring)) keep.add(c.id);
    }
    // Never return nothing: if the parcel excludes everything (bad geocode, or
    // the ring is offset), fall back to the component under the pin.
    if (keep.size) {
      for (let i = 0; i < out.length; i++) if (keep.has(label[i])) out[i] = 1;
      if (report) report.keptComponents = keep.size;
      return out;
    }
  }

  // Prefer the component actually under the centre pixel; otherwise the largest
  // component whose centroid is nearest the centre (the pin can land on a gap
  // between facets, or slightly off the structure).
  let chosen = label[centreIdx] >= 0 ? label[centreIdx] : -1;
  if (chosen < 0) {
    let bestScore = -Infinity;
    for (const c of comps) {
      const dist = Math.hypot(c.sx - cx, c.sy - cy);
      const score = c.size / (1 + dist * dist);
      if (score > bestScore) { bestScore = score; chosen = c.id; }
    }
  }
  for (let i = 0; i < out.length; i++) if (label[i] === chosen) out[i] = 1;
  if (report) report.keptComponents = 1;
  return out;
}

// ── 2. per-pixel normals ─────────────────────────────────────────────────────

interface PixelGeom {
  x: Float32Array; //  local feet, +east
  y: Float32Array; //  local feet, +north
  z: Float32Array; //  local feet, ground-relative
  a: Float32Array; //  local dz/dx
  b: Float32Array; //  local dz/dy
  residual: Float32Array;
  ok: Uint8Array;
}

function computeGeometry(
  dsm: ReconRaster,
  building: Uint8Array,
  groundElevFt: number,
  half: number,
): PixelGeom {
  const { width: w, height: h, data, pixelSizeM } = dsm;
  const stepFt = pixelSizeM * FT_PER_M;
  const n = w * h;
  const g: PixelGeom = {
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
    a: new Float32Array(n), b: new Float32Array(n),
    residual: new Float32Array(n).fill(Infinity), ok: new Uint8Array(n),
  };
  const cx = w / 2, cy = h / 2;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px;
      g.x[i] = (px + 0.5 - cx) * stepFt;
      g.y[i] = (cy - py - 0.5) * stepFt; // raster rows run north→south
      g.z[i] = data[i] * FT_PER_M - groundElevFt;
    }
  }
  // Least-squares plane over the window, in units of the local step so the
  // gradient comes out in ft/ft directly.
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px;
      if (!building[i]) continue;
      const pts: Array<{ x: number; y: number; z: number }> = [];
      for (let dy = -half; dy <= half; dy++) {
        const yy = py + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -half; dx <= half; dx++) {
          const xx = px + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (!building[q]) continue;
          pts.push({ x: dx * stepFt, y: -dy * stepFt, z: g.z[q] });
        }
      }
      if (pts.length < 6) continue;
      const pl = fitPlane(pts);
      if (!pl) continue;
      let res = 0;
      for (const p of pts) {
        const d = p.z - planeZ(pl, p.x, p.y);
        res += d * d;
      }
      g.a[i] = pl.a;
      g.b[i] = pl.b;
      g.residual[i] = Math.sqrt(res / pts.length);
      g.ok[i] = 1;
    }
  }
  return g;
}

// ── 3. plane segmentation by region growing ──────────────────────────────────

/** The region-growing tolerance: a pixel belongs to a plane within this
 *  distance. Exported so the stitch judges its cells by the SAME figure the
 *  clustering grew them with. */
export const DEFAULT_PLANE_TOL_FT = 0.6;

interface Cluster {
  id: number;
  plane: Plane;
  pixels: number[];
  areaSqft: number; //  true 3D surface area
}

function segmentPlanes(
  dsm: ReconRaster,
  building: Uint8Array,
  g: PixelGeom,
  angleTolDeg: number,
  planeTolFt: number,
  minPx: number,
  /** Полуширина окна нормалей: ленты уже полного окна ((2·half+1) px) — артефакт. */
  half = 2,
): { clusters: Cluster[]; assign: Int32Array; dropped: number } {
  const { width: w, height: h, pixelSizeM } = dsm;
  const pxAreaSqft = (pixelSizeM * FT_PER_M) ** 2;
  const assign = new Int32Array(w * h).fill(-1);
  const cosTol = Math.cos((angleTolDeg * Math.PI) / 180);

  // Seed in order of local planarity — flat, well-fitted interiors first, so a
  // plane is established from clean data before it reaches noisy facet edges.
  const seeds: number[] = [];
  for (let i = 0; i < assign.length; i++) if (building[i] && g.ok[i]) seeds.push(i);
  seeds.sort((p, q) => g.residual[p] - g.residual[q]);

  const clusters: Cluster[] = [];
  let dropped = 0;
  const stack: number[] = [];

  for (const seed of seeds) {
    if (assign[seed] !== -1) continue;
    const id = clusters.length;
    let plane: Plane = { a: g.a[seed], b: g.b[seed], c: g.z[seed] - g.a[seed] * g.x[seed] - g.b[seed] * g.y[seed] };

    // Two passes: grow, refit from everything found, then regrow from the
    // refined plane. The refit matters — a seed's 5x5 gradient is noisy, and
    // growing on it alone systematically clips facet edges.
    let pixels: number[] = [];
    for (let pass = 0; pass < 2; pass++) {
      for (const p of pixels) if (assign[p] === id) assign[p] = -1;
      pixels = [];
      const nrm = planeNormal(plane);
      stack.length = 0;
      stack.push(seed);
      const seen = new Set<number>([seed]);
      while (stack.length) {
        const i = stack.pop()!;
        if (assign[i] !== -1 || !building[i] || !g.ok[i]) continue;
        // normal agreement
        const ni = planeNormal({ a: g.a[i], b: g.b[i], c: 0 });
        if (ni.x * nrm.x + ni.y * nrm.y + ni.z * nrm.z < cosTol) continue;
        // vertical distance to the plane, converted to true perpendicular
        if (Math.abs(g.z[i] - planeZ(plane, g.x[i], g.y[i])) * nrm.z > planeTolFt) continue;
        assign[i] = id;
        pixels.push(i);
        const px = i % w, py = (i - px) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const q = ny * w + nx;
            if (assign[q] === -1 && building[q] && g.ok[q] && !seen.has(q)) { seen.add(q); stack.push(q); }
          }
        }
      }
      if (pixels.length < 3) break;
      const refit = fitPlane(pixels.map((i) => ({ x: g.x[i], y: g.y[i], z: g.z[i] })));
      if (!refit) break;
      plane = refit;
    }

    if (pixels.length < minPx) {
      for (const p of pixels) assign[p] = -2; // parked: too small to be a facet
      dropped++;
      continue;
    }
    // ЛЕНТА НИЖЕ РАЗРЕШАЮЩЕЙ ШИРИНЫ (полное окно нормалей, (2·half+1) px):
    // полоса скругления гребня образует свой «кластер» шириной 1-1.5 ft с
    // промежуточными нормалями — это артефакт окна, не измеренная
    // плоскость (12618: полосы 24×1.2 ft по обе стороны конька, «уклон»
    // 22/12, кривизна 1.8 ft). Её пиксели уходят в неназначенные — склоны
    // встречаются напрямую, границу ставит пересечение их плоскостей.
    {
      let boundarySegs = 0;
      const inCl = new Set(pixels);
      for (const i of pixels) {
        const px = i % w;
        const py = Math.floor(i / w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !inCl.has(ny * w + nx)) boundarySegs++;
        }
      }
      const areaPlanSqft = pixels.length * pxAreaSqft;
      const stepFtW = pixelSizeM * 3.28084;
      const perFt = boundarySegs * stepFtW * 0.95;
      const widthFt = (2 * areaPlanSqft) / Math.max(perFt, 1e-9);
      if (widthFt < (2 * half + 1) * stepFtW) {
        for (const p of pixels) assign[p] = -2;
        dropped++;
        continue;
      }
    }
    // Plan-view pixel area → true surface area via the plane's slope. Recomputed
    // after claimLeftovers(), which is what finally sets the facet extents.
    const slopeFactor = Math.hypot(plane.a, plane.b, 1);
    clusters.push({
      id,
      plane,
      pixels,
      areaSqft: pixels.length * pxAreaSqft * slopeFactor,
    });
  }
  // Renumber assign to the surviving clusters' indices.
  const remap = new Int32Array(clusters.length + dropped).fill(-1);
  clusters.forEach((c, i) => { remap[c.id] = i; });
  for (let i = 0; i < assign.length; i++) {
    if (assign[i] >= 0) assign[i] = remap[assign[i]] ?? -1;
    else assign[i] = -1;
  }
  clusters.forEach((c, i) => { c.id = i; });
  return { clusters, assign, dropped };
}

// ── 3a. reject non-roof planes ───────────────────────────────────────────────
// A roof facet has bounded slope. Wall slivers, chimney sides and the steep
// noise band at a roof edge all fit "planes" too, and once the minimum facet
// size came down they started surviving as facets with pitches of 47, 102 and
// 146 rise/12 — physically impossible, and they polluted the pitch set and the
// edge classification. Anything steeper than maxPitch12 is not roof.
//
// Their pixels go back to unassigned rather than being deleted, so the following
// claimLeftovers() pass can hand them to a real neighbouring plane if one
// actually predicts their height.
function dropSteepClusters(
  assign: Int32Array,
  clusters: Cluster[],
  maxPitch12: number,
): { clusters: Cluster[]; droppedSteep: number } {
  const keep: Cluster[] = [];
  const remap = new Int32Array(clusters.length).fill(-1);
  for (const c of clusters) {
    if (Math.hypot(c.plane.a, c.plane.b) * 12 > maxPitch12) continue;
    remap[c.id] = keep.length;
    keep.push({ ...c, id: keep.length });
  }
  const droppedSteep = clusters.length - keep.length;
  if (droppedSteep) {
    for (let i = 0; i < assign.length; i++) {
      if (assign[i] >= 0) assign[i] = remap[assign[i]];
    }
  }
  return { clusters: keep, droppedSteep };
}

// ── 3b. claim the transition band ────────────────────────────────────────────
// Region growing deliberately refuses pixels whose local normal matches no
// plane — and every facet edge has a band of those, because the 5x5 normal
// window straddles two planes there. Left alone that band is fatal, not
// cosmetic: facets end up separated by a few unassigned pixels, so (a) their
// polygons are inset from the true eaves/ridges, losing ~25% of the area, and
// (b) no facet ever sees a neighbour across an edge, so nothing is classified
// RIDGE/VALLEY and the plane-plane intersection that straightens shared edges
// never runs.
//
// Fix: dilate the committed clusters into the band one ring at a time, giving
// each pixel to whichever adjacent plane best predicts its elevation. Facets
// grow until they meet, which lands the seam near the true crease.
function claimLeftovers(
  w: number,
  h: number,
  building: Uint8Array,
  g: PixelGeom,
  assign: Int32Array,
  clusters: Cluster[],
  tolFt = 1.5,
  rounds = 16,
): void {
  if (!clusters.length) return;
  for (let r = 0; r < rounds; r++) {
    const adds: number[] = []; //  flat pairs [pixel, clusterId, ...]
    for (let i = 0; i < assign.length; i++) {
      if (!building[i] || assign[i] >= 0) continue;
      const px = i % w, py = (i - px) / w;
      let best = -1, bestErr = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const cid = assign[ny * w + nx];
          if (cid < 0) continue;
          const err = Math.abs(g.z[i] - planeZ(clusters[cid].plane, g.x[i], g.y[i]));
          if (err < bestErr) { bestErr = err; best = cid; }
        }
      }
      if (best >= 0 && bestErr <= tolFt) adds.push(i, best);
    }
    if (!adds.length) break;
    // Apply after the sweep so growth is simultaneous — otherwise whichever
    // cluster is scanned first floods the whole band.
    for (let k = 0; k < adds.length; k += 2) assign[adds[k]] = adds[k + 1];
  }
  // Rebuild membership and areas from the grown assignment.
  for (const c of clusters) c.pixels = [];
  for (let i = 0; i < assign.length; i++) {
    const cid = assign[i];
    if (cid >= 0) clusters[cid].pixels.push(i);
  }
}

// ── 3c. merge coplanar neighbours ────────────────────────────────────────────
// Region growing splits one physical plane into fragments whenever DSM noise
// briefly breaks the normal test — a single roof face can come back as three
// clusters. Each fragment then gets its own polygon, so the drawing gains creases
// that do not exist and the 3D gains slivers between them.
//
// Merge any two ADJACENT clusters whose fitted planes agree. Adjacency is read
// off the segmentation itself (shared border pixels), so only genuine neighbours
// combine — two parallel planes at different heights, like a main roof and a
// porch of the same pitch, stay separate because their plane offsets differ.
function mergeCoplanar(
  w: number,
  h: number,
  assign: Int32Array,
  g: PixelGeom,
  clusters: Cluster[],
  angleTolDeg = 6,
  offsetTolFt = 0.5,
): Cluster[] {
  if (clusters.length < 2) return clusters;
  const cosTol = Math.cos((angleTolDeg * Math.PI) / 180);

  // Union-find over cluster indices.
  const parent = clusters.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i: number, j: number) => {
    const a = find(i), b = find(j);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };

  // Shared-border pixel counts between cluster pairs.
  const border = new Map<string, number>();
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w - 1; px++) {
      const i = py * w + px;
      for (const q of [i + 1, py < h - 1 ? i + w : -1]) {
        if (q < 0) continue;
        const a = assign[i], b = assign[q];
        if (a < 0 || b < 0 || a === b) continue;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        border.set(key, (border.get(key) ?? 0) + 1);
      }
    }
  }

  for (const [key, count] of border) {
    if (count < 12) continue; // incidental touching, not a shared face
    const [ai, bi] = key.split("|").map(Number);
    const pa = clusters[ai].plane, pb = clusters[bi].plane;
    const na = planeNormal(pa), nb = planeNormal(pb);
    if (na.x * nb.x + na.y * nb.y + na.z * nb.z < cosTol) continue;
    // Compare heights where they actually meet, not at the origin — two planes
    // with equal normals but different offsets are different roof levels.
    let sx = 0, sy = 0, n = 0;
    for (const p of clusters[bi].pixels) { sx += g.x[p]; sy += g.y[p]; n++; }
    if (!n) continue;
    const mx = sx / n, my = sy / n;
    if (Math.abs(planeZ(pa, mx, my) - planeZ(pb, mx, my)) > offsetTolFt) continue;
    union(ai, bi);
  }

  // Rebuild the surviving clusters, refitting each merged plane over all its
  // pixels so the combined face is fitted, not inherited from one fragment.
  const groups = new Map<number, number[]>();
  clusters.forEach((_, i) => {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  });
  if (groups.size === clusters.length) return clusters;

  const out: Cluster[] = [];
  const remap = new Int32Array(clusters.length).fill(-1);
  for (const members of groups.values()) {
    const id = out.length;
    const pixels: number[] = [];
    for (const m of members) {
      remap[m] = id;
      pixels.push(...clusters[m].pixels);
    }
    const plane =
      fitPlane(pixels.map((i) => ({ x: g.x[i], y: g.y[i], z: g.z[i] }))) ??
      clusters[members[0]].plane;
    out.push({ id, plane, pixels, areaSqft: 0 });
  }
  for (let i = 0; i < assign.length; i++) {
    if (assign[i] >= 0) assign[i] = remap[assign[i]];
  }
  return out;
}

// ── 3d. quantize pitch ───────────────────────────────────────────────────────
// Roofs are framed to whole pitches, and EagleView's own export reports integers
// (`@pitch: "10"`, verified). Our least-squares planes come back at 9.8, 10.3,
// 12.4 — noise around those integers, which shows up as nonsense pitch labels AND
// as area error, because the slope factor converts plan area to surface area.
//
// `priors12` narrows the candidate set to the pitches actually present on this
// roof (from Google's per-segment stats) instead of any integer; a 10.3 next to a
// known 10 is noise, but a genuine 4/12 porch must stay 4.
//
// Azimuth and the plane's height at its own centroid are both preserved, so a
// facet keeps its orientation and position and only its slope is corrected.
function quantizePitch(
  clusters: Cluster[],
  g: PixelGeom,
  priors12: number[],
  maxDelta12: number,
): void {
  for (const c of clusters) {
    const slope = Math.hypot(c.plane.a, c.plane.b);
    const pitch12 = slope * 12;
    if (pitch12 < 0.5) continue; // flat/low-slope: leave it alone

    const candidates = priors12.length ? priors12 : [Math.round(pitch12)];
    let target = candidates[0];
    for (const cand of candidates) {
      if (Math.abs(cand - pitch12) < Math.abs(target - pitch12)) target = cand;
    }
    // Fall back to the nearest integer if no prior is close — a real pitch the
    // priors missed should not be dragged onto a distant one.
    if (Math.abs(target - pitch12) > maxDelta12) target = Math.round(pitch12);
    if (target < 0.5 || Math.abs(target - pitch12) > maxDelta12) continue;

    let sx = 0, sy = 0, n = 0;
    for (const p of c.pixels) { sx += g.x[p]; sy += g.y[p]; n++; }
    if (!n) continue;
    const mx = sx / n, my = sy / n;
    const z0 = planeZ(c.plane, mx, my);
    const k = (target / 12) / slope;
    const a = c.plane.a * k, b = c.plane.b * k;
    c.plane = { a, b, c: z0 - a * mx - b * my };
  }
}

// ── 3e. quantize azimuth to the roof's own axes ──────────────────────────────
// Houses are framed on two perpendicular axes, so facets face one of four
// directions relative to those axes. Least-squares planes come back a few degrees
// off, and every downstream line inherits the error: a ridge is the intersection
// of two opposing planes, so if they are not exactly opposed the ridge wanders,
// and hips land at 43 deg or 47 deg instead of 45.
//
// Correcting the PLANES rather than snapping the lines afterwards is what makes
// the geometry self-consistent — once opposing facets are exactly opposed, their
// intersection is exactly parallel to the axis, and perpendicular facets of equal
// pitch meet at exactly 45 deg in plan. The drawing straightens as a consequence
// instead of being forced.
//
// The axis is derived from the facets themselves (area-weighted circular mean of
// azimuth modulo 90), so a house at any angle to true north works.
function quantizeAzimuth(
  clusters: Cluster[],
  g: PixelGeom,
  maxDeltaDeg: number,
): number {
  if (!clusters.length) return 0;
  const D2R = Math.PI / 180;

  // Circular mean of (azimuth mod 90), weighted by area. Doubling to 4x the angle
  // maps the 90 deg period onto a full circle so the mean wraps correctly.
  let sx = 0, sy = 0;
  for (const c of clusters) {
    const slope = Math.hypot(c.plane.a, c.plane.b);
    if (slope < 0.02) continue; // flat facets have no meaningful azimuth
    const az = planeAzimuth(c.plane);
    const a4 = ((az % 90) / 90) * 2 * Math.PI;
    sx += Math.cos(a4) * c.areaSqft;
    sy += Math.sin(a4) * c.areaSqft;
  }
  if (!sx && !sy) return 0;
  const axisDeg = ((Math.atan2(sy, sx) / (2 * Math.PI)) * 90 + 90) % 90;

  for (const c of clusters) {
    const slope = Math.hypot(c.plane.a, c.plane.b);
    if (slope < 0.02) continue;
    const az = planeAzimuth(c.plane);
    // Nearest axis-aligned direction: axisDeg + k*90.
    const k = Math.round((az - axisDeg) / 90);
    const target = axisDeg + k * 90;
    let delta = target - az;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    if (Math.abs(delta) > maxDeltaDeg) continue; // genuinely off-axis facet

    // Rebuild the plane at the snapped azimuth, keeping pitch and the height at
    // the facet's own centroid so it neither tilts nor moves.
    const t = target * D2R;
    const a = -slope * Math.sin(t);
    const b = -slope * Math.cos(t);
    let mx = 0, my = 0, n = 0;
    for (const p of c.pixels) { mx += g.x[p]; my += g.y[p]; n++; }
    if (!n) continue;
    mx /= n; my /= n;
    const z0 = planeZ(c.plane, mx, my);
    c.plane = { a, b, c: z0 - a * mx - b * my };
  }
  return axisDeg;
}

// ── 4. boundary trace (Moore neighbour) ──────────────────────────────────────

function traceRing(assign: Int32Array, id: number, w: number, h: number): number[] {
  // Find the top-left pixel of the cluster.
  let start = -1;
  for (let i = 0; i < assign.length; i++) if (assign[i] === id) { start = i; break; }
  if (start < 0) return [];
  const inC = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && assign[y * w + x] === id;
  // 8-neighbour offsets in CLOCKWISE order; index 4 is west.
  const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const sx = start % w, sy = (start - sx) / w;
  const ring: number[] = [];
  // Proper Moore-neighbour tracing: carry the BACKTRACK direction and always
  // resume the clockwise scan just past it. Tracking only a "last movement"
  // direction (as an earlier version did) lets the walk immediately reverse and
  // oscillate between two pixels — it then hits the return-to-start test after
  // ~4 steps, so a 2000-pixel facet traced as a 4-pixel quadrilateral and every
  // downstream edge measurement collapsed with it.
  //
  // `start` is the first cluster pixel in raster order, so its west neighbour is
  // guaranteed outside — that makes index 4 the correct initial backtrack.
  // Termination is Jacob's criterion: back at the start pixel AND leaving it in
  // the same direction as the first time.
  let px = sx, py = sy, bIdx = 4, firstMove = -1;
  const maxSteps = 8 * (w + h) * 4;
  for (let step = 0; step < maxSteps; step++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (bIdx + k) % 8;
      if (inC(px + N8[d][0], py + N8[d][1])) { found = d; break; }
    }
    if (found < 0) { ring.push(py * w + px); break; } // isolated pixel
    if (px === sx && py === sy) {
      if (firstMove < 0) firstMove = found;
      else if (found === firstMove) break;
    }
    ring.push(py * w + px);
    px += N8[found][0];
    py += N8[found][1];
    bIdx = (found + 4) % 8; // where we just came from, seen from the new pixel
  }
  return ring;
}

// ── 5–7. assemble the model ──────────────────────────────────────────────────

interface FacePoly {
  cluster: Cluster;
  ring: P2[]; //         regularized plan-view corners, CCW
  sharedWith: number[]; // per edge i (ring[i]→ring[i+1]): neighbour cluster id or -1
}

export function reconstructRoof(
  dsm: ReconRaster,
  mask: ReconRaster,
  opts: ReconOptions = {},
): ReconResult {
  const half = opts.normalWindow ?? 2;
  const angleTolDeg = opts.angleTolDeg ?? 14;
  const planeTolFt = opts.planeTolFt ?? DEFAULT_PLANE_TOL_FT;
  // 12 sqft, measured: at 25 the small dormer/entry facets were dropped (15 vs
  // EagleView's 22) and their edges lost with them; at 6 the count is right but
  // noise clusters survive and area falls to -9%. 12 keeps the real small facets
  // without admitting noise.
  const minFacetSqft = opts.minFacetSqft ?? 12;
  const simplifyTolFt = opts.simplifyTolFt ?? 1.5;
  const snapTolDeg = opts.snapTolDeg ?? 12;
  const weldTolFt = opts.weldTolFt ?? 1.4;
  const maxCornerShiftFt = opts.maxCornerShiftFt ?? Math.max(3, simplifyTolFt * 1.5);

  const { width: w, height: h, pixelSizeM } = dsm;
  const stepFt = pixelSizeM * FT_PER_M;
  const maskReport = { componentPx: [] as number[], keptComponents: 0 };
  const building = isolateBuilding(mask, maskReport, opts.parcel, stepFt);
  let buildingPx = 0;
  for (let i = 0; i < building.length; i++) buildingPx += building[i];

  // True outline length of the isolated footprint, straight off the raster. This
  // is the yardstick for the polygons: the sum of their perimeter edges has to
  // land near it, and a shortfall means they are not following the roof edge.
  // (Counted as boundary-pixel edge segments, then scaled by 0.95 to undo the
  // staircase overestimate a rasterized outline always carries.)
  let boundarySegments = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (!building[py * w + px]) continue;
      if (px === 0 || !building[py * w + px - 1]) boundarySegments++;
      if (px === w - 1 || !building[py * w + px + 1]) boundarySegments++;
      if (py === 0 || !building[(py - 1) * w + px]) boundarySegments++;
      if (py === h - 1 || !building[(py + 1) * w + px]) boundarySegments++;
    }
  }
  const maskPerimeterFt = boundarySegments * stepFt * 0.95;

  // Ground reference: a low percentile of the terrain OUTSIDE the building, so
  // z=0 sits at grade rather than at the lowest roof pixel.
  const offRoof: number[] = [];
  for (let i = 0; i < dsm.data.length; i++) if (!building[i]) offRoof.push(dsm.data[i]);
  offRoof.sort((a, b) => a - b);
  const groundElevFt =
    (offRoof.length ? offRoof[Math.floor(offRoof.length * 0.2)] : 0) * FT_PER_M;

  // ── МАСКА ПЕНЕТРАЦИЙ (2026-08-30) ──────────────────────────────────────────
  // Труба/вент загрязняет подгонку плоскостей и рост регионов ИЗНУТРИ
  // кластера (12629: z-рассогласование A7/A3 до 3.8 ft у гребня, куст
  // осколков A1, шпилька ендовы). Пиксели пенетраций исключаются ДО
  // кластеризации, не постфактум. Источники: заявленные кольца
  // (opts.penetrationRingsFt) и DSM-клифы — блоб пикселей над медианой
  // окружающего кольца на ≥ переписной пол ступени (2.0 ft, бимодальный
  // зазор 1.8–2.2) площадью ≤ minFacetSqft (меньше грани — не
  // архитектура). Радиусы кольца — из того же minFacetSqft: полуширина
  // блоба √12/2 ≈ 1.7 ft → внутренний 2 ft, внешний 4 ft.
  const pen = new Uint8Array(w * h);
  {
    const PEN_DZ_FT = 2.0;
    const rIn = Math.max(1, Math.ceil(2 / stepFt));
    const rOut = Math.max(rIn + 1, Math.ceil(4 / stepFt));
    const zft = (i: number): number => dsm.data[i] * FT_PER_M - groundElevFt;
    const cand = new Uint8Array(w * h);
    const base = new Float32Array(w * h);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = py * w + px;
        if (!building[i]) continue;
        const ringZ: number[] = [];
        for (let dy = -rOut; dy <= rOut; dy++) {
          for (let dx = -rOut; dx <= rOut; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < rIn) continue;
            const qx = px + dx;
            const qy = py + dy;
            if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
            const q = qy * w + qx;
            if (building[q]) ringZ.push(zft(q));
          }
        }
        if (ringZ.length < 8) continue;
        ringZ.sort((a2, b2) => a2 - b2);
        const med = ringZ[Math.floor(ringZ.length / 2)];
        if (zft(i) - med >= PEN_DZ_FT) { cand[i] = 1; base[i] = med; }
      }
    }
    const capPx = Math.ceil(minFacetSqft / (stepFt * stepFt));
    const seenP = new Uint8Array(w * h);
    for (let s2 = 0; s2 < cand.length; s2++) {
      if (!cand[s2] || seenP[s2]) continue;
      // возвышенный объект мерится ЦЕЛИКОМ: разлив от кандидата по всем
      // пикселям выше ЕГО базы (медианы кольца) на ≥ порог — угол дормера
      // локально неотличим от трубы, но разлив охватывает весь дормер
      // (30 sf > cap → архитектура), а трубу — только её квадрат
      const med0 = base[s2];
      const blob: number[] = [s2];
      seenP[s2] = 1;
      for (let bi = 0; bi < blob.length; bi++) {
        const i = blob[bi];
        const bx = i % w;
        const by = Math.floor(i / w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const qx = bx + dx;
          const qy = by + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const q = qy * w + qx;
          if (seenP[q] || !building[q]) continue;
          if (zft(q) - med0 >= PEN_DZ_FT) { seenP[q] = 1; blob.push(q); }
        }
      }
      // компактность: пенетрация — квадратный блоб (труба), не дуга вдоль
      // ребра настоящей ступени/дормера (обод даёт кандидатов шириной в
      // пиксель — маска не смеет есть архитектуру). Сторона bbox ≤
      // √minFacetSqft ≈ 3.5 ft — из того же закона «меньше грани».
      let minX = w, maxX = 0, minY = h, maxY = 0;
      for (const i of blob) {
        const bx = i % w;
        const by = Math.floor(i / w);
        minX = Math.min(minX, bx); maxX = Math.max(maxX, bx);
        minY = Math.min(minY, by); maxY = Math.max(maxY, by);
      }
      const sidePx = Math.ceil(Math.sqrt(minFacetSqft) / stepFt);
      const compact = maxX - minX + 1 <= sidePx && maxY - minY + 1 <= sidePx;
      if (compact && blob.length <= capPx) for (const i of blob) pen[i] = 1;
    }
    const inPoly = (x: number, y: number, ring: Array<{ x: number; y: number }>): boolean => {
      let ins = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a2 = ring[i];
        const b2 = ring[j];
        if (a2.y > y !== b2.y > y && x < ((b2.x - a2.x) * (y - a2.y)) / (b2.y - a2.y) + a2.x) ins = !ins;
      }
      return ins;
    };
    const cx2 = w / 2;
    const cy2 = h / 2;
    for (const ring of opts.penetrationRingsFt ?? []) {
      if (ring.length < 3) continue;
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const i = py * w + px;
          if (!building[i] || pen[i]) continue;
          if (inPoly((px + 0.5 - cx2) * stepFt, (cy2 - py - 0.5) * stepFt, ring)) pen[i] = 1;
        }
      }
    }
  }
  const penetrationPx: number[] = [];
  for (let i = 0; i < pen.length; i++) if (pen[i]) penetrationPx.push(i);
  // partic — участники измерения: контур/периметр/земля остаются на building
  const partic = building.slice() as Uint8Array;
  for (const i of penetrationPx) partic[i] = 0;

  const g = computeGeometry(dsm, partic, groundElevFt, half);
  const minPx = Math.max(8, Math.round(minFacetSqft / (stepFt * stepFt)));
  const seg = segmentPlanes(dsm, partic, g, angleTolDeg, planeTolFt, minPx, half);
  const { assign, dropped } = seg;
  let clusters = seg.clusters;

  // Discard anything too steep to be roof before it can influence extents,
  // pitch quantization or edge classification.
  const steep = dropSteepClusters(assign, clusters, opts.maxPitch12 ?? 24);
  clusters = steep.clusters;

  // Grow facets across the normal-transition band so they touch (see above) —
  // this is what restores true extents and makes shared edges detectable.
  claimLeftovers(w, h, building, g, assign, clusters);

  // Reassemble fragments of the same physical plane, then correct slope noise.
  // Order matters: merge first so each pitch is fitted over the whole face.
  const fragmentsBefore = clusters.length;
  const mergeAngleDeg = opts.mergeAngleDeg ?? 6;
  if (mergeAngleDeg > 0) {
    clusters = mergeCoplanar(w, h, assign, g, clusters, mergeAngleDeg, opts.mergeOffsetFt ?? 0.5);
  }
  const pitchSnapMax12 = opts.pitchSnapMax12 ?? 0.75;
  if (pitchSnapMax12 > 0) {
    quantizePitch(clusters, g, opts.pitchPriors12 ?? [], pitchSnapMax12);
  }

  // Areas are needed before azimuth quantization (it weights the axis estimate by
  // facet area), and recomputed after in case a plane's slope changed.
  const pxAreaSqft = stepFt * stepFt;
  const recomputeAreas = () => {
    for (const c of clusters) {
      c.areaSqft = c.pixels.length * pxAreaSqft * Math.hypot(c.plane.a, c.plane.b, 1);
    }
  };
  recomputeAreas();

  const azimuthSnapMaxDeg = opts.azimuthSnapMaxDeg ?? 15;
  const roofAxisDeg =
    azimuthSnapMaxDeg > 0 ? quantizeAzimuth(clusters, g, azimuthSnapMaxDeg) : 0;
  recomputeAreas();

  // ── dominant orientations ──
  // Most roofs are built on two perpendicular axes. Collect edge directions from
  // every traced ring, histogram them modulo 90°, and snap near-misses onto the
  // strongest axis. This is what removes the pixel staircase.
  const rawRings = clusters.map((c) => traceRing(assign, c.id, w, h));
  const angleHist = new Array<number>(90).fill(0);
  for (const ring of rawRings) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const dx = (p % w) - (q % w);
      const dy = Math.floor(p / w) - Math.floor(q / w);
      if (!dx && !dy) continue;
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      deg = ((deg % 90) + 90) % 90;
      angleHist[Math.round(deg) % 90] += Math.hypot(dx, dy);
    }
  }
  let axisDeg = 0, axisBest = -1;
  for (let d = 0; d < 90; d++) {
    // Smooth over ±2° so a near-tie doesn't pick a noisy bin.
    let s = 0;
    for (let k = -2; k <= 2; k++) s += angleHist[(d + k + 90) % 90];
    if (s > axisBest) { axisBest = s; axisDeg = d; }
  }
  // Snap targets are the two axes AND the 45° diagonals between them: on a
  // rectilinear roof, eaves and ridges run along the axes while hips and valleys
  // run at 45° to them. Offering only the axes (as before) left every hip
  // unsnapped and staircased.
  //
  // Prefer the axis derived from the facet planes when azimuth quantization ran —
  // it is area-weighted and independent of the pixel staircase in the traced
  // rings, which biases the edge-direction histogram toward 0/45/90.
  const baseAxisDeg = azimuthSnapMaxDeg > 0 ? roofAxisDeg : axisDeg;
  const axes = [0, 45, 90, 135].map((d) => ((baseAxisDeg + d) * Math.PI) / 180);

  // ── per-cluster regularized polygon ──
  const faces: FacePoly[] = [];
  for (let ci = 0; ci < clusters.length; ci++) {
    const c = clusters[ci];
    const ringPx = rawRings[ci];
    if (ringPx.length < 4) continue;
    const ringFt: P2[] = ringPx.map((i) => ({ x: g.x[i], y: g.y[i] }));
    const keepIdx = simplifyRing(ringFt, simplifyTolFt);
    if (keepIdx.length < 3) continue;

    // For each simplified edge, gather the traced pixels it spans, fit a line,
    // and note which neighbouring cluster (if any) sits across it.
    const edgeLines: Line2[] = [];
    const sharedWith: number[] = [];
    for (let k = 0; k < keepIdx.length; k++) {
      const s = keepIdx[k];
      const e = keepIdx[(k + 1) % keepIdx.length];
      const span: P2[] = [];
      const votes = new Map<number, number>();
      for (let t = s; ; t = (t + 1) % ringFt.length) {
        span.push(ringFt[t]);
        // Who is across this boundary pixel?
        const pi = ringPx[t];
        const px = pi % w, py = (pi - px) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const other = assign[ny * w + nx];
            if (other >= 0 && other !== c.id) votes.set(other, (votes.get(other) ?? 0) + 1);
          }
        }
        if (t === e) break;
      }
      let nb = -1, nbBest = 0;
      for (const [k2, v] of votes) if (v > nbBest) { nbBest = v; nb = k2; }
      // Require a real run of shared pixels, not one diagonal touch.
      if (nbBest < Math.max(3, span.length * 0.35)) nb = -1;

      let line: Line2 | null = null;
      if (nb >= 0) {
        // Shared edge → use the exact plane–plane intersection. This is what
        // makes ridges straight and genuinely shared between two facets.
        line = planeIntersectionLine(c.plane, clusters[nb].plane);
      }
      if (!line) line = fitLine(span);
      if (!line) {
        line = lineFromPointDir(ringFt[s], ringFt[e].x - ringFt[s].x, ringFt[e].y - ringFt[s].y);
      }
      // Snap a free (non-shared) edge onto the roof's dominant axis.
      if (nb < 0) {
        const dirDeg = Math.atan2(line.nx, -line.ny); // direction along the line
        for (const ax of axes) {
          let diff = ((dirDeg - ax) % Math.PI + Math.PI) % Math.PI;
          if (diff > Math.PI / 2) diff -= Math.PI;
          if (Math.abs(diff) <= (snapTolDeg * Math.PI) / 180) {
            const mid = { x: (ringFt[s].x + ringFt[e].x) / 2, y: (ringFt[s].y + ringFt[e].y) / 2 };
            line = lineFromPointDir(mid, Math.cos(ax), Math.sin(ax));
            break;
          }
        }
      }
      edgeLines.push(line);
      sharedWith.push(nb);
    }

    // Corners = intersections of consecutive edge lines.
    //
    // The intersection MUST be sanity-checked against the vertex it replaces.
    // Two nearly-parallel consecutive edges (a common simplification artefact)
    // have a small-but-nonzero determinant, so they do intersect — hundreds of
    // feet away. Left unguarded those runaway corners produced single lines
    // 150 ft long on an 80 m tile, which both wrecked the footage totals and
    // would have drawn spikes across the blueprint. Regularization is allowed to
    // nudge a corner, not relocate it.
    const ring: P2[] = [];
    for (let k = 0; k < edgeLines.length; k++) {
      const prev = edgeLines[(k - 1 + edgeLines.length) % edgeLines.length];
      const traced = ringFt[keepIdx[k]];
      const hit = intersectLines(prev, edgeLines[k]);
      const shift = hit ? Math.hypot(hit.x - traced.x, hit.y - traced.y) : Infinity;
      ring.push(shift <= maxCornerShiftFt ? hit! : traced);
    }
    if (ring.length < 3) continue;
    // Orient CCW so face normals come out consistently.
    if (polygonAreaSigned(ring) < 0) {
      ring.reverse();
      // Edge i of the reversed ring corresponds to a shifted original edge.
      sharedWith.reverse();
      sharedWith.unshift(sharedWith.pop()!);
    }
    faces.push({ cluster: c, ring, sharedWith });
  }

  // ── 6. weld coincident corners ──
  // Facets are regularized independently, so a shared corner lands at slightly
  // different spots in each. Welding on a grid makes the mesh watertight, which
  // both the 3D extrusion and the line dedupe below depend on.
  const welded: RoofPoint[] = [];
  const weldCount: number[] = []; //  samples averaged into welded[i], parallel array
  const cellOf = new Map<string, number>();
  const pointIdFor = (p: P2, z: number): string => {
    // Search the 3x3 cell neighbourhood, not just the containing cell: two
    // corners 0.1 ft apart can straddle a cell boundary, and a single-cell
    // lookup would leave them unwelded — which silently breaks facet adjacency
    // (no shared lines → no ridges/valleys at all).
    const gx = Math.round(p.x / weldTolFt);
    const gy = Math.round(p.y / weldTolFt);
    let bestIdx = -1;
    let bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const idx = cellOf.get(`${gx + dx}:${gy + dy}`);
        if (idx == null) continue;
        const q = welded[idx];
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) { bestD = d; bestIdx = idx; }
      }
    }
    if (bestIdx >= 0 && bestD <= weldTolFt) {
      const pt = welded[bestIdx];
      // Running mean, so a welded corner settles between the facets that meet
      // there. The sample count lives alongside rather than on the RoofPoint,
      // which stays exactly the shape the EagleView parser emits.
      const n = weldCount[bestIdx];
      pt.x = (pt.x * n + p.x) / (n + 1);
      pt.y = (pt.y * n + p.y) / (n + 1);
      pt.z = (pt.z * n + z) / (n + 1);
      weldCount[bestIdx] = n + 1;
      return pt.id;
    }
    const id = `P${welded.length}`;
    welded.push({ id, x: p.x, y: p.y, z });
    weldCount.push(1);
    cellOf.set(`${gx}:${gy}`, welded.length - 1);
    return id;
  };

  const faceRingIds: string[][] = faces.map((f) =>
    f.ring.map((p) => pointIdFor(p, planeZ(f.cluster.plane, p.x, p.y))),
  );

  // ── lines, deduped by unordered endpoint pair ──
  const lineIdByPair = new Map<string, string>();
  const lines: RoofLine[] = [];
  const facesOfLine = new Map<string, number[]>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const ptById = new Map(welded.map((p) => [p.id, p]));

  const faceLineIds: string[][] = [];
  faces.forEach((_f, fi) => {
    const ids = faceRingIds[fi];
    const mine: string[] = [];
    for (let k = 0; k < ids.length; k++) {
      const a = ids[k], b = ids[(k + 1) % ids.length];
      if (a === b) continue; // collapsed by welding
      const key = pairKey(a, b);
      let lid = lineIdByPair.get(key);
      if (!lid) {
        lid = `L${lines.length}`;
        const pa = ptById.get(a)!, pb = ptById.get(b)!;
        lines.push({
          id: lid,
          type: "OTHER", // classified below
          aId: a,
          bId: b,
          lengthFt: Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z),
        });
        lineIdByPair.set(key, lid);
      }
      mine.push(lid);
      const owners = facesOfLine.get(lid) ?? [];
      if (!owners.includes(fi)) owners.push(fi);
      facesOfLine.set(lid, owners);
    }
    faceLineIds.push(mine);
  });

  // ── 7. classify each line ──
  // Classification is done GEOMETRICALLY, by probing the segmented raster either
  // side of each line, rather than topologically by counting the faces that
  // reference it. Facets are regularized independently, so two facets sharing a
  // crease almost never produce identical endpoints — a shared-line count is
  // therefore always 1 and every crease would be misread as a roof perimeter.
  // Probing answers the real question directly: is there roof on both sides?
  const probeFt = 2.2;
  // Reach past the eave overhang before sampling for a wall, and require a real
  // step up rather than DSM noise or a slightly thicker roof edge.
  const wallProbeFt = opts.wallProbeFt ?? 3.0;
  const wallStepFt = opts.wallStepFt ?? 2.5;
  const branch = { crease: 0, sameFacet: 0, perimeter: 0, offRoof: 0 };
  const branchFt = { crease: 0, sameFacet: 0, perimeter: 0, offRoof: 0 };
  const cxPx = w / 2, cyPx = h / 2;
  const pixelAt = (fx: number, fy: number): number => {
    const px = Math.round(fx / stepFt + cxPx - 0.5);
    const py = Math.round(cyPx - 0.5 - fy / stepFt);
    if (px < 0 || py < 0 || px >= w || py >= h) return -1;
    return py * w + px;
  };
  const clusterAt = (fx: number, fy: number): number => {
    const i = pixelAt(fx, fy);
    return i < 0 ? -1 : assign[i];
  };
  // Raw surface height, ground-relative feet — includes walls and everything else
  // the DSM sees, not just pixels that made it into a facet.
  const surfaceZAt = (fx: number, fy: number): number => {
    const i = pixelAt(fx, fy);
    return i < 0 ? -Infinity : g.z[i];
  };

  for (const ln of lines) {
    const pa = ptById.get(ln.aId)!, pb = ptById.get(ln.bId)!;
    const runFt = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    let ux = 0, uy = 0;
    if (runFt > 1e-6) { ux = (pb.x - pa.x) / runFt; uy = (pb.y - pa.y) / runFt; }
    const perpX = -uy, perpY = ux;
    const leftId = clusterAt(mx + perpX * probeFt, my + perpY * probeFt);
    const rightId = clusterAt(mx - perpX * probeFt, my - perpY * probeFt);

    const bk =
      leftId >= 0 && rightId >= 0 && leftId !== rightId
        ? "crease"
        : leftId >= 0 && rightId >= 0
          ? "sameFacet"
          : leftId >= 0 || rightId >= 0
            ? "perimeter"
            : "offRoof";
    branch[bk]++;
    branchFt[bk] += ln.lengthFt;

    if (leftId >= 0 && rightId >= 0 && leftId !== rightId) {
      // Interior crease. Convex (both sides fall away) → ridge or hip;
      // concave (both sides rise) → valley.
      const pl = clusters[leftId].plane, pr = clusters[rightId].plane;
      const zHere = planeZ(pl, mx, my);
      const zThere = planeZ(pr, mx, my);

      // A ridge, hip or valley is a FOLD: both planes meet along it, so they
      // agree in height there. If they disagree by a wall's worth, the facets do
      // not touch — one roof level steps up to another with a wall between, and
      // that run is flashing, not a hip. Missing this test is what inflated HIP
      // by 60% while FLASHING sat at zero.
      const lower = zHere <= zThere ? pl : pr;
      const level = Math.abs(lower.a * ux + lower.b * uy) < 0.12;
      if (Math.abs(zHere - zThere) > wallStepFt) {
        ln.type = level ? "FLASHING" : "STEPFLASH";
        branchFt.crease -= ln.lengthFt; // reclassified, keep the tally honest
        continue;
      }

      const zMid = (zHere + zThere) / 2;
      const zL = planeZ(pl, mx + perpX * probeFt, my + perpY * probeFt);
      const zR = planeZ(pr, mx - perpX * probeFt, my - perpY * probeFt);
      // Level-ness comes from the PLANE, not the welded endpoint z: welding
      // averages a corner's height across every facet meeting there, which tilts
      // an otherwise dead-level edge and made eaves read as rakes.
      const levelOnPlane = Math.abs(pl.a * ux + pl.b * uy) < 0.12;
      if (zL > zMid + 0.15 && zR > zMid + 0.15) ln.type = "VALLEY";
      else ln.type = levelOnPlane ? "RIDGE" : "HIP";
    } else if (leftId >= 0 && rightId >= 0) {
      // Both probes land in the same facet — a simplification artefact cutting
      // across a facet's interior, not a real edge.
      ln.type = "OTHER";
    } else if (leftId >= 0 || rightId >= 0) {
      // Roof one side only. Two possibilities, and they are very different for a
      // roofer: the roof ends in open air (eave/rake), or it runs into a wall that
      // keeps going up (flashing / step flashing).
      //
      // The DSM can tell them apart even though the flashing itself is invisible:
      // a wall shows up as surface height ABOVE the roof plane just past the edge.
      // Open air shows up below it. Without this every roof-to-wall run was filed
      // as eave/rake/hip, which is why FLASHING and STEPFLASH read a flat zero.
      const onLeft = leftId >= 0;
      const own = clusters[onLeft ? leftId : rightId].plane;
      const outX = mx + (onLeft ? -perpX : perpX) * wallProbeFt;
      const outY = my + (onLeft ? -perpY : perpY) * wallProbeFt;
      const roofZ = planeZ(own, mx, my);
      const wall = surfaceZAt(outX, outY) > roofZ + wallStepFt;
      // Level along the slope → runs across it; otherwise it climbs it.
      const level = Math.abs(own.a * ux + own.b * uy) < 0.12;
      if (wall) ln.type = level ? "FLASHING" : "STEPFLASH";
      else ln.type = level ? "EAVE" : "RAKE";
    } else {
      ln.type = "OTHER";
    }
  }

  // ── emit RoofModel ──
  const modelFaces: RoofFace[] = faces.map((f, fi) => ({
    id: `F${fi}`,
    designator: designatorFor(fi),
    pitch: planePitch12(f.cluster.plane),
    areaSqft: f.cluster.areaSqft,
    orientation: planeAzimuth(f.cluster.plane),
    lineIds: faceLineIds[fi],
  }));

  // Footage totals must count each physical edge ONCE. A crease is represented
  // twice — once in each adjoining facet's ring — and both copies have to stay
  // in `lines`, because roofGeometry's ringOf() rebuilds a face by walking its
  // own lineIds and would break if either were removed. So dedupe for the
  // measurement only: longest first, skipping any line that is collinear with
  // and overlapping one already counted. (Verified: creases summed to exactly
  // 2x EagleView's ridge+valley+hip before this.)
  const footageByType = Object.fromEntries(EV_LINE_TYPES.map((t) => [t, 0])) as Record<
    EvLineType,
    number
  >;
  const counted: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
  const byLongest = [...lines].sort((p, q) => q.lengthFt - p.lengthFt);
  for (const l of byLongest) {
    const pa = ptById.get(l.aId)!, pb = ptById.get(l.bId)!;
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (len < 1e-6) continue;
    const ux = (pb.x - pa.x) / len, uy = (pb.y - pa.y) / len;
    let duplicate = false;
    for (const c of counted) {
      const cl = Math.hypot(c.bx - c.ax, c.by - c.ay);
      if (cl < 1e-6) continue;
      const cux = (c.bx - c.ax) / cl, cuy = (c.by - c.ay) / cl;
      if (Math.abs(ux * cux + uy * cuy) < 0.985) continue; // not collinear (>10°)
      // Perpendicular offset of this line's endpoints from the counted one.
      const perp = (x: number, y: number) => Math.abs((x - c.ax) * -cuy + (y - c.ay) * cux);
      if (perp(pa.x, pa.y) > 2 || perp(pb.x, pb.y) > 2) continue;
      // Overlap along the shared direction.
      const t = (x: number, y: number) => (x - c.ax) * cux + (y - c.ay) * cuy;
      const t0 = Math.min(t(pa.x, pa.y), t(pb.x, pb.y));
      const t1 = Math.max(t(pa.x, pa.y), t(pb.x, pb.y));
      if (t1 < 0.5 || t0 > cl - 0.5) continue; // disjoint runs, both are real
      duplicate = true;
      break;
    }
    if (duplicate) continue;
    counted.push({ ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y });
    footageByType[l.type] += l.lengthFt;
  }

  const areaSqft = modelFaces.reduce((a, f) => a + f.areaSqft, 0);
  const pitchArea = new Map<number, number>();
  for (const f of modelFaces) {
    const key = Math.round(f.pitch);
    pitchArea.set(key, (pitchArea.get(key) ?? 0) + f.areaSqft);
  }
  let predominantPitch = 0, maxA = -1;
  for (const [p, a] of pitchArea) if (a > maxA) { maxA = a; predominantPitch = p; }

  const xs = welded.map((p) => p.x), ys = welded.map((p) => p.y), zs = welded.map((p) => p.z);
  const model: RoofModel = {
    source: "synthetic", // callers attach `provenance` (imagery quality/date)
    location: {},
    northOrientation: 0,
    points: welded,
    lines,
    faces: modelFaces,
    penetrations: [],
    totals: {
      areaSqft,
      squares: areaSqft / 100,
      facetCount: modelFaces.length,
      predominantPitch,
      footageByType,
      bounds: {
        minX: Math.min(...xs, 0), maxX: Math.max(...xs, 0),
        minY: Math.min(...ys, 0), maxY: Math.max(...ys, 0),
        minZ: Math.min(...zs, 0), maxZ: Math.max(...zs, 0),
      },
    },
  };

  return {
    model,
    diagnostics: {
      buildingPx,
      penetrationPx,
      clusters: clusters.length,
      droppedClusters: dropped,
      groundElevFt,
      planPolygonSqft: buildingPx * stepFt * stepFt,
      lineCount: lines.length,
      branch,
      branchFt,
      maskPerimeterFt,
      tracePx: faces.map((_, fi) => rawRings[fi]?.length ?? 0),
      corners: faceRingIds.map((r) => r.length),
      // Plan-view sqft of every separate structure in the tile, largest first.
      // Only the first is measured — see isolateBuilding(). A property whose
      // roof spans several detached structures will read low by the rest.
      maskComponentsSqft: maskReport.componentPx.map((n) => n * stepFt * stepFt),
      keptComponents: maskReport.keptComponents,
      parcelScoped: Boolean(opts.parcel && opts.parcel.ring.length >= 3),
      fragmentsBefore,
      fragmentsMerged: fragmentsBefore - clusters.length,
      droppedSteep: steep.droppedSteep,
      pitches12: clusters.map((c) => Math.hypot(c.plane.a, c.plane.b) * 12),
      clusterSqft: clusters.map((c) => c.areaSqft),
      clusterAzimuthDeg: clusters.map((c) => planeAzimuth(c.plane)),
      clusterPlanes: clusters.map((c) => ({ a: c.plane.a, b: c.plane.b, c: c.plane.c })),
      assign,
      clusterSamplesFt: clusters.map((c) => {
        const step = Math.max(1, Math.floor(c.pixels.length / 64));
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < c.pixels.length; i += step) pts.push([g.x[c.pixels[i]], g.y[c.pixels[i]]]);
        return pts;
      }),
      clusterCentroidFt: clusters.map((c) => {
        let sx = 0, sy = 0;
        for (const i of c.pixels) { sx += g.x[i]; sy += g.y[i]; }
        const n = c.pixels.length || 1;
        return [sx / n, sy / n] as [number, number];
      }),
      clusterTopFt: clusters.map((c) => {
        let t = -Infinity;
        for (const i of c.pixels) if (g.z[i] > t) t = g.z[i];
        return t === -Infinity ? 0 : t; // g.z is already height above ground
      }),
      clusterBotFt: clusters.map((c) => {
        let b = Infinity;
        for (const i of c.pixels) if (g.z[i] < b) b = g.z[i];
        return b === Infinity ? 0 : b;
      }),
    },
  };
}

// A1, A2 … then B1 … so the facet table reads like an EagleView report.
function designatorFor(i: number): string {
  const letter = String.fromCharCode(65 + Math.floor(i / 9));
  return `${letter}${(i % 9) + 1}`;
}

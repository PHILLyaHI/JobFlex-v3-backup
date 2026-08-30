// The measured roof: layout led by the DSM, the skeleton demoted to filler.
//
// Three attempts, each measured (ROOF-STATE 2026-08-29):
//   1. Wholesale — adopt reconstructRoof's model, conform the perimeter.
//      Rejected by its own guards 5/5 (Euler −9…0): ring tracing tangles.
//   2. Arrangement of lines — Euler/tiling by construction, but lines carried
//      the STRUCTURE: pairwise closings fragmented apexes, free extensions of
//      short fragments dragged diagonals across the roof, and cells with no
//      lines had nothing to subdivide them. Stopped where "extended" began
//      to guess.
//   3. THIS BUILD — the owner's chosen base carried to its conclusion:
//      «грань определяется своим кластером». Cells come from the CLUSTER
//      REGIONS themselves (regionCells.ts); measured lines only STRAIGHTEN
//      region boundaries (E = L·probe/σ⊥ gates a fragment's reach); nodes
//      resolve MULTI-WAY; a ragged boundary with no line stays as traced —
//      measured by pixel membership. A cell that fails the plane fit at the
//      recon's own growth tolerance goes to FILL, never to a guessed plane.
//
//   contour   Instant (regularised, registered)   — as before
//   cells     cluster regions, boundaries straightened by measured lines
//   fill      unassigned blobs (under crowns) and cells failing the fit —
//             skeleton's plane, datum-aligned to measured neighbours
//   z         the DSM itself at every vertex (surface noise 0.12 ft against
//             extrapolated-plane spread 2.1–14.5 ft); R03 then checks the
//             same vertices the model carries
//   veto      lidar / Hough / vision              — unchanged
import type { RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { reconstructRoof, DEFAULT_PLANE_TOL_FT } from "@/lib/roofRecon";
import { measureDsmLayout, PROBE_FT, type ReconLayoutDiagnostics } from "@/lib/roofRecon/measuredLines";
import { buildRegionCells, type RegionCell } from "@/lib/roofRecon/regionCells";
import { mergeCollinearChains } from "@/lib/roofRecon/straighten";
import { assembleRoofModel, type AssembleCell } from "@/lib/roofRecon/assembleModel";
import { COVERAGE_FLOOR } from "@/lib/roofDiagram/confidence";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { flattenFacets } from "@/lib/roofDiagram/flatten";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { areaOf, signedArea, type FootprintPoint } from "@/lib/roofRecon/footprint";

const FT_PER_M = 3.28084;
/** The step-2 guard: no facet under this survives the stitch. */
const MIN_FACET_SQFT = 15;
/** Crease vs STEP: the boundary Δz census across the six addresses
 *  (boundary-step-census.ts) is bimodal — 79 boundaries under 1 ft, a gap at
 *  1.8–2.2, a tail to 5.3 — so the threshold reads off the gap. Above it the
 *  two planes do not meet: the boundary is a wall between roof LEVELS. */
const STEP_DZ_FT = 2.0;

export type FaceProvenance = "measured-dsm" | "fill";

export interface MeasuredRoofResult {
  model: RoofModel | null;
  /** The stitched candidate even when guards rejected it — so a reviewer can
   *  SEE what was rejected instead of taking the codes' word for it. */
  rejectedCandidate?: RoofModel;
  engine: "measured-dsm" | "skeleton-fill";
  measuredShare: number;
  /** Plan-area shares of the candidate's cells by provenance. */
  provenance: { measuredSqft: number; fillSqft: number; faces: Record<string, FaceProvenance> } | null;
  /** Inter-cluster boundary accounting — the stop-condition numbers. */
  boundary: { straightenedFt: number; raggedFt: number } | null;
  conform: { vertsMoved: number; maxMoveFt: number; reverted: number } | null;
  guards: { euler: number; tilingPct: number; errorCodes: string[]; smallFacets: number };
  /** Per-cell fit census (RMS against the candidate plane, ft). */
  cellStats: Array<{ areaSqft: number; rmsFt: number; prov: FaceProvenance }>;
  /** Для ленты: модель до слоя выпрямления (только при onStage). */
  preStraighten?: RoofModel;
  reasons: string[];
}

export interface MeasuredRoofInput {
  dsm: Raster;
  mask: Raster;
  /** Лента по этапам — passed through to the region-cell construction. */
  onStage?: (stage: "traced" | "straightened" | "nodes" | "terminals", polys: Array<{ pts: FootprintPoint[]; pair: [number, number] }>) => void;
  /** Regularised Instant contour, Instant frame. */
  contour: FootprintPoint[];
  /** Registration Instant→raster. */
  transform: { dxFt: number; dyFt: number; thetaDeg: number };
  /** The skeleton for this structure — the filler and the fallback. */
  skeleton: RoofModel;
}

const inRing = (p: { x: number; y: number }, r: ReadonlyArray<{ x: number; y: number }>): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};

// Euler on the PLAN projection: a step splits points by level, but the plan
// subdivision stays a disk — that is the by-construction invariant.
const eulerOf = (m: RoofModel): number => {
  const pk = new Map<string, string>();
  for (const p of m.points) pk.set(p.id, `${Math.round(p.x * 1000)}|${Math.round(p.y * 1000)}`);
  const verts = new Set(pk.values());
  const planEdges = new Set<string>();
  for (const l of m.lines) {
    const a = pk.get(l.aId)!;
    const b = pk.get(l.bId)!;
    planEdges.add(a < b ? `${a}#${b}` : `${b}#${a}`);
  }
  return verts.size - planEdges.size + m.faces.length;
};

function guardsOf(m: RoofModel, contourSqft: number, footprint?: FootprintPoint[]) {
  const idx = buildIndexes(m);
  let plan = 0;
  let small = 0;
  for (const f of m.faces) {
    const r = ringOf(f.lineIds, idx);
    if (!r || r.length < 3) continue;
    const a = Math.abs(areaOf(r.map((q) => ({ x: q.x, y: q.y }))));
    plan += a;
    if (a < MIN_FACET_SQFT) small++;
  }
  // контур передаётся валидатору обязательно: его собственная сшивка
  // периметра искажается швами (§K — линейка, искажающая измеряемое),
  // и гейт мерил бы модель о свой шов, а не об истинное кольцо
  const errorCodes = [
    ...new Set(
      validateRoofInvariants(m, footprint ? { footprint: footprint.map((q) => [q.x, q.y] as [number, number]) } : undefined)
        .results.filter((x) => x.level === "error")
        .map((x) => x.id),
    ),
  ];
  return {
    euler: eulerOf(m),
    tilingPct: contourSqft > 0 ? Math.abs(plan - contourSqft) / contourSqft * 100 : 0,
    errorCodes,
    smallFacets: small,
  };
}

interface Plane { a: number; b: number; c: number }

/** Least-squares plane through a 3D ring (skeleton faces are planar anyway). */
function fitPlane(pts: Array<{ x: number; y: number; z: number }>): Plane | null {
  let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  const n = pts.length;
  if (n < 3) return null;
  for (const p of pts) {
    sx += p.x; sy += p.y; sz += p.z;
    sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y;
    sxz += p.x * p.z; syz += p.y * p.z;
  }
  const A = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const B = [sxz, syz, sz];
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(A);
  if (Math.abs(d) < 1e-9) return null;
  const col = (k: number) => A.map((row, i) => row.map((v, j) => (j === k ? B[i] : v)));
  return { a: det(col(0)) / d, b: det(col(1)) / d, c: det(col(2)) / d };
}

export function buildMeasuredRoof(input: MeasuredRoofInput): MeasuredRoofResult {
  const { dsm, mask, contour, transform: T, skeleton } = input;
  const reasons: string[] = [];
  const contourSqft = Math.abs(signedArea(contour));

  const th = (T.thetaDeg * Math.PI) / 180;
  const fwd = (p: FootprintPoint): FootprintPoint => ({
    x: p.x * Math.cos(th) - p.y * Math.sin(th) + T.dxFt,
    y: p.x * Math.sin(th) + p.y * Math.cos(th) + T.dyFt,
  });
  const invT = (p: FootprintPoint): FootprintPoint => {
    const x = p.x - T.dxFt;
    const y = p.y - T.dyFt;
    return { x: x * Math.cos(-th) - y * Math.sin(-th), y: x * Math.sin(-th) + y * Math.cos(-th) };
  };
  const movedRing = contour.map(fwd);

  // ── the step-1 measurement, from the same module the harness prints ──
  const recon = reconstructRoof(dsm as never, mask as never);
  const d = recon.diagnostics as unknown as ReconLayoutDiagnostics;
  const groundElevFt = (recon.diagnostics as unknown as { groundElevFt: number }).groundElevFt ?? 0;
  // ── intercept harmonisation, FIRST ──
  // Node construction accepts only CONCURRING lines, and lines built from
  // un-harmonised planes miss triple points by the intercept noise (measured:
  // 6-10 of ~8 apexes per address rejected as non-concurring). The slopes are
  // the measurement and stay; the intercepts close their gaps along the
  // pairs' SHARED BORDERS by least squares, before any line is built.
  {
    const w0 = dsm.width;
    const h0 = dsm.height;
    const step0 = dsm.pixelSizeM * 3.28084;
    const cx0 = w0 / 2;
    const cy0 = h0 / 2;
    interface PairAcc { n: number; sum: number }
    const acc = new Map<string, PairAcc>();
    for (let i = 0; i < w0 * h0; i++) {
      const a = d.assign[i];
      if (a < 0) continue;
      const x = i % w0;
      const y = (i - x) / w0;
      for (const [dx2, dy2] of [[1, 0], [0, 1]] as const) {
        const nx = x + dx2;
        const ny = y + dy2;
        if (nx >= w0 || ny >= h0) continue;
        const b = d.assign[ny * w0 + nx];
        if (b < 0 || b === a) continue;
        const px2 = (x + 0.5 - cx0) * step0;
        const py2 = (cy0 - y - 0.5) * step0;
        const A = d.clusterPlanes[a];
        const B = d.clusterPlanes[b];
        const dz = (A.a * px2 + A.b * py2 + A.c) - (B.a * px2 + B.b * py2 + B.c);
        if (Math.abs(dz) > STEP_DZ_FT) continue; // a step is not a gap to close
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        const rec = acc.get(k) ?? { n: 0, sum: 0 };
        rec.n++;
        rec.sum += a < b ? dz : -dz;
        acc.set(k, rec);
      }
    }
    const ids = [...new Set([...acc.keys()].flatMap((k) => k.split("|").map(Number)))];
    const idxOf = new Map(ids.map((c, i) => [c, i]));
    const n = ids.length;
    if (n > 1) {
      const A2 = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      const B2 = new Array<number>(n).fill(0);
      for (let i2 = 0; i2 < n; i2++) A2[i2][i2] += 1e-6;
      for (const [k, rec] of acc) {
        if (rec.n * step0 < 4) continue; // under the border noise floor
        const [ca, cb] = k.split("|").map(Number);
        const i1 = idxOf.get(ca)!;
        const j1 = idxOf.get(cb)!;
        const delta = rec.sum / rec.n; // mean z_a - z_b on the border
        const wgt = rec.n;
        A2[i1][i1] += wgt; A2[j1][j1] += wgt; A2[i1][j1] -= wgt; A2[j1][i1] -= wgt;
        B2[i1] -= wgt * delta; B2[j1] += wgt * delta;
      }
      for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(A2[r][col]) > Math.abs(A2[piv][col])) piv = r;
        [A2[col], A2[piv]] = [A2[piv], A2[col]];
        [B2[col], B2[piv]] = [B2[piv], B2[col]];
        if (Math.abs(A2[col][col]) < 1e-12) continue;
        for (let r = 0; r < n; r++) {
          if (r === col) continue;
          const f = A2[r][col] / A2[col][col];
          for (let c2 = col; c2 < n; c2++) A2[r][c2] -= f * A2[col][c2];
          B2[r] -= f * B2[col];
        }
      }
      for (const [c, i2] of idxOf) {
        if (Math.abs(A2[i2][i2]) > 1e-12) d.clusterPlanes[c].c += B2[i2] / A2[i2][i2];
      }
    }
  }
  const m = measureDsmLayout({ dsm, diagnostics: d, movedRings: [movedRing] });

  const skeletonWhole = (why: string): MeasuredRoofResult => {
    reasons.push(why);
    return {
      model: skeleton,
      engine: "skeleton-fill",
      measuredShare: m.measuredShare,
      provenance: null,
      boundary: null,
      conform: null,
      guards: guardsOf(skeleton, contourSqft),
      cellStats: [],
      reasons,
    };
  };

  if (m.measuredShare < COVERAGE_FLOOR) {
    return skeletonWhole(
      `only ${(m.measuredShare * 100).toFixed(0)}% of the contour is held by measured clusters — below the ${COVERAGE_FLOOR * 100}% floor the pipeline already treats as "not resolved", so the skeleton fills this structure whole`,
    );
  }

  // ── labels: cluster regions + fill blobs, raster frame ──
  const w = dsm.width;
  const h = dsm.height;
  const stepFt = m.stepFt;
  const pxSqft = stepFt * stepFt;
  const lab = new Int32Array(w * h).fill(-1); // -1 outside, -2 unassigned-inside
  for (let i = 0; i < w * h; i++) {
    const p = m.ftOf(i);
    if (!inRing(p, movedRing)) continue;
    const c = d.assign[i];
    lab[i] = c >= 0 && m.clusterIn[c] ? c : -2;
  }
  // Absorb unassigned strips by dilation, up to one classifier probe — the
  // same bridge the line measurement crosses noisy valley strips with.
  const BRIDGE_PX = Math.max(1, Math.round(PROBE_FT / stepFt));
  const absorb = (): void => {
    for (let pass = 0; pass < BRIDGE_PX; pass++) {
      const next = lab.slice();
      let changed = false;
      for (let i = 0; i < w * h; i++) {
        if (lab[i] !== -2) continue;
        const x = i % w;
        const y = (i - x) / w;
        const counts = new Map<number, number>();
        for (const [dx2, dy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx2;
          const ny = y + dy2;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const v = lab[ny * w + nx];
          if (v >= 0) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top) { next[i] = top[0]; changed = true; }
      }
      lab.set(next);
      if (!changed) break;
    }
  };
  absorb();

  // Connected components -> regions; components under the facet floor
  // dissolve back and re-absorb (below the floor nothing survives anyway);
  // remaining unassigned blobs (under crowns) become fill regions.
  const region = new Int32Array(w * h).fill(-1);
  const regionKind: Array<"cluster" | "fill"> = [];
  const clusterOf: number[] = [];
  const components = (): void => {
    region.fill(-1);
    regionKind.length = 0;
    clusterOf.length = 0;
    const stack: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (lab[i] === -1 || region[i] !== -1) continue;
      const id = regionKind.length;
      const label = lab[i];
      regionKind.push(label >= 0 ? "cluster" : "fill");
      clusterOf.push(label >= 0 ? label : -1);
      stack.length = 0;
      stack.push(i);
      region[i] = id;
      while (stack.length) {
        const j = stack.pop()!;
        const x = j % w;
        const y = (j - x) / w;
        for (const [dx2, dy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx2;
          const ny = y + dy2;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (region[k] !== -1 || lab[k] !== label) continue;
          region[k] = id;
          stack.push(k);
        }
      }
    }
  };
  components();
  {
    const sizePx = new Array<number>(regionKind.length).fill(0);
    for (let i = 0; i < w * h; i++) if (region[i] >= 0) sizePx[region[i]]++;
    let anyTiny = false;
    for (let i = 0; i < w * h; i++) {
      if (region[i] >= 0 && sizePx[region[i]] * pxSqft < MIN_FACET_SQFT) {
        lab[i] = -2;
        anyTiny = true;
      }
    }
    if (anyTiny) {
      absorb();
      components();
    }
  }

  if (process.env.DBG_REGIONS) {
    const px2: Record<number, number> = {};
    for (let i = 0; i < w * h; i++) if (region[i] >= 0) px2[region[i]] = (px2[region[i]] ?? 0) + 1;
    reasons.push(`регионы: ${regionKind.map((k2, i) => `${i}:${k2 === "cluster" ? "c" + clusterOf[i] : "fill"}(${Math.round((px2[i] ?? 0) * stepFt * stepFt)}sf)`).join(" ")}`);
  }
  // ── region cells: boundaries from membership, straightened by lines ──
  // Two passes. The first traces boundaries with the step-1 lines; every
  // cluster|cluster boundary still ragged after it gets a VIRTUAL line —
  // two fitted planes always intersect in a straight line, whether or not
  // the pair cleared the 4-ft publishing floor of step 1 — anchored at the
  // traced boundary itself. «Как есть» honestly remains only where no second
  // plane exists: fill boundaries and steps (there the raggedness IS the
  // measurement). Without this, ragged crease vertices sit off the true
  // fold and no z makes both faces planar (measured: R03 0.13-0.94 ft
  // against the validator's 0.08).
  const baseLines = m.lines.map((l) => ({ a: l.a, b: l.b, between: l.between, sigmaPerpFt: l.sigmaPerpFt, gradDiffPerFt: l.gradDiffPerFt }));
  const runCells = (lines2: typeof baseLines) =>
    buildRegionCells({
      labels: region,
      regionKind,
      clusterOf,
      width: w,
      height: h,
      stepFt,
      contour: movedRing,
      lines: lines2,
      onStage: input.onStage,
      absorbed: (p) => {
        // A 5×5 window with fewer assigned pixels than the recon's own
        // minimum plane-fit support (6 — roofRecon needs pts.length >= 6 to
        // fit locally) holds no evidence for a boundary position.
        let assigned = 0;
        for (let dy2 = -2; dy2 <= 2; dy2++) for (let dx2 = -2; dx2 <= 2; dx2++) {
          const pi = m.pxOf({ x: p.x + dx2 * stepFt, y: p.y + dy2 * stepFt });
          if (pi < 0) continue;
          const c = d.assign[pi];
          if (c >= 0 && m.clusterIn[c]) assigned++;
        }
        return assigned < 6;
      },
      dualFit: (p, line) => {
        const pi = m.pxOf(p);
        if (pi < 0 || mask.data[pi] <= 0.5) return false;
        const z = dsm.data[pi] * FT_PER_M - groundElevFt;
        const A = d.clusterPlanes[line.between[0]];
        const B = d.clusterPlanes[line.between[1]];
        return (
          Math.abs(z - (A.a * p.x + A.b * p.y + A.c)) <= DEFAULT_PLANE_TOL_FT &&
          Math.abs(z - (B.a * p.x + B.b * p.y + B.c)) <= DEFAULT_PLANE_TOL_FT
        );
      },
      minCellSqft: MIN_FACET_SQFT,
    });
  let rcLines = baseLines;
  let rc = runCells(rcLines);
  {
    const have = new Set(baseLines.map((l) => (l.between[0] < l.between[1] ? `${l.between[0]}|${l.between[1]}` : `${l.between[1]}|${l.between[0]}`)));
    const boundaryPts = new Map<string, FootprintPoint[]>();
    for (const cell of rc.cells) {
      for (const e of cell.edges) {
        if (e.prov !== "region-boundary" || !e.pair) continue;
        const ca = clusterOf[e.pair[0]] ?? -1;
        const cb = clusterOf[e.pair[1]] ?? -1;
        if (ca < 0 || cb < 0) continue;
        const k = ca < cb ? `${ca}|${cb}` : `${cb}|${ca}`;
        if (have.has(k)) continue;
        const arr = boundaryPts.get(k) ?? [];
        arr.push(e.a, e.b);
        boundaryPts.set(k, arr);
      }
    }
    const virtual: typeof baseLines = [];
    for (const [k, pts] of boundaryPts) {
      const [ca, cb] = k.split("|").map(Number);
      const A = d.clusterPlanes[ca];
      const B = d.clusterPlanes[cb];
      const da = A.a - B.a;
      const db = A.b - B.b;
      const nrm = Math.hypot(da, db);
      if (nrm < 1e-4) continue; // near-coplanar: z agrees anyway, ragged is harmless
      const dir = { x: -db / nrm, y: da / nrm };
      const mx = pts.reduce((s2, q) => s2 + q.x, 0) / pts.length;
      const my = pts.reduce((s2, q) => s2 + q.y, 0) / pts.length;
      // A STEP pair's plane intersection is fiction — the boundary is a wall,
      // not a fold; projecting the wall trace onto it dragged geometry tens
      // of feet and bred a 176-edge mega-face. Judged at the traced boundary,
      // where the two planes actually stand apart.
      const dzAtBoundary = Math.abs((A.a * mx + A.b * my + A.c) - (B.a * mx + B.b * my + B.c));
      if (dzAtBoundary > STEP_DZ_FT) continue;
      const off = (da * mx + db * my + (A.c - B.c)) / nrm;
      const px0 = { x: mx - (da / nrm) * off, y: my - (db / nrm) * off };
      let t0 = Infinity;
      let t1 = -Infinity;
      let perpSS = 0;
      for (const q of pts) {
        const t = (q.x - px0.x) * dir.x + (q.y - px0.y) * dir.y;
        if (t < t0) t0 = t;
        if (t > t1) t1 = t;
        const perp = (q.x - px0.x) * (da / nrm) + (q.y - px0.y) * (db / nrm);
        perpSS += perp * perp;
      }
      if (!(t1 > t0)) continue;
      virtual.push({
        a: { x: px0.x + dir.x * t0, y: px0.y + dir.y * t0 },
        b: { x: px0.x + dir.x * t1, y: px0.y + dir.y * t1 },
        between: [ca, cb],
        sigmaPerpFt: Math.sqrt(perpSS / pts.length),
        gradDiffPerFt: nrm,
      });
    }
    if (virtual.length) {
      rcLines = [...baseLines, ...virtual];
      rc = runCells(rcLines);
      reasons.push(`${virtual.length} виртуальных линий из плоскостей пар — межкластерные границы спрямлены`);
    }
  }
  for (const r of rc.report) reasons.push(r);
  if (rc.artifactFt > 0.5) reasons.push(`${rc.artifactFt.toFixed(0)} ft границ спрямлено во впитанной территории (dilation-artifact — аналитическая линия без пиксельных свидетельств)`);
  if (!rc.cells.length) return skeletonWhole("no region cells inside the contour — skeleton fill");

  // ── planes per cell: the cluster's plane, accepted only when the cell's
  //    own pixels fit it at the recon's growth tolerance; else FILL —
  //    never a guessed neighbour plane (that was the previous stop) ──
  const clusterPlane = new Map<number, Plane>();
  d.clusterPlanes.forEach((p, i) => { if (m.clusterIn[i]) clusterPlane.set(i, { ...p }); });

  interface CellInfo { cell: RegionCell; rmsFt: number; cluster: number | null; plane: Plane | null; prov: FaceProvenance }
  // The fit judges the cell by the cluster's OWN pixels (d.assign): absorbed
  // strips were unassigned precisely because they fit no plane at the growth
  // tolerance — counting them against the cell rejected half of 12621's area
  // as "fill" on the first region run. They stay acknowledged unknowns.
  const cellRms = (cell: RegionCell, pl: Plane, cl: number): number => {
    const xs = cell.ring.map((p) => p.x);
    const ys = cell.ring.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const step = Math.max(stepFt, Math.min(maxX - minX, maxY - minY) / 12);
    let ss = 0;
    let n = 0;
    for (let y = minY + step / 2; y < maxY; y += step) {
      for (let x = minX + step / 2; x < maxX; x += step) {
        if (!inRing({ x, y }, cell.ring)) continue;
        const pi = m.pxOf({ x, y });
        if (pi < 0 || mask.data[pi] <= 0.5) continue;
        if (d.assign[pi] !== cl) continue;
        const z = dsm.data[pi] * FT_PER_M - groundElevFt;
        const dz = z - (pl.a * x + pl.b * y + pl.c);
        ss += dz * dz;
        n++;
      }
    }
    return n >= 3 ? Math.sqrt(ss / n) : Number.POSITIVE_INFINITY;
  };
  const infos: CellInfo[] = rc.cells.map((cell) => {
    const cl = cell.regionId >= 0 && regionKind[cell.regionId] === "cluster" ? clusterOf[cell.regionId] : -1;
    const pl = cl >= 0 ? clusterPlane.get(cl) : undefined;
    if (pl) {
      const rms = cellRms(cell, pl, cl);
      if (rms <= DEFAULT_PLANE_TOL_FT) return { cell, rmsFt: rms, cluster: cl, plane: pl, prov: "measured-dsm" };
      return { cell, rmsFt: rms, cluster: null, plane: null, prov: "fill" };
    }
    return { cell, rmsFt: Number.POSITIVE_INFINITY, cluster: null, plane: null, prov: "fill" };
  });

  // ── vertex reconciliation: the polyhedron's own points ──
  // Whatever the polyline bookkeeping missed, the assembly-level pass closes:
  // at any vertex where adjacent measured planes still disagree, the exact
  // meet EXISTS — three planes intersect in one point, two in a line — and
  // the vertex moves there. Pixel traces stay provenance; analytic geometry
  // is the model.
  // ── fill planes: the skeleton's plane at the cell, datum-aligned to the
  //    measured neighbours (recon z is ground-relative, skeleton z is not) ──
  const skelIdx = buildIndexes(skeleton);
  const skelFaces = skeleton.faces
    .map((f) => {
      const r = ringOf(f.lineIds, skelIdx);
      if (!r || r.length < 3) return null;
      const plane = fitPlane(r);
      return plane ? { ring: r.map((p) => ({ x: p.x, y: p.y })), plane } : null;
    })
    .filter((x): x is { ring: FootprintPoint[]; plane: Plane } => x !== null);
  // the skeleton lives in the INSTANT frame — evaluate it there
  const skelZAt = (pRaster: FootprintPoint): number => {
    const p = invT(pRaster);
    for (const f of skelFaces) if (inRing(p, f.ring)) return f.plane.a * p.x + f.plane.b * p.y + f.plane.c;
    let best: { d2: number; z: number } | null = null;
    for (const f of skelFaces) {
      const cx2 = f.ring.reduce((s, q) => s + q.x, 0) / f.ring.length;
      const cy2 = f.ring.reduce((s, q) => s + q.y, 0) / f.ring.length;
      const d2 = (cx2 - p.x) ** 2 + (cy2 - p.y) ** 2;
      if (!best || d2 < best.d2) best = { d2, z: f.plane.a * p.x + f.plane.b * p.y + f.plane.c };
    }
    return best?.z ?? 0;
  };
  const skelGradAt = (pRaster: FootprintPoint): { a: number; b: number } => {
    const p = invT(pRaster);
    for (const f of skelFaces) if (inRing(p, f.ring)) return { a: f.plane.a, b: f.plane.b };
    return { a: 0, b: 0 };
  };
  const measuredZAt = (ci: CellInfo, p: FootprintPoint): number =>
    ci.plane ? ci.plane.a * p.x + ci.plane.b * p.y + ci.plane.c : 0;
  const vKey = (p: FootprintPoint) => `${Math.round(p.x * 1000)}|${Math.round(p.y * 1000)}`;
  const vCells = new Map<string, CellInfo[]>();
  for (const ci of infos) for (const p of ci.cell.ring) {
    const arr2 = vCells.get(vKey(p)) ?? [];
    if (!arr2.includes(ci)) arr2.push(ci);
    vCells.set(vKey(p), arr2);
  }
  // ── СХОДИМОСТЬ ПЛОСКОСТЕЙ (2026-08-30) ──
  // Микрошвы ломали грамматику, среднее группы ломало планарность. Выход —
  // не выбор между ними, а настоящая сходимость: у наклонов (a,b) тоже есть
  // неопределённость подгонки, и в её пределах плоскости ДВИГАЮТСЯ так,
  // чтобы встретиться в общих вершинах. Чередование: цель вершины = среднее
  // группы; каждая плоскость кластера рефитится по СВОИМ пикселям плюс
  // вершинным целям с весом (σ_px/σ_v)² = (0.6/0.08)² — обе σ из задачи
  // (допуск роста и бюджет планарности валидатора).
  {
    const W_V = Math.pow(DEFAULT_PLANE_TOL_FT / 0.08, 2);
    // пиксельные нормальные уравнения на кластер (один раз)
    interface Norm { xx: number; xy: number; x: number; yy: number; y: number; n: number; xz: number; yz: number; z: number }
    const pxNorm = new Map<number, Norm>();
    for (const ci of infos) {
      if (ci.prov === "fill" || ci.cluster === null || !ci.plane) continue;
      const acc = pxNorm.get(ci.cluster) ?? { xx: 0, xy: 0, x: 0, yy: 0, y: 0, n: 0, xz: 0, yz: 0, z: 0 };
      const xs = ci.cell.ring.map((q) => q.x);
      const ys = ci.cell.ring.map((q) => q.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const step = Math.max(stepFt, Math.min(maxX - minX, maxY - minY) / 12);
      for (let y = minY + step / 2; y < maxY; y += step) {
        for (let x = minX + step / 2; x < maxX; x += step) {
          if (!inRing({ x, y }, ci.cell.ring)) continue;
          const pi = m.pxOf({ x, y });
          if (pi < 0 || mask.data[pi] <= 0.5) continue;
          if (d.assign[pi] !== ci.cluster) continue;
          const z = dsm.data[pi] * FT_PER_M - groundElevFt;
          acc.xx += x * x; acc.xy += x * y; acc.x += x;
          acc.yy += y * y; acc.y += y; acc.n += 1;
          acc.xz += x * z; acc.yz += y * z; acc.z += z;
        }
      }
      pxNorm.set(ci.cluster, acc);
    }
    // вершины на кластер (те же группы уровней, что и ниже: разрыв > ступени
    // остаётся раздельным)
    interface VRef { p: FootprintPoint; cis: CellInfo[] }
    const vGroups: VRef[] = [];
    for (const [k, cis] of vCells) {
      const p2 = cis[0].cell.ring.find((q) => vKey(q) === k)!;
      const meas = cis.filter((c2) => c2.prov !== "fill" && c2.plane && c2.cluster !== null);
      if (meas.length < 2) continue;
      // одна группа уровня: сортировка по z, цепь с разрывом > ступени
      const entries = meas.map((c2) => ({ c2, z: measuredZAt(c2, p2) })).sort((a3, b3) => a3.z - b3.z);
      let g: typeof entries = [];
      for (const e3 of entries) {
        if (g.length && e3.z - g[g.length - 1].z > STEP_DZ_FT) {
          if (g.length >= 2) vGroups.push({ p: p2, cis: g.map((x2) => x2.c2) });
          g = [];
        }
        g.push(e3);
      }
      if (g.length >= 2) vGroups.push({ p: p2, cis: g.map((x2) => x2.c2) });
    }
    for (let round = 0; round < 20; round++) {
      // цели вершин
      const targets = vGroups.map((vg) => vg.cis.reduce((s2, c2) => s2 + measuredZAt(c2, vg.p), 0) / vg.cis.length);
      // рефит на кластер
      const acc2 = new Map<number, Norm>();
      vGroups.forEach((vg, gi) => {
        const zt = targets[gi];
        for (const c2 of vg.cis) {
          const a2 = acc2.get(c2.cluster!) ?? { xx: 0, xy: 0, x: 0, yy: 0, y: 0, n: 0, xz: 0, yz: 0, z: 0 };
          const { x, y } = vg.p;
          a2.xx += W_V * x * x; a2.xy += W_V * x * y; a2.x += W_V * x;
          a2.yy += W_V * y * y; a2.y += W_V * y; a2.n += W_V;
          a2.xz += W_V * x * zt; a2.yz += W_V * y * zt; a2.z += W_V * zt;
          acc2.set(c2.cluster!, a2);
        }
      });
      for (const [cl, pl] of clusterPlane) {
        const px2 = pxNorm.get(cl);
        const vx = acc2.get(cl);
        if (!px2 || px2.n < 6) continue;
        const A2 = [
          [px2.xx + (vx?.xx ?? 0), px2.xy + (vx?.xy ?? 0), px2.x + (vx?.x ?? 0)],
          [px2.xy + (vx?.xy ?? 0), px2.yy + (vx?.yy ?? 0), px2.y + (vx?.y ?? 0)],
          [px2.x + (vx?.x ?? 0), px2.y + (vx?.y ?? 0), px2.n + (vx?.n ?? 0)],
        ];
        const B2 = [px2.xz + (vx?.xz ?? 0), px2.yz + (vx?.yz ?? 0), px2.z + (vx?.z ?? 0)];
        const det3 = (mm: number[][]) =>
          mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1]) -
          mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0]) +
          mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0]);
        const dd = det3(A2);
        if (Math.abs(dd) < 1e-9) continue;
        const col = (k2: number) => A2.map((row, i3) => row.map((v3, j3) => (j3 === k2 ? B2[i3] : v3)));
        pl.a = det3(col(0)) / dd;
        pl.b = det3(col(1)) / dd;
        pl.c = det3(col(2)) / dd;
      }
    }
    // остаточная несходимость — в отчёт
    let worst = 0;
    vGroups.forEach((vg) => {
      const zs = vg.cis.map((c2) => measuredZAt(c2, vg.p));
      worst = Math.max(worst, Math.max(...zs) - Math.min(...zs));
    });
    reasons.push(`сходимость плоскостей: ${vGroups.length} общих вершин, остаточный разрыв ${worst.toFixed(3)} ft`);
  }

  const fillDz = new Map<CellInfo, number>();
  {
    const deltas: number[] = [];
    for (const ci of infos) {
      if (ci.prov === "fill") continue;
      for (const p of ci.cell.ring) deltas.push(measuredZAt(ci, p) - skelZAt(p));
    }
    const globalDz = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
    for (const ci of infos) {
      if (ci.prov !== "fill") continue;
      const local: number[] = [];
      for (const p of ci.cell.ring) {
        for (const other of vCells.get(vKey(p)) ?? []) {
          if (other.prov !== "fill" && other.plane) local.push(measuredZAt(other, p) - skelZAt(p));
        }
      }
      fillDz.set(ci, local.length ? local.reduce((a, b) => a + b, 0) / local.length : globalDz);
    }
  }
  const zOfInfo = (ci: CellInfo, p: FootprintPoint): number =>
    ci.plane && ci.prov !== "fill" ? measuredZAt(ci, p) : skelZAt(p) + (fillDz.get(ci) ?? 0);

  // Vertex LEVELS: adjacent cells' z values cluster with a gap threshold —
  // one group is one welded point. A single group of >=2 cells takes the DSM
  // (it resolves crease disagreement; surface noise 0.12 ft); a perimeter
  // vertex takes its own plane (the 3×3 window at the roof edge catches
  // ground pixels inside the loose mask); multiple groups are a STEP — each
  // level keeps its own z and its own point (weld tag), because the surface
  // is discontinuous there and any shared z would be the wall's middle.
  const vzOf = new Map<string, Map<CellInfo, { z: number; tag?: string }>>();
  for (const [k, cis] of vCells) {
    const p = cis[0].cell.ring.find((q) => vKey(q) === k)!;
    const entries = cis.map((ci) => ({ ci, z: zOfInfo(ci, p) })).sort((a, b) => a.z - b.z);
    const groups: Array<Array<{ ci: CellInfo; z: number }>> = [];
    for (const e of entries) {
      const g = groups[groups.length - 1];
      if (g && e.z - g[g.length - 1].z <= STEP_DZ_FT) g.push(e);
      else groups.push([e]);
    }
    const out = new Map<CellInfo, { z: number; tag?: string }>();
    // Residual disagreement that averaging cannot hide: the validator allows
    // a face 0.08 ft of planarity, and the LS refit does not split a vertex
    // mean evenly — so any same-level mismatch beyond that very budget
    // SPLITS into a micro-seam (each side on its own plane), like a step.
    // Порог расщепления — ПОСЛЕ сходимости плоскостей: всё, что могло
    // сойтись, сошлось (чередующийся фит выше), и оставшийся разрыв —
    // настоящий перепад (дормер, борт), а не шум подгонки. 2×0.08 — бюджет
    // планарности валидатора на обе стороны. Старый порог 0.08 ДО
    // сходимости плодил микрошвы и ломал грамматику (62 «rake внутри
    // крыши»); порог «только ступени 2.0» ломал планарность.
    // Расщепление вершины — это заявление СТЕНЫ, и заявляется она только
    // от переписного пола ступени (бимодальный зазор 1.8–2.2). Прежний
    // порог 0.08 (бюджет планарности) публиковал невязку подгонки как
    // архитектуру: 25 фантомных пар EAVE/FLASHING на 12629 при Δz
    // 0.16–1.5 — крошка по периметру, лесенка угла, обрыв ендовы, зазор
    // конька (пять мест владельца). Ниже пола вершина СВАРИВАЕТСЯ в
    // измеренное среднее, невязку разносит flatten (его бюджет 2.6 ft
    // на 419 уже держит).
    const SPLIT_TOL = STEP_DZ_FT;
    {
      const regrouped: typeof groups = [];
      for (const g of groups) {
        let cur: (typeof g[number])[] = [];
        for (const e of g) {
          if (cur.length && e.z - cur[cur.length - 1].z > SPLIT_TOL) { regrouped.push(cur); cur = []; }
          cur.push(e);
        }
        if (cur.length) regrouped.push(cur);
      }
      groups.length = 0;
      groups.push(...regrouped);
    }
    const groupZ = (g: Array<{ ci: CellInfo; z: number }>): number => {
      // Measured planes carry the vertex; fill planes (skeleton + datum
      // offset) FOLLOW — averaging them in bent measured faces by 0.5-1 ft.
      const meas = g.filter((e) => e.ci.prov !== "fill");
      const src = meas.length ? meas : g;
      return src.reduce((s2, e) => s2 + e.z, 0) / src.length;
    };
    if (groups.length === 1) {
      const z = groupZ(groups[0]);
      for (const e of groups[0]) out.set(e.ci, { z });
    } else {
      groups.forEach((g, gi) => {
        const z = groupZ(g);
        for (const e of g) out.set(e.ci, { z, tag: `L${gi}` });
      });
    }
    vzOf.set(k, out);
  }

  // ── assemble in the raster frame (lengths/areas are rotation-invariant),
  //    then carry the points back into the Instant frame ──
  const typeByRingEdge: Array<"RAKE" | "EAVE" | undefined> = [];
  {
    // measureDsmLayout types ring edges >= 4 ft in ring order; rebuild the map.
    let k = 0;
    for (let i = 0; i < movedRing.length; i++) {
      const a = movedRing[i];
      const b = movedRing[(i + 1) % movedRing.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 4) { typeByRingEdge.push(undefined); continue; }
      const t = m.edges[k++]?.type;
      typeByRingEdge.push(t === "RAKE" || t === "EAVE" ? t : undefined);
    }
  }
  const clusterPairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const typeForPair = new Map<string, "RIDGE" | "HIP" | "VALLEY">();
  for (const l of m.lines) typeForPair.set(clusterPairKey(l.between[0], l.between[1]), l.type);

  const planEdgeKey = (a: FootprintPoint, b: FootprintPoint) => {
    const k1 = `${Math.round(a.x * 20)}|${Math.round(a.y * 20)}`;
    const k2 = `${Math.round(b.x * 20)}|${Math.round(b.y * 20)}`;
    return k1 < k2 ? `${k1}#${k2}` : `${k2}#${k1}`;
  };
  const planEdgeCount = new Map<string, number>();
  for (const ci of infos) for (const e of ci.cell.edges) {
    const k = planEdgeKey(e.a, e.b);
    planEdgeCount.set(k, (planEdgeCount.get(k) ?? 0) + 1);
  }
  const cells: AssembleCell[] = infos.map((ci) => {
    const grad = ci.plane && ci.prov !== "fill"
      ? { a: ci.plane.a, b: ci.plane.b }
      : skelGradAt({
          x: ci.cell.ring.reduce((s, q) => s + q.x, 0) / ci.cell.ring.length,
          y: ci.cell.ring.reduce((s, q) => s + q.y, 0) / ci.cell.ring.length,
        });
    // downhill azimuth reported in the INSTANT frame
    const dh = { x: -grad.a * Math.cos(-th) + grad.b * Math.sin(-th), y: -grad.a * Math.sin(-th) - grad.b * Math.cos(-th) };
    const vAt = (p: FootprintPoint) => vzOf.get(vKey(p))?.get(ci) ?? { z: zOfInfo(ci, p) };
    // an edge is a STEP side when either endpoint splits into levels here,
    // ИЛИ когда у ребра есть плановый близнец в другой ячейке (шов без метки
    // вершины падал в геометрический классификатор и выходил «rake внутри
    // крыши» — грамматика G2 поймала это массово)
    const isStepEdge = (e: (typeof ci.cell.edges)[number]): boolean => {
      if ((vzOf.get(vKey(e.a))?.get(ci)?.tag !== undefined) || (vzOf.get(vKey(e.b))?.get(ci)?.tag !== undefined)) return true;
      const twins = planEdgeCount.get(planEdgeKey(e.a, e.b)) ?? 0;
      return twins >= 2 && e.prov !== "contour";
    };
    const upperAt = (e: (typeof ci.cell.edges)[number]): boolean => {
      // this cell is the UPPER side when its z at the edge midpoint exceeds
      // the neighbour's — compare against every other cell sharing the edge
      const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
      const mine = zOfInfo(ci, mid);
      for (const other of infos) {
        if (other === ci) continue;
        if (other.cell.edges.some((oe) => (vKey(oe.a) === vKey(e.a) && vKey(oe.b) === vKey(e.b)) || (vKey(oe.a) === vKey(e.b) && vKey(oe.b) === vKey(e.a)))) {
          return mine > zOfInfo(other, mid);
        }
      }
      return true;
    };
    return {
      ring: ci.cell.ring.map((p) => {
        const v = vAt(p);
        return { x: p.x, y: p.y, z: v.z, tag: v.tag };
      }),
      pitch12: Math.hypot(grad.a, grad.b) * 12,
      orientationDeg: ((Math.atan2(dh.x, dh.y) * 180) / Math.PI + 360) % 360,
      zOf: (x, y) => zOfInfo(ci, { x, y }),
      edgeTypes: ci.cell.edges.map((e) => {
        if (e.prov !== "contour" && isStepEdge(e)) return upperAt(e) ? "EAVE" : "FLASHING";
        if (e.prov === "measured-line" && e.lineIndex !== undefined) {
          const vl = rcLines[e.lineIndex];
          const known = typeForPair.get(clusterPairKey(vl.between[0], vl.between[1]));
          if (known) return known;
          // виртуальная линия без типа шага 1: placeholder OTHER — иначе
          // геометрический классификатор сборки звал её RAKE внутри крыши;
          // перетипизация по финальным плоскостям даст честный тип
          return "OTHER";
        }
        if (e.prov === "region-boundary" && e.pair) {
          const ca = clusterOf[e.pair[0]] ?? -1;
          const cb = clusterOf[e.pair[1]] ?? -1;
          if (ca >= 0 && cb >= 0) return typeForPair.get(clusterPairKey(ca, cb));
          // заполнитель не заявляет тип, которого не мерил: граница с fill —
          // OTHER (нейтральная линия), не RAKE от геометрического классификатора
          return "OTHER";
        }
        if (e.prov === "contour" && e.contourIndex !== undefined) return typeByRingEdge[e.contourIndex];
        // рёбра fill-ячеек внутри крыши — тоже без заявлений
        return e.prov !== "contour" ? "OTHER" : undefined;
      }),
    };
  });

  const assembled = assembleRoofModel({ cells, base: skeleton, idPrefix: "M", structureIndex: 0 });
  if (!assembled) return skeletonWhole("assembly failed on a degenerate cell — skeleton fill");

  // ── flatten: the DSM settled every vertex on the surface; the global
  //    z-solve (flatten.ts — one plane per facet, vertices onto the point the
  //    meeting planes imply) turns "on the surface" into "a polyhedron":
  //    R03 planarity by construction, at the validator's 0.08 ft, which raw
  //    surface samples (noise 0.12 ft) can never hold on their own. ──
  const flat = flattenFacets(assembled);
  const candidate = flat.model;
  // ── СЛОЙ ВЫПРЯМЛЕНИЯ: коллинеарное слияние звеньев (до типизации) ──
  const preStraighten = input.onStage ? (JSON.parse(JSON.stringify(candidate)) as RoofModel) : undefined;
  // коридор на линию модели — сопоставлением с несущими (обе точки в
  // пределах коридора от одной несущей)
  const corridorOfLine = (() => {
    const geo = rcLines.map((l) => {
      const L = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) || 1;
      const d2 = { x: (l.b.x - l.a.x) / L, y: (l.b.y - l.a.y) / L };
      const n2 = { x: -d2.y, y: d2.x };
      const corr = l.gradDiffPerFt > 1e-6 ? DEFAULT_PLANE_TOL_FT / l.gradDiffPerFt + m.stepFt : m.stepFt;
      return { a: l.a, n: n2, corr };
    });
    const ptById3 = new Map(candidate.points.map((pt) => [pt.id, pt]));
    return (lineId: string): number => {
      const l = candidate.lines.find((x) => x.id === lineId);
      if (!l) return 0;
      const A = ptById3.get(l.aId);
      const B = ptById3.get(l.bId);
      if (!A || !B) return 0;
      let best = 0;
      for (const g of geo) {
        const pa = Math.abs((A.x - g.a.x) * g.n.x + (A.y - g.a.y) * g.n.y);
        const pb = Math.abs((B.x - g.a.x) * g.n.x + (B.y - g.a.y) * g.n.y);
        if (pa <= g.corr && pb <= g.corr) best = Math.max(best, g.corr);
      }
      return best;
    };
  })();
  const straighten = mergeCollinearChains(candidate, m.stepFt, corridorOfLine);
  if (straighten.merged || straighten.collapsed) reasons.push(`выпрямление: ${straighten.collapsed} огрызков схлопнуто (< 4 ft — шумовой пол шага 1), ${straighten.merged} звеньев слито; канон: ${rc.canonSnapped} линий`);
  reasons.push(`flatten: dev ${flat.report.devBeforeFt} → ${flat.report.devAfterFt} ft, ${flat.report.pointsMoved} vertices, max move ${flat.report.maxMoveFt} ft`);
  // figures follow the flattened geometry: pitch and area per face refit
  {
    const idx2 = buildIndexes(candidate);
    let total = 0;
    for (const f of candidate.faces) {
      const r = ringOf(f.lineIds, idx2);
      if (!r || r.length < 3) continue;
      const pl = fitPlane(r);
      if (!pl) continue;
      f.pitch = Math.hypot(pl.a, pl.b) * 12;
      const plan = Math.abs(signedArea(r.map((q) => ({ x: q.x, y: q.y }))));
      f.areaSqft = plan * Math.sqrt(1 + (f.pitch / 12) ** 2);
      total += f.areaSqft;
    }
    const footage = {} as Record<string, number>;
    for (const l of candidate.lines) footage[l.type] = (footage[l.type] ?? 0) + l.lengthFt;
    for (const t of ["EAVE", "RIDGE", "VALLEY", "HIP", "RAKE", "FLASHING", "STEPFLASH", "OTHER"]) footage[t] = footage[t] ?? 0;
    candidate.totals = {
      ...candidate.totals,
      areaSqft: total,
      squares: total / 100,
      footageByType: footage as typeof candidate.totals.footageByType,
    };
  }
  for (const p of candidate.points) {
    const q = invT(p);
    p.x = q.x;
    p.y = q.y;
  }

  // ── ТИПИЗАЦИЯ НА ГОТОВОМ ПОЛИЭДРЕ: один проход, явный приоритет ──
  // 1. контурные рёбра — EAVE/RAKE шага 1;
  // 2. линия двух граней — правило складки по ФИНАЛЬНЫМ плоскостям,
  //    сторонозависимо (§K12), ровность 0.5/12;
  // 3. плановые близнецы (расщеплённые уровни): Δz ≥ SPLIT — ступень
  //    (верх EAVE / низ FLASHING); меньше — один тип складки на пару;
  // 4. одновладельная внутренняя линия — кромка разбиения STEPFLASH:
  //    заполнитель и осколки не заявляют тип, которого не мерили.
  // Погонаж: одна линия на план-позицию, ступень считает обе стороны.
  {
    const ptById = new Map(candidate.points.map((pt) => [pt.id, pt]));
    const idxT = buildIndexes(candidate);
    const facePlane = new Map<string, Plane>();
    const faceCentroid = new Map<string, FootprintPoint>();
    for (const f of candidate.faces) {
      // кольцо с щипком не сшивается, но плоскости порядок обхода не нужен:
      // берём точки линий грани как облако — иначе близнецы конька без
      // плоскости владельца пережимались фолбэком в STEPFLASH (магента)
      let r = ringOf(f.lineIds, idxT);
      if (!r || r.length < 3) {
        const seen = new Set<string>();
        const cloud: (typeof candidate.points)[number][] = [];
        for (const id of new Set(f.lineIds)) {
          const l = candidate.lines.find((l2) => l2.id === id);
          if (!l) continue;
          for (const pid of [l.aId, l.bId]) {
            if (seen.has(pid)) continue;
            seen.add(pid);
            const pt = ptById.get(pid);
            if (pt) cloud.push(pt);
          }
        }
        r = cloud.length >= 3 ? cloud : null;
      }
      if (!r || r.length < 3) continue;
      const pl = fitPlane(r);
      if (pl) facePlane.set(f.id, pl);
      faceCentroid.set(f.id, {
        x: r.reduce((s2, q) => s2 + q.x, 0) / r.length,
        y: r.reduce((s2, q) => s2 + q.y, 0) / r.length,
      });
    }
    const ownersOf = new Map<string, string[]>();
    for (const f of candidate.faces) for (const id of new Set(f.lineIds)) {
      const arr = ownersOf.get(id) ?? [];
      if (!arr.includes(f.id)) arr.push(f.id);
      ownersOf.set(id, arr);
    }
    const planKey = (pid: string) => {
      const pt = ptById.get(pid)!;
      return `${Math.round(pt.x * 100)}|${Math.round(pt.y * 100)}`;
    };
    const groupsL = new Map<string, Array<(typeof candidate.lines)[number]>>();
    for (const l of candidate.lines) {
      const a = planKey(l.aId);
      const b = planKey(l.bId);
      const k = a < b ? `${a}#${b}` : `${b}#${a}`;
      const g = groupsL.get(k) ?? [];
      g.push(l);
      groupsL.set(k, g);
    }
    const distRing = (pt: { x: number; y: number }): number => {
      let best = Infinity;
      for (let i = 0; i < contour.length; i++) {
        const a = contour[i];
        const b = contour[(i + 1) % contour.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2));
        best = Math.min(best, Math.hypot(pt.x - (a.x + dx * t), pt.y - (a.y + dy * t)));
      }
      return best;
    };
    const LEVEL_SLOPE = 0.5 / 12; // закон складок (creases.ts)
    const creaseType = (l: (typeof candidate.lines)[number], ownerIds: string[]): string | null => {
      const own = ownerIds
        .map((fid) => ({ pl: facePlane.get(fid), c: faceCentroid.get(fid) }))
        .filter((x): x is { pl: Plane; c: FootprintPoint } => !!x.pl && !!x.c);
      if (own.length < 2) return null;
      const a = ptById.get(l.aId)!;
      const b = ptById.get(l.bId)!;
      const run = Math.hypot(b.x - a.x, b.y - a.y);
      if (run < 1e-6) return null;
      const level = Math.abs(a.z - b.z) <= Math.max(0.08, LEVEL_SLOPE * run);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zc = (a.z + b.z) / 2;
      const dir = { x: (b.x - a.x) / run, y: (b.y - a.y) / run };
      const per = { x: -dir.y, y: dir.x };
      const side = (o: { pl: Plane; c: FootprintPoint }) =>
        Math.sign((o.c.x - mid.x) * per.x + (o.c.y - mid.y) * per.y) || 1;
      const s1 = side(own[0]);
      const s2b = side(own[1]);
      const z1 = own[0].pl.a * (mid.x + per.x * s1 * PROBE_FT) + own[0].pl.b * (mid.y + per.y * s1 * PROBE_FT) + own[0].pl.c;
      const z2 = own[1].pl.a * (mid.x + per.x * s2b * PROBE_FT) + own[1].pl.b * (mid.y + per.y * s2b * PROBE_FT) + own[1].pl.c;
      if (z1 > zc && z2 > zc) return "VALLEY";
      if (z1 < zc && z2 < zc) return level ? "RIDGE" : "HIP";
      return null;
    };
    const zOfLine = (l: (typeof candidate.lines)[number]) => (ptById.get(l.aId)!.z + ptById.get(l.bId)!.z) / 2;
    const footage2 = {} as Record<string, number>;
    const bump = (t: string, v: number) => { footage2[t] = (footage2[t] ?? 0) + v; };
    for (const g of groupsL.values()) {
      const l0 = g[0];
      const onRing = distRing(ptById.get(l0.aId)!) <= 1 && distRing(ptById.get(l0.bId)!) <= 1;
      if (g.length >= 2) {
        const zs = g.map(zOfLine);
        // СТЕНА заявляется только от переписного пола ступени (STEP_DZ_FT,
        // бимодальный зазор 1.8–2.2): порог различения уровней 0.16 — это
        // «нельзя сварить», а не «есть ступень» (§K12: 25 фантомных пар
        // EAVE/FLASHING на 12629 при Δz 0.16–1.5 — невязка подгонки,
        // опубликованная как архитектура; честные клифы трубы 2.15–2.43)
        if (Math.max(...zs) - Math.min(...zs) >= STEP_DZ_FT) {
          // ступень: верхняя сторона EAVE, нижняя FLASHING; погонаж — обе
          const top = Math.max(...zs);
          for (const l of g) l.type = zOfLine(l) >= top - 1e-6 ? "EAVE" : "FLASHING";
          for (const l of g) bump(l.type, l.lengthFt);
          continue;
        }
        // близнецы одного уровня: один тип складки на всех, счёт один раз.
        // Складки нет (пробы монотонны — перелом уклона одной стороны, напр.
        // 7.8/12 → 5.6/12 у гребня 12629): измеренная граница двух граней —
        // нейтральный переход OTHER; STEPFLASH — только кромка разбиения
        // одновладельца, легенда не заявляет немеренного
        const allOwners = [...new Set(g.flatMap((l) => ownersOf.get(l.id) ?? []))];
        const t = creaseType(l0, allOwners) ?? (onRing ? l0.type : allOwners.length >= 2 ? "OTHER" : "STEPFLASH");
        for (const l of g) l.type = t as (typeof l0)["type"];
        bump(t, l0.lengthFt);
        continue;
      }
      // одиночная линия
      const owners = ownersOf.get(l0.id) ?? [];
      if (owners.length >= 2) {
        const t = creaseType(l0, owners);
        if (t) l0.type = t as (typeof l0)["type"];
        // нерешённый перегиб ВНЕ кольца не имеет права зваться RAKE/EAVE —
        // на контуре типы шага 1 остаются, внутри крыши это OTHER
        else if (!onRing && (l0.type === "RAKE" || l0.type === "EAVE")) l0.type = "OTHER";
      } else if (!onRing) {
        // одновладельная внутренняя — кромка разбиения
        l0.type = "STEPFLASH";
      }
      bump(l0.type, l0.lengthFt);
    }
    // непрерывность: OTHER-кусок с двумя владельцами, оба конца которого
    // продолжают складку одного типа, — часть этой складки (нейтральные
    // куски рвали цепи и плодили ложные G2-терминации)
    for (let round = 0; round < 3; round++) {
      const byEnd = new Map<string, Array<(typeof candidate.lines)[number]>>();
      for (const l of candidate.lines) {
        for (const pid of [l.aId, l.bId]) {
          const k2 = planKey(pid);
          const arr = byEnd.get(k2) ?? [];
          arr.push(l);
          byEnd.set(k2, arr);
        }
      }
      let changed = false;
      for (const l of candidate.lines) {
        if (l.type !== "OTHER") continue;
        if ((ownersOf.get(l.id) ?? []).length < 2) continue;
        const endTypes = (pid: string): Set<string> => {
          const out2 = new Set<string>();
          for (const o of byEnd.get(planKey(pid)) ?? []) {
            if (o === l) continue;
            if (o.type === "RIDGE" || o.type === "HIP" || o.type === "VALLEY") out2.add(o.type);
          }
          return out2;
        };
        const ta = endTypes(l.aId);
        const tb = endTypes(l.bId);
        const both = [...ta].filter((t) => tb.has(t));
        const one = both.length === 1 ? both[0] : (ta.size === 1 && tb.size === 0 ? [...ta][0] : (tb.size === 1 && ta.size === 0 ? [...tb][0] : null));
        if (one) {
          // погонаж уже посчитан как OTHER — переложим
          footage2["OTHER"] = (footage2["OTHER"] ?? 0) - l.lengthFt;
          footage2[one] = (footage2[one] ?? 0) + l.lengthFt;
          l.type = one as (typeof l)["type"];
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (const t of ["EAVE", "RIDGE", "VALLEY", "HIP", "RAKE", "FLASHING", "STEPFLASH", "OTHER"]) footage2[t] = footage2[t] ?? 0;
    candidate.totals = { ...candidate.totals, footageByType: footage2 as typeof candidate.totals.footageByType };
  }

  // provenance per face: replicate the assembler's stable area-rank order  // provenance per face: replicate the assembler's stable area-rank order
  const order = infos
    .map((ci, i) => ({ i, area: Math.abs(signedArea(ci.cell.ring)) }))
    .sort((x, y) => x.area - y.area);
  const provFaces: Record<string, FaceProvenance> = {};
  let measuredSqft = 0;
  let fillSqft = 0;
  order.forEach((o, rank) => {
    const ci = infos[o.i];
    provFaces[`s0:MF${rank + 1}`] = ci.prov;
    if (ci.prov === "measured-dsm") measuredSqft += o.area;
    else fillSqft += o.area;
  });
  const provenance = { measuredSqft, fillSqft, faces: provFaces };
  const boundary = { straightenedFt: rc.straightenedFt, raggedFt: rc.raggedFt };
  const cellStats = infos.map((ci) => ({
    areaSqft: Math.abs(signedArea(ci.cell.ring)),
    rmsFt: ci.rmsFt,
    prov: ci.prov,
  }));

  const guards = guardsOf(candidate, contourSqft, contour);
  if (rc.euler !== 1) reasons.push(`region graph Euler ${rc.euler} — построение не то, чем назвалось`);
  if (rc.tilingPct > 0.5) reasons.push(`region tiling off by ${rc.tilingPct.toFixed(2)}%`);

  // The stitch must not ship worse topology than the skeleton it replaces.
  const gViolated = guards.errorCodes.some((c) => c.startsWith("G"));
  if (guards.euler !== 1 || guards.errorCodes.includes("R03") || guards.errorCodes.includes("R04") || gViolated || guards.tilingPct > 0.5) {
    reasons.push(
      `stitched model fails hard guards (Euler ${guards.euler}, tiling ${guards.tilingPct.toFixed(2)}%, codes ${guards.errorCodes.join("/") || "none"}) — skeleton kept`,
    );
    return {
      model: skeleton,
      engine: "skeleton-fill",
      rejectedCandidate: candidate,
      measuredShare: m.measuredShare,
      provenance,
      boundary,
      conform: null,
      guards: guardsOf(skeleton, contourSqft),
      cellStats,
      reasons,
    };
  }
  if (guards.smallFacets > 0) reasons.push(`${guards.smallFacets} facet(s) under ${MIN_FACET_SQFT} sq ft survived`);

  return {
    model: candidate,
    ...(preStraighten ? { preStraighten } : {}),
    engine: "measured-dsm",
    measuredShare: m.measuredShare,
    provenance,
    boundary,
    conform: null,
    guards,
    cellStats,
    reasons,
  };
}

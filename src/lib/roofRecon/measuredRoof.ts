// The measured roof: layout led by the DSM, the skeleton demoted to filler.
//
// FIRST ATTEMPT (2026-08-29, measured and rejected): adopt reconstructRoof's
// whole model inside the contour and conform its perimeter. Its own guards
// rejected it on 5/5 suburban addresses (Euler −9…0, R03/R04) — the measured
// lines land on real creases, but cluster-ring tracing tangles the topology.
// THIS BUILD goes the other way: the model is constructed FROM the measured
// lines — the step-1 analytic plane intersections (measuredLines.ts) — by a
// planar arrangement (arrangement.ts): junctions closed, segments split,
// cells extracted. Euler and tiling hold by construction; the guards then
// verify that the construction really is what it claims.
//
//   contour   Instant (regularised, registered)      — as before
//   layout    measured typed lines → arrangement     — this module
//   cells     plane from the cluster that covers the cell; an ambiguous cell
//             (no majority) is FILL, never a guess
//   fill      exactly one measured neighbour → its plane ("extended");
//             otherwise the skeleton's plane at the cell ("fill")
//   veto      lidar / Hough / vision                 — unchanged
//
// A structure whose measured share is below COVERAGE_FLOOR keeps the skeleton
// whole (engine "skeleton-fill"): below that floor the pipeline already says
// "not resolved", and a layout led by unmeasured pixels would be the
// skeleton's assumption wearing measurement's clothes.
import type { RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { reconstructRoof, DEFAULT_PLANE_TOL_FT } from "@/lib/roofRecon";
import { measureDsmLayout, type ReconLayoutDiagnostics } from "@/lib/roofRecon/measuredLines";
import { buildArrangement, type ArrangeCell } from "@/lib/roofRecon/arrangement";
import { assembleRoofModel, type AssembleCell } from "@/lib/roofRecon/assembleModel";
import { COVERAGE_FLOOR } from "@/lib/roofDiagram/confidence";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { areaOf, signedArea, type FootprintPoint } from "@/lib/roofRecon/footprint";

/** The step-2 guard: no facet under this survives the stitch. */
const MIN_FACET_SQFT = 15;

export type FaceProvenance = "measured-dsm" | "extended" | "fill";

export interface MeasuredRoofResult {
  model: RoofModel | null;
  /** The stitched candidate even when guards rejected it — so a reviewer can
   *  SEE what was rejected instead of taking the codes' word for it. */
  rejectedCandidate?: RoofModel;
  engine: "measured-dsm" | "skeleton-fill";
  measuredShare: number;
  /** Plan-area shares of the accepted candidate's cells by provenance. */
  provenance: { measuredSqft: number; extendedSqft: number; fillSqft: number; faces: Record<string, FaceProvenance> } | null;
  conform: { vertsMoved: number; maxMoveFt: number; reverted: number } | null;
  guards: { euler: number; tilingPct: number; errorCodes: string[]; smallFacets: number };
  /** Per-cell dominance census: share of assigned samples held by the leading
   *  cluster — the data the cell-assignment rule is derived from. */
  cellStats: Array<{ areaSqft: number; domShare: number; samples: number; prov: FaceProvenance }>;
  reasons: string[];
}

export interface MeasuredRoofInput {
  dsm: Raster;
  mask: Raster;
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

const eulerOf = (m: RoofModel): number =>
  new Set(m.points.map((p) => p.id)).size - new Set(m.lines.map((l) => l.id)).size + m.faces.length;

function guardsOf(m: RoofModel, contourSqft: number) {
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
  const errorCodes = [...new Set(validateRoofInvariants(m).results.filter((x) => x.level === "error").map((x) => x.id))];
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
  // 3×3 Cramer
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
  const m = measureDsmLayout({ dsm, diagnostics: d, movedRings: [movedRing] });

  const skeletonWhole = (why: string): MeasuredRoofResult => {
    reasons.push(why);
    return {
      model: skeleton,
      engine: "skeleton-fill",
      measuredShare: m.measuredShare,
      provenance: null,
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
  if (!m.lines.length) return skeletonWhole("no measured lines inside the contour — skeleton fill");

  // ── the arrangement, in the INSTANT frame (rotation preserves distances,
  //     so junction closings are identical; the contour needs no transform) ──
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
  const linesInstant = m.lines.map((l) => ({ a: invT(l.a), b: invT(l.b), kind: l.type }));
  const arr = buildArrangement({ contour, lines: linesInstant, contourEdgeTypes: typeByRingEdge, minCellSqft: MIN_FACET_SQFT });
  for (const r of arr.report) reasons.push(r);
  for (const dl of arr.droppedLines) {
    reasons.push(`measured ${m.lines[dl.index].type} ${dl.lengthFt.toFixed(0)} ft dropped: ${dl.reason}`);
  }
  if (!arr.cells.length) return skeletonWhole("the arrangement produced no cells — skeleton fill");

  // ── cell planes: from the cluster that covers the cell ──
  const clusterPlane = new Map<number, Plane>();
  d.clusterPlanes.forEach((p, i) => { if (m.clusterIn[i]) clusterPlane.set(i, p); });

  interface CellInfo { cell: ArrangeCell; domShare: number; samples: number; cluster: number | null; plane: Plane | null; prov: FaceProvenance }
  const infos: CellInfo[] = arr.cells.map((cell) => {
    // Sample the assignment on a grid inside the cell (raster frame lookup).
    const xs = cell.ring.map((p) => p.x);
    const ys = cell.ring.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const step = Math.max(m.stepFt, Math.min(maxX - minX, maxY - minY) / 12);
    const counts = new Map<number, number>();
    let total = 0;
    const samplesPx: Array<{ qx: number; qy: number; z: number }> = [];
    for (let y = minY + step / 2; y < maxY; y += step) {
      for (let x = minX + step / 2; x < maxX; x += step) {
        if (!inRing({ x, y }, cell.ring)) continue;
        const q = fwd({ x, y });
        const pi = m.pxOf(q);
        if (pi < 0) continue;
        if (mask.data[pi] > 0.5) samplesPx.push({ qx: q.x, qy: q.y, z: dsm.data[pi] * 3.28084 - groundElevFt });
        const c = d.assign[pi];
        if (c >= 0 && m.clusterIn[c]) {
          counts.set(c, (counts.get(c) ?? 0) + 1);
          total++;
        }
      }
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const domShare = total > 0 && ranked.length ? ranked[0][1] / total : 0;
    // Votes only NAME the candidate cluster; the decision is the plane fit.
    // The dominance census (cell-dominance.ts) came back CONTINUOUS — 7/5/7/
    // 10/9/30 cells per decade from 40% up, no valley between modes — so any
    // vote threshold would be arbitrary (§J). What is derived is the recon's
    // own growth tolerance: a cell is MEASURED when its data pixels lie on
    // the candidate plane the way the clustering itself admits pixels
    // (RMS ≤ DEFAULT_PLANE_TOL_FT); a catch-all cell over several real facets
    // fails this by feet and goes to fill, never a guess.
    if (ranked.length && total > 0) {
      const pl = clusterPlane.get(ranked[0][0]);
      if (pl && samplesPx.length >= 3) {
        let ss = 0;
        for (const sp of samplesPx) {
          const dz = sp.z - (pl.a * sp.qx + pl.b * sp.qy + pl.c);
          ss += dz * dz;
        }
        const rms = Math.sqrt(ss / samplesPx.length);
        if (rms <= DEFAULT_PLANE_TOL_FT) {
          return { cell, domShare, samples: total, cluster: ranked[0][0], plane: pl, prov: "measured-dsm" as FaceProvenance };
        }
      }
    }
    return { cell, domShare, samples: total, cluster: null, plane: null, prov: "fill" as FaceProvenance };
  });

  // ── fill: one measured neighbour extends; otherwise the skeleton's plane ──
  const edgeKey = (a: FootprintPoint, b: FootprintPoint) => {
    const k1 = `${a.x.toFixed(2)}|${a.y.toFixed(2)}`;
    const k2 = `${b.x.toFixed(2)}|${b.y.toFixed(2)}`;
    return k1 < k2 ? `${k1}#${k2}` : `${k2}#${k1}`;
  };
  const cellsByEdge = new Map<string, CellInfo[]>();
  for (const ci of infos) for (const e of ci.cell.edges) {
    const k = edgeKey(e.a, e.b);
    const arr2 = cellsByEdge.get(k) ?? [];
    arr2.push(ci);
    cellsByEdge.set(k, arr2);
  }
  // skeleton planes for the last-resort fill
  const skelIdx = buildIndexes(skeleton);
  const skelFaces = skeleton.faces
    .map((f) => {
      const r = ringOf(f.lineIds, skelIdx);
      if (!r || r.length < 3) return null;
      const plane = fitPlane(r);
      return plane ? { ring: r.map((p) => ({ x: p.x, y: p.y })), plane } : null;
    })
    .filter((x): x is { ring: FootprintPoint[]; plane: Plane } => x !== null);
  const skeletonPlaneAt = (p: FootprintPoint): Plane | null => {
    for (const f of skelFaces) if (inRing(p, f.ring)) return f.plane;
    let best: { d2: number; plane: Plane } | null = null;
    for (const f of skelFaces) {
      const cx = f.ring.reduce((s, q) => s + q.x, 0) / f.ring.length;
      const cy = f.ring.reduce((s, q) => s + q.y, 0) / f.ring.length;
      const d2 = (cx - p.x) ** 2 + (cy - p.y) ** 2;
      if (!best || d2 < best.d2) best = { d2, plane: f.plane };
    }
    return best?.plane ?? null;
  };
  // NOTE: the skeleton's planes live in the INSTANT frame while cluster
  // planes live in the RASTER frame — zOf below evaluates each in its own.
  for (const ci of infos) {
    if (ci.prov !== "fill") continue;
    const neighbours = new Set<number>();
    for (const e of ci.cell.edges) {
      for (const other of cellsByEdge.get(edgeKey(e.a, e.b)) ?? []) {
        if (other !== ci && other.prov === "measured-dsm" && other.cluster !== null) neighbours.add(other.cluster);
      }
    }
    if (neighbours.size === 1) {
      const cl = [...neighbours][0];
      ci.cluster = cl;
      ci.plane = clusterPlane.get(cl) ?? null;
      ci.prov = "extended";
    }
  }

  // ── assemble: z per vertex is the mean of the adjoining cells' planes ──
  // Datum note: cluster planes are GROUND-relative (recon computes
  // z = dsm·ft − groundElevFt) while the skeleton's z is model-relative.
  // Mixing them raw bent every face that touched a fill cell (R03/R04 on
  // 4/5 addresses in the first run) — so each fill cell carries an offset
  // that makes it MEET its measured neighbours at shared vertices.
  const measuredZAt = (ci: CellInfo, p: FootprintPoint): number => {
    const q = fwd(p); // cluster planes are raster-frame
    return ci.plane ? ci.plane.a * q.x + ci.plane.b * q.y + ci.plane.c : 0;
  };
  const skelZAt = (p: FootprintPoint): number => {
    const sp = skeletonPlaneAt(p);
    return sp ? sp.a * p.x + sp.b * p.y + sp.c : 0;
  };
  const vKey = (p: FootprintPoint) => `${Math.round(p.x * 1000)}|${Math.round(p.y * 1000)}`;
  const vCells = new Map<string, CellInfo[]>();
  for (const ci of infos) for (const p of ci.cell.ring) {
    const arr2 = vCells.get(vKey(p)) ?? [];
    if (!arr2.includes(ci)) arr2.push(ci);
    vCells.set(vKey(p), arr2);
  }
  // ── intercept harmonisation ──
  // The cluster planes' slopes (a,b) are the measurement and stay untouched;
  // the intercepts c carry independent fit noise, and at a junction vertex two
  // planes disagree by exactly that noise — which bent faces (R03) and pulled
  // fitted gradients off the declared pitch (R04) when vertex z was a raw
  // mean. Least-squares offsets per CLUSTER bring the intercepts together at
  // every shared vertex; the slopes — the measured quantity — are preserved.
  {
    const clusterIds = [...new Set(infos.filter((ci) => ci.plane && ci.prov !== "fill" && ci.cluster !== null).map((ci) => ci.cluster as number))];
    const idxOf = new Map(clusterIds.map((c, i) => [c, i]));
    const n = clusterIds.length;
    if (n > 1) {
      const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      const B = new Array<number>(n).fill(0);
      for (let i2 = 0; i2 < n; i2++) A[i2][i2] += 1e-6; // gauge
      for (const [k, cis] of vCells) {
        const present = cis.filter((ci) => ci.plane && ci.prov !== "fill" && ci.cluster !== null);
        if (present.length < 2) continue;
        const pnt = present[0].cell.ring.find((q) => vKey(q) === k)!;
        for (let x = 0; x < present.length; x++) {
          for (let y = x + 1; y < present.length; y++) {
            const ci1 = present[x];
            const ci2 = present[y];
            if (ci1.cluster === ci2.cluster) continue;
            const i1 = idxOf.get(ci1.cluster as number)!;
            const j1 = idxOf.get(ci2.cluster as number)!;
            const delta = measuredZAt(ci1, pnt) - measuredZAt(ci2, pnt);
            // minimise (o_i - o_j + delta)^2
            A[i1][i1] += 1; A[j1][j1] += 1; A[i1][j1] -= 1; A[j1][i1] -= 1;
            B[i1] -= delta; B[j1] += delta;
          }
        }
      }
      // Gaussian elimination
      for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
        [A[col], A[piv]] = [A[piv], A[col]];
        [B[col], B[piv]] = [B[piv], B[col]];
        if (Math.abs(A[col][col]) < 1e-12) continue;
        for (let r = 0; r < n; r++) {
          if (r === col) continue;
          const f = A[r][col] / A[col][col];
          for (let c2 = col; c2 < n; c2++) A[r][c2] -= f * A[col][c2];
          B[r] -= f * B[col];
        }
      }
      const seen = new Set<Plane>();
      for (const ci of infos) {
        if (!ci.plane || ci.prov === "fill" || ci.cluster === null) continue;
        if (seen.has(ci.plane)) continue;
        seen.add(ci.plane);
        const i2 = idxOf.get(ci.cluster)!;
        if (Math.abs(A[i2][i2]) > 1e-12) ci.plane.c += B[i2] / A[i2][i2];
      }
    }
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
  // Vertex z comes from the DSM ITSELF where it has data — junction vertices
  // sit at the far end of extended supports, where extrapolated planes
  // disagree by feet (measured on 12621: spread med 2.1 ft, max 14.5) while
  // the surface there is quiet (std3×3 med 0.12 ft, |med3−med5| ≤ 0.09 —
  // vertex-z-noise.ts). Median of the 3×3 data window, ground-relative like
  // the cluster planes; the plane mean is the fallback where the mask is
  // empty. R03 then checks planarity against these same vertices — the
  // validator reads the model's own points.
  const dsmZAt = (p: FootprintPoint): number | null => {
    const q = fwd(p);
    const base = m.pxOf(q);
    if (base < 0) return null;
    const w2 = dsm.width;
    const vals: number[] = [];
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
      const i2 = base + dy * w2 + dx;
      if (i2 < 0 || i2 >= dsm.width * dsm.height) continue;
      if (mask.data[i2] <= 0.5) continue;
      vals.push(dsm.data[i2] * 3.28084 - groundElevFt);
    }
    if (vals.length < 3) return null;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  };
  const vz = new Map<string, number>();
  for (const [k, cis] of vCells) {
    const p = cis[0].cell.ring.find((q) => vKey(q) === k)!;
    const zd = dsmZAt(p);
    vz.set(k, zd !== null ? zd : cis.reduce((s, ci) => s + zOfInfo(ci, p), 0) / cis.length);
  }

  const cells: AssembleCell[] = infos.map((ci) => {
    const grad = ci.plane && ci.prov !== "fill" ? { a: ci.plane.a, b: ci.plane.b } : (() => {
      const cx0 = ci.cell.ring.reduce((s, q) => s + q.x, 0) / ci.cell.ring.length;
      const cy0 = ci.cell.ring.reduce((s, q) => s + q.y, 0) / ci.cell.ring.length;
      const sp = skeletonPlaneAt({ x: cx0, y: cy0 });
      return sp ? { a: sp.a, b: sp.b } : { a: 0, b: 0 };
    })();
    // Cluster gradients are raster-frame: rotate the downhill direction back.
    const rasterFrame = ci.plane && ci.prov !== "fill";
    const dh = rasterFrame
      ? { x: -grad.a * Math.cos(-th) + grad.b * Math.sin(-th), y: -grad.a * Math.sin(-th) - grad.b * Math.cos(-th) }
      : { x: -grad.a, y: -grad.b };
    return {
      ring: ci.cell.ring.map((p) => ({ x: p.x, y: p.y, z: vz.get(vKey(p)) ?? zOfInfo(ci, p) })),
      pitch12: Math.hypot(grad.a, grad.b) * 12,
      orientationDeg: ((Math.atan2(dh.x, dh.y) * 180) / Math.PI + 360) % 360,
      zOf: (x, y) => zOfInfo(ci, { x, y }),
      edgeTypes: ci.cell.edges.map((e) =>
        e.source.kind === "line" ? m.lines[e.source.index].type : typeByRingEdge[e.source.index],
      ),
    };
  });

  const candidate = assembleRoofModel({ cells, base: skeleton, idPrefix: "M", structureIndex: 0 });
  if (!candidate) return skeletonWhole("assembly failed on a degenerate cell — skeleton fill");

  // Provenance per face: assembly ranks faces by plan area with a stable
  // sort — replicate the order to key faces.
  const order = infos
    .map((ci, i) => ({ i, area: Math.abs(signedArea(ci.cell.ring)) }))
    .sort((x, y) => x.area - y.area);
  const provFaces: Record<string, FaceProvenance> = {};
  let measuredSqft = 0, extendedSqft = 0, fillSqft = 0;
  order.forEach((o, rank) => {
    const ci = infos[o.i];
    provFaces[`s0:MF${rank + 1}`] = ci.prov;
    if (ci.prov === "measured-dsm") measuredSqft += o.area;
    else if (ci.prov === "extended") extendedSqft += o.area;
    else fillSqft += o.area;
  });
  const provenance = { measuredSqft, extendedSqft, fillSqft, faces: provFaces };
  const cellStats = infos.map((ci) => ({
    areaSqft: Math.abs(signedArea(ci.cell.ring)),
    domShare: ci.domShare,
    samples: ci.samples,
    prov: ci.prov,
  }));

  const guards = guardsOf(candidate, contourSqft);
  if (arr.euler !== 1) reasons.push(`arrangement Euler ${arr.euler} — построение не то, чем назвалось`);
  if (arr.tilingPct > 0.5) reasons.push(`arrangement tiling off by ${arr.tilingPct.toFixed(2)}%`);

  // The stitch must not ship worse topology than the skeleton it replaces.
  if (guards.euler !== 1 || guards.errorCodes.includes("R03") || guards.errorCodes.includes("R04") || guards.tilingPct > 0.5) {
    reasons.push(
      `stitched model fails hard guards (Euler ${guards.euler}, tiling ${guards.tilingPct.toFixed(2)}%, codes ${guards.errorCodes.join("/") || "none"}) — skeleton kept`,
    );
    return {
      model: skeleton,
      engine: "skeleton-fill",
      rejectedCandidate: candidate,
      measuredShare: m.measuredShare,
      provenance,
      conform: null,
      guards: guardsOf(skeleton, contourSqft),
      cellStats,
      reasons,
    };
  }
  if (guards.smallFacets > 0) reasons.push(`${guards.smallFacets} facet(s) under ${MIN_FACET_SQFT} sq ft survived`);

  return {
    model: candidate,
    engine: "measured-dsm",
    measuredShare: m.measuredShare,
    provenance,
    conform: null,
    guards,
    cellStats,
    reasons,
  };
}

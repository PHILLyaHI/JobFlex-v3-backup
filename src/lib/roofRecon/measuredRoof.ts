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
// Переписной пол ступени: бимодальный census перепадов дал зазор
// [1.8, 2.2] между модой невязки и модой стены — любой порог в зазоре
// эквивалентен ПО ПЕРЕПИСИ. Берём НИЖНИЙ край: порог служит и полом
// заявления стены, и потолком сварки вершин (одно число — ОДНА работа:
// «стена ↔ не сваривать»); при 2.0 пограничные стены ~1.8-1.9 сваривались,
// сваренная точка вставала на ~0.9 над плоскостью и flatten разносил это
// в поворот градиента грани до 13° (G4 на 12618).
const STEP_DZ_FT = 1.8;

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
  // ── снап измеренных линий пар на пересечение плоскостей ──
  // Линии шага 1 аналитические ДЛЯ СВОИХ пар, но их КОНЦЫ обрезаны
  // трассой; после канона/спрямления линия может отойти. Пересечение
  // плоскостей — истина направления пары: проекция в пределах
  //2·max(σ⊥, окно нормалей) (§J; окно half=2 — измерение размыто им).
  // Стены (Δz ≥ переписного пола) не трогаются. На 12629 off=0.00 везде
  // (линии уже на месте — снап нем); на 419 вальма A5/A7 стояла в 9.5°
  // от аналитической и садилась в 2.2 ft от угла ободка.
  {
    let snapped = 0;
    for (const l of baseLines) {
      const A = d.clusterPlanes[l.between[0]];
      const B = d.clusterPlanes[l.between[1]];
      if (!A || !B) continue;
      const da = A.a - B.a;
      const db = A.b - B.b;
      const nrm = Math.hypot(da, db);
      if (nrm < 1e-4) continue;
      const mx = (l.a.x + l.b.x) / 2;
      const my = (l.a.y + l.b.y) / 2;
      const dzAtBoundary = Math.abs((A.a * mx + A.b * my + A.c) - (B.a * mx + B.b * my + B.c));
      if (dzAtBoundary > STEP_DZ_FT) continue;
      const off = (da * mx + db * my + (A.c - B.c)) / nrm;
      if (Math.abs(off) < 1e-3 || Math.abs(off) > 2 * Math.max(l.sigmaPerpFt, 2 * stepFt)) continue;
      const px0 = { x: mx - (da / nrm) * off, y: my - (db / nrm) * off };
      const dirL = { x: -db / nrm, y: da / nrm };
      for (const q of [l.a, l.b]) {
        const tq = (q.x - px0.x) * dirL.x + (q.y - px0.y) * dirL.y;
        q.x = px0.x + dirL.x * tq;
        q.y = px0.y + dirL.y * tq;
      }
      snapped++;
    }
    if (snapped) reasons.push(`снап на пересечение плоскостей: ${snapped} линий пар (в пределах 2·max(σ⊥, окно))`);
  }
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
      // НАПРАВЛЕНИЕ ПЛОСКОСТИ — ИЗМЕРЕНИЕ (§J): при опоре в сотни-тысячи
      // пикселей σ направления ничтожна, а полная 3×3-подгонка с вершинными
      // целями ВРАЩАЛА измеренные плоскости на 1.7–5.4° (12621: cl3
      // −0.4→−4.0°, cl8 уклон 10→8.4) — кольца граней выходили когерентно
      // повёрнутыми (A8: −6.9° при пиксельной −0.4°), G4 ловил, гейт ронял.
      // Сходимость двигает только ВЫСОТУ (c); невязку стыка, которую высота
      // не закрывает, несут сварка и её допуск (R03 v2), не направление.
      for (const [cl, pl] of clusterPlane) {
        const px2 = pxNorm.get(cl);
        const vx = acc2.get(cl);
        if (!px2 || px2.n < 6) continue;
        const num = (px2.z - pl.a * px2.x - pl.b * px2.y) + ((vx?.z ?? 0) - pl.a * (vx?.x ?? 0) - pl.b * (vx?.y ?? 0));
        const den = px2.n + (vx?.n ?? 0);
        if (den > 0) pl.c = num / den;
      }
    }
    // остаточная несходимость — в отчёт
    let worst = 0;
    vGroups.forEach((vg) => {
      const zs = vg.cis.map((c2) => measuredZAt(c2, vg.p));
      worst = Math.max(worst, Math.max(...zs) - Math.min(...zs));
    });
    reasons.push(`сходимость плоскостей: ${vGroups.length} общих вершин, остаточный разрыв ${worst.toFixed(3)} ft`);
    if (process.env.DBG_CONC) {
      for (const [cl, pl] of clusterPlane) {
        const d0 = d.clusterPlanes[cl];
        const az0 = (Math.atan2(d0.b, d0.a) * 180) / Math.PI;
        const az1 = (Math.atan2(pl.b, pl.a) * 180) / Math.PI;
        let rot = Math.abs(az1 - az0) % 360;
        if (rot > 180) rot = 360 - rot;
        if (rot > 1) console.log(`[conc] cl${cl}: азимут ${az0.toFixed(1)} → ${az1.toFixed(1)} (поворот ${rot.toFixed(1)}°), pitch ${(Math.hypot(d0.a, d0.b) * 12).toFixed(1)} → ${(Math.hypot(pl.a, pl.b) * 12).toFixed(1)}`);
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
  // сварка переписным полом связала вершины в узлы по 3+ граней — системе
  // нужно больше раундов, чем расщеплённой (24 оставляли 0.63 ft).
  // NB: замороженные градиенты через f.orientation НЕ подключать без
  // выверенной конвенции угла — заморозка в чужом направлении дала G4
  // до 83° (замерено 2026-08-30)
  if (process.env.DBG_COVER) {
    const idxC = buildIndexes(assembled);
    const ringsC: FootprintPoint[][] = [];
    for (const f of assembled.faces) {
      const rC = ringOf(f.lineIds, idxC);
      if (rC && rC.length >= 3) ringsC.push(rC.map((q) => ({ x: q.x, y: q.y })));
    }
    const inPC = (x: number, y: number, ring: FootprintPoint[]): boolean => {
      let ins = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (ring[i].y > y !== ring[j].y > y && x < ((ring[j].x - ring[i].x) * (y - ring[i].y)) / (ring[j].y - ring[i].y) + ring[i].x) ins = !ins;
      }
      return ins;
    };
    let unC = 0;
    let cxs = 0, cys = 0;
    for (let y = -40; y <= 40; y += 0.75) for (let x = -40; x <= 40; x += 0.75) {
      if (!inRing({ x, y }, movedRing)) continue;
      if (!ringsC.some((rg) => inPC(x, y, rg))) { unC++; cxs += x; cys += y; }
    }
    console.log(`[cover] после сборки: непокрыто ${(unC * 0.5625).toFixed(1)} sf${unC ? ` центр (${(cxs / unC).toFixed(1)},${(cys / unC).toFixed(1)})` : ""}`);
  }
  const flat = flattenFacets(assembled, { iterations: 96 });
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
  if (process.env.DBG_EULER) console.log("[euler] после flatten:", eulerOf(candidate));
  const straighten = mergeCollinearChains(candidate, m.stepFt, corridorOfLine);
  if (process.env.DBG_EULER) console.log("[euler] после выпрямления:", eulerOf(candidate));
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
      // складки между копланарными гранями НЕ БЫВАЕТ: |∇A−∇B| ниже кванта
      // ровности (0.5/12) — один скат, разрезанный кластеризацией; пробы
      // на волоске шума звали такую границу ендовой (шпилька 77.7° на
      // 12618: A9/B4 с |∇diff| = 0.00)
      if (own.length >= 2) {
        const g1 = own[0].pl;
        const g2v = own[1].pl;
        if (Math.hypot(g1.a - g2v.a, g1.b - g2v.b) < LEVEL_SLOPE) return null;
      }
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
    // ── ПОЛОСА КРАЕВОЙ СМЕСИ (2026-08-30) ──
    // Кайма кровля+земля вдоль внешнего контура рождала hip↔valley крошку
    // (12629: цепь A4/A6 в 1–2 ft внутри диагонали SE). В полосе шириной
    // пробника (PROBE_FT) z-пробы классификатора не судят — тип берётся
    // продолжением изнутри (петля непрерывности ниже; у неё есть
    // одноконцовое наследование для кусков, упирающихся в кольцо).
    const inBand = (l: (typeof candidate.lines)[number]): boolean => {
      const a = ptById.get(l.aId)!;
      const b = ptById.get(l.bId)!;
      return distRing({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) <= PROBE_FT;
    };
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
        // опубликованная как архитектура; честные клифы трубы 2.15–2.43).
        // Δz меряется ПО КОНЦАМ, максимумом: стена-клин (обрыв конька к
        // нижнему крылу) сужается вдоль линии, и серединное усреднение
        // разбавляло 3.4 ft на конце до 1.7 — стена не заявлялась, конёк
        // висел (12621 (11.8,2.9), 12618 (-0.3,-19.3), гребень 12629)
        let dzEnds = 0;
        for (let i2 = 0; i2 < g.length; i2++) {
          for (let j2 = i2 + 1; j2 < g.length; j2++) {
            const a1 = ptById.get(g[i2].aId)!;
            const b1 = ptById.get(g[i2].bId)!;
            const a2 = ptById.get(g[j2].aId)!;
            const b2 = ptById.get(g[j2].bId)!;
            const same = planKey(g[i2].aId) === planKey(g[j2].aId);
            const dz1 = Math.abs(a1.z - (same ? a2.z : b2.z));
            const dz2 = Math.abs(b1.z - (same ? b2.z : a2.z));
            dzEnds = Math.max(dzEnds, dz1, dz2);
          }
        }
        // ЗАЯВКА СТЕНЫ СВЕРЯЕТСЯ С ПРЯМЫМ DSM-ПЕРЕПАДОМ (закон владельца,
        // 2026-08-30): dzEnds меряется план-эвалами плоскостей, а у границ
        // мега-граней плоскости экстраполируют за опору — фантомные стены
        // Δz 1.1–5.2 при DSM-перепаде поперёк 0.0–0.8 (12629 SE-диагональ;
        // настоящие стены в тех же данных: 4.0–17.0). Порог — переписной
        // пол, меренный напрямую: медиана |z(+2ft)−z(−2ft)| по трём
        // станциям вдоль линии.
        const dsmWallOk = (): boolean => {
          const a9 = ptById.get(l0.aId)!;
          const b9 = ptById.get(l0.bId)!;
          const run9 = Math.hypot(b9.x - a9.x, b9.y - a9.y);
          if (run9 < 1e-6) return true;
          const per9 = { x: -(b9.y - a9.y) / run9, y: (b9.x - a9.x) / run9 };
          const drops: number[] = [];
          for (const t9 of [0.25, 0.5, 0.75]) {
            const mid9 = { x: a9.x + (b9.x - a9.x) * t9, y: a9.y + (b9.y - a9.y) * t9 };
            const zSide = (s9: number): number => {
              const q9 = fwd({ x: mid9.x + per9.x * s9 * 2, y: mid9.y + per9.y * s9 * 2 });
              const pi9 = m.pxOf(q9);
              if (pi9 < 0 || mask.data[pi9] <= 0.5) return NaN;
              return dsm.data[pi9] * FT_PER_M - groundElevFt;
            };
            const d9 = Math.abs(zSide(1) - zSide(-1));
            if (Number.isFinite(d9)) drops.push(d9);
          }
          if (!drops.length) return true; // мерить не обо что (край кадра)
          drops.sort((x9, y9) => x9 - y9);
          return drops[Math.floor(drops.length / 2)] >= STEP_DZ_FT;
        };
        if (dzEnds >= STEP_DZ_FT && dsmWallOk()) {
          // у СТЕНЫ один план на обе стороны: стороны, разошедшиеся на
          // ~0.1 ft (канон/слияния двигали по одной), рвут ключи близнецов
          // (G5-исключение слепнет) и двоят рендер — план сваривается в
          // среднее по совмещённым концам, z остаются раздельными
          {
            const endsW = new Map<string, Array<(typeof candidate.points)[number]>>();
            for (const l of g) for (const pid of [l.aId, l.bId]) {
              const ptW = ptById.get(pid)!;
              const kW = `${Math.round(ptW.x * 2)}|${Math.round(ptW.y * 2)}`; // ячейка 0.5 ft
              (endsW.get(kW) ?? endsW.set(kW, []).get(kW)!).push(ptW);
            }
            for (const ptsW of endsW.values()) {
              if (ptsW.length < 2) continue;
              const mx = ptsW.reduce((sW, qW) => sW + qW.x, 0) / ptsW.length;
              const my = ptsW.reduce((sW, qW) => sW + qW.y, 0) / ptsW.length;
              for (const qW of ptsW) { qW.x = mx; qW.y = my; }
            }
            for (const l of g) {
              const aW = ptById.get(l.aId)!;
              const bW = ptById.get(l.bId)!;
              l.lengthFt = Math.hypot(bW.x - aW.x, bW.y - aW.y, bW.z - aW.z);
            }
          }
          // ступень: верхняя сторона EAVE, нижняя FLASHING; погонаж — обе
          const top = Math.max(...zs);
          for (const l of g) l.type = zOfLine(l) >= top - 1e-6 ? "EAVE" : "FLASHING";
          for (const l of g) bump(l.type, l.lengthFt);
          continue;
        }
        if (dzEnds >= STEP_DZ_FT) {
          // фантомная стена: DSM перепада не видит — близнецы СВАРИВАЮТСЯ
          // по совмещённым концам (одна высота), пара уходит в путь
          // одноуровневых (складка от плоскостей или OTHER); 3D-поверхность
          // замыкается
          const ends = new Map<string, Array<(typeof candidate.points)[number]>>();
          for (const l of g) for (const pid of [l.aId, l.bId]) {
            const pt9 = ptById.get(pid)!;
            const k9 = `${Math.round(pt9.x * 100)}|${Math.round(pt9.y * 100)}`;
            (ends.get(k9) ?? ends.set(k9, []).get(k9)!).push(pt9);
          }
          for (const pts9 of ends.values()) {
            const zm = pts9.reduce((s9, q9) => s9 + q9.z, 0) / pts9.length;
            for (const q9 of pts9) q9.z = zm;
          }
          for (const l of g) {
            const a9 = ptById.get(l.aId)!;
            const b9 = ptById.get(l.bId)!;
            l.lengthFt = Math.hypot(b9.x - a9.x, b9.y - a9.y, b9.z - a9.z);
          }
        }
        // близнецы одного уровня: один тип складки на всех, счёт один раз.
        // Складки нет (пробы монотонны — перелом уклона одной стороны, напр.
        // 7.8/12 → 5.6/12 у гребня 12629): измеренная граница двух граней —
        // нейтральный переход OTHER; STEPFLASH — только кромка разбиения
        // одновладельца, легенда не заявляет немеренного
        const allOwners = [...new Set(g.flatMap((l) => ownersOf.get(l.id) ?? []))];
        let fb = l0.type as string;
        if (onRing && (fb === "FLASHING" || fb === "STEPFLASH")) {
          // осиротевший шов НА КОНТУРЕ (близнец сварен переписным полом):
          // контурное ребро живёт типами контура (закон шага 1)
          const a0 = ptById.get(l0.aId)!;
          const b0 = ptById.get(l0.bId)!;
          fb = Math.abs(a0.z - b0.z) <= Math.max(0.08, LEVEL_SLOPE * Math.hypot(b0.x - a0.x, b0.y - a0.y)) ? "EAVE" : "RAKE";
        }
        const t = (inBand(l0) ? null : creaseType(l0, allOwners)) ?? (onRing ? fb : allOwners.length >= 2 ? "OTHER" : "STEPFLASH");
        for (const l of g) l.type = t as (typeof l0)["type"];
        bump(t, l0.lengthFt);
        continue;
      }
      // одиночная линия
      const owners = ownersOf.get(l0.id) ?? [];
      if (owners.length >= 2) {
        const t = inBand(l0) ? null : creaseType(l0, owners);
        if (t) l0.type = t as (typeof l0)["type"];
        // нерешённый перегиб ВНЕ кольца не имеет права зваться RAKE/EAVE —
        // на контуре типы шага 1 остаются, внутри крыши это OTHER.
        // В ПОЛОСЕ каймы гасится и предтипизационный тип складки: тип в
        // полосе живёт только продолжением изнутри (наклонный «RIDGE»
        // 0.42 ft/ft у кольца 419 переживал полосу со старым типом)
        else if (!onRing && (l0.type === "RAKE" || l0.type === "EAVE")) l0.type = "OTHER";
        // и складка, которую ФИНАЛЬНЫЕ плоскости не подтверждают (пробы
        // монотонны/копланарны -> null), не наследует предтипизационный
        // тип: заявка складки — только от плоскостей (наклонный «RIDGE»
        // 0.42 ft/ft на 419 переживал типизацию старым типом). Петля
        // непрерывности вернёт тип, если своя пара продолжается.
        else if (!onRing && (l0.type === "RIDGE" || l0.type === "HIP" || l0.type === "VALLEY")) l0.type = "OTHER";
        // шов, ЦЕЛИКОМ лежащий на внешнем контуре (G6-домен: обе точки и
        // середина ≤ STUB), без переписного близнеца — не стык с вертикалью,
        // а хвост границы у кольца: OTHER. Внутренние швы не трогаем — они
        // законные терминаторы складок (G2)
        else if ((l0.type === "FLASHING" || l0.type === "STEPFLASH")) {
          const a6 = ptById.get(l0.aId)!;
          const b6 = ptById.get(l0.bId)!;
          const m6 = { x: (a6.x + b6.x) / 2, y: (a6.y + b6.y) / 2 };
          if (Math.max(distRing(a6), distRing(b6), distRing(m6)) <= 1.0) l0.type = "OTHER";
        }
      } else if (!onRing) {
        // одновладельная внутренняя — кромка разбиения
        l0.type = "STEPFLASH";
      } else if (l0.type === "FLASHING" || l0.type === "STEPFLASH") {
        // осиротевший шов НА КОНТУРЕ (близнец сварен переписным полом):
        // контурное ребро живёт типами контура — ровное EAVE, наклонное
        // RAKE (закон классификатора шага 1)
        const a = ptById.get(l0.aId)!;
        const b = ptById.get(l0.bId)!;
        const run = Math.hypot(b.x - a.x, b.y - a.y);
        l0.type = Math.abs(a.z - b.z) <= Math.max(0.08, LEVEL_SLOPE * run) ? "EAVE" : "RAKE";
      }
      bump(l0.type, l0.lengthFt);
    }
    // непрерывность: OTHER-кусок с двумя владельцами, оба конца которого
    // продолжают складку одного типа, — часть этой складки (нейтральные
    // куски рвали цепи и плодили ложные G2-терминации)
    // раундов — по длине наибольшей цепи (3 обрезало полосу каймы)
    for (let round = 0; round < candidate.lines.length; round++) {
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
        const ownKey = (l2: (typeof candidate.lines)[number]): string => (ownersOf.get(l2.id) ?? []).slice().sort().join("|");
        const myOwn = ownKey(l);
        const endTypes = (pid: string): Set<string> => {
          const out2 = new Set<string>();
          for (const o of byEnd.get(planKey(pid)) ?? []) {
            if (o === l) continue;
            // продолжаться может только СВОЯ складка: тот же набор
            // владельцев (шпилька [A9,B4] заражалась HIP от чужой пары
            // [B4,B5], чьи сегменты случайно коллинеарны)
            if (ownKey(o) !== myOwn) continue;
            if (o.type === "RIDGE" || o.type === "HIP" || o.type === "VALLEY") out2.add(o.type);
          }
          return out2;
        };
        const ta = endTypes(l.aId);
        const tb = endTypes(l.bId);
        const both = [...ta].filter((t) => tb.has(t));
        // ПРОДОЛЖЕНИЕ — это коллинеарность: мостик между двумя РАЗНЫМИ
        // складками одного типа (конёк N-S и конёк E-W на 419, разошлись
        // концы узла) — не продолжение и типа не наследует
        const dirOf = (l2: (typeof candidate.lines)[number]) => {
          const a2 = ptById.get(l2.aId)!;
          const b2 = ptById.get(l2.bId)!;
          const r2 = Math.hypot(b2.x - a2.x, b2.y - a2.y) || 1;
          return { x: (b2.x - a2.x) / r2, y: (b2.y - a2.y) / r2 };
        };
        const collinearNeighbors = (t: string): boolean => {
          const na = (byEnd.get(planKey(l.aId)) ?? []).filter((o) => o !== l && o.type === t);
          const nb = (byEnd.get(planKey(l.bId)) ?? []).filter((o) => o !== l && o.type === t);
          if (!na.length || !nb.length) return true; // одноконцовое — как было
          for (const oa of na) for (const ob of nb) {
            const da2 = dirOf(oa);
            const db2 = dirOf(ob);
            const cross = Math.abs(da2.x * db2.y - da2.y * db2.x);
            const lmin = Math.min(oa.lengthFt, ob.lengthFt) || 1;
            if (cross <= Math.sin(Math.atan((2 * 0.5) / lmin))) return true; // §J: atan(2σ⊥/L)
          }
          return false;
        };
        const one0 = both.length === 1 ? both[0] : (ta.size === 1 && tb.size === 0 ? [...ta][0] : (tb.size === 1 && ta.size === 0 ? [...tb][0] : null));
        const one = one0 && (ta.size === 0 || tb.size === 0 || collinearNeighbors(one0)) ? one0 : null;
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
    const dbgCover = (tag: string): void => {
      if (!process.env.DBG_COVER) return;
      const idxC = buildIndexes(candidate);
      const ringsC: FootprintPoint[][] = [];
      for (const f of candidate.faces) {
        const rC = ringOf(f.lineIds, idxC);
        if (rC && rC.length >= 3) ringsC.push(rC.map((q) => ({ x: q.x, y: q.y })));
      }
      const inPC = (x: number, y: number, ring: FootprintPoint[]): boolean => {
        let ins = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          if (ring[i].y > y !== ring[j].y > y && x < ((ring[j].x - ring[i].x) * (y - ring[i].y)) / (ring[j].y - ring[i].y) + ring[i].x) ins = !ins;
        }
        return ins;
      };
      let unC = 0, cxs = 0, cys = 0;
      for (let y = -40; y <= 40; y += 0.75) for (let x = -40; x <= 40; x += 0.75) {
        if (!inPC(x, y, contour as never)) continue;
        if (!ringsC.some((rg) => inPC(x, y, rg))) { unC++; cxs += x; cys += y; }
      }
      console.log(`[cover] ${tag}: ${(unC * 0.5625).toFixed(1)} sf${unC ? ` центр (${(cxs / unC).toFixed(1)},${(cys / unC).toFixed(1)})` : ""}`);
      if (process.env.DBG_WHO) {
        const [wx, wy] = process.env.DBG_WHO.split(",").map(Number);
        const idxW = buildIndexes(candidate);
        const holders: string[] = [];
        for (const f of candidate.faces) {
          const rW = ringOf(f.lineIds, idxW);
          if (rW && rW.length >= 3 && inPC(wx, wy, rW.map((q) => ({ x: q.x, y: q.y })))) holders.push(f.designator + "(" + rW.length + "тчк)");
          if (!rW || rW.length < 3) holders.push(f.designator + "(PINCH)");
        }
        console.log(`[who] ${tag}: (${wx},${wy}) в: ${holders.join(", ") || "НИКТО"}`);
        const fW = candidate.faces.find((f2) => f2.designator === process.env.DBG_WHO_FACE);
        if (fW) {
          const pById9 = new Map(candidate.points.map((pt) => [pt.id, pt]));
          const descW = [...new Set(fW.lineIds)].map((id) => {
            const l9 = candidate.lines.find((l2) => l2.id === id);
            if (!l9) return id + ":МЁРТВАЯ";
            const a9 = pById9.get(l9.aId)!;
            const b9 = pById9.get(l9.bId)!;
            return `${id}(${a9.x.toFixed(1)},${a9.y.toFixed(1)})-(${b9.x.toFixed(1)},${b9.y.toFixed(1)})`;
          });
          console.log(`[who] ${fW.designator} линии: ${descW.join(" ")}`);
        }
      }
    };
    dbgCover("до пост-слияния");
    // ── пост-типизационное слияние лесенок ──
    // Слой выпрямления бежит ДО типизации: цепи границ ещё не HIP/VALLEY,
    // и §J-слияние безнаправленных звеньев (короче 2σ⊥) их не видело.
    // После типизации — второй проход; погонаж пересчитывается заново
    // той же группировкой (ступень — обе стороны, близнецы — один раз).
    {
      // пол допуска слияния — σ⊥ измеренной складки (0.5 ft, та же величина,
      // что в G4 линеек): излом 7.8° при ногах 5–7 ft (перп ~0.5) — ниже
      // шума направления трассы, не форма
      // близнецам слияние запрещено: спрямление одной стороны пары ломает
      // её симметрию (Эйлер 1 -> 0 на 419, разрыв территории 4.5 sf)
      const twinIds = new Set<string>();
      {
        const pk6 = (pid: string) => {
          const pt = ptById.get(pid)!;
          return `${Math.round(pt.x * 100)}|${Math.round(pt.y * 100)}`;
        };
        const byPair6 = new Map<string, string[]>();
        for (const l of candidate.lines) {
          const ka = pk6(l.aId);
          const kb = pk6(l.bId);
          const k = ka < kb ? `${ka}#${kb}` : `${kb}#${ka}`;
          const arr = byPair6.get(k) ?? [];
          arr.push(l.id);
          byPair6.set(k, arr);
        }
        for (const g6 of byPair6.values()) if (g6.length >= 2) for (const id of g6) twinIds.add(id);
      }
      // и только НАСТОЯЩУЮ границу двух граней: слияние одновладельной
      // цепи спрямляет одну сторону близнецов, и полоса между ними
      // сиротеет (дыра 7.3 sf на 419 открывалась именно здесь — замер
      // покрытия по стадиям)
      // коридор подходных звеньев — от ПАР ПЛОСКОСТЕЙ их владельцев
      // (planeTol/|∇A−∇B| + шаг): rcLines их не матчит, и звенья у узлов
      // держали изломы 32-64°, которые раньше молча телепортировал снос
      const ownersCorridor = (id: string): number => {
        const own = (ownersOf.get(id) ?? []).map((fid) => facePlane.get(fid)).filter((x): x is Plane => !!x);
        if (own.length < 2) return 0;
        const gd = Math.hypot(own[0].a - own[1].a, own[0].b - own[1].b);
        return gd > 1e-6 ? DEFAULT_PLANE_TOL_FT / gd + m.stepFt : 6; // копланарные: направления нет, PROBE
      };
      const rep2 = mergeCollinearChains(candidate, Math.max(m.stepFt, 0.5), (id) => Math.max(corridorOfLine(id), ownersCorridor(id)), (id) => twinIds.has(id) || (ownersOf.get(id) ?? []).length < 2);
      if (process.env.DBG_EULER) console.log("[euler] после пост-слияния:", eulerOf(candidate));
      dbgCover("после пост-слияния");
      // ── обрезка ШПОР ──
      // Одновладельный хвост, чей свободный конец никого не встречает
      // (план-степень 1), — шпора кольца: партнёр сварен переписным полом,
      // кольцо ходит туда-обратно по нулевой площади (класс R02, G7-зазоры).
      // Двухвладельные линии — структурные, не трогаются.
      let trimmed = 0;
      for (let round2 = 0; round2 < 32; round2++) {
        const pById4 = new Map(candidate.points.map((pt) => [pt.id, pt]));
        const pk4 = (pid: string) => {
          const pt = pById4.get(pid)!;
          return `${Math.round(pt.x * 100)}|${Math.round(pt.y * 100)}`;
        };
        const deg4 = new Map<string, number>();
        for (const l of candidate.lines) {
          for (const pid of [l.aId, l.bId]) deg4.set(pk4(pid), (deg4.get(pk4(pid)) ?? 0) + 1);
        }
        const spur = candidate.lines.find((l) => {
          const own = ownersOf.get(l.id) ?? [];
          if (own.length > 1) return false;
          return deg4.get(pk4(l.aId)) === 1 || deg4.get(pk4(l.bId)) === 1;
        });
        if (!spur) break;
        candidate.lines = candidate.lines.filter((l) => l.id !== spur.id);
        for (const f of candidate.faces) f.lineIds = f.lineIds.filter((id) => id !== spur.id);
        const used = new Set(candidate.lines.flatMap((l) => [l.aId, l.bId]));
        candidate.points = candidate.points.filter((pt) => used.has(pt.id));
        trimmed++;
      }
      if (trimmed > 0) reasons.push(`шпоры: ${trimmed} одновладельных хвостов обрезано`);
      dbgCover("после шпор");
      if (process.env.DBG_EULER) console.log("[euler] после шпор:", eulerOf(candidate), "| после слияния лесенок... trimmed:", trimmed, "merged:", rep2.merged);
      if (rep2.merged > 0 || trimmed > 0) {
        const pById3 = new Map(candidate.points.map((pt) => [pt.id, pt]));
        const pk3 = (pid: string) => {
          const pt = pById3.get(pid)!;
          return `${Math.round(pt.x * 100)}|${Math.round(pt.y * 100)}`;
        };
        const groups3 = new Map<string, Array<(typeof candidate.lines)[number]>>();
        for (const l of candidate.lines) {
          const ka = pk3(l.aId);
          const kb = pk3(l.bId);
          const k = ka < kb ? `${ka}#${kb}` : `${kb}#${ka}`;
          const arr = groups3.get(k) ?? [];
          arr.push(l);
          groups3.set(k, arr);
        }
        const f3 = {} as Record<string, number>;
        for (const g3 of groups3.values()) {
          const types = new Set(g3.map((l) => l.type));
          if (g3.length >= 2 && types.size > 1) {
            for (const l of g3) f3[l.type] = (f3[l.type] ?? 0) + l.lengthFt;
          } else {
            f3[g3[0].type] = (f3[g3[0].type] ?? 0) + g3[0].lengthFt;
          }
        }
        for (const t of Object.keys(footage2)) footage2[t] = 0;
        for (const [t, v] of Object.entries(f3)) footage2[t] = v;
        if (rep2.merged > 0) reasons.push(`лесенки: ${rep2.merged} безнаправленных звеньев слито после типизации`);
      }
    }
    // ── второй flatten: хирургии двигали план (слияния, шпоры, канон),
    //    а z остались от старых позиций — остатки 0.1-0.3 на гранях у
    //    сварных зон; вершины снова садятся на плоскости (сваренные — в
    //    LS-точку МЕЖДУ планами, помилование R03 v2 их принимает)
    {
      // ── финальная пересадка z ──
      // Хирургии двигали ПЛАН (слияния, шпоры), z оставались от старых
      // позиций — вершины вылезали из пролёта плоскостей (R03 не миловал).
      // Каждая вершина получает z из плоскостей СВОИХ граней в финальной
      // позиции: подпереписной разброс — среднее (ровно то, что милует
      // R03 v2: вершина между честными плоскостями); разброс от стены —
      // не трогаем (это стык уровней, у сторон свои точки).
      {
        const faceOfLine = new Map<string, string[]>();
        for (const f of candidate.faces) for (const id of new Set(f.lineIds)) {
          const arr = faceOfLine.get(id) ?? [];
          if (!arr.includes(f.id)) arr.push(f.id);
          faceOfLine.set(id, arr);
        }
        const facesOfPt = new Map<string, Set<string>>();
        for (const l of candidate.lines) {
          for (const pid of [l.aId, l.bId]) {
            const set5 = facesOfPt.get(pid) ?? new Set<string>();
            for (const fid of faceOfLine.get(l.id) ?? []) set5.add(fid);
            facesOfPt.set(pid, set5);
          }
        }
        // плоскости — от ФИНАЛЬНЫХ колец (facePlane снят до хирургий и
        // устарел), с итерацией подгонка-пересадка: линейка мерит те же
        // кольца, самосогласованность обязательна
        let rezed = 0;
        for (let round7 = 0; round7 < 3; round7++) {
          const idx7 = buildIndexes(candidate);
          const pl7 = new Map<string, Plane>();
          for (const f of candidate.faces) {
            let r7 = ringOf(f.lineIds, idx7);
            if (!r7 || r7.length < 3) {
              const seen7 = new Set<string>();
              const cloud7: (typeof candidate.points)[number][] = [];
              for (const id of new Set(f.lineIds)) {
                const l7 = candidate.lines.find((l2) => l2.id === id);
                if (!l7) continue;
                for (const pid of [l7.aId, l7.bId]) {
                  if (seen7.has(pid)) continue;
                  seen7.add(pid);
                  const q7 = candidate.points.find((q) => q.id === pid);
                  if (q7) cloud7.push(q7);
                }
              }
              r7 = cloud7.length >= 3 ? cloud7 : null;
            }
            if (!r7) continue;
            const fit7 = fitPlane(r7);
            if (fit7) pl7.set(f.id, fit7);
          }
          let moved7 = 0;
          for (const pt of candidate.points) {
            const pls = [...(facesOfPt.get(pt.id) ?? [])].map((fid) => pl7.get(fid)).filter((x): x is Plane => !!x);
            if (!pls.length) continue;
            const zs5 = pls.map((pl5) => pl5.a * pt.x + pl5.b * pt.y + pl5.c);
            if (Math.max(...zs5) - Math.min(...zs5) >= STEP_DZ_FT) continue;
            const zNew = zs5.reduce((s5, z5) => s5 + z5, 0) / zs5.length;
            if (Math.abs(zNew - pt.z) > 0.01) { pt.z = zNew; moved7++; }
          }
          rezed = Math.max(rezed, moved7);
          if (!moved7) break;
        }
        if (rezed) {
          const pById7 = new Map(candidate.points.map((q) => [q.id, q]));
          for (const l of candidate.lines) {
            const a7 = pById7.get(l.aId);
            const b7 = pById7.get(l.bId);
            if (a7 && b7) l.lengthFt = Math.hypot(b7.x - a7.x, b7.y - a7.y, b7.z - a7.z);
          }
          reasons.push(`пересадка z: ${rezed} вершин на плоскости своих граней`);
          // пересадка меняет высоты ПОСЛЕ типизации — ровность конька
          // перепроверяется по финальным z (конёк, ставший наклонным на
          // 0.42 ft/ft, — вальма по закону складок)
          for (const l of candidate.lines) {
            if (l.type !== "RIDGE") continue;
            const a8 = pById7.get(l.aId);
            const b8 = pById7.get(l.bId);
            if (!a8 || !b8) continue;
            const run8 = Math.hypot(b8.x - a8.x, b8.y - a8.y);
            if (run8 < 1e-6) continue;
            if (Math.abs(a8.z - b8.z) > Math.max(0.08, LEVEL_SLOPE * run8)) l.type = "HIP";
          }
        }
      }
      dbgCover("после пересадки z");
    }
    // ── ФИНАЛЬНЫЙ РЕФИТ ФИГУР: после шпор/слияний кольца дочинились,
    //    а уклоны у части граней остались от щипнутого состояния (A2 на
    //    12618 несла кластерные 6.23 при кольцевых 4.61 — R04). Лента
    //    ниже разрешающей ширины (4·stepFt, окно нормалей) не несёт
    //    кластерного уклона — её уклон и есть уклон её кольца.
    {
      const idxF = buildIndexes(candidate);
      let totalF = 0;
      for (const f of candidate.faces) {
        const rF = ringOf(f.lineIds, idxF);
        if (!rF || rF.length < 3) continue;
        const plF = fitPlane(rF);
        if (!plF) continue;
        const gF = Math.hypot(plF.a, plF.b) * 12;
        if (Number.isFinite(gF) && gF < 24) f.pitch = gF;
        const planF = Math.abs(signedArea(rF.map((q) => ({ x: q.x, y: q.y }))));
        f.areaSqft = planF * Math.sqrt(1 + (f.pitch / 12) ** 2);
        totalF += f.areaSqft;
      }
      if (totalF > 0) candidate.totals = { ...candidate.totals, areaSqft: totalF, squares: totalF / 100 };
      // разрешающая ширина измерения — полное окно нормалей (2·half+1 px):
      // линейки не судят собственный уклон лент уже неё
      candidate.resolutionFt = 5 * m.stepFt;
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

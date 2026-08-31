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
import { splitClustersByInnerWall } from "@/lib/roofRecon/wallSplit";
import { mergeCollinearChains } from "@/lib/roofRecon/straighten";
import { assembleRoofModel, type AssembleCell } from "@/lib/roofRecon/assembleModel";
import { COVERAGE_FLOOR } from "@/lib/roofDiagram/confidence";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { solveVertexZ } from "@/lib/roofRecon/zSolver";
import { googleCompositionArbiter, type ArbiterSegment, type GoogleArbiterReport } from "@/lib/roofRecon/googleArbiter";
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
  provenance: { measuredSqft: number; fillSqft: number; faces: Record<string, FaceProvenance>; google?: GoogleArbiterReport } | null;
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
  /**
   * Сегменты Google Solar (roofSegmentStats) в кадре-ft — арбитр состава
   * (googleArbiter.ts). Геометрию не правит: вердикт идёт в провенанс.
   */
  google?: ArbiterSegment[] | null;
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
  // Пенетрации — не свидетели перепада (класс 1b смотра RM-6KT8LW):
  // вент-ряд у конька 12629 продавливал dsmWallOk (клин-максимум по
  // буграм) и рожал фиктивную стену EAVE/FLASHING над ровной кровлей.
  const penSet = new Set((recon.diagnostics as unknown as { penetrationPx?: number[] }).penetrationPx ?? []);
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

  // ── GOOGLE-АРБИТР СОСТАВА (провенанс/достоверность, геометрию не правит) ──
  // Считается от КЛАСТЕРОВ (сегментация готова до любых гейтов), поэтому
  // живёт и на домах, где сшивка не состоялась (пол покрытия, отказ гейтов).
  const googleArbiterOf = (): GoogleArbiterReport | undefined => {
    if (!input.google || !input.google.length) return undefined;
    const wA = dsm.width;
    const hA = dsm.height;
    const stepA = m.stepFt;
    const byCl = new Map<number, { n: number; sx: number; sy: number }>();
    for (let i = 0; i < d.assign.length; i++) {
      const cl = d.assign[i];
      if (cl < 0) continue;
      const e = byCl.get(cl) ?? { n: 0, sx: 0, sy: 0 };
      e.n++;
      e.sx += ((i % wA) + 0.5 - wA / 2) * stepA;
      e.sy += (hA / 2 - Math.floor(i / wA) - 0.5) * stepA;
      byCl.set(cl, e);
    }
    const oursCl = [...byCl.entries()].map(([cl, e]) => {
      const pl = d.clusterPlanes[cl];
      return {
        cl,
        sf: e.n * stepA * stepA,
        xFt: e.sx / e.n,
        yFt: e.sy / e.n,
        compass: ((Math.atan2(-pl.a, -pl.b) * 180) / Math.PI + 360) % 360,
        pitch12: Math.hypot(pl.a, pl.b) * 12,
      };
    });
    const rep = googleCompositionArbiter(input.google, oursCl);
    for (const n of rep.notes) reasons.push(n);
    if (rep.missedSlopes.length)
      reasons.push(`Google-арбитр: пропущенные скаты — ${rep.missedSlopes.map((s) => `${s.areaSf.toFixed(0)}sf@${s.azDeg.toFixed(0)}°`).join(", ")}`);
    if (rep.mergeCandidates.length)
      reasons.push(`Google-арбитр: кандидаты на слияние — ${rep.mergeCandidates.map((mc) => `[${mc.cls.join("+")}]`).join(", ")}`);
    return rep;
  };

  const skeletonWhole = (why: string): MeasuredRoofResult => {
    reasons.push(why);
    const google = googleArbiterOf();
    return {
      model: skeleton,
      engine: "skeleton-fill",
      measuredShare: m.measuredShare,
      provenance: google ? { measuredSqft: 0, fillSqft: 0, faces: {}, google } : null,
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

  // ── РАСЩЕПЛЕНИЕ КЛАСТЕРА ПО ВНУТРЕННЕЙ СТЕНЕ (отмашка 2026-08-31):
  //    линия прямого DSM-обрыва насквозь через кластер режет регион на
  //    интра-секции; каждая секция — полноправный кластер со своей
  //    плоскостью, стена между ними — штатная граница пары (WallProfile,
  //    vzOf-близнецы, fade, типы — все читатели штатные). ──
  {
    const res = splitClustersByInnerWall({
      region,
      regionKind,
      clusterOf,
      width: w,
      height: h,
      stepFt,
      minFacetSqft: MIN_FACET_SQFT,
      zOf: (pi) => (pi < 0 || mask.data[pi] <= 0.5 || penSet.has(pi) ? null : dsm.data[pi] * FT_PER_M - groundElevFt),
      ftOf: (pi) => m.ftOf(pi),
      coreDzFt: 2.0,
      growDzFt: 1.8,
      planeTolFt: DEFAULT_PLANE_TOL_FT,
      registerCluster: (plane, pixels) => {
        const id = d.clusterPlanes.length;
        d.clusterPlanes.push(plane);
        m.clusterIn.push(true);
        for (const pi of pixels) d.assign[pi] = id;
        return id;
      },
    });
    if (res.report.length) reasons.push(...res.report); // отказы суда секций — тоже в отчёт (§J)
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
  const baseLines = m.lines.map((l) => ({ a: l.a, b: l.b, between: l.between, sigmaPerpFt: l.sigmaPerpFt, gradDiffPerFt: l.gradDiffPerFt, snapCorridorFt: undefined as number | undefined, wallPair: false }));
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
      wallDropOf: (a, b) => directWallDrop(a, b),
      wallSidesOf: (a, b) => wallSides(a, b),
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
  // ── ГРАНИЦЫ ПАР НА ПЕРЕСЕЧЕНИИ ПЛОСКОСТЕЙ + АЗИМУТ-ЛОКАТОР ──
  // Приказ 2026-08-30 (блок 2 → конвейер): граница пары кластеров СТАВИТСЯ
  // на аналитическое пересечение их чистых плоскостей — это единственная
  // точка, где обе плоскости дают один z (варп блока 1 жил именно на
  // границах вне пересечений). Прежний потолок 2·max(σ⊥, окно) снят:
  // трасса — свидетель СОСТАВА границы, не её положения.
  // Локатор — полевой свидетель: азимут стока (LSQ-градиент 5×5, то же
  // окно half=2, что у нормалей) вдоль перпендикуляра; максимум |Δазимут|
  // соседних станций ≥ 20° — переход. Точность выведена из данных: размытие
  // окна 2·step + полшага сканирования (на 14 подтверждённых границах
  // блока 2 расхождение локатор−аналитика ≤ 0.7 ft — внутри предела).
  // Вердикт не двигает геометрию (двигает пересечение) — он ставится в
  // провенанс: «локатор+аналитика» / «analytic-only» / «локатор спорит».
  // Стены (Δz ≥ переписного пола) не трогаются: их пересечение — фикция.
  // ── ПРЯМОЙ DSM-ПЕРЕПАД ПОПЕРЁК ЛИНИИ (единый закон стены) ──
  // Стену судит только прямой замер, никогда план-эвалы плоскостей:
  // экстраполяция за опору давала Δz 2.8 на гладком скате (SE-ободок
  // 12629) — фиктивные стены рожали близнецов, фантомную сшивку и G2.
  // Медиана по трём станциям; на станции — максимум по смещениям
  // 2·step / 4·step / 2 ft (клин у ободка бывает уже пробника).
  const directWallDrop = (a0: FootprintPoint, b0: FootprintPoint, toRaster?: (p: FootprintPoint) => FootprintPoint): number => {
    const run0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
    if (run0 < 1e-6) return 0;
    const per0 = { x: -(b0.y - a0.y) / run0, y: (b0.x - a0.x) / run0 };
    const drops0: number[] = [];
    for (const t0 of [0.25, 0.5, 0.75]) {
      const mid0 = { x: a0.x + (b0.x - a0.x) * t0, y: a0.y + (b0.y - a0.y) * t0 };
      let dMax = NaN;
      for (const off0 of [2 * stepFt, 4 * stepFt, 2]) {
        const zAt = (s0: number): number => {
          const q0 = { x: mid0.x + per0.x * s0 * off0, y: mid0.y + per0.y * s0 * off0 };
          const pi0 = m.pxOf(toRaster ? toRaster(q0) : q0);
          if (pi0 < 0 || mask.data[pi0] <= 0.5 || penSet.has(pi0)) return NaN;
          return dsm.data[pi0] * FT_PER_M - groundElevFt;
        };
        // СТУПЕНЬ — РАЗРЫВ, не градиент (класс 1c смотра RM-6KT8LW):
        // |z(+o)−z(−o)| на крутом скате поперёк горизонтали — это
        // уклон·2o (8/12 давал 2.7 «стены» на гладкой плоскости).
        // Вторая разность вычитает непрерывный уклон: на гладком — 0,
        // на ступени — её высота. Без внешних образцов — старая разность.
        const z1 = zAt(1);
        const z2 = zAt(-1);
        const zo1 = zAt(2);
        const zo2 = zAt(-2);
        let d0 = Math.abs(z1 - z2);
        if (Number.isFinite(zo1) && Number.isFinite(zo2) && Number.isFinite(d0)) d0 = Math.abs((z1 - z2) - (zo1 - z1) - (z2 - zo2));
        if (Number.isFinite(d0) && (!Number.isFinite(dMax) || d0 > dMax)) dMax = d0;
      }
      if (Number.isFinite(dMax)) drops0.push(dMax);
    }
    if (!drops0.length) return Number.POSITIVE_INFINITY; // мерить не обо что — не мешать
    // МАКСИМУМ станций, не медиана: стена-клин сужается вдоль линии
    // (тот же закон, что dzEnds «по концам, максимумом») — медиана
    // разбавляла выцветающий клиф 1.9/1.25/0.6 → 1.25 и смешанная
    // граница объявлялась складкой целиком (vzof-synth, юг стены)
    return Math.max(...drops0);
  };
  // Перепад ПО ТРАССЕ пары: стена живёт у границы ЛАБЕЛЕЙ, не у линии
  // (линия шага 1 — пересечение плоскостей, у стены оно фикция и стоит в
  // стороне — vzof-synth мерил перепад восточнее клифа и стены не видел).
  // Для лабельно-смежных пикселей пары: z на 2px вглубь каждой стороны,
  // перепад — максимум (закон клина, как dzEnds «по концам максимумом»).
  // Стороны стены на станции: тот же примитив, что directWallDrop, но с
  // УРОВНЯМИ сторон (zHi/zLo прямым замером) — профиль несёт не только
  // вердикт, но и высоты; близнецы стены читают их, не план-эвалы.
  const wallSides = (a0: FootprintPoint, b0: FootprintPoint, toRaster?: (p: FootprintPoint) => FootprintPoint): { d: number; zHi: number; zLo: number } | null => {
    const run0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
    if (run0 < 1e-6) return null;
    const per0 = { x: -(b0.y - a0.y) / run0, y: (b0.x - a0.x) / run0 };
    let best: { d: number; zHi: number; zLo: number } | null = null;
    for (const t0 of [0.25, 0.5, 0.75]) {
      const mid0 = { x: a0.x + (b0.x - a0.x) * t0, y: a0.y + (b0.y - a0.y) * t0 };
      for (const off0 of [2 * stepFt, 4 * stepFt, 2]) {
        const zAt = (s0: number): number => {
          const q0 = { x: mid0.x + per0.x * s0 * off0, y: mid0.y + per0.y * s0 * off0 };
          const pi0 = m.pxOf(toRaster ? toRaster(q0) : q0);
          if (pi0 < 0 || mask.data[pi0] <= 0.5 || penSet.has(pi0)) return NaN;
          return dsm.data[pi0] * FT_PER_M - groundElevFt;
        };
        const z1 = zAt(1);
        const z2 = zAt(-1);
        if (!Number.isFinite(z1) || !Number.isFinite(z2)) continue;
        const zo1 = zAt(2);
        const zo2 = zAt(-2);
        let d0 = Math.abs(z1 - z2);
        if (Number.isFinite(zo1) && Number.isFinite(zo2)) d0 = Math.abs((z1 - z2) - (zo1 - z1) - (z2 - zo2));
        if (!best || d0 > best.d) best = { d: d0, zHi: Math.max(z1, z2), zLo: Math.min(z1, z2) };
      }
    }
    return best;
  };
  const LOC_SCAN_FT = 4;
  const LOC_STEP_FT = 0.5;
  const LOC_GATE_DEG = 20;
  const LOC_ACC_FT = 2 * stepFt + LOC_STEP_FT / 2;
  const azAt = (p: FootprintPoint): number | null => {
    let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0, n = 0;
    for (let dy2 = -2; dy2 <= 2; dy2++) for (let dx2 = -2; dx2 <= 2; dx2++) {
      const pi = m.pxOf({ x: p.x + dx2 * stepFt, y: p.y + dy2 * stepFt });
      if (pi < 0 || mask.data[pi] <= 0.5) continue;
      const x = dx2 * stepFt;
      const y = dy2 * stepFt;
      const z = dsm.data[pi] * FT_PER_M;
      sx += x; sy += y; sz += z; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z; n++;
    }
    if (n < 6) return null;
    const det = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx);
    if (Math.abs(det) < 1e-9) return null;
    const ga = (sxz * (syy * n - sy * sy) - sxy * (syz * n - sy * sz) + sx * (syz * sy - syy * sz)) / det;
    const gb = (sxx * (syz * n - sy * sz) - sxz * (sxy * n - sx * sy) + sx * (sxy * sz - syz * sx)) / det;
    if (Math.hypot(ga, gb) < 0.5 / 12) return null; // ровное — вне поля
    return Math.atan2(gb, ga);
  };
  // позиция перехода вдоль перпендикуляра (nx,ny) от точки mid; null — молчит
  const locatorAt = (mid: FootprintPoint, nx: number, ny: number): number | null => {
    let bestT: number | null = null;
    let bestD = 0;
    let prev: number | null = null;
    let prevT = 0;
    for (let t = -LOC_SCAN_FT; t <= LOC_SCAN_FT + 1e-9; t += LOC_STEP_FT) {
      const az = azAt({ x: mid.x + nx * t, y: mid.y + ny * t });
      if (az === null) { prev = null; continue; }
      if (prev !== null) {
        let dAz = (Math.abs(az - prev) * 180) / Math.PI;
        if (dAz > 180) dAz = 360 - dAz;
        if (dAz > bestD) { bestD = dAz; bestT = (t + prevT) / 2; }
      }
      prev = az;
      prevT = t;
    }
    return bestD >= LOC_GATE_DEG ? bestT : null;
  };
  const snapCounts = { loc: 0, anal: 0, disp: 0, onSpot: 0 };
  const snapLineToIntersection = (l: (typeof baseLines)[number]): void | "wall" => {
    const A = d.clusterPlanes[l.between[0]];
    const B = d.clusterPlanes[l.between[1]];
    if (!A || !B) return;
    const da = A.a - B.a;
    const db = A.b - B.b;
    const nrm = Math.hypot(da, db);
    if (nrm < 1e-4) return;
    const mx = (l.a.x + l.b.x) / 2;
    const my = (l.a.y + l.b.y) / 2;
    // стену судит ТОЛЬКО прямой DSM-перепад поперёк линии (максимум
    // станций — закон клина); план-эвалы экстраполируют
    if (directWallDrop(l.a, l.b) >= STEP_DZ_FT) return "wall";
    const off = (da * mx + db * my + (A.c - B.c)) / nrm;
    const nx = da / nrm;
    const ny = db / nrm;
    // Трасса — свидетель состава границы, не положения: её вершины обязаны
    // дойти до пересечения с ЛЮБОГО расстояния (перп-допуск снят; держат
    // reach-гейт, запрет пересечений и кольцо). На 12618 трасса стояла в
    // 9.6–11.9 ft от аналитической линии — прежний probe 6 ft её не пускал.
    if (Math.abs(off) < 1e-3) { snapCounts.onSpot++; l.snapCorridorFt = Number.POSITIVE_INFINITY; return; }
    // вердикт локатора ДО переноса: три станции вдоль линии, медиана
    const ts: number[] = [];
    for (const f of [0.3, 0.5, 0.7]) {
      const st = { x: l.a.x + (l.b.x - l.a.x) * f, y: l.a.y + (l.b.y - l.a.y) * f };
      const t = locatorAt(st, nx, ny);
      if (t !== null) ts.push(t);
    }
    if (!ts.length) snapCounts.anal++;
    else {
      ts.sort((u, v) => u - v);
      const med = ts[Math.floor(ts.length / 2)];
      if (Math.abs(med - off) <= LOC_ACC_FT) snapCounts.loc++;
      else snapCounts.disp++;
    }
    const px0 = { x: mx - nx * off, y: my - ny * off };
    const dirL = { x: -ny, y: nx };
    for (const q of [l.a, l.b]) {
      const tq = (q.x - px0.x) * dirL.x + (q.y - px0.y) * dirL.y;
      q.x = px0.x + dirL.x * tq;
      q.y = px0.y + dirL.y * tq;
    }
    l.snapCorridorFt = Number.POSITIVE_INFINITY;
  };
  {
    let walls0 = 0;
    for (const l of baseLines) if (snapLineToIntersection(l) === "wall") { l.wallPair = true; walls0++; }
    if (walls0) reasons.push(`${walls0} линий пар с клифом: линия — фикция пересечения, трасса на неё не проецируется (стеновой край манхэттенизируется)`);
  }
  if (process.env.DBG_MLINES) {
    for (const l of baseLines)
      console.log(`[mline] [${l.between}] (${l.a.x.toFixed(1)},${l.a.y.toFixed(1)})→(${l.b.x.toFixed(1)},${l.b.y.toFixed(1)}) wallPair=${l.wallPair} σ⊥=${l.sigmaPerpFt?.toFixed(2) ?? "-"}`);
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
    let massEdges = 0;
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
      // A STEP pair's plane intersection is fiction — the boundary is a wall,
      // not a fold. Стену судит ТОЛЬКО прямой DSM-перепад поперёк пролёта
      // (максимум станций — закон клина); план-эвалы экстраполируют.
      if (directWallDrop({ x: px0.x + dir.x * t0, y: px0.y + dir.y * t0 }, { x: px0.x + dir.x * t1, y: px0.y + dir.y * t1 }) >= STEP_DZ_FT) {
        // МАСС-ГРАНИЦА ПО КОНТУРУ (класс 2 смотра RM-6KT8LW): ступень,
        // совпадающая с ИЗЛОМОМ КОНТУРА, — край верхней массы; её след
        // прям, и его направление задаёт контур Instant (обмер, не
        // план-эвал — закон «стены живут трассой» о фикции пересечения
        // плоскостей, контур фикцией не является). Стеновая цепь,
        // коллинеарная смежному ребру контура (≤25°) и стоящая от его
        // ПРОДОЛЖЕНИЯ не дальше пробника, получает это продолжение
        // несущей: спрямление, узлы и атомарные терминалы дальше работают
        // штатно — вальма/ендова верхней массы кончаются на этом крае.
        const mDir = { x: dir.x, y: dir.y }; // главное направление цепи (PCA по span)
        let best: { a: FootprintPoint; b: FootprintPoint; d: number } | null = null;
        for (let ri = 0; ri < movedRing.length; ri++) {
          const ra = movedRing[ri];
          const rb = movedRing[(ri + 1) % movedRing.length];
          const eL = Math.hypot(rb.x - ra.x, rb.y - ra.y);
          if (eL < 2) continue;
          const ed = { x: (rb.x - ra.x) / eL, y: (rb.y - ra.y) / eL };
          const cosA = Math.abs(ed.x * mDir.x + ed.y * mDir.y);
          if (cosA < Math.cos((25 * Math.PI) / 180)) continue;
          // расстояние центра цепи от ЛИНИИ ребра (продолжение допустимо)
          const en = { x: -ed.y, y: ed.x };
          // ВСЯ цепь в пробнике от продолжения (центра мало: длинная цепь
          // с дальним хвостом на первом заходе рвала 12618 — R02/Euler 0)
          let dMax2 = 0;
          for (const q of pts) dMax2 = Math.max(dMax2, Math.abs((q.x - ra.x) * en.x + (q.y - ra.y) * en.y));
          if (dMax2 > PROBE_FT) continue;
          if (!best || dMax2 < best.d) best = { a: ra, b: rb, d: dMax2 };
        }
        if (best) {
          const eL = Math.hypot(best.b.x - best.a.x, best.b.y - best.a.y);
          const ed = { x: (best.b.x - best.a.x) / eL, y: (best.b.y - best.a.y) / eL };
          let s0 = Infinity;
          let s1 = -Infinity;
          let pSS = 0;
          for (const q of pts) {
            const t = (q.x - best.a.x) * ed.x + (q.y - best.a.y) * ed.y;
            if (t < s0) s0 = t;
            if (t > s1) s1 = t;
            const pp = (q.x - best.a.x) * -ed.y + (q.y - best.a.y) * ed.x;
            pSS += pp * pp;
          }
          if (s1 > s0) {
            virtual.push({
              a: { x: best.a.x + ed.x * s0, y: best.a.y + ed.y * s0 },
              b: { x: best.a.x + ed.x * s1, y: best.a.y + ed.y * s1 },
              between: [ca, cb] as [number, number],
              sigmaPerpFt: Math.sqrt(pSS / pts.length),
              gradDiffPerFt: nrm,
              snapCorridorFt: Number.POSITIVE_INFINITY,
              wallPair: false,
            });
            massEdges++;
          }
        }
        continue;
      }
      // виртуальная линия УЖЕ на пересечении; коридор проекции — измеренное
      // смещение трассы + разброс + окно (тот же закон, что у снапа выше)
      const vLine = {
        a: { x: px0.x + dir.x * t0, y: px0.y + dir.y * t0 },
        b: { x: px0.x + dir.x * t1, y: px0.y + dir.y * t1 },
        between: [ca, cb] as [number, number],
        sigmaPerpFt: Math.sqrt(perpSS / pts.length),
        gradDiffPerFt: nrm,
        snapCorridorFt: Number.POSITIVE_INFINITY,
        wallPair: false,
      };
      if (Math.abs(off) >= 1e-3) {
        const ts: number[] = [];
        const nx = da / nrm;
        const ny = db / nrm;
        for (const f of [0.3, 0.5, 0.7]) {
          const st = { x: mx + (vLine.b.x - vLine.a.x) * (f - 0.5), y: my + (vLine.b.y - vLine.a.y) * (f - 0.5) };
          const t = locatorAt(st, nx, ny);
          if (t !== null) ts.push(t);
        }
        if (!ts.length) snapCounts.anal++;
        else {
          ts.sort((u, v) => u - v);
          const med = ts[Math.floor(ts.length / 2)];
          if (Math.abs(med - off) <= LOC_ACC_FT) snapCounts.loc++;
          else snapCounts.disp++;
        }
      } else snapCounts.onSpot++;
      virtual.push(vLine);
    }
    if (virtual.length) {
      rcLines = [...baseLines, ...virtual];
      rc = runCells(rcLines);
      reasons.push(`${virtual.length} виртуальных линий из плоскостей пар — межкластерные границы спрямлены${massEdges ? ` (из них ${massEdges} масс-границ по контуру)` : ""}`);
    }
    if (process.env.DBG_RCLINES) rcLines.forEach((l, i) => console.log(`[rcl] li=${i} between=[${l.between[0]}|${l.between[1]}] (${l.a.x.toFixed(1)},${l.a.y.toFixed(1)})→(${l.b.x.toFixed(1)},${l.b.y.toFixed(1)}) σ⊥=${l.sigmaPerpFt.toFixed(2)}`));
    const totalSnap = snapCounts.loc + snapCounts.anal + snapCounts.disp;
    if (totalSnap || snapCounts.onSpot) reasons.push(`границы пар на пересечении плоскостей: ${totalSnap} поставлено (${snapCounts.loc} локатор+аналитика, ${snapCounts.anal} analytic-only, ${snapCounts.disp} локатор спорит), ${snapCounts.onSpot} уже на месте; точность локатора ${LOC_ACC_FT.toFixed(2)} ft (окно 2·step + полшага скана)`);
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
  // ── ЗАКОН СОСТАВА ЯЧЕЙКИ (приказ 2026-08-30, механизм 1) ──
  // Прежний cellRms считал только пиксели СВОЕГО кластера — мешок 1283 sf
  // на 12621 (cl0+cl2+cl1+cl4) прошёл с rms 0.21 по 543 sf кластера cl0:
  // линейка была слепа к чужим. Перепись теперь полная: опора (свои),
  // чужаки-невписавшиеся (пиксели других кластеров вне допуска к
  // заявленной плоскости), без хозяина. Грань — одна плоскость: ячейка
  // с опорой меньше пола грани или с чужим невписавшимся составом
  // ≥ пола грани — НЕ измеренная; она fill с честным провенансом.
  const cellCensus = (cell: RegionCell, pl: Plane, cl: number): { rms: number; ownSf: number; foreignMisfitSf: number } => {
    const xs = cell.ring.map((p) => p.x);
    const ys = cell.ring.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const step = Math.max(stepFt, Math.min(maxX - minX, maxY - minY) / 12);
    const cellSf = step * step;
    let ss = 0;
    let n = 0;
    let foreignMisfit = 0;
    for (let y = minY + step / 2; y < maxY; y += step) {
      for (let x = minX + step / 2; x < maxX; x += step) {
        if (!inRing({ x, y }, cell.ring)) continue;
        const pi = m.pxOf({ x, y });
        if (pi < 0 || mask.data[pi] <= 0.5) continue;
        const asg = d.assign[pi];
        const z = dsm.data[pi] * FT_PER_M - groundElevFt;
        const dz = z - (pl.a * x + pl.b * y + pl.c);
        if (asg === cl) {
          ss += dz * dz;
          n++;
        } else if (asg >= 0 && m.clusterIn[asg] && Math.abs(dz) > DEFAULT_PLANE_TOL_FT) {
          // чужой доверенный кластер, и поверхность там НЕ наша плоскость
          foreignMisfit += cellSf;
        }
        // безхозные пиксели — признанные неизвестные (полоса поглощения),
        // прежний закон сохранён: против ячейки не считаются
      }
    }
    return { rms: n >= 3 ? Math.sqrt(ss / n) : Number.POSITIVE_INFINITY, ownSf: n * cellSf, foreignMisfitSf: foreignMisfit };
  };
  let demotedSupport = 0;
  let demotedTrespass = 0;
  let refitted = 0;
  const infos: CellInfo[] = rc.cells.map((cell) => {
    const cl = cell.regionId >= 0 && regionKind[cell.regionId] === "cluster" ? clusterOf[cell.regionId] : -1;
    const pl = cl >= 0 ? clusterPlane.get(cl) : undefined;
    if (pl) {
      const cs = cellCensus(cell, pl, cl!);
      if (cs.rms <= DEFAULT_PLANE_TOL_FT && cs.ownSf >= MIN_FACET_SQFT && cs.foreignMisfitSf < MIN_FACET_SQFT)
        return { cell, rmsFt: cs.rms, cluster: cl, plane: pl, prov: "measured-dsm" };
      // ── ПЕРЕПОДГОНКА ПО КЛЕТКЕ (отмашка 2026-08-31, «секция —
      // полноправный кластер со своей плоскостью»): кластерная плоскость
      // может быть наклонена чужими кусками склейки (12618: cl3 = склон +
      // плато-крошка → rms клетки > пола → fill → кольцо брало
      // СКЕЛЕТНЫЕ z с фикцией до +8 ft). Клетка — наименьшая единица
      // состава: своя LS-плоскость по своим пикселям, та же линейка
      // (DEFAULT_PLANE_TOL_FT, MIN_FACET_SQFT). Мусор (деревья) её всё
      // равно провалит — fill остаётся честным отказом.
      if (cs.rms > DEFAULT_PLANE_TOL_FT) {
        const own = ((): Plane | null => {
          let sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0, n = 0;
          for (let i = 0; i < w * h; i++) {
            if (region[i] !== cell.regionId) continue;
            if (mask.data[i] <= 0.5 || penSet.has(i)) continue;
            const p = m.ftOf(i);
            const z = dsm.data[i] * FT_PER_M - groundElevFt;
            sx += p.x; sy += p.y; sz += z;
            sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y;
            sxz += p.x * z; syz += p.y * z;
            n++;
          }
          if (n * pxSqft < MIN_FACET_SQFT) return null;
          const d11 = sxx - (sx * sx) / n;
          const d12 = sxy - (sx * sy) / n;
          const d22 = syy - (sy * sy) / n;
          const b1 = sxz - (sx * sz) / n;
          const b2 = syz - (sy * sz) / n;
          const det = d11 * d22 - d12 * d12;
          if (Math.abs(det) < 1e-9) return null;
          const a = (b1 * d22 - b2 * d12) / det;
          const b = (b2 * d11 - b1 * d12) / det;
          return { a, b, c: (sz - a * sx - b * sy) / n };
        })();
        if (own) {
          const cs2 = cellCensus(cell, own, cl!);
          if (cs2.rms <= DEFAULT_PLANE_TOL_FT && cs2.ownSf >= MIN_FACET_SQFT && cs2.foreignMisfitSf < MIN_FACET_SQFT) {
            refitted++;
            return { cell, rmsFt: cs2.rms, cluster: cl, plane: own, prov: "measured-dsm" };
          }
          if (process.env.DBG_REFIT) console.log(`[refit] регион ${cell.regionId} (cl${cl}): ОТКАЗ rms=${cs2.rms.toFixed(2)} ownSf=${Math.round(cs2.ownSf)} foreign=${Math.round(cs2.foreignMisfitSf)} (кластерный rms=${cs.rms.toFixed(2)})`);
        } else if (process.env.DBG_REFIT) console.log(`[refit] регион ${cell.regionId} (cl${cl}): плоскость не подгоняется`);
      }
      if (cs.rms <= DEFAULT_PLANE_TOL_FT) {
        if (cs.ownSf < MIN_FACET_SQFT) demotedSupport++;
        else demotedTrespass++;
      }
      return { cell, rmsFt: cs.rms, cluster: null, plane: null, prov: "fill" };
    }
    return { cell, rmsFt: Number.POSITIVE_INFINITY, cluster: null, plane: null, prov: "fill" };
  });
  if (refitted) reasons.push(`переподгонка по клетке: ${refitted} клеток спасено своей плоскостью (кластерная была наклонена склейкой)`);
  if (demotedSupport || demotedTrespass) reasons.push(`закон состава: ${demotedSupport} ячеек без опоры (< ${MIN_FACET_SQFT} sf своих) и ${demotedTrespass} с чужим невписавшимся составом ≥ пола — понижены в fill`);

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
  // Сходимость плоскостей удалена: её z-власть заменил единый финальный
  // z-солвер (zSolver.ts). Плоскости кластеров остаются как измерены.
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

  // ЛОКАЛЬНАЯ опора: вес плоскости в вершине — её пиксели ВОЗЛЕ вершины
  // (клетки 3 ft, окрестность ±7.5 ft). Глобальная опора позволяла
  // плоскости голосовать там, где у неё нет ни одного пикселя
  // (экстраполяция за опору — ободки, сшитые экс-фантомы): большие грани
  // варпались до 1.8-2.3 ft. Плоскость без местных свидетельств голоса
  // не имеет (вес-пол 1 наравне с заполнителем).
  const CELL9 = 3;
  const clusterCellPx = new Map<number, Map<string, number>>();
  {
    const w9 = dsm.width;
    const stepFt9 = m.stepFt;
    const cx9 = w9 / 2;
    const cy9 = dsm.height / 2;
    for (let i = 0; i < d.assign.length; i++) {
      const cl = d.assign[i];
      if (cl < 0) continue;
      const x9 = ((i % w9) + 0.5 - cx9) * stepFt9;
      const y9 = (cy9 - Math.floor(i / w9) - 0.5) * stepFt9;
      const k9 = `${Math.floor(x9 / CELL9)}|${Math.floor(y9 / CELL9)}`;
      const m9 = clusterCellPx.get(cl) ?? clusterCellPx.set(cl, new Map()).get(cl)!;
      m9.set(k9, (m9.get(k9) ?? 0) + 1);
    }
  }
  const localSupport = (cluster: number, xr: number, yr: number): number => {
    const m9 = clusterCellPx.get(cluster);
    if (!m9) return 0;
    const cxq = Math.floor(xr / CELL9);
    const cyq = Math.floor(yr / CELL9);
    let n9 = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) n9 += m9.get(`${cxq + dx}|${cyq + dy}`) ?? 0;
    return n9;
  };

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
    // УРОВНИ ВЕРШИНЫ — ОТ ПРОФИЛЯ СТЕНЫ (класс «одна величина — один
    // источник истины»): клетки сливаются в один уровень, если профиль их
    // пары в этой точке НЕ стена (складка/нет границы/нет профиля);
    // разделяются ТОЛЬКО там, где профиль говорит «стена». Прежняя
    // эвальная цепочка (зазор переписи по план-эвалам) умерла: эвалы
    // рождали и фиктивных близнецов (SE-ободок), и обратную фикцию
    // «стены нет» (близкие эвалы на настоящем клифе -> складка с изломами).
    const parentG = entries.map((_, i) => i);
    const findG = (i: number): number => (parentG[i] === i ? i : (parentG[i] = findG(parentG[i])));
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        // сплит только там, где станция несёт РАЗВЕДЁННЫЕ уровни (точка
        // выцветания клина = сшивка): гистерезисный хвост wall-вердикта с
        // уровнями ниже переписи сваривается — межзонных близнецов (G8)
        // профиль не публикует
        const st = rc.wallStationAt(entries[i].ci.cell.regionId, entries[j].ci.cell.regionId, p);
        const split = st !== null && st.wall && st.zHi - st.zLo >= STEP_DZ_FT;
        if (!split && findG(i) !== findG(j)) parentG[findG(j)] = findG(i);
      }
    }
    const byRoot = new Map<number, Array<{ ci: CellInfo; z: number }>>();
    for (let i = 0; i < entries.length; i++) {
      const r = findG(i);
      (byRoot.get(r) ?? byRoot.set(r, []).get(r)!).push(entries[i]);
    }
    const groups: Array<Array<{ ci: CellInfo; z: number }>> = [...byRoot.values()].sort((a, b) => a[0].z - b[0].z);
    const out = new Map<CellInfo, { z: number; tag?: string }>();
    const groupZ = (g: Array<{ ci: CellInfo; z: number }>): number => {
      // z уровня В ТОЧКЕ — по ЛОКАЛЬНОЙ ОПОРЕ (приказ 2026-08-30, та же
      // «опора в точке», что у z-солвера): голосуют только плоскости с
      // местными пикселями, вес — их счёт. Среднее с экстраполирующим
      // эвалом давало фикцию (12621: 15.1 из честных 13.1 + чужих 16.7).
      // Без местных свидетелей — прежний закон (measured, затем все).
      const meas = g.filter((e) => e.ci.prov !== "fill");
      const voters = meas
        .map((e) => ({ e, w: e.ci.cluster !== null ? localSupport(e.ci.cluster, p.x, p.y) : 0 }))
        .filter((v) => v.w > 0);
      if (voters.length) {
        const wSum = voters.reduce((s2, v) => s2 + v.w, 0);
        return voters.reduce((s2, v) => s2 + v.e.z * v.w, 0) / wSum;
      }
      const src = meas.length ? meas : g;
      return src.reduce((s2, e) => s2 + e.z, 0) / src.length;
    };
    if (groups.length === 1) {
      const z = groupZ(groups[0]);
      for (const e of groups[0]) out.set(e.ci, { z });
    } else {
      // УРОВНИ БЛИЗНЕЦОВ — ОТ ПРОФИЛЯ: если групповые z (эвальные) сжаты
      // ниже переписи (обратная фикция у клифа), стороны растягиваются на
      // прямозамерные уровни станции (zHi/zLo) — G8-межзоны не рождается
      const zs2 = groups.map((g) => groupZ(g));
      if (groups.length === 2 && Math.abs(zs2[1] - zs2[0]) < STEP_DZ_FT) {
        const st = rc.wallStationAt(groups[0][0].ci.cell.regionId, groups[1][0].ci.cell.regionId, p);
        if (st && st.wall && st.zHi - st.zLo >= STEP_DZ_FT) {
          const hiIdx = zs2[0] >= zs2[1] ? 0 : 1;
          zs2[hiIdx] = st.zHi;
          zs2[1 - hiIdx] = st.zLo;
        }
      }
      groups.forEach((g, gi) => {
        for (const e of g) out.set(e.ci, { z: zs2[gi], tag: `L${gi}` });
      });
    }
    vzOf.set(k, out);
    if (process.env.DBG_VZAT) {
      const [qx9, qy9] = process.env.DBG_VZAT.split(",").map(Number);
      if (Math.hypot(p.x - qx9, p.y - qy9) <= 1.5) {
        const stD = entries.length >= 2 ? rc.wallStationAt(entries[0].ci.cell.regionId, entries[entries.length - 1].ci.cell.regionId, p) : null;
        console.log(`[vzat] (${p.x.toFixed(2)},${p.y.toFixed(2)}) клеток ${entries.length} [${entries.map((e) => `r${e.ci.cell.regionId}:${e.z.toFixed(1)}`).join(" ")}] групп ${groups.length} st=${stD ? `${stD.wall ? "WALL" : "нет"} ${stD.zHi.toFixed(1)}/${stD.zLo.toFixed(1)}` : "null"}`);
      }
    }
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
  if (process.env.DBG_EDGEAT) {
    const [ex, ey] = process.env.DBG_EDGEAT.split(",").map(Number);
    for (const ci of infos) {
      for (const e of ci.cell.edges) {
        const mx = (e.a.x + e.b.x) / 2;
        const my = (e.a.y + e.b.y) / 2;
        if (Math.min(Math.hypot(e.a.x - ex, e.a.y - ey), Math.hypot(e.b.x - ex, e.b.y - ey), Math.hypot(mx - ex, my - ey)) > 1.5) continue;
        console.log(`[edgeat] cell r${ci.cell.regionId}(cl${ci.cluster ?? "-"} ${ci.prov}) ${e.prov}${e.pair ? `[${e.pair}]` : ""} (${e.a.x.toFixed(1)},${e.a.y.toFixed(1)})→(${e.b.x.toFixed(1)},${e.b.y.toFixed(1)})`);
      }
    }
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
    // КРАЙ СЕКЦИИ (класс 1a смотра RM-6KT8LW): FLASHING живёт только
    // между ДВУМЯ кровлями; если по одну из сторон большинство станций —
    // не крыша (земля/за маской), ступень — край массы: нижняя сторона
    // носит EAVE/RAKE своего уровня, красного не рисуем.
    const stepEdgeOuter = (e: (typeof ci.cell.edges)[number]): boolean => {
      const runE = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
      if (runE < 1e-6) return false;
      const perE = { x: -(e.b.y - e.a.y) / runE, y: (e.b.x - e.a.x) / runE };
      let r1 = 0;
      let r2 = 0;
      let n = 0;
      for (const t of [0.25, 0.5, 0.75]) {
        const mid = { x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y + (e.b.y - e.a.y) * t };
        // судит БЛИЖАЙШИЙ валидный образец: «хоть где-то крыша» дотягивался
        // через 3-ft вырез до другой лопасти маски
        const isRoof = (sgn: number): boolean => {
          for (const off of [2 * m.stepFt, 4 * m.stepFt, 2]) {
            const pi = m.pxOf({ x: mid.x + perE.x * sgn * off, y: mid.y + perE.y * sgn * off });
            if (pi >= 0) return mask.data[pi] > 0.5;
          }
          return false;
        };
        n++;
        if (isRoof(1)) r1++;
        if (isRoof(-1)) r2++;
      }
      return r1 * 2 <= n || r2 * 2 <= n;
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
      srcIndex: infos.indexOf(ci),
      ring: ci.cell.ring.map((p) => {
        const v = vAt(p);
        return { x: p.x, y: p.y, z: v.z, tag: v.tag };
      }),
      pitch12: Math.hypot(grad.a, grad.b) * 12,
      orientationDeg: ((Math.atan2(dh.x, dh.y) * 180) / Math.PI + 360) % 360,
      zOf: (x, y) => zOfInfo(ci, { x, y }),
      edgeTypes: ci.cell.edges.map((e) => {
        if (e.prov !== "contour" && isStepEdge(e)) {
          if (upperAt(e)) return "EAVE";
          if (stepEdgeOuter(e)) {
            const za = zOfInfo(ci, e.a);
            const zb = zOfInfo(ci, e.b);
            const runE = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) || 1;
            return Math.abs(za - zb) / runE >= 1 / 12 ? "RAKE" : "EAVE";
          }
          return "FLASHING";
        }
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

  const faceSrc = new Map<string, number>();
  const assembled = assembleRoofModel({ cells, base: skeleton, idPrefix: "M", structureIndex: 0, faceSrcOut: faceSrc });
  if (!assembled) return skeletonWhole("assembly failed on a degenerate cell — skeleton fill");

  // ── flatten: the DSM settled every vertex on the surface; the global
  //    z-solve (flatten.ts — one plane per facet, vertices onto the point the
  //    meeting planes imply) turns "on the surface" into "a polyhedron":
  //    R03 planarity by construction, at the validator's 0.08 ft, which raw
  //    surface samples (noise 0.12 ft) can never hold on their own. ──
  // flatten удалён: его z-власть заменил единый финальный z-солвер
  const candidate = assembled;

  // прямой след вершины по стадиям (DBG_TRACE="x,y" в кадре кандидата)
  const dbgTrace = (stage: string, preInvT = false): void => {
    if (!process.env.DBG_TRACE) return;
    const [qx, qy] = process.env.DBG_TRACE.split(",").map(Number);
    // до invT точки живут в растровом кадре — сравниваем в instant-кадре
    const at = (q: { x: number; y: number }): { x: number; y: number } => (preInvT ? invT(q) : q);
    const pB = new Map(candidate.points.map((q) => [q.id, q]));
    let best: (typeof candidate.points)[number] | null = null;
    let bd = Infinity;
    for (const q of candidate.points) {
      const qq = at(q);
      const d0 = Math.hypot(qq.x - qx, qq.y - qy);
      if (d0 < bd) { bd = d0; best = q; }
    }
    if (!best || bd > 2.5) { console.log(`[trace ${stage}] точек рядом нет (${bd.toFixed(1)})`); return; }
    const inc = candidate.lines.filter((l) => l.aId === best!.id || l.bId === best!.id);
    const segs = inc.map((l) => {
      const o0 = pB.get(l.aId === best!.id ? l.bId : l.aId);
      const o = o0 ? at(o0) : null;
      return `${l.id}:${l.type}→(${o?.x.toFixed(1)},${o?.y.toFixed(1)})`;
    });
    const bp = at(best);
    console.log(`[trace ${stage}] ${best.id} (${bp.x.toFixed(2)},${bp.y.toFixed(2)},z${best.z.toFixed(2)}) deg${inc.length}: ${segs.join(" ")}`);
  };
  dbgTrace("assembly", true);

  // ── ЕДИНЫЙ ФИНАЛЬНЫЙ Z-СОЛВЕР (zSolver.ts) ──
  // Все прежние власти над z (сходимость, flatten, пересадка, цепная
  // сварка) удалены; z каждой вершины — взвешенная МНК по инцидентным
  // чистым плоскостям (вес — пиксельная опора), уровни — по топологии
  // vzOf (переписной пол). Вызывается после планарной работы; второй
  // вызов после пост-типизационных планарных хирургий — та же функция,
  // тот же результат на той же геометрии (детерминизм).
  const applyZSolver = (frame: "raster" | "instant"): number => {
    const idxZ = buildIndexes(candidate);
    const ownersZ = new Map<string, Set<number>>();
    for (const f of candidate.faces) {
      const src = faceSrc.get(f.id);
      if (src === undefined) continue;
      let rZ = ringOf(f.lineIds, idxZ);
      if (!rZ || rZ.length < 3) {
        const seenZ = new Set<string>();
        const cloudZ: (typeof candidate.points)[number][] = [];
        for (const id of new Set(f.lineIds)) {
          const l = candidate.lines.find((l2) => l2.id === id);
          if (!l) continue;
          for (const pid of [l.aId, l.bId]) {
            if (seenZ.has(pid)) continue;
            seenZ.add(pid);
            const q = candidate.points.find((q2) => q2.id === pid);
            if (q) cloudZ.push(q);
          }
        }
        rZ = cloudZ.length >= 3 ? cloudZ : null;
      }
      if (!rZ) continue;
      for (const q of rZ) {
        const qid = (q as { id?: string }).id;
        if (!qid) continue;
        (ownersZ.get(qid) ?? ownersZ.set(qid, new Set()).get(qid)!).add(src);
      }
    }
    const pById0 = new Map(candidate.points.map((q0) => [q0.id, q0]));
    const resZ = solveVertexZ({
      points: candidate.points,
      refsOf: (pid) => {
        const pt9 = candidate.points.find((q) => q.id === pid)!;
        const pr = frame === "instant" ? fwd({ x: pt9.x, y: pt9.y }) : { x: pt9.x, y: pt9.y };
        return [...(ownersZ.get(pid) ?? [])].map((si) => {
          const ci = infos[si];
          return {
            evalAt: (x: number, y: number) => zOfInfo(ci, frame === "instant" ? fwd({ x, y }) : { x, y }),
            // локальная опора в точке; плоскость без местных пикселей —
            // голос заполнителя (1): экстраполяция за опору не голосует
            w: ci.prov === "fill" || ci.cluster === null ? 1 : Math.max(1, localSupport(ci.cluster, pr.x, pr.y)),
          };
        });
      },
      stepDzFt: STEP_DZ_FT,
      // прямой замер как судья уровневого конфликта: медиана DSM 3×3 в
      // точке (единый закон — прямой замер главнее опоры)
      dsmZOf: (pid) => {
        const q0 = pById0.get(pid);
        if (!q0) return null;
        const pr0 = frame === "instant" ? fwd({ x: q0.x, y: q0.y }) : { x: q0.x, y: q0.y };
        const zs0: number[] = [];
        for (let dy0 = -1; dy0 <= 1; dy0++) for (let dx0 = -1; dx0 <= 1; dx0++) {
          const pi0 = m.pxOf({ x: pr0.x + dx0 * m.stepFt, y: pr0.y + dy0 * m.stepFt });
          if (pi0 < 0 || mask.data[pi0] <= 0.5) continue;
          zs0.push(dsm.data[pi0] * FT_PER_M - groundElevFt);
        }
        if (!zs0.length) return null;
        zs0.sort((a0, b0) => a0 - b0);
        // рефери судит только ОДНУ поверхность: окно на кромке ступени
        // бимодально (разброс ≥ переписи) — медиана смеси не замер (она
        // тянула нижнего близнеца 15.4 к 19.7 на 12618 ML40, dzEnds падал
        // ниже пола и стена сваривалась). На кромке окно режется по
        // наибольшему зазору, судит мода СВОЕЙ стороны: сторону выбирает
        // текущий z точки (уровень vzOf от станции), значение — прямой
        // замер.
        if (zs0[zs0.length - 1] - zs0[0] >= STEP_DZ_FT) {
          let gi0 = 0;
          let gv0 = -1;
          for (let i0 = 0; i0 + 1 < zs0.length; i0++) {
            const g0 = zs0[i0 + 1] - zs0[i0];
            if (g0 > gv0) { gv0 = g0; gi0 = i0; }
          }
          const lo0 = zs0.slice(0, gi0 + 1);
          const hi0 = zs0.slice(gi0 + 1);
          const med0 = (arr0: number[]): number => arr0[Math.floor(arr0.length / 2)];
          const mLo = med0(lo0);
          const mHi = med0(hi0);
          return Math.abs(q0.z - mLo) <= Math.abs(q0.z - mHi) ? mLo : mHi;
        }
        return zs0[Math.floor(zs0.length / 2)];
      },
    });
    if (process.env.DBG_ZPT) {
      const [qx, qy] = process.env.DBG_ZPT.split(",").map(Number);
      {
        const noSrc = candidate.faces.filter((f9) => faceSrc.get(f9.id) === undefined);
        if (noSrc.length) console.log(`[zpt] граней без faceSrc: ${noSrc.map((f9) => f9.designator ?? f9.id).join(",")}`);
        const idx9 = buildIndexes(candidate);
        for (const f9 of candidate.faces) {
          const r9 = ringOf(f9.lineIds, idx9);
          if (r9 && r9.some((q9) => Math.hypot(q9.x - qx, q9.y - qy) <= 0.5))
            console.log(`[zpt] точка в кольце ${f9.designator ?? f9.id} (faceSrc=${faceSrc.get(f9.id) ?? "НЕТ"})`);
        }
      }
      for (const pt of candidate.points) {
        if (Math.hypot(pt.x - qx, pt.y - qy) > 0.5) continue;
        const refs = [...(ownersZ.get(pt.id) ?? [])].map((si) => {
          const ci = infos[si];
          const pr = frame === "instant" ? fwd({ x: pt.x, y: pt.y }) : { x: pt.x, y: pt.y };
          return `src${si}(cl${ci.cluster ?? "-"} ${ci.prov}) eval=${zOfInfo(ci, pr).toFixed(2)} w=${ci.prov === "fill" || ci.cluster === null ? 1 : Math.max(1, localSupport(ci.cluster, pr.x, pr.y))}`;
        });
        console.log(`[zpt] ${pt.id} (${pt.x.toFixed(2)},${pt.y.toFixed(2)}) z=${(resZ.z.get(pt.id) ?? NaN).toFixed(2)}: ${refs.join(" · ")}`);
      }
    }
    for (const pt of candidate.points) {
      const z = resZ.z.get(pt.id);
      if (z !== undefined) pt.z = z;
    }
    const pByIdZ = new Map(candidate.points.map((q) => [q.id, q]));
    for (const l of candidate.lines) {
      const a = pByIdZ.get(l.aId);
      const b = pByIdZ.get(l.bId);
      if (a && b) l.lengthFt = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    return resZ.crossLevel;
  };
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
  dbgTrace("pre-straighten", true);
  const straighten = mergeCollinearChains(candidate, m.stepFt, corridorOfLine);
  if (process.env.DBG_EULER) console.log("[euler] после выпрямления:", eulerOf(candidate));
  if (straighten.merged || straighten.collapsed) reasons.push(`выпрямление: ${straighten.collapsed} огрызков схлопнуто (< 4 ft — шумовой пол шага 1), ${straighten.merged} звеньев слито; канон: ${rc.canonSnapped} линий`);
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

  dbgTrace("post-straighten");
  // z-солвер, проход A: типизация читает честные высоты
  applyZSolver("instant");
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
      // ── DSM-РЕФЕРИ СТОРОН (2026-08-31): сторону складки судит прямой
      // замер рельефа, не LS-плоскости владельцев — склеенный состав
      // (maxDev 3.9 у MF10 на 419) давал мусорную плоскость, ендова
      // типизировалась OTHER и конёк «висел» (G2). Проба зажата на
      // собственный масштаб линии (не дальше полудлины — плоскостная
      // проба на 2 ft перелетала конёк узкого клина). Плоскости — фолбэк.
      const probeD = Math.min(PROBE_FT, Math.max(run / 2, 2 * m.stepFt));
      const dsmZAt = (q: FootprintPoint): number | null => {
        const pr9 = fwd(q);
        const zs9: number[] = [];
        for (let dy9 = -1; dy9 <= 1; dy9++) for (let dx9 = -1; dx9 <= 1; dx9++) {
          const pi9 = m.pxOf({ x: pr9.x + dx9 * m.stepFt, y: pr9.y + dy9 * m.stepFt });
          if (pi9 < 0 || mask.data[pi9] <= 0.5 || penSet.has(pi9)) continue;
          zs9.push(dsm.data[pi9] * FT_PER_M - groundElevFt);
        }
        if (!zs9.length) return null;
        zs9.sort((a9, b9) => a9 - b9);
        return zs9[Math.floor(zs9.length / 2)];
      };
      const dz1 = dsmZAt({ x: mid.x + per.x * probeD, y: mid.y + per.y * probeD });
      const dz2 = dsmZAt({ x: mid.x - per.x * probeD, y: mid.y - per.y * probeD });
      const dzc = dsmZAt(mid);
      if (dz1 !== null && dz2 !== null && dzc !== null) {
        if (dz1 > dzc && dz2 > dzc) return "VALLEY";
        if (dz1 < dzc && dz2 < dzc) return level ? "RIDGE" : "HIP";
        return null;
      }
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
    // ОТСТАВКА ПОЛОСЫ (замер 2026-08-30): полоса строилась против шумовой
    // hip/valley-крошки каймы, но её с тех пор закрыл пол видимости
    // перегиба (|∇A−∇B| ≥ 0.5/12 — пробы по ПЛОСКОСТЯМ шумов не несут);
    // сама же полоса душила честные складки у ободков — OTHER вместо HIP,
    // коньки «висели» (G2). Пробы теперь судят везде.
    const inBand = (_l: (typeof candidate.lines)[number]): boolean => false;
    const footage2 = {} as Record<string, number>;
    const bump = (t: string, v: number) => { footage2[t] = (footage2[t] ?? 0) + v; };
    const phantomGroups: Array<Array<(typeof candidate.lines)[number]>> = [];
    const liveLineIds = () => new Set(candidate.lines.map((l) => l.id));
    for (const g0 of groupsL.values()) {
      // топологическая сшивка фантомных стен удаляет линии/точки — группа
      // фильтруется по живым
      const live = liveLineIds();
      const g = g0.filter((l) => live.has(l.id) && ptById.has(l.aId) && ptById.has(l.bId));
      if (!g.length) continue;
      const l0 = g[0];
      // контурное ребро живёт НА кольце — порог регистрации 0.15, та же
      // линейка, что rings-закон и pullCrumbEdges (было ≤1: огрызок
      // пик→fade на 9903 в 0.65 от кольца типизировался RAKE и валил
      // rings-check; закон одной линейки)
      const onRing = distRing(ptById.get(l0.aId)!) <= 0.15 && distRing(ptById.get(l0.bId)!) <= 0.15;
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
        // СТЕНУ ГРУППЫ СУДИТ ПРОФИЛЬ (источник истины): большинство
        // станций линии на wall-участке ближайшей границы. Собственная
        // линейка типизации (медиана офсетных станций) умерла.
        const dsmWallOk = (): boolean => {
          const a9 = ptById.get(l0.aId)!;
          const b9 = ptById.get(l0.bId)!;
          let wallY = 0;
          let n9 = 0;
          for (const t9 of [0.25, 0.5, 0.75]) {
            const v = rc.wallAtPoint(fwd({ x: a9.x + (b9.x - a9.x) * t9, y: a9.y + (b9.y - a9.y) * t9 }));
            if (v === null) continue;
            n9++;
            if (v) wallY++;
          }
          if (!n9) return true; // мерить не обо что — не мешать (прежний закон)
          return wallY * 2 > n9;
        };
        if (process.env.DBG_TYPEAT) {
          const [qx, qy] = process.env.DBG_TYPEAT.split(",").map(Number);
          const aT = ptById.get(l0.aId)!;
          const bT = ptById.get(l0.bId)!;
          if (Math.hypot((aT.x + bT.x) / 2 - qx, (aT.y + bT.y) / 2 - qy) <= 3)
            console.log(`[typeat] группа ${g.map((l) => l.id).join("+")} (${aT.x.toFixed(1)},${aT.y.toFixed(1)})→(${bT.x.toFixed(1)},${bT.y.toFixed(1)}) dzEnds=${dzEnds.toFixed(2)} dsmWallOk=${dsmWallOk()} zs=${g.map((l) => zOfLine(l).toFixed(1)).join("/")}`);
        }
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
          // КРАЙ СЕКЦИИ ПРОТИВ СТЕНЫ (класс 1a смотра RM-6KT8LW): FLASHING
          // живёт только между ДВУМЯ кровлями. Если по одну из сторон
          // большинство станций — не крыша (земля/за маской), это край
          // массы над землёй: верх — EAVE своего уровня, низ — EAVE/RAKE
          // нижнего уровня (по уклону вдоль линии), красного не рисуем.
          const sideRoof = ((): boolean => {
            const a9 = ptById.get(l0.aId)!;
            const b9 = ptById.get(l0.bId)!;
            const run9 = Math.hypot(b9.x - a9.x, b9.y - a9.y);
            if (run9 < 1e-6) return true;
            const per9 = { x: -(b9.y - a9.y) / run9, y: (b9.x - a9.x) / run9 };
            let roof1 = 0;
            let roof2 = 0;
            let n9 = 0;
            for (const t9 of [0.25, 0.5, 0.75]) {
              const mid9 = { x: a9.x + (b9.x - a9.x) * t9, y: a9.y + (b9.y - a9.y) * t9 };
              // ближайший валидный образец решает (не «хоть где-то крыша»)
              const isRoof = (s9: number): boolean => {
                for (const off9 of [2 * m.stepFt, 4 * m.stepFt, 2]) {
                  const pi9 = m.pxOf(fwd({ x: mid9.x + per9.x * s9 * off9, y: mid9.y + per9.y * s9 * off9 }));
                  if (pi9 >= 0) return mask.data[pi9] > 0.5;
                }
                return false;
              };
              n9++;
              if (isRoof(1)) roof1++;
              if (isRoof(-1)) roof2++;
            }
            if (process.env.DBG_SIDEROOF) console.log(`[sideroof] ${g.map((l) => l.id).join("+")}: roof1=${roof1} roof2=${roof2} n=${n9}`);
            return roof1 * 2 > n9 && roof2 * 2 > n9;
          })();
          const top = Math.max(...zs);
          if (sideRoof) {
            // ступень: верхняя сторона EAVE, нижняя FLASHING; погонаж — обе
            for (const l of g) l.type = zOfLine(l) >= top - 1e-6 ? "EAVE" : "FLASHING";
          } else {
            for (const l of g) {
              if (zOfLine(l) >= top - 1e-6) l.type = "EAVE";
              else {
                const aL = ptById.get(l.aId)!;
                const bL = ptById.get(l.bId)!;
                const runL = Math.hypot(bL.x - aL.x, bL.y - aL.y) || 1;
                l.type = Math.abs(aL.z - bL.z) / runL >= 1 / 12 ? "RAKE" : "EAVE";
              }
            }
          }
          for (const l of g) bump(l.type, l.lengthFt);
          continue;
        }
        if (dzEnds >= STEP_DZ_FT) {
          // фантомная стена: DSM перепада не видит. Здесь только ПОМЕТКА
          // (нейтральный тип); топологическая сшивка — одним чистым
          // проходом после цикла (мутировать линии под циклом нельзя)
          phantomGroups.push(g);
          for (const l of g) { l.type = "OTHER"; bump("OTHER", l.lengthFt); }
          continue;
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
        // ── ОДИНОЧНАЯ СТЕНА (2026-08-31): ступень, у которой обход не
        // оставил близнеца, — всё равно стена: вердикт читается у ПРОФИЛЯ
        // (единый закон стены), не выводится из отсутствия пары. Без
        // этого ML40 на 12618 (перепад 2.3–3 ft прямым замером) падал в
        // OTHER и конёк «висел» (G2).
        const wallSingle = (): boolean => {
          if (onRing) return false;
          const aW = ptById.get(l0.aId)!;
          const bW = ptById.get(l0.bId)!;
          // G6-домен: у внешнего контура FLASHING без близнеца незаконен —
          // кромка массы носит типы своего уровня (та же линейка ≤1, что
          // у контурного хвоста ниже)
          const mW = { x: (aW.x + bW.x) / 2, y: (aW.y + bW.y) / 2 };
          if (Math.max(distRing(aW), distRing(bW), distRing(mW)) <= 1.0) return false;
          const votes = [0.25, 0.5, 0.75].map((t9) =>
            rc.wallAtPoint(fwd({ x: aW.x + (bW.x - aW.x) * t9, y: aW.y + (bW.y - aW.y) * t9 })));
          return votes.filter((v) => v === true).length >= 2;
        };
        const t = inBand(l0) ? null : (creaseType(l0, owners) ?? (wallSingle() ? "FLASHING" : null));
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
    // ── ТОПОЛОГИЧЕСКАЯ СШИВКА ФАНТОМНЫХ СТЕН (один чистый проход) ──
    // DSM перепада не видел: сторонам границы — одна точка на конец,
    // дубль-линии сливаются; z назначит финальный z-солвер
    if (phantomGroups.length && !process.env.DBG_NO_PHSTITCH) {
      let stitched = 0;
      for (const g of phantomGroups) {
        const liveG = new Set(candidate.lines.map((l) => l.id));
        const gl = g.filter((l) => liveG.has(l.id));
        const pById9 = new Map(candidate.points.map((q) => [q.id, q]));
        const endsM = new Map<string, Array<(typeof candidate.points)[number]>>();
        for (const l of gl) for (const pid of [l.aId, l.bId]) {
          const pt9 = pById9.get(pid);
          if (!pt9) continue;
          const k9 = `${Math.round(pt9.x * 2)}|${Math.round(pt9.y * 2)}`;
          (endsM.get(k9) ?? endsM.set(k9, []).get(k9)!).push(pt9);
        }
        for (const ptsM of endsM.values()) {
          const uniqAll = [...new Set(ptsM)];
          if (uniqAll.length < 2) continue;
          // z-ГЕЙТ (приказ 2026-08-30, механизм 2): на стыке фантомной
          // границы с НАСТОЯЩЕЙ стеной в одной план-клетке живут близнецы
          // уровня (Δz ≥ переписного пола) — сварка без z-гейта сливала их
          // и втягивала верхний уровень в нижнее кольцо (A4 на 12621:
          // z16.66 в кольце z~10). Сваривается только внутри уровня:
          // цепная группировка по z с разрывом на пол переписи. Фикция
          // «расщепления гладкого ската» убита выше — стены везде судит
          // прямой DSM-перепад, фиктивные пары не рождаются.
          const byZ = uniqAll.slice().sort((q1, q2) => q1.z - q2.z);
          const levels: Array<typeof byZ> = [];
          for (const q of byZ) {
            const cur = levels[levels.length - 1];
            if (cur && q.z - cur[cur.length - 1].z < STEP_DZ_FT) cur.push(q);
            else levels.push([q]);
          }
          for (const uniq of levels) {
            if (uniq.length < 2) continue;
            const keep = uniq[0];
            for (const q of uniq.slice(1)) {
              for (const l of candidate.lines) {
                if (l.aId === q.id) l.aId = keep.id;
                if (l.bId === q.id) l.bId = keep.id;
              }
              candidate.points = candidate.points.filter((q2) => q2.id !== q.id);
            }
            stitched++;
          }
        }
        const seenPair = new Map<string, string>();
        for (const l of gl) {
          const k9 = l.aId < l.bId ? `${l.aId}#${l.bId}` : `${l.bId}#${l.aId}`;
          const first = seenPair.get(k9);
          if (!first) { seenPair.set(k9, l.id); continue; }
          candidate.lines = candidate.lines.filter((l2) => l2.id !== l.id);
          for (const f of candidate.faces) f.lineIds = f.lineIds.map((id) => (id === l.id ? first : id));
        }
      }
      if (stitched) reasons.push(`фантомные стены: ${stitched} концов сшито топологически`);
      // сшитая граница — честная складка двух граней: тип от плоскостей
      {
        const ownersOf9 = new Map<string, string[]>();
        for (const f of candidate.faces) for (const id of new Set(f.lineIds)) {
          const arr = ownersOf9.get(id) ?? [];
          if (!arr.includes(f.id)) arr.push(f.id);
          ownersOf9.set(id, arr);
        }
        const live9 = new Set(candidate.lines.map((l) => l.id));
        for (const g of phantomGroups) {
          for (const l of g) {
            if (!live9.has(l.id) || l.type !== "OTHER") continue;
            const own9 = ownersOf9.get(l.id) ?? [];
            if (own9.length < 2) continue;
            const t9 = creaseType(l, own9);
            if (t9) {
              footage2["OTHER"] = (footage2["OTHER"] ?? 0) - l.lengthFt;
              footage2[t9] = (footage2[t9] ?? 0) + l.lengthFt;
              l.type = t9 as (typeof l)["type"];
            }
          }
        }
      }
      // страховка целостности (наружу, не молча)
      const liveIds = new Set(candidate.points.map((q) => q.id));
      const before9 = candidate.lines.length;
      candidate.lines = candidate.lines.filter((l) => liveIds.has(l.aId) && liveIds.has(l.bId));
      if (before9 !== candidate.lines.length) reasons.push(`целостность: ${before9 - candidate.lines.length} линий снято`);
      const lineIds9 = new Set(candidate.lines.map((l) => l.id));
      for (const f of candidate.faces) f.lineIds = f.lineIds.filter((id) => lineIds9.has(id));
    }
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
        dbgTrace("post-ladders");
      }
    }
    // ── второй flatten: хирургии двигали план (слияния, шпоры, канон),
    //    а z остались от старых позиций — остатки 0.1-0.3 на гранях у
    //    сварных зон; вершины снова садятся на плоскости (сваренные — в
    //    LS-точку МЕЖДУ планами, помилование R03 v2 их принимает)
    {
      // ── z-солвер, финальный проход (после планарных хирургий) ──
      {
        // ── ПЛАН-КОАГУЛЯТОР (класс «один источник», приказ 2026-08-31):
        // по-сторонние хирургии (лесенки, слияния) разводили план-двойников
        // сторон границы на 0.1–0.5 ft — vzOf-сварка их больше не видела,
        // G8 публиковал межзонные двойные линии. Закон «у стены один план»
        // обобщён на все план-пары: точки одной 0.5-ft клетки внутри
        // уровня (Δz < переписи) свариваются в одну, между уровнями —
        // получают ОБЩИЙ план (среднее), z раздельные.
        {
          // группировка союзом по ФАКТИЧЕСКОМУ расстоянию (клетка страддлила
          // двойников на 0.33 ft по разные стороны границы 0.5-клетки)
          const ptsAll = candidate.points;
          const parentC = ptsAll.map((_, i) => i);
          const findC = (i: number): number => (parentC[i] === i ? i : (parentC[i] = findC(parentC[i])));
          const gridC = new Map<string, number[]>();
          const gk = (q: { x: number; y: number }): [number, number] => [Math.round(q.x * 2), Math.round(q.y * 2)];
          ptsAll.forEach((q, i) => {
            const [gx, gy] = gk(q);
            const k = `${gx}|${gy}`;
            (gridC.get(k) ?? gridC.set(k, []).get(k)!).push(i);
          });
          ptsAll.forEach((q, i) => {
            const [gx, gy] = gk(q);
            for (let dx9 = -1; dx9 <= 1; dx9++) for (let dy9 = -1; dy9 <= 1; dy9++) {
              for (const j of gridC.get(`${gx + dx9}|${gy + dy9}`) ?? []) {
                if (j <= i) continue;
                if (Math.hypot(ptsAll[j].x - q.x, ptsAll[j].y - q.y) <= m.stepFt && findC(i) !== findC(j)) parentC[findC(j)] = findC(i);
              }
            }
          });
          const byCell = new Map<string, Array<(typeof candidate.points)[number]>>();
          ptsAll.forEach((q, i) => {
            const k = `u${findC(i)}`;
            (byCell.get(k) ?? byCell.set(k, []).get(k)!).push(q);
          });
          let welded9 = 0;
          let coplanned9 = 0;
          const distRingC = (q: { x: number; y: number }): number => {
            let best = Infinity;
            for (let i9 = 0; i9 < contour.length; i9++) {
              const a9 = contour[i9];
              const b9 = contour[(i9 + 1) % contour.length];
              const dx9 = b9.x - a9.x;
              const dy9 = b9.y - a9.y;
              const L29 = dx9 * dx9 + dy9 * dy9 || 1;
              const t9 = Math.max(0, Math.min(1, ((q.x - a9.x) * dx9 + (q.y - a9.y) * dy9) / L29));
              best = Math.min(best, Math.hypot(q.x - (a9.x + dx9 * t9), q.y - (a9.y + dy9 * t9)));
            }
            return best;
          };
          for (const pts9 of byCell.values()) {
            if (pts9.length < 2) continue;
            // кольцо неприкосновенно: если в группе есть кольцевая точка,
            // план группы — ЕЁ план (усреднение стягивало RAKE-вершины
            // внутрь на 0.24–0.67 — rings-check ловил)
            const ringPt = pts9.find((q) => distRingC(q) <= 0.15);
            const mx = ringPt ? ringPt.x : pts9.reduce((s9, q) => s9 + q.x, 0) / pts9.length;
            const my = ringPt ? ringPt.y : pts9.reduce((s9, q) => s9 + q.y, 0) / pts9.length;
            // двойник — суб-пиксельная копия: разброс плана больше шага
            // решётки означает соседей, не двойников (двигать — ломать G1)
            if (pts9.some((q) => Math.hypot(q.x - mx, q.y - my) > m.stepFt)) continue;
            // уровни цепочкой по z с разрывом на пол переписи
            const byZ = pts9.slice().sort((a9, b9) => a9.z - b9.z);
            const levels9: Array<typeof byZ> = [];
            for (const q of byZ) {
              const cur = levels9[levels9.length - 1];
              if (cur && q.z - cur[cur.length - 1].z < STEP_DZ_FT) cur.push(q);
              else levels9.push([q]);
            }
            for (const lv of levels9) {
              if (lv.length < 2) { lv[0].x = mx; lv[0].y = my; continue; }
              const keep = lv[0];
              keep.x = mx;
              keep.y = my;
              for (const q of lv.slice(1)) {
                for (const l of candidate.lines) {
                  if (l.aId === q.id) l.aId = keep.id;
                  if (l.bId === q.id) l.bId = keep.id;
                }
                candidate.points = candidate.points.filter((q2) => q2.id !== q.id);
                welded9++;
              }
            }
            if (levels9.length > 1) coplanned9++;
          }
          // вычистка: нулевые линии и дубли пар точек
          const seen9 = new Map<string, string>();
          const drop9 = new Set<string>();
          for (const l of candidate.lines) {
            if (l.aId === l.bId) { drop9.add(l.id); continue; }
            const k = l.aId < l.bId ? `${l.aId}#${l.bId}` : `${l.bId}#${l.aId}`;
            const first = seen9.get(k);
            if (!first) seen9.set(k, l.id);
            else {
              drop9.add(l.id);
              for (const f of candidate.faces) f.lineIds = f.lineIds.map((id) => (id === l.id ? first : id));
            }
          }
          if (drop9.size) candidate.lines = candidate.lines.filter((l) => !drop9.has(l.id));
          for (const f of candidate.faces) f.lineIds = f.lineIds.filter((id, idx) => f.lineIds.indexOf(id) === idx || candidate.lines.some((l) => l.id === id));
          if (welded9 || coplanned9) reasons.push(`план-коагулятор: ${welded9} точек сварено внутри уровней, ${coplanned9} клеток стен получили общий план`);
          dbgTrace("post-coagulator");

          // NB (§K25): модельное втягивание крошки снято — звено крошки
          // бывает ЧАСТЬЮ КОЛЬЦА грани, и удаление без пересборки колец
          // рвёт поверхность (419: Euler −1, G8/G5). Крошка втягивается
          // на ГРАФЕ (pullCrumbEdges до обхода) — там кольца строятся
          // ПОСЛЕ. Модельные крошки-остатки — в стоп-описание.
        }
        // ── ПО-СЕГМЕНТНОЕ СПРЯМЛЕНИЕ НА МОДЕЛИ (отмашка 2026-08-31):
        // излом на deg-2 вершине crease-цепи между законными вершинами
        // (узел deg≥3, шов-близнец, кольцо) не существует — вершина
        // сносится, линии сливаются. Переборчиво: одна вершина за проход,
        // коридор 3 ft, ступень (Δz ≥ переписи на звене) не трогается.
        {
          const twinDzV = (q: (typeof candidate.points)[number]): number => {
            let mx = 0;
            for (const q2 of candidate.points) {
              if (q2.id === q.id) continue;
              if (Math.hypot(q2.x - q.x, q2.y - q.y) <= 0.6) mx = Math.max(mx, Math.abs(q2.z - q.z));
            }
            return mx;
          };
          let mergedS = 0;
          for (let round = 0; round < 200; round++) {
            const pByIdS = new Map(candidate.points.map((q) => [q.id, q]));
            const incS = new Map<string, Array<(typeof candidate.lines)[number]>>();
            for (const l of candidate.lines) {
              (incS.get(l.aId) ?? incS.set(l.aId, []).get(l.aId)!).push(l);
              (incS.get(l.bId) ?? incS.set(l.bId, []).get(l.bId)!).push(l);
            }
            let did = false;
            for (const v of candidate.points) {
              const inc = incS.get(v.id) ?? [];
              if (inc.length !== 2) continue;
              const [l1, l2] = inc;
              if (l1.type !== l2.type) continue;
              const aId = l1.aId === v.id ? l1.bId : l1.aId;
              const cId = l2.aId === v.id ? l2.bId : l2.aId;
              if (aId === cId) continue;
              const a = pByIdS.get(aId);
              const c = pByIdS.get(cId);
              if (!a || !c) continue;
              // Δz вдоль звена — уклон, не ступень (класс 1c): ступень
              // живёт близнецами, их ловит twinDzV ниже
              // законные вершины неприкосновенны: шов-близнец и кольцо
              const dbgS = process.env.DBG_SEGSTR ? ((): ((why: string) => void) | null => {
                const [sx, sy] = process.env.DBG_SEGSTR!.split(",").map(Number);
                if (Math.hypot(v.x - sx, v.y - sy) > 1) return null;
                return (why) => console.log(`[segstr] ${v.id} (${v.x.toFixed(2)},${v.y.toFixed(2)}) skip: ${why}`);
              })() : null;
              if (twinDzV(v) >= STEP_DZ_FT - 0.2) { dbgS?.(`twin dz=${twinDzV(v).toFixed(2)}`); continue; }
              if (distRing(v) <= 0.15) { dbgS?.(`ring d=${distRing(v).toFixed(2)}`); continue; } // на кольце — держит контур (порог регистрации, как в pullCrumbEdges)
              const runAC = Math.hypot(c.x - a.x, c.y - a.y);
              if (runAC < 1e-6) continue;
              const cross = Math.abs((c.x - a.x) * (v.y - a.y) - (c.y - a.y) * (v.x - a.x)) / runAC;
              if (cross < 1e-3) continue; // уже прямая
              // излом deg-2 цепи одного типа незаконен при ЛЮБОМ угле (G1);
              // вместо коридора — guard: новое звено не режет чужие линии
              const hitsOther = candidate.lines.some((lx) => {
                if (lx.id === l1.id || lx.id === l2.id) return false;
                const p1 = pByIdS.get(lx.aId);
                const p2 = pByIdS.get(lx.bId);
                if (!p1 || !p2) return false;
                if (p1.id === aId || p1.id === cId || p2.id === aId || p2.id === cId) return false;
                const d = (px: { x: number; y: number }, qx: { x: number; y: number }, rx: { x: number; y: number }): number =>
                  (qx.x - px.x) * (rx.y - px.y) - (qx.y - px.y) * (rx.x - px.x);
                const d1 = d(a, c, p1);
                const d2 = d(a, c, p2);
                const d3 = d(p1, p2, a);
                const d4 = d(p1, p2, c);
                return d1 * d2 < 0 && d3 * d4 < 0;
              });
              if (hitsOther) { dbgS?.("guard: пересекает чужую линию"); continue; }
              // снос v: l2 вливается в l1
              if (l1.aId === v.id) l1.aId = cId; else l1.bId = cId;
              candidate.lines = candidate.lines.filter((x) => x.id !== l2.id);
              candidate.points = candidate.points.filter((q) => q.id !== v.id);
              for (const f of candidate.faces) {
                f.lineIds = f.lineIds.map((id) => (id === l2.id ? l1.id : id));
                f.lineIds = f.lineIds.filter((id, ix) => f.lineIds.indexOf(id) === ix);
              }
              mergedS++;
              did = true;
              break;
            }
            if (!did) break;
          }
          if (mergedS > 0) reasons.push(`по-сегментное спрямление (модель): ${mergedS} изломов crease-цепей слито`);
          dbgTrace("post-segstraight");
        }

        const crossB = applyZSolver("instant");
        if (crossB) reasons.push(`z-солвер: ${crossB} вершин с расхождением ≥ переписи (топология уровней)`);
        // ровность коньков по финальным z: конёк, ставший наклонным, — вальма
        const pByIdL = new Map(candidate.points.map((q) => [q.id, q]));
        for (const l of candidate.lines) {
          if (l.type !== "RIDGE") continue;
          const a8 = pByIdL.get(l.aId);
          const b8 = pByIdL.get(l.bId);
          if (!a8 || !b8) continue;
          const run8 = Math.hypot(b8.x - a8.x, b8.y - a8.y);
          if (run8 < 1e-6) continue;
          if (Math.abs(a8.z - b8.z) > Math.max(0.08, LEVEL_SLOPE * run8)) l.type = "HIP";
        }
      }
      dbgCover("после z-солвера");
    }
    // ── ПОСТ-СВАРОЧНАЯ РЕВИЗИЯ ТИПОВ (G5-домен) ──
    // Сварки финала меняют оправдания: ободок, сваренный с крылом
    // (подпереписной разброс), больше не «верх ступени» — внутренний
    // EAVE/RAKE живёт только с близнецом-стеной или крылом ниже на пол,
    // иначе это нейтральная граница (OTHER). Типы обязаны пере-выводиться
    // после ПОСЛЕДНЕЙ правки геометрии, не до.
    {
      const byPlanT = new Map<string, number[]>();
      for (const pt of candidate.points) {
        const kT = `${Math.round(pt.x * 100)}|${Math.round(pt.y * 100)}`;
        (byPlanT.get(kT) ?? byPlanT.set(kT, []).get(kT)!).push(pt.z);
      }
      const twinDzAt = (pid: string): number => {
        const pt = ptById.get(pid)!;
        const zsT = byPlanT.get(`${Math.round(pt.x * 100)}|${Math.round(pt.y * 100)}`) ?? [];
        return zsT.length < 2 ? 0 : Math.max(...zsT) - Math.min(...zsT);
      };
      for (const l of candidate.lines) {
        if (l.type !== "EAVE" && l.type !== "RAKE") continue;
        const aT = ptById.get(l.aId)!;
        const bT = ptById.get(l.bId)!;
        const mT = { x: (aT.x + bT.x) / 2, y: (aT.y + bT.y) / 2 };
        if (distRing(aT) <= 1 && distRing(bT) <= 1 && distRing(mT) <= 1) continue; // контур
        if (Math.max(twinDzAt(l.aId), twinDzAt(l.bId)) >= STEP_DZ_FT) continue; // стена-близнец
        // крыло ниже на пол? прямой DSM-перепад поперёк (та же станция закона стен)
        const runT = Math.hypot(bT.x - aT.x, bT.y - aT.y) || 1;
        const perT = { x: -(bT.y - aT.y) / runT, y: (bT.x - aT.x) / runT };
        let dropT = 0;
        for (const s9 of [1, -1]) {
          const q9 = fwd({ x: mT.x + perT.x * s9 * 2, y: mT.y + perT.y * s9 * 2 });
          const pi9 = m.pxOf(q9);
          if (pi9 < 0 || mask.data[pi9] <= 0.5) continue;
          const z9 = dsm.data[pi9] * FT_PER_M - groundElevFt;
          dropT = Math.max(dropT, (aT.z + bT.z) / 2 - z9);
        }
        if (dropT >= STEP_DZ_FT) continue; // ободок массы: внизу крыло
        l.type = "OTHER";
      }
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
  // модель несёт провенанс по-гранно (механизм 1): валидаторы читают
  // fill из самой модели — один источник, оба согласны по построению
  for (const f of candidate.faces) {
    const src = faceSrc.get(f.id);
    if (src !== undefined) f.provenance = infos[src].prov;
  }
  const googleReport = googleArbiterOf();
  const provenance = { measuredSqft, fillSqft, faces: provFaces, ...(googleReport ? { google: googleReport } : {}) };
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

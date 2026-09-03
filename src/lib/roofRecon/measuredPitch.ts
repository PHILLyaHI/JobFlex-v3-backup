// Measured pitch — the ONE thing brought back from the retired drawing line:
// the DSM pitch measurement, exactly as that line proved it out. No layout, no
// polyhedron, no drawing — clusters of surface, a plane court, and the
// consistency rule.
//
//   cells   the contour interior is tiled with CELL_FT grid cells («грань
//           определяется своим кластером» carried to the data-only setting:
//           a cell is the unit of surface, judged on its own fit); pixels
//           closer than EDGE_INSET_PX to the contour are excluded — the DSM
//           smears a foot or so across an edge and edge pixels carry the
//           neighbour's slope (pitchFromDsm's own inset, kept verbatim)
//   court   a least-squares plane through each cell's DSM samples; the cell is
//           TRUSTED only when its median residual fits the DSM's measured
//           noise floor (DSM_NOISE_FLOOR_FT = 0.2 — read out of the data on
//           the field houses: single-slope surfaces at p50 0.02–0.12 ft,
//           mixed ones at 0.5–1.45; the gap is an order of magnitude)
//   verdict trusted cells must AGREE: area-weighted IQR ≤ CONSISTENT_IQR_12
//           (0.75/12 — sectionTolerance12's own figure, §J: a quantity already
//           in the problem) over at least MIN_TRUSTED_SQFT (100 sq ft — one
//           roofing square, the trade's own unit). Multiple pitch FAMILIES
//           (gaps wider than the same 0.75/12, each family over the same
//           floor) are each reported, largest area first. Solar panels force
//           the Instant fallback regardless — a tilted array is a plane too.
//
// All thresholds are the retired line's proven constants (pitchFromDsm.ts at
// ea9ad01), carried with their provenance; none is new.
import type { Raster } from "@/lib/solar";
import { fitPlane, planePitch12 } from "@/lib/roofRecon";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import type { Rigid2D } from "@/lib/roofRecon/register";

const FT_PER_M = 3.28084;
/** Grid cell side. Big enough for a well-conditioned fit (≈18 px per side at
 *  0.1 m/px), small enough that one cell rarely straddles a crease. */
const CELL_FT = 6;
/** A cell with fewer DSM samples than this cannot support a plane fit. */
const MIN_SAMPLES = 12;
/** The DSM's own noise floor — the plane court's threshold (see header). */
export const DSM_NOISE_FLOOR_FT = 0.2;
/** Trusted cells must agree to this (area-weighted IQR, /12). */
export const CONSISTENT_IQR_12 = 0.75;
/** Floor under the trusted subset — one roofing square. */
export const MIN_TRUSTED_SQFT = 100;
/** Agreement of one cell with itself is not evidence. */
export const MIN_TRUSTED_CELLS = 2;
/** Keep clear of the contour: the mask's known over-reach is ~3 px. */
const EDGE_INSET_PX = 3;

export interface PitchFamily {
  /** Area-weighted mean pitch of the family's cells, rise per 12. */
  pitch12: number;
  planSqft: number;
}

export interface MeasuredPitchReport {
  source: "measured" | "instant";
  /** Families by descending area (one entry when the roof is one slope). */
  families: PitchFamily[];
  /** Share of sampled cell area whose cells passed the plane court. */
  trustedShare: number;
  /** Area-weighted IQR of ALL trusted cells' pitches, when ≥2 cells. */
  spreadIqr12?: number;
  trustedSqft: number;
  reason: string;
}

interface Cell {
  pitch12: number;
  planSqft: number;
}

function pointInRing(x: number, y: number, ring: FootprintPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Measure the roof pitch straight off the DSM inside the registered contours.
 *
 * `contours` are in the Instant frame (feet, origin at the pin); `transform`
 * is the frame→raster registration (register.ts). A refused registration is
 * NOT a licence to measure anyway — pass `transform: null` and the caller gets
 * the honest Instant fallback (pitchFromDsm's own FRAME rule).
 */
export function measurePitch(input: {
  dsm: Raster;
  contours: FootprintPoint[][];
  transform: Rigid2D | null;
  instantPitch12: number | null;
  solarPanels?: boolean;
  /** DSM coverage of the outline (provenance.coverage.share); below the
   *  confidence floor the elevation data did not see this roof. */
  coverageShare?: number | null;
}): MeasuredPitchReport {
  const { dsm, contours, transform, instantPitch12 } = input;
  const stepFt = dsm.pixelSizeM * FT_PER_M;

  const fallback = (reason: string, extras?: Partial<MeasuredPitchReport>): MeasuredPitchReport => ({
    source: "instant",
    families:
      instantPitch12 != null ? [{ pitch12: instantPitch12, planSqft: 0 }] : [],
    trustedShare: 0,
    trustedSqft: 0,
    reason,
    ...extras,
  });

  if (!transform) {
    return fallback("the contour could not be registered to the elevation raster, so a sample would read the neighbouring slope");
  }
  if (input.coverageShare != null && input.coverageShare < 0.7) {
    return fallback(
      `the elevation data covers only ${Math.round(input.coverageShare * 100)}% of the outline — too little of this roof was seen to measure a pitch`,
    );
  }

  // ── cells: tile each contour's bbox, sample DSM inside the (inset) ring ──
  const cos = Math.cos((transform.thetaDeg * Math.PI) / 180);
  const sin = Math.sin((transform.thetaDeg * Math.PI) / 180);
  const cx = dsm.width / 2;
  const cy = dsm.height / 2;
  const insetFt = EDGE_INSET_PX * stepFt;

  const cells: Cell[] = [];
  let sampledSqft = 0;
  let trustedSqft = 0;

  for (const ring of contours) {
    if (ring.length < 3 || Math.abs(areaOf(ring)) < MIN_TRUSTED_SQFT / 2) continue;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    for (let gy = minY; gy < maxY; gy += CELL_FT) {
      for (let gx = minX; gx < maxX; gx += CELL_FT) {
        const pts: Array<{ x: number; y: number; z: number }> = [];
        for (let fy = gy; fy < gy + CELL_FT; fy += stepFt) {
          for (let fx = gx; fx < gx + CELL_FT; fx += stepFt) {
            if (!pointInRing(fx, fy, ring)) continue;
            // stay clear of the contour: sample only where a disc of insetFt
            // stays inside (cheap test on the 4 cardinal offsets)
            if (
              !pointInRing(fx + insetFt, fy, ring) ||
              !pointInRing(fx - insetFt, fy, ring) ||
              !pointInRing(fx, fy + insetFt, ring) ||
              !pointInRing(fx, fy - insetFt, ring)
            ) {
              continue;
            }
            // frame ft → raster px (register.ts forward transform)
            const rx = cos * fx - sin * fy + transform.dxFt;
            const ry = sin * fx + cos * fy + transform.dyFt;
            const px = Math.round(cx + rx / stepFt);
            const py = Math.round(cy - ry / stepFt);
            if (px < 0 || py < 0 || px >= dsm.width || py >= dsm.height) continue;
            const z = dsm.data[py * dsm.width + px];
            if (!Number.isFinite(z)) continue;
            pts.push({ x: fx, y: fy, z: z * FT_PER_M });
          }
        }
        if (pts.length < MIN_SAMPLES) continue;
        const plane = fitPlane(pts);
        if (!plane) continue;
        // the court: median |residual| against the cell's own plane
        const residuals = pts
          .map((p) => Math.abs(plane.a * p.x + plane.b * p.y + plane.c - p.z))
          .sort((a, b) => a - b);
        const p50 = residuals[Math.floor(residuals.length / 2)];
        const cellSqft = pts.length * stepFt * stepFt;
        sampledSqft += cellSqft;
        if (p50 > DSM_NOISE_FLOOR_FT) continue;
        trustedSqft += cellSqft;
        cells.push({ pitch12: planePitch12(plane), planSqft: cellSqft });
      }
    }
  }

  const trustedShare = sampledSqft > 0 ? trustedSqft / sampledSqft : 0;

  // area-weighted IQR over all trusted cells
  let spreadIqr12: number | undefined;
  if (cells.length >= 2) {
    const sorted = [...cells].sort((a, b) => a.pitch12 - b.pitch12);
    const q = (frac: number): number => {
      const target = trustedSqft * frac;
      let cum = 0;
      for (const c of sorted) {
        cum += c.planSqft;
        if (cum >= target) return c.pitch12;
      }
      return sorted[sorted.length - 1].pitch12;
    };
    spreadIqr12 = q(0.75) - q(0.25);
  }

  if (input.solarPanels && instantPitch12 != null) {
    return fallback(
      "this roof carries solar panels, and the elevation data measures the panels rather than the roof beneath them — the published pitch is used",
      { trustedShare, trustedSqft, ...(spreadIqr12 != null ? { spreadIqr12 } : {}) },
    );
  }

  if (cells.length < MIN_TRUSTED_CELLS || trustedSqft < MIN_TRUSTED_SQFT) {
    return fallback(
      `too little of the roof reads as a plane (${cells.length} clean cell${cells.length === 1 ? "" : "s"}, ${trustedSqft.toFixed(0)} sq ft) to measure a pitch from — the published pitch is used`,
      { trustedShare, trustedSqft, ...(spreadIqr12 != null ? { spreadIqr12 } : {}) },
    );
  }

  // ── pitch families: split the sorted trusted cells at gaps > the tolerance ──
  const sorted = [...cells].sort((a, b) => a.pitch12 - b.pitch12);
  const rawFamilies: Cell[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].pitch12 - sorted[i - 1].pitch12 > CONSISTENT_IQR_12) rawFamilies.push([]);
    rawFamilies[rawFamilies.length - 1].push(sorted[i]);
  }
  const families: PitchFamily[] = rawFamilies
    .map((group) => {
      const area = group.reduce((s, c) => s + c.planSqft, 0);
      return {
        pitch12: group.reduce((s, c) => s + c.pitch12 * c.planSqft, 0) / area,
        planSqft: area,
      };
    })
    .filter((f) => f.planSqft >= MIN_TRUSTED_SQFT)
    .sort((a, b) => b.planSqft - a.planSqft);

  if (!families.length) {
    return fallback(
      `the cells that read cleanly disagree with each other (${spreadIqr12?.toFixed(2) ?? "?"}/12 spread) and no slope family covers a roofing square — the published pitch is used`,
      { trustedShare, trustedSqft, ...(spreadIqr12 != null ? { spreadIqr12 } : {}) },
    );
  }

  const familyLabel = families.map((f) => f.pitch12.toFixed(1)).join(" + ");
  return {
    source: "measured",
    families,
    trustedShare,
    trustedSqft,
    ...(spreadIqr12 != null ? { spreadIqr12 } : {}),
    reason:
      families.length === 1
        ? `${cells.length} cells covering ${(trustedShare * 100).toFixed(0)}% of the sampled roof fit planes to within ${DSM_NOISE_FLOOR_FT} ft and agree to ${spreadIqr12!.toFixed(2)}/12; pitch is their area-weighted mean`
        : `${cells.length} clean cells form ${families.length} slope families (${familyLabel}/12), each over a roofing square — reported largest first`,
  };
}

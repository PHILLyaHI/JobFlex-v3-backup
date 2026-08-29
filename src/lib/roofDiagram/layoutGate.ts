// VISION PROPOSES, GEOMETRY DISPOSES.
//
// The layout read was measured on 2026-08-28 against the strongest evidence
// available — 45-60% correct drain directions across three runs, against 50%
// for the reader it replaced and 38% for guessing one of eight compass points.
// The better photograph and the better prompt did not move it. So this gate is
// not a formality on a good source; it is the only thing standing between a
// coin-flip and a drawing a contractor prices from.
//
// Its value is in what it THROWS AWAY. A source that is right half the time is
// useful exactly to the degree that the wrong half can be identified by other
// means, and every check here is other means: the surveyed outline, the
// elevation data, the model's own topology, and two independent line finders.
//
// NO SECOND ROUND. An earlier plan allowed re-asking the reader with the reason
// it failed. That is dropped: re-asking a source whose accuracy is unchanged
// spends a call to get another draw from the same distribution. Rejected is
// rejected, and the reason is recorded.
import type { RoofModel } from "@/lib/eagleview";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { fitPlane } from "@/lib/roofRecon";
import { applyCreases } from "@/lib/roofRecon/facetCut";
import type { CreaseCandidate } from "@/lib/roofRecon/creases";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import type { LayoutLine } from "./roofLayoutVision";

/** Same floor the lidar creases use: below this the two halves are one plane. */
const BEND_MIN_DEG = 10;
/** Same floor: fewer points than this on a side and the fit is not a fit. */
const MIN_SIDE_POINTS = 10;
/**
 * How near an independent finder's line must come before it counts as the same
 * line. NOT_A_NEW_LINE_FT in creases.ts — the distance at which that module
 * already decides two lines are not distinct. No new number.
 */
const SAME_LINE_FT = 6;
/** A downslope bearing must be this close to the perpendicular to count. */
const PERPENDICULAR_TOL_DEG = 45;

export type CheckName = "inside-contour" | "already-drawn" | "dsm-bend" | "dsm-direction" | "topology" | "corroborated";

export interface GateCheck {
  name: CheckName;
  passed: boolean;
  /** In the words a reader of the provenance needs, not in jargon. */
  detail: string;
}

export interface GatedLine {
  line: LayoutLine;
  passed: boolean;
  checks: GateCheck[];
  /** The first check that failed, when one did. */
  rejectedBy?: CheckName;
  reason?: string;
}

export interface GateResult {
  accepted: LayoutLine[];
  /**
   * Lines that are already in the drawing. NOT rejections and NOT additions —
   * the reader agreeing with what we built. Counting them as rejections would
   * have overstated the gate: the DSM inside ONE facet is planar by
   * construction, so a correctly-placed line lying on an existing facet
   * boundary fails the bend test for the wrong reason.
   */
  alreadyDrawn: LayoutLine[];
  gated: GatedLine[];
  /** Counts per check, so the provenance can say WHERE the source fails. */
  rejectedByCheck: Record<string, number>;
  eulerBefore: number | null;
  eulerAfter: number | null;
}

export interface GateInput {
  model: RoofModel;
  lines: readonly LayoutLine[];
  /** The structure outline the drawing was built on, frame feet. */
  contour: readonly FootprintPoint[];
  /** DSM roof points in frame feet with height above ground. */
  dsmPoints: ReadonlyArray<{ x: number; y: number; z: number }>;
  /** Lines two independent finders already put on this roof, frame feet. */
  corroborators?: ReadonlyArray<{ a: FootprintPoint; b: FootprintPoint; source: string }>;
  /**
   * The vision reader's lines — a WITNESS WITH WEIGHT, not a source (owner's
   * decision, 2026-08-28, after the honest re-measure landed at 56-73% against
   * 50/38). Vision agreement lifts a corroborated line to a FULL WITNESS in
   * the check detail; vision alone never passes a line, because every third
   * facet it reads still drains the wrong way.
   */
  visionLines?: ReadonlyArray<{ a: FootprintPoint; b: FootprintPoint }>;
}

const inRing = (p: { x: number; y: number }, r: readonly { x: number; y: number }[]): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};

const angDiff = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
};

/** Downslope bearing of a fitted plane, compass degrees — same convention as roofRecon. */
const azOf = (p: { a: number; b: number }): number => ((Math.atan2(-p.a, -p.b) * 180) / Math.PI + 360) % 360;

/** Distance from a point to a segment, feet. */
function distToSeg(p: FootprintPoint, a: FootprintPoint, b: FootprintPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function gateLayoutLines(input: GateInput): GateResult {
  const { model, lines, contour, dsmPoints } = input;
  const idx = buildIndexes(model);
  const faces = model.faces
    .map((f) => {
      const r = ringOf(f.lineIds, idx);
      return r && r.length >= 3 ? { id: f.id, label: String(f.designator || f.id), plan: r.map((q) => ({ x: q.x, y: q.y })) } : null;
    })
    .filter((f): f is { id: string; label: string; plan: FootprintPoint[] } => !!f);

  const gated: GatedLine[] = [];
  const alreadyDrawn: LayoutLine[] = [];
  const rejectedByCheck: Record<string, number> = {};
  const survivors: Array<{ line: LayoutLine; cand: CreaseCandidate }> = [];

  // The drawing's own interior lines, to recognise agreement before testing for
  // a new fold.
  const pointById = new Map(model.points.map((p) => [p.id, p]));
  const drawn = model.lines
    .filter((l) => ["RIDGE", "HIP", "VALLEY"].includes(l.type))
    .map((l) => {
      const a = pointById.get(l.aId);
      const b = pointById.get(l.bId);
      return a && b ? { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, type: String(l.type) } : null;
    })
    .filter((l): l is { a: FootprintPoint; b: FootprintPoint; type: string } => l !== null);

  for (const line of lines) {
    const checks: GateCheck[] = [];
    const mid = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
    const dx = line.b.x - line.a.x;
    const dy = line.b.y - line.a.y;
    const len = Math.hypot(dx, dy);

    const fail = (name: CheckName, detail: string) => {
      checks.push({ name, passed: false, detail });
      rejectedByCheck[name] = (rejectedByCheck[name] ?? 0) + 1;
      gated.push({ line, passed: false, checks, rejectedBy: name, reason: detail });
    };

    // ── 1. inside the surveyed outline ──
    if (len < 3) { fail("inside-contour", `the line is only ${len.toFixed(1)} ft long — shorter than any roof line we draw`); continue; }
    const bothIn = inRing(line.a, contour) && inRing(line.b, contour);
    if (!bothIn) { fail("inside-contour", "at least one end of the line falls outside the surveyed building outline"); continue; }
    checks.push({ name: "inside-contour", passed: true, detail: "both ends inside the surveyed outline" });

    // ── already in the drawing? ──
    // Then it is agreement, not a proposal, and the bend test below does not
    // apply: it would fit two halves of ONE facet, which is planar by
    // construction, and reject a line that is in fact correct.
    const match = drawn.find(
      (d) => distToSeg(mid, d.a, d.b) <= SAME_LINE_FT && distToSeg(line.a, d.a, d.b) <= SAME_LINE_FT * 2 && distToSeg(line.b, d.a, d.b) <= SAME_LINE_FT * 2,
    );
    if (match) {
      const sameType = match.type === line.type;
      checks.push({
        name: "already-drawn",
        passed: true,
        detail: sameType
          ? `the drawing already has a ${line.type.toLowerCase()} here — the reader agrees with it`
          : `the drawing already has a ${match.type.toLowerCase()} here, where the reader says ${line.type.toLowerCase()}`,
      });
      alreadyDrawn.push(line);
      gated.push({ line, passed: false, checks });
      continue;
    }

    // Which drawn facet would this line cut?
    const host = faces.find((f) => inRing(mid, f.plan));
    if (!host) { fail("inside-contour", "the line does not lie on any facet of the drawing"); continue; }

    // ── 2. does the ELEVATION DATA bend here? ──
    // Fit a plane to the DSM heights on each side of the line, inside the host
    // facet. A real crease bends; a line drawn across a flat slope does not.
    const nx = -dy / len;
    const ny = dx / len;
    const side = (p: { x: number; y: number }) => (p.x - mid.x) * nx + (p.y - mid.y) * ny;
    const lo: Array<{ x: number; y: number; z: number }> = [];
    const hi: Array<{ x: number; y: number; z: number }> = [];
    for (const p of dsmPoints) {
      if (!inRing(p, host.plan)) continue;
      (side(p) >= 0 ? hi : lo).push(p);
    }
    if (lo.length < MIN_SIDE_POINTS || hi.length < MIN_SIDE_POINTS) {
      fail("dsm-bend", `the elevation data has too few points on one side of this line (${lo.length} and ${hi.length}) to say whether the roof bends there`);
      continue;
    }
    const pLo = fitPlane(lo);
    const pHi = fitPlane(hi);
    if (!pLo || !pHi) { fail("dsm-bend", "the elevation data on one side of the line does not fit a plane"); continue; }
    const nLo = { x: -pLo.a, y: -pLo.b, z: 1 };
    const nHi = { x: -pHi.a, y: -pHi.b, z: 1 };
    const dot = nLo.x * nHi.x + nLo.y * nHi.y + nLo.z * nHi.z;
    const mag = Math.hypot(nLo.x, nLo.y, nLo.z) * Math.hypot(nHi.x, nHi.y, nHi.z);
    const bendDeg = (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
    if (bendDeg < BEND_MIN_DEG) {
      fail("dsm-bend", `the elevation data shows the roof bending only ${bendDeg.toFixed(1)}° across this line — below the ${BEND_MIN_DEG}° that separates a fold from one flat slope`);
      continue;
    }
    checks.push({ name: "dsm-bend", passed: true, detail: `the elevation data bends ${bendDeg.toFixed(0)}° across it` });

    // ── 3. do the two sides drain the way this KIND of line requires? ──
    const azLo = azOf(pLo);
    const azHi = azOf(pHi);
    const lineBearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    const away = [(lineBearing + 90) % 360, (lineBearing + 270) % 360];
    const nearPerp = (az: number) => Math.min(angDiff(az, away[0]), angDiff(az, away[1]));
    const opposed = angDiff(azLo, azHi) >= 90;
    const perp = nearPerp(azLo) <= PERPENDICULAR_TOL_DEG && nearPerp(azHi) <= PERPENDICULAR_TOL_DEG;
    if (!perp || !opposed) {
      fail(
        "dsm-direction",
        `the two sides of this line drain toward ${azLo.toFixed(0)}° and ${azHi.toFixed(0)}°, which is not the opposed pair a ${line.type.toLowerCase()} requires`,
      );
      continue;
    }
    checks.push({ name: "dsm-direction", passed: true, detail: `the sides drain ${azLo.toFixed(0)}° and ${azHi.toFixed(0)}°, opposed across the line` });

    // ── 4. has an independent finder seen this line? ──
    const hit = (input.corroborators ?? []).find(
      (c) => distToSeg(mid, c.a, c.b) <= SAME_LINE_FT && Math.min(distToSeg(line.a, c.a, c.b), distToSeg(line.b, c.a, c.b)) <= SAME_LINE_FT,
    );
    if (!hit) {
      fail("corroborated", "no independent line finder — neither the lidar folds nor the photograph's own edges — puts a line here");
      continue;
    }
    const visionAgrees = (input.visionLines ?? []).some(
      (v) => distToSeg(mid, v.a, v.b) <= SAME_LINE_FT && Math.min(distToSeg(line.a, v.a, v.b), distToSeg(line.b, v.a, v.b)) <= SAME_LINE_FT,
    );
    checks.push({
      name: "corroborated",
      passed: true,
      detail: visionAgrees
        ? `FULL WITNESS: the ${hit.source} puts a line here and the vision read independently agrees`
        : `the ${hit.source} independently puts a line here`,
    });

    // Survivor: hand it to the same cut machinery the lidar folds go through.
    survivors.push({
      line,
      cand: {
        facetId: host.id,
        facetLabel: host.label,
        facetSqft: 0,
        type: line.type === "VALLEY" ? "VALLEY" : line.type === "HIP" ? "HIP" : "RIDGE",
        through: mid,
        dir: { x: dx / len, y: dy / len },
        bendDeg,
        gain: 0,
        lowHalfFt: 0,
        highHalfFt: 0,
        stepFt: 0,
        stepAllowedFt: 0,
        pointsLow: lo.length,
        pointsHigh: hi.length,
      } as CreaseCandidate,
    });
  }

  // ── 5. does the drawing survive the cuts? Euler, tiling, an eave on each half. ──
  // The same guards the lidar folds pass, and deliberately the same code: a
  // second implementation would be a second set of bugs (§K7).
  let eulerBefore: number | null = null;
  let eulerAfter: number | null = null;
  const accepted: LayoutLine[] = [];
  if (survivors.length) {
    const report = applyCreases(model, survivors.map((s) => s.cand));
    eulerBefore = report.eulerBefore;
    eulerAfter = report.eulerAfter;
    const refusedByLabel = new Map(report.refused.map((r) => [r.facet, r.reason]));
    for (const s of survivors) {
      const refusal = refusedByLabel.get(s.cand.facetLabel);
      if (refusal) {
        rejectedByCheck.topology = (rejectedByCheck.topology ?? 0) + 1;
        gated.push({
          line: s.line,
          passed: false,
          checks: [{ name: "topology", passed: false, detail: refusal }],
          rejectedBy: "topology",
          reason: refusal,
        });
      } else {
        accepted.push(s.line);
        gated.push({ line: s.line, passed: true, checks: [{ name: "topology", passed: true, detail: "the drawing still closes after this cut" }] });
      }
    }
  }

  return { accepted, alreadyDrawn, gated, rejectedByCheck, eulerBefore, eulerAfter };
}

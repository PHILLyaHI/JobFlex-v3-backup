// What EagleView told us about the roof besides the numbers we print.
//
// The Property Data response carries three things the parser used to drop on
// the floor, all of them free, all of them in every paid response:
//
//   • how obstructed EagleView thinks the roof is (its own occlusion and
//     tree-overhang classifiers, with confidences of 0.85 and 0.92 on the one
//     body we still have) — a second witness to the question our DSM coverage
//     answers, and the reason confidence.ts now takes the worse of the two;
//   • the confidence it attached to EVERY field, including the 0.189 on the
//     facet count the vertex budget was trusting without knowing;
//   • a SECOND outline of the same building — one polygon per roof material,
//     15 corners against the 13 of the outline we draw from on 419 Prairie.
//
// The second outline is a CHECK, never a source. Two independent renditions of
// one building that disagree by more than the tolerance mean the building was
// hard to trace, and the drawing should say so rather than pick a winner.
//
// Pure and side-effect free; the caller owns the data.

import { COVERAGE_CLEAR } from "@/lib/roofDiagram/confidence";
import type { InstantRoofData, InstantStructure } from "@/lib/eagleview";
import { latLngRingToFrame } from "@/lib/roofRecon/surveyDsm";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";

/**
 * How far two independent outlines of the same building may disagree before
 * the outline stops being trustworthy. No new number: this is the same figure
 * the coverage gate already uses for "how much of a roof may be unaccounted
 * for and still be called clear" — 5 %. Measured on the one nine-pack body we
 * have (419 Prairie): the two polygons differ by 1.5 %, comfortably inside it.
 * Category: relative, on an area already in the problem.
 */
export const OUTLINE_AGREE_PCT = Math.round((1 - COVERAGE_CLEAR) * 1000) / 10;

export interface InstantSurvey {
  occlusion: string | null;
  treeOverhang: string | null;
  confidence?: Record<string, number>;
  outlineCheck?: {
    outlineSqft: number;
    materialSqft: number;
    diffPct: number;
    agrees: boolean;
    materialPoints: number;
    outlinePoints: number;
  };
}

/** The structure we actually draw: the largest by roof area, then footprint. */
export function largestStructureOf(instant: InstantRoofData): InstantStructure | null {
  const withOutline = instant.structures.filter((s) => (s.outline?.length ?? 0) >= 3);
  const pool = withOutline.length ? withOutline : instant.structures;
  return (
    pool
      .slice()
      .sort((a, b) => (b.areaSqft ?? b.footprintSqft ?? 0) - (a.areaSqft ?? a.footprintSqft ?? 0))[0] ?? null
  );
}

const planSqft = (ring: Array<{ lat: number; lng: number }>, origin: { lat: number; lng: number }): number => {
  const frame = latLngRingToFrame(origin, ring).ring as FootprintPoint[];
  return Math.abs(areaOf(frame));
};

/**
 * Read the survey off the structure we drew. `origin` is the frame pin — only
 * used to put the two lat/lng rings into feet so their areas are comparable.
 */
export function readInstantSurvey(
  instant: InstantRoofData,
  origin: { lat: number; lng: number },
): InstantSurvey | null {
  const st = largestStructureOf(instant);
  if (!st) return null;

  const survey: InstantSurvey = {
    occlusion: st.occlusion ?? null,
    treeOverhang: st.treeOverhang ?? null,
    ...(st.confidence ? { confidence: st.confidence } : {}),
  };

  // the cross-check, when both polygons are present
  const outline = st.outline;
  const material = st.materialRings?.slice().sort((a, b) => b.ring.length - a.ring.length)[0];
  if (outline && outline.length >= 3 && material && material.ring.length >= 3) {
    const outlineSqft = planSqft(outline, origin);
    const materialSqft = planSqft(material.ring, origin);
    if (outlineSqft > 0) {
      const diffPct = ((materialSqft - outlineSqft) / outlineSqft) * 100;
      survey.outlineCheck = {
        outlineSqft,
        materialSqft,
        diffPct,
        agrees: Math.abs(diffPct) <= OUTLINE_AGREE_PCT,
        materialPoints: material.ring.length,
        outlinePoints: outline.length,
      };
    }
  }

  // Nothing worth recording when EagleView said nothing.
  return survey.occlusion || survey.treeOverhang || survey.confidence || survey.outlineCheck ? survey : null;
}

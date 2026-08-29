// RoofModel from a weighted-wavefront result: per-facet lift at the facet's
// own slope (z = slope_i · dist to edge i's line — each facet is planar on
// its edge's plane by construction), then the shared V2 assembly discipline
// (assembleModel.ts — weld points, dedupe lines, classify by geometry,
// EagleView designators by area rank, totals and footage from the drawn
// geometry; the H3 identity holds by construction).

import type { RoofModel } from "@/lib/eagleview";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import type { WavefrontResult, WPt } from "@/lib/roofRecon/weightedWavefront";
import { assembleRoofModel, type AssembleCell } from "@/lib/roofRecon/assembleModel";

export interface WavefrontModelInput {
  contour: FootprintPoint[];
  slopes: number[]; // rise/run per contour edge; Infinity = gable
  result: WavefrontResult;
  /** Copied onto the model shell (location, provenance fields). */
  base: RoofModel;
  structureIndex: number;
}

export function modelFromWavefront(input: WavefrontModelInput): RoofModel | null {
  const { contour, slopes, result } = input;
  const n = contour.length;

  const edgeLine = (i: number) => {
    const a = contour[i];
    const b = contour[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    // inward normal for a CCW contour
    const ccw = areaOf(contour) > 0 ? 1 : -1;
    return { a, nrm: { x: -d.y * ccw, y: d.x * ccw } };
  };
  const zOn = (i: number, p: WPt): number => {
    const { a, nrm } = edgeLine(i);
    return slopes[i] * ((p.x - a.x) * nrm.x + (p.y - a.y) * nrm.y);
  };

  type P3 = { x: number; y: number; z: number };
  const rings: Array<{ ring: P3[]; pitch12: number; edgeIndex: number }> = [];
  for (const f of result.facets) {
    const s = slopes[f.edgeIndex];
    if (!Number.isFinite(s)) return null;
    const ring = f.ring.map((p) => ({ x: p.x, y: p.y, z: zOn(f.edgeIndex, p) }));
    if (ring.length < 3) return null;
    rings.push({ ring, pitch12: s * 12, edgeIndex: f.edgeIndex });
  }

    // ── assembly: the shared discipline ──
  const cells: AssembleCell[] = rings.map((r) => {
    const { nrm } = edgeLine(r.edgeIndex);
    return {
      ring: r.ring,
      pitch12: r.pitch12,
      orientationDeg: ((Math.atan2(-nrm.x, -nrm.y) * 180) / Math.PI + 360) % 360,
      zOf: (x, y) => zOn(r.edgeIndex, { x, y }),
    };
  });
  return assembleRoofModel({ cells, base: input.base, idPrefix: "W", structureIndex: input.structureIndex });
}

// Is this roof flat? One answer for the whole estimator — the edge estimate,
// the package builder, the AI draft and the commercial read all ask here, so
// they can never disagree about the same roof.
//
// Pitch decides when there is one: half the roof under 2/12 is flat; half the
// roof under 4/12 is flat only when the shape word or the material agrees
// (2–4/12 is legal for shingles with doubled underlayment, so pitch alone does
// not settle it). With no pitch, the shape word and the material decide, and
// a delivered measurement report with almost no ridge, hip or valley against
// a long perimeter settles it too. A measured report never overrides a stated
// steep pitch (review, 2026-09-14).

import { familyOfMaterial } from "./catalog";
import type { RoofFacts } from "./takeoff";

export type FlatBecause = "pitch" | "shape" | "material" | "report";

const SHAPE_FLAT = /flat|low[\s-]?slope|membrane/i;

/** Why the roof reads flat, or null when it does not. */
export function flatBecause(facts: RoofFacts): FlatBecause | null {
  const fams = facts.pitchFamilies.filter((f) => Number.isFinite(f.pitch12) && f.share > 0);
  const shapeFlat = SHAPE_FLAT.test(facts.shape ?? "");
  const matFlat = familyOfMaterial(facts.existingMaterial ?? null) === "low-slope";
  if (fams.length) {
    const total = fams.reduce((a, f) => a + f.share, 0) || 1;
    const low = fams.filter((f) => f.pitch12 < 2).reduce((a, f) => a + f.share, 0) / total;
    const shallow = fams.filter((f) => f.pitch12 >= 2 && f.pitch12 < 4).reduce((a, f) => a + f.share, 0) / total;
    if (low >= 0.5) return "pitch";
    if (low + shallow >= 0.5 && (shapeFlat || matFlat)) return shapeFlat ? "shape" : "material";
    return null;
  }
  if (shapeFlat) return "shape";
  if (matFlat) return "material";
  const m = facts.measured ?? null;
  if (m && facts.squares >= 8) {
    const sloped = m.ridgeFt + m.hipFt + m.valleyFt;
    const perimeter = m.eaveFt + m.rakeFt;
    if (perimeter > 0 && sloped / perimeter < 0.1) return "report";
  }
  return null;
}

export function isFlatRoof(facts: RoofFacts): boolean {
  return flatBecause(facts) !== null;
}

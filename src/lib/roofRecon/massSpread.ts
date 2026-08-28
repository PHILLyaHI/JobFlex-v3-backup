// Is this one roof, or several masses drawn as one?
//
// The existing test compares the number of DSM plane clusters against the
// number of contour edges. It misses the case it most needs to catch: 12621 has
// 11 clusters and 11 edges, so the rule reads false, while the DSM measured
// pitches of 6, 6, 7, 7, 7, 7, 8, 8, 8, 9 and 10 on that one roof — three
// distinct families — and EagleView independently calls it `mixed` with 14
// facets against our 11. A house with a broken-up outline hides its own
// multi-mass nature from a rule that counts edges.
//
// The pitch SPREAD does not hide. A roof grown from one contour at one pitch
// has one family by construction; two families that each hold real area mean
// two roofs, and the ridge of each runs along its own mass, not along the
// union. That is why 12621 draws a 4 ft ridge on a 2,924 sq ft house: an
// equal-pitch hip on a 43.5 × 34.6 ft contour has a ridge of exactly
// length − width, and every real ridge collapses into that stub.
//
// DETECTOR ONLY. Nothing here changes what is built; a roof per mass, with the
// wall where they meet, is separate work.
//
// ── MEASURED, AND IT DOES NOT WORK. Kept for the record, wired to nothing. ──
//
// Run over all six field addresses (scripts/qa/roof/mass-spread.ts):
//
//   floor = 2 clusters per family          fires on 5 of 6
//   floor = MIN_TRUSTED_SQFT (100 sq ft)   fires on 6 of 6
//
// A test that fires everywhere carries no information, and the answer is NOT a
// higher floor. The quantity is wrong. Pitch spread detects multi-PITCH, and the
// case it was built to catch is not a multi-pitch case: an American house with a
// main block and a garage or bedroom wing gets ONE pitch from ONE builder across
// all of it. 12621 is precisely that — every level of it fits at 7/12 — so the
// spread over its clusters is 2,175 sq ft at 7/12 against three satellites, and
// this detector ranks the very house it was written for as the LEAST multi-mass
// of the five suburban roofs. Structurally blind, not badly tuned.
//
// EagleView's `shape` cannot arbitrate this either: hip / gable / mixed names
// the FORM of the facets, not the number of masses. It reads `mixed` on three of
// the five and `hip` on 12629, which the owner has traced as two masses with a
// valley between them.
//
// What does carry the signal is RIDGE HEIGHT, measured on the same six. Masses
// are separated by where their ridges sit, not by slope:
//
//   12621  29.0 28.8 | 26.5 25.8 25.1 | 21.6 | 12.3 11.1   — four levels, all 7/12
//   12618  24.5 ×4 | 21.7 | 18.1 17.9 17.9 | 9.9           — main, wing, porch
//   9903   16.2 16.2 | 13.3 13.2 | 7.1                     — main gable plus a wing
//   12629  26.6 26.6 25.3 24.0 23.6 23.1                   — one band, and Instant says hip
//
// That is why 12621 draws a 4 ft ridge: four ridge elevations are being forced
// onto one. But a plain height-gap threshold fails too, and the numbers say so
// — 12629's spread WITHIN one mass is 3.5 ft, wider than 12621's gap BETWEEN its
// top two masses (2.3 ft). Height needs adjacency with it: a mass is a set of
// planes meeting at a shared ridge line. That is real work on the segmentation,
// not a constant, and it is not started here.

import { DSM_NOISE_FLOOR_FT, MIN_TRUSTED_SQFT, type PitchMeasurement } from "@/lib/roofRecon/pitchFromDsm";

/**
 * Pitches within this of each other are ONE slope. sectionTolerance12's own
 * figure — the pipeline's existing definition of "the same slope" — reused
 * rather than invented.
 */
const SAME_SLOPE_12 = 0.75;

export interface PitchFamily {
  /** Area-weighted pitch of the family, rise per 12. */
  pitch12: number;
  planSqft: number;
  facets: string[];
}

export interface MassSpread {
  /** True when more than one family holds real area. */
  multiMass: boolean;
  families: PitchFamily[];
  /** Every trusted pitch that went in, for the record. */
  pitches12: number[];
  /** Widest gap between family pitches, rise per 12. */
  spread12: number;
  /** Why the verdict, in one line. */
  reason: string;
}

/**
 * The reconstruction's OWN plane clusters, before anything of ours touched
 * them. This is the input that works, and the difference matters: measuring the
 * spread over OUR facets asks the elevation data about regions we defined, and
 * our regions were all grown at ONE pitch, so they average the masses together
 * and the spread disappears. Measured on 12621 — over our facets the spread
 * reads as a single family; over the reconstruction's clusters it is 6, 6, 7,
 * 7, 7, 7, 8, 8, 8, 9, 10.
 *
 * A family qualifies on AREA, not on how many clusters it holds. A count floor
 * was tried first and is recorded as a failure: at two clusters it fired on
 * five of the six sample addresses, including one EagleView calls a plain hip,
 * because a DSM fitted to small facets scatters a single true pitch across
 * several whole rise values. The floor is MIN_TRUSTED_SQFT — the same area at
 * which this pipeline already stops trusting a plane fit. Below it a stray
 * pitch is a dormer, a bay or noise; above it, it is roof.
 */
export function measureClusterSpread(
  clusterPitches12: readonly number[],
  clusterSqft?: readonly number[],
): MassSpread {
  const rows = clusterPitches12
    .map((p, i) => ({ p, a: clusterSqft?.[i] ?? 0 }))
    .filter((r) => Number.isFinite(r.p) && r.p > 0)
    .sort((a, b) => a.p - b.p);
  const pitches12 = rows.map((r) => r.p);
  if (rows.length < 2) {
    return { multiMass: false, families: [], pitches12, spread12: 0, reason: "too few plane clusters to speak of masses" };
  }
  const groups: { p: number; a: number }[][] = [];
  let cur: { p: number; a: number }[] = [rows[0]];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].p - rows[i - 1].p > SAME_SLOPE_12) {
      groups.push(cur);
      cur = [];
    }
    cur.push(rows[i]);
  }
  groups.push(cur);
  const families: PitchFamily[] = groups
    .map((g) => {
      const a = g.reduce((s, r) => s + r.a, 0);
      // Area-weighted so a large cluster sets the family's pitch, falling back
      // to the plain mean when no areas were supplied.
      const pitch12 = a > 0 ? g.reduce((s, r) => s + r.p * r.a, 0) / a : g.reduce((s, r) => s + r.p, 0) / g.length;
      return { pitch12, planSqft: a, facets: g.map((r) => r.p.toFixed(1)) };
    })
    .sort((x, y) => y.planSqft - x.planSqft);
  const measuredAreas = families.some((f) => f.planSqft > 0);
  const real = families.filter((f) => f.planSqft >= MIN_TRUSTED_SQFT);
  const spread12 = real.length > 1
    ? Math.abs(Math.max(...real.map((f) => f.pitch12)) - Math.min(...real.map((f) => f.pitch12)))
    : 0;
  const multiMass = measuredAreas && real.length > 1;
  return {
    multiMass,
    families,
    pitches12,
    spread12,
    reason: !measuredAreas
      ? "plane clusters carry no areas — the spread cannot be judged"
      : multiMass
        ? `${real.length} slope families each holding real roof — ${real.map((f) => `${f.pitch12.toFixed(1)}/12 over ${Math.round(f.planSqft)} sq ft`).join(", ")}, spread ${spread12.toFixed(1)}/12: more than one mass`
        : `one slope family holds the roof (${Math.round(families[0]?.planSqft ?? 0)} sq ft at ${families[0]?.pitch12.toFixed(1) ?? "?"}/12); the other ${families.length - 1} are under ${MIN_TRUSTED_SQFT} sq ft — dormers, bays or fitting noise`,
  };
}

/**
 * The same question asked of OUR facets. Kept because it is the only form
 * available when there is no cluster list, and because its silence next to
 * measureClusterSpread's answer is itself the finding: our facets cannot show a
 * spread they were built without.
 */
export function measureMassSpread(m: PitchMeasurement): MassSpread {
  const trusted = m.facets.filter((f) => f.residualP50Ft <= DSM_NOISE_FLOOR_FT && f.planSqft > 0);
  const pitches12 = trusted.map((f) => f.pitch12).sort((a, b) => a - b);
  if (trusted.length === 0) {
    return { multiMass: false, families: [], pitches12: [], spread12: 0, reason: "no facet has a trusted plane to take a pitch from" };
  }

  // single-link grouping along the sorted pitches: a gap wider than one slope
  // tolerance starts a new family
  const groups: Array<typeof trusted> = [];
  const bySlope = trusted.slice().sort((a, b) => a.pitch12 - b.pitch12);
  let current: typeof trusted = [bySlope[0]];
  for (let i = 1; i < bySlope.length; i++) {
    if (bySlope[i].pitch12 - bySlope[i - 1].pitch12 > SAME_SLOPE_12) {
      groups.push(current);
      current = [];
    }
    current.push(bySlope[i]);
  }
  groups.push(current);

  const families: PitchFamily[] = groups
    .map((g) => {
      const planSqft = g.reduce((s, f) => s + f.planSqft, 0);
      return {
        planSqft,
        pitch12: planSqft > 0 ? g.reduce((s, f) => s + f.pitch12 * f.planSqft, 0) / planSqft : g[0].pitch12,
        facets: g.map((f) => f.id),
      };
    })
    .sort((a, b) => b.planSqft - a.planSqft);

  const real = families.filter((f) => f.planSqft >= MIN_TRUSTED_SQFT);
  const spread12 = families.length > 1 ? families[0].pitch12 - families[families.length - 1].pitch12 : 0;
  const multiMass = real.length > 1;
  return {
    multiMass,
    families,
    pitches12,
    spread12: Math.abs(spread12),
    reason: multiMass
      ? `${real.length} slope families each holding real area — ${real.map((f) => `${f.pitch12.toFixed(1)}/12 over ${Math.round(f.planSqft)} sq ft`).join(", ")}: this is more than one roof`
      : families.length > 1
        ? `${families.length} slope families, but only one holds more than ${MIN_TRUSTED_SQFT} sq ft — the rest are dormers or bays`
        : "one slope family: a single mass",
  };
}

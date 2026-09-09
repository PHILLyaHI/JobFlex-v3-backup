// The figures a roof page shows, derived from an Instant answer — pure, so the
// server (persist) and the client (hero, estimate) compute the same numbers
// from the same rule. Client-safe: no env, no I/O, type-only import.
//
// WHY A MAIN STRUCTURE (audit 2026-09-08). EagleView answers with every
// structure on the parcel — 12117 202nd St SE came back as twenty, the house
// plus nineteen outbuildings — and the page summed them all: 11,675 sq ft and
// 116.8 squares for a 3,747 sq ft house. The page now prices ONE structure,
// the main one, and lists the rest with checkboxes the contractor turns on
// deliberately; a checked structure is added to the total and to the estimate
// in plain sight.

import type { InstantRoofData, InstantStructure } from "@/lib/eagleview";

/** The totals block, derived from a set of structures. */
export function instantTotalsOf(structures: readonly InstantStructure[]): InstantRoofData["totals"] {
  const areaSqft = structures.reduce((a, s) => a + (s.areaSqft ?? 0), 0);
  const main = structures.slice().sort((a, b) => (b.areaSqft ?? 0) - (a.areaSqft ?? 0))[0];
  const pitchLabel = main?.pitch ?? null;
  const pitchRise = pitchLabel ? Number(pitchLabel.split("/")[0]) : NaN;
  const eaves = structures.flatMap((s) => (s.eaveHeightFt ? Object.values(s.eaveHeightFt) : []));
  const facetCounts = structures.map((s) => s.facetCount).filter((n): n is number => n != null);
  const footprints = structures.map((s) => s.footprintSqft).filter((n): n is number => n != null);
  return {
    areaSqft,
    squares: areaSqft / 100,
    predominantPitch: Number.isFinite(pitchRise) ? pitchRise : null,
    pitchLabel,
    maxEaveFt: eaves.length ? Math.max(...eaves) : null,
    facetCount: facetCounts.length ? facetCounts.reduce((a, b) => a + b, 0) : null,
    footprintSqft: footprints.length ? footprints.reduce((a, b) => a + b, 0) : null,
  };
}

export type MainStructureHow = "single" | "area+parcel" | "nearest-pin" | "area" | "none";

export interface MainStructurePick {
  /** Index into `structures`, or null when there are none. */
  index: number | null;
  how: MainStructureHow;
}

function centroid(ring: ReadonlyArray<{ lat: number; lng: number }>): { lat: number; lng: number } {
  const n = ring.length;
  return { lat: ring.reduce((a, p) => a + p.lat, 0) / n, lng: ring.reduce((a, p) => a + p.lng, 0) / n };
}

/**
 * Which structure the page is about.
 *   · one structure → it;
 *   · the parcel is known (mask applied) → the largest by roof area among the
 *     structures NOT vetoed as someone else's;
 *   · no parcel → the structure whose outline centroid is nearest the geocode
 *     pin (a farm's barns are bigger than its house; the pin is on the house);
 *   · no outlines to measure distance with → the largest by area.
 */
export function pickMainStructure(
  structures: readonly InstantStructure[],
  opts: { foreign?: readonly number[]; origin?: { lat: number; lng: number } | null; parcelKnown: boolean },
): MainStructurePick {
  if (!structures.length) return { index: null, how: "none" };
  if (structures.length === 1) return { index: 0, how: "single" };
  const foreign = new Set(opts.foreign ?? []);
  const candidates = structures.map((s, i) => i).filter((i) => !foreign.has(i));
  const pool = candidates.length ? candidates : structures.map((_, i) => i);
  const byArea = (idx: readonly number[]) =>
    idx.slice().sort((a, b) => (structures[b].areaSqft ?? structures[b].footprintSqft ?? -1) - (structures[a].areaSqft ?? structures[a].footprintSqft ?? -1))[0];
  if (opts.parcelKnown) return { index: byArea(pool), how: "area+parcel" };
  if (opts.origin) {
    const withOutline = pool.filter((i) => (structures[i].outline?.length ?? 0) >= 3);
    if (withOutline.length) {
      const o = opts.origin;
      const d2 = (i: number) => {
        const c = centroid(structures[i].outline!);
        const dx = (c.lng - o.lng) * Math.cos((o.lat * Math.PI) / 180);
        const dy = c.lat - o.lat;
        return dx * dx + dy * dy;
      };
      return { index: withOutline.slice().sort((a, b) => d2(a) - d2(b))[0], how: "nearest-pin" };
    }
  }
  return { index: byArea(pool), how: "area" };
}

/** `provenance.parcelVeto.foreignStructures` ("s3") → indices (3). */
export function foreignIndices(foreign: readonly string[] | undefined): number[] {
  return (foreign ?? []).map((s) => Number(String(s).replace(/^s/, ""))).filter((n) => Number.isInteger(n));
}

export interface PitchFamily {
  pitch12: number;
  planSqft: number;
}

/**
 * The pitch the page SHOWS, in one place: the measured families rounded to
 * whole /12 and joined ("4/12 + 9/12"), else EagleView's published figure,
 * else null. Persist writes this so the Recent list and the hero agree
 * (audit finding 4: 12958 read 5/12 in the list and 4/12 + 9/12 on the page).
 */
export function displayedPitchLabel(
  measured: { source: string; families: readonly PitchFamily[] } | null | undefined,
  instantLabel: string | null | undefined,
): string | null {
  if (measured?.source === "measured" && measured.families.length) {
    return [...new Set(measured.families.map((f) => `${Math.round(f.pitch12)}/12`))].join(" + ");
  }
  return instantLabel ?? null;
}

/** Families with their share of the measured plan area, largest first. */
export function pitchFamilyShares(families: readonly PitchFamily[]): Array<{ pitch12: number; share: number }> {
  const total = families.reduce((a, f) => a + f.planSqft, 0);
  if (!total) return [];
  return families
    .slice()
    .sort((a, b) => b.planSqft - a.planSqft)
    .map((f) => ({ pitch12: f.pitch12, share: f.planSqft / total }));
}

export type PitchKind = "measured" | "eagleview" | "none" | "legacy";

export interface RowFigures {
  areaSqft: number | null;
  squares: number | null;
  facetCount: number | null;
  predominantPitch: string | null;
  /** Where the pitch comes from; `legacy` = a drawing-pipeline row with no EagleView answer. */
  pitchKind: PitchKind;
  /** Index of the main structure the figures are about (null without an answer). */
  mainIndex: number | null;
}

/**
 * THE rule for a saved row's figures — the Recent list, the persisted columns
 * and the backfill all go through here, so a list entry can never disagree
 * with the page it opens (audit 2026-09-09: Recent carried drawn facet counts
 * and EagleView pitches while the hero showed EagleView facets and measured
 * pitches).
 *
 *   · with an EagleView answer: the MAIN structure's area / squares / facet
 *     count, the pitch as the page shows it (measured families, else the
 *     structure's published pitch);
 *   · without one (the Aug 2026 drawing pipelines, "[V2]" rows): the row's
 *     own area / squares, no facet count, and a pitch only when the stored
 *     provenance says it was measured — a pitch nobody measured is not data.
 */
export function rowFigures(input: {
  instant: InstantRoofData | null;
  provenance: Record<string, unknown> | null;
  columns: { areaSqft: number | null; squares: number | null; lat?: number | null; lng?: number | null };
}): RowFigures {
  const prov = input.provenance ?? {};
  const measured = prov.pitchMeasurement as { source: string; families: PitchFamily[] } | undefined;
  const legacyPs = prov.pitchSource as { source?: string; pitch12?: number } | undefined;
  const legacyMeasured =
    !measured && legacyPs?.source === "measured" && typeof legacyPs.pitch12 === "number" ? `${Math.round(legacyPs.pitch12)}/12` : null;
  const inst = input.instant;
  if (inst?.structures?.length) {
    const recorded = (prov.mainStructure as { index?: number } | undefined)?.index;
    const veto = prov.parcelVeto as { foreignStructures?: string[] } | undefined;
    const index =
      recorded != null && inst.structures[recorded]
        ? recorded
        : pickMainStructure(inst.structures, {
            foreign: foreignIndices(veto?.foreignStructures),
            origin: input.columns.lat != null && input.columns.lng != null ? { lat: input.columns.lat, lng: input.columns.lng } : null,
            parcelKnown: !!veto,
          }).index;
    const main = index != null ? inst.structures[index] : null;
    const t = main ? instantTotalsOf([main]) : inst.totals;
    const fromMeasured = displayedPitchLabel(measured, null);
    const pitch = fromMeasured ?? legacyMeasured ?? t.pitchLabel ?? null;
    return {
      areaSqft: t.areaSqft,
      squares: t.squares,
      facetCount: t.facetCount,
      predominantPitch: pitch,
      pitchKind: fromMeasured || legacyMeasured ? "measured" : pitch ? "eagleview" : "none",
      mainIndex: index,
    };
  }
  return {
    areaSqft: input.columns.areaSqft,
    squares: input.columns.squares,
    facetCount: null,
    predominantPitch: legacyMeasured,
    pitchKind: legacyMeasured ? "measured" : "legacy",
    mainIndex: null,
  };
}

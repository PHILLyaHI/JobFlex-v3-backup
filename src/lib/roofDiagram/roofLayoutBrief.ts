// Everything we already know about this roof, written for a reader.
//
// The previous vision calls were given a picture and a question. They were not
// given the survey — so the model had to guess a pitch it could have been told,
// and had no way to know which of its own guesses contradicted a measurement.
// Measured outcome of that: 50% correct drain directions against 38% for random
// choice, one facet returned rotated 178 degrees, and self-reported blindness
// worse than chance on three houses of five.
//
// Every number here carries its SOURCE and its CONFIDENCE, because they do not
// deserve equal weight: EagleView's facet count on 419 Prairie scores 0.189 by
// EagleView's own reckoning, while its pitch on the same roof scores 0.59+.
// A reader told only the numbers would treat both as fact.
import type { InstantRoofData, InstantStructure } from "@/lib/eagleview";

export interface OurMeasurements {
  /** Plane clusters the DSM resolved: pitch, downslope bearing, area. */
  clusters?: Array<{ pitch12: number; azimuthDeg: number; sqft: number }>;
  /** Share of the roof the elevation data actually saw, 0-1, 4 ft inset. */
  coverage?: number | null;
  /** Folds the point cloud found, as frame-feet segments. */
  creases?: Array<{ a: { x: number; y: number }; b: { x: number; y: number }; type: string; lengthFt: number }>;
  /** EagleView's own occlusion verdicts, with its confidence. */
  occlusion?: { occlusion: string | null; treeOverhang: string | null; confidence?: Record<string, number> } | null;
}

const n = (v: number | null | undefined, d = 1): string => (v == null ? "unknown" : v.toFixed(d));
const conf = (c: Record<string, number> | undefined, key: string): string =>
  c?.[key] == null ? "" : ` [EagleView's own confidence in this: ${(c[key] * 100).toFixed(0)}%]`;

/** The brief, as plain prose with a source on every line. */
export function buildRoofBrief(
  instant: InstantRoofData,
  structure: InstantStructure,
  contour: Array<{ x: number; y: number }>,
  ours: OurMeasurements,
  confidences?: Record<string, number>,
): string {
  const L: string[] = [];

  L.push("WHAT THE SURVEY SAYS ABOUT THIS ROOF");
  L.push("Source: EagleView Property Data, a commercial survey of this address. Treat as strong evidence, not as proof — where a confidence is given, it is EagleView's own.");
  L.push("");
  L.push(`Roof area (sloped): ${n(structure.areaSqft, 0)} sq ft = ${n(structure.squares, 1)} squares${conf(confidences, "areaSqft")}`);
  L.push(`Predominant pitch: ${structure.pitch ?? "unknown"}${conf(confidences, "pitch")}`);
  L.push(`Facet count: ${structure.facetCount ?? "unknown"}${conf(confidences, "facetCount")}`);
  L.push(`Overall shape classification: ${structure.shape ?? "unknown"}${conf(confidences, "shape")} — note this names the FORM of the facets (hip / gable / mixed), not how many separate masses the building has.`);
  L.push(`Ground footprint: ${n(structure.footprintSqft, 0)} sq ft${conf(confidences, "footprintSqft")}`);
  if (structure.eaveHeightFt) {
    const parts = Object.entries(structure.eaveHeightFt).map(([k, v]) => `${k} ${n(v as number, 0)} ft`);
    L.push(`Eave height by side: ${parts.join(", ")}${conf(confidences, "eaveHeight")} — sides at DIFFERENT heights usually mean more than one mass.`);
  }
  L.push(`Covering: ${structure.material ?? "unknown"}, condition ${structure.conditionRating ?? "unknown"}, age ${structure.roofAgeYears ?? "unknown"} years`);
  L.push(
    `Rooftop items: chimney ${structure.chimney ?? "unknown"}, solar panels ${structure.solarPanels ?? "unknown"}, rooftop AC units ${structure.rooftopAcCount ?? "unknown"}`,
  );

  L.push("");
  L.push("THE BUILDING OUTLINE, in feet, x east and y north from the centre of the picture:");
  L.push(contour.map((p) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(" "));
  L.push("Use the same coordinates in your answer.");

  if (ours.clusters?.length) {
    L.push("");
    L.push("WHAT WE MEASURED OURSELVES, from aerial elevation data (a height raster, 0.1 m per pixel).");
    L.push("These are planes the elevation fit found. The BEARING is the direction water runs down that plane, in compass degrees. Two planes that meet at a ridge drain in OPPOSITE directions, about 180 degrees apart.");
    for (const c of ours.clusters) {
      L.push(`  plane: ${c.pitch12.toFixed(1)}/12 pitch, drains toward ${c.azimuthDeg.toFixed(0)} degrees, ${c.sqft.toFixed(0)} sq ft`);
    }
    L.push("This is the strongest evidence you have about DIRECTION. Where the picture and these bearings disagree, say so rather than choosing silently.");
  }
  if (ours.coverage != null) {
    L.push("");
    L.push(`The elevation data covers ${(ours.coverage * 100).toFixed(0)}% of this roof. The rest was not measured and the planes above say nothing about it.`);
  }
  if (ours.creases?.length) {
    L.push("");
    L.push("FOLDS FOUND IN A LIDAR POINT CLOUD (independent of the picture and of the height raster):");
    for (const c of ours.creases) {
      L.push(`  ${c.type} from (${c.a.x.toFixed(1)}, ${c.a.y.toFixed(1)}) to (${c.b.x.toFixed(1)}, ${c.b.y.toFixed(1)}), ${c.lengthFt.toFixed(0)} ft long`);
    }
  }
  if (ours.occlusion) {
    L.push("");
    L.push(
      `EagleView reports occlusion "${ours.occlusion.occlusion ?? "unknown"}"${conf(ours.occlusion.confidence, "occlusion")} and tree overhang "${ours.occlusion.treeOverhang ?? "unknown"}"${conf(ours.occlusion.confidence, "treeOverhang")}.`,
    );
  }
  return L.join("\n");
}

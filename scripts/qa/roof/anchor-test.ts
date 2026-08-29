/* Which anchoring works better — the prompt line alone, or line + drawn marker.
 *
 *   npx tsx scripts/qa/roof/anchor-test.ts
 *
 * Both variants on 12629, two runs each (small sample, stated as such — this
 * picks a variant, it does not publish a number). Both get the same everything
 * else: chosen clear frame, crop to the outline +15 ft, full brief, the fixed
 * centre/pin transform. Scored by the proven downhill metric plus one anchoring
 * question the metric cannot see: how far the returned geometry sits from OUR
 * contour (median distance of facet centroids — a reader that drifted to the
 * neighbour drifts by a lot-width, ~50 ft, not by noise).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import { readInstantSurvey } from "@/lib/roofDiagram/instantSurvey";
import { contrastMap, chooseVisionFrame, cropToOutline, drawPinMarker } from "@/lib/roofDiagram/orthoPrep";
import { readRoofLayout } from "@/lib/roofDiagram/roofLayoutVision";
import { scoreClaims, trustedFacetsFor } from "./downhill-lib";

const JOB = { key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" };
const RUNS = 2;

(async () => {
  const base = trustedFacetsFor(JOB);
  if (!base) throw new Error("no trusted facets");
  const { ours, contour, meta, instant } = base;
  const origin = meta.origin;

  // The chosen clear frame, then cropped to the outline.
  const cands = instant.imagery
    .filter((im) => im.view === "ortho" && im.bbox && typeof im.masked === "boolean")
    .map((im) => {
      const wideArea = Math.max(...instant.imagery.filter((x) => x.bbox).map((x) => (x.bbox![2] - x.bbox![0]) * (x.bbox![3] - x.bbox![1])));
      const isWide = (im.bbox![2] - im.bbox![0]) * (im.bbox![3] - im.bbox![1]) === wideArea;
      const file = resolve(".cache/roof-diagram", `pair-12629-${isWide ? "wide" : "tight"}-${im.masked ? "masked" : "clear"}.png`);
      return { token: im.token, masked: im.masked, bbox: im.bbox!, bytes: new Uint8Array(readFileSync(file)) };
    });
  const outline = instant.structures[0].outline!;
  const choice = chooseVisionFrame(cands, origin, outline);
  if (!choice) throw new Error("no clear frame");
  const chosen = cands[choice.index];
  const cropped = cropToOutline(chosen.bytes, chosen.bbox, outline, 15);
  console.log(`frame: ${choice.reason}`);
  console.log(`cropped to outline +15 ft`);

  const survey = readInstantSurvey(instant, origin);
  const planes = ((meta.diagnostics.pitches12 as number[]) ?? []).map((p, i) => ({
    pitch12: p,
    azimuthDeg: (meta.diagnostics.clusterAzimuthDeg as number[] | undefined)?.[i] ?? 0,
    sqft: 0,
  }));

  const ccx = contour.reduce((a, p) => a + p.x, 0) / contour.length;
  const ccy = contour.reduce((a, p) => a + p.y, 0) / contour.length;

  for (const mode of ["prompt", "marker"] as const) {
    // Marker goes on the PHOTO only; the contrast map is built from the clean
    // frame — a bright crosshair would otherwise become the strongest gradient
    // ring on the roof and seed exactly the false lines the map exists to avoid.
    const photo = mode === "marker" ? drawPinMarker(cropped.png, cropped.bbox, origin) : cropped.png;
    const cm = contrastMap(cropped.png);
    console.log(`\n── ${mode} ──`);
    for (let run = 1; run <= RUNS; run++) {
      const t0 = Date.now();
      const read = await readRoofLayout({
        photo,
        contrast: cm.bytes,
        bbox: cropped.bbox,
        origin,
        anchorMode: mode,
        instant,
        structure: instant.structures[0],
        contour,
        ours: {
          clusters: planes.length ? planes : undefined,
          occlusion: survey ? { occlusion: survey.occlusion, treeOverhang: survey.treeOverhang, confidence: survey.confidence } : null,
        },
        confidences: survey?.confidence,
      });
      const t = scoreClaims(read.facets.map((f) => ({ polygon: f.polygon, downhill: f.downhill })), ours);
      const drifts = read.facets.map((f) => {
        const mx = f.polygon.reduce((a, p) => a + p.x, 0) / f.polygon.length;
        const my = f.polygon.reduce((a, p) => a + p.y, 0) / f.polygon.length;
        return Math.hypot(mx - ccx, my - ccy);
      }).sort((a, b) => a - b);
      const medDrift = drifts.length ? drifts[Math.floor(drifts.length / 2)] : NaN;
      console.log(
        `  run ${run}: ${read.facets.length} facets, ${read.lines.length} lines · ` +
          `downhill ${t.within45}/${t.tested} · noHost ${t.noHost} · median centroid drift ${Number.isFinite(medDrift) ? medDrift.toFixed(0) : "—"} ft · ${((Date.now() - t0) / 1000).toFixed(1)}s · anchor: ${read.anchor}`,
      );
    }
  }
})();

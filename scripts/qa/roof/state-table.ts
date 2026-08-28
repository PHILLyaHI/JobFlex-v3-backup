/* What the product actually produces on the six field addresses, today.
 * Frozen inputs, the full V2 path including the crease step, and the same
 * assessment the estimator screen shows. No network beyond the 3DEP bucket.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { buildRoofV2, measureCoverage } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import { detectUnrecognisedFacets } from "@/lib/roofRecon/surgeries";
import { fetchCloud } from "@/lib/roofRecon/lidarCloud";
import { findCreases } from "@/lib/roofRecon/creases";
import { applyCreases } from "@/lib/roofRecon/facetCut";
import { readInstantSurvey } from "@/lib/roofDiagram/instantSurvey";
import { checkCompleteness } from "@/lib/roofRecon/completeness";
import { measureMassSpread, measureClusterSpread } from "@/lib/roofRecon/massSpread";
import { assessRoof } from "@/lib/roofDiagram/confidence";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

interface Job { name: string; dir: string; fixture?: string }
const JOBS: Job[] = [
  { name: "12629 Kirkland", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { name: "12621 Kirkland", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { name: "12618 Kirkland", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { name: "9903 Kirkland", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { name: "419 Prairie IL", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { name: "12117 Snohomish", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa" },
];

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}
const ft = (m: RoofModel, t: string): number => Math.round(m.totals.footageByType?.[t as keyof typeof m.totals.footageByType] ?? 0);
const codes = (m: RoofModel): string[] =>
  [...new Set(validateRoofInvariants(m).results.filter((r) => r.level === "error").map((r) => r.id))];

(async () => {
  console.log("address           facets   area sf   pitch          ridge  hip  valley  rake   coverage  confidence  notes");
  console.log("─".repeat(126));

  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }
    const ground = meta.diagnostics.groundElevFt as number;
    const clusters = (meta.diagnostics.clusters as number) ?? null;
    const first = buildRoofV2({ instant, origin: meta.origin, clusters });
    if (!first.model) { console.log(`${job.name.padEnd(17)} no model`); continue; }
    const kept = first.report.structures.filter((s) => s.ring);

    const transforms = new Map<number, { dxFt: number; dyFt: number; thetaDeg: number }>();
    const perStruct: Array<{ prefix: string; contourSqft: number; share: number | null }> = [];
    const controls: Array<number | null> = [];
    for (const [ki, k] of kept.entries()) {
      const ring = k.ring as FootprintPoint[];
      const reg = registerContourToRaster({ contour: ring, mask, dsm, groundElevFt: ground });
      let share: number | null = null;
      let control: number | null = null;
      if (reg.applied) {
        const rad = (reg.transform.thetaDeg * Math.PI) / 180;
        const moved = ring.map((p) => ({
          x: p.x * Math.cos(rad) - p.y * Math.sin(rad) + reg.transform.dxFt,
          y: p.x * Math.sin(rad) + p.y * Math.cos(rad) + reg.transform.dyFt,
        }));
        const cov = measureCoverage({ mask, dsm, groundElevFt: ground, rings: [moved] });
        share = cov ? (cov.insetShare ?? cov.share) : null;
        control = cov ? cov.share : null;
        if (share != null && share >= 0.7) transforms.set(ki, reg.transform);
      }
      perStruct.push({ prefix: k.designator ?? String.fromCharCode(65 + ki), contourSqft: Math.abs(areaOf(ring)), share });
      controls.push(control);
    }

    let model: RoofModel = first.model;
    let pitchLabel = `${(instant.totals?.predominantPitch ?? 0).toFixed(1)}/12 published`;
    let unrec: Array<{ facet: string; diffDeg: number }> = [];
    let unrecShare: number | null = null;
    let wavefrontNote = "";
    let massNote = "no DSM measurement";
    let mass: ReturnType<typeof measureMassSpread> | null = null;
    let creaseNote = "";
    if (transforms.size) {
      const meas = measurePitchFromDsm({
        model: first.model, mask, dsm,
        transform: transforms.values().next().value!,
        transformFor: (id) => transforms.get(Number(/^s(\d+):/.exec(id)?.[1] ?? 0)) ?? null,
        sectionTolerance12: 0.75,
      });
      const sp = structurePitch(meas, instant.totals?.predominantPitch ?? null, {
        solarPanels: instant.structures.some((s) => s.solarPanels === true),
      });
      pitchLabel = `${sp.pitch12.toFixed(2)}/12 ${sp.source}`;
      model = buildRoofV2({ instant, origin: meta.origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;
      if (kept.length === 1) {
        try {
          const g = tryWavefront({ contour: kept[0].ring as FootprintPoint[], skeletonModel: model, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 });
          if (g.model) { model = g.model; wavefrontNote = "wavefront"; }
        } catch { /* keep */ }
      }
      const idx0 = buildIndexes(model);
      const pts = model.faces.flatMap((f) => ringOf(f.lineIds, idx0) ?? []);
      if (pts.length >= 3) {
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        const got = await fetchCloud({ origin: meta.origin, box: { x0: Math.min(...xs) - 15, x1: Math.max(...xs) + 15, y0: Math.min(...ys) - 15, y1: Math.max(...ys) + 15 } });
        if ("reason" in got) creaseNote = "no lidar";
        else {
          const rep = applyCreases(model, findCreases({ model, cloud: got.cloud.points, groundFt: got.cloud.groundFt }));
          model = rep.model;
          creaseNote = rep.applied.length ? `+${rep.applied.length} fold` : "no fold kept";
        }
      }
      mass = measureMassSpread(meas);
      massNote = mass.reason;
      unrec = detectUnrecognisedFacets(model, meas).map((u) => ({ facet: u.facet, diffDeg: u.diffDeg }));
      const idx = buildIndexes(model);
      let total = 0, bad = 0;
      for (const f of model.faces) {
        const r = ringOf(f.lineIds, idx);
        const a = r && r.length >= 3 ? Math.abs(areaOf(r.map((p) => ({ x: p.x, y: p.y })))) : 0;
        total += a;
        if (unrec.some((u) => u.facet === String(f.designator || f.id))) bad += a;
      }
      unrecShare = total > 0 ? bad / total : null;
    }

    const survey = readInstantSurvey(instant, meta.origin);
    const comp = checkCompleteness({
      model,
      structures: first.report.structures.map((st) => ({
        prefix: st.prefix, ring: st.ring, contourAreaSqft: st.contourAreaSqft,
        ...(st.nestedIn ? { nestedIn: st.nestedIn } : {}),
      })),
      synthesizeFailed: first.report.synthesizeFailed,
      instant,
      facetCountConfidence: survey?.confidence?.facetCount ?? null,
    });
    const aggregate = perStruct.filter((s) => s.share != null);
    const covShare = aggregate.length
      ? aggregate.reduce((s, x) => s + (x.share as number) * x.contourSqft, 0) / aggregate.reduce((s, x) => s + x.contourSqft, 0)
      : null;
    const ctrlPairs = perStruct.map((x, i) => ({ w: x.contourSqft, v: controls[i] })).filter((x) => x.v != null);
    const ctrlShare = ctrlPairs.length
      ? ctrlPairs.reduce((s2, x) => s2 + (x.v as number) * x.w, 0) / ctrlPairs.reduce((s2, x) => s2 + x.w, 0)
      : null;
    const a = assessRoof({
      coverage: covShare == null ? null : { seenSqft: 0, contourSqft: 0, share: ctrlShare ?? covShare, insetShare: covShare },
      structures: perStruct,
      errorCodes: codes(model),
      unrecognisedFacets: unrec,
      unrecognisedShare: unrecShare,
      completeness: { findings: comp.findings, facetDeficitShare: comp.facetDeficitShare },
      instantOcclusion: survey ? {
        occlusion: survey.occlusion, treeOverhang: survey.treeOverhang,
        occlusionConfidence: survey.confidence?.occlusion ?? null,
        overhangConfidence: survey.confidence?.treeOverhang ?? null,
      } : null,
    });

    console.log(
      `${job.name.padEnd(17)} ${String(model.faces.length).padStart(5)} ${String(Math.round(model.totals.areaSqft)).padStart(9)} ` +
      `${pitchLabel.padEnd(15)} ${String(ft(model, "RIDGE")).padStart(4)} ${String(ft(model, "HIP")).padStart(5)} ${String(ft(model, "VALLEY")).padStart(6)} ${String(ft(model, "RAKE")).padStart(5)}  ` +
      `${(covShare == null ? " n/a" : `${Math.round(covShare * 100)}/${ctrlShare == null ? "?" : Math.round(ctrlShare * 100)}%`).padStart(9)}  ${a.confidence.padEnd(9)}  ` +
      [wavefrontNote, creaseNote, unrecShare != null ? `${Math.round(unrecShare * 100)}% unrecognised` : "", a.footageReliable ? "" : "footage flagged"].filter(Boolean).join(" · "),
    );
    console.log(
      `${" ".repeat(18)}completeness: ${comp.structuresDrawn}/${comp.structuresIn} structures · plan ${Math.round(comp.planSqft)} vs contour ${Math.round(comp.contourSqft)} sq ft ` +
      `(${comp.planShortfallPct >= 0 ? "-" : "+"}${Math.abs(comp.planShortfallPct).toFixed(1)}%) · facet deficit ${comp.facetDeficit ?? "n/a"}` +
      `${comp.facetDeficitShare != null ? ` (${Math.round(comp.facetDeficitShare * 100)}%)` : ""}`,
    );
    for (const f of comp.findings) console.log(`${" ".repeat(18)}${f.level.toUpperCase()} ${f.code}: ${f.message}`);
    const cl = measureClusterSpread((meta.diagnostics.pitches12 as number[]) ?? [], (meta.diagnostics.clusterSqft as number[]) ?? []);
    console.log(
      `${" ".repeat(18)}mass spread — over OUR facets: ${mass ? (mass.multiMass ? "MULTI" : "single") : "—"} · ` +
      `over RECON CLUSTERS: ${cl.multiMass ? "MULTI-MASS" : "single"} — ${cl.reason}`,
    );
    console.log(`${" ".repeat(18)}   Instant shape ${instant.structures[0]?.shape ?? "?"} · ${instant.totals?.facetCount ?? "?"} facets vs our ${model.faces.length}`);
    if (a.reasons.length) console.log(`${" ".repeat(18)}“${a.reasons[0]}”`);
  }
})();

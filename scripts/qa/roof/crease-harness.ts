/* Acceptance for the lidar crease step, on frozen inputs.
 *
 * Criteria, as agreed: Euler 1, tiling under half a percent, no R03/R04,
 * footage before and after, not one height-rejected crease in the model, and
 * 12629 does not gain a second valley.
 *
 * Free: the 3DEP nodes are cached under .cache/lidar from the measurement runs;
 * a cold run refetches them from the public bucket at no cost.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import { fetchCloud } from "@/lib/roofRecon/lidarCloud";
import { findCreases } from "@/lib/roofRecon/creases";
import { applyCreases, planAreaOf } from "@/lib/roofRecon/facetCut";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

interface Job { name: string; dir: string; fixture?: string }
const JOBS: Job[] = [
  { name: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { name: "419 Prairie", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { name: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { name: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { name: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { name: "12117 farm", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa" },
];

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}
const euler = (m: RoofModel): number =>
  new Set(m.points.map((p) => p.id)).size - new Set(m.lines.map((l) => l.id)).size + m.faces.length;
const codes = (m: RoofModel): string[] =>
  [...new Set(validateRoofInvariants(m).results.filter((r) => r.level === "error").map((r) => r.id))];
const ft = (m: RoofModel, t: string): number => Math.round(m.totals.footageByType?.[t as keyof typeof m.totals.footageByType] ?? 0);

(async () => {
  let failures = 0;
  console.log("address       facets  Euler  tiling%  errors            ridge      hip     valley    rake");
  console.log("─".repeat(104));

  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }
    const ground = meta.diagnostics.groundElevFt as number;
    const clusters = (meta.diagnostics.clusters as number) ?? null;
    const first = buildRoofV2({ instant, origin: meta.origin, clusters });
    if (!first.model) { console.log(`${job.name}: no model`); continue; }
    const kept = first.report.structures.filter((s) => s.ring);
    const contour = kept[0].ring as FootprintPoint[];
    const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: ground });
    let model: RoofModel = first.model;
    if (reg.applied) {
      const meas = measurePitchFromDsm({ model: first.model, mask, dsm, transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75 });
      const sp = structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: instant.structures.some((s) => s.solarPanels === true) });
      model = buildRoofV2({ instant, origin: meta.origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;
      if (kept.length === 1) {
        try { const g = tryWavefront({ contour, skeletonModel: model, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 }); if (g.model) model = g.model; } catch { /* keep */ }
      }
    }

    const idx = buildIndexes(model);
    const xs = model.faces.flatMap((f) => (ringOf(f.lineIds, idx) ?? []).map((p) => p.x));
    const ys = model.faces.flatMap((f) => (ringOf(f.lineIds, idx) ?? []).map((p) => p.y));
    const got = await fetchCloud({
      origin: meta.origin,
      box: { x0: Math.min(...xs) - 15, x1: Math.max(...xs) + 15, y0: Math.min(...ys) - 15, y1: Math.max(...ys) + 15 },
    });
    if ("reason" in got) { console.log(`${job.name.padEnd(13)} no lidar — ${got.reason}`); continue; }

    const before = { euler: euler(model), codes: codes(model), faces: model.faces.length, ridge: ft(model, "RIDGE"), hip: ft(model, "HIP"), valley: ft(model, "VALLEY"), rake: ft(model, "RAKE"), plan: planAreaOf(model) };
    const cands = findCreases({ model, cloud: got.cloud.points, groundFt: got.cloud.groundFt });
    const rep = applyCreases(model, cands);
    const outline = Math.abs(areaOf(contour));
    const tiling = outline > 0 ? ((planAreaOf(rep.model) - outline) / outline) * 100 : 0;
    const after = { euler: euler(rep.model), codes: codes(rep.model), faces: rep.model.faces.length };
    const bad = after.codes.filter((c) => c === "R03" || c === "R04");

    console.log(
      `${job.name.padEnd(13)} ${String(before.faces).padStart(3)}→${String(after.faces).padEnd(3)} ${String(after.euler).padStart(5)} ` +
      `${tiling.toFixed(2).padStart(8)} ${after.codes.join(",").padEnd(16)}  ` +
      `${String(before.ridge).padStart(3)}→${String(ft(rep.model, "RIDGE")).padEnd(4)} ${String(before.hip).padStart(3)}→${String(ft(rep.model, "HIP")).padEnd(4)} ` +
      `${String(before.valley).padStart(3)}→${String(ft(rep.model, "VALLEY")).padEnd(4)} ${String(before.rake).padStart(3)}→${String(ft(rep.model, "RAKE")).padEnd(4)}`,
    );
    console.log(`${" ".repeat(14)}cloud ${got.cloud.project} · ${got.cloud.points.length.toLocaleString()} pts · ${got.cloud.nodes} nodes · ${(got.cloud.bytes / 1e6).toFixed(1)} MB · ${got.cloud.ms} ms`);
    for (const a of rep.applied) console.log(`${" ".repeat(14)}CUT  ${a.facet} → ${a.type} ${a.lengthFt.toFixed(0)} ft (bend ${a.bendDeg.toFixed(0)}°)`);
    for (const r of rep.refused) console.log(`${" ".repeat(14)}skip ${r.facet}: ${r.reason}`);

    // ── the criteria ──
    const check = (ok: boolean, what: string) => { if (!ok) { failures++; console.log(`${" ".repeat(14)}FAIL ${what}`); } };
    check(after.euler === 1, `Euler is ${after.euler}, not 1`);
    check(Math.abs(tiling) < 0.5, `tiling ${tiling.toFixed(2)}% is not under 0.5%`);
    check(bad.length === 0, `R03/R04 present: ${bad.join(",")}`);
    check(after.euler === before.euler, `Euler moved ${before.euler} → ${after.euler}`);
    const rejectedApplied = rep.applied.filter((a) => cands.find((c) => c.facetLabel === a.facet)?.refused);
    check(rejectedApplied.length === 0, `${rejectedApplied.length} height-rejected crease(s) reached the model`);
    if (job.name === "12629") {
      const valleyAdded = rep.applied.filter((a) => a.type === "VALLEY").length;
      check(valleyAdded === 0, `12629 gained ${valleyAdded} valley(s) — the owner's trace says there is only one`);
    }
  }
  console.log(failures ? `\nCREASE HARNESS: ${failures} failure(s)` : "\nCREASE HARNESS: all criteria met");
  process.exit(failures ? 1 : 0);
})();

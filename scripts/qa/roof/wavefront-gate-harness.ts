/* The gate on every field address, before it goes near the product.
   Before/after table: facets, rake, hip, ridge, valley, Euler, tiling, area. */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import type { InstantRoofData, RoofModel, EvLineType } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { buildRoofV2, measureCoverage } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { tryWavefront } from "@/lib/roofRecon/wavefrontGate";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "@/../scripts/qa/roof/fixture";

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}
const euler = (m: RoofModel) => new Set(m.points.map((p) => p.id)).size - new Set(m.lines.map((l) => l.id)).size + m.faces.length;
const planArea = (m: RoofModel) => {
  const idx = buildIndexes(m);
  return m.faces.reduce((s, f) => {
    const r = ringOf(f.lineIds, idx);
    return s + (r && r.length >= 3 ? Math.abs(areaOf(r.map((p) => ({ x: p.x, y: p.y })))) : 0);
  }, 0);
};
const ft = (m: RoofModel, t: EvLineType) => Math.round(m.totals.footageByType?.[t] ?? 0);
const codes = (m: RoofModel) => [...new Set(validateRoofInvariants(m).results.filter((r) => r.level === "error").map((r) => r.id))].join(",") || "none";

interface H { name: string; meta: FixtureMeta; instant: InstantRoofData; dsm: Raster; mask: Raster; bbox?: [number, number, number, number] }
const houses: H[] = [];
{
  const fx = loadFixture("kirkland-12629-ne-100th-pl");
  houses.push({ name: "12629", meta: fx.meta, dsm: fx.dsm, mask: fx.mask, bbox: [-122.17211430233286, 47.68990041722422, -122.17175936966714, 47.690156240332854],
    instant: JSON.parse(readFileSync(resolve("scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl/instant.json"), "utf8")) as InstantRoofData });
  const fp = loadFixture("prairie-419-prairie-ridge-ln");
  houses.push({ name: "419 Prairie", meta: fp.meta, dsm: fp.dsm, mask: fp.mask,
    instant: JSON.parse(readFileSync(resolve("scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln/instant.json"), "utf8")) as InstantRoofData });
}
for (const [name, slug, bbox] of [
  ["12621", "12621-ne-100th-pl-kirkland-wa", [-122.17236228373353, 47.689942417786945, -122.17200644858328, 47.69022762441673]],
  ["12618", "12618-ne-100th-st-kirkland-wa", [-122.17245624798346, 47.689596736016526, -122.1721397772851, 47.68990131698347]],
  ["9903", "9903-117th-pl-ne-kirkland-wa", null],
  ["12117 farm", "12117-202nd-st-se-snohomish-wa", null],
] as const) {
  const dir = resolve("scripts/qa/roof/field", slug);
  if (!existsSync(resolve(dir, "meta.json"))) continue;
  const meta = JSON.parse(readFileSync(resolve(dir, "meta.json"), "utf8")) as FixtureMeta;
  houses.push({ name, meta, dsm: rasterFrom(resolve(dir, "dsm.f32.gz"), meta), mask: rasterFrom(resolve(dir, "mask.f32.gz"), meta),
    instant: JSON.parse(readFileSync(resolve(dir, "instant.json"), "utf8")) as InstantRoofData,
    ...(bbox ? { bbox: bbox as [number, number, number, number] } : {}) });
}

const OUT = "C:/Users/ivana/AppData/Local/Temp/claude/c--Projects-JobFlex-v3-copy/bec08b63-5287-469f-bc7f-4dd8e0e0f3dc/scratchpad";
import { writeFileSync } from "node:fs";
const FT_PER_M = 3.28084, EARTH = 6378137, D2R = Math.PI / 180;
function overlay(name: string, bbox: [number, number, number, number], model: RoofModel, origin: { lat: number; lng: number }, tag: string) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const W = 900;
  const H2 = Math.round((W * (maxLat - minLat)) / ((maxLon - minLon) * Math.cos(origin.lat * D2R)));
  const px = (p: { x: number; y: number }) => {
    const lat = origin.lat + p.y / FT_PER_M / EARTH / D2R;
    const lng = origin.lng + p.x / FT_PER_M / (EARTH * Math.cos(origin.lat * D2R)) / D2R;
    return [((lng - minLon) / (maxLon - minLon)) * W, ((maxLat - lat) / (maxLat - minLat)) * H2];
  };
  const pById = new Map(model.points.map((p) => [p.id, p]));
  const COLOR: Record<string, string> = { RIDGE: "#00e676", HIP: "#ff9100", VALLEY: "#2979ff", RAKE: "#e040fb", EAVE: "#eceff1", OTHER: "#f00" };
  const svg = model.lines.map((l) => {
    const a = px(pById.get(l.aId)!);
    const b = px(pById.get(l.bId)!);
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${COLOR[l.type] ?? "#f00"}" stroke-width="${l.type === "EAVE" ? 1.6 : 3}"/>`;
  }).join("");
  writeFileSync(resolve(OUT, `gate-${name}-${tag}.html`),
    `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111">
<div style="color:#eee;font:13px monospace;padding:6px">${name} ${tag.toUpperCase()} — <span style="color:#00e676">ridge</span> · <span style="color:#ff9100">hip</span> · <span style="color:#2979ff">valley</span> · <span style="color:#e040fb">rake</span> · <span style="color:#eceff1">eave</span></div>
<div style="position:relative;width:${W}px;height:${H2}px"><img src="ortho-${name}.png" style="width:${W}px;height:${H2}px;display:block"/>
<svg style="position:absolute;inset:0" width="${W}" height="${H2}">${svg}</svg></div></body>`);
}

console.log("house         engine      facets  ridge   hip  valley   rake   eave  euler  tiling%   area   errors");
console.log("─".repeat(112));
for (const h of houses) {
  const ground = h.meta.diagnostics.groundElevFt as number;
  const clusters = (h.meta.diagnostics.clusters as number) ?? null;
  const first = buildRoofV2({ instant: h.instant, origin: h.meta.origin, clusters });
  if (!first.model) { console.log(`${h.name}: no model`); continue; }
  const kept = first.report.structures.filter((s) => s.ring);
  const transforms = new Map<number, { dxFt: number; dyFt: number; thetaDeg: number }>();
  for (const [ki, k] of kept.entries()) {
    const reg = registerContourToRaster({ contour: k.ring as FootprintPoint[], mask: h.mask, dsm: h.dsm, groundElevFt: ground });
    if (!reg.applied) continue;
    const rad = (reg.transform.thetaDeg * Math.PI) / 180;
    const moved = (k.ring as FootprintPoint[]).map((pt) => ({
      x: pt.x * Math.cos(rad) - pt.y * Math.sin(rad) + reg.transform.dxFt,
      y: pt.x * Math.sin(rad) + pt.y * Math.cos(rad) + reg.transform.dyFt,
    }));
    const cov = measureCoverage({ mask: h.mask, dsm: h.dsm, groundElevFt: ground, rings: [moved] });
    if (cov && cov.share >= 0.7) transforms.set(ki, reg.transform);
  }
  const line = (m: RoofModel, engine: string, outline: number) => {
    const pa = planArea(m);
    console.log(
      `${h.name.padEnd(13)} ${engine.padEnd(11)} ${String(m.faces.length).padStart(5)} ${String(ft(m, "RIDGE")).padStart(6)} ${String(ft(m, "HIP")).padStart(5)} ` +
        `${String(ft(m, "VALLEY")).padStart(6)} ${String(ft(m, "RAKE")).padStart(6)} ${String(ft(m, "EAVE")).padStart(6)} ${String(euler(m)).padStart(5)} ` +
        `${(outline > 0 ? ((pa - outline) / outline) * 100 : 0).toFixed(2).padStart(8)} ${String(Math.round(m.totals.areaSqft)).padStart(6)}   ${codes(m)}`,
    );
  };
  if (!transforms.size) { line(first.model, "skeleton", Math.abs(areaOf(kept[0].ring as FootprintPoint[]))); console.log(`${" ".repeat(14)}(no registration — gate not attempted)`); continue; }
  const meas = measurePitchFromDsm({
    model: first.model, mask: h.mask, dsm: h.dsm,
    transform: transforms.values().next().value!,
    transformFor: (id) => transforms.get(Number(/^s(\d+):/.exec(id)?.[1] ?? 0)) ?? null,
    sectionTolerance12: 0.75,
  });
  const sp = structurePitch(meas, h.instant.totals?.predominantPitch ?? null, {
    solarPanels: h.instant.structures.some((st) => st.solarPanels === true),
  });
  const skel = buildRoofV2({ instant: h.instant, origin: h.meta.origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;
  const contour = kept[0].ring as FootprintPoint[];
  const outline = Math.abs(areaOf(contour));
  line(skel, "skeleton", outline);
  if (kept.length !== 1) { console.log(`${" ".repeat(14)}(${kept.length} structures — gate is single-structure only)`); continue; }
  const gate = tryWavefront({ contour, skeletonModel: skel, measurement: meas, structurePitch12: sp.pitch12, structureIndex: 0 });
  if (gate.model) {
    line(gate.model, "WAVEFRONT", outline);
    console.log(`${" ".repeat(14)}carriers ${gate.carriers.join(",")} · gable edges ${gate.gableEdges.join(",")} · classes ${gate.slopeClasses.map((c) => `${c.pitch12.toFixed(2)}×${c.edges}`).join(" ")}`);
    if (h.bbox) { overlay(h.name, h.bbox, skel, h.meta.origin, "skeleton"); overlay(h.name, h.bbox, gate.model, h.meta.origin, "wavefront"); }
  } else {
    console.log(`${" ".repeat(14)}wavefront REFUSED: ${gate.refused}`);
  }
}

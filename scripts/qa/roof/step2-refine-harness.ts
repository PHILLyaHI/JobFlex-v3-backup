/* Step 2 dry run: refine 12629 / 12621 / 12618 / 9903 / Prairie, print merge
   reports, Euler + tiling before/after, footage before/after, and overlays. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* optional */ }
}
import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { buildRoofV2, measureCoverage } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "@/lib/roofRecon/pitchFromDsm";
import { refineModelWithClusters } from "@/lib/roofRecon/refineClusters";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import { validateRoofInvariants } from "@/lib/roofDiagram/validate";
import { loadFixture, type FixtureMeta } from "@/../scripts/qa/roof/fixture";

const OUT = "C:/Users/ivana/AppData/Local/Temp/claude/c--Projects-JobFlex-v3-copy/bec08b63-5287-469f-bc7f-4dd8e0e0f3dc/scratchpad";
const FT_PER_M = 3.28084, EARTH = 6378137, D2R = Math.PI / 180;

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

function euler(model: RoofModel): number {
  const pk = new Set(model.points.map((p) => p.id));
  const ek = new Set(model.lines.map((l) => l.id));
  return pk.size - ek.size + model.faces.length;
}
function planStats(model: RoofModel) {
  const idx = buildIndexes(model);
  const rings = model.faces
    .map((f) => ringOf(f.lineIds, idx))
    .filter((r): r is NonNullable<typeof r> => !!r && r.length >= 3)
    .map((r) => r.map((p) => ({ x: p.x, y: p.y })));
  return { plan: rings.reduce((s, r) => s + Math.abs(areaOf(r)), 0), rings: rings.length };
}
function areaIdentity(model: RoofModel): number {
  // Σ(face area / slope factor) vs Σ plan rings — the H3 identity, %
  const idx = buildIndexes(model);
  let planFromAreas = 0, planFromRings = 0;
  for (const f of model.faces) {
    const sf = Math.sqrt(1 + (f.pitch / 12) ** 2);
    planFromAreas += f.areaSqft / sf;
    const r = ringOf(f.lineIds, idx);
    if (r && r.length >= 3) planFromRings += Math.abs(areaOf(r.map((p) => ({ x: p.x, y: p.y }))));
  }
  return planFromRings > 0 ? (Math.abs(planFromAreas - planFromRings) / planFromRings) * 100 : 100;
}
const foot = (m: RoofModel) =>
  (["RIDGE", "HIP", "VALLEY", "RAKE", "EAVE"] as const).map((t) => `${t.toLowerCase()} ${(m.totals.footageByType[t] ?? 0).toFixed(0)}`).join(" · ");

interface H { name: string; meta: FixtureMeta; instant: InstantRoofData; dsm: Raster; mask: Raster }
function loadField(name: string, slug: string): H {
  const dir = resolve("scripts/qa/roof/field", slug);
  const meta = JSON.parse(readFileSync(resolve(dir, "meta.json"), "utf8")) as FixtureMeta;
  const instant = JSON.parse(readFileSync(resolve(dir, "instant.json"), "utf8")) as InstantRoofData;
  return { name, meta, instant, dsm: rasterFrom(resolve(dir, "dsm.f32.gz"), meta), mask: rasterFrom(resolve(dir, "mask.f32.gz"), meta) };
}
function loadFix(name: string, slug: string): H {
  const fx = loadFixture(slug);
  const instant = JSON.parse(readFileSync(resolve("scripts/qa/roof/fixtures", slug, "instant.json"), "utf8")) as InstantRoofData;
  return { name, meta: fx.meta, instant, dsm: fx.dsm, mask: fx.mask };
}

function run(h: H): { refined: RoofModel; origin: { lat: number; lng: number } } | null {
  const ground = h.meta.diagnostics.groundElevFt as number;
  const clusters = (h.meta.diagnostics.clusters as number) ?? null;
  const first = buildRoofV2({ instant: h.instant, origin: h.meta.origin, clusters });
  if (!first.model) { console.log(`\n=== ${h.name}: no model`); return null; }
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
  if (!transforms.size) { console.log(`\n=== ${h.name}: no registrations — untouched`); return null; }
  const sIdx = (id: string) => { const m = /^s(\d+):/.exec(id); return m ? Number(m[1]) : 0; };
  const meas = measurePitchFromDsm({
    model: first.model, mask: h.mask, dsm: h.dsm,
    transform: transforms.values().next().value!,
    transformFor: (id) => transforms.get(sIdx(id)) ?? null,
    sectionTolerance12: 0.75,
  });
  const sp = structurePitch(meas, h.instant.totals?.predominantPitch ?? null, {
    solarPanels: h.instant.structures.some((st) => st.solarPanels === true),
  });
  const rebuilt = buildRoofV2({ instant: h.instant, origin: h.meta.origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;

  if (sp.source !== "measured") { console.log(`
=== ${h.name}: pitch source ${sp.source} — refinement skipped (panels or unmeasurable)`); return null; }
  const before = planStats(rebuilt);
  const res = refineModelWithClusters({
    model: rebuilt,
    measurement: meas,
    registeredStructures: new Set(transforms.keys()),
    structurePitch12: sp.pitch12,
    structureRings: new Map(kept.map((k, i) => [i, k.ring as FootprintPoint[]])),
    debugSink: (info) => {
      if (!process.env.REGIONS) return;
      const xs = info.outline.map((pp) => pp.x), ys = info.outline.map((pp) => pp.y);
      const [x0, x1, y0, y1] = [Math.min(...xs) - 3, Math.max(...xs) + 3, Math.min(...ys) - 3, Math.max(...ys) + 3];
      const W2 = 900, H3 = Math.round((W2 * (y1 - y0)) / (x1 - x0));
      const P = (pp: FootprintPoint) => `${(((pp.x - x0) / (x1 - x0)) * W2).toFixed(1)},${((1 - (pp.y - y0) / (y1 - y0)) * H3).toFixed(1)}`;
      const HUES = [0, 120, 210, 45, 285, 165, 330, 90, 240, 15, 135, 300, 60, 180];
      let svg = `<polygon points="${info.outline.map(P).join(" ")}" fill="none" stroke="#000" stroke-width="2"/>`;
      for (const r of info.regions) {
        svg += `<polygon points="${r.ring.map(P).join(" ")}" fill="hsl(${HUES[r.wedge % HUES.length]} 85% 60%)" fill-opacity="0.5" stroke="#333" stroke-width="0.7"/>`;
        const cx = r.ring.reduce((s2, pp) => s2 + pp.x, 0) / r.ring.length;
        const cy = r.ring.reduce((s2, pp) => s2 + pp.y, 0) / r.ring.length;
        svg += `<text x="${P({ x: cx, y: cy }).split(",")[0]}" y="${P({ x: cx, y: cy }).split(",")[1]}" font-size="11" font-family="monospace" text-anchor="middle">${info.wedges[r.wedge].label}</text>`;
      }
      for (const [wi, w] of info.wedges.entries()) {
        const a = { x: w.anchor.x + w.tmin * w.dir.x, y: w.anchor.y + w.tmin * w.dir.y };
        const b = { x: w.anchor.x + w.tmax * w.dir.x, y: w.anchor.y + w.tmax * w.dir.y };
        svg += `<line x1="${P(a).split(",")[0]}" y1="${P(a).split(",")[1]}" x2="${P(b).split(",")[0]}" y2="${P(b).split(",")[1]}" stroke="hsl(${HUES[wi % HUES.length]} 85% 40%)" stroke-width="3" stroke-dasharray="6 3"/>`;
      }
      const fn = resolve(OUT, `regions-${h.name}-${info.prefix}.svg`);
      writeFileSync(fn, `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H3}"><rect width="100%" height="100%" fill="#fff"/>${svg}<text x="6" y="14" font-size="12" font-family="monospace">${info.stopped ?? "ok"}</text></svg>`);
      console.log(`  regions svg: ${fn}`);
    },
  });
  const after = planStats(res.model);
  console.log(`\n=== ${h.name} ===`);
  for (const r of res.report) {
    console.log(
      `  structure ${r.prefix}: source=${r.source} · facets ${r.facetsBefore}→${r.facetsAfter}` +
        (r.merges.length ? ` · merges: ${r.merges.map((m) => `[${m.cluster.join("+")}]@${m.pitch12.toFixed(2)}`).join(" ")}` : "") +
        (r.gables.length ? ` · gables: ${r.gables.join(",")}` : "") +
        (r.stopped ? ` · STOPPED: ${r.stopped}` : ""),
    );
  }
  const rep = validateRoofInvariants(res.model);
  console.log(
    `  euler ${euler(res.model)} · plan ${before.plan.toFixed(0)}→${after.plan.toFixed(0)} sq ft (Δ${(((after.plan - before.plan) / before.plan) * 100).toFixed(2)}%) · ` +
      `areaIdentity ${areaIdentity(res.model).toFixed(3)}% · errors [${[...new Set(rep.results.filter((x) => x.level === "error").map((x) => x.id))].join(",")}]`,
  );
  if (process.env.CRACKS) {
    const owners2 = new Map<string, number>();
    for (const f of res.model.faces) for (const lid of f.lineIds) owners2.set(lid, (owners2.get(lid) ?? 0) + 1);
    const pById = new Map(res.model.points.map((pp) => [pp.id, pp]));
    let cracks = 0;
    for (const l of res.model.lines) {
      if ((owners2.get(l.id) ?? 0) !== 1) continue;
      const a = pById.get(l.aId)!, b = pById.get(l.bId)!;
      cracks++;
      if (cracks <= 10) console.log(`    1-owner ${l.type} (${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(3)})→(${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(3)}) len ${l.lengthFt.toFixed(2)}`);
    }
    console.log(`    single-owner lines: ${cracks} of ${res.model.lines.length} · V=${res.model.points.length} E=${res.model.lines.length} F=${res.model.faces.length}`);
    const byXY = new Map<string, number[]>();
    for (const pp of res.model.points) {
      const k = `${Math.round(pp.x * 100)}|${Math.round(pp.y * 100)}`;
      const arr = byXY.get(k) ?? [];
      arr.push(pp.z);
      byXY.set(k, arr);
    }
    let zsplits = 0;
    for (const [k, zs] of byXY) {
      if (zs.length > 1) { zsplits++; if (zsplits <= 6) console.log(`    z-split at ${k}: z = ${zs.map((z) => z.toFixed(3)).join(", ")}`); }
    }
    console.log(`    XY positions carrying >1 point: ${zsplits}`);
  }
  console.log(`  footage before: ${foot(rebuilt)}`);
  console.log(`  footage after:  ${foot(res.model)}`);
  return { refined: res.model, origin: h.meta.origin };
}

function overlay(name: string, bbox: [number, number, number, number], model: RoofModel, origin: { lat: number; lng: number }) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const W = 900;
  const H2 = Math.round((W * (maxLat - minLat)) / ((maxLon - minLon) * Math.cos(origin.lat * D2R)));
  const px = (p: { x: number; y: number }) => {
    const lat = origin.lat + p.y / FT_PER_M / EARTH / D2R;
    const lng = origin.lng + p.x / FT_PER_M / (EARTH * Math.cos(origin.lat * D2R)) / D2R;
    return `${(((lng - minLon) / (maxLon - minLon)) * W).toFixed(1)},${(((maxLat - lat) / (maxLat - minLat)) * H2).toFixed(1)}`;
  };
  const pById = new Map(model.points.map((p) => [p.id, p]));
  const COLOR: Record<string, string> = { RIDGE: "#00e676", HIP: "#ff9100", VALLEY: "#2979ff", RAKE: "#e040fb", EAVE: "#eceff1", OTHER: "#f00" };
  const svg = model.lines
    .map((l) => {
      const a = pById.get(l.aId)!;
      const b = pById.get(l.bId)!;
      return `<line x1="${px(a).split(",")[0]}" y1="${px(a).split(",")[1]}" x2="${px(b).split(",")[0]}" y2="${px(b).split(",")[1]}" stroke="${COLOR[l.type] ?? "#f00"}" stroke-width="${l.type === "EAVE" ? 1.6 : 2.6}"/>`;
    })
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111">
<div style="color:#eee;font:13px monospace;padding:6px">${name} REFINED — <span style="color:#00e676">ridge</span> · <span style="color:#ff9100">hip</span> · <span style="color:#2979ff">valley</span> · <span style="color:#e040fb">rake</span> · <span style="color:#eceff1">eave</span></div>
<div style="position:relative;width:${W}px;height:${H2}px"><img src="ortho-${name}.png" style="width:${W}px;height:${H2}px;display:block"/>
<svg style="position:absolute;inset:0" width="${W}" height="${H2}">${svg}</svg></div></body>`;
  writeFileSync(resolve(OUT, `step2-${name}.html`), html);
  console.log(`  overlay: step2-${name}.html`);
}

const r12629 = run(loadFix("12629", "kirkland-12629-ne-100th-pl"));
if (r12629) overlay("12629", [-122.17211430233286, 47.68990041722422, -122.17175936966714, 47.690156240332854], r12629.refined, r12629.origin);
const r419 = run(loadFix("419", "prairie-419-prairie-ridge-ln"));
if (r419) overlay("419", [-88.33661005361111, 41.81397275209825, -88.33623487329287, 41.81425098847802], r419.refined, r419.origin);
run(loadField("12621", "12621-ne-100th-pl-kirkland-wa"));
run(loadField("12618", "12618-ne-100th-st-kirkland-wa"));
run(loadField("9903", "9903-117th-pl-ne-kirkland-wa"));
run(loadField("12117", "12117-202nd-st-se-snohomish-wa"));

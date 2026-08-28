/* Step 3: the weighted wavefront on live houses. Order per the plan:
   12621 first (simplest carrier), then 12629 (the five-candidate knot).
   Prints per house: edge slopes chosen, facets before/after, Euler, tiling,
   area identity, validator codes, footage table, and writes overlays. */
import { loadHarnessEnv } from "./env";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
loadHarnessEnv();
import type { InstantRoofData, RoofModel } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { buildRoofV2, measureCoverage } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch, DSM_NOISE_FLOOR_FT, MIN_TRUSTED_SQFT, type PitchMeasurement } from "@/lib/roofRecon/pitchFromDsm";
import { CLUSTER_AZ_TOL_DEG, GABLE_MIN_DEG } from "@/lib/roofRecon/refineClusters";
import { weightedSkeleton } from "@/lib/roofRecon/weightedWavefront";
import { modelFromWavefront } from "@/lib/roofRecon/wavefrontModel";
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
const azDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};
function euler(model: RoofModel): number {
  return new Set(model.points.map((p) => p.id)).size - new Set(model.lines.map((l) => l.id)).size + model.faces.length;
}
function areaIdentity(model: RoofModel): number {
  const idx = buildIndexes(model);
  let a = 0, r = 0;
  for (const f of model.faces) {
    a += f.areaSqft / Math.sqrt(1 + (f.pitch / 12) ** 2);
    const rr = ringOf(f.lineIds, idx);
    if (rr && rr.length >= 3) r += Math.abs(areaOf(rr.map((p) => ({ x: p.x, y: p.y }))));
  }
  return r > 0 ? (Math.abs(a - r) / r) * 100 : 100;
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

interface FacetInfo { label: string; ring: Array<{ x: number; y: number; z: number }>; plan: FootprintPoint[]; area: number; dsmAz: number | null; dsmPitch: number | null; trusted: boolean; drainAz: number }

function facetInfos(model: RoofModel, meas: PitchMeasurement): FacetInfo[] {
  const byLabel = new Map(meas.facets.map((f) => [f.id, f]));
  const idx = buildIndexes(model);
  const out: FacetInfo[] = [];
  for (const f of model.faces) {
    const r = ringOf(f.lineIds, idx);
    if (!r || r.length < 3) continue;
    // drain azimuth from the facet plane (normal equations)
    let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
    for (const p of r) { sx += p.x; sy += p.y; sz += p.z; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y; sxz += p.x * p.z; syz += p.y * p.z; }
    const nn = r.length;
    const den = sxx * (syy * nn - sy * sy) - sxy * (sxy * nn - sy * sx) + sx * (sxy * sy - syy * sx);
    let a = 0, b = 0;
    if (Math.abs(den) > 1e-9) {
      a = (sxz * (syy * nn - sy * sy) - sxy * (syz * nn - sy * sz) + sx * (syz * sy - syy * sz)) / den;
      b = (sxx * (syz * nn - sz * sy) - sxz * (sxy * nn - sx * sy) + sx * (sxy * sz - syz * sx)) / den;
    }
    const label = String(f.designator || f.id);
    const m = byLabel.get(label);
    out.push({
      label,
      ring: r.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      plan: r.map((p) => ({ x: p.x, y: p.y })),
      area: Math.abs(areaOf(r.map((p) => ({ x: p.x, y: p.y })))),
      dsmAz: m ? m.azimuthDeg : null,
      dsmPitch: m ? m.pitch12 : null,
      trusted: !!m && m.residualP50Ft <= DSM_NOISE_FLOOR_FT,
      drainAz: ((Math.atan2(-a, -b) * 180) / Math.PI + 360) % 360,
    });
  }
  return out;
}

function run(h: H): { model: RoofModel; origin: { lat: number; lng: number } } | null {
  const ground = h.meta.diagnostics.groundElevFt as number;
  const clusters = (h.meta.diagnostics.clusters as number) ?? null;
  const first = buildRoofV2({ instant: h.instant, origin: h.meta.origin, clusters });
  if (!first.model) { console.log(`\n=== ${h.name}: no model`); return null; }
  const kept = first.report.structures.filter((s) => s.ring);
  if (kept.length !== 1) { console.log(`\n=== ${h.name}: ${kept.length} structures — single-structure harness only`); return null; }
  const contour = kept[0].ring as FootprintPoint[];
  const reg = registerContourToRaster({ contour, mask: h.mask, dsm: h.dsm, groundElevFt: ground });
  if (!reg.applied) { console.log(`\n=== ${h.name}: registration refused`); return null; }
  const rad = (reg.transform.thetaDeg * Math.PI) / 180;
  const moved = contour.map((pt) => ({
    x: pt.x * Math.cos(rad) - pt.y * Math.sin(rad) + reg.transform.dxFt,
    y: pt.x * Math.sin(rad) + pt.y * Math.cos(rad) + reg.transform.dyFt,
  }));
  const cov = measureCoverage({ mask: h.mask, dsm: h.dsm, groundElevFt: ground, rings: [moved] });
  if (!cov || cov.share < 0.7) { console.log(`\n=== ${h.name}: uncovered`); return null; }
  const meas = measurePitchFromDsm({ model: first.model, mask: h.mask, dsm: h.dsm, transform: reg.transform, sectionTolerance12: 0.75 });
  const sp = structurePitch(meas, h.instant.totals?.predominantPitch ?? null, {
    solarPanels: h.instant.structures.some((st) => st.solarPanels === true),
  });
  if (sp.source !== "measured") { console.log(`\n=== ${h.name}: pitch ${sp.source} — not a carrier candidate`); return null; }
  const rebuilt = buildRoofV2({ instant: h.instant, origin: h.meta.origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;
  const infos = facetInfos(rebuilt, meas);

  // adjacency by shared plan edges (0.05 ft midpoint rule)
  const shares = (a: FacetInfo, b: FacetInfo): boolean => {
    for (let i = 0; i < a.plan.length; i++) {
      const p = a.plan[i], q = a.plan[(i + 1) % a.plan.length];
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      for (let j = 0; j < b.plan.length; j++) {
        const u = b.plan[j], v = b.plan[(j + 1) % b.plan.length];
        const dx = v.x - u.x, dy = v.y - u.y;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1e-12) continue;
        const t = ((mid.x - u.x) * dx + (mid.y - u.y) * dy) / l2;
        if (t < -0.01 || t > 1.01) continue;
        if (Math.hypot(mid.x - (u.x + t * dx), mid.y - (u.y + t * dy)) < 0.05) return true;
      }
    }
    return false;
  };
  // clusters (step-1 rule) → cluster pitch
  const clusterOf = new Map<FacetInfo, number>();
  let cid = 0;
  for (const f of infos) {
    if (f.dsmAz == null || clusterOf.has(f)) continue;
    cid++;
    const stack = [f];
    clusterOf.set(f, cid);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nb of infos) {
        if (nb.dsmAz == null || clusterOf.has(nb) || nb === cur) continue;
        if (!shares(cur, nb)) continue;
        if (azDiff(cur.dsmAz!, nb.dsmAz) <= CLUSTER_AZ_TOL_DEG && Math.abs((cur.dsmPitch ?? 0) - (nb.dsmPitch ?? 0)) <= 0.75) {
          clusterOf.set(nb, cid);
          stack.push(nb);
        }
      }
    }
  }
  const clusterPitch = new Map<number, number>();
  for (let c = 1; c <= cid; c++) {
    const mem = infos.filter((f) => clusterOf.get(f) === c && f.trusted && f.dsmPitch != null);
    const area = mem.reduce((s, f) => s + f.area, 0);
    clusterPitch.set(c, area >= MIN_TRUSTED_SQFT ? mem.reduce((s, f) => s + f.dsmPitch! * f.area, 0) / area : sp.pitch12);
  }

  // per-edge slopes
  const slopes: number[] = [];
  const edgeNotes: string[] = [];
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // the facet whose ring contains this contour edge
    let owner: FacetInfo | null = null;
    for (const f of infos) {
      for (let j = 0; j < f.plan.length; j++) {
        const u = f.plan[j], v = f.plan[(j + 1) % f.plan.length];
        const dx = v.x - u.x, dy = v.y - u.y;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1e-12) continue;
        const t = ((mid.x - u.x) * dx + (mid.y - u.y) * dy) / l2;
        if (t < -0.01 || t > 1.01) continue;
        if (Math.hypot(mid.x - (u.x + t * dx), mid.y - (u.y + t * dy)) < 0.05) { owner = f; break; }
      }
      if (owner) break;
    }
    if (!owner) { slopes.push(sp.pitch12 / 12); edgeNotes.push(`e${i}: no owner → structure`); continue; }
    const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
    // A gable is a WALL: field ends measure 10.6-20.7 ft, the slivers that
    // spawned adjacent verticals measure 3.4-3.5. Below 8 ft the carrier
    // stays a hip and stays parked in the unrecognised detector.
    const carrier =
      edgeLen >= 8 &&
      owner.dsmAz != null &&
      azDiff(owner.drainAz, owner.dsmAz) >= GABLE_MIN_DEG &&
      infos.some((nb) => nb !== owner && nb.dsmAz != null && azDiff(nb.dsmAz!, owner!.dsmAz!) <= CLUSTER_AZ_TOL_DEG);
    if (carrier) { slopes.push(Number.POSITIVE_INFINITY); edgeNotes.push(`e${i}: ${owner.label} GABLE`); continue; }
    const c = clusterOf.get(owner);
    const p12 = c != null ? clusterPitch.get(c)! : sp.pitch12;
    slopes.push(p12 / 12);
    edgeNotes.push(`e${i}: ${owner.label} ${p12.toFixed(2)}/12`);
  }
  // Slope classes: single-linkage at sectionTolerance12 (0.75) — the
  // pipeline's own definition of "the same slope". Fallback pitches next to
  // measured ones on parallel walls otherwise manufacture phantom steps the
  // wavefront cannot ride (parallel-edge events).
  {
    const finite = slopes.map((sv, i) => ({ sv, i })).filter((x) => Number.isFinite(x.sv)).sort((a, b) => a.sv - b.sv);
    const classes: number[][] = [];
    let lastVal = -1;
    for (const x of finite) {
      if (classes.length && x.sv * 12 - lastVal <= 0.75) classes[classes.length - 1].push(x.i);
      else classes.push([x.i]);
      lastVal = x.sv * 12;
    }
    for (const cls of classes) {
      const mean = cls.reduce((s2, i) => s2 + slopes[i] * 12, 0) / cls.length;
      for (const i of cls) slopes[i] = mean / 12;
    }
    console.log(`
=== ${h.name} ===`);
    console.log(`  slope classes: ${classes.map((cls) => `${(slopes[cls[0]] * 12).toFixed(2)}/12x${cls.length}`).join(" | ")} + ${slopes.filter((sv) => !Number.isFinite(sv)).length} gable`);
  }
  console.log(`  edges: ${edgeNotes.join(" · ")}`);
  if (!slopes.some((s) => !Number.isFinite(s))) { console.log("  no gable edges — wavefront gate would not fire"); }

  const wf = weightedSkeleton(contour, slopes, { degenerateRetry: true, onRefuse: (r) => console.log(`    refuse: ${r}`) });
  if (!wf) { console.log("  WAVEFRONT NULL — fallback to skeleton"); return null; }
  const model = modelFromWavefront({ contour, slopes, result: wf, base: rebuilt, structureIndex: 0 });
  if (!model) { console.log("  model assembly failed"); return null; }

  const idx = buildIndexes(model);
  const plan = model.faces.reduce((s, f) => {
    const r = ringOf(f.lineIds, idx);
    return s + (r && r.length >= 3 ? Math.abs(areaOf(r.map((p) => ({ x: p.x, y: p.y })))) : 0);
  }, 0);
  const outlineArea = Math.abs(areaOf(contour));
  const rep = validateRoofInvariants(model, { footprint: contour.map((p) => [p.x, p.y] as [number, number]) });
  console.log(
    `  facets ${rebuilt.faces.length}→${model.faces.length} · euler ${euler(model)} · tiling ${(((plan - outlineArea) / outlineArea) * 100).toFixed(2)}% · ` +
      `areaIdentity ${areaIdentity(model).toFixed(3)}% · errors [${[...new Set(rep.results.filter((x) => x.level === "error").map((x) => x.id))].join(",")}]`,
  );
  console.log(`  footage before: ${foot(rebuilt)}`);
  console.log(`  footage after:  ${foot(model)}`);
  if (process.env.WHOCOVERS) {
    for (const lbl of process.env.WHOCOVERS.split(",")) {
      const src = infos.find((f2) => f2.label === lbl.trim());
      if (!src) continue;
      const cx0 = src.plan.reduce((s2, pp) => s2 + pp.x, 0) / src.plan.length;
      const cy0 = src.plan.reduce((s2, pp) => s2 + pp.y, 0) / src.plan.length;
      const midx = buildIndexes(model);
      for (const f2 of model.faces) {
        const r2 = ringOf(f2.lineIds, midx);
        if (!r2 || r2.length < 3) continue;
        let hit = false;
        for (let i2 = 0, j2 = r2.length - 1; i2 < r2.length; j2 = i2++) {
          if (r2[i2].y > cy0 !== r2[j2].y > cy0 && cx0 < ((r2[j2].x - r2[i2].x) * (cy0 - r2[i2].y)) / (r2[j2].y - r2[i2].y) + r2[i2].x) hit = !hit;
        }
        if (hit) { console.log(`  ${lbl}: covered by ${f2.designator} drain ${f2.orientation.toFixed(0)}° pitch ${f2.pitch.toFixed(2)}/12 area ${f2.areaSqft.toFixed(0)}`); break; }
      }
    }
  }
  return { model, origin: h.meta.origin };
}

function overlay(name: string, bbox: [number, number, number, number], model: RoofModel, origin: { lat: number; lng: number }) {
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
  const svg = model.lines
    .map((l) => {
      const a = px(pById.get(l.aId)!);
      const b = px(pById.get(l.bId)!);
      return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${COLOR[l.type] ?? "#f00"}" stroke-width="${l.type === "EAVE" ? 1.6 : 3}"/>`;
    })
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111">
<div style="color:#eee;font:13px monospace;padding:6px">${name} WAVEFRONT — <span style="color:#00e676">ridge</span> · <span style="color:#ff9100">hip</span> · <span style="color:#2979ff">valley</span> · <span style="color:#e040fb">rake</span> · <span style="color:#eceff1">eave</span></div>
<div style="position:relative;width:${W}px;height:${H2}px"><img src="ortho-${name}.png" style="width:${W}px;height:${H2}px;display:block"/>
<svg style="position:absolute;inset:0" width="${W}" height="${H2}">${svg}</svg></div></body>`;
  writeFileSync(resolve(OUT, `step3-${name}.html`), html);
  console.log(`  overlay: step3-${name}.html`);
}

const r12621 = run(loadField("12621", "12621-ne-100th-pl-kirkland-wa"));
const r12629 = run(loadFix("12629", "kirkland-12629-ne-100th-pl"));
const r12618 = run(loadField("12618", "12618-ne-100th-st-kirkland-wa"));
if (r12629) overlay("12629", [-122.17211430233286, 47.68990041722422, -122.17175936966714, 47.690156240332854], r12629.model, r12629.origin);
if (r12621 && process.env.OV12621) overlay("12621", JSON.parse(process.env.OV12621) as [number, number, number, number], r12621.model, r12621.origin);
if (r12618 && process.env.OV12618) overlay("12618", JSON.parse(process.env.OV12618) as [number, number, number, number], r12618.model, r12618.origin);

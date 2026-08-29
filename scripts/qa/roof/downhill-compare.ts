/* Old reader, new reader, and chance — one metric, three numbers.
 *
 *   npx tsx scripts/qa/roof/downhill-compare.ts
 *
 * THE METRIC IS NOT NEW. It is the one from .cache/roof-diagram/downhill-check.ts
 * that produced "22 facets, 11 right within 45 degrees = 50%, chance 38%", and
 * it was re-read line by line before being reused: a facet polygon is
 * rasterised, each sample point is attributed to the one of OUR facets that
 * CONTAINS it, the host is the facet holding the most points, and only facets
 * whose plane fit sits inside the DSM's own noise floor may be a host. No
 * nearest-neighbour anywhere — that was the bug in the line metric (§K8), and
 * this construction never had it.
 *
 * Both readers are scored by this same function, on the same addresses, against
 * the same 38% baseline (guessing one of eight compass points within 45
 * degrees). The old reader's answers come from its cached runs, so the old side
 * costs nothing and cannot drift.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { fetchPropertyImage } from "@/lib/eagleview";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch, DSM_NOISE_FLOOR_FT } from "@/lib/roofRecon/pitchFromDsm";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import { normalizedRingToFrame } from "@/lib/roofDiagram/outlineVision";
import { readInstantSurvey } from "@/lib/roofDiagram/instantSurvey";
import { contrastMap, cropToOutline, drawPinMarker } from "@/lib/roofDiagram/orthoPrep";
import { readRoofLayout } from "@/lib/roofDiagram/roofLayoutVision";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

const CACHE = resolve(".cache/roof-diagram");
const OUT = resolve(".cache/layout-vision");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

interface Job { name: string; key: string; slug: string; dir: string; fixture?: string }
/** The five the old reader has cached answers for — the farm was never read. */
const JOBS: Job[] = [
  { name: "12629 Kirkland", key: "12629", slug: "12629-ne-100th-pl-kirkland-wa-98033", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { name: "12621 Kirkland", key: "12621", slug: "12621-ne-100th-pl-kirkland-wa-98033", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { name: "12618 Kirkland", key: "12618", slug: "12618-ne-100th-st-kirkland-wa-98033", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { name: "9903 Kirkland", key: "9903", slug: "9903-117th-pl-ne-kirkland-wa-98033", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { name: "419 Prairie IL", key: "419", slug: "419-prairie-ridge-ln-north-aurora-il-60542", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
];

const COMPASS: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const azDiff = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const inRing = (p: { x: number; y: number }, r: Array<{ x: number; y: number }>): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};

interface OurFacet { label: string; plan: Array<{ x: number; y: number }>; az: number }
interface Claim { polygon: Array<{ x: number; y: number }>; downhill: string }
interface Tally { tested: number; within45: number; within90: number; noHost: number; badDir: number }

function scoreClaims(claims: Claim[], ours: OurFacet[], log?: (s: string) => void): Tally {
  const t: Tally = { tested: 0, within45: 0, within90: 0, noHost: 0, badDir: 0 };
  for (const c of claims) {
    if (!(c.downhill in COMPASS)) { t.badDir++; continue; }
    if (c.polygon.length < 3) { t.badDir++; continue; }
    const xs = c.polygon.map((q) => q.x);
    const ys = c.polygon.map((q) => q.y);
    const hits = new Map<string, number>();
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1.5) {
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1.5) {
        const q = { x, y };
        if (!inRing(q, c.polygon)) continue;
        const host = ours.find((f) => inRing(q, f.plan));
        if (host) hits.set(host.label, (hits.get(host.label) ?? 0) + 1);
      }
    }
    const best = [...hits.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best) { t.noHost++; continue; }
    const host = ours.find((f) => f.label === best[0])!;
    const err = azDiff(COMPASS[c.downhill], host.az);
    t.tested++;
    if (err <= 45) t.within45++;
    if (err <= 90) t.within90++;
    log?.(`      ${host.label.padEnd(5)} says ${c.downhill.padEnd(3)} · measured ${host.az.toFixed(0).padStart(3)}° · off ${err.toFixed(0).padStart(3)}°  ${err <= 45 ? "right" : err <= 90 ? "quarter turn" : err <= 135 ? "badly off" : "OPPOSITE"}`);
  }
  return t;
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

function clearOrtho(instant: InstantRoofData, origin: { lat: number; lng: number }) {
  const area = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);
  return instant.imagery
    .filter((i) => i.view === "ortho" && i.bbox && i.masked === false)
    .filter((i) => {
      const [a, b, c, d] = i.bbox!;
      return origin.lng >= a && origin.lng <= c && origin.lat >= b && origin.lat <= d;
    })
    .sort((x, y) => area(x.bbox!) - area(y.bbox!))[0];
}

async function orthoBytes(key: string, token: string): Promise<Uint8Array> {
  const file = resolve(CACHE, `clear-${key}.png`);
  if (existsSync(file)) return new Uint8Array(readFileSync(file));
  const { bytes } = await fetchPropertyImage(token);
  const u = new Uint8Array(bytes);
  writeFileSync(file, Buffer.from(u));
  return u;
}

(async () => {
  const verbose = process.argv.includes("--verbose");
  // The reader is not deterministic — the same address has returned 8 and 14
  // lines on consecutive runs. A two-point difference on ~23 cases is inside
  // that noise, so the new side is run several times and the SPREAD is
  // reported. One run would be an anecdote dressed as a measurement.
  const repeatArg = process.argv.find((a) => a.startsWith("--repeat="));
  // Default 3, by rule (ROOF-STATE, роль зрения): any published vision number
  // requires repeats — the reader's own spread measured 56-73%.
  const REPEATS = repeatArg ? Math.max(1, Number(repeatArg.split("=")[1])) : 3;
  const newRuns: Tally[] = Array.from({ length: REPEATS }, () => ({ tested: 0, within45: 0, within90: 0, noHost: 0, badDir: 0 }));
  const oldT: Tally = { tested: 0, within45: 0, within90: 0, noHost: 0, badDir: 0 };
  const newT: Tally = { tested: 0, within45: 0, within90: 0, noHost: 0, badDir: 0 };
  const rows: string[] = [];

  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }

    // OUR facets and their measured bearings — built exactly as downhill-check did.
    const ground = meta.diagnostics.groundElevFt as number;
    const clusters = (meta.diagnostics.clusters as number) ?? null;
    const first = buildRoofV2({ instant, origin: meta.origin, clusters });
    if (!first.model) { console.log(`${job.name}: no model`); continue; }
    const contour = first.report.structures.find((s) => s.ring)!.ring as FootprintPoint[];
    const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: ground });
    if (!reg.applied) { console.log(`${job.name}: registration refused`); continue; }
    const meas = measurePitchFromDsm({ model: first.model, mask, dsm, transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75 });
    const sp = structurePitch(meas, instant.totals?.predominantPitch ?? null, { solarPanels: instant.structures.some((s) => s.solarPanels === true) });
    const model = buildRoofV2({ instant, origin: meta.origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;
    const idx = buildIndexes(model);
    const byLabel = new Map(meas.facets.map((f) => [f.id, f]));
    const ours: OurFacet[] = model.faces
      .map((f) => {
        const ring = ringOf(f.lineIds, idx);
        const m = byLabel.get(String(f.designator || f.id));
        return ring && ring.length >= 3 && m && m.residualP50Ft <= DSM_NOISE_FLOOR_FT
          ? { label: String(f.designator || f.id), plan: ring.map((q) => ({ x: q.x, y: q.y })), az: m.azimuthDeg }
          : null;
      })
      .filter((f): f is OurFacet => !!f);

    console.log(`\n${job.name} — ${ours.length} trusted facets to judge against`);

    // ── OLD reader, from its cache ──
    const expPath = resolve(CACHE, `exp-facets-${job.slug}.json`);
    let o: Tally = { tested: 0, within45: 0, within90: 0, noHost: 0, badDir: 0 };
    if (existsSync(expPath)) {
      const exp = JSON.parse(readFileSync(expPath, "utf8")) as {
        bbox: [number, number, number, number];
        raw: { facets?: Array<{ polygon: [number, number][]; downhill?: string }> };
      };
      const claims: Claim[] = (exp.raw.facets ?? [])
        .map((vf) => {
          const poly = (vf.polygon ?? []).filter((c) => Array.isArray(c) && c.length >= 2).map((c) => [Number(c[0]), Number(c[1])] as [number, number]);
          return poly.length >= 3
            ? { polygon: normalizedRingToFrame(poly, exp.bbox, meta.origin), downhill: String(vf.downhill ?? "").toUpperCase() }
            : null;
        })
        .filter((c): c is Claim => !!c);
      if (verbose) console.log("    OLD:");
      o = scoreClaims(claims, ours, verbose ? (s) => console.log(s) : undefined);
    } else {
      console.log("    OLD: no cached read");
    }
    console.log(`    OLD  ${o.tested} judged · ${o.within45} right (${pct(o.within45, o.tested)}) · within 90° ${pct(o.within90, o.tested)} · ${o.noHost} landed on no trusted facet`);

    // ── NEW reader, live ──
    // The reader now gets everything the anchoring work added: the CHOSEN clear
    // frame, cropped to the outline +15 ft, the pin drawn on the photo (clean
    // contrast map), the ground size and the centre/pin transform. This is the
    // first measurement with none of the known input defects.
    const img = clearOrtho(instant, meta.origin);
    let n: Tally = { tested: 0, within45: 0, within90: 0, noHost: 0, badDir: 0 };
    if (!img?.bbox) {
      console.log("    NEW: no clear ortho");
    } else {
      const raw = await orthoBytes(job.key, img.token);
      const outline = instant.structures[0].outline ?? [];
      const cropped = outline.length >= 3 ? cropToOutline(raw, img.bbox, outline, 15) : { png: raw, bbox: img.bbox };
      const photo = drawPinMarker(cropped.png, cropped.bbox, meta.origin);
      const cm = contrastMap(cropped.png);
      const survey = readInstantSurvey(instant, meta.origin);
      const planes = ((meta.diagnostics.pitches12 as number[]) ?? []).map((p, i) => ({
        pitch12: p,
        azimuthDeg: (meta.diagnostics.clusterAzimuthDeg as number[] | undefined)?.[i] ?? 0,
        sqft: 0,
      }));
      const read = await readRoofLayout({
        photo,
        contrast: cm.bytes,
        bbox: cropped.bbox,
        origin: meta.origin,
        anchorMode: "marker",
        instant,
        structure: instant.structures[0],
        contour,
        ours: {
          clusters: planes.length ? planes : undefined,
          occlusion: survey ? { occlusion: survey.occlusion, treeOverhang: survey.treeOverhang, confidence: survey.confidence } : null,
        },
        confidences: survey?.confidence,
      });
      for (let rep = 0; rep < REPEATS; rep++) {
        const r = rep === 0 ? read : await readRoofLayout({
          photo, contrast: cm.bytes, bbox: cropped.bbox, origin: meta.origin, anchorMode: "marker",
          instant, structure: instant.structures[0], contour,
          ours: {
            clusters: planes.length ? planes : undefined,
            occlusion: survey ? { occlusion: survey.occlusion, treeOverhang: survey.treeOverhang, confidence: survey.confidence } : null,
          },
          confidences: survey?.confidence,
        });
        if (rep === 0) writeFileSync(resolve(OUT, `${job.key}-read.json`), JSON.stringify(r, null, 1));
        const t = scoreClaims(r.facets.map((f) => ({ polygon: f.polygon, downhill: f.downhill })), ours, verbose && rep === 0 ? (s) => console.log(s) : undefined);
        for (const k of ["tested", "within45", "within90", "noHost", "badDir"] as const) newRuns[rep][k] += t[k];
        if (rep === 0) {
          n = t;
          console.log(`    NEW  ${r.facets.length} facets returned, ${r.lines.length} lines, ${r.masses.length} masses, ${r.unreadable.length} unreadable areas`);
        } else {
          console.log(`    NEW  repeat ${rep + 1}: ${r.facets.length} facets, ${t.within45}/${t.tested} right`);
        }
      }
    }
    console.log(`    NEW  ${n.tested} judged · ${n.within45} right (${pct(n.within45, n.tested)}) · within 90° ${pct(n.within90, n.tested)} · ${n.noHost} landed on no trusted facet`);

    rows.push(`  ${job.name.padEnd(17)} old ${String(o.within45).padStart(2)}/${String(o.tested).padEnd(2)} ${pct(o.within45, o.tested).padStart(4)}   new ${String(n.within45).padStart(2)}/${String(n.tested).padEnd(2)} ${pct(n.within45, n.tested).padStart(4)}`);
    for (const k of ["tested", "within45", "within90", "noHost", "badDir"] as const) { oldT[k] += o[k]; newT[k] += n[k]; }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(rows.join("\n"));
  console.log(`${"=".repeat(70)}`);
  console.log(`  OLD reader   ${oldT.within45}/${oldT.tested} right within 45° = ${pct(oldT.within45, oldT.tested)}   (within 90°: ${pct(oldT.within90, oldT.tested)})`);
  if (REPEATS > 1) {
    const shares = newRuns.map((r) => (r.tested ? r.within45 / r.tested : 0));
    const lo = Math.min(...shares);
    const hi = Math.max(...shares);
    console.log(
      `  NEW reader   ${REPEATS} runs: ` +
        newRuns.map((r) => `${r.within45}/${r.tested}=${pct(r.within45, r.tested)}`).join("  ") +
        `   → spread ${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`,
    );
  } else {
    console.log(`  NEW reader   ${newT.within45}/${newT.tested} right within 45° = ${pct(newT.within45, newT.tested)}   (within 90°: ${pct(newT.within90, newT.tested)})`);
  }
  console.log(`  CHANCE       guessing one of eight compass points within 45° = 38%`);
  console.log(`\n  facets that landed on no trusted facet — old ${oldT.noHost}, new ${newT.noHost} (not scored either way)`);
})();

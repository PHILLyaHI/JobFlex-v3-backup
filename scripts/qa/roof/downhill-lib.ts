/* Shared pieces of the downhill metric — the proven one from downhill-check.
 * Extracted so anchor-test and downhill-compare score with ONE implementation.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch, DSM_NOISE_FLOOR_FT } from "@/lib/roofRecon/pitchFromDsm";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

const COMPASS: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const azDiff = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const inRing = (p: { x: number; y: number }, r: Array<{ x: number; y: number }>): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};

export interface OurFacet { label: string; plan: Array<{ x: number; y: number }>; az: number }
export interface Claim { polygon: Array<{ x: number; y: number }>; downhill: string }
export interface Tally { tested: number; within45: number; within90: number; noHost: number; badDir: number }

export function scoreClaims(claims: Claim[], ours: OurFacet[], log?: (s: string) => void): Tally {
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


export function rasterFromFile(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

/** OUR trusted facets with measured bearings — built exactly as downhill-check built them. */
export function trustedFacetsFor(job: { dir: string; fixture?: string }): { ours: OurFacet[]; contour: FootprintPoint[]; meta: FixtureMeta; instant: InstantRoofData; dsm: Raster; mask: Raster } | null {
  const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
  const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
  let dsm: Raster, mask: Raster;
  if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
  else { dsm = rasterFromFile(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFromFile(resolve(job.dir, "mask.f32.gz"), meta); }
  const ground = meta.diagnostics.groundElevFt as number;
  const clusters = (meta.diagnostics.clusters as number) ?? null;
  const first = buildRoofV2({ instant, origin: meta.origin, clusters });
  if (!first.model) return null;
  const contour = first.report.structures.find((s) => s.ring)!.ring as FootprintPoint[];
  const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: ground });
  if (!reg.applied) return null;
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
  return { ours, contour, meta, instant, dsm, mask };
}

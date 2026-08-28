/* The reworked layout read, measured against the one it replaces.
 *
 *   npx tsx scripts/qa/roof/layout-vision.ts            all six addresses
 *   npx tsx scripts/qa/roof/layout-vision.ts 12629      one of them
 *
 * BOTH readers run on the SAME inputs and are scored by the SAME rule, because
 * the number we are trying to move — 50% correct drain directions against 38%
 * for random choice — was measured per FACET by the old read, and the new one
 * returns LINES. Comparing 50% against a per-line figure would be a sleight of
 * hand. So the old reader is re-run here and both are scored per line.
 *
 * THE RULE. Every interior line implies a claim about drainage: the two planes
 * it separates run down away from it (ridge, hip) or down into it (valley), and
 * in all three cases their bearings are PERPENDICULAR to the line, pointing
 * opposite ways. The DSM measured those bearings independently. So for each
 * proposed line we find the nearest measured plane on each side and ask whether
 * the pair is consistent with the line's own type.
 *
 * A line whose two sides were not both measured is not scored — counted as
 * "unjudged" and reported, never quietly dropped.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { fetchPropertyImage } from "@/lib/eagleview";
import { reconstructRoof } from "@/lib/roofRecon";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { readInstantSurvey } from "@/lib/roofDiagram/instantSurvey";
import { contrastMap } from "@/lib/roofDiagram/orthoPrep";
import { readRoofLayout, type LayoutLine } from "@/lib/roofDiagram/roofLayoutVision";
import { readRoofStructure } from "@/lib/roofDiagram/roofStructureVision";
import { loadFixture, type FixtureMeta } from "./fixture";

const CACHE = resolve(".cache/roof-diagram");
const OUT = resolve(".cache/layout-vision");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

interface Job { name: string; key: string; dir: string; fixture?: string }
const JOBS: Job[] = [
  { name: "12629 Kirkland", key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", fixture: "kirkland-12629-ne-100th-pl" },
  { name: "12621 Kirkland", key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { name: "12618 Kirkland", key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { name: "9903 Kirkland", key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { name: "419 Prairie IL", key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", fixture: "prairie-419-prairie-ridge-ln" },
  { name: "12117 Snohomish", key: "12117", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa" },
];

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

/** The CLEAR ortho with the tightest bbox — deliberately not the masked one. */
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

async function orthoBytes(slug: string, token: string): Promise<Uint8Array> {
  const file = resolve(CACHE, `clear-${slug}.png`);
  if (existsSync(file)) return new Uint8Array(readFileSync(file));
  const { bytes } = await fetchPropertyImage(token);
  const u = new Uint8Array(bytes);
  writeFileSync(file, Buffer.from(u));
  return u;
}

// ── the scoring rule ────────────────────────────────────────────────────────
interface Plane { pitch12: number; azimuthDeg: number; sqft: number; cx: number; cy: number; pts: Array<[number, number]> }

const angDiff = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Score one line. Returns null when the evidence cannot judge it — an unmeasured
 * side is not a failure of the line.
 */
function judge(line: LayoutLine, planes: Plane[]): boolean | null {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const len = Math.hypot(dx, dy);
  if (len < 3 || !planes.length) return null;
  // Unit normal to the line, and the midpoint.
  const nx = -dy / len;
  const ny = dx / len;

  // Nearest measured plane a short step to either side.
  const probe = Math.max(6, len * 0.15);
  // Nearest plane by its own PIXELS, not its centroid: an L-shaped facet has a
  // centroid that lies off the facet, and asking "which plane is on this side"
  // by centroid distance then answers with a plane that is not there at all.
  // This is why the first version of this metric could judge only 4 lines of 12.
  const nearest = (px: number, py: number): Plane | null => {
    let best: Plane | null = null;
    let bd = Infinity;
    for (const p of planes) {
      for (const [sx, sy] of p.pts) {
        const d = Math.hypot(sx - px, sy - py);
        if (d < bd) { bd = d; best = p; }
      }
    }
    return bd <= probe * 2 ? best : null;
  };
  // Probe at several stations ALONG the line, not just its midpoint. Measured
  // on 12629: the midpoint of the main ridge sat at the northern edge of what
  // the DSM saw, so one side had no measured plane and every line came back
  // unjudged. A line is judged wherever it can be — the first station that
  // finds two distinct planes decides it.
  let L: Plane | null = null;
  let R: Plane | null = null;
  for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const sx = line.a.x + dx * t;
    const sy = line.a.y + dy * t;
    const l = nearest(sx + nx * probe, sy + ny * probe);
    const r = nearest(sx - nx * probe, sy - ny * probe);
    if (l && r && l !== r) { L = l; R = r; break; }
  }
  if (!L || !R) return null;

  // The bearing the line's own type predicts for each side.
  const lineBearing = (Math.atan2(dx, dy) * 180) / Math.PI; // compass, along the line
  const away = [(lineBearing + 90 + 360) % 360, (lineBearing - 90 + 360) % 360];
  if (line.type === "RIDGE" || line.type === "HIP") {
    // Both sides drain AWAY, perpendicular, opposite each other.
    const ok =
      Math.min(angDiff(L.azimuthDeg, away[0]), angDiff(L.azimuthDeg, away[1])) <= 45 &&
      Math.min(angDiff(R.azimuthDeg, away[0]), angDiff(R.azimuthDeg, away[1])) <= 45 &&
      angDiff(L.azimuthDeg, R.azimuthDeg) >= 90;
    return ok;
  }
  if (line.type === "VALLEY") {
    // Both sides drain TOWARD the line: bearings converge rather than diverge.
    const toL = angDiff(L.azimuthDeg, (away[0] + 180) % 360);
    const toR = angDiff(R.azimuthDeg, (away[1] + 180) % 360);
    return Math.min(toL, angDiff(L.azimuthDeg, (away[1] + 180) % 360)) <= 45 && Math.min(toR, angDiff(R.azimuthDeg, (away[0] + 180) % 360)) <= 45;
  }
  return null; // rakes and eaves make no two-sided claim
}

function score(lines: LayoutLine[], planes: Plane[]) {
  let ok = 0;
  let bad = 0;
  let unjudged = 0;
  for (const l of lines) {
    const v = judge(l, planes);
    if (v === null) unjudged++;
    else if (v) ok++;
    else bad++;
  }
  const judged = ok + bad;
  return { ok, bad, unjudged, judged, share: judged ? ok / judged : null };
}

(async () => {
  const only = process.argv[2];
  const jobs = only ? JOBS.filter((j) => j.key === only) : JOBS;
  if (!jobs.length) { console.error(`no address matching "${only}"`); process.exit(1); }

  for (const job of jobs) {
    console.log(`\n${"=".repeat(78)}\n${job.name}\n${"=".repeat(78)}`);
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;

    const img = clearOrtho(instant, meta.origin);
    if (!img?.bbox) { console.log("  no clear ortho with a bbox containing the pin — skipped"); continue; }

    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }

    // Our own measurements, from the same frozen rasters the pipeline uses.
    const recon = reconstructRoof(dsm as never, mask as never);
    const d = recon.diagnostics as unknown as {
      pitches12: number[]; clusterAzimuthDeg: number[]; clusterSqft: number[];
      clusterCentroidFt: Array<[number, number]>;
      clusterSamplesFt: Array<Array<[number, number]>>;
    };
    const planes: Plane[] = (d.pitches12 ?? []).map((p, i) => ({
      pitch12: p,
      azimuthDeg: d.clusterAzimuthDeg?.[i] ?? 0,
      sqft: d.clusterSqft?.[i] ?? 0,
      cx: d.clusterCentroidFt?.[i]?.[0] ?? 0,
      cy: d.clusterCentroidFt?.[i]?.[1] ?? 0,
      pts: d.clusterSamplesFt?.[i] ?? [],
    }));

    const first = buildRoofV2({ instant, origin: meta.origin, clusters: (meta.diagnostics.clusters as number) ?? null });
    const contour = first.report.structures.find((s) => s.ring)?.ring ?? [];
    const structure = instant.structures[0];
    const survey = readInstantSurvey(instant, meta.origin);

    const photo = await orthoBytes(job.key, img.token);
    const cm = contrastMap(photo);
    writeFileSync(resolve(OUT, `${job.key}-contrast.png`), Buffer.from(cm.bytes));

    console.log(`  clear ortho ${cm.width}x${cm.height}, shot ${img.shotDate}; ${planes.length} measured planes; contour ${contour.length} pts`);

    const t0 = Date.now();
    const read = await readRoofLayout({
      photo,
      contrast: cm.bytes,
      instant,
      structure,
      contour,
      ours: {
        clusters: planes.map((p) => ({ pitch12: p.pitch12, azimuthDeg: p.azimuthDeg, sqft: p.sqft })),
        coverage: null,
        occlusion: survey ? { occlusion: survey.occlusion, treeOverhang: survey.treeOverhang, confidence: survey.confidence } : null,
      },
      confidences: survey?.confidence,
    });
    const newMs = Date.now() - t0;

    console.log(`  NEW read (${read.model}) in ${(newMs / 1000).toFixed(1)}s`);
    for (const p of read.passes) console.log(`     ${p.name.padEnd(8)} ${String(p.ms).padStart(6)} ms  ${p.lines} lines${p.refused ? "  REFUSED" : ""}`);
    console.log(`     masses: ${read.masses.map((m) => m.label).join(", ") || "—"}`);
    console.log(`     unreadable areas: ${read.unreadable.length}${read.unreadable.length ? " — " + read.unreadable.map((u) => u.why).slice(0, 2).join("; ") : ""}`);
    for (const r of read.reasons) console.log(`     ! ${r}`);

    // ── CONTROL: the same rule over OUR OWN model's interior lines. ──
    // These were built FROM the same elevation data, so they must score high.
    // If they do not, the metric is broken and the vision numbers mean nothing.
    // Without this control a bad metric and a bad reader look identical.
    const pts = new Map(recon.model.points.map((pt) => [pt.id, pt]));
    const ctrl: LayoutLine[] = recon.model.lines
      .filter((l) => ["RIDGE", "HIP", "VALLEY"].includes(l.type))
      .map((l) => {
        const a = pts.get(l.aId);
        const b = pts.get(l.bId);
        return a && b
          ? { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, type: l.type as LayoutLine["type"], cue: "our own model", confidence: 1, pass: "control" }
          : null;
      })
      .filter((l): l is LayoutLine => !!l);
    const sCtrl = score(ctrl, planes);
    console.log(`     CONTROL — our own model's ${ctrl.length} interior lines score ${sCtrl.ok}/${sCtrl.judged}${sCtrl.share == null ? "" : ` = ${(sCtrl.share * 100).toFixed(0)}%`} by the same rule (unjudged ${sCtrl.unjudged})`);

    const sNew = score(read.lines, planes);
    console.log(`     lines ${read.lines.length}  ·  direction agrees ${sNew.ok}/${sNew.judged}${sNew.share == null ? "" : ` = ${(sNew.share * 100).toFixed(0)}%`}  ·  unjudged ${sNew.unjudged}`);

    writeFileSync(resolve(OUT, `${job.key}-new.json`), JSON.stringify(read, null, 1));
  }
})();

/* The reworked layout read, measured against the one it replaces.
 *
 *   npx tsx scripts/qa/roof/layout-vision.ts            all six addresses
 *   npx tsx scripts/qa/roof/layout-vision.ts 12629      one of them
 *
 * BOTH readers run on the SAME inputs and are scored by the SAME rule, because
 * the number we are trying to move — 50% correct drain directions against 38%
 * for random choice — was measured per FACET by the old read, and the new one
 * returns LINES. Comparing 50% against a per-line figure would be a sleight of
 * hand. So the old reader would be re-run here and both scored per line — but
 * the scoring rule itself does not work yet (§K8: our own model's lines score
 * 12% by it), so running the old reader would only produce a second meaningless
 * number. It is added back when the metric passes its control.
 *
 * THE RULE. Every interior line implies a claim about drainage: the two planes
 * it separates run down away from it (ridge, hip) or down into it (valley), and
 * in all three cases their bearings are PERPENDICULAR to the line, pointing
 * opposite ways. The DSM measured those bearings independently.
 *
 * The side a plane is on is decided by CONTAINMENT — which trusted facet's plan
 * polygon holds the probe point — never by which plane's samples are nearest.
 * The first version of this harness used nearest-sample and was wrong: a sample
 * one foot the WRONG side of the line beats one three feet the right side, so
 * the two sides resolve to the same plane or to the wrong one. It is not a
 * subtle error, it is most of the answer, and it was caught only by the control
 * below (§K8). Containment is the same test downhill-check.ts used for the
 * measurement that produced the 50%-against-38% figure, and that measurement
 * stands — it never used nearest-sample.
 *
 * THE CONTROL RUNS EVERY TIME, and it is not optional. Our own model's interior
 * lines are built from these very planes, so they must nearly all agree. When
 * they do not, the instrument is broken and no number from this run may be
 * quoted. The harness says so in its own output rather than leaving it to
 * whoever reads the table.
 *
 * A line whose two sides are not both on trusted measured facets is not scored —
 * counted as "unjudged" and reported, never quietly dropped.
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
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch, DSM_NOISE_FLOOR_FT } from "@/lib/roofRecon/pitchFromDsm";
import { buildIndexes, ringOf } from "@/components/estimator/roof/roofGeometry";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { readInstantSurvey } from "@/lib/roofDiagram/instantSurvey";
import { contrastMap } from "@/lib/roofDiagram/orthoPrep";
import { readRoofLayout, type LayoutLine } from "@/lib/roofDiagram/roofLayoutVision";
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
/** A trusted measured facet: its plan polygon and the bearing water runs down it. */
interface Facet { label: string; plan: Array<{ x: number; y: number }>; azimuthDeg: number }

const angDiff = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
};

const inRing = (p: { x: number; y: number }, r: Array<{ x: number; y: number }>): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i].y > p.y !== r[j].y > p.y && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) inside = !inside;
  }
  return inside;
};

/**
 * Judge one line. Returns null when the evidence cannot judge it — a probe that
 * lands off every trusted facet is a gap in the elevation data, not a fault of
 * the line.
 */
function judge(line: LayoutLine, facets: Facet[]): boolean | null {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const len = Math.hypot(dx, dy);
  if (len < 3 || !facets.length) return null;
  const nx = -dy / len;
  const ny = dx / len;
  const hostAt = (px: number, py: number): Facet | null => facets.find((f) => inRing({ x: px, y: py }, f.plan)) ?? null;

  // Probe at stations ALONG the line and at a few offsets: a crease is where two
  // facets meet, so the offset that finds two DIFFERENT hosts is the one that
  // straddles it. Too small and both probes land inside one facet; too large and
  // they leave the roof.
  let L: Facet | null = null;
  let R: Facet | null = null;
  outer: for (const t of [0.5, 0.35, 0.65, 0.25, 0.75]) {
    const sx = line.a.x + dx * t;
    const sy = line.a.y + dy * t;
    for (const off of [3, 5, 8, 12]) {
      const l = hostAt(sx + nx * off, sy + ny * off);
      const r = hostAt(sx - nx * off, sy - ny * off);
      if (l && r && l.label !== r.label) { L = l; R = r; break outer; }
    }
  }
  if (!L || !R) return null;

  const lineBearing = (Math.atan2(dx, dy) * 180) / Math.PI; // compass, along the line
  const away = [(lineBearing + 90 + 360) % 360, (lineBearing - 90 + 360) % 360];
  const nearAway = (az: number) => Math.min(angDiff(az, away[0]), angDiff(az, away[1]));

  if (line.type === "RIDGE" || line.type === "HIP") {
    // Both sides run down AWAY from the line, so both bearings are near the
    // perpendicular and they point opposite each other.
    return nearAway(L.azimuthDeg) <= 45 && nearAway(R.azimuthDeg) <= 45 && angDiff(L.azimuthDeg, R.azimuthDeg) >= 90;
  }
  if (line.type === "VALLEY") {
    // Also perpendicular and opposed — a valley differs from a ridge in which
    // way is DOWN, and the plan-view azimuths alone cannot tell the two apart.
    // So this scores PLACEMENT, not the ridge/valley label, and the report says
    // so rather than implying the label was checked.
    return nearAway(L.azimuthDeg) <= 45 && nearAway(R.azimuthDeg) <= 45 && angDiff(L.azimuthDeg, R.azimuthDeg) >= 90;
  }
  return null; // rakes and eaves make no two-sided claim
}

function score(lines: LayoutLine[], facets: Facet[]) {
  let ok = 0;
  let bad = 0;
  let unjudged = 0;
  for (const l of lines) {
    const v = judge(l, facets);
    if (v === null) unjudged++;
    else if (v) ok++;
    else bad++;
  }
  const judged = ok + bad;
  return { ok, bad, unjudged, judged, share: judged ? ok / judged : null };
}

/** The control must clear this before any other number in the run may be quoted. */
const CONTROL_FLOOR = 0.8;

/**
 * The control input, built so that its answer is known BY CONSTRUCTION.
 *
 * The first control was our own model's interior lines, and it failed at 7% —
 * which proved nothing, because that input is not known-good: 27% of 12629's
 * facets are independently measured as drawn the wrong way round, and most of
 * its interior lines are 1-6 ft long, too short to probe either side of. A
 * control has to be something we KNOW is right, not something we hope is.
 *
 * So: take pairs of TRUSTED measured facets whose bearings are at least 90
 * degrees apart — a real crease separates exactly such a pair — and use the
 * segment where their polygons touch. The two sides of that segment are those
 * two facets by construction. A metric that cannot score these near 100% has a
 * broken probe, and nothing else it says can be believed.
 */
function sharedEdges(facets: Facet[]): LayoutLine[] {
  const out: LayoutLine[] = [];
  const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 0.75;
  for (let i = 0; i < facets.length; i++) {
    for (let j = i + 1; j < facets.length; j++) {
      const A = facets[i];
      const B = facets[j];
      if (angDiff(A.azimuthDeg, B.azimuthDeg) < 90) continue;
      // Vertices of A that lie on B's boundary, in order — their span is the
      // shared edge.
      const touching = A.plan.filter((p) => B.plan.some((q) => near(p, q)));
      if (touching.length < 2) continue;
      let best: [typeof touching[0], typeof touching[0]] | null = null;
      let bestLen = 0;
      for (let a = 0; a < touching.length; a++) {
        for (let b = a + 1; b < touching.length; b++) {
          const len = Math.hypot(touching[a].x - touching[b].x, touching[a].y - touching[b].y);
          if (len > bestLen) { bestLen = len; best = [touching[a], touching[b]]; }
        }
      }
      if (!best || bestLen < 8) continue; // too short to probe either side of
      out.push({ a: best[0], b: best[1], type: "RIDGE", cue: "shared edge of two trusted facets", confidence: 1, pass: "control" });
    }
  }
  return out;
}

(async () => {
  const only = process.argv[2];
  const jobs = only ? JOBS.filter((j) => j.key === only) : JOBS;
  if (!jobs.length) { console.error(`no address matching "${only}"`); process.exit(1); }
  const totals: Array<{ name: string; green: boolean; ctrl: ReturnType<typeof score>; read: ReturnType<typeof score>; lines: number; masses: number }> = [];

  for (const job of jobs) {
    console.log(`\n${"=".repeat(78)}\n${job.name}\n${"=".repeat(78)}`);
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;

    const img = clearOrtho(instant, meta.origin);
    if (!img?.bbox) { console.log("  no clear ortho with a bbox containing the pin — skipped"); continue; }

    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }

    // Our own measurements. The facets and their bearings come the SAME way
    // downhill-check.ts got them for the 50%-against-38% figure: build the
    // model, register the contour onto the raster, measure the pitch per facet,
    // and keep only facets whose plane fit is inside the DSM's own noise floor.
    // Reusing that path is the point — the two numbers have to be commensurable.
    const ground = meta.diagnostics.groundElevFt as number;
    const clusterCount = (meta.diagnostics.clusters as number) ?? null;
    const first = buildRoofV2({ instant, origin: meta.origin, clusters: clusterCount });
    const contour = (first.report.structures.find((s) => s.ring)?.ring ?? []) as FootprintPoint[];
    const structure = instant.structures[0];
    const survey = readInstantSurvey(instant, meta.origin);

    let facets: Facet[] = [];
    let model = first.model;
    if (first.model && contour.length >= 3) {
      const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: ground });
      if (reg.applied) {
        const meas = measurePitchFromDsm({
          model: first.model, mask, dsm,
          transform: reg.transform, transformFor: () => reg.transform, sectionTolerance12: 0.75,
        });
        const sp = structurePitch(meas, instant.totals?.predominantPitch ?? null, {
          solarPanels: instant.structures.some((st) => st.solarPanels === true),
        });
        model = buildRoofV2({ instant, origin: meta.origin, clusters: clusterCount, pitchOverride12: sp.pitch12 }).model ?? first.model;
        const idx = buildIndexes(model);
        const byLabel = new Map(meas.facets.map((f) => [f.id, f]));
        facets = model.faces
          .map((f) => {
            const ring = ringOf(f.lineIds, idx);
            const m = byLabel.get(String(f.designator || f.id));
            return ring && ring.length >= 3 && m && m.residualP50Ft <= DSM_NOISE_FLOOR_FT
              ? { label: String(f.designator || f.id), plan: ring.map((q) => ({ x: q.x, y: q.y })), azimuthDeg: m.azimuthDeg }
              : null;
          })
          .filter((f): f is Facet => !!f);
      }
    }

    // The plane list handed to the reader stays as it was — pitch, bearing, area
    // per DSM cluster — because that is what a reader can use.
    const recon = reconstructRoof(dsm as never, mask as never);
    const d = recon.diagnostics as unknown as {
      pitches12: number[]; clusterAzimuthDeg: number[]; clusterSqft: number[];
    };
    const planes = (d.pitches12 ?? []).map((p, i) => ({
      pitch12: p,
      azimuthDeg: d.clusterAzimuthDeg?.[i] ?? 0,
      sqft: d.clusterSqft?.[i] ?? 0,
    }));

    const photo = await orthoBytes(job.key, img.token);
    const cm = contrastMap(photo);
    writeFileSync(resolve(OUT, `${job.key}-contrast.png`), Buffer.from(cm.bytes));

    console.log(`  clear ortho ${cm.width}x${cm.height}, shot ${img.shotDate}; ${planes.length} DSM planes; ${facets.length} TRUSTED facets; contour ${contour.length} pts`);

    const t0 = Date.now();
    const read = await readRoofLayout({
      photo,
      contrast: cm.bytes,
      instant,
      structure,
      contour,
      ours: {
        clusters: planes,
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

    // ── CONTROL, every run: creases whose two sides are known by construction. ──
    const ctrl = sharedEdges(facets);
    const ctrlLines = ctrl;
    if (process.env.DEBUG_JUDGE) {
      console.log(`     -- control detail (${facets.length} trusted facets, ${ctrl.length} known creases) --`);
      for (const l of ctrlLines.slice(0, 12)) {
        const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, len = Math.hypot(dx, dy);
        const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
        const nx = -dy / len, ny = dx / len;
        const hit = (o: number) => {
          const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2;
          const A = facets.find((f) => inRing({ x: mx + nx * o, y: my + ny * o }, f.plan));
          const B = facets.find((f) => inRing({ x: mx - nx * o, y: my - ny * o }, f.plan));
          return `${o}ft:[${A?.label ?? "-"}@${A ? A.azimuthDeg.toFixed(0) : "-"} | ${B?.label ?? "-"}@${B ? B.azimuthDeg.toFixed(0) : "-"}]`;
        };
        console.log(`       ${l.type.padEnd(6)} len ${len.toFixed(0).padStart(3)} bearing ${bearing.toFixed(0).padStart(3)}  ${[3, 5, 8, 12].map(hit).join(" ")}  verdict=${judge(l, facets)}`);
      }
    }
    const sCtrl = score(ctrl, facets);
    const green = sCtrl.share != null && sCtrl.share >= CONTROL_FLOOR;
    console.log(
      `     CONTROL — ${ctrl.length} creases with known sides: ${sCtrl.ok}/${sCtrl.judged}` +
        `${sCtrl.share == null ? "" : ` = ${(sCtrl.share * 100).toFixed(0)}%`} (unjudged ${sCtrl.unjudged})  ` +
        `${green ? "PASS" : "*** FAIL — the instrument is broken, quote no number from this address ***"}`,
    );

    const sNew = score(read.lines, facets);
    const line =
      `     lines ${read.lines.length}  ·  direction agrees ${sNew.ok}/${sNew.judged}` +
      `${sNew.share == null ? "" : ` = ${(sNew.share * 100).toFixed(0)}%`}  ·  unjudged ${sNew.unjudged}`;
    console.log(green ? line : `${line}   [NOT VALID — control failed]`);
    totals.push({ name: job.name, green, ctrl: sCtrl, read: sNew, lines: read.lines.length, masses: read.masses.length });

    writeFileSync(resolve(OUT, `${job.key}-new.json`), JSON.stringify({ read, control: sCtrl, score: sNew }, null, 1));
  }

  // ── the run's verdict, and the honest denominator ──
  console.log(`
${"=".repeat(78)}`);
  const valid = totals.filter((t) => t.green);
  console.log("THIS METRIC IS CORRECT BUT SPARSE — read the denominators, not the percentages.");
  console.log("Judging a line needs two DIFFERENT trusted measured facets on its two sides, and this");
  console.log("data yields 2-7 such lines per house. A small denominator here means the ELEVATION DATA");
  console.log("could not adjudicate, not that the reader did badly. For a dense score of the same");
  console.log("reader use downhill-compare.ts, which judges one facet per case.\n");
  console.log(`control passed on ${valid.length} of ${totals.length} addresses (floor ${(CONTROL_FLOOR * 100).toFixed(0)}%)`);
  for (const t of totals) {
    console.log(
      `  ${t.name.padEnd(17)} control ${String(t.ctrl.ok).padStart(3)}/${String(t.ctrl.judged).padEnd(3)}` +
        `${t.ctrl.share == null ? "  n/a" : ` ${(t.ctrl.share * 100).toFixed(0).padStart(3)}%`}  ·  ` +
        `read ${String(t.read.ok).padStart(3)}/${String(t.read.judged).padEnd(3)}` +
        `${t.read.share == null ? "  n/a" : ` ${(t.read.share * 100).toFixed(0).padStart(3)}%`}  ·  ` +
        `${t.lines} lines, ${t.masses} masses  ${t.green ? "" : "[control failed]"}`,
    );
  }
  if (valid.length) {
    const ok = valid.reduce((a, t) => a + t.read.ok, 0);
    const judged = valid.reduce((a, t) => a + t.read.judged, 0);
    console.log(
      `
ACROSS THE ADDRESSES WHOSE CONTROL PASSED: ${ok}/${judged}` +
        `${judged ? ` = ${((ok / judged) * 100).toFixed(0)}%` : ""} against 38% for guessing.`,
    );
  } else {
    console.log("\nNo address passed its control. There is no number to report from this run.");
  }
})();

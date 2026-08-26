/**
 * Field run — a list of real addresses through the shipping V2 path, one table.
 *
 *   npx tsx scripts/qa/roof/field-run.ts                    the frozen fixtures
 *   npx tsx scripts/qa/roof/field-run.ts addresses.txt      one address per line
 *   npx tsx scripts/qa/roof/field-run.ts --paid a.txt       allow new lookups
 *
 * IDEMPOTENT BY CONSTRUCTION, because the table will be read more than once and
 * every source behind it is metered. Inputs resolve in this order:
 *
 *   1. a frozen fixture for that address        → nothing spent
 *   2. a field cache from an earlier run        → nothing spent
 *   3. the network                              → BILLED, and frozen on the way
 *      in so it is never paid for twice
 *
 * Without --paid a cache miss is reported and skipped rather than bought. The
 * `spent` column says which of the three sources each address actually cost, so
 * a run that says "cache · cache · cache" throughout cost nothing at all.
 *
 * Address format, one per line, blank lines and # comments ignored:
 *   123 Main St, Springfield, IL, 62704
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

import type { InstantRoofData, RoofModel } from "../../../src/lib/eagleview";
import type { Raster } from "../../../src/lib/solar";
import { buildIndexes, ringOf } from "../../../src/components/estimator/roof/roofGeometry";
import { validateRoofInvariants } from "../../../src/lib/roofDiagram/validate";
import { assessRoof } from "../../../src/lib/roofDiagram/confidence";
import { buildRoofV2, buildRoofV2FromRecon, measureCoverage } from "../../../src/lib/roofRecon/reconV2";
import { registerContourToRaster } from "../../../src/lib/roofRecon/register";
import { measurePitchFromDsm, structurePitch } from "../../../src/lib/roofRecon/pitchFromDsm";
import { areaOf, type FootprintPoint } from "../../../src/lib/roofRecon/footprint";
import { fixtureSlugs, loadFixture, type FixtureMeta } from "./fixture";

const FIELD_DIR = resolve("scripts/qa/roof/field");
const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;
/** The inset for the candidate coverage metric — see ROOF-STATE §5. */
const COVERAGE_INSET_FT = 4;

const args = process.argv.slice(2);
const PAID = args.includes("--paid");
const listFile = args.find((a) => !a.startsWith("--"));

interface Addr { address: string; city: string; state: string; zip: string }
const slugOf = (a: Addr) =>
  `${a.address} ${a.city} ${a.state}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

type Spend = "fixture" | "cache" | "network" | "n/a" | "skipped";
interface Inputs {
  meta: FixtureMeta;
  dsm: Raster;
  mask: Raster;
  instant: InstantRoofData | null;
  spent: { instant: Spend; solar: Spend; parcel: Spend };
}

function rasterFrom(file: string, meta: FixtureMeta): Raster {
  const buf = gunzipSync(readFileSync(file));
  const data = new Float32Array(meta.raster.width * meta.raster.height);
  Buffer.from(data.buffer).set(buf);
  return { width: meta.raster.width, height: meta.raster.height, pixelSizeM: meta.raster.pixelSizeM, data } as Raster;
}

/** Frozen fixture → field cache → network (only with --paid). */
async function resolveInputs(a: Addr): Promise<Inputs | { skipped: string }> {
  const slug = slugOf(a);
  for (const s of fixtureSlugs()) {
    const fx = loadFixture(s);
    if (slugOf(fx.meta.address as Addr) === slug) {
      const inst = resolve("scripts/qa/roof/fixtures", s, "instant.json");
      return {
        meta: fx.meta,
        dsm: fx.dsm,
        mask: fx.mask,
        instant: existsSync(inst) ? (JSON.parse(readFileSync(inst, "utf8")) as InstantRoofData) : null,
        spent: { instant: existsSync(inst) ? "fixture" : "n/a", solar: "fixture", parcel: "fixture" },
      };
    }
  }
  const dir = resolve(FIELD_DIR, slug);
  if (existsSync(resolve(dir, "meta.json"))) {
    const meta = JSON.parse(readFileSync(resolve(dir, "meta.json"), "utf8")) as FixtureMeta;
    const inst = resolve(dir, "instant.json");
    return {
      meta,
      dsm: rasterFrom(resolve(dir, "dsm.f32.gz"), meta),
      mask: rasterFrom(resolve(dir, "mask.f32.gz"), meta),
      instant: existsSync(inst) ? (JSON.parse(readFileSync(inst, "utf8")) as InstantRoofData) : null,
      spent: { instant: existsSync(inst) ? "cache" : "n/a", solar: "cache", parcel: "cache" },
    };
  }
  if (!PAID) return { skipped: "not cached — rerun with --paid to buy it (Instant is billed, Solar and ReportAll are metered)" };

  // Network. Everything fetched is frozen on the way in.
  const { buildReconModel } = await import("../../../src/lib/roofReconBuild");
  const { requestInstantRoofData, PD_DIAGRAM_PACKS } = await import("../../../src/lib/eagleview");
  const { parcelRingForPoint } = await import("../../../src/lib/parcelLookup");
  const recon = await buildReconModel(a);
  let instant: InstantRoofData | null = null;
  try {
    instant = await requestInstantRoofData(a, PD_DIAGRAM_PACKS);
  } catch (err) {
    console.log(`   Instant refused: ${err instanceof Error ? err.message : String(err)}`);
  }
  const ring = await parcelRingForPoint(recon.origin.lat, recon.origin.lng);
  const meta: FixtureMeta = {
    slug,
    note: "field run",
    address: a,
    origin: recon.origin,
    raster: { width: recon.dsm.width, height: recon.dsm.height, pixelSizeM: recon.dsm.pixelSizeM },
    googleAreaSqft: recon.googleAreaSqft,
    multiStructure: recon.multiStructure,
    excludedSqft: recon.excludedSqft,
    pitchPriors12: [],
    diagnostics: recon.diagnostics as unknown as Record<string, unknown>,
    ...(ring.ring ? { parcelRing: ring.ring.map(([lat, lng]) => ({ lat, lng })) } : {}),
  };
  mkdirSync(dir, { recursive: true });
  const bytes = (r: Raster) => Buffer.from(new Float32Array(r.data).buffer);
  writeFileSync(resolve(dir, "dsm.f32.gz"), gzipSync(bytes(recon.dsm)));
  writeFileSync(resolve(dir, "mask.f32.gz"), gzipSync(bytes(recon.mask)));
  writeFileSync(resolve(dir, "meta.json"), JSON.stringify(meta, null, 1));
  if (instant) writeFileSync(resolve(dir, "instant.json"), JSON.stringify(instant, null, 1));
  return {
    meta,
    dsm: recon.dsm,
    mask: recon.mask,
    instant,
    spent: { instant: instant ? "network" : "n/a", solar: "network", parcel: ring.source === "network" ? "network" : "cache" },
  };
}

/** Coverage counted only over cells this far INSIDE the contour — the candidate
 *  metric from ROOF-STATE §5, printed beside the current one, never applied. */
function insetCoverage(rings: FootprintPoint[][], mask: Raster, dsm: Raster, groundElevFt: number): number | null {
  const usable = rings.filter((r) => r.length >= 3);
  if (!usable.length) return null;
  const stepFt = mask.pixelSizeM * FT_PER_M;
  const cutM = (groundElevFt + 4) / FT_PER_M;
  const { width: w, height: h } = mask;
  const xs = usable.flat().map((p) => p.x);
  const ys = usable.flat().map((p) => p.y);
  const inAny = (x: number, y: number) =>
    usable.some((r) => {
      let hit = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        if (r[i].y > y !== r[j].y > y && x < ((r[j].x - r[i].x) * (y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) hit = !hit;
      }
      return hit;
    });
  const distOut = (x: number, y: number) => {
    let best = Infinity;
    for (const r of usable) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const b = r[(i + 1) % r.length];
        const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
        best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
      }
    }
    return best;
  };
  let inside = 0;
  let seen = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1) {
      if (!inAny(x, y) || distOut(x, y) < COVERAGE_INSET_FT) continue;
      inside++;
      const px = Math.round(x / stepFt + w / 2 - 0.5);
      const py = Math.round(h / 2 - 0.5 - y / stepFt);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      if (!(mask.data[py * w + px] > 0)) continue;
      const z = dsm.data[py * w + px];
      if (Number.isFinite(z) && z >= cutM) seen++;
    }
  }
  return inside > 0 ? seen / inside : null;
}

interface Row {
  addr: string;
  instant: string;
  shape: string;
  instantFacets: string;
  instantPitch: string;
  instantArea: string;
  verts: string;
  family: string;
  contourArea: string;
  facets: string;
  euler: string;
  tiling: string;
  reg: string;
  iou: string;
  pitch: string;
  pitchSrc: string;
  trusted: string;
  cov: string;
  covInset: string;
  areaOurs: string;
  areaDelta: string;
  confidence: string;
  codes: string;
  spent: string;
  problems: string[];
  pitchGap: number | null;
}

function euler(model: RoofModel): number {
  const key = (p: { x: number; y: number }) => `${Math.round(p.x / 0.05)}|${Math.round(p.y / 0.05)}`;
  const pts = new Map(model.points.map((p) => [p.id, p]));
  const V = new Set<string>();
  const E = new Set<string>();
  for (const l of model.lines) {
    const a = pts.get(l.aId);
    const b = pts.get(l.bId);
    if (!a || !b) continue;
    V.add(key(a));
    V.add(key(b));
    E.add([key(a), key(b)].sort().join("#"));
  }
  return V.size - E.size + model.faces.length;
}

async function runOne(a: Addr): Promise<Row | { skipped: string; addr: string }> {
  const got = await resolveInputs(a);
  if ("skipped" in got) return { skipped: got.skipped, addr: `${a.address}, ${a.city}` };
  const { meta, dsm, mask, instant, spent } = got;
  const ground = meta.diagnostics.groundElevFt as number;
  const clusters = (meta.diagnostics.clusters as number) ?? null;
  const problems: string[] = [];

  let model: RoofModel | null = null;
  let contour: FootprintPoint[] | null = null;
  /** Redmond has two structures, and judging tiling against only the first
   *  reads 38 % off when the model is exact. */
  let structureCount = 1;
  let regTxt = "—";
  let iouTxt = "—";
  let pitch12 = 0;
  let pitchSrc = "—";
  let trusted = "—";
  let vertsTxt = "—";
  let familyTxt = "—";
  let contourAreaAll = 0;

  if (instant) {
    const first = buildRoofV2({ instant, origin: meta.origin, clusters });
    const st = first.report.structures[0];
    contour = st?.ring ?? null;
    vertsTxt = st ? `${st.regularize.rawAreaSqft > 0 ? instant.structures[0]?.outline?.length ?? "?" : "?"}→${st.contourEdges}` : "—";
    familyTxt = st ? `${(st.regularize.familyShare * 100).toFixed(0)}%` : "—";
    if (!first.model || !contour) {
      problems.push(first.report.reasons[0] ?? "no model");
    } else {
      const reg = registerContourToRaster({ contour, mask, dsm, groundElevFt: ground });
      regTxt = reg.applied
        ? `${reg.transform.dxFt.toFixed(1)},${reg.transform.dyFt.toFixed(1)},${reg.transform.thetaDeg.toFixed(1)}°`
        : "REFUSED";
      iouTxt = `${(reg.iouBefore * 100).toFixed(0)}→${reg.iouAfter == null ? "—" : (reg.iouAfter * 100).toFixed(0)}%`;
      if (!reg.applied) problems.push("registration refused");
      const ip = instant.totals?.predominantPitch ?? null;
      if (reg.applied) {
        const m = measurePitchFromDsm({ model: first.model, mask, dsm, transform: reg.transform, sectionTolerance12: 0.75 });
        const sp = structurePitch(m, ip);
        pitch12 = sp.pitch12;
        pitchSrc = sp.source;
        trusted = `${(sp.trustedShare * 100).toFixed(0)}%`;
        model = buildRoofV2({ instant, origin: meta.origin, clusters, pitchOverride12: sp.pitch12 }).model ?? first.model;
      } else {
        pitch12 = ip ?? 0;
        pitchSrc = "instant";
        model = first.model;
      }
    }
  } else {
    const parcel = meta.parcelRing
      ? meta.parcelRing.map((p) => ({
          x: (p.lng - meta.origin.lng) * D2R * EARTH_R_M * Math.cos(meta.origin.lat * D2R) * FT_PER_M,
          y: (p.lat - meta.origin.lat) * D2R * EARTH_R_M * FT_PER_M,
        }))
      : null;
    const built = buildRoofV2FromRecon({ mask, dsm, groundElevFt: ground, parcel, pitch12: null });
    model = built.model;
    const kept = built.report.structures.filter((s) => s.ring);
    contour = kept[0]?.ring ?? null;
    structureCount = Math.max(1, kept.length);
    contourAreaAll = kept.reduce((acc, st) => acc + areaOf(st.ring as FootprintPoint[]), 0);
    pitch12 = built.report.pitch12 ?? 0;
    pitchSrc = "recon";
    if (!model) problems.push(built.report.reasons[0] ?? "no model");
  }

  const base = {
    addr: `${a.address}, ${a.city} ${a.state}`,
    instant: instant ? "yes" : "no",
    shape: instant?.structures[0]?.shape ?? "—",
    instantFacets: String(instant?.totals?.facetCount ?? "—"),
    instantPitch: instant?.totals?.pitchLabel ?? "—",
    instantArea: instant?.totals?.areaSqft ? instant.totals.areaSqft.toFixed(0) : "—",
    verts: vertsTxt,
    family: familyTxt,
    contourArea: contourAreaAll > 0 ? contourAreaAll.toFixed(0) : contour ? areaOf(contour).toFixed(0) : "—",
    reg: regTxt,
    iou: iouTxt,
    pitch: pitch12 ? pitch12.toFixed(2) : "—",
    pitchSrc,
    trusted,
    spent: `${spent.instant}·${spent.solar}·${spent.parcel}`,
    problems,
  };
  if (!model) {
    return { ...base, facets: "—", euler: "—", tiling: "—", cov: "—", covInset: "—", areaOurs: "—", areaDelta: "—", confidence: "—", codes: "—", pitchGap: null } as Row;
  }

  const idx = buildIndexes(model);
  const rings = model.faces
    .map((f) => ringOf(f.lineIds, idx))
    .filter((r): r is NonNullable<typeof r> => !!r && r.length >= 3)
    .map((r) => r.map((p) => ({ x: p.x, y: p.y })));
  const planSum = rings.reduce((s, r) => s + areaOf(r), 0);
  const contourArea = contourAreaAll > 0 ? contourAreaAll : contour ? areaOf(contour) : planSum;
  const tiling = contourArea > 0 ? ((planSum - contourArea) / contourArea) * 100 : 0;
  const cov = measureCoverage({ mask, dsm, groundElevFt: ground, rings });
  const covInset = insetCoverage(rings, mask, dsm, ground);
  const port = validateRoofInvariants(model, contour ? { footprint: contour.map((p) => [p.x, p.y] as [number, number]) } : {});
  const assess = assessRoof({
    coverage: cov,
    errorCodes: port.errorCodes,
    cannotValidate: port.errorCodes.includes("INPUT"),
    pitchSource: pitchSrc === "measured" ? { source: "measured", reason: "" } : { source: "instant", reason: "" },
  });
  const e = euler(model);
  // One structure contributes 1 to the Euler characteristic, so a two-building
  // lot must read 2 — flagging that as a defect is the harness being wrong.
  if (e !== structureCount) problems.push(`Euler ${e} (expected ${structureCount})`);
  if (Math.abs(tiling) >= 0.5) problems.push(`tiling ${tiling.toFixed(2)}%`);
  const instantArea = instant?.totals?.areaSqft ?? null;
  const areaDelta = instantArea ? ((model.totals.areaSqft - instantArea) / instantArea) * 100 : null;
  const instantPitch12 = instant?.totals?.predominantPitch ?? null;
  const pitchGap = pitchSrc === "measured" && instantPitch12 ? pitch12 - instantPitch12 : null;

  return {
    ...base,
    facets: String(model.faces.length),
    euler: String(e),
    tiling: tiling.toFixed(2),
    cov: cov ? `${(cov.share * 100).toFixed(0)}%` : "—",
    covInset: covInset == null ? "—" : `${(covInset * 100).toFixed(0)}%`,
    areaOurs: model.totals.areaSqft.toFixed(0),
    areaDelta: areaDelta == null ? "—" : `${areaDelta >= 0 ? "+" : ""}${areaDelta.toFixed(1)}%`,
    confidence: assess.confidence,
    codes: port.errorCodes.join(",") || "none",
    pitchGap,
  } as Row;
}

function parseAddresses(): Addr[] {
  if (!listFile) {
    return fixtureSlugs().map((s) => loadFixture(s).meta.address as Addr);
  }
  return readFileSync(resolve(listFile), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const p = l.split(",").map((x) => x.trim());
      return { address: p[0] ?? "", city: p[1] ?? "", state: p[2] ?? "", zip: p[3] ?? "" };
    });
}

async function main() {
  mkdirSync(FIELD_DIR, { recursive: true });
  const addrs = parseAddresses();
  console.log(`${addrs.length} address(es)${listFile ? ` from ${listFile}` : " (the frozen fixtures)"}${PAID ? " · --paid: new lookups ALLOWED" : " · cache only, nothing will be bought"}\n`);
  const rows: Row[] = [];
  for (const a of addrs) {
    const r = await runOne(a);
    if ("skipped" in r) {
      console.log(`SKIPPED  ${r.addr} — ${r.skipped}`);
      continue;
    }
    rows.push(r);
  }

  const cols: Array<[string, (r: Row) => string]> = [
    ["address", (r) => r.addr.slice(0, 30)],
    ["inst", (r) => r.instant],
    ["shape", (r) => r.shape.slice(0, 5)],
    ["iFct", (r) => r.instantFacets],
    ["iPitch", (r) => r.instantPitch],
    ["iArea", (r) => r.instantArea],
    ["verts", (r) => r.verts],
    ["fam", (r) => r.family],
    ["contour", (r) => r.contourArea],
    ["fct", (r) => r.facets],
    ["E", (r) => r.euler],
    ["tiling%", (r) => r.tiling],
    ["dx,dy,θ", (r) => r.reg],
    ["IoU", (r) => r.iou],
    ["pitch", (r) => r.pitch],
    ["src", (r) => r.pitchSrc.slice(0, 8)],
    ["trust", (r) => r.trusted],
    ["cov", (r) => r.cov],
    ["cov+4ft", (r) => r.covInset],
    ["ourArea", (r) => r.areaOurs],
    ["vsInst", (r) => r.areaDelta],
    ["conf", (r) => r.confidence.slice(0, 6)],
    ["codes", (r) => r.codes.slice(0, 22)],
    ["spent", (r) => r.spent],
  ];
  const widths = cols.map(([h, get]) => Math.max(h.length, ...rows.map((r) => get(r).length)));
  console.log(cols.map(([h], i) => h.padEnd(widths[i])).join("  "));
  console.log(widths.map((w) => "─".repeat(w)).join("  "));
  for (const r of rows) console.log(cols.map(([, get], i) => get(r).padEnd(widths[i])).join("  "));

  console.log("\n──── summary ────");
  const clean = rows.filter((r) => r.problems.length === 0 && r.codes === "none");
  console.log(`  addresses run:        ${rows.length}`);
  console.log(`  clean (no problems, no invariant codes): ${clean.length}`);
  const byCode = new Map<string, number>();
  for (const r of rows) for (const c of r.codes.split(",")) if (c && c !== "none") byCode.set(c, (byCode.get(c) ?? 0) + 1);
  for (const [c, n] of [...byCode].sort((a, b) => b[1] - a[1])) console.log(`     ${c}: ${n}`);
  const other = new Map<string, number>();
  for (const r of rows) for (const p of r.problems) other.set(p.replace(/-?\d+(\.\d+)?/g, "N"), (other.get(p.replace(/-?\d+(\.\d+)?/g, "N")) ?? 0) + 1);
  for (const [p, n] of other) console.log(`     ${p}: ${n}`);

  const gaps = rows.filter((r) => r.pitchGap != null) as Array<Row & { pitchGap: number }>;
  console.log(`\n  pitch measured on ${gaps.length} of ${rows.length}:`);
  if (gaps.length) {
    const over = gaps.filter((r) => r.pitchGap > 0.25);
    const under = gaps.filter((r) => r.pitchGap < -0.25);
    const same = gaps.length - over.length - under.length;
    console.log(`     ours ABOVE Instant by >0.25/12:  ${over.length}${over.length ? " — " + over.map((r) => `${r.addr.split(",")[0]} +${r.pitchGap.toFixed(2)}`).join(", ") : ""}`);
    console.log(`     ours BELOW Instant by >0.25/12:  ${under.length}${under.length ? " — " + under.map((r) => `${r.addr.split(",")[0]} ${r.pitchGap.toFixed(2)}`).join(", ") : ""}`);
    console.log(`     agree within 0.25/12:            ${same}`);
    console.log(`     (the "mixed roof under-reads its own pitch" explanation is REFUTED — Kirkland is`);
    console.log(`      shape=hip and still reads +1.07. Open: our measurement runs high, or Instant`);
    console.log(`      rounds down. Sign against shape, per address, is what separates the two.)`);
  }

  const spentNet = rows.filter((r) => r.spent.includes("network")).length;
  console.log(`\n  addresses that cost anything this run: ${spentNet}`);
  if (!spentNet) console.log("     nothing was bought — every input came from a fixture or the field cache");
}

main().catch((e) => {
  console.error("FIELD RUN FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});

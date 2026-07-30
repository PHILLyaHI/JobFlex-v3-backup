/**
 * Accuracy harness for the synthetic roof reconstruction.
 *
 *   npx tsx scripts/roof-recon-eval.ts [reportId ...]
 *
 * For each EagleView sandbox report it loads the ordered report as GROUND TRUTH,
 * runs the Google-Solar-DSM reconstruction at the same coordinates, and scores
 * the two against each other. This is the gate that decides whether a synthetic
 * model is good enough to show a contractor at all.
 *
 * Not a test framework (the repo has none by policy) — a plain tsx script that
 * prints a table and exits 0. Reads GOOGLE_MAPS_API_KEY / EAGLEVIEW_* from
 * .env.local itself, since tsx does not load Next's env files.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── env ──────────────────────────────────────────────────────────────────────
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* optional */
  }
}

import { getMeasurementModel, getReportSummary, type RoofModel, EV_LINE_TYPES } from "../src/lib/eagleview";
import { getBuildingInsights, getDataLayers, fetchRaster } from "../src/lib/solar";
import { reconstructRoof, latLngRingToFrame } from "../src/lib/roofRecon";
import { fetchParcelRing } from "../src/lib/parcel";

const DEFAULT_REPORTS = [69153261, 69077209, 69110976];
const M2_TO_SQFT = 10.7639;

// Targets from the approved plan.
const TARGET = {
  areaPct: 8,
  pitchDelta: 1,
  facetDelta: 2,
  footagePct: 15,
};

// Tuning knobs via env so the constants can be swept without editing source:
//   RECON_SIMPLIFY=3.0 RECON_WELD=2.5 npx tsx scripts/roof-recon-eval.ts
function reconOpts() {
  const n = (k: string) => (process.env[k] ? Number(process.env[k]) : undefined);
  const o = {
    simplifyTolFt: n("RECON_SIMPLIFY"),
    weldTolFt: n("RECON_WELD"),
    angleTolDeg: n("RECON_ANGLE"),
    planeTolFt: n("RECON_PLANE"),
    minFacetSqft: n("RECON_MINFACET"),
    snapTolDeg: n("RECON_SNAP"),
    normalWindow: n("RECON_WINDOW"),
    mergeAngleDeg: n("RECON_MERGE"), //      0 disables coplanar merging
    pitchSnapMax12: n("RECON_PITCHSNAP"), // 0 disables pitch quantization
    azimuthSnapMaxDeg: n("RECON_AZSNAP"), // 0 disables azimuth quantization
    wallStepFt: n("RECON_WALLSTEP"),
  };
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pct = (a: number, b: number) => (b === 0 ? NaN : ((a - b) / b) * 100);
const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const pad = (s: string, n: number) => s.padEnd(n);
const mark = (ok: boolean) => (ok ? "PASS" : "FAIL");

interface Row {
  reportId: number;
  address: string;
  ok: boolean;
  note?: string;
  areaPct?: number;
  pitchDelta?: number;
  facetDelta?: number;
  worstFootage?: { type: string; pct: number };
  googleAreaPct?: number;
}

async function evaluate(reportId: number): Promise<Row> {
  // ── ground truth ──
  const summary = await getReportSummary(reportId);
  const truth: RoofModel = await getMeasurementModel(reportId);
  const address = [summary.street, summary.city, summary.state].filter(Boolean).join(", ");
  const lat = Number(summary.raw.Latitude);
  const lng = Number(summary.raw.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { reportId, address, ok: false, note: "report has no lat/lng" };
  }

  console.log(`\n${"═".repeat(78)}`);
  console.log(`Report ${reportId} — ${address}  (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
  console.log("═".repeat(78));
  console.log(
    `EagleView truth : ${f(truth.totals.areaSqft, 0)} sqft · ${f(truth.totals.squares)} sq · ` +
      `${truth.totals.facetCount} facets · ${f(truth.totals.predominantPitch, 0)}/12`,
  );

  // ── Google's own summary, as a third opinion + pitch priors ──
  let googleAreaPct: number | undefined;
  let pitchPriors12: number[] = [];
  try {
    const bi = await getBuildingInsights(lat, lng);
    pitchPriors12 = [
      ...new Set(
        bi.segments
          .map((s) => Math.round(Math.tan((s.pitchDegrees * Math.PI) / 180) * 12))
          .filter((p) => p >= 1 && p <= 24),
      ),
    ];
    const gArea = bi.wholeRoofAreaM2 != null ? bi.wholeRoofAreaM2 * M2_TO_SQFT : NaN;
    googleAreaPct = pct(gArea, truth.totals.areaSqft);
    console.log(
      `Google summary  : ${f(gArea, 0)} sqft · ${bi.segments.length} segments · ` +
        `quality ${bi.imageryQuality} · imagery ${bi.imageryDate?.year ?? "?"}-${bi.imageryDate?.month ?? "?"}` +
        `  (area ${f(googleAreaPct)}%)`,
    );
  } catch (err) {
    console.log(`Google summary  : unavailable — ${msg(err)}`);
  }

  // ── reconstruction ──
  const layers = await getDataLayers(lat, lng);
  if (!layers.dsmUrl || !layers.maskUrl) {
    return { reportId, address, ok: false, note: "no DSM/mask for this location" };
  }
  const [dsm, mask] = await Promise.all([fetchRaster(layers.dsmUrl), fetchRaster(layers.maskUrl)]);
  if (dsm.width !== mask.width || dsm.height !== mask.height) {
    return { reportId, address, ok: false, note: "DSM and mask grids differ" };
  }

  // Parcel ring scopes which of the tile's structures belong to this property.
  // NO_PARCEL=1 to measure the difference it makes.
  let parcel;
  // FAKE_PARCEL_FT=60 substitutes a circular pseudo-parcel of that radius around
  // the pin. It is NOT a substitute for real parcel data — it exists so the
  // multi-structure scoping path can be exercised while the Regrid token is dead.
  const fakeR = process.env.FAKE_PARCEL_FT ? Number(process.env.FAKE_PARCEL_FT) : 0;
  if (fakeR > 0) {
    parcel = {
      ring: Array.from({ length: 32 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2;
        return { x: Math.cos(a) * fakeR, y: Math.sin(a) * fakeR };
      }),
    };
    console.log(`Parcel          : SIMULATED ${fakeR} ft radius (not real parcel data)`);
  } else if (!process.env.NO_PARCEL) {
    const ring = await fetchParcelRing(lat, lng);
    if (ring.length >= 3) parcel = latLngRingToFrame({ lat, lng }, ring);
    console.log(
      `Parcel          : ${ring.length ? `${ring.length} vertices from Regrid` : "unavailable — falling back to the pin's structure"}`,
    );
  }

  const t0 = Date.now();
  const { model, diagnostics } = reconstructRoof(dsm, mask, {
    ...reconOpts(),
    parcel,
    pitchPriors12: process.env.NO_PRIORS ? [] : pitchPriors12,
  });
  const ms = Date.now() - t0;

  console.log(
    `Reconstructed   : ${f(model.totals.areaSqft, 0)} sqft · ${f(model.totals.squares)} sq · ` +
      `${model.totals.facetCount} facets · ${f(model.totals.predominantPitch, 0)}/12   [${ms} ms]`,
  );
  console.log(
    `  raster ${dsm.width}x${dsm.height} @ ${dsm.pixelSizeM} m/px · quality ${layers.imageryQuality} · ` +
      `building ${diagnostics.buildingPx} px (${f(diagnostics.planPolygonSqft, 0)} sqft plan) · ` +
      `${diagnostics.clusters} clusters, ${diagnostics.droppedClusters} dropped`,
  );
  const bf = diagnostics.branchFt;
  console.log(
    `  ${diagnostics.lineCount} lines by probe: ` +
      (["crease", "perimeter", "sameFacet", "offRoof"] as const)
        .map((k) => `${k} ${diagnostics.branch[k]} (${f(bf[k], 0)}ft)`)
        .join(" · "),
  );
  console.log(
    `  mask outline ${f(diagnostics.maskPerimeterFt, 0)} ft vs perimeter edges ` +
      `${f(bf.perimeter, 0)} ft  (coverage ${f((bf.perimeter / diagnostics.maskPerimeterFt) * 100, 0)}%)`,
  );
  const px = diagnostics.tracePx, co = diagnostics.corners;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  console.log(
    `  traced px/facet: ${Math.min(...px)}–${Math.max(...px)} (mean ${f(sum(px) / px.length, 0)}) · ` +
      `corners/facet: ${Math.min(...co)}–${Math.max(...co)} (mean ${f(sum(co) / co.length, 1)}) · ` +
      `expected px/facet ≈ ${f(sum(px) / px.length, 0)}`,
  );
  const uniq = [...new Set(diagnostics.pitches12.map((p) => Math.round(p * 10) / 10))].sort(
    (a, b) => a - b,
  );
  console.log(
    `  dropped ${diagnostics.droppedSteep} too-steep · ` +
      `merged ${diagnostics.fragmentsMerged} of ${diagnostics.fragmentsBefore} fragments · ` +
      `pitch priors [${pitchPriors12.join(", ")}] · final pitches [${uniq.join(", ")}]`,
  );
  const comps = diagnostics.maskComponentsSqft;
  console.log(
    `  structures in tile: ${comps.length} → [${comps.map((c) => f(c, 0)).join(", ")}] sqft plan · ` +
      `measured ${diagnostics.keptComponents}` +
      `${diagnostics.parcelScoped ? " (parcel-scoped)" : " (pin only — no parcel)"}`,
  );

  const areaPct = pct(model.totals.areaSqft, truth.totals.areaSqft);
  const pitchDelta = Math.abs(model.totals.predominantPitch - truth.totals.predominantPitch);
  const facetDelta = Math.abs(model.totals.facetCount - truth.totals.facetCount);

  // ── per-line-type footage ──
  console.log(`\n  ${pad("line type", 12)}${pad("truth ft", 11)}${pad("recon ft", 11)}delta`);
  let worst: { type: string; pct: number } = { type: "—", pct: 0 };
  let truthTotal = 0, reconTotal = 0;
  for (const t of EV_LINE_TYPES) {
    const a = truth.totals.footageByType[t];
    const b = model.totals.footageByType[t];
    truthTotal += a;
    reconTotal += b;
    if (a < 5 && b < 5) continue; // ignore types neither model uses
    const d = pct(b, a);
    if (Number.isFinite(d) && Math.abs(d) > Math.abs(worst.pct)) worst = { type: t, pct: d };
    console.log(`  ${pad(t, 12)}${pad(f(a, 0), 11)}${pad(f(b, 0), 11)}${f(d)}%`);
  }
  // Total edge length is the single best signal for polygon jaggedness: a
  // correct blueprint has roughly the truth's perimeter, a staircase has 2-3x.
  console.log(
    `  ${pad("TOTAL", 12)}${pad(f(truthTotal, 0), 11)}${pad(f(reconTotal, 0), 11)}${f(pct(reconTotal, truthTotal))}%`,
  );

  console.log(
    `\n  area ${f(areaPct)}% ${mark(Math.abs(areaPct) <= TARGET.areaPct)}` +
      ` · pitch Δ${f(pitchDelta, 0)} ${mark(pitchDelta <= TARGET.pitchDelta)}` +
      ` · facets Δ${facetDelta} ${mark(facetDelta <= TARGET.facetDelta)}` +
      ` · worst footage ${worst.type} ${f(worst.pct)}% ${mark(Math.abs(worst.pct) <= TARGET.footagePct)}`,
  );

  return {
    reportId,
    address,
    ok: true,
    areaPct,
    pitchDelta,
    facetDelta,
    worstFootage: worst,
    googleAreaPct,
  };
}

async function main() {
  const ids = process.argv.slice(2).map(Number).filter(Number.isFinite);
  const reports = ids.length ? ids : DEFAULT_REPORTS;
  console.log(`Evaluating ${reports.length} report(s): ${reports.join(", ")}`);

  const rows: Row[] = [];
  for (const id of reports) {
    try {
      rows.push(await evaluate(id));
    } catch (err) {
      console.log(`\nReport ${id}: ERROR — ${msg(err)}`);
      rows.push({ reportId: id, address: "", ok: false, note: msg(err) });
    }
  }

  console.log(`\n${"═".repeat(78)}\nSUMMARY\n${"═".repeat(78)}`);
  console.log(
    `${pad("report", 11)}${pad("area %", 10)}${pad("pitch Δ", 9)}${pad("facet Δ", 9)}${pad("worst ft", 20)}google %`,
  );
  for (const r of rows) {
    if (!r.ok) {
      console.log(`${pad(String(r.reportId), 11)}${r.note ?? "failed"}`);
      continue;
    }
    console.log(
      pad(String(r.reportId), 11) +
        pad(f(r.areaPct!), 10) +
        pad(f(r.pitchDelta!, 0), 9) +
        pad(String(r.facetDelta), 9) +
        pad(`${r.worstFootage!.type} ${f(r.worstFootage!.pct)}%`, 20) +
        f(r.googleAreaPct ?? NaN),
    );
  }
  const scored = rows.filter((r) => r.ok);
  if (scored.length) {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(
      `\nmean |area error| ${f(mean(scored.map((r) => Math.abs(r.areaPct!))))}% · ` +
        `mean pitch Δ ${f(mean(scored.map((r) => r.pitchDelta!)))} · ` +
        `mean facet Δ ${f(mean(scored.map((r) => r.facetDelta!)))}`,
    );
    console.log(
      `\nPlan targets: area <${TARGET.areaPct}% · pitch Δ<=${TARGET.pitchDelta} · ` +
        `facets Δ<=${TARGET.facetDelta} · footage <${TARGET.footagePct}%`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

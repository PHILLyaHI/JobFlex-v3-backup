/**
 * Phase 1 report — one outline PER STRUCTURE, offline from the fixtures.
 *
 *   npx tsx scripts/qa/roof/phase1.ts [slug-substring] [--erosion]
 *
 * Per fixture: which mask components are this property's, then per structure
 * the vertices and short edges before/after regularisation, the family share of
 * the perimeter with whatever is left off it, and the area WARNING measured as
 * plan × slope factor against Google's (sloped) area. --erosion adds the
 * mask-generosity diagnostic. Writes <fixture>/footprint.svg.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { RoofModel } from "../../../src/lib/eagleview";
import type { Raster } from "../../../src/lib/solar";
import { buildIndexes, ringOf } from "../../../src/components/estimator/roof/roofGeometry";
import {
  areaOf,
  buildStructureFootprints,
  type FootprintPoint,
  type StructureFootprint,
} from "../../../src/lib/roofRecon/footprint";
import { FIXTURE_DIR, fixtureSlugs, loadFixture, type Fixture } from "./fixture";

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;

/** Parcel ring (lat/lng) → frame feet, the same equirectangular the recon uses. */
function parcelInFrame(fx: Fixture): FootprintPoint[] | null {
  const ring = fx.meta.parcelRing;
  if (!ring || ring.length < 3) return null;
  const o = fx.meta.origin;
  return ring.map((p) => ({
    x: (p.lng - o.lng) * D2R * EARTH_R_M * Math.cos(o.lat * D2R) * FT_PER_M,
    y: (p.lat - o.lat) * D2R * EARTH_R_M * FT_PER_M,
  }));
}

/**
 * Area-weighted slope factor from the facets' GEOMETRIC pitch — the gradient of
 * each facet's own least-squares plane, not the label it carries (the labels
 * fail R04 on every fixture, so they cannot be used to lift a plan area).
 */
function geometricSlopeFactor(model: RoofModel): { factor: number; pitch12: number } {
  const idx = buildIndexes(model);
  let wSum = 0;
  let pSum = 0;
  for (const f of model.faces) {
    const ring = ringOf(f.lineIds, idx);
    if (!ring || ring.length < 3) continue;
    const n = ring.length;
    let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0, sx = 0, sy = 0, sz = 0;
    for (const p of ring) {
      sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y;
      sxz += p.x * p.z; syz += p.y * p.z; sx += p.x; sy += p.y; sz += p.z;
    }
    const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
    const B = [sxz, syz, sz];
    let ok = true;
    for (let i = 0; i < 3 && ok; i++) {
      let piv = i;
      for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      if (Math.abs(A[piv][i]) < 1e-9) { ok = false; break; }
      [A[i], A[piv]] = [A[piv], A[i]];
      [B[i], B[piv]] = [B[piv], B[i]];
      for (let r = 0; r < 3; r++) {
        if (r === i) continue;
        const k = A[r][i] / A[i][i];
        for (let c = i; c < 3; c++) A[r][c] -= k * A[i][c];
        B[r] -= k * B[i];
      }
    }
    if (!ok) continue;
    const grad = Math.hypot(B[0] / A[0][0], B[1] / A[1][1]);
    const planArea = areaOf(ring.map((p) => ({ x: p.x, y: p.y })));
    wSum += planArea;
    pSum += planArea * grad * 12;
  }
  const pitch12 = wSum > 0 ? pSum / wSum : 0;
  return { factor: Math.sqrt(1 + (pitch12 / 12) ** 2), pitch12 };
}

/** Erode a mask by n pixels — DIAGNOSTIC ONLY, never part of the pipeline. */
function eroded(mask: Raster, n: number): Raster {
  const { width: w, height: h } = mask;
  let bin = new Uint8Array(w * h);
  for (let i = 0; i < bin.length; i++) bin[i] = mask.data[i] > 0.5 ? 1 : 0;
  for (let pass = 0; pass < n; pass++) {
    const out = new Uint8Array(bin.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let all = 1;
        for (let dy = -1; dy <= 1 && all; dy++) {
          for (let dx = -1; dx <= 1 && all; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || !bin[ny * w + nx]) all = 0;
          }
        }
        out[y * w + x] = all;
      }
    }
    bin = out;
  }
  const data = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin[i];
  return { width: w, height: h, pixelSizeM: mask.pixelSizeM, data } as Raster;
}

function ascii(ring: FootprintPoint[], cols = 54, rows = 22): string {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(" "));
  const put = (p: FootprintPoint, ch: string) => {
    const cx = Math.round(((p.x - minX) / Math.max(maxX - minX, 1e-6)) * (cols - 1));
    const cy = Math.round(((maxY - p.y) / Math.max(maxY - minY, 1e-6)) * (rows - 1));
    if (cy >= 0 && cy < rows && cx >= 0 && cx < cols) grid[cy][cx] = ch;
  };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const steps = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 2));
    for (let s = 0; s <= steps; s++) put({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps }, "·");
  }
  for (const p of ring) put(p, "o");
  return grid.map((r) => "     " + r.join("")).join("\n");
}

function svg(fx: Fixture, structures: StructureFootprint[], parcel: FootprintPoint[] | null): string {
  const pts = [...structures.flatMap((s) => s.ring ?? []), ...(parcel ?? [])];
  if (!pts.length) return "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'></svg>";
  const pad = 10;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  const W = 900;
  const scale = W / (maxX - minX);
  const H = Math.round((maxY - minY) * scale);
  const X = (v: number) => ((v - minX) * scale).toFixed(1);
  const Y = (v: number) => ((maxY - v) * scale).toFixed(1);
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#fbfbf9"/>`,
  ];
  if (parcel) {
    out.push(
      `<path d="${parcel.map((p, i) => `${i ? "L" : "M"}${X(p.x)},${Y(p.y)}`).join(" ")} Z" fill="none" stroke="#b9a06a" stroke-width="1.5" stroke-dasharray="6 4"/>`,
    );
  }
  const colours = ["#1854a0", "#0f8a5f", "#a0521a"];
  structures.forEach((s, i) => {
    if (!s.ring) return;
    const c = colours[i % colours.length];
    out.push(`<path d="${s.ring.map((p, k) => `${k ? "L" : "M"}${X(p.x)},${Y(p.y)}`).join(" ")} Z" fill="${c}14" stroke="${c}" stroke-width="2.5"/>`);
    for (const p of s.ring) out.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3" fill="${c}"/>`);
    const cx = s.ring.reduce((a, p) => a + p.x, 0) / s.ring.length;
    const cy = s.ring.reduce((a, p) => a + p.y, 0) / s.ring.length;
    out.push(
      `<text x="${X(cx)}" y="${Y(cy)}" font-family="monospace" font-size="15" fill="${c}" text-anchor="middle">${s.prefix} · ${areaOf(s.ring).toFixed(0)} sq ft · ${s.ring.length}v</text>`,
    );
  });
  out.push(
    `<text x="10" y="20" font-family="monospace" font-size="13" fill="#222">${fx.slug} — ${structures.length} structure(s); dashed = parcel</text>`,
    "</svg>",
  );
  return out.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const filter = args.find((a) => !a.startsWith("--"));
  const withErosion = args.includes("--erosion");

  for (const slug of fixtureSlugs(filter)) {
    const fx = loadFixture(slug);
    const parcel = parcelInFrame(fx);
    const sf = geometricSlopeFactor(fx.model);
    const res = buildStructureFootprints(fx.mask, {
      parcel,
      googleAreaSqft: fx.meta.googleAreaSqft,
      slopeFactor: sf.factor,
    });

    console.log(`\n══ ${slug} ══  ${fx.meta.address.address}, ${fx.meta.address.city}`);
    console.log(
      `parcel: ${parcel ? `${parcel.length} pts` : "NONE — only the pin structure is measured"}` +
        ` · geometric pitch ${sf.pitch12.toFixed(2)}/12 → slope factor ${sf.factor.toFixed(3)}`,
    );
    for (const r of res.reasons) console.log(`   ! ${r}`);
    const kept = res.components.filter((c) => c.kept);
    console.log(`components: ${res.components.length} total, ${kept.length} kept`);
    for (const c of [...res.components].sort((a, b) => b.areaSqft - a.areaSqft).slice(0, 6)) {
      console.log(`   ${c.kept ? "KEPT   " : "dropped"} ${c.areaSqft.toFixed(0).padStart(5)} sq ft · ${c.reason}`);
    }

    let planTotal = 0;
    for (const s of res.structures) {
      const r = s.report;
      planTotal += s.ring ? areaOf(s.ring) : 0;
      console.log(
        `\n   [${s.prefix}] mask ${s.maskAreaSqft.toFixed(0)} sq ft →` +
          ` vertices ${r.rawVertices} → ${r.vertices} · edges < 3 ft ${r.rawEdgesUnder3Ft} → ${r.edgesUnder3Ft}` +
          ` · perimeter ${r.perimeterFt.toFixed(1)} ft · plan ${r.areaSqft.toFixed(0)} sq ft`,
      );
      console.log(
        `        family share ${(r.familyShare * 100).toFixed(1)}% · axis ${r.axisDeg.toFixed(1)}°` +
          ` · asserts: vertices ≤ 16 ${r.asserts.vertices ? "PASS" : "FAIL"} · family ≥ 85% ${r.asserts.angles ? "PASS" : "FAIL"}`,
      );
      if (r.staircaseEdgesRemoved.length) {
        console.log(
          `        staircase edges removed: ${r.staircaseEdgesRemoved
            .map((e) => `${e.lengthFt.toFixed(1)} ft @ ${e.offDeg.toFixed(1)}° (corner ${e.shiftFt.toFixed(2)} ft, area ${(e.areaShare * 100).toFixed(2)}%)`)
            .join("; ")}`,
        );
      }
      if (r.offFamily.length) {
        console.log(`        left off family: ${r.offFamily.map((e) => `${e.lengthFt.toFixed(1)} ft @ ${e.offDeg.toFixed(1)}°`).join("; ")}`);
      }
      if (s.ring) console.log(ascii(s.ring));
    }

    const lifted = planTotal * sf.factor;
    const g = fx.meta.googleAreaSqft;
    console.log(
      `\n   AREA: plan ${planTotal.toFixed(0)} × ${sf.factor.toFixed(3)} = ${lifted.toFixed(0)} sq ft` +
        `${g ? ` vs google ${g.toFixed(0)} → ${(((lifted - g) / g) * 100).toFixed(1)}%` : ""}` +
        `${g && Math.abs(lifted - g) / g > 0.1 ? "  ⚠ outside the ±10% band" : "  (within ±10%)"}`,
    );

    if (withErosion && g) {
      console.log("   erosion diagnostic (mask generosity — NOT applied in the pipeline):");
      for (const n of [0, 1, 2]) {
        const m = n === 0 ? fx.mask : eroded(fx.mask, n);
        const e = buildStructureFootprints(m, { parcel, googleAreaSqft: g, slopeFactor: sf.factor });
        const plan = e.structures.reduce((a, s2) => a + (s2.ring ? areaOf(s2.ring) : 0), 0);
        const lift = plan * sf.factor;
        console.log(
          `     erode ${n} px: plan ${plan.toFixed(0)} → lifted ${lift.toFixed(0)} sq ft` +
            ` · ${(((lift - g) / g) * 100).toFixed(1)}% vs google · structures ${e.structures.length}`,
        );
      }
    }

    writeFileSync(resolve(FIXTURE_DIR, slug, "footprint.svg"), svg(fx, res.structures, parcel));
    console.log(`   overlay → ${resolve(FIXTURE_DIR, slug, "footprint.svg")}`);
  }
}

main();

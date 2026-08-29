/* The undershoot census — the data the extension fraction is DERIVED from (§J).
 *
 *   npx tsx scripts/qa/roof/line-gaps.ts
 *
 * Every measured line's endpoint on a real roof terminates at a junction: on
 * the contour or on another line. The measured endpoints stop short because
 * cluster borders erode near junctions. For each endpoint of every step-1
 * line, cast the line's own ray outward and record the distance to the first
 * hit (another measured line or the contour), absolute and as a fraction of
 * the line's own length. The extension fraction is read off this table, not
 * invented.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData } from "@/lib/eagleview";
import type { Raster } from "@/lib/solar";
import { reconstructRoof } from "@/lib/roofRecon";
import { buildRoofV2 } from "@/lib/roofRecon/reconV2";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measureDsmLayout, type ReconLayoutDiagnostics } from "@/lib/roofRecon/measuredLines";
import type { FootprintPoint } from "@/lib/roofRecon/footprint";
import { loadFixture, type FixtureMeta } from "./fixture";

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

type Seg = { a: FootprintPoint; b: FootprintPoint };

/** Distance along ray (o + t·d, t>0) to segment s, or Infinity. */
function rayHit(o: FootprintPoint, d: FootprintPoint, s: Seg): number {
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  const den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-12) return Infinity;
  const t = ((s.a.x - o.x) * ey - (s.a.y - o.y) * ex) / den;
  const u = ((s.a.x - o.x) * d.y - (s.a.y - o.y) * d.x) / -den;
  return t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : Infinity;
}

(async () => {
  const all: Array<{ addr: string; type: string; lenFt: number; gapFt: number; frac: number; target: string }> = [];

  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    let dsm: Raster, mask: Raster;
    if (job.fixture) { const fx = loadFixture(job.fixture); dsm = fx.dsm; mask = fx.mask; }
    else { dsm = rasterFrom(resolve(job.dir, "dsm.f32.gz"), meta); mask = rasterFrom(resolve(job.dir, "mask.f32.gz"), meta); }
    const ground = meta.diagnostics.groundElevFt as number;

    const first = buildRoofV2({ instant, origin: meta.origin, clusters: (meta.diagnostics.clusters as number) ?? null });
    const kept = first.report.structures.filter((s) => s.ring);
    if (!kept.length || !first.model) continue;
    const rings = kept.map((k) => k.ring as FootprintPoint[]);
    const reg = registerContourToRaster({ contour: rings[0], mask, dsm, groundElevFt: ground });
    const T = reg.applied ? reg.transform : { dxFt: 0, dyFt: 0, thetaDeg: 0 };
    const th = (T.thetaDeg * Math.PI) / 180;
    const movedRings = rings.map((r) => r.map((p) => ({ x: p.x * Math.cos(th) - p.y * Math.sin(th) + T.dxFt, y: p.x * Math.sin(th) + p.y * Math.cos(th) + T.dyFt })));

    const recon = reconstructRoof(dsm as never, mask as never);
    const m = measureDsmLayout({ dsm, diagnostics: recon.diagnostics as unknown as ReconLayoutDiagnostics, movedRings });

    const contourSegs: Seg[] = movedRings.flatMap((r) => r.map((p, i) => ({ a: p, b: r[(i + 1) % r.length] })));
    for (let li = 0; li < m.lines.length; li++) {
      const l = m.lines[li];
      const others: Array<{ s: Seg; what: string }> = [
        ...m.lines.filter((_, i) => i !== li).map((o) => ({ s: o, what: "line" })),
        ...contourSegs.map((s) => ({ s, what: "contour" })),
      ];
      for (const [o, far] of [[l.a, l.b], [l.b, l.a]] as const) {
        const len = Math.hypot(o.x - far.x, o.y - far.y);
        if (len < 1e-6) continue;
        const d = { x: (o.x - far.x) / len, y: (o.y - far.y) / len };
        // Junction candidates: intersections of THIS line's support ray with
        // the SUPPORTS of other lines (mutual extension — at a real apex all
        // parties stop short) and with contour segments (no extension there:
        // the contour is complete).
        let best = Infinity;
        let what = "-";
        let partner = 0;
        for (const t of others) {
          if (t.what === "contour") {
            const hit = rayHit(o, d, t.s);
            if (hit < best) { best = hit; what = "contour"; partner = 0; }
          } else {
            const ex = t.s.b.x - t.s.a.x;
            const ey = t.s.b.y - t.s.a.y;
            const eLen = Math.hypot(ex, ey) || 1;
            const den = d.x * ey - d.y * ex;
            if (Math.abs(den) < 1e-12) continue;
            const tt = ((t.s.a.x - o.x) * ey - (t.s.a.y - o.y) * ex) / den;
            if (tt <= 1e-9) continue;
            const u = ((t.s.a.x - o.x) * d.y - (t.s.a.y - o.y) * d.x) / -den; // param on other's support, 0..1 inside
            // partner's own needed extension to reach the junction, ft
            const pExt = u < 0 ? -u * eLen : u > 1 ? (u - 1) * eLen : 0;
            if (tt < best) { best = tt; what = "line"; partner = pExt; }
          }
        }
        if (!Number.isFinite(best)) continue;
        all.push({ addr: job.key, type: l.type, lenFt: l.lengthFt, gapFt: best, frac: best / l.lengthFt, target: what === "line" ? `line (partner needs ${partner.toFixed(1)} ft)` : what });
        if (l.type === "VALLEY" && l.lengthFt > 15)
          console.log(`  [big valley] ${job.key} ${l.lengthFt.toFixed(0)} ft: end gap ${best.toFixed(1)} ft to ${what}${what === "line" ? ` (partner ${partner.toFixed(1)} ft)` : ""}`);
      }
    }
  }

  console.log("addr    type    len ft   gap ft   gap/len   hits");
  const byAddr = new Map<string, typeof all>();
  for (const r of all) {
    const arr = byAddr.get(r.addr) ?? [];
    arr.push(r);
    byAddr.set(r.addr, arr);
  }
  for (const [addr, rows] of byAddr) {
    rows.sort((x, y) => y.frac - x.frac);
    const g = rows.map((r) => r.gapFt).sort((x, y) => x - y);
    const f = rows.map((r) => r.frac).sort((x, y) => x - y);
    const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
    console.log(`${addr.padEnd(7)} endpoints ${String(rows.length).padStart(2)} · gap ft med ${q(g, 0.5).toFixed(1)} p90 ${q(g, 0.9).toFixed(1)} max ${g[g.length - 1].toFixed(1)} · gap/len med ${q(f, 0.5).toFixed(2)} p90 ${q(f, 0.9).toFixed(2)} max ${f[f.length - 1].toFixed(2)}`);
    for (const r of rows.slice(0, 3)) console.log(`    worst: ${r.type} ${r.lenFt.toFixed(0)} ft → gap ${r.gapFt.toFixed(1)} ft (${(r.frac * 100).toFixed(0)}% of own length) to ${r.target}`);
  }
  const f = all.map((r) => r.frac).sort((x, y) => x - y);
  const g = all.map((r) => r.gapFt).sort((x, y) => x - y);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  console.log("─".repeat(80));
  console.log(`ALL ${all.length} endpoints · gap ft: med ${q(g, 0.5).toFixed(1)} p90 ${q(g, 0.9).toFixed(1)} p95 ${q(g, 0.95).toFixed(1)} max ${g[g.length - 1].toFixed(1)}`);
  console.log(`gap/len: med ${q(f, 0.5).toFixed(2)} p90 ${q(f, 0.9).toFixed(2)} p95 ${q(f, 0.95).toFixed(2)} max ${f[f.length - 1].toFixed(2)}`);
  for (const cap of [3, 6, 9, 12]) {
    const ok = all.filter((r) => r.gapFt <= cap && (!r.target.startsWith("line") || parseFloat(r.target.split("needs ")[1]) <= cap)).length;
    console.log(`allowance ${String(cap).padStart(2)} ft → closes ${ok}/${all.length} endpoints bilaterally (${((ok / all.length) * 100).toFixed(0)}%)`);
  }
})();

/* The parcel boundary for free, out of the masked/clear imagery pair.
 *
 *   npx tsx scripts/qa/roof/parcel-from-mask.ts
 *
 * MEASUREMENT ONLY, zero spend. EagleView ships every ortho twice — clear, and
 * with everything beyond the lot greyed out. Inside the lot the two are
 * byte-identical (measured on 12629: 88.5% of pixels at channel diff <= 8, the
 * rest in a clean mode above 80 — no middle ground). Subtracting the pair
 * therefore yields the parcel: the same ring we pay Regrid for on the Instant
 * path and ALLTIME ReportAll quota for on the recon path.
 *
 * The question this answers: does EagleView's mask agree with the cadastre?
 * Compared against the ReportAll rings already in ParcelCache — four of the six
 * addresses have one; 12629 and 419 do not, and none is bought for this.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decode } from "fast-png";
import { loadHarnessEnv } from "./env";

loadHarnessEnv();

import type { InstantRoofData, InstantImage } from "@/lib/eagleview";
import { fetchPropertyImage } from "@/lib/eagleview";
import type { FixtureMeta } from "./fixture";

const CACHE = resolve(".cache/roof-diagram");
const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;
/** Channels differing by more than this mean "the mask touched this pixel".
 *  Measured: identical pixels sit at 0-8 (PNG round-trip), masked ones above 80. */
const DIFF_MAX = 8;

interface Job { name: string; key: string; dir: string }
const JOBS: Job[] = [
  { name: "12629 Kirkland", key: "12629", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl" },
  { name: "12621 Kirkland", key: "12621", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa" },
  { name: "12618 Kirkland", key: "12618", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa" },
  { name: "9903 Kirkland", key: "9903", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa" },
  { name: "419 Prairie IL", key: "419", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln" },
  { name: "12117 Snohomish", key: "12117", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa" },
];

/** The WIDE framing that exists in both variants — the tight one can crop the lot. */
function widePair(instant: InstantRoofData, origin: { lat: number; lng: number }) {
  const groups = new Map<string, InstantImage[]>();
  for (const im of instant.imagery) {
    if (im.view !== "ortho" || !im.bbox) continue;
    const [a, b, c, d] = im.bbox;
    if (!(origin.lng >= a && origin.lng <= c && origin.lat >= b && origin.lat <= d)) continue;
    const k = im.bbox.join(",");
    groups.set(k, [...(groups.get(k) ?? []), im]);
  }
  const area = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);
  const full = [...groups.values()].filter((g) => g.some((i) => i.masked === true) && g.some((i) => i.masked === false));
  full.sort((x, y) => area(y[0].bbox!) - area(x[0].bbox!));
  const g = full[0];
  if (!g) return null;
  return { clear: g.find((i) => i.masked === false)!, masked: g.find((i) => i.masked === true)!, bbox: g[0].bbox! };
}

async function bytesFor(key: string, tag: string, token: string): Promise<Uint8Array> {
  const file = resolve(CACHE, `pair-${key}-${tag}.png`);
  if (existsSync(file)) return new Uint8Array(readFileSync(file));
  const { bytes } = await fetchPropertyImage(token);
  const u = new Uint8Array(bytes);
  writeFileSync(file, Buffer.from(u));
  return u;
}

/** POLYGON((lon lat, lon lat, ...)) — ReportAll is lon-first, per its API. */
function ringFromWkt(wkt: string): Array<{ lat: number; lng: number }> {
  const m = wkt.match(/\(\(([^)]+)\)\)/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter((c) => c.length >= 2 && c.every(Number.isFinite))
    .map(([lng, lat]) => ({ lat, lng }));
}

const inRing = (lat: number, lng: number, r: Array<{ lat: number; lng: number }>): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (
      r[i].lat > lat !== r[j].lat > lat &&
      lng < ((r[j].lng - r[i].lng) * (lat - r[i].lat)) / (r[j].lat - r[i].lat) + r[i].lng
    )
      inside = !inside;
  }
  return inside;
};

(async () => {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const parcels = await db.parcelCache.findMany();
  await db.$disconnect();

  for (const job of JOBS) {
    const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
    const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
    console.log(`\n${"=".repeat(76)}\n${job.name}\n${"=".repeat(76)}`);

    const pair = widePair(instant, meta.origin);
    if (!pair) { console.log("  no framing exists in both masked and clear — skipped"); continue; }

    const [clearB, maskedB] = await Promise.all([
      bytesFor(job.key, "wide-clear", pair.clear.token),
      bytesFor(job.key, "wide-masked", pair.masked.token),
    ]);
    const A = decode(clearB);
    const B = decode(maskedB);
    const ch = (A as unknown as { channels?: number }).channels ?? 3;
    const w = A.width;
    const h = A.height;
    if (B.width !== w || B.height !== h) { console.log("  the two variants differ in size — skipped"); continue; }

    // Ground scale from the bbox.
    const [minLon, minLat, maxLon, maxLat] = pair.bbox;
    const midLat = (minLat + maxLat) / 2;
    const pxWft = ((maxLon - minLon) * D2R * Math.cos(midLat * D2R) * EARTH_R_M * FT_PER_M) / w;
    const pxHft = ((maxLat - minLat) * D2R * EARTH_R_M * FT_PER_M) / h;
    const pxSqft = pxWft * pxHft;

    // ── subtract ──
    const same = new Uint8Array(w * h);
    const a = A.data as Uint8Array;
    const b = B.data as Uint8Array;
    for (let i = 0; i < w * h; i++) {
      let d = 0;
      for (let c = 0; c < Math.min(ch, 3); c++) d = Math.max(d, Math.abs(a[i * ch + c] - b[i * ch + c]));
      if (d <= DIFF_MAX) same[i] = 1;
    }

    // The lot is the connected identical region under the pin.
    const seedX = Math.round(((meta.origin.lng - minLon) / (maxLon - minLon)) * w);
    const seedY = Math.round(((maxLat - meta.origin.lat) / (maxLat - minLat)) * h);
    const lot = new Uint8Array(w * h);
    let seed = seedY * w + seedX;
    if (!same[seed]) {
      // The pin can sit on a feathered pixel; walk out to the nearest identical one.
      outer: for (let r = 1; r < 40; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const j = (seedY + dy) * w + (seedX + dx);
            if (j >= 0 && j < w * h && same[j]) { seed = j; break outer; }
          }
        }
      }
    }
    const stack = [seed];
    lot[seed] = 1;
    let lotPx = 0;
    let borderPx = 0;
    while (stack.length) {
      const i = stack.pop() as number;
      lotPx++;
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) borderPx++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!same[j] || lot[j]) continue;
        lot[j] = 1;
        stack.push(j);
      }
    }
    const clipped = borderPx > 0;
    console.log(
      `  wide frame ${w}x${h} (${(w * pxWft).toFixed(0)}x${(h * pxHft).toFixed(0)} ft) · identical region under the pin: ` +
        `${(lotPx * pxSqft).toFixed(0)} sq ft${clipped ? ` · TOUCHES THE FRAME EDGE on ${borderPx} px — the lot may extend beyond the picture` : ""}`,
    );

    // ── against the cadastre ──
    // Matched by STREET NUMBER, not proximity: on adjacent lots the parcels'
    // own centroids sit ~50 ft apart, and a distance threshold quietly handed
    // 12629 its neighbour's ring on the first run (IoU 11% — against the wrong
    // parcel entirely).
    const match = parcels.find((p) => (p.address ?? "").trim().startsWith(`${job.key} `));
    if (!match?.wkt) {
      console.log("  no ReportAll ring cached for this address — nothing bought; mask ring reported alone");
      continue;
    }
    const ring = ringFromWkt(match.wkt);
    if (ring.length < 3) { console.log("  cached WKT did not parse"); continue; }

    let inter = 0;
    let union = 0;
    let cadPx = 0;
    for (let y = 0; y < h; y++) {
      const lat = maxLat - ((y + 0.5) / h) * (maxLat - minLat);
      for (let x = 0; x < w; x++) {
        const lng = minLon + ((x + 0.5) / w) * (maxLon - minLon);
        const inCad = inRing(lat, lng, ring);
        const inLot = lot[y * w + x] === 1;
        if (inCad) cadPx++;
        if (inCad && inLot) inter++;
        if (inCad || inLot) union++;
      }
    }
    // Cadastre area straight from the polygon too, so raster error is visible.
    let polyArea = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].lng * D2R * Math.cos(midLat * D2R) * EARTH_R_M * FT_PER_M;
      const yi = ring[i].lat * D2R * EARTH_R_M * FT_PER_M;
      const xj = ring[j].lng * D2R * Math.cos(midLat * D2R) * EARTH_R_M * FT_PER_M;
      const yj = ring[j].lat * D2R * EARTH_R_M * FT_PER_M;
      polyArea += xj * yi - xi * yj;
    }
    polyArea = Math.abs(polyArea) / 2;
    let cadInFrame = true;
    for (const q of ring) {
      if (q.lng < minLon || q.lng > maxLon || q.lat < minLat || q.lat > maxLat) { cadInFrame = false; break; }
    }
    console.log(
      `  ReportAll ring: ${ring.length - 1} pts · ${polyArea.toFixed(0)} sq ft (raster ${(cadPx * pxSqft).toFixed(0)})` +
        `${cadInFrame ? "" : " · EXTENDS BEYOND THE FRAME — IoU is a floor, not the value"}`,
    );
    // Containment is the diagnostic quantity: IoU of a SUPERSET against its
    // subset is just their area ratio, so a poor IoU with full containment
    // means "buffered", not "misaligned".
    const containment = (inter / Math.max(1, cadPx)) * 100;
    const bufferFt = (Math.sqrt(lotPx * pxSqft) - Math.sqrt(polyArea)) / 2;
    console.log(
      `  IoU mask-vs-cadastre: ${((inter / Math.max(1, union)) * 100).toFixed(1)}% · ` +
        `cadastre inside the mask: ${containment.toFixed(1)}% · mask area ${((lotPx * pxSqft) / Math.max(1, polyArea) * 100).toFixed(0)}% of cadastre` +
        ` · uniform-buffer estimate ≈ ${bufferFt.toFixed(0)} ft`,
    );
  }
})();

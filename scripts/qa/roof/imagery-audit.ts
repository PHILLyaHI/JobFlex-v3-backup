/* What EagleView's imagery actually is, next to the raster we measure on.
 *
 * MEASUREMENT ONLY. Every token in an Instant response is already paid for as
 * part of the lookup; this reads the frozen responses and the ortho bytes
 * already on disk in .cache/roof-diagram, and fetches nothing.
 *
 * The question behind it: we measured 50% on an input we never characterised.
 * If EagleView's ortho is sharper or fresher than Google's, part of that number
 * is the input, not the model.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { loadHarnessEnv } from "./env";
import type { InstantRoofData, InstantImage } from "@/lib/eagleview";
import type { FixtureMeta } from "./fixture";

loadHarnessEnv();

const FT_PER_M = 3.28084;
const EARTH_R_M = 6378137;
const D2R = Math.PI / 180;
const CACHE = resolve(".cache/roof-diagram");

const JOBS = [
  { name: "12629 Kirkland", dir: "scripts/qa/roof/fixtures/kirkland-12629-ne-100th-pl", slug: "12629-ne-100th-pl" },
  { name: "12621 Kirkland", dir: "scripts/qa/roof/field/12621-ne-100th-pl-kirkland-wa", slug: "12621-ne-100th-pl" },
  { name: "12618 Kirkland", dir: "scripts/qa/roof/field/12618-ne-100th-st-kirkland-wa", slug: "12618-ne-100th-st" },
  { name: "9903 Kirkland", dir: "scripts/qa/roof/field/9903-117th-pl-ne-kirkland-wa", slug: "9903-117th-pl-ne" },
  { name: "419 Prairie IL", dir: "scripts/qa/roof/fixtures/prairie-419-prairie-ridge-ln", slug: "419-prairie-ridge-ln" },
  { name: "12117 Snohomish", dir: "scripts/qa/roof/field/12117-202nd-st-se-snohomish-wa", slug: "12117-202nd-st-se" },
];

/** PNG width/height straight from the IHDR chunk — no decoder needed. */
function pngSize(file: string): { w: number; h: number } | null {
  const b = readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** Ground size of a lat/lng bbox, in feet. */
function bboxFt(bb: [number, number, number, number]) {
  const [minLon, minLat, maxLon, maxLat] = bb;
  const midLat = (minLat + maxLat) / 2;
  return {
    wFt: (maxLon - minLon) * D2R * Math.cos(midLat * D2R) * EARTH_R_M * FT_PER_M,
    hFt: (maxLat - minLat) * D2R * EARTH_R_M * FT_PER_M,
  };
}

const cached = readdirSync(CACHE).filter((f) => f.startsWith("img-") && f.endsWith(".png"));
/** Same digest outlineVision.ts uses to name the bytes: sha256(token), 16 hex. */
const fileForToken = (token: string): string | null => {
  const digest = createHash("sha256").update(token).digest("hex").slice(0, 16);
  const hit = cached.find((f) => f.endsWith(`-t${digest}.png`));
  return hit ? resolve(CACHE, hit) : null;
};

console.log("EAGLEVIEW IMAGERY, per address\n");
for (const job of JOBS) {
  const meta = JSON.parse(readFileSync(resolve(job.dir, "meta.json"), "utf8")) as FixtureMeta;
  const instant = JSON.parse(readFileSync(resolve(job.dir, "instant.json"), "utf8")) as InstantRoofData;
  const imgs = instant.imagery ?? [];
  console.log(`${job.name}  —  ${imgs.length} token(s)`);
  console.log(`  Google raster for the same house: ${meta.raster.width}x${meta.raster.height} @ ${meta.raster.pixelSizeM} m/px = ${(meta.raster.pixelSizeM * FT_PER_M).toFixed(3)} ft/px, captured ${(meta as unknown as { imageryDate?: string }).imageryDate ?? "see provenance"}`);

  // Distinct bboxes — the four tokens are two framings x masked/unmasked.
  const seen = new Map<string, InstantImage[]>();
  for (const im of imgs) {
    const k = im.bbox ? im.bbox.join(",") : "no-bbox";
    seen.set(k, [...(seen.get(k) ?? []), im]);
  }
  let n = 0;
  for (const [k, group] of seen) {
    if (n++ > 3) { console.log(`  … and ${seen.size - 4} more framings`); break; }
    const bb = group[0].bbox;
    const g = bb ? bboxFt(bb) : null;
    const masks = group.map((x) => (x.masked ? "masked" : "clear")).join(" + ");
    const withPx = group.map((x) => ({ x, f: fileForToken(x.token) })).find((r) => r.f);
    const size = withPx?.f ? pngSize(withPx.f) : null;
    console.log(
      `  ${group[0].view.padEnd(6)} ${masks.padEnd(16)} shot ${group[0].shotDate ?? "—"}` +
        (g ? ` · ground ${g.wFt.toFixed(0)}x${g.hFt.toFixed(0)} ft` : " · no bbox") +
        (size ? ` · ${size.w}x${size.h} px` : " · bytes not cached") +
        (size && g ? ` · ${(g.wFt / size.w).toFixed(3)} ft/px` : ""),
    );
    if (k === "no-bbox") console.log("     (no bbox — cannot be georeferenced)");
  }
  console.log();
}

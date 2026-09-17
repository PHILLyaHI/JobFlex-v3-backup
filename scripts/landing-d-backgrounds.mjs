// The landing's four atmosphere plates, re-encoded for the page they sit
// behind (CRO stage 1, 2026-09-09). The PNG masters in public/landing-d are
// 2688×1152 and 3–4 MB each — ten of the page's eleven megabytes were these
// four decorative backgrounds, and the hero's was the LCP element on every
// variant (22–31 s on simulated 4G).
//
//   node scripts/landing-d-backgrounds.mjs
//
// Writes <name>-1600.webp (desktop) and <name>-800.webp (phones) next to the
// masters. The masters stay as the source of truth; landing-d.css references
// only the WebP derivatives.
import sharp from "sharp";
import { statSync } from "node:fs";

const DIR = new URL("../public/landing-d/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PLATES = ["bg-hero-ridge", "bg-cta-roofs", "bg-field-frame", "bg-intro-truck"];
const SIZES = [
  { w: 1600, quality: 90 },
  { w: 800, quality: 88 },
];

for (const name of PLATES) {
  const src = `${DIR}${name}.png`;
  for (const { w, quality } of SIZES) {
    const out = `${DIR}${name}-${w}.webp`;
    await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality, effort: 6 }).toFile(out);
    console.log(`${name}-${w}.webp  ${Math.round(statSync(out).size / 1024)} KB  (master ${Math.round(statSync(src).size / 1024)} KB)`);
  }
}

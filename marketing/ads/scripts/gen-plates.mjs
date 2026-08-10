// Photographic plates that sit UNDER the blueprint layout layer.
// Only the ads that genuinely need a photo get one; everything else is
// rendered from brand tokens in HTML.
import fs from "node:fs";
import path from "node:path";
import { submit, poll, result, download, sleep } from "./fal.mjs";

const OUT = "c:/joblfex-v3/marketing/ads/plates";

const PLATES = [
  {
    name: "legalpad",
    ratio: "1:1",
    prompt:
      "Overhead flat-lay photograph of a crumpled yellow legal pad on a scratched wooden workbench. " +
      "A messy handwritten construction estimate in blue ballpoint covers the page with crossed-out " +
      "numbers and smudges. A dried coffee ring stains one corner, a chewed pen and a dusty tape measure " +
      "sit beside it. Flat overcast daylight, muted desaturated colours, realistic paper texture and " +
      "creases. Documentary photography, sharp focus, no people.",
  },
  {
    name: "aerial",
    ratio: "1:1",
    prompt:
      "Top-down aerial drone photograph looking straight down at a suburban backyard. A wooden privacy " +
      "fence runs in a clear rectangular boundary around a green lawn, with a patio and a small shed " +
      "inside the boundary. Neighbouring yards visible at the edges. Bright even midday light, crisp " +
      "detail, true satellite-style orthographic perspective, no tilt. Realistic aerial photography, " +
      "no people, no vehicles, no text.",
  },
  {
    name: "porch",
    ratio: "1:1",
    prompt:
      "Close-up documentary photograph of a homeowner's hand holding a credit card up to a smartphone " +
      "held by a contractor in a plain navy work shirt, on a residential front porch. Only hands and " +
      "torsos visible, no faces. Warm late-afternoon light, shallow depth of field, realistic skin and " +
      "fabric texture. Natural colours, no logos, no readable card numbers, no text.",
  },
];

const NEGATIVE =
  "text, letters, watermark, logo, brand name, cartoon, illustration, 3d render, cgi, " +
  "hi-vis safety yellow vest, hard hat, oversaturated, hdr, purple tint, lens flare, deformed hands";

// Try the highest-quality photoreal model first, fall back if unavailable.
const MODELS = [
  { id: "fal-ai/flux-pro/v1.1-ultra", body: (p, r) => ({ prompt: p, aspect_ratio: r, output_format: "jpeg", safety_tolerance: "5" }) },
  { id: "fal-ai/nano-banana-pro/text-to-image", body: (p, r) => ({ prompt: p, aspect_ratio: r, num_images: 1 }) },
  { id: "fal-ai/flux/schnell", body: (p) => ({ prompt: p, image_size: "square_hd", num_images: 1 }) },
];

for (const plate of PLATES) {
  const file = path.join(OUT, `plate-${plate.name}.jpg`);
  if (fs.existsSync(file) && fs.statSync(file).size > 10000) { console.log("have", plate.name); continue; }

  let saved = false;
  for (const m of MODELS) {
    try {
      const body = m.body(`${plate.prompt}`, plate.ratio);
      if (m.id !== "fal-ai/flux/schnell") body.negative_prompt = NEGATIVE;
      const job = await submit(m.id, body);
      let res = null;
      for (let i = 0; i < 60; i++) {
        await sleep(4000);
        const s = await poll(job).catch(() => ({}));
        if (s.status === "COMPLETED") { res = await result(job); break; }
        if (s.status === "FAILED") break;
      }
      const url = res?.images?.[0]?.url;
      if (!url) { console.log(`  ${m.id} -> no image, trying next`); continue; }
      const bytes = await download(url, file);
      console.log(`OK ${plate.name} via ${m.id}  ${(bytes / 1e3).toFixed(0)} KB`);
      saved = true;
      break;
    } catch (e) {
      console.log(`  ${m.id} failed: ${e.message.slice(0, 120)}`);
    }
  }
  if (!saved) console.log(`FAILED plate ${plate.name}`);
}

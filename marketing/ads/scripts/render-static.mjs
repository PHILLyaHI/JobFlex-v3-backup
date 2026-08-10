// Render every ad to PNG at 1080×1080 (feed) and 1080×1920 (Reels/Stories).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { page } from "./templates.mjs";

const ROOT = "c:/joblfex-v3/marketing/ads";
const OUT = path.join(ROOT, "static");
fs.mkdirSync(OUT, { recursive: true });

const { ads } = JSON.parse(fs.readFileSync(path.join(ROOT, "ads.json"), "utf8"));

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const p = await ctx.newPage();

for (const [size, w, h] of [["sq", 1080, 1080], ["vt", 1080, 1920]]) {
  await p.setViewportSize({ width: w + 120, height: h + 120 });
  const html = page(ads, size);
  fs.writeFileSync(path.join(ROOT, `_preview-${size}.html`), html);
  await p.setContent(html, { waitUntil: "networkidle" });
  // Google Fonts must be fully loaded or Inter 900 silently falls back to Arial.
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);

  for (const ad of ads) {
    const el = p.locator(`.ad[data-id="${ad.id}"][data-size="${size}"]`);
    const file = path.join(OUT, `jobflex-${ad.id}-${ad.slug}-${size === "sq" ? "1080x1080" : "1080x1920"}.png`);
    await el.screenshot({ path: file });
    console.log("rendered", path.basename(file));
  }
}
await browser.close();
console.log("done");

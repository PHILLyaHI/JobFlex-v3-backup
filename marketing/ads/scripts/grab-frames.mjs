// Extract still frames from a generated MP4 using a headless browser
// (no ffmpeg on this machine). Usage: node grab-frames.mjs <file.mp4> <t1,t2,...>
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const file = process.argv[2];
const times = (process.argv[3] || "1,4,7").split(",").map(Number);
const outDir = "c:/joblfex-v3/marketing/ads/plates/_frames";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 405, height: 720 } });
await page.setContent(
  `<body style="margin:0;background:#000">
     <video id="v" src="file:///${file.replace(/\\/g, "/")}" style="width:405px;height:720px;object-fit:contain"></video>
   </body>`
);
await page.waitForFunction(() => {
  const v = document.getElementById("v");
  return v && v.readyState >= 2;
}, null, { timeout: 30000 });

const dur = await page.evaluate(() => document.getElementById("v").duration);
console.log("duration:", dur, "s");

const base = path.basename(file, ".mp4");
for (const t of times) {
  await page.evaluate((tt) => {
    const v = document.getElementById("v");
    return new Promise((res) => { v.onseeked = res; v.currentTime = tt; });
  }, Math.min(t, dur - 0.05));
  await page.waitForTimeout(250);
  const out = path.join(outDir, `${base}-t${t}.png`);
  await page.locator("#v").screenshot({ path: out });
  console.log("frame", t + "s ->", out);
}
await browser.close();

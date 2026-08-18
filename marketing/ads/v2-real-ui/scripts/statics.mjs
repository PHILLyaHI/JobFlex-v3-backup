// Render the five 1080x1080 static ads: brand frame + a real UI screenshot.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { ADS } from "./ads-v2.mjs";

const ROOT = "c:/joblfex-v3/marketing/ads/v2-real-ui";
const OUT = path.join(ROOT, "final");
fs.mkdirSync(OUT, { recursive: true });

// source screenshot + crop (in source px) + display width on the card
const SHOTS = {
  "smart-proposal":   { file: "smart-money.png",     crop: { x: 0, y: 128, w: 780, h: 1240 },   w: 430 },
  "materials-prices": { file: "materials-money.png", crop: { x: 2020, y: 60, w: 860, h: 1740 }, w: 430 },
  "fence-studio":     { file: "fence-money.png",     crop: { x: 1440, y: 96, w: 1440, h: 1704 }, w: 470 },
  "proposal-pipeline":{ file: "proposals-money.png", crop: { x: 0, y: 128, w: 780, h: 1240 },   w: 430 },
  "crew-calendar":    { file: "calendar-money.png",  crop: { x: 0, y: 128, w: 780, h: 1240 },   w: 430 },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&family=JetBrains+Mono:wght@500;600;700&display=swap');
:root{--ink:#0a0a0a;--paper:#f2f0eb;--blueprint:#1854a0;
  --sans:'Inter',Helvetica,Arial,sans-serif;--mono:'JetBrains Mono',ui-monospace,monospace}
*{box-sizing:border-box;margin:0;padding:0}
.ad{position:relative;overflow:hidden;width:1080px;height:1080px;background:var(--paper);
  color:var(--ink);font-family:var(--sans)}
.grid{position:absolute;inset:0;background-image:
  linear-gradient(to right,rgba(10,10,10,.05) 1px,transparent 1px),
  linear-gradient(to bottom,rgba(10,10,10,.05) 1px,transparent 1px),
  linear-gradient(to right,rgba(10,10,10,.09) 2px,transparent 2px),
  linear-gradient(to bottom,rgba(10,10,10,.09) 2px,transparent 2px);
  background-size:27px 27px,27px 27px,135px 135px,135px 135px}
.frame{position:absolute;inset:30px;border:4px solid var(--ink);pointer-events:none;z-index:5}
.reg{position:absolute;width:26px;height:26px;z-index:6}
.reg::before,.reg::after{content:'';position:absolute;background:var(--blueprint)}
.reg::before{left:0;top:12px;width:26px;height:2px}
.reg::after{top:0;left:12px;height:26px;width:2px}
.reg.tl{left:17px;top:17px}.reg.tr{right:17px;top:17px}
.reg.bl{left:17px;bottom:17px}.reg.br{right:17px;bottom:17px}
.kicker{display:inline-block;font-family:var(--mono);font-size:22px;font-weight:700;
  letter-spacing:.18em;color:var(--paper);background:var(--blueprint);
  padding:12px 20px;box-shadow:5px 5px 0 var(--ink)}
h1{font-weight:900;text-transform:uppercase;line-height:.92;letter-spacing:-.022em;font-size:86px;margin-top:34px}
.sub{margin-top:26px;font-size:27px;font-weight:500;color:rgba(10,10,10,.75);line-height:1.35;max-width:440px}
.cta{position:absolute;left:84px;bottom:96px;font-weight:800;font-size:30px;color:var(--paper);
  background:var(--ink);padding:20px 36px;box-shadow:6px 6px 0 var(--blueprint)}
.shotwrap{position:absolute;top:84px;bottom:84px;display:flex;align-items:center;z-index:4}
.shot{border:6px solid var(--ink);box-shadow:14px 14px 0 rgba(10,10,10,.85);overflow:hidden}
.shot img{display:block}
.slug{position:absolute;left:84px;bottom:52px;font-family:var(--mono);font-size:16px;font-weight:600;
  letter-spacing:.16em;color:rgba(10,10,10,.4);text-transform:uppercase}
.real{position:absolute;right:64px;bottom:56px;font-family:var(--mono);font-size:17px;font-weight:700;
  letter-spacing:.14em;color:var(--blueprint);text-transform:uppercase;z-index:6}
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });

for (const ad of ADS) {
  const s = SHOTS[ad.slug];
  const b64 = fs.readFileSync(path.join(ROOT, "shots", s.file)).toString("base64");
  const src = `data:image/png;base64,${b64}`;
  const dispH = Math.round((s.crop.h / s.crop.w) * s.w);
  const scale = s.w / s.crop.w;
  const html = `
  <style>${CSS}</style>
  <div class="ad">
    <div class="grid"></div><div class="frame"></div>
    <div class="reg tl"></div><div class="reg tr"></div><div class="reg bl"></div><div class="reg br"></div>
    <div style="position:absolute;left:84px;top:104px;max-width:480px;z-index:4">
      <span class="kicker">${ad.kicker}</span>
      <h1>${ad.headline.join("<br>")}</h1>
      <div class="sub">${ad.primary_text.split(". ").slice(0, 1)}.</div>
    </div>
    <div class="shotwrap" style="right:76px">
      <div class="shot" style="width:${s.w}px;height:${Math.min(dispH, 900)}px">
        <img src="${src}" style="width:auto;transform-origin:top left;transform:scale(${scale}) translate(${-s.crop.x}px,${-s.crop.y}px)"/>
      </div>
    </div>
    <div class="cta">Start free 14-day trial</div>
    <div class="slug">JOBFLEX · CONTRACTOR OS</div>
    <div class="real">● REAL SCREENS</div>
  </div>`;
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.locator(".ad").screenshot({ path: path.join(OUT, `jobflex-${ad.slug}-1080x1080.png`) });
  console.log("static", ad.slug);
}
await browser.close();
console.log("statics done");

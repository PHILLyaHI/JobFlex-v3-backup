// Render overlay assets for the v2 real-UI ads: hook cards, canvas backgrounds,
// caption chips and the shared end card. Same visual language as the v1 batch
// (Inter 900 caps, #1854a0, ink frames, hard shadows) — rendered HTML, not AI.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { ADS, WIN } from "./ads-v2.mjs";

const OUT = "c:/joblfex-v3/marketing/ads/v2-real-ui/assets";
fs.mkdirSync(OUT, { recursive: true });

const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&family=JetBrains+Mono:wght@500;600;700&display=swap');
:root{
  --ink:#0a0a0a; --paper:#f2f0eb; --blueprint:#1854a0; --sky:#4a9eff;
  --sans:'Inter',Helvetica,Arial,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:transparent}
.card{position:relative;overflow:hidden;width:1080px;height:1920px;
  background:var(--paper);color:var(--ink);font-family:var(--sans)}
.grid{position:absolute;inset:0;pointer-events:none;
  background-image:
    linear-gradient(to right,rgba(10,10,10,.05) 1px,transparent 1px),
    linear-gradient(to bottom,rgba(10,10,10,.05) 1px,transparent 1px),
    linear-gradient(to right,rgba(10,10,10,.09) 2px,transparent 2px),
    linear-gradient(to bottom,rgba(10,10,10,.09) 2px,transparent 2px);
  background-size:27px 27px,27px 27px,135px 135px,135px 135px}
.frame{position:absolute;inset:30px;border:4px solid var(--ink);pointer-events:none}
.reg{position:absolute;width:26px;height:26px}
.reg::before,.reg::after{content:'';position:absolute;background:var(--blueprint)}
.reg::before{left:0;top:12px;width:26px;height:2px}
.reg::after{top:0;left:12px;height:26px;width:2px}
.reg.tl{left:17px;top:17px}.reg.tr{right:17px;top:17px}
.reg.bl{left:17px;bottom:17px}.reg.br{right:17px;bottom:17px}
.kicker{display:inline-block;font-family:var(--mono);font-size:26px;font-weight:700;
  letter-spacing:.20em;color:var(--paper);background:var(--blueprint);
  padding:14px 24px;box-shadow:5px 5px 0 var(--ink)}
h1{font-weight:900;text-transform:uppercase;line-height:.92;letter-spacing:-.022em}
.slug{position:absolute;left:0;right:0;bottom:56px;text-align:center;
  font-family:var(--mono);font-size:19px;font-weight:600;letter-spacing:.18em;
  color:rgba(10,10,10,.45);text-transform:uppercase}
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2000 }, deviceScaleFactor: 1 });

async function render(html, sel, file, transparent = false) {
  await page.setContent(`<style>${BASE_CSS}</style>${html}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.locator(sel).screenshot({
    path: path.join(OUT, file),
    omitBackground: transparent,
  });
  console.log("asset", file);
}


for (const ad of ADS) {
  const win = WIN[ad.kind];

  // hook card — full-bleed opener
  await render(
    `<div class="card">
       <div class="grid"></div><div class="frame"></div>
       <div class="reg tl"></div><div class="reg tr"></div><div class="reg bl"></div><div class="reg br"></div>
       <div style="position:absolute;left:84px;right:84px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center">
         <div><span class="kicker">${ad.kicker}</span></div>
         <h1 style="font-size:150px;margin-top:56px">${ad.headline.join("<br>")}</h1>
         <div style="margin-top:64px;font-family:var(--mono);font-size:26px;font-weight:700;
              letter-spacing:.14em;text-transform:uppercase;color:var(--blueprint)">
           ● ${ad.hookSub}</div>
       </div>
       <div class="slug">JOBFLEX · CONTRACTOR OS</div>
     </div>`,
    ".card", `${ad.slug}-hook.png`
  );

  // canvas background — headline strip + screen window (shadow + border ring painted)
  const pad = 8, sh = 14;
  await render(
    `<div class="card">
       <div class="grid"></div>
       <div class="reg tl"></div><div class="reg tr"></div><div class="reg bl"></div><div class="reg br"></div>
       <div style="position:absolute;left:64px;right:64px;top:96px">
         <span class="kicker" style="font-size:22px;padding:10px 18px">${ad.kicker}</span>
         <h1 style="font-size:76px;margin-top:26px">${ad.headline.join(" ")}</h1>
       </div>
       <div style="position:absolute;left:${win.x - pad + sh}px;top:${win.y - pad + sh}px;
            width:${win.w + pad * 2}px;height:${win.h + pad * 2}px;background:rgba(10,10,10,.85)"></div>
       <div style="position:absolute;left:${win.x - pad}px;top:${win.y - pad}px;
            width:${win.w + pad * 2}px;height:${win.h + pad * 2}px;background:var(--ink)"></div>
       <div class="slug">JOBFLEX · CONTRACTOR OS · REAL SCREENS</div>
     </div>`,
    ".card", `${ad.slug}-bg.png`
  );

  // caption chips — transparent strips
  for (let i = 0; i < ad.captions.length; i++) {
    await render(
      `<div id="chip" style="width:1080px;height:170px;display:flex;align-items:center;justify-content:center;background:transparent">
         <div style="font-family:var(--sans);font-weight:800;font-size:40px;letter-spacing:.01em;
              color:var(--paper);background:var(--ink);padding:18px 34px;box-shadow:6px 6px 0 var(--blueprint);
              max-width:960px;text-align:center">${ad.captions[i].text}</div>
       </div>`,
      "#chip", `${ad.slug}-cap${i}.png`, true
    );
  }
}

// shared end card
await render(
  `<div class="card">
     <div class="grid"></div><div class="frame"></div>
     <div class="reg tl"></div><div class="reg tr"></div><div class="reg bl"></div><div class="reg br"></div>
     <div style="position:absolute;left:84px;right:84px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
       <div style="font-weight:900;font-size:118px;letter-spacing:-.02em">JOBFLEX</div>
       <div style="font-family:var(--mono);font-weight:700;font-size:30px;letter-spacing:.34em;color:var(--blueprint);margin-top:6px">CONTRACTOR OS</div>
       <h1 style="font-size:104px;margin-top:110px">START FREE.<br>14 DAYS.</h1>
       <div style="margin-top:44px;font-size:34px;font-weight:500;color:rgba(10,10,10,.75)">No card needed. Plans from $29/mo.</div>
       <div style="margin-top:70px;font-family:var(--sans);font-weight:800;font-size:38px;color:var(--paper);
            background:var(--blueprint);padding:24px 54px;box-shadow:7px 7px 0 var(--ink)">START FREE TRIAL</div>
     </div>
   </div>`,
  ".card", "endcard.png"
);

await browser.close();
console.log("assets done");

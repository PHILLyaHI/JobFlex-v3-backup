// Render transparent caption plates + an opaque brand end-card per ad,
// at 1080x1920, using the same Inter/JetBrains brand stack as the statics.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = "c:/joblfex-v3/marketing/ads";
const OUT = path.join(ROOT, "video", "_overlays");
fs.mkdirSync(OUT, { recursive: true });

const { ads } = JSON.parse(fs.readFileSync(path.join(ROOT, "ads.json"), "utf8"));

// "0.0-2.5s  SOME TEXT" -> {from, to, text}
export function parseBeat(b) {
  const m = b.match(/^\s*([\d.]+)\s*-\s*([\d.]+)s\s+(.*)$/);
  return m ? { from: +m[1], to: +m[2], text: m[3].trim() } : null;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&family=JetBrains+Mono:wght@600;700&display=swap');
:root{--ink:#0a0a0a;--paper:#f2f0eb;--blueprint:#1854a0;--sky:#4a9eff}
*{box-sizing:border-box;margin:0;padding:0}
body{margin:0;background:transparent}
.stage{width:1080px;height:1920px;position:relative;
  font-family:'Inter',Helvetica,Arial,sans-serif;color:var(--ink)}

/* captions sit clear of the Reels chrome (bottom ~430px, right ~180px) */
.cap{position:absolute;left:70px;right:180px;bottom:520px;display:flex}
.cap .box{background:var(--paper);border:5px solid var(--ink);border-radius:3px;
  box-shadow:13px 13px 0 var(--blueprint);padding:26px 32px;max-width:100%}
.cap .box.hook{font-weight:900;font-size:74px;line-height:.98;text-transform:uppercase;
  letter-spacing:-.02em}
.cap .box.line{font-weight:700;font-size:52px;line-height:1.15;letter-spacing:-.01em}

/* end card */
.end{position:absolute;inset:0;background:var(--paper)}
.end .grid{position:absolute;inset:0;
  background-image:
    linear-gradient(to right,rgba(10,10,10,.05) 1px,transparent 1px),
    linear-gradient(to bottom,rgba(10,10,10,.05) 1px,transparent 1px),
    linear-gradient(to right,rgba(10,10,10,.09) 2px,transparent 2px),
    linear-gradient(to bottom,rgba(10,10,10,.09) 2px,transparent 2px);
  background-size:27px 27px,27px 27px,135px 135px,135px 135px}
.end .frame{position:absolute;inset:44px;border:5px solid var(--ink)}
.end .inner{position:absolute;inset:44px;display:flex;flex-direction:column;
  justify-content:center;align-items:center;text-align:center;padding:0 90px;gap:34px}
.end .mark{font-weight:900;font-size:112px;letter-spacing:.10em;text-transform:uppercase}
.end .mark span{color:var(--blueprint)}
.end .tag{font-weight:800;font-size:46px;line-height:1.18;text-transform:uppercase;
  letter-spacing:-.01em;max-width:820px}
.end .rule{width:190px;height:5px;background:var(--blueprint)}
.end .cta{background:var(--ink);color:var(--paper);font-weight:800;font-size:38px;
  letter-spacing:.09em;text-transform:uppercase;padding:28px 46px;border-radius:3px;
  box-shadow:11px 11px 0 var(--blueprint)}
.end .meta{font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:600;
  letter-spacing:.18em;text-transform:uppercase;color:rgba(10,10,10,.55);margin-top:10px}
`;

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const capStage = (text, hook) =>
  `<div class="stage"><div class="cap"><div class="box ${hook ? "hook" : "line"}">${esc(text)}</div></div></div>`;

const endStage = (ad) => `
  <div class="stage"><div class="end">
    <div class="grid"></div><div class="frame"></div>
    <div class="inner">
      <div class="mark">JOB<span>FLEX</span></div>
      <div class="rule"></div>
      <div class="tag">${esc(ad.headline)}</div>
      <div class="cta">${esc(ad.cta)}</div>
      <div class="meta">${esc(ad.description)}</div>
    </div>
  </div></div>`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.setViewportSize({ width: 1080, height: 1920 });

async function shoot(html, file, transparent) {
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(250);
  await p.locator(".stage").screenshot({ path: file, omitBackground: transparent });
}

const manifest = [];
for (const ad of ads) {
  const beats = ad.video_caption_beats.map(parseBeat).filter(Boolean);
  const caps = [];
  // first two beats become burned-in captions; the last becomes the end card
  for (let i = 0; i < Math.min(2, beats.length); i++) {
    const file = path.join(OUT, `${ad.id}-cap${i + 1}.png`);
    await shoot(capStage(beats[i].text, i === 0), file, true);
    caps.push({ file, from: beats[i].from, to: beats[i].to });
  }
  const endFile = path.join(OUT, `${ad.id}-end.png`);
  await shoot(endStage(ad), endFile, false);
  manifest.push({ id: ad.id, slug: ad.slug, caps, end: endFile });
  console.log("overlays", ad.id, ad.slug);
}
fs.writeFileSync(path.join(OUT, "_manifest.json"), JSON.stringify(manifest, null, 2));
await browser.close();
console.log("done");

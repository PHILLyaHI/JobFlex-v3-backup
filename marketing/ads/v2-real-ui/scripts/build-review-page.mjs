// Build the ad-batch review page (single HTML, media inlined as data URIs).
import fs from "node:fs";
import path from "node:path";
import { ADS } from "./ads-v2.mjs";

const ROOT = "c:/joblfex-v3/marketing/ads/v2-real-ui";
const P = (f) => path.join(ROOT, "preview", f);
const b64 = (f, mime) => `data:${mime};base64,${fs.readFileSync(f).toString("base64")}`;

const DUR = {
  "smart-proposal": "29.7s",
  "materials-prices": "24.5s",
  "fence-studio": "26.2s",
  "proposal-pipeline": "25.9s",
  "crew-calendar": "25.2s",
};

const cards = ADS.map((ad) => {
  const vid = b64(P(`${ad.slug}.mp4`), "video/mp4");
  const img = b64(P(`${ad.slug}.jpg`), "image/jpeg");
  return `
  <section class="card">
    <div class="media">
      <video controls preload="metadata" playsinline src="${vid}"></video>
      <figure class="static">
        <img src="${img}" alt="Static ad — ${ad.headline.join(" ")}">
        <figcaption>Static · 1080×1080</figcaption>
      </figure>
    </div>
    <div class="meta">
      <span class="kicker">${ad.kicker}</span>
      <h2>${ad.headline.join(" ")}</h2>
      <dl>
        <div><dt>Video</dt><dd>${DUR[ad.slug]} · 1080×1920 · 9:16</dd></div>
        <div><dt>Primary text</dt><dd>${ad.primary_text}</dd></div>
        <div><dt>Headline</dt><dd>${ad.fb_headline}</dd></div>
        <div><dt>Description</dt><dd>${ad.fb_description}</dd></div>
      </dl>
      <div class="files">
        <code>final\\jobflex-${ad.slug}-9x16.mp4</code>
        <code>final\\jobflex-${ad.slug}-1080x1080.png</code>
      </div>
    </div>
  </section>`;
}).join("\n");

const html = `<title>JobFlex Ad Batch v2</title>
<style>
:root{--ink:#0a0a0a;--paper:#f2f0eb;--paper2:#eae7e0;--blueprint:#1854a0;--sky:#4a9eff;
  --sans:'Inter',Helvetica,Arial,sans-serif;--mono:'JetBrains Mono',ui-monospace,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);
  background-image:
    linear-gradient(to right,rgba(10,10,10,.045) 1px,transparent 1px),
    linear-gradient(to bottom,rgba(10,10,10,.045) 1px,transparent 1px);
  background-size:27px 27px;padding:56px 24px 96px}
.wrap{max-width:1060px;margin:0 auto}
header{margin-bottom:44px;border:3px solid var(--ink);background:var(--paper);
  box-shadow:8px 8px 0 rgba(10,10,10,.85);padding:36px 40px}
.kicker{display:inline-block;font-family:var(--mono);font-size:12px;font-weight:700;
  letter-spacing:.18em;text-transform:uppercase;color:var(--paper);background:var(--blueprint);
  padding:6px 12px;box-shadow:3px 3px 0 var(--ink)}
h1{font-weight:900;text-transform:uppercase;letter-spacing:-.02em;font-size:clamp(30px,5vw,52px);
  line-height:.95;margin-top:18px;text-wrap:balance}
header p{margin-top:14px;max-width:62ch;font-size:15px;line-height:1.55;color:rgba(10,10,10,.75)}
.how{margin-top:18px;border-top:2px solid var(--ink);padding-top:16px;font-size:14px;line-height:1.6}
.how strong{font-weight:800}
.how code{font-family:var(--mono);font-size:12.5px;background:var(--paper2);
  border:1px solid rgba(10,10,10,.25);padding:1px 6px;white-space:nowrap}
.card{border:3px solid var(--ink);background:var(--paper);box-shadow:8px 8px 0 rgba(10,10,10,.85);
  margin-bottom:40px;display:grid;grid-template-columns:minmax(0,340px) 1fr}
.media{background:var(--paper2);border-right:3px solid var(--ink);padding:20px;
  display:flex;flex-direction:column;gap:16px;align-items:center}
video{width:100%;max-width:280px;border:3px solid var(--ink);background:#000;display:block}
.static img{width:100%;max-width:280px;border:3px solid var(--ink);display:block}
.static figcaption{font-family:var(--mono);font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:rgba(10,10,10,.5);margin-top:6px;text-align:center}
.meta{padding:28px 32px;min-width:0}
h2{font-weight:900;text-transform:uppercase;letter-spacing:-.015em;font-size:26px;margin:14px 0 18px}
dl{display:flex;flex-direction:column;gap:12px}
dt{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;color:var(--blueprint)}
dd{font-size:14.5px;line-height:1.5;margin-top:3px}
.files{margin-top:20px;display:flex;flex-direction:column;gap:6px}
.files code{font-family:var(--mono);font-size:12.5px;background:var(--paper2);
  border:1px solid rgba(10,10,10,.25);padding:4px 8px;overflow-x:auto;white-space:nowrap;display:block}
footer{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;
  color:rgba(10,10,10,.45);text-align:center;margin-top:8px}
@media(max-width:760px){.card{grid-template-columns:1fr}.media{border-right:0;border-bottom:3px solid var(--ink)}}
video:focus-visible,a:focus-visible{outline:3px solid var(--sky);outline-offset:2px}
</style>
<div class="wrap">
  <header>
    <span class="kicker">Meta ad batch v2 · Real screens</span>
    <h1>Five features. Five ads. Zero mockups.</h1>
    <p>Every product frame is the actual JobFlex app, screen-recorded from the dev build —
       the AI estimate generates live, the fence gets traced live, the materials prices are real.
       Videos are 25–30s verticals for Reels/Stories/Feed; each ships with a 1:1 static.</p>
    <div class="how">
      <strong>To upload:</strong> the previews below are compressed for this page — use the
      full-quality originals on your machine at
      <code>c:\\joblfex-v3\\marketing\\ads\\v2-real-ui\\final\\</code>.
      In Meta Ads Manager (business.facebook.com/adsmanager) create the campaign, then at ad level
      choose <strong>Add media → Add video</strong> and pick the MP4; paste the copy shown on each
      card (also in <code>ads-upload.csv</code>). CTA: <strong>Sign Up</strong>.
    </div>
  </header>
  ${cards}
  <footer>JobFlex · Contractor OS · shot in the real app</footer>
</div>`;

const out = "c:/joblfex-v3/marketing/ad-batch-v2-review.html";
fs.writeFileSync(out, html);
console.log("wrote", out, Math.round(fs.statSync(out).size / 1024), "KB");

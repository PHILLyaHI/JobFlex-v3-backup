// Build the download page: all 10 deliverables embedded, saved via the
// artifact downloads capability.
import fs from "node:fs";
import path from "node:path";

const ROOT = "c:/joblfex-v3/marketing/ads/v2-real-ui";
const SLUGS = ["smart-proposal", "materials-prices", "fence-studio", "proposal-pipeline", "crew-calendar"];
const TITLES = {
  "smart-proposal": "Smart Proposal — Type the job. Get the price.",
  "materials-prices": "Materials — Real store prices. Inside the estimate.",
  "fence-studio": "Fence Studio — Trace it. Price it.",
  "proposal-pipeline": "Proposals — Look like the bigger shop.",
  "crew-calendar": "Scheduling — Your week runs itself.",
};

const files = [];
for (const s of SLUGS) {
  files.push({
    name: `jobflex-${s}-9x16.mp4`,
    label: `${TITLES[s]}`,
    kind: "Video · 1080×1920",
    b64: fs.readFileSync(path.join(ROOT, "delivery", `jobflex-${s}-9x16.mp4`)).toString("base64"),
  });
  files.push({
    name: `jobflex-${s}-1080x1080.png`,
    label: `${TITLES[s]}`,
    kind: "Static · 1080×1080",
    b64: fs.readFileSync(path.join(ROOT, "final", `jobflex-${s}-1080x1080.png`)).toString("base64"),
  });
}

const rows = files.map((f, i) => `
  <div class="row">
    <div class="info">
      <div class="name">${f.name}</div>
      <div class="sub">${f.kind} · ${f.label}</div>
    </div>
    <button class="dl" data-i="${i}">Download</button>
  </div>`).join("");

const html = `<title>JobFlex Ad Pack</title>
<style>
:root{--ink:#0a0a0a;--paper:#f2f0eb;--paper2:#eae7e0;--blueprint:#1854a0;--sky:#4a9eff;
  --sans:'Inter',Helvetica,Arial,sans-serif;--mono:'JetBrains Mono',ui-monospace,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);
  background-image:linear-gradient(to right,rgba(10,10,10,.045) 1px,transparent 1px),
    linear-gradient(to bottom,rgba(10,10,10,.045) 1px,transparent 1px);
  background-size:27px 27px;padding:56px 20px 96px}
.wrap{max-width:820px;margin:0 auto}
header{border:3px solid var(--ink);background:var(--paper);box-shadow:8px 8px 0 rgba(10,10,10,.85);
  padding:32px 36px;margin-bottom:36px}
.kicker{display:inline-block;font-family:var(--mono);font-size:12px;font-weight:700;
  letter-spacing:.18em;text-transform:uppercase;color:var(--paper);background:var(--blueprint);
  padding:6px 12px;box-shadow:3px 3px 0 var(--ink)}
h1{font-weight:900;text-transform:uppercase;letter-spacing:-.02em;font-size:clamp(28px,5vw,46px);
  line-height:.95;margin-top:16px;text-wrap:balance}
header p{margin-top:12px;font-size:14.5px;line-height:1.55;color:rgba(10,10,10,.75);max-width:60ch}
.all{margin-top:20px;font-weight:800;font-size:17px;color:var(--paper);background:var(--ink);
  border:0;padding:16px 30px;box-shadow:6px 6px 0 var(--blueprint);cursor:pointer;font-family:var(--sans)}
.all:hover{transform:translate(1px,1px);box-shadow:5px 5px 0 var(--blueprint)}
.row{display:flex;align-items:center;gap:16px;border:3px solid var(--ink);background:var(--paper);
  box-shadow:6px 6px 0 rgba(10,10,10,.85);padding:16px 20px;margin-bottom:16px}
.info{min-width:0;flex:1}
.name{font-family:var(--mono);font-size:14px;font-weight:700;overflow-wrap:anywhere}
.sub{font-size:12.5px;color:rgba(10,10,10,.6);margin-top:3px}
.dl{font-weight:800;font-size:14px;color:var(--paper);background:var(--blueprint);border:0;
  padding:12px 22px;box-shadow:4px 4px 0 var(--ink);cursor:pointer;font-family:var(--sans);flex:none}
.dl:hover{transform:translate(1px,1px);box-shadow:3px 3px 0 var(--ink)}
.dl:disabled,.all:disabled{opacity:.5;cursor:default;transform:none}
#status{font-family:var(--mono);font-size:13px;margin-top:14px;min-height:18px;color:var(--blueprint)}
button:focus-visible{outline:3px solid var(--sky);outline-offset:2px}
footer{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;
  color:rgba(10,10,10,.45);text-align:center;margin-top:28px}
</style>
<div class="wrap">
  <header>
    <span class="kicker">Meta ad batch v2 · Deliverables</span>
    <h1>Download the ad pack</h1>
    <p>Ten files: five 25–30s vertical videos (1080×1920 H.264) and five 1080×1080 statics —
       everything ready for Meta Ads Manager. Each download asks for one confirmation.</p>
    <button class="all" id="all">Download all 10</button>
    <div id="status"></div>
  </header>
  ${rows}
  <footer>JobFlex · Contractor OS · shot in the real app</footer>
</div>
<script>
const FILES = ${JSON.stringify(files.map((f) => ({ name: f.name })))};
const DATA = [${files.map((f) => `"${f.b64}"`).join(",")}];
function bytes(i){
  const s = atob(DATA[i]); const a = new Uint8Array(s.length);
  for (let j = 0; j < s.length; j++) a[j] = s.charCodeAt(j);
  return a;
}
const status = document.getElementById("status");
let dls = null;
async function ensure(){
  if (dls === null) dls = await claude.use("downloads");
  if (!dls) status.textContent = "Downloads not available in this view — open the artifact on claude.ai.";
  return dls;
}
async function saveOne(i){
  const d = await ensure(); if (!d) return false;
  try {
    await d.save({ filename: FILES[i].name, data: bytes(i) });
    return true;
  } catch (e) {
    if (e && e.code === "declined") { status.textContent = "Skipped " + FILES[i].name; return false; }
    if (e && e.code === "rate_limited") {
      status.textContent = "Waiting for the previous prompt…";
      await new Promise(r => setTimeout(r, 1500));
      return saveOne(i);
    }
    status.textContent = "Could not save " + FILES[i].name + " (" + (e && e.code || "error") + ")";
    return false;
  }
}
document.querySelectorAll(".dl").forEach(b => b.addEventListener("click", async () => {
  b.disabled = true; status.textContent = "Saving " + FILES[+b.dataset.i].name + "…";
  const ok = await saveOne(+b.dataset.i);
  if (ok) status.textContent = "Saved " + FILES[+b.dataset.i].name;
  b.disabled = false;
}));
document.getElementById("all").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  let saved = 0;
  for (let i = 0; i < FILES.length; i++) {
    status.textContent = "(" + (i + 1) + "/10) " + FILES[i].name + " — confirm the prompt";
    if (await saveOne(i)) saved++;
  }
  status.textContent = "Done — " + saved + " of 10 saved.";
  ev.target.disabled = false;
});
</script>`;

const out = path.join(ROOT, "download-page.html");
fs.writeFileSync(out, html);
console.log("wrote", out, Math.round(fs.statSync(out).size / 1024 / 1024 * 10) / 10, "MB");

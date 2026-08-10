// Blueprint ad templates. Every value traces to a DESIGN.md token.
// Borders/shadows are scaled ~2x from the UI spec because a 1080px ad canvas
// renders at roughly half size in-feed — this preserves the *character* of the
// 2px hard-frame language rather than the literal pixel value.
import fs from "node:fs";

const PLATES = "c:/joblfex-v3/marketing/ads/plates";
const dataUri = (name) => {
  const p = `${PLATES}/plate-${name}.jpg`;
  if (!fs.existsSync(p)) return "";
  return `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
};

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&family=JetBrains+Mono:wght@500;600;700&display=swap');

:root{
  --ink:#0a0a0a; --paper:#f2f0eb; --blueprint:#1854a0; --sky:#4a9eff;
  --success:#3a7d44; --warning:#b88420; --danger:#a83232;
  --bw:4px;              /* scaled from --border-thick 2px */
  --r:3px;               /* scaled from --radius-sm 2px */
  --sans:'Inter',Helvetica,Arial,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#555;display:flex;flex-wrap:wrap;gap:40px;padding:40px}

.ad{position:relative;overflow:hidden;background:var(--paper);color:var(--ink);
    font-family:var(--sans);flex:none}
.ad.sq{width:1080px;height:1080px}
.ad.vt{width:1080px;height:1920px}

/* ---- graph paper ---- */
.grid{position:absolute;inset:0;pointer-events:none;
  background-image:
    linear-gradient(to right,rgba(10,10,10,.05) 1px,transparent 1px),
    linear-gradient(to bottom,rgba(10,10,10,.05) 1px,transparent 1px),
    linear-gradient(to right,rgba(10,10,10,.09) 2px,transparent 2px),
    linear-gradient(to bottom,rgba(10,10,10,.09) 2px,transparent 2px);
  background-size:27px 27px,27px 27px,135px 135px,135px 135px}

/* ---- frame + registration marks ---- */
.frame{position:absolute;inset:34px;border:var(--bw) solid var(--ink);pointer-events:none}
.reg{position:absolute;width:26px;height:26px;pointer-events:none}
.reg::before,.reg::after{content:'';position:absolute;background:var(--blueprint)}
.reg::before{left:0;top:12px;width:26px;height:2px}
.reg::after{top:0;left:12px;height:26px;width:2px}
.reg.tl{left:21px;top:21px}.reg.tr{right:21px;top:21px}
.reg.bl{left:21px;bottom:21px}.reg.br{right:21px;bottom:21px}

.slug{position:absolute;font-family:var(--mono);font-size:17px;font-weight:600;
  letter-spacing:.16em;color:rgba(10,10,10,.40);text-transform:uppercase}
.slug.b{left:74px;bottom:52px}

/* ---- content shell ---- */
.body{position:relative;height:100%;display:flex;flex-direction:column;
  padding:104px 84px 104px}
.vt .body{padding:150px 84px 140px}

.kicker{font-family:var(--mono);font-size:23px;font-weight:700;letter-spacing:.20em;
  text-transform:uppercase;color:var(--blueprint);display:flex;align-items:center;gap:16px}
.kicker::after{content:'';flex:1;height:2px;background:var(--blueprint);opacity:.34}

h1{font-weight:900;text-transform:uppercase;line-height:.90;letter-spacing:-.022em;
  margin-top:38px;font-size:92px}
.vt h1{font-size:118px;margin-top:52px}
h1 em{font-style:normal;color:var(--blueprint)}

.sub{font-size:31px;line-height:1.34;font-weight:400;color:rgba(10,10,10,.70);
  margin-top:30px;max-width:82%}
.vt .sub{font-size:38px;margin-top:38px}

.spacer{flex:1;min-height:26px}

/* Content-heavy templates get a tighter head so the payload panel keeps
   real estate. Without this the flex children collapse to nothing. */
.ad.dense .body{padding:76px 74px 84px}
.ad.dense h1{font-size:66px;margin-top:26px}
.ad.dense .sub{font-size:26px;margin-top:20px;max-width:94%}
.ad.dense .foot{margin-top:28px;padding-top:26px}
.ad.vt.dense .body{padding:120px 80px 120px}
.ad.vt.dense h1{font-size:92px;margin-top:36px}
.ad.vt.dense .sub{font-size:32px;margin-top:28px}

/* two-column shell (device demo on square) */
.cols{display:flex;gap:44px;flex:1;min-height:0;margin-top:26px;align-items:center}
.vt .cols{flex-direction:column;gap:40px;align-items:stretch}
.c-copy{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}
.c-copy h1{margin-top:24px}
.c-dev{flex:none}

/* ---- hard-offset stamp card ---- */
.stamp{display:inline-block;border:var(--bw) solid var(--ink);background:var(--paper);
  box-shadow:11px 11px 0 var(--blueprint);border-radius:var(--r);padding:34px 44px;
  align-self:flex-start}
.stamp .v{font-weight:900;font-size:118px;line-height:1;font-variant-numeric:tabular-nums;
  letter-spacing:-.005em}
.vt .stamp .v{font-size:146px}
.stamp .l{font-family:var(--mono);font-size:19px;font-weight:600;letter-spacing:.14em;
  text-transform:uppercase;color:rgba(10,10,10,.62);margin-top:14px}

/* ---- footer ---- */
.foot{display:flex;align-items:center;justify-content:space-between;gap:30px;
  border-top:var(--bw) solid var(--ink);padding-top:32px;margin-top:44px}
.mark{font-weight:900;font-size:40px;letter-spacing:.13em;text-transform:uppercase}
.mark span{color:var(--blueprint)}
.cta{background:var(--ink);color:var(--paper);font-weight:800;font-size:27px;
  letter-spacing:.09em;text-transform:uppercase;padding:22px 34px;border-radius:var(--r);
  box-shadow:8px 8px 0 var(--blueprint);white-space:nowrap}

/* ---- split compare ---- */
.split{display:flex;flex:1;min-height:470px;border:var(--bw) solid var(--ink);
  border-radius:var(--r);overflow:hidden;margin-top:26px}
.vt .split{min-height:1000px}
.vt .split{flex-direction:column}
.half{flex:1;position:relative;display:flex;flex-direction:column}
.half+.half{border-left:var(--bw) solid var(--ink)}
.vt .half+.half{border-left:0;border-top:var(--bw) solid var(--ink)}
.half .tag{font-family:var(--mono);font-size:19px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;padding:16px 20px;border-bottom:2px solid var(--ink);
  background:var(--paper);z-index:2}
.half.bad .tag{color:rgba(10,10,10,.55)}
.half.good .tag{color:var(--paper);background:var(--blueprint);border-bottom-color:var(--blueprint)}
.half .fill{flex:1;position:relative;overflow:hidden}
.half .fill img{width:100%;height:100%;object-fit:cover;filter:grayscale(.55) contrast(.92)}

/* ---- mini proposal UI (reused in split + device) ---- */
.prop{position:absolute;inset:0;background:var(--paper);padding:26px 24px;
  display:flex;flex-direction:column;gap:14px}
.prop .ph{display:flex;justify-content:space-between;align-items:baseline;
  border-bottom:2px solid var(--ink);padding-bottom:12px}
.prop .ph b{font-weight:900;font-size:26px;letter-spacing:-.01em;text-transform:uppercase}
.prop .ph i{font-style:normal;font-family:var(--mono);font-size:15px;font-weight:600;
  letter-spacing:.1em;color:rgba(10,10,10,.55)}
.prop .row{display:flex;justify-content:space-between;font-size:19px;
  font-variant-numeric:tabular-nums;color:rgba(10,10,10,.82)}
.prop .row s{text-decoration:none;font-family:var(--mono);font-size:16px;
  color:rgba(10,10,10,.5)}
.prop .tot{display:flex;justify-content:space-between;align-items:baseline;
  border-top:2px solid var(--ink);padding-top:14px;margin-top:auto}
.prop .tot span{font-family:var(--mono);font-size:16px;font-weight:700;letter-spacing:.14em;
  color:rgba(10,10,10,.6)}
.prop .tot b{font-weight:900;font-size:40px;font-variant-numeric:tabular-nums}
.prop .sign{border:2px dashed rgba(10,10,10,.42);border-radius:var(--r);padding:12px 14px;
  font-family:var(--mono);font-size:15px;letter-spacing:.1em;color:rgba(10,10,10,.5);
  text-transform:uppercase}
.prop .btn{background:var(--ink);color:var(--paper);text-align:center;font-weight:800;
  font-size:19px;letter-spacing:.08em;text-transform:uppercase;padding:16px;
  border-radius:var(--r)}

/* compact variant for the split-compare half, which is much shorter */
.prop.compact{padding:18px 18px;gap:9px}
.prop.compact .ph{padding-bottom:9px}
.prop.compact .ph b{font-size:21px}
.prop.compact .ph i{font-size:13px}
.prop.compact .row{font-size:16px}
.prop.compact .row s{font-size:14px}
.prop.compact .tot{padding-top:10px}
.prop.compact .tot span{font-size:13px}
.prop.compact .tot b{font-size:30px}
.prop.compact .btn{font-size:15px;padding:11px}
.vt .prop.compact{padding:26px;gap:14px}
.vt .prop.compact .ph b{font-size:28px}
.vt .prop.compact .row{font-size:22px}
.vt .prop.compact .tot b{font-size:40px}
.vt .prop.compact .btn{font-size:20px;padding:16px}

/* ---- device ---- */
.dev{flex:none;width:352px;height:718px;border:6px solid var(--ink);
  border-radius:9px;box-shadow:16px 16px 0 var(--blueprint);position:relative;
  overflow:hidden;background:var(--paper)}
.vt .dev{width:520px;height:1060px;align-self:center}
.dev .notch{position:absolute;top:0;left:50%;transform:translateX(-50%);width:132px;
  height:20px;background:var(--ink);border-radius:0 0 8px 8px;z-index:3}
.dev .prop{padding-top:38px}

/* ---- price ladder ---- */
.ladder{display:flex;flex-direction:column;gap:18px;margin-top:38px}
.prow{display:flex;justify-content:space-between;align-items:center;
  border:var(--bw) solid var(--ink);border-radius:var(--r);padding:26px 30px;
  background:var(--paper)}
.prow .pl{font-family:var(--mono);font-size:21px;font-weight:700;letter-spacing:.13em;
  text-transform:uppercase}
.prow .pv{font-weight:900;font-size:52px;font-variant-numeric:tabular-nums;
  letter-spacing:-.01em}
.prow.muted{border-color:rgba(10,10,10,.30);color:rgba(10,10,10,.45)}
.prow.hero{background:var(--blueprint);border-color:var(--ink);color:var(--paper);
  box-shadow:11px 11px 0 var(--ink)}
.prow.hero .pv{font-size:64px}

/* ---- line items table ---- */
.tbl{margin-top:34px;border:var(--bw) solid var(--ink);border-radius:var(--r);
  overflow:hidden;background:var(--paper)}
.tbl .th,.tbl .tr{display:grid;grid-template-columns:1fr 90px 150px 180px;
  align-items:center;padding:18px 26px;gap:12px}
.tbl .th{background:var(--ink);color:var(--paper);font-family:var(--mono);font-size:17px;
  font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.tbl .tr{border-top:2px solid rgba(10,10,10,.14);font-size:24px;
  font-variant-numeric:tabular-nums}
.tbl .tr .sku{font-family:var(--mono);font-size:20px;font-weight:600;letter-spacing:.04em}
.tbl .tr .n{text-align:right}
.tbl .tr .tot{text-align:right;font-weight:800}
.tbl .live{display:flex;align-items:center;gap:10px;justify-content:flex-end;
  font-family:var(--mono);font-size:16px;font-weight:700;letter-spacing:.12em;
  text-transform:uppercase;color:var(--success);padding:16px 26px;
  border-top:2px solid rgba(10,10,10,.14)}
.dot{width:11px;height:11px;border-radius:50%;background:var(--success)}

/* ---- manifest ---- */
.man{display:flex;gap:30px;margin-top:40px}
.mcol{flex:1;border:var(--bw) solid var(--ink);border-radius:var(--r);padding:28px 26px;
  background:var(--paper)}
.mcol.no{border-color:rgba(10,10,10,.30)}
.mcol h4{font-family:var(--mono);font-size:19px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;padding-bottom:16px;border-bottom:2px solid var(--ink);
  margin-bottom:18px}
.mcol.yes h4{color:var(--blueprint);border-bottom-color:var(--blueprint)}
.mcol.no h4{color:rgba(10,10,10,.45);border-bottom-color:rgba(10,10,10,.25)}
.mcol li{list-style:none;display:flex;gap:14px;align-items:flex-start;font-size:26px;
  line-height:1.34;padding:11px 0}
.mcol .bx{width:17px;height:17px;flex:none;margin-top:8px;border:3px solid var(--ink)}
.mcol.yes .bx{background:var(--blueprint);border-color:var(--blueprint)}
.mcol.no{color:rgba(10,10,10,.45)}
.mcol.no .bx{border-color:rgba(10,10,10,.35)}

/* ---- aerial overlay ---- */
.aer{position:relative;flex:1;min-height:470px;margin-top:26px;
  border:var(--bw) solid var(--ink);border-radius:var(--r);overflow:hidden}
.vt .aer{min-height:900px}
.aer .stamp{position:absolute;left:26px;bottom:26px;margin:0;z-index:4}
.aer .stamp .v{font-size:76px}
.vt .aer .stamp .v{font-size:104px}
.aer .stamp .l{font-size:16px}
.aer img{width:100%;height:100%;object-fit:cover}
.aer .ov{position:absolute;inset:0}
.aer .chip{position:absolute;background:var(--paper);border:3px solid var(--ink);
  border-radius:var(--r);font-family:var(--mono);font-size:19px;font-weight:700;
  letter-spacing:.1em;padding:8px 13px;box-shadow:5px 5px 0 var(--blueprint)}
`;

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const chrome = (ad, size) => `
  <div class="grid"></div><div class="frame"></div>
  <div class="reg tl"></div><div class="reg tr"></div>
  <div class="reg bl"></div><div class="reg br"></div>
  <div class="slug b">JOBFLEX · AD-${ad.id} · ${size === "sq" ? "1080×1080" : "1080×1920"} · ${esc(ad.slug).toUpperCase()}</div>`;

const foot = (ad) => `
  <div class="foot">
    <div class="mark">JOB<span>FLEX</span></div>
    <div class="cta">${esc(ad.cta)}</div>
  </div>`;

const head = (ad) => `
  <div class="kicker">${esc(ad.kicker)}</div>
  <h1>${esc(ad.headline_visual)}</h1>
  ${ad.subline ? `<div class="sub">${esc(ad.subline)}</div>` : ""}`;

const miniProp = ({ compact = false } = {}) => `
  <div class="prop${compact ? " compact" : ""}">
    <div class="ph"><b>Cedar Fence</b><i>#1042</i></div>
    <div class="row"><span>Posts · PT 4×4×8</span><s>27</s></div>
    <div class="row"><span>Pickets · Cedar 1×6</span><s>318</s></div>
    <div class="row"><span>Gate hardware</span><s>2</s></div>
    ${compact ? "" : `<div class="row"><span>Labour · 3 days</span><s>—</s></div>
    <div class="sign">Signature ______________</div>`}
    <div class="tot"><span>Total</span><b>$6,480</b></div>
    <div class="btn">Accept &amp; pay deposit</div>
  </div>`;

// Templates whose payload panel needs the extra room.
export const DENSE = new Set([
  "split-compare", "price-ladder", "device-demo",
  "aerial-overlay", "line-items", "manifest",
]);

// ---------------------------------------------------------------- templates
const T = {
  "stat-stamp": (ad) => `
    ${head(ad)}
    <div class="spacer"></div>
    <div class="stamp"><div class="v">${esc(ad.stat_value)}</div>
      <div class="l">${esc(ad.stat_label)}</div></div>
    ${foot(ad)}`,

  "split-compare": (ad) => `
    ${head(ad)}
    <div class="split">
      <div class="half bad"><div class="tag">${esc(ad.left_label)}</div>
        <div class="fill"><img src="${dataUri("legalpad")}"></div></div>
      <div class="half good"><div class="tag">${esc(ad.right_label)}</div>
        <div class="fill">${miniProp({ compact: true })}</div></div>
    </div>
    ${foot(ad)}`,

  "price-ladder": (ad) => `
    ${head(ad)}
    <div class="ladder">
      ${ad.price_rows.map((r) => `
        <div class="prow ${r.muted ? "muted" : "hero"}">
          <div class="pl">${esc(r.label)}</div><div class="pv">${esc(r.value)}</div>
        </div>`).join("")}
    </div>
    <div class="spacer"></div>
    ${foot(ad)}`,

  "device-demo": (ad) => `
    <div class="cols">
      <div class="c-copy">${head(ad)}</div>
      <div class="c-dev"><div class="dev"><div class="notch"></div>${miniProp()}</div></div>
    </div>
    ${foot(ad)}`,

  "line-items": (ad) => `
    ${head(ad)}
    <div class="tbl">
      <div class="th"><div>Material</div><div class="n">Qty</div>
        <div class="n">Unit</div><div class="n">Total</div></div>
      ${ad.line_items.map((i) => `
        <div class="tr"><div class="sku">${esc(i.sku)}</div>
          <div class="n">${esc(i.qty)}</div><div class="n">${esc(i.price)}</div>
          <div class="tot">${esc(i.total)}</div></div>`).join("")}
      <div class="live"><span class="dot"></span>Prices pulled today</div>
    </div>
    <div class="spacer"></div>
    ${foot(ad)}`,

  manifest: (ad) => `
    ${head(ad)}
    <div class="man">
      <div class="mcol yes"><h4>Built for</h4><ul>
        ${ad.manifest_yes.map((t) => `<li><span class="bx"></span>${esc(t)}</li>`).join("")}
      </ul></div>
      <div class="mcol no"><h4>Not built for</h4><ul>
        ${ad.manifest_no.map((t) => `<li><span class="bx"></span>${esc(t)}</li>`).join("")}
      </ul></div>
    </div>
    <div class="spacer"></div>
    ${foot(ad)}`,

  "aerial-overlay": (ad) => `
    ${head(ad)}
    <div class="aer">
      <img src="${dataUri("aerial")}">
      <svg class="ov" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="13" y="15" width="74" height="66" fill="none" stroke="#4a9eff"
              stroke-width="0.7" stroke-dasharray="2.4 1.6"/>
        <rect x="13" y="15" width="74" height="66" fill="#1854a0" opacity="0.10"/>
        ${[[13,15],[87,15],[13,81],[87,81]].map(([x,y]) =>
          `<rect x="${x-1.1}" y="${y-1.1}" width="2.2" height="2.2" fill="#f2f0eb"
                 stroke="#0a0a0a" stroke-width="0.5"/>`).join("")}
      </svg>
      <div class="chip" style="left:40%;top:6%">74.0 FT</div>
      <div class="chip" style="left:3%;top:44%">66.0 FT</div>
      <div class="chip" style="right:4%;top:8%">2 GATES</div>
      <div class="stamp"><div class="v">${esc(ad.stat_value)}</div>
        <div class="l">${esc(ad.stat_label)}</div></div>
    </div>
    ${foot(ad)}`,
};

export function renderAd(ad, size) {
  const inner = (T[ad.template] || T["stat-stamp"])(ad);
  const dense = DENSE.has(ad.template) ? " dense" : "";
  return `<div class="ad ${size}${dense}" data-id="${ad.id}" data-size="${size}">
    ${chrome(ad, size)}<div class="body">${inner}</div></div>`;
}

export function page(ads, size) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
    <body>${ads.map((a) => renderAd(a, size)).join("\n")}</body></html>`;
}

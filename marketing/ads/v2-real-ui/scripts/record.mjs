// Record real JobFlex UI flows for the v2 ad batch.
// Usage: node record.mjs <smart|materials|fence|proposals|calendar>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const ROOT = "c:/joblfex-v3/marketing/ads/v2-real-ui";
const REC = path.join(ROOT, "rec");
const SHOTS = path.join(ROOT, "shots");
const DBG = path.join(ROOT, "debug");
for (const d of [REC, SHOTS, DBG]) fs.mkdirSync(d, { recursive: true });

const flow = process.argv[2];
if (!flow) { console.error("need flow arg"); process.exit(1); }

const t0 = Date.now();
const marks = [];
const mark = (label) => {
  marks.push({ t: +((Date.now() - t0) / 1000).toFixed(2), label });
  console.log("MARK", ((Date.now() - t0) / 1000).toFixed(1) + "s", label);
};

// Hide the Next.js dev badge; add a visible tap ripple so viewers see touches.
const INIT = `
  const style = document.createElement('style');
  style.textContent = \`
    nextjs-portal{display:none!important}
    .__tap{position:fixed;width:56px;height:56px;border-radius:50%;
      background:rgba(24,84,160,.35);border:3px solid rgba(24,84,160,.8);
      transform:translate(-50%,-50%) scale(.4);pointer-events:none;z-index:2147483647;
      animation:__tapA .55s ease-out forwards}
    @keyframes __tapA{to{transform:translate(-50%,-50%) scale(1.5);opacity:0}}
  \`;
  document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(style));
  window.addEventListener('pointerdown',(e)=>{
    const d=document.createElement('div');d.className='__tap';
    d.style.left=e.clientX+'px';d.style.top=e.clientY+'px';
    document.body.appendChild(d);setTimeout(()=>d.remove(),600);
  },true);
`;

const browser = await chromium.launch();

async function makeContext(kind) {
  const opts = kind === "mobile"
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        recordVideo: { dir: REC, size: { width: 780, height: 1688 } } }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
        recordVideo: { dir: REC, size: { width: 2160, height: 1350 } } };
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(INIT);
  return ctx;
}

async function login(page) {
  await page.goto(BASE + "/auth/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"], input[name="email"]', "owner@acme.test");
  await page.fill('input[type="password"], input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

const pause = (page, ms) => page.waitForTimeout(ms);

async function slowScroll(page, total, stepPx = 60, stepMs = 45) {
  let done = 0;
  while (Math.abs(done) < Math.abs(total)) {
    const d = Math.sign(total) * Math.min(stepPx, Math.abs(total - done));
    await page.mouse.wheel(0, d);
    done += d;
    await page.waitForTimeout(stepMs);
  }
}

async function tapText(page, text, opts = {}) {
  const loc = page.getByText(text, { exact: opts.exact ?? false }).first();
  await loc.waitFor({ state: "visible", timeout: opts.timeout ?? 15000 });
  await loc.click();
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name + ".png") });
  console.log("shot", name);
}
async function dbg(page, name) {
  await page.screenshot({ path: path.join(DBG, flow + "-" + name + ".png") }).catch(() => {});
}

// ---------------------------------------------------------------- flows
const flows = {
  // 1 · Smart Proposal — type the job, AI builds the estimate
  async smart(page) {
    await page.goto(BASE + "/dashboard/advanced-ai", { waitUntil: "networkidle" });
    await pause(page, 2000);
    mark("scene:wizard");
    await tapText(page, "Decking");
    await pause(page, 900);
    await tapText(page, "NEXT");
    await pause(page, 1400);
    await dbg(page, "step2");
    mark("scene:location");
    // step 2 — location: type city, pick state
    const city = page.locator('input[placeholder*="Bothell"], input').first();
    await city.click().catch(() => {});
    await page.keyboard.type("Austin", { delay: 45 });
    await pause(page, 700);
    await page.getByText("State...", { exact: false }).first().click({ timeout: 3000 }).catch(() => {});
    await pause(page, 700);
    await page.getByText("Texas", { exact: false }).first().click({ timeout: 3000 }).catch(() => {});
    await pause(page, 700);
    await dbg(page, "step2-filled");
    await tapText(page, "NEXT");
    await pause(page, 1400);
    await dbg(page, "step3");
    mark("scene:describe");
    // step 3 — describe the job
    const ta = page.locator("textarea").first();
    if (await ta.isVisible().catch(() => false)) {
      await ta.click();
      await page.keyboard.type(
        "Tear off old 12x20 deck, rebuild with cedar boards, new railing, two steps, stain and seal.",
        { delay: 26 }
      );
      await pause(page, 900);
    }
    await tapText(page, "NEXT");
    await pause(page, 1500);
    await dbg(page, "step4");
    // find the generate button
    const gen = page.getByRole("button", { name: /generate/i }).first();
    if (await gen.isVisible().catch(() => false)) {
      mark("gen:start");
      await gen.click();
    } else {
      mark("gen:start");
      await page.getByText(/GENERATE/i).first().click().catch(() => {});
    }
    // wait for estimate output (totals appear)
    await page
      .waitForSelector("text=/TOTAL|Total/", { timeout: 240000 })
      .catch(() => {});
    await pause(page, 2500);
    mark("gen:done");
    await page.getByText("DISMISS", { exact: false }).first().click({ timeout: 3000 }).catch(() => {});
    await pause(page, 1000);
    await dbg(page, "result-top");
    await shot(page, "smart-money");
    mark("scene:result");
    await slowScroll(page, 2400);
    await pause(page, 1200);
    await dbg(page, "result-bottom");
    mark("end");
  },

  // 2 · Materials — real store prices inside the estimate (desktop accepted stack)
  async materials(page) {
    await page.goto(BASE + "/dashboard/proposals", { waitUntil: "networkidle" });
    await pause(page, 2200);
    mark("scene:list");
    await page.getByRole("button", { name: /Accepted/ }).first().click({ timeout: 8000 });
    await pause(page, 1800);
    await dbg(page, "accepted-tab");
    mark("scene:accepted");
    await slowScroll(page, 500);
    await pause(page, 800);
    // open the Materials sheet from the accepted card's action chip
    const mat = page.locator('[data-act="materials"]').first();
    await mat.scrollIntoViewIfNeeded();
    await pause(page, 900);
    await mat.click({ timeout: 8000 });
    await pause(page, 2200);
    await dbg(page, "materials");
    mark("scene:sheet");
    await shot(page, "materials-money");
    await slowScroll(page, 1400);
    await pause(page, 1200);
    await dbg(page, "materials-scrolled");
    mark("end");
  },

  // 3 · Fence Studio — trace the fence, price updates live (desktop)
  async fence(page) {
    await page.goto(BASE + "/dashboard/fence-estimator", { waitUntil: "networkidle" });
    await pause(page, 3500); // map tiles
    mark("scene:map");
    // trace a run across the backyard
    const pts = [ [640, 520], [830, 505], [860, 660], [660, 690] ];
    for (const [x, y] of pts) {
      await page.mouse.move(x, y, { steps: 22 });
      await pause(page, 350);
      await page.mouse.down(); await page.mouse.up();
      await pause(page, 550);
      mark("trace:point");
    }
    await page.mouse.click(660, 690, { button: "right" });
    await pause(page, 800);
    await page.keyboard.press("Escape");
    await page.mouse.move(1200, 850, { steps: 15 });
    await pause(page, 900);
    mark("scene:priced");
    await dbg(page, "traced");
    // swap material + height, price moves live
    await tapText(page, "Composite");
    await pause(page, 1400);
    mark("swap:composite");
    await page.getByRole("button", { name: "8 ft", exact: true }).click({ timeout: 5000 }).catch(() => {});
    await pause(page, 1400);
    mark("swap:8ft");
    await dbg(page, "height");
    // add a gate from the Gate dropdown
    await page.getByRole("button", { name: /Gate/ }).first().click({ timeout: 5000 }).catch(() => {});
    await pause(page, 1000);
    await dbg(page, "gate-menu");
    const opt = page.locator('[role="menuitem"], [role="option"], button').filter({ hasText: /walk|gate|4 ft|standard/i }).first();
    await opt.click({ timeout: 4000 }).catch(() => {});
    await pause(page, 1200);
    mark("gate:added");
    await shot(page, "fence-money");
    await pause(page, 1500);
    mark("end");
  },

  // 4 · Proposals — the pipeline + a client-ready document
  async proposals(page) {
    await page.goto(BASE + "/dashboard/proposals", { waitUntil: "networkidle" });
    await pause(page, 2200);
    mark("scene:masthead");
    await shot(page, "proposals-money");
    await slowScroll(page, 1200);
    await pause(page, 900);
    mark("scene:list");
    await slowScroll(page, 900);
    await pause(page, 700);
    // open the viewed roof proposal through its actions sheet
    const kebab = page.locator('[aria-label^="Actions for Cedar Pergola"]').first();
    await kebab.scrollIntoViewIfNeeded();
    await pause(page, 900);
    await kebab.click({ timeout: 8000 });
    await pause(page, 1600);
    await dbg(page, "sheet");
    mark("scene:sheet");
    await tapText(page, "Open proposal");
    await pause(page, 3000);
    await dbg(page, "detail");
    mark("scene:detail");
    await slowScroll(page, 2600);
    await pause(page, 1200);
    await dbg(page, "detail-bottom");
    await slowScroll(page, 1600);
    await pause(page, 1000);
    mark("end");
  },

  // 5 · Calendar — crew, jobs and the week on one screen
  async calendar(page) {
    await page.goto(BASE + "/dashboard/calendar", { waitUntil: "networkidle" });
    await pause(page, 2200);
    mark("scene:month");
    await slowScroll(page, 1000);
    await pause(page, 800);
    // tap the day with events (12th has dots)
    await tapText(page, "12", { exact: true });
    await pause(page, 1800);
    await slowScroll(page, 900);
    await pause(page, 1200);
    await dbg(page, "day");
    mark("scene:day");
    await shot(page, "calendar-money");
    await slowScroll(page, 700);
    await pause(page, 1200);
    // quick-add sheet — the scheduling moment
    await tapText(page, "ADD");
    await pause(page, 1800);
    await dbg(page, "quickadd");
    mark("scene:quickadd");
    const title = page.locator('input[type="text"], input:not([type])').first();
    if (await title.isVisible().catch(() => false)) {
      await title.click();
      await page.keyboard.type("Rivera — Deck rebuild, day 1", { delay: 40 });
      await pause(page, 1200);
    }
    await dbg(page, "quickadd-filled");
    mark("end");
  },
};

const kind = flow === "fence" || flow === "materials" ? "desktop" : "mobile";
const ctx = await makeContext(kind);
const page = await ctx.newPage();
await login(page);
mark("login-done");

try {
  await flows[flow](page);
} catch (e) {
  console.error("FLOW ERROR:", e.message);
  await dbg(page, "error");
}

const vid = page.video();
await ctx.close();
const vpath = await vid.path();
const dest = path.join(REC, flow + ".webm");
fs.copyFileSync(vpath, dest);
fs.rmSync(vpath, { force: true });
fs.writeFileSync(path.join(REC, flow + "-marks.json"), JSON.stringify(marks, null, 1));
await browser.close();
console.log("saved", dest);

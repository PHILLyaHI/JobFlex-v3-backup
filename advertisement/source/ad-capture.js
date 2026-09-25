// Film set: the real roof estimator on the stand, at 2x, step by step.
//   node ad-capture.js start      → est-start.png (address typed)
//   node ad-capture.js report     → est-report.png (+ est-aerial.png: the live map with the outline)
//   node ad-capture.js builder    → est-builder.png, est-builder-metal.png, est-lines.png, then converts → proposal id
//   node ad-capture.js portal <publicId> → portal-desktop.png, portal-mobile.png
const { chromium } = require("playwright-core");
const fs = require("fs");
const SP = "/private/tmp/claude-501/-Users-dmitriyapetenok-Documents-SmartSpace-Pro/3d5a51a0-70ce-4118-ade1-850beec562fb/scratchpad";
const OUT = SP + "/ad/assets";
const BASE = "http://localhost:3100";
const T = 240000;
const step = process.argv[2] || "start";
const arg = process.argv[3];

(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const ctx = await b.newContext({ storageState: SP + "/adshoot/state.json", viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));

  async function openEstimator() {
    await page.goto(`${BASE}/dashboard/roof-estimator`, { waitUntil: "domcontentloaded", timeout: T });
    await page.waitForSelector("#addr", { timeout: T });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  }
  async function openRecent() {
    await openEstimator();
    const recent = page.locator(".rf-recent-card button, .rf-recent-card a, .rf-recent-card [role=button]", { hasText: "18412 92nd Ave NE" }).first();
    await recent.waitFor({ timeout: 60000 });
    await recent.click();
    await page.waitForSelector("#rfCanvas", { timeout: 60000 });
    await page.waitForTimeout(6000); // satellite tiles
  }

  if (step === "start") {
    await openEstimator();
    await page.fill("#addr", "18412 92nd Ave NE");
    await page.fill("#city", "Bothell");
    await page.fill("#zip", "98011");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + "/est-start.png" });
    console.log("est-start.png");
  }

  if (step === "report") {
    await openRecent();
    await page.screenshot({ path: OUT + "/est-report.png" });
    const canvas = page.locator("#rfCanvas");
    await canvas.screenshot({ path: OUT + "/est-aerial.png" });
    const box = await canvas.boundingBox();
    fs.writeFileSync(OUT + "/est-report.json", JSON.stringify({ canvas: box }, null, 1));
    // the numbers as the page prints them
    const txt = await page.locator(".rf-body, .rf-report, main").first().innerText().catch(() => "");
    fs.writeFileSync(OUT + "/est-report.txt", txt);
    console.log("est-report.png + est-aerial.png; canvas", box);
  }

  if (step === "builder") {
    await openRecent();
    const card = page.locator(".bea-ledger").first();
    await card.waitFor({ timeout: 60000 });
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: OUT + "/est-builder.png" });
    const cardBox = await card.boundingBox();
    // open the roof system line and show the choice
    await page.locator("text=Roof system").first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: OUT + "/est-builder-open.png" });
    const html = await card.innerHTML();
    fs.writeFileSync(OUT + "/est-builder.html", html);
    fs.writeFileSync(OUT + "/est-builder.json", JSON.stringify({ card: cardBox }, null, 1));
    console.log("est-builder.png / est-builder-open.png; card", cardBox);
  }

  if (step === "portal") {
    const publicId = arg;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE}/portal/q/${publicId}`, { waitUntil: "domcontentloaded", timeout: T });
    await page.waitForSelector(".jf-proposal-portal .pv-intro-card", { timeout: T }); await page.addStyleTag({ content: "nextjs-portal{display:none!important}[data-trial-watermark]{display:none!important}" });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + "/portal-desktop.png" });
    await page.screenshot({ path: OUT + "/portal-desktop-full.png", fullPage: true });
    const m = await b.newContext({ storageState: SP + "/adshoot/state.json", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const mp = await m.newPage();
    await mp.goto(`${BASE}/portal/q/${publicId}`, { waitUntil: "domcontentloaded", timeout: T });
    await mp.waitForSelector(".jf-mobile-proposal-client .mpc-card", { timeout: T }); await mp.addStyleTag({ content: "nextjs-portal{display:none!important}[data-trial-watermark]{display:none!important}" });
    await mp.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await mp.waitForTimeout(1500);
    await mp.screenshot({ path: OUT + "/portal-mobile.png" });
    await mp.screenshot({ path: OUT + "/portal-mobile-full.png", fullPage: true });
    await m.close();
    console.log("portal-desktop.png / portal-mobile.png");
  }

  await b.close();
  if (errors.length) console.log("PAGE ERRORS:", errors.slice(0, 3).join(" | "));
})().catch((e) => { console.error("CAPTURE ERROR", e.message.split("\n")[0]); process.exit(1); });

// Payment footage on the stand: the pay register before/after acceptance, the
// accept moment, the paid state, and the contractor's side.
//   node ad-pay.js before <publicId>    → pay-before-desk.png, pay-before-phone.png
//   node ad-pay.js accept <publicId>    → accepts in the browser; pay-accepted-desk/phone.png
//   node ad-pay.js paid <publicId>      → (after the DB marks the deposit paid) pay-paid-desk/phone.png
//   node ad-pay.js office               → dashboard bell + proposals + financials
const { chromium } = require("playwright-core");
const fs = require("fs");
const SP = "/private/tmp/claude-501/-Users-dmitriyapetenok-Documents-SmartSpace-Pro/3d5a51a0-70ce-4118-ade1-850beec562fb/scratchpad";
const OUT = SP + "/ad/assets";
const BASE = "http://localhost:3100";
const T = 240000;
const CLEAN = "nextjs-portal{display:none!important}[data-trial-watermark]{display:none!important}";
const step = process.argv[2];
const publicId = process.argv[3];

(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const errors = [];
  const desk = async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
    await page.goto(`${BASE}/portal/q/${publicId}`, { waitUntil: "domcontentloaded", timeout: T });
    await page.waitForSelector(".jf-proposal-portal .pv-intro-card", { timeout: T });
    await page.addStyleTag({ content: CLEAN });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return page;
  };
  const phone = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
    await page.goto(`${BASE}/portal/q/${publicId}`, { waitUntil: "domcontentloaded", timeout: T });
    await page.waitForSelector(".jf-mobile-proposal-client .mpc-card", { timeout: T });
    await page.addStyleTag({ content: CLEAN });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return page;
  };
  const shotPay = async (page, name) => {
    const reg = page.locator(".pv-pay").first();
    await reg.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    const box = await reg.boundingBox().catch(() => null);
    const html = await reg.innerText().catch(() => "");
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ box, text: html }, null, 1));
    console.log(name, box);
  };
  const shotPhonePay = async (page, name) => {
    const pc = page.locator("text=/Pay with|Deposit/").first();
    await pc.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
    console.log(name);
  };

  if (step === "before") {
    const d = await desk(); await shotPay(d, "pay-before-desk");
    const m = await phone(); await shotPhonePay(m, "pay-before-phone");
  }
  if (step === "accept") {
    const m = await phone();
    await m.fill("input[placeholder*='name' i]", "Sarah Mitchell");
    await m.waitForTimeout(400);
    await m.screenshot({ path: `${OUT}/pay-accept-typed-phone.png` });
    await m.click("button:has-text('Accept proposal')");
    await m.waitForTimeout(2500);
    await m.screenshot({ path: `${OUT}/pay-accepted-phone-top.png` });
    await m.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await shotPhonePay(m, "pay-accepted-phone");
    const d = await desk(); await d.screenshot({ path: `${OUT}/pay-accepted-desk-top.png` }); await shotPay(d, "pay-accepted-desk");
  }
  if (step === "paid") {
    const d = await desk(); await shotPay(d, "pay-paid-desk");
    const m = await phone(); await shotPhonePay(m, "pay-paid-phone");
  }
  if (step === "office") {
    const ctx = await b.newContext({ storageState: SP + "/adshoot/state.json", viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: T });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.addStyleTag({ content: CLEAN });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/office-dashboard.png` });
    const bell = page.locator("[aria-label*='otification' i], button:has(.i-bell), .nb-btn").first();
    if (await bell.count()) { await bell.click(); await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/office-bell.png` }); const bb = await page.locator("[role=dialog], .nb-panel, .nb-pop").first().boundingBox().catch(() => null); fs.writeFileSync(`${OUT}/office-bell.json`, JSON.stringify(bb)); console.log("bell", bb); }
    await page.goto(`${BASE}/dashboard/proposals`, { waitUntil: "domcontentloaded", timeout: T });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.addStyleTag({ content: CLEAN }); await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/office-proposals.png` });
    await page.goto(`${BASE}/dashboard/financials`, { waitUntil: "domcontentloaded", timeout: T });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.addStyleTag({ content: CLEAN }); await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/office-financials.png` });
    console.log("office done");
  }
  await b.close();
  if (errors.length) console.log("PAGE ERRORS:", errors.slice(0, 3).join(" | "));
})().catch((e) => { console.error("CAPTURE ERROR", e.message.split("\n")[0]); process.exit(1); });

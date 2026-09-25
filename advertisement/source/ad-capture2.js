// Film set, part two: the builder card (shingles → metal, flashing open),
// the lines review, the convert, then the client's portal on desk and phone.
const { chromium } = require("playwright-core");
const fs = require("fs");
const SP = "/private/tmp/claude-501/-Users-dmitriyapetenok-Documents-SmartSpace-Pro/3d5a51a0-70ce-4118-ade1-850beec562fb/scratchpad";
const OUT = SP + "/ad/assets";
const BASE = "http://localhost:3100";
const T = 240000;
const CLEAN = "nextjs-portal{display:none!important}[data-trial-watermark]{display:none!important}";
(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const ctx = await b.newContext({ storageState: SP + "/adshoot/state.json", viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const clean = async (p) => p.addStyleTag({ content: CLEAN }).catch(() => null);

  await page.goto(`${BASE}/dashboard/roof-estimator`, { waitUntil: "domcontentloaded", timeout: T });
  await page.waitForSelector("#addr", { timeout: T });
  await clean(page);
  // the start screen, clean, with the address typed
  await page.fill("#addr", "18412 92nd Ave NE"); await page.fill("#city", "Bothell"); await page.fill("#zip", "98011");
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + "/est-start.png" });
  // the report
  await page.locator(".rf-recent-card button, .rf-recent-card a, .rf-recent-card [role=button]", { hasText: "18412 92nd Ave NE" }).first().click();
  await page.waitForSelector("#rfCanvas", { timeout: 60000 });
  await page.waitForTimeout(2500);
  await clean(page);
  await page.screenshot({ path: OUT + "/est-report.png" });
  const canvasBox = await page.locator("#rfCanvas").boundingBox();
  const stats = await page.locator(".rf-body, main").first().evaluate((el) => Array.from(el.querySelectorAll("*")).filter((n) => n.children.length === 0).map((n) => n.textContent.trim()).filter(Boolean).slice(0, 60));
  fs.writeFileSync(OUT + "/est-report.json", JSON.stringify({ canvasBox, stats }, null, 1));

  // the builder card
  const card = page.locator(".card", { hasText: "Build an estimate" }).first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + "/est-builder.png" });
  const cardBox = await card.boundingBox();
  await card.screenshot({ path: OUT + "/est-builder-card.png" });
  // row 01 is open on arrival; the roof type picker carries its label as the accessible name
  const typeBtn = card.locator('button[aria-label="Roof type"]').first();
  if (!(await typeBtn.count())) { await card.locator("button.bec-row-btn", { hasText: "Roof system" }).click(); await page.waitForTimeout(500); }
  await card.locator('button[aria-label="Roof type"]').first().click();
  await page.waitForTimeout(600);
  const menu = page.locator("[role=listbox], [role=menu], [role=dialog], .bp-sel-menu, .bec-menu, .bp-menu").last();
  const menuText = await menu.innerText().catch(() => "");
  fs.writeFileSync(OUT + "/roof-types.txt", menuText);
  await page.screenshot({ path: OUT + "/est-builder-menu.png" });
  const metal = page.locator("[role=option], [role=menuitem], [role=menuitemradio], button", { hasText: /metal/i }).last();
  const hasMetal = await metal.count();
  if (hasMetal) { await metal.click(); await page.waitForTimeout(900); }
  else { await page.keyboard.press("Escape"); }
  await clean(page);
  await card.screenshot({ path: OUT + "/est-builder-metal.png" });
  await page.screenshot({ path: OUT + "/est-builder-metal-page.png" });
  const rowsMetal = await card.locator("button.bec-row-btn").allInnerTexts();
  // flashing row open
  await card.locator("button.bec-row-btn", { hasText: "Flashing" }).click();
  await page.waitForTimeout(600);
  await card.screenshot({ path: OUT + "/est-builder-flashing.png" });
  // back to shingles for the lines review? keep metal — the ad shows the switch.
  // the lines review
  await card.locator("button", { hasText: /Review \d+ lines/ }).first().click();
  await page.waitForTimeout(1500);
  await clean(page);
  await page.screenshot({ path: OUT + "/est-lines.png" });
  await page.screenshot({ path: OUT + "/est-lines-full.png", fullPage: true });
  const linesText = await page.locator("main").innerText().catch(() => "");
  fs.writeFileSync(OUT + "/est-lines.txt", linesText);
  // convert
  const convert = page.locator("button", { hasText: "Convert to proposal" }).first();
  await convert.scrollIntoViewIfNeeded();
  await convert.click();
  await page.waitForURL(/proposal=|\/proposals\//, { timeout: 120000 });
  await page.waitForTimeout(2000);
  const url = page.url();
  const m = url.match(/proposal=([a-z0-9]+)|proposals\/([a-z0-9]+)/i);
  const proposalId = m ? (m[1] || m[2]) : null;
  fs.writeFileSync(OUT + "/convert.json", JSON.stringify({ url, proposalId, cardBox, rowsMetal, hasMetal: !!hasMetal }, null, 1));
  await clean(page);
  await page.screenshot({ path: OUT + "/proposal-builder.png" });
  console.log("converted →", url, "| metal picked:", !!hasMetal, "| rows:", rowsMetal.map((r) => r.replace(/\s+/g, " ").slice(0, 40)).join(" || "));
  await b.close();
})().catch((e) => { console.error("CAPTURE2 ERROR", e.message.split("\n")[0]); process.exit(1); });

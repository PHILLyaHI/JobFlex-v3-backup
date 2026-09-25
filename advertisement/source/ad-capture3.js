// The builder's money: the "Cost adjustment" block (labor / materials, spread
// through every line) and a line's own material-labor split slider.
//   node ad-capture3.js explore   → lists the block's controls, screenshots it
//   node ad-capture3.js shoot     → bp-cost-before.png / bp-cost-after.png / bp-line-split.png + film-boxes.json
const { chromium } = require("playwright-core");
const fs = require("fs");
const SP = "/private/tmp/claude-501/-Users-dmitriyapetenok-Documents-SmartSpace-Pro/3d5a51a0-70ce-4118-ade1-850beec562fb/scratchpad";
const OUT = SP + "/ad/assets";
const mode = process.argv[2] || "explore";
const CLEAN = "nextjs-portal{display:none!important}[data-trial-watermark]{display:none!important}";
async function setRange(page, el, value) {
  await el.evaluate((input, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, String(v));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const ctx = await b.newContext({ storageState: SP + "/adshoot/state.json", viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/dashboard/manual-blueprint?proposal=cmug00kkd000710ynpit4bli9", { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.getByText("Cost adjustment", { exact: true }).first().waitFor({ timeout: 300000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.addStyleTag({ content: CLEAN });
  await page.waitForTimeout(1200);
  const block = page.locator("section, div", { has: page.locator("text=Cost adjustment") }).last();
  const costHead = page.getByText("Cost adjustment", { exact: true }).first();
  await costHead.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  // the block = the nearest ancestor that also contains inputs
  const info = await costHead.evaluate((h) => {
    let el = h; for (let i = 0; i < 8 && el; i++) { if (el.querySelectorAll("input, button, [role=slider]").length >= 2) break; el = el.parentElement; }
    const r = el.getBoundingClientRect();
    const controls = Array.from(el.querySelectorAll("input, button, [role=slider], select")).slice(0, 40).map((c) => `${c.tagName}${c.type ? "[" + c.type + "]" : ""} :: ${(c.getAttribute("aria-label") || c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40)} = ${c.value ?? ""}`);
    el.setAttribute("data-ad-cost", "1");
    return { box: { x: r.x, y: r.y + window.scrollY, w: r.width, h: r.height }, controls, text: el.innerText.replace(/\s+/g, " ").slice(0, 500) };
  });
  if (mode === "explore") {
    console.log(JSON.stringify(info, null, 1));
    await page.locator("[data-ad-cost]").screenshot({ path: OUT + "/bp-cost-explore.png" });
    await b.close(); return;
  }
  void block;
  // ── shoot: the lines before, the block's knobs before, click the tracks, the block after, the lines after
  const CLEANUP = async () => page.addStyleTag({ content: CLEAN }).catch(() => null);
  const linesHead = page.getByText("Line items", { exact: true }).first();
  await linesHead.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -40)); await page.waitForTimeout(500); await CLEANUP();
  await page.screenshot({ path: OUT + "/bp-lines-before.png" });
  const linesTop = await linesHead.evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  await costHead.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -60)); await page.waitForTimeout(500); await CLEANUP();
  await page.screenshot({ path: OUT + "/bp-cost-before.png" });
  const blockEl = page.locator("[data-ad-cost]").first();
  // the two adjust rows: the DIV after each "0.0%" button is the track; click along it
  const tracks = await blockEl.evaluate((el) => {
    const out = [];
    const rows = Array.from(el.querySelectorAll("*")).filter((n) => /adjust every (material|labor) cost/i.test(n.textContent || "") && n.children.length && n.getBoundingClientRect().height < 140);
    for (const row of rows.slice(-2)) { const r = row.getBoundingClientRect(); out.push({ text: row.textContent.replace(/\s+/g, " ").trim().slice(0, 40), x: r.x, y: r.y, w: r.width, h: r.height }); }
    const divs = Array.from(el.querySelectorAll("div")).filter((d) => { const r = d.getBoundingClientRect(); return r.width > 300 && r.height >= 6 && r.height <= 40 && d.children.length <= 3 && !d.textContent.trim(); }).slice(0, 12).map((d) => { const r = d.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cls: d.className }; });
    return { rows: out, divs };
  });
  fs.writeFileSync(OUT + "/bp-tracks.json", JSON.stringify(tracks, null, 1));
  const sliders = tracks.divs.filter((d) => /slider/.test(d.cls));
  const mat = sliders[0], lab = sliders[1];
  if (mat) { await page.mouse.click(mat.x + mat.w * 0.62, mat.y + mat.h / 2); await page.waitForTimeout(500); }
  if (lab) { await page.mouse.click(lab.x + lab.w * 0.55, lab.y + lab.h / 2); await page.waitForTimeout(700); }
  await CLEANUP();
  await page.screenshot({ path: OUT + "/bp-cost-after.png" });
  const blockText = await blockEl.innerText();
  const grand = await page.locator("text=/Grand total/i").first().evaluate((e) => e.parentElement?.innerText.replace(/\s+/g, " ")).catch(() => "");
  await page.evaluate((y) => window.scrollTo(0, y - 40), linesTop); await page.waitForTimeout(500); await CLEANUP();
  await page.screenshot({ path: OUT + "/bp-lines-after.png" });
  fs.writeFileSync(OUT + "/film-boxes.json", JSON.stringify({ costBox: info.box, tracks, blockText: blockText.replace(/\s+/g, " ").slice(0, 400), grand, linesTop }, null, 1));
  console.log("tracks:", JSON.stringify(tracks.divs.slice(0, 2)), "\nblock:", blockText.replace(/\s+/g, " ").slice(0, 200), "\ngrand:", grand);
  await b.close();
})().catch((e) => { console.error("CAPTURE3 ERROR", e.message.split("\n")[0]); process.exit(1); });

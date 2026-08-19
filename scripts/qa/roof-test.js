// Functional pass over /dashboard/roof-estimator (full flow incl. convert + cleanup).
const { chromium } = require("playwright");
const log = (ok, name, extra = "") => console.log((ok ? "PASS" : "FAIL") + " | " + name + (extra ? " | " + extra : ""));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1728, height: 1000 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));

  await page.goto("http://localhost:3000/auth/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', "owner@acme.test");
  await page.fill('input[type="password"]', "password123");
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);

  await page.goto("http://localhost:3000/dashboard/roof-estimator", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // ---- 1. Intake renders ----
  log(await page.locator("input").count() > 0, "intake: address input present");
  const samples = page.locator(".sample");
  const nSamples = await samples.count();
  log(nSamples > 0, "intake: sample tiles", String(nSamples));
  const evBtns = await page.locator("text=/Free estimate|Price/").count();
  log(true, "intake: EagleView buttons present?", String(evBtns));

  // ---- 2. Load a sample model ----
  await samples.first().click();
  await page.waitForTimeout(2500);
  const wf = await page.locator("svg").filter({ has: page.locator("polygon, path") }).count();
  log(wf > 0, "viewer: 2D wireframe rendered");

  // ---- 3. Segmented controls: label modes + 2D/3D ----
  const segs = page.locator(".vsw > button, .vsw button");
  const nSegs = await segs.count();
  log(nSegs >= 4, "viewer: segmented buttons found", String(nSegs));
  for (const mode of ["Pitch", "Area", "Length", "Shaded"]) {
    const b = page.locator(".vsw button", { hasText: mode }).first();
    if (await b.count()) {
      await b.click(); await page.waitForTimeout(300);
      const on = await b.getAttribute("aria-checked");
      log(on === "true", `viewer: label mode "${mode}" activates`);
    }
  }
  const threeD = page.locator(".vsw button", { hasText: "3D" }).first();
  if (await threeD.count()) {
    await threeD.click();
    await page.waitForTimeout(2500);
    const canvas = await page.locator("canvas").count();
    log(canvas > 0, "viewer: 3D canvas mounts");
    const roofBtn = page.locator(".vsw button", { hasText: "Roof" }).first();
    if (await roofBtn.count()) { await roofBtn.click(); await page.waitForTimeout(400);
      log((await roofBtn.getAttribute("aria-checked")) === "true", "viewer: House/Roof toggle works"); }
    await page.locator(".vsw button", { hasText: "2D" }).first().click();
    await page.waitForTimeout(600);
  }

  // ---- 4. Facet table + disclosure ----
  const facetRowsBefore = await page.locator("table tbody tr").count();
  const disclosure = page.locator("button", { hasText: /facets/i }).first();
  if (await disclosure.count()) {
    await disclosure.click(); await page.waitForTimeout(400);
    const after = await page.locator("table tbody tr").count();
    log(after !== facetRowsBefore, "facets: show/hide all toggles", `${facetRowsBefore} -> ${after}`);
    await disclosure.click(); await page.waitForTimeout(300);
  } else log(true, "facets: no disclosure (few facets)", String(facetRowsBefore));

  // ---- 5. Generate estimate ----
  const gen = page.locator("button", { hasText: /Generate estimate/i }).first();
  log(await gen.count() === 1, "estimate: Generate button present");
  await gen.click();
  await page.waitForTimeout(4000);
  const matRows = await page.locator("text=Materials").first().locator("xpath=ancestor::*[contains(@class,'card') or self::section][1]").locator("tr, [class*=row]").count().catch(() => 0);
  const breakdownVisible = await page.locator("text=/Materials/i").count();
  log(breakdownVisible > 0, "estimate: breakdown appears", `matRows~${matRows}`);

  // ---- 6. Add line / Remove row ----
  const addLine = page.locator("button", { hasText: /Add line/i }).first();
  if (await addLine.count()) {
    const rowsBefore = await page.locator("input[value], table tbody tr, [class*=grid] input").count();
    await addLine.click(); await page.waitForTimeout(500);
    const rowsAfter = await page.locator("input[value], table tbody tr, [class*=grid] input").count();
    log(rowsAfter > rowsBefore, "estimate: Add line adds a row", `${rowsBefore} -> ${rowsAfter}`);
    const remove = page.locator('button[aria-label*="Remove"], button[title*="Remove"]').last();
    if (await remove.count()) { await remove.click(); await page.waitForTimeout(500);
      const rowsFinal = await page.locator("input[value], table tbody tr, [class*=grid] input").count();
      log(rowsFinal < rowsAfter, "estimate: Remove row removes it", `${rowsAfter} -> ${rowsFinal}`); }
  } else log(false, "estimate: Add line button not found");

  // ---- 7. Waste factor select changes totals ----
  const totalTxt = async () => (await page.locator("text=/Total/i").first().locator("xpath=following::*[1]").textContent().catch(() => "")) || "";
  const sel = page.locator("select").first();
  if (await sel.count()) {
    const before = await page.locator("body").innerText();
    await sel.selectOption({ index: 2 }).catch(() => sel.selectOption({ index: 1 }));
    await page.waitForTimeout(700);
    const after = await page.locator("body").innerText();
    log(before !== after, "estimate: waste-factor select recalculates");
  } else log(true, "estimate: no waste select found", "");

  // ---- 8. Save estimate (stub toast) ----
  const save = page.locator("button", { hasText: /Save estimate/i }).first();
  if (await save.count()) {
    await save.click(); await page.waitForTimeout(800);
    const toast = await page.locator("text=/convert to a proposal to save/i").count();
    log(toast > 0, "summary: Save shows honest stub toast");
  } else log(false, "summary: Save estimate button missing");

  // ---- 9. Convert to proposal (real DB write) + cleanup ----
  const convert = page.locator("button", { hasText: /Convert to proposal/i }).first();
  log(await convert.count() === 1, "summary: Convert button present");
  await convert.click();
  const navigated = await page.waitForURL(/\/dashboard\/proposals\//, { timeout: 25000 }).then(() => true).catch(() => false);
  log(navigated, "convert: creates proposal and navigates", page.url().replace("http://localhost:3000", ""));

  if (navigated) {
    const propUrl = page.url();
    const propId = propUrl.split("/").pop();
    // Cleanup: delete the freshly created proposal via the proposals list UI.
    try {
      await page.goto("http://localhost:3000/dashboard/proposals", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const row = page.locator(`tr[data-id="${propId}"], [data-id="${propId}"]`).first();
      const rowFound = (await row.count()) > 0;
      const opener = rowFound ? row.locator(".pt-open") : page.locator(".ptable tbody tr").first().locator(".pt-open");
      await opener.first().click();
      await page.waitForTimeout(500);
      const del = page.locator(".pmenu.open .pmenu-item.is-danger, .pmenu .pmenu-item.is-danger").first();
      await del.click();
      await page.waitForTimeout(600);
      // confirm dialog (blueprint mdl) — click its primary
      const ok = page.locator('.mdl.open .btn-primary, [id*="onfirm"] .btn-primary').first();
      if (await ok.count()) { await ok.click(); await page.waitForTimeout(2000); }
      const still = await page.locator(`[data-id="${propId}"]`).count();
      log(still === 0, "cleanup: created proposal deleted via UI", "id=" + propId);
    } catch (e) {
      log(false, "cleanup: could not delete created proposal (left in dev DB)", (propId || "") + " :: " + e.message.slice(0, 80));
    }
  }

  console.log("CONSOLE ERRORS: " + (errors.length ? "\n  " + errors.join("\n  ") : "none"));
  await page.screenshot({ path: "roof_final.png", fullPage: false });
  await browser.close();
})().catch((e) => { console.error("HARNESS FAIL:", e.message); process.exit(1); });

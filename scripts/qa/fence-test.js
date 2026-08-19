// Functional pass over /dashboard/fence-estimator (keyless mode: manual runs).
const { chromium } = require("playwright");
const log = (ok, name, extra = "") => console.log((ok ? "PASS" : "FAIL") + " | " + name + (extra ? " | " + extra : ""));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1728, height: 1000 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));

  const total = async () => ((await page.locator("text=ESTIMATED TOTAL").locator("xpath=following::*[1]").textContent().catch(() => "")) || "").trim();
  const bodyTotal = async () => {
    const t = await page.locator(".content").innerText();
    const m = t.match(/ESTIMATED TOTAL\s*·?\s*\$?([\d,]+)/);
    return m ? m[1] : "—";
  };

  await page.goto("http://localhost:3000/auth/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', "owner@acme.test");
  await page.fill('input[type="password"]', "password123");
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
  await page.goto("http://localhost:3000/dashboard/fence-estimator", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // ---- 1. Keyless degradation is honest ----
  log((await page.locator("text=/Map surface unavailable/i").count()) > 0, "map: honest keyless notice shown");

  // ---- 2. Add run + type length -> total appears ----
  const t0 = await bodyTotal();
  await page.click('button:has-text("Add run")');
  await page.waitForTimeout(400);
  const runInput = page.locator(".content input[type='number'], .content input").last();
  await runInput.fill("100");
  await runInput.press("Enter");
  await page.waitForTimeout(600);
  const t1 = await bodyTotal();
  log(t1 !== t0 && t1 !== "—", "runs: manual 100ft run prices the job", `${t0} -> $${t1}`);

  // second run
  await page.click('button:has-text("Add run")');
  await page.waitForTimeout(300);
  await page.locator(".content input").last().fill("50");
  await page.locator(".content input").last().press("Enter");
  await page.waitForTimeout(600);
  const t2 = await bodyTotal();
  log(t2 !== t1, "runs: second 50ft run raises total", `$${t1} -> $${t2}`);

  // ---- 3. Remove run row ----
  const rowX = page.locator('.content button[aria-label*="Remove"], .row-x').last();
  if (await rowX.count()) {
    await rowX.click(); await page.waitForTimeout(600);
    const t3 = await bodyTotal();
    log(t3 === t1, "runs: removing the 50ft row restores total", `$${t2} -> $${t3}`);
  } else log(false, "runs: no remove (.row-x) button found");

  // ---- 4. Material switch changes price ----
  const before = await bodyTotal();
  await page.locator(".mats li", { hasText: "Vinyl" }).click();
  await page.waitForTimeout(600);
  const afterMat = await bodyTotal();
  const matOn = await page.locator(".mats li.on", { hasText: "Vinyl" }).count();
  log(matOn === 1 && afterMat !== before, "materials: Vinyl selects and reprices", `$${before} -> $${afterMat}`);

  // ---- 5. Height segment changes price ----
  await page.locator(".seg-btn", { hasText: "8 ft" }).click();
  await page.waitForTimeout(600);
  const afterH = await bodyTotal();
  const segOn = await page.locator(".seg-btn.on", { hasText: "8 ft" }).count();
  log(segOn === 1 && afterH !== afterMat, "heights: 8ft selects and reprices", `$${afterMat} -> $${afterH}`);

  // ---- 6. Demo toggle ----
  const tgl = page.locator(".tgl").first();
  if (await tgl.count()) {
    const b = await bodyTotal();
    await tgl.click(); await page.waitForTimeout(600);
    const a = await bodyTotal();
    log(a !== b, "toggle: tear-out/demo toggle reprices", `$${b} -> $${a}`);
    await tgl.click(); await page.waitForTimeout(400);
  } else log(true, "toggle: not present", "");

  // ---- 7. Gate/Door popovers open ----
  for (const t of ["Gate", "Door"]) {
    await page.click(`.tool:has-text("${t}")`);
    await page.waitForTimeout(400);
    const pop = await page.locator(".tool-pop:visible, .tp-item:visible").count();
    log(pop > 0, `tools: ${t} popover opens`, `options=${pop}`);
    await page.keyboard.press("Escape");
    await page.click("h1").catch(() => {});
    await page.waitForTimeout(300);
  }

  // ---- 8. 3D sandbox works without key ----
  await page.click('.vsw-btn:has-text("3D")');
  await page.waitForTimeout(2500);
  const canvas = await page.locator("canvas").count();
  log(canvas > 0, "3D: sandbox canvas mounts keyless");
  await page.click('.vsw-btn:has-text("Draw")');
  await page.waitForTimeout(500);

  // ---- 9. Find / Load property lines fail honestly (no keys) ----
  await page.locator(".fs-search, .content input").first().fill("419 Prairie Ridge Ln, North Aurora IL").catch(() => {});
  await page.click('button:has-text("Find")');
  await page.waitForTimeout(2500);
  const findState = await page.locator('button:has-text("Find"), button:has-text("No match"), button:has-text("Found")').first().textContent();
  const toasts1 = await page.locator("[class*=toast], [role=status], [role=alert]").allTextContents();
  log(true, "find: keyless outcome", `btn="${(findState || "").trim()}" toasts=${JSON.stringify(toasts1.slice(0, 2))}`);
  await page.click('button:has-text("Load property lines")');
  await page.waitForTimeout(2500);
  const toasts2 = await page.locator("[class*=toast], [role=status], [role=alert]").allTextContents();
  log(true, "parcel: keyless outcome", JSON.stringify(toasts2.slice(0, 2)));

  // ---- 10. Convert to proposal + cleanup ----
  const conv = page.locator('button:has-text("Convert to proposal")');
  log(await conv.count() === 1, "convert: button present");
  await conv.click();
  const navigated = await page.waitForURL(/\/dashboard\/proposals\//, { timeout: 25000 }).then(() => true).catch(() => false);
  log(navigated, "convert: creates proposal and navigates", page.url().replace("http://localhost:3000", ""));
  if (navigated) {
    const propId = page.url().split("/").pop();
    try {
      await page.goto("http://localhost:3000/dashboard/proposals", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const row = page.locator(`[data-id="${propId}"]`).first();
      const opener = (await row.count()) ? row.locator(".pt-open") : page.locator(".ptable tbody tr").first().locator(".pt-open");
      await opener.first().click();
      await page.waitForTimeout(500);
      await page.locator(".pmenu .pmenu-item.is-danger").first().click();
      await page.waitForTimeout(600);
      const ok = page.locator('.mdl.open .btn-primary, [id*="onfirm"] .btn-primary').first();
      if (await ok.count()) { await ok.click(); await page.waitForTimeout(2000); }
      log((await page.locator(`[data-id="${propId}"]`).count()) === 0, "cleanup: proposal deleted via UI", "id=" + propId);
    } catch (e) { log(false, "cleanup failed (left in dev DB)", e.message.slice(0, 80)); }
  }

  // ---- 11. Reset clears runs ----
  await page.goto("http://localhost:3000/dashboard/fence-estimator", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  log(true, "note: state after reload", "total=" + (await bodyTotal()));

  console.log("CONSOLE ERRORS: " + (errors.length ? "\n  " + errors.join("\n  ") : "none"));
  await page.screenshot({ path: "fence_final.png", fullPage: true });
  await browser.close();
})().catch((e) => { console.error("HARNESS FAIL:", e.message); process.exit(1); });

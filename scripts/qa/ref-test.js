// Functional pass over /dashboard/referrals (3 conversions pre-seeded by runner).
const { chromium } = require("playwright");
const log = (ok, name, extra = "") => console.log((ok ? "PASS" : "FAIL") + " | " + name + (extra ? " | " + extra : ""));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));
  const clip = async () => { try { return await page.evaluate(() => navigator.clipboard.readText()); } catch { return ""; } };

  await page.goto("http://localhost:3000/auth/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', "owner@acme.test");
  await page.fill('input[type="password"]', "password123");
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
  await page.goto("http://localhost:3000/dashboard/referrals", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  // ---- 1. Hero: real code + copy paths ----
  const code = ((await page.locator(".code-val, #codeVal").first().textContent()) || "").trim();
  log(code === "JAM-9NWYB", "hero: real referral code renders", code);
  await page.locator(".code-val, #codeVal").first().click();
  await page.waitForTimeout(400);
  log((await clip()) === "JAM-9NWYB", "hero: clicking the code copies it", await clip());
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await page.locator(".code-copy").click();
  await page.waitForTimeout(500);
  log((await clip()) === "JAM-9NWYB", "hero: Copy button copies the code");
  const doneState = await page.locator(".code-copy.done").count();
  log(doneState === 1, "hero: Copy button shows done state");

  // ---- 2. Link chips: signup + homeowner URLs ----
  const chipCopies = page.locator(".chip-copy");
  const nChips = await chipCopies.count();
  log(nChips === 2, "links: two copyable link chips", String(nChips));
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await chipCopies.nth(0).click();
  await page.waitForTimeout(400);
  const url1 = await clip();
  log(/JAM-9NWYB/.test(url1) && /^http/.test(url1), "links: chip 1 copies a URL with the code", url1.slice(0, 60));
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await chipCopies.nth(1).click();
  await page.waitForTimeout(400);
  const url2 = await clip();
  log(/JAM-9NWYB/.test(url2) && url2 !== url1, "links: chip 2 copies a different URL", url2.slice(0, 60));

  // ---- 3. Share button (headless: clipboard fallback) ----
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await page.click("#shareBtn");
  await page.waitForTimeout(600);
  const shared = await clip();
  log(/JAM-9NWYB/.test(shared), "share: falls back to copying the signup link", shared.slice(0, 60));

  // ---- 4. KPIs reflect seeded conversions ----
  const kpiText = (await page.locator(".content").innerText()).replace(/\s+/g, " ");
  log(/Code uses[^0-9]*3/i.test(kpiText), "kpi: Code uses = 3");
  log(/Converted[^0-9]*1/i.test(kpiText), "kpi: Converted = 1");
  log(/Pending[^0-9]*1/i.test(kpiText), "kpi: Pending = 1");

  // ---- 5. Conversions table + rf-chip filters ----
  const rows = () => page.locator(".ptable tbody tr:visible, [class*=conv-row]:visible").count();
  log(await rows() === 3, "table: 3 conversion rows render", String(await rows()));
  const chips = page.locator(".rf-chip");
  const chipTexts = (await chips.allTextContents()).map(t => t.trim());
  log(chipTexts.length >= 3, "chips: filter chips render", chipTexts.join("/"));
  await chips.filter({ hasText: /Pending/i }).first().click();
  await page.waitForTimeout(400);
  log(await rows() === 1, "chips: Pending filters to 1", String(await rows()));
  await chips.filter({ hasText: /Converted/i }).first().click();
  await page.waitForTimeout(400);
  log(await rows() === 1, "chips: Converted filters to 1", String(await rows()));
  await chips.filter({ hasText: /All/i }).first().click();
  await page.waitForTimeout(400);
  log(await rows() === 3, "chips: All restores 3", String(await rows()));

  console.log("CONSOLE ERRORS: " + (errors.length ? "\n  " + errors.join("\n  ") : "none"));
  await page.screenshot({ path: "referrals_final.png", fullPage: true });
  await browser.close();
})().catch((e) => { console.error("HARNESS FAIL:", e.message); process.exit(1); });

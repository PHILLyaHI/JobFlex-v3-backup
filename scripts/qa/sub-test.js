// Functional pass over /dashboard/subscription.
const { chromium } = require("playwright");
const log = (ok, name, extra = "") => console.log((ok ? "PASS" : "FAIL") + " | " + name + (extra ? " | " + extra : ""));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));

  await page.goto("http://localhost:3000/auth/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', "owner@acme.test");
  await page.fill('input[type="password"]', "password123");
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);

  // Sidebar link reaches the page.
  await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle" });
  const sbLink = page.locator('.sb a[href="/dashboard/subscription"], .sb-link[href="/dashboard/subscription"]');
  log(await sbLink.count() > 0, "sidebar: Subscription link present");
  if (await sbLink.count()) { await sbLink.first().click(); await page.waitForURL(/subscription/, { timeout: 15000 }); }
  else await page.goto("http://localhost:3000/dashboard/subscription");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1600);

  // ---- render checks ----
  log((await page.locator("text=Professional").count()) > 0, "hero: current plan renders");
  const cells = await page.locator("#specGrid > div").count();
  log(cells === 4, "plans: 4 tier cells", String(cells));
  const bars = await page.locator("#usList .us-bar span, #usList [class*=us-fill]").evaluateAll(
    (els) => els.map((e) => e.style.width || getComputedStyle(e).width));
  log(bars.length > 0 && bars.every((w) => w && w !== "0px"), "usage: bars animated to widths", bars.join(","));
  const invRows = await page.locator("#invList > div").count();
  log(invRows > 0, "billing: invoice rows render", String(invRows));
  const kpiVals = await page.locator("[class*=kpi-val]").allTextContents();
  log(kpiVals.some((t) => t.trim() !== "0" && t.trim() !== ""), "refer: KPI count-ups landed", kpiVals.join("/"));
  const mxRows = await page.locator("#mxTable tbody tr").count();
  log(mxRows > 0, "compare: feature matrix rows", String(mxRows));

  // ---- Upgrade plan: custom smooth scroll to #plans ----
  const scrollTop0 = await page.evaluate(() => document.querySelector(".main").scrollTop);
  await page.click('a[href="#plans"]:has-text("Upgrade plan")');
  await page.waitForTimeout(1300);
  const scrollTop1 = await page.evaluate(() => document.querySelector(".main").scrollTop);
  const plansVisible = await page.locator("#plans").isVisible();
  log(scrollTop1 > scrollTop0 && plansVisible, "upgrade-plan: scrolls to tiers", `${scrollTop0} -> ${scrollTop1}`);

  // back to top, then Change plan link
  await page.evaluate(() => { document.querySelector(".main").scrollTop = 0; });
  await page.waitForTimeout(300);
  await page.click('#usageCard a[href="#plans"]');
  await page.waitForTimeout(1300);
  const scrollTop2 = await page.evaluate(() => document.querySelector(".main").scrollTop);
  log(scrollTop2 > 0, "change-plan: scrolls to tiers", String(scrollTop2));

  // ---- Copy button ----
  await page.click("#refCopy");
  await page.waitForTimeout(300);
  const lbl = (await page.textContent("#refCopyLbl"))?.trim();
  let clip = "";
  try { clip = await page.evaluate(() => navigator.clipboard.readText()); } catch {}
  log(lbl === "Copied", "refer: Copy flips label", `label=${lbl} clipboard=${clip}`);
  await page.waitForTimeout(1700);
  const lblBack = (await page.textContent("#refCopyLbl"))?.trim();
  log(lblBack === "Copy", "refer: label resets after 1.6s", `label=${lblBack}`);

  // ---- Tier CTA buttons: do they do anything? ----
  const ctas = page.locator("#specGrid button");
  const nCta = await ctas.count();
  for (let i = 0; i < nCta; i++) {
    const label = (await ctas.nth(i).textContent())?.trim();
    const urlBefore = page.url();
    const domBefore = await page.evaluate(() => document.body.innerHTML.length);
    await ctas.nth(i).click();
    await page.waitForTimeout(600);
    const changed = page.url() !== urlBefore || Math.abs((await page.evaluate(() => document.body.innerHTML.length)) - domBefore) > 50;
    log(true, `tier CTA "${label}" click`, changed ? "DOES something" : "INERT (no handler)");
  }

  console.log("CONSOLE ERRORS: " + (errors.length ? "\n  " + errors.join("\n  ") : "none"));
  await page.screenshot({ path: "subscription_final.png", fullPage: true });
  await browser.close();
})().catch((e) => { console.error("HARNESS FAIL:", e.message); process.exit(1); });

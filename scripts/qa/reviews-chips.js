const { chromium } = require("playwright");
const log = (ok, name, extra = "") => console.log((ok ? "PASS" : "FAIL") + " | " + name + (extra ? " | " + extra : ""));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1728, height: 1000 } });
  await p.goto("http://localhost:3000/auth/login", { waitUntil: "domcontentloaded" });
  await p.fill("input[type=email]", "owner@acme.test");
  await p.fill("input[type=password]", "password123");
  await Promise.all([p.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {}), p.click("button[type=submit]")]);
  await p.goto("http://localhost:3000/dashboard/reviews", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);

  const cardVisible = () => p.locator("text=Great crew, clean site").count();
  await p.locator(".rv-chip").nth(1).click(); // 5★
  await p.waitForTimeout(400);
  log((await cardVisible()) > 0, "chips: 5-star filter keeps the review");
  await p.locator(".rv-chip").nth(5).click(); // 1★ (empty but clickable)
  await p.waitForTimeout(400);
  const hidden = (await cardVisible()) === 0;
  const emptyMsg = await p.locator("#rvEmpty:visible, .rv-empty:visible").count();
  log(hidden, "chips: 1-star filter hides it", "emptyState=" + emptyMsg);
  await p.locator(".rv-chip").nth(0).click(); // All
  await p.waitForTimeout(400);
  log((await cardVisible()) > 0, "chips: All restores");
  await b.close();
})().catch((e) => { console.error("HARNESS FAIL:", e.message); process.exit(1); });

// Screenshot harness: logs into the local JobFlex dev server and captures
// full-page shots of the given routes. Usage: node shot.js /dashboard [/more...]
const { chromium } = require("playwright");

(async () => {
  const routes = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1728, height: 1000 } });

  // Login once (session cookie persists in the context).
  await page.goto("http://localhost:3000/auth/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', "owner@acme.test");
  await page.fill('input[type="password"]', "password123");
  await Promise.all([
    page.waitForURL(/dashboard|overview|\/$/, { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1500);

  for (const r of routes) {
    await page.goto("http://localhost:3000" + r, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200); // let reveal animations settle
    const name = r.replace(/[\/?=]+/g, "_").replace(/^_+|_+$/g, "") || "root";
    await page.screenshot({ path: name + ".png", fullPage: false });
    console.log("saved", name + ".png", "title:", await page.title());
  }
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });

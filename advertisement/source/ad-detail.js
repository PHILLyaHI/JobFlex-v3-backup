// The mobile proposal scrolled to its estimate detail (the full-page capture is blank below the fold).
const { chromium } = require("playwright-core");
const SP = "/private/tmp/claude-501/-Users-dmitriyapetenok-Documents-SmartSpace-Pro/3d5a51a0-70ce-4118-ade1-850beec562fb/scratchpad";
const publicId = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3100/portal/q/${publicId}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector(".jf-mobile-proposal-client .mpc-card", { timeout: 240000 });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}[data-trial-watermark]{display:none!important}" });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  for (const [name, y] of [["mobile-detail", 860], ["mobile-detail2", 1500], ["mobile-scope", 3400]]) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SP}/ad/assets/${name}.png` });
    const top = await page.evaluate(() => scrollY);
    console.log(name, "scrollY", top);
  }
  await b.close();
})().catch((e) => { console.error("DETAIL ERROR", e.message.split("\n")[0]); process.exit(1); });

// Stills from film2.html:  node preview2.js <ad> "<t,t,…>" [916|45|both]
const { chromium } = require("playwright-core");
const path = require("path");
const HERE = __dirname;
const ad = process.argv[2] || "1";
const times = (process.argv[3] || "1,5,10").split(",").map(Number);
const fmts = (process.argv[4] || "both") === "both" ? ["916", "45"] : [process.argv[4]];
(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  for (const f of fmts) {
    const W = 1080, H = f === "916" ? 1920 : 1350;
    const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const errs = []; page.on("pageerror", (e) => errs.push(e.message.split("\n")[0]));
    await page.goto(`file://${HERE}/film2.html?w=${W}&h=${H}&ad=${ad}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    for (const t of times) {
      await page.evaluate((tt) => window.__seek(tt), t);
      await page.screenshot({ path: path.join(HERE, "frames", `ad${ad}-${f}-${String(t).padStart(4, "0")}.png`) });
    }
    if (errs.length) console.log("PAGE ERRORS", f, errs.slice(0, 3).join(" | "));
    await page.close();
  }
  await b.close();
  console.log("stills done");
})().catch((e) => { console.error("PREVIEW ERROR", e.message.split("\n")[0]); process.exit(1); });

// Stills from the film at chosen seconds, both formats, to check the composition.
const { chromium } = require("playwright-core");
const HERE = __dirname;
const times = (process.argv[2] || "2,9,12,15,20,23,28,34,40,44,48").split(",").map(Number);
(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  for (const [W, H, fmt] of [[1080, 1920, "916"], [1920, 1080, "169"]]) {
    for (const version of ["v1", "v2"]) {
      const page = await b.newPage({ viewport: { width: W, height: H } });
      const errs = []; page.on("pageerror", (e) => errs.push(e.message.split("\n")[0]));
      await page.goto(`file://${HERE}/film.html?w=${W}&h=${H}&version=${version}`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
      for (const t of times) {
        await page.evaluate((tt) => window.__seek(tt), t);
        await page.screenshot({ path: `${HERE}/frames/pv-${version}-${fmt}-${String(t).padStart(2, "0")}.png` });
      }
      if (errs.length) console.log(fmt, version, "errors:", errs.slice(0, 3).join(" | "));
      await page.close();
      if (version === "v2") break; // v1 only differs in captions; one pass per format is enough for v2 stills
    }
  }
  await b.close();
  console.log("stills done");
})().catch((e) => { console.error("PREVIEW ERROR", e.message.split("\n")[0]); process.exit(1); });

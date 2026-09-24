const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  await p.goto("file://" + __dirname + "/mosaic-c2.html", { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.screenshot({ path: __dirname + "/mosaic-c2.png" });
  await b.close();
})();

const { chromium } = require("playwright");
const { launch, signIn } = require("./_qa");
(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1728, height: 1000 } });
  await signIn(page);
  await page.goto("http://localhost:3000/dashboard/beige", { waitUntil: "networkidle" });
  const info = await page.evaluate(() => {
    const wrap = document.querySelector(".beige-skin");
    const card = document.querySelector(".card");
    const root = document.querySelector(".jf-blueprint");
    const hasRule = [...document.styleSheets].some(s => {
      try { return [...s.cssRules].some(r => r.cssText && r.cssText.includes("beige-skin")); } catch { return false; }
    });
    return {
      wrapperInDom: !!wrap,
      wrapperContainsCard: !!(wrap && card && wrap.contains(card)),
      jfBlueprintExists: !!root,
      jfContainsWrapper: !!(root && wrap && root.contains(wrap)),
      cardBg: card ? getComputedStyle(card).backgroundColor : null,
      cardShadow: card ? getComputedStyle(card).boxShadow : null,
      beigeCssLoaded: hasRule,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });

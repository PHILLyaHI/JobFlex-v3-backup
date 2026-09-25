// Measures where things sit on the mobile and desktop portal pages (CSS px, page coords).
const { chromium } = require("playwright-core");
const fs = require("fs");
const SP = "/private/tmp/claude-501/-Users-dmitriyapetenok-Documents-SmartSpace-Pro/3d5a51a0-70ce-4118-ade1-850beec562fb/scratchpad";
const BASE = "http://localhost:3100";
const publicId = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const out = {};
  for (const [name, vp, mobile, root] of [["mobile", { width: 390, height: 844 }, true, ".jf-mobile-proposal-client"], ["desktop", { width: 1280, height: 900 }, false, ".jf-proposal-portal"]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/portal/q/${publicId}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForSelector(root, { timeout: 240000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1000);
    out[name] = await page.evaluate(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left + scrollX), y: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height), text: (el.innerText || "").slice(0, 60).replace(/\n/g, " | ") }; };
      const q = (s) => r(document.querySelector(s));
      const byText = (re) => { const els = [...document.querySelectorAll("h1,h2,h3,h4,section,div,p,span,button,summary,strong")]; return r(els.find((e) => re.test((e.innerText || "").trim()) && e.getBoundingClientRect().height < 900)); };
      return {
        pageH: document.documentElement.scrollHeight,
        listen: q(".listen-card, [class*='listen']"),
        figure: q("figure, .pv-figure, .mpc-figure, [class*='figure']"),
        total: byText(/^TOTAL/i),
        scope: byText(/^(SCOPE|WHAT'S INCLUDED|THE WORK|WHAT WE'LL DO)/i),
        lines: byText(/^(LINE ITEMS|ITEMS|BREAKDOWN|INCLUDED)/i),
        schedule: byText(/^PAYMENT SCHEDULE/i),
        pay: q(".pv-pay, [class*='pay-center'], [class*='payment']"),
        accepted: byText(/^Accepted/i),
        headings: [...document.querySelectorAll("h1,h2,h3,.pv-h,.mpc-h,[class*='eyebrow'],[class*='kicker']")].slice(0, 30).map(r),
      };
    });
    await ctx.close();
  }
  fs.writeFileSync(SP + "/ad/assets/portal-measure.json", JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out).slice(0, 3000));
  await b.close();
})().catch((e) => { console.error("MEASURE ERROR", e.message.split("\n")[0]); process.exit(1); });

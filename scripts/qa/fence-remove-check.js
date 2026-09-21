const { chromium } = require("playwright");
const { launch, signIn } = require("./_qa");
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1728, height: 1000 } });
  await signIn(p);
  await p.goto("http://localhost:3000/dashboard/fence-estimator", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const tot = async () => {
    const m = (await p.locator(".content").innerText()).match(/ESTIMATED TOTAL\s*·?\s*\$?([\d,]+|—)/);
    return m ? m[1] : "?";
  };
  await p.click('button:has-text("Add run")'); await p.waitForTimeout(300);
  await p.locator(".content input:visible").last().fill("100");
  await p.locator(".content input:visible").last().press("Enter"); await p.waitForTimeout(400);
  await p.click('button:has-text("Add run")'); await p.waitForTimeout(300);
  await p.locator(".content input:visible").last().fill("50");
  await p.locator(".content input:visible").last().press("Enter"); await p.waitForTimeout(500);
  const t150 = await tot();
  await p.locator('button.row-x[aria-label="Remove run"]').last().click();
  await p.waitForTimeout(600);
  const t100 = await tot();
  console.log((t150 === "7,200" && t100 === "4,800" ? "PASS" : "FAIL") + " | remove run row restores price | $" + t150 + " -> $" + t100);
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });

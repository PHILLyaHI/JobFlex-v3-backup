// Probe the five ad surfaces logged in, screenshot each at its ad viewport.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "c:/joblfex-v3/marketing/ads/v2-real-ui/probe";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function login(context) {
  const page = await context.newPage();
  await page.goto(BASE + "/auth/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"], input[name="email"]', "owner@acme.test");
  await page.fill('input[type="password"], input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|mobile/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log("after login url:", page.url());
  return page;
}

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const mp = await login(mobile);

const mobileTargets = [
  ["advanced-ai", "/dashboard/advanced-ai"],
  ["proposals", "/dashboard/proposals"],
  ["calendar", "/dashboard/calendar"],
  ["dashboard", "/dashboard"],
];
for (const [name, path] of mobileTargets) {
  try {
    await mp.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
  } catch { /* keep whatever rendered */ }
  await mp.waitForTimeout(2500);
  await mp.screenshot({ path: `${OUT}/m-${name}.png` });
  console.log("shot m-" + name, mp.url());
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const dp = await login(desktop);
for (const [name, path] of [
  ["fence", "/dashboard/fence-estimator"],
  ["studio", "/studio"],
]) {
  try {
    await dp.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
  } catch {}
  await dp.waitForTimeout(2500);
  await dp.screenshot({ path: `${OUT}/d-${name}.png` });
  console.log("shot d-" + name, dp.url());
}

await browser.close();
console.log("done");

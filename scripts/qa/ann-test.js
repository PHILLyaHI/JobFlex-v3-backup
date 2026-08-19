// Functional pass over /dashboard/announcements.
const { chromium } = require("playwright");
const log = (ok, name, extra = "") => console.log((ok ? "PASS" : "FAIL") + " | " + name + (extra ? " | " + extra : ""));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1728, height: 1000 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));

  await page.goto("http://localhost:3000/auth/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', "owner@acme.test");
  await page.fill('input[type="password"]', "password123");
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
  await page.goto("http://localhost:3000/dashboard/announcements", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  // ---- 1. Initial state: no active, 1 archived ----
  const activeCount = (await page.locator("#activeCount").textContent() || "").trim();
  log(activeCount === "0", "state: active count is 0", activeCount);
  log(await page.locator("#activeEmpty:visible").count() === 1, "state: 'No active announcements' shows");
  log(await page.locator("#archiveCard:visible").count() === 1, "state: archive card visible");
  const archRows = await page.locator("#archiveList li").count();
  log(archRows === 1, "state: 1 archived row (expired seed)", String(archRows));

  // ---- 2. Dialog: open, validation, preview ----
  await page.click("#newAnnBtn");
  await page.waitForTimeout(600);
  log(await page.locator("#annMdl.open").count() === 1, "dialog: opens");
  await page.click("#publishBtn");
  await page.waitForTimeout(600);
  log(await page.locator("#annErr:visible").count() === 1, "dialog: empty publish shows validation error",
    ((await page.locator("#annErr").textContent()) || "").trim().slice(0, 50));
  await page.fill("#annTitle", "QA Test Announcement");
  await page.fill("#annBody", "Functional pass — will be dismissed and deleted.");
  await page.waitForTimeout(500);
  const preview = ((await page.locator("#annPreview").textContent()) || "").trim();
  log(preview.includes("QA Test Announcement"), "dialog: live preview mirrors input");

  // priority select — custom .spk popover over the hidden native select
  await page.locator("#annMdl .spk-btn").click();
  await page.waitForTimeout(400);
  log(await page.locator(".spk-pop.is-open").count() === 1, "dialog: priority popover opens");
  await page.locator(".spk-pop.is-open .spk-item", { hasText: /High/i }).click();
  await page.waitForTimeout(500);
  const prevHigh = ((await page.locator("#annPreview").innerHTML()) || "") +
    ((await page.locator("#annMdl .spk-btn .spk-lbl").textContent()) || "");
  log(/p2|danger|High/i.test(prevHigh), "dialog: priority=High reflects in preview/label");

  // expires field accepts a date
  await page.fill("#annExpires", "2026-12-31");
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);

  // ---- 3. Publish (real create) ----
  await page.click("#publishBtn");
  await page.waitForTimeout(2500);
  log(await page.locator("#annMdl.open").count() === 0, "publish: dialog closes");
  const newCount = (await page.locator("#activeCount").textContent() || "").trim();
  log(newCount === "1", "publish: active count becomes 1", newCount);
  const bnr = page.locator("#activeList .bnr", { hasText: "QA Test Announcement" });
  log(await bnr.count() === 1, "publish: banner renders in active list");

  // ---- 4. Dismiss -> archive ----
  await bnr.locator(".bnr-x").click();
  await page.waitForTimeout(2500);
  log((await page.locator("#activeCount").textContent() || "").trim() === "0", "dismiss: active count back to 0");
  const archAfter = await page.locator("#archiveList li").count();
  log(archAfter === 2, "dismiss: announcement moved to archive", String(archAfter));

  // ---- 5. Dialog close paths: Cancel and X ----
  await page.click("#newAnnBtn");
  await page.waitForTimeout(500);
  await page.locator('#annMdl [data-mdl-close].btn, #annMdl .btn-ghost').first().click();
  await page.waitForTimeout(500);
  log(await page.locator("#annMdl.open").count() === 0, "dialog: Cancel closes");
  await page.click("#newAnnBtn");
  await page.waitForTimeout(500);
  await page.locator("#annMdl .mdl-x").click();
  await page.waitForTimeout(500);
  log(await page.locator("#annMdl.open").count() === 0, "dialog: X closes");

  console.log("CONSOLE ERRORS: " + (errors.length ? "\n  " + errors.join("\n  ") : "none"));
  await page.screenshot({ path: "ann_final.png", fullPage: true });
  await browser.close();
})().catch((e) => { console.error("HARNESS FAIL:", e.message); process.exit(1); });

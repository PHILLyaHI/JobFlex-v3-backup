// Functional pass over /dashboard/settings — all five panes.
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
  await page.goto("http://localhost:3000/dashboard/settings", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  // ---- 1. Rail ----
  const rail = await page.locator(".rail-a").count();
  log(rail === 5, "rail: 5 sections", String(rail));
  log(((await page.locator(".rail-a.on").textContent()) || "").includes("Account"), "rail: Account active by default");
  const notifRow = ((await page.locator(".rail-a", { hasText: "Notifications" }).innerText()) || "").toUpperCase();
  log(notifRow.includes("NEW"), "rail: NEW badge on Notifications");

  // ---- 2. Account pane ----
  log((await page.locator("text=Profile").count()) > 0, "account: Profile card renders");
  const nameInput = page.locator(".fin").first();
  await nameInput.fill("Ivan Petrov QA");
  log((await nameInput.inputValue()) === "Ivan Petrov QA", "account: name field editable");
  const emailDisabled = await page.locator(".fin[disabled]").count();
  log(emailDisabled >= 2, "account: Email/Role locked (disabled)", String(emailDisabled));
  const saveBtn = page.locator("button", { hasText: /^Save/ }).first();
  await saveBtn.click();
  await page.waitForTimeout(400);
  const savedLbl = ((await saveBtn.textContent()) || "").trim();
  log(/Saved/i.test(savedLbl), "account: Save flips to Saved (local feedback)", savedLbl);
  const dangerBtn = page.locator(".btn-danger", { hasText: /Delete/i }).first();
  if (await dangerBtn.count()) {
    const before = page.url();
    await dangerBtn.click(); await page.waitForTimeout(600);
    log(page.url() === before && (await page.locator(".modal:visible, .mdl.open").count()) === 0,
      "account: Danger Delete is INERT (no handler — fixture)", "");
  }

  // ---- 3. Payments pane ----
  await page.locator(".rail-a", { hasText: "Payments" }).click();
  await page.waitForTimeout(700);
  log((await page.locator("text=/Payout|payout/").count()) > 0, "payments: pane renders");
  const addPayout = page.locator("button", { hasText: /Add payout account/i });
  log(await addPayout.count() === 1, "payments: Add payout button present");
  await addPayout.click();
  await page.waitForTimeout(600);
  log(await page.locator(".modal:visible, [class*=modal]:visible").count() > 0, "payments: modal opens");
  await page.locator(".modal-x, [class*=modal] button[aria-label*=lose], .modal button", { hasText: /Cancel|×/ }).first().click().catch(async () => { await page.keyboard.press("Escape"); });
  await page.waitForTimeout(500);
  log(await page.locator(".modal:visible").count() === 0, "payments: modal closes");
  const tg = page.locator(".tg").first();
  if (await tg.count()) {
    const b = await tg.getAttribute("aria-checked");
    await tg.click(); await page.waitForTimeout(300);
    const a = await tg.getAttribute("aria-checked");
    log(b !== a, "payments: toggle flips", `${b} -> ${a}`);
  }
  const sel = page.locator(".sel-btn").first();
  if (await sel.count()) {
    await sel.click(); await page.waitForTimeout(300);
    const opts = await page.locator(".sel-menu:visible .sel-opt").count();
    log(opts > 0, "payments: select opens with options", String(opts));
    await page.locator(".sel-menu:visible .sel-opt").last().click();
    await page.waitForTimeout(300);
    log(await page.locator(".sel-menu:visible").count() === 0, "payments: option picks and closes");
  }

  // ---- 4. Billing pane ----
  await page.locator(".rail-a", { hasText: "Billing" }).click();
  await page.waitForTimeout(700);
  log((await page.locator("text=/invoice|Invoice|plan|Plan/").count()) > 0, "billing: pane renders");
  const dl = page.locator('button:has(use[href="#i-download"]), .icon-sm').first();
  if (await dl.count()) { await dl.click(); await page.waitForTimeout(400); log(true, "billing: download icon clickable (fixture)", ""); }

  // ---- 5. Integrations pane ----
  await page.locator(".rail-a", { hasText: "Integrations" }).click();
  await page.waitForTimeout(700);
  log((await page.locator("text=/Google|Connect|connected/i").count()) > 0, "integrations: pane renders");
  const intBtns = await page.locator(".set button:visible", { hasText: /Connect|Disconnect|Manage/i }).count();
  log(intBtns > 0, "integrations: connect buttons present", String(intBtns));

  // ---- 6. Notifications pane ----
  await page.locator(".rail-a", { hasText: "Notifications" }).click();
  await page.waitForTimeout(700);
  const cbs = await page.locator(".cb").count();
  log(cbs > 0, "notifications: checkbox grid renders", String(cbs));
  const cb = page.locator(".cb").first();
  const cbBefore = await cb.getAttribute("aria-checked");
  await cb.click(); await page.waitForTimeout(300);
  const cbAfter = await cb.getAttribute("aria-checked");
  log(cbBefore !== cbAfter, "notifications: checkbox toggles", `${cbBefore} -> ${cbAfter}`);
  const ntg = page.locator(".tg").first();
  if (await ntg.count()) {
    const b2 = await ntg.getAttribute("aria-checked");
    await ntg.click(); await page.waitForTimeout(300);
    log(b2 !== (await ntg.getAttribute("aria-checked")), "notifications: master toggle flips");
  }
  const nSave = page.locator("button", { hasText: /^Save/ }).first();
  if (await nSave.count()) { await nSave.click(); await page.waitForTimeout(400);
    log(/Saved/i.test(((await nSave.textContent()) || "")), "notifications: Save flips to Saved"); }

  // ---- 7. Persistence reality check ----
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const nameAfter = await page.locator(".fin").first().inputValue();
  log(true, "reality: after reload name field =", JSON.stringify(nameAfter));

  console.log("CONSOLE ERRORS: " + (errors.length ? "\n  " + errors.join("\n  ") : "none"));
  await page.screenshot({ path: "settings_final.png", fullPage: true });
  await browser.close();
})().catch((e) => { console.error("HARNESS FAIL:", e.message); process.exit(1); });

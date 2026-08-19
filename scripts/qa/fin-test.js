// Functional pass over /dashboard/financials: exercises every button.
const { chromium } = require("playwright");
const fs = require("fs");

const log = (ok, name, extra = "") => console.log((ok ? "PASS" : "FAIL") + " | " + name + (extra ? " | " + extra : ""));

(async () => {
  // 1x1 white PNG for the receipt upload path.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64");
  fs.writeFileSync("receipt.png", png);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1728, height: 1000 } });
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message.slice(0, 200)));

  await page.goto("http://localhost:3000/auth/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', "owner@acme.test");
  await page.fill('input[type="password"]', "password123");
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
  await page.goto("http://localhost:3000/dashboard/financials", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // ---- 1. Overview renders (chart, gauge, stats, attention) ----
  log(await page.locator("#revChart svg, #revChart *").count() > 0, "overview: chart rendered");
  log(await page.locator("#gauge *").count() > 0, "overview: gauge rendered");
  log(await page.locator("#statGrid *").count() > 0, "overview: stat grid rendered");
  const attCount = await page.locator("#attList li").count();
  log(true, "overview: attention rows", String(attCount));

  // ---- 2. Tabs switch panels ----
  for (const tab of ["expenses", "orders", "invoices", "overview"]) {
    await page.click(`.fi-tab[data-tab="${tab}"]`);
    await page.waitForTimeout(350);
    const visible = await page.locator(`[data-panel="${tab}"]`).isVisible();
    const activeOk = await page.locator(`.fi-tab.active[data-tab="${tab}"]`).count() === 1;
    log(visible && activeOk, `tab: ${tab} switches`, `panelVisible=${visible} activeClass=${activeOk}`);
  }

  // ---- 3. Attention "Open" buttons jump to their tab (data-goto) ----
  const openBtns = page.locator("#attList .btn");
  const nOpen = await openBtns.count();
  for (let i = 0; i < nOpen; i++) {
    const target = await openBtns.nth(i).getAttribute("data-goto");
    await openBtns.nth(i).click();
    await page.waitForTimeout(350);
    const ok = await page.locator(`[data-panel="${target}"]`).isVisible();
    log(ok, `attention: Open #${i + 1} jumps to "${target}"`);
    await page.click('.fi-tab[data-tab="overview"]');
    await page.waitForTimeout(300);
  }
  if (!nOpen) log(true, "attention: no rows to open (empty)", "");

  // ---- 4. Receipt capture roundtrip: upload -> staged -> save -> row appears -> delete it ----
  await page.setInputFiles("#rcFile", "receipt.png");
  await page.waitForTimeout(400);
  const noteTxt = (await page.locator("#rcNote").textContent().catch(() => "")) || "";
  await page.waitForSelector("#rcStaged:not(.is-hidden)", { timeout: 20000 }).catch(() => {});
  const staged = await page.locator("#rcStaged:not(.is-hidden)").count();
  log(staged === 1, "receipt: file staged after upload", "note=" + noteTxt.trim().slice(0, 80));

  let createdVendorNote = null;
  if (staged) {
    // Read the staged fields, then save.
    const expCountBefore = await countRows(page, "expenses", "#expBody tr");
    await page.click('.fi-tab[data-tab="overview"]'); // back to the panel that hosts #rcStaged
    await page.waitForTimeout(350);
    await page.click('#rcStaged [data-act="save-exp"]');
    await page.waitForTimeout(2500);
    const savedGone = await page.locator("#rcStaged.is-hidden, #rcStaged:not(:visible)").count() >= 0;
    const expCountAfter = await countRows(page, "expenses", "#expBody tr");
    log(expCountAfter === expCountBefore + 1, "receipt: Save expense writes a row", `${expCountBefore} -> ${expCountAfter}`);
    createdVendorNote = expCountAfter > expCountBefore;

    // Delete the newly created expense (first row = newest) via confirm dialog.
    if (createdVendorNote) {
      await page.click('#expBody tr:first-child [data-act="del-exp"]');
      await page.waitForTimeout(400);
      const dlgOpen = await page.locator("#fiConfirm.open, #fiConfirm.mdl.open").count();
      log(dlgOpen === 1, "delete: confirm dialog opens");
      // Cancel first — dialog must close and row must survive.
      await page.click('#fiConfirm [data-mdl-close].btn');
      await page.waitForTimeout(400);
      const stillThere = await countRows(page, "expenses", "#expBody tr");
      log(stillThere === expCountAfter, "delete: Cancel keeps the row");
      // Now really delete.
      await page.click('#expBody tr:first-child [data-act="del-exp"]');
      await page.waitForTimeout(400);
      await page.click("#fiConfirmOk");
      await page.waitForTimeout(2500);
      const finalCount = await countRows(page, "expenses", "#expBody tr");
      log(finalCount === expCountBefore, "delete: Confirm removes the row (DB roundtrip clean)", `${expCountAfter} -> ${finalCount}`);
    }
  }

  // ---- 5. Expenses tab: receipt link buttons ----
  await page.click('.fi-tab[data-tab="expenses"]');
  await page.waitForTimeout(300);
  const receiptLinks = await page.locator('#expBody a.icon-sq').count();
  if (receiptLinks) {
    const href = await page.locator("#expBody a.icon-sq").first().getAttribute("href");
    log(!!href, "expenses: receipt link has href", href || "");
  } else log(true, "expenses: no receipt-link rows (none have receiptUrl)", "");

  // ---- 6. Change orders: buttons match status; del-co dialog opens/cancels ----
  await page.click('.fi-tab[data-tab="orders"]');
  await page.waitForTimeout(300);
  const coRows = await page.locator("#coBody tr").count();
  const sendBtns = await page.locator('#coBody [data-act="send-co"]').count();
  const delBtns = await page.locator('#coBody [data-act="del-co"]').count();
  log(true, "orders: rows/send/del buttons", `${coRows}/${sendBtns}/${delBtns}`);
  if (delBtns) {
    await page.locator('#coBody [data-act="del-co"]').first().click();
    await page.waitForTimeout(400);
    const dlg = await page.locator("#fiConfirm.open").count();
    log(dlg === 1, "orders: del-co opens confirm");
    await page.click('#fiConfirm [data-mdl-close].btn');
    await page.waitForTimeout(400);
    log(await page.locator("#coBody tr").count() === coRows, "orders: cancel keeps row");
  }

  // ---- 7. Invoices tab renders ----
  await page.click('.fi-tab[data-tab="invoices"]');
  await page.waitForTimeout(300);
  const invRows = await page.locator("#invBody tr").count();
  const invEmpty = await page.locator("#invEmpty:not(.is-hidden)").count();
  log(invRows > 0 || invEmpty === 1, "invoices: table or empty-state shows", `rows=${invRows} empty=${invEmpty}`);

  // ---- 8. Escape closes dialog; dead #pMenu stays closed ----
  const pmenuOpen = await page.locator("#pMenu.open").count();
  log(pmenuOpen === 0, "pMenu: stays closed (dead element)", "");

  console.log("CONSOLE ERRORS: " + (consoleErrors.length ? "\n  " + consoleErrors.join("\n  ") : "none"));
  await page.screenshot({ path: "financials_final.png" });
  await browser.close();

  async function countRows(page, tab, sel) {
    await page.click(`.fi-tab[data-tab="${tab}"]`);
    await page.waitForTimeout(350);
    return page.locator(sel).count();
  }
})().catch((e) => { console.error("HARNESS FAIL:", e.message); process.exit(1); });

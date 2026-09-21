// Shared by every Playwright script here: the browser, the ONE sign-in, and the
// organisation the run works in.
//
//  · launch()  — Playwright's own Chromium when its build is installed, the
//                system Chrome otherwise (an npx-cached Playwright is often a
//                revision ahead of the browsers on disk).
//  · signIn()  — qa@acme.test, once: the session cookies are kept in the temp
//                folder and reused by the next script. The sign-in brake allows
//                8 attempts per address per 15 minutes; a suite of fifteen
//                scripts that each log in locks itself out halfway.
//  · qaOrg()   — the QA Co organisation (slug qa-co). Automated runs work ONLY
//                there (CLAUDE.md, Test accounts): limits are per organisation,
//                and records a script needs are made there and removed after.
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const EMAIL = "qa@acme.test";
const PASSWORD = "qa-pass-2026";
const QA_ORG_SLUG = "qa-co";
const SESSION_FILE = path.join(os.tmpdir(), "jobflex-qa-session.json");

async function launch(opts = {}) {
  const { chromium } = require("playwright"); // here, not at the top: ./_world uses this file without a browser
  try {
    return await chromium.launch(opts);
  } catch (err) {
    if (!/Executable doesn't exist/.test(String(err))) throw err;
    return chromium.launch({ ...opts, channel: "chrome" });
  }
}

async function signIn(page) {
  const ctx = page.context();
  try {
    if (fs.existsSync(SESSION_FILE)) await ctx.addCookies(JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")));
  } catch { /* a stale file is not a reason to fail */ }
  await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
  if (!/\/auth\/login/.test(page.url())) return;
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  // By PATH: the login URL itself carries "?next=/dashboard", which a /dashboard/ regex matches at once.
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/auth/login"), { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  if (/\/auth\/login/.test(page.url())) throw new Error("sign-in refused for " + EMAIL + " (the brake? 8 attempts per 15 minutes)");
  fs.writeFileSync(SESSION_FILE, JSON.stringify(await ctx.cookies()));
}

/** The QA Co organisation row, through the project's Prisma client. */
async function qaOrg(prisma) {
  const org = await prisma.organization.findUnique({ where: { slug: QA_ORG_SLUG } });
  if (!org) throw new Error('organisation "QA Co" (slug qa-co) is missing — run the seed');
  return org;
}

/** Run a script against the QA Co fixtures (./_world): made first, removed last — pass or fail. */
async function withWorld(run, opts = {}) {
  const world = require("./_world");
  const made = await world.up(undefined, opts);
  try {
    await run(made);
  } finally {
    await world.down();
  }
}

/** A script written against a page that has since been rebuilt or moved. It says so and steps
 *  aside (exit 0, one STALE line) instead of failing for reasons that are not regressions — or,
 *  worse, poking at a page that became real. `--force` runs it anyway. */
function stale(reason) {
  if (process.argv.includes("--force")) return;
  console.log("STALE | " + reason);
  process.exit(0);
}

module.exports = { launch, signIn, qaOrg, withWorld, stale, BASE, EMAIL, QA_ORG_SLUG };

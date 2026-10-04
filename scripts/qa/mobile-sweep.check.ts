// THE PHONE, CHECKED (2026-10-04). The core of the mobile sweep on every run-all --checks:
// WebKit with an iPhone's user agent, DPR 3, 390×844 and 390×700, against a PRODUCTION build
// (`next start`, its own dist dir — .cache/next-sweep — so another session's `next build`
// cannot swap the files under it). Fails when, on any page below:
//   · the page scrolls sideways;
//   · a bottom bar, a sheet's foot or its buttons are cut off by the end of the screen;
//   · at full scroll the content ends under a bottom bar or the screen;
//   · a sheet's body does not scroll to its last field;
//   · the app's top bar is not 12px from both edges, or a badge hangs out of its button;
//   · a phone-width root carries a zoom;
//   · dev and prod draw the same page differently (stylesheet order) — when a dev server is up
//     (QA_DEV_URL, else localhost:3001 / :3000); without one that half is reported, not failed.
// Signs in only as qa@acme.test (QA Co); its records come from ./_world and ./_crewWorld and
// are removed after. Rebuilds first when src/ is newer than the build (a few minutes).
//   npx --no-install tsx --tsconfig tsconfig.json scripts/qa/mobile-sweep.check.ts
// The full sweep (every route, every identity, every sheet) is .cache/mobile-sweep/run.sh.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { db, makeCrewWorld } from "./_crewWorld";
import { localDayKey } from "../../src/lib/jobProgressShared";

const ROOT = path.resolve(__dirname, "..", "..");
const DIST = ".cache/next-sweep";
const PORT = Number(process.env.QA_SWEEP_PORT || 3311);
const BASE = `http://localhost:${PORT}`;
process.env.QA_BASE_URL = BASE; // ./_qa reads it once, on load
const req = createRequire(__filename);
const qa = req("./_qa.js");
const { PAGE, MARK, OVERLAY, PRINT, judge, judgeOverlay, diffPrint, settle } = req("./_mobile-probe.js");
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (name: string, ok: boolean, extra = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };
const note = (name: string, extra = "") => console.log(`note ${name}${extra ? " — " + extra : ""}`);

/** Playwright: here, in the root, on NODE_PATH, or in an npx cache — and made resolvable by
 *  name for ./_qa, which requires it itself. */
function playwright() {
  let dir: string | null = null;
  for (const from of [__dirname, ROOT]) { try { dir = path.dirname(req.resolve("playwright/package.json", { paths: [from] })); break; } catch { /* next */ } }
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "npm-cache", "_npx");
  if (!dir && fs.existsSync(cache)) for (const d of fs.readdirSync(cache)) { const p = path.join(cache, d, "node_modules", "playwright"); if (fs.existsSync(path.join(p, "package.json"))) { dir = p; break; } }
  if (!dir) throw new Error("playwright is not installed — `npm install` in scripts/qa (README)");
  process.env.NODE_PATH = [path.dirname(dir), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  req("module").Module._initPaths();
  return req(dir);
}

/** The newest source file, to know whether the build is current. */
function newest(dir: string): number {
  let t = 0;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    t = Math.max(t, f.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return t;
}
/** The environment for next build / next start. Prisma, imported above, has loaded .env into
 *  this process — and .env's NEXTAUTH_SECRET is not .env.local's, so a server started with it
 *  rejects the session every other server on this machine accepts (the dev server answered the
 *  compare with its sign-in page). Next reads the env files itself, in its own order. */
function serverEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m) delete env[m[1]];
    }
  } catch { /* no .env */ }
  return env;
}
function ensureBuild() {
  const id = path.join(ROOT, DIST, "BUILD_ID");
  const src = Math.max(newest(path.join(ROOT, "src")), fs.statSync(path.join(ROOT, "next.config.ts")).mtimeMs);
  if (fs.existsSync(id) && fs.statSync(id).mtimeMs > src) return note("production build", `${DIST} is current`);
  note("production build", `${DIST} is older than src/ — building (next build, a few minutes)`);
  // `next build` adds its dist dir's types to tsconfig.json; that is not a change anyone made.
  const tsconfig = fs.readFileSync(path.join(ROOT, "tsconfig.json"));
  try {
    const r = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { cwd: ROOT, env: { ...serverEnv(), JOBFLEX_DIST_DIR: DIST }, encoding: "utf8", maxBuffer: 64 << 20 });
    if (r.status !== 0) throw new Error("next build failed:\n" + (r.stdout + r.stderr).split("\n").slice(-25).join("\n"));
  } finally { fs.writeFileSync(path.join(ROOT, "tsconfig.json"), tsconfig); }
}
const listening = (port: number) => new Promise<boolean>((res) => { const s = net.connect(port, "127.0.0.1"); s.once("connect", () => { s.destroy(); res(true); }); s.once("error", () => res(false)); });
async function startServer(): Promise<ChildProcess> {
  if (await listening(PORT)) throw new Error(`port ${PORT} is taken — set QA_SWEEP_PORT`);
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { cwd: ROOT, env: { ...serverEnv(), JOBFLEX_DIST_DIR: DIST, AUTH_TRUST_HOST: "true" }, stdio: "ignore" });
  for (let i = 0; i < 120; i++) { if (await listening(PORT)) { await sleep(800); return child; } await sleep(500); }
  throw new Error("next start did not come up");
}
function stopServer(child: ChildProcess | null) {
  if (!child || child.pid === undefined) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}
async function devBase(): Promise<string | null> {
  const list = process.env.QA_DEV_URL ? [process.env.QA_DEV_URL] : ["http://localhost:3001", "http://localhost:3000"];
  for (const u of list) { try { const r = await fetch(u + "/auth/login", { signal: AbortSignal.timeout(4000) }); if (r.status < 500) return u.replace(/\/$/, ""); } catch { /* not this one */ } }
  return null;
}

/** The surfaces a page must open whole: each a chain of button labels (prefixes). */
type Route = { path: string; anon?: boolean; open?: string[][]; compare?: boolean };
function routes(ids: { job: string; token: string; assignment: string }): Route[] {
  return [
    { path: "/", anon: true, compare: true }, { path: "/pricing", anon: true }, { path: "/homeowner", anon: true }, { path: "/auth/login", anon: true, compare: true }, { path: "/auth/register", anon: true },
    { path: "/dashboard", open: [["New estimate"], ["Notifications"]], compare: true },
    { path: "/dashboard/proposals", open: [["Actions for"]] },
    { path: "/dashboard/clients", open: [["New client"], ["Actions for", "Edit client"], ["Filter"]], compare: true },
    { path: "/dashboard/jobs", open: [["New job"], ["Actions for", "Assign crew"]], compare: true },
    { path: `/dashboard/jobs/${ids.job}` },
    { path: "/dashboard/leads", open: [["New lead"], ["Actions for"]] },
    { path: "/dashboard/calendar", open: [["New event"]] },
    { path: "/dashboard/workers", open: [["Invite worker"]] },
    { path: "/dashboard/company", open: [["Edit identity"]] },
    { path: "/dashboard/financials", open: [["Actions"]] },
    { path: "/dashboard/inventory", open: [["Add item"]] },
    // The desk pages inside the handheld frame: where the production CSS order bit (2026-10-04).
    { path: "/dashboard/fence-estimator", compare: true }, { path: "/dashboard/roof-estimator", compare: true }, { path: "/dashboard/hvac-estimator" },
    { path: "/dashboard/projects" }, { path: "/dashboard/messages" }, { path: "/dashboard/settings" }, { path: "/dashboard/crm" }, { path: "/dashboard/reports" },
    { path: `/w/${ids.token}/jobs/${ids.assignment}`, anon: true, open: [["Close day"]] },
  ];
}

async function press(page: any, label: string, inside: boolean) {
  const h = await page.evaluateHandle(({ l, inside }: { l: string; inside: boolean }) => [...document.querySelectorAll(inside ? "[data-sweep-overlay] button, [data-sweep-overlay] [role=menuitem]" : "button, [role=button], [aria-haspopup]")]
    .find((e) => (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().startsWith(l) && !(e as HTMLButtonElement).disabled && (inside || !e.closest('[role=dialog], [aria-modal="true"]'))) || null, { l: label, inside });
  const el = h.asElement(); if (!el) return false;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  // A list that loads late moves the control under the finger: press once it holds still and is on top.
  for (let i = 0; i < 12; i++) {
    const still = await el.evaluate(async (b: Element) => { const r1 = b.getBoundingClientRect(); await new Promise((r) => setTimeout(r, 250)); const r2 = b.getBoundingClientRect(); const at = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2); return r1.top === r2.top && !!at && (b === at || b.contains(at)); }).catch(() => false);
    if (still) break;
  }
  await el.click({ timeout: 4000 }).catch(() => el.evaluate((b: HTMLElement) => b.click()));
  return true;
}
async function load(page: any, url: string) {
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { first: 800 });
  return res ? res.status() : 0;
}
const say = (issues: Array<{ el?: string; what: string; soft?: boolean }>) => issues.filter((i) => !i.soft).map((i) => (i.el ? i.el + ": " : "") + i.what).join(" | ");

/** The crew world (two installers on a job, ./_crewWorld) for the length of `run`. */
async function withCrew(run: (crew: Awaited<ReturnType<typeof makeCrewWorld>>) => Promise<void>) {
  const crew = await makeCrewWorld("sweep");
  try { await run(crew); } finally { await crew.cleanup(); }
}

async function main() {
  const pw = playwright();
  ensureBuild();
  let server: ChildProcess | null = null;
  try {
    server = await startServer();
    // ./_world first (it clears QA Co's jobs on its way up), then the crew world on top of it.
    await qa.withWorld(() => withCrew(async (crew) => {
      // The portal's job page wants an open day to show Close day — made by hand, nothing started.
      const A = crew.workers[0];
      await db.workDay.create({ data: { organizationId: crew.orgId, jobId: crew.jobId, date: localDayKey(new Date(), crew.tz), dayNumber: 1, status: "OPEN", openedById: A.userId, source: "worker" } });
      const asg = await db.jobAssignment.findFirstOrThrow({ where: { jobId: crew.jobId, workerId: A.workerId }, select: { id: true } });
      const job = await db.job.findFirst({ where: { organizationId: crew.orgId, title: { not: crew.jobTitle } }, orderBy: { createdAt: "desc" }, select: { id: true } });
      const list = routes({ job: job?.id ?? crew.jobId, token: A.token, assignment: asg.id });
      const chrome = await qa.launch({ channel: "chrome" }).catch(() => qa.launch());
      const signer = await chrome.newContext(); const sp = await signer.newPage();
      await qa.signIn(sp); const cookies = await signer.cookies(); await chrome.close();
      const webkit = await pw.webkit.launch();
      for (const H of [844, 700]) {
        const ctx = await webkit.newContext({ viewport: { width: 390, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
        await ctx.addCookies(cookies); await qa.forbidControls(ctx);
        const page = await ctx.newPage(); page.on("dialog", (d: any) => d.dismiss().catch(() => {}));
        for (const r of list) {
          const status = await load(page, BASE + r.path).catch(() => 0);
          if (status >= 400 || !status) { check(`${H} ${r.path} loads`, false, `HTTP ${status}`); continue; }
          const p = await page.evaluate(PAGE);
          const issues = judge(p);
          check(`${H} ${r.path}`, !issues.filter((i: any) => !i.soft).length, say(issues));
          for (const chain of r.open || []) {
            await load(page, BASE + r.path);
            await page.evaluate(MARK);
            let ok = await press(page, chain[0], false);
            for (const next of chain.slice(1)) {
              if (!ok) break;
              await sleep(900); await page.evaluate(OVERLAY); await page.evaluate(MARK);
              ok = await press(page, next, true);
            }
            if (!ok) { check(`${H} ${r.path} ▸ ${chain.join(" ▸ ")}`, false, "the control is not on the page"); continue; }
            await sleep(1100);
            await page.evaluate(() => document.querySelectorAll("[data-sweep-overlay]").forEach((e) => { e.removeAttribute("data-sweep-overlay"); e.setAttribute("data-sweep-was", "1"); }));
            const m = await page.evaluate(OVERLAY);
            if (m.none) { check(`${H} ${r.path} ▸ ${chain.join(" ▸ ")}`, false, "nothing opened"); continue; }
            const oi = judgeOverlay(m);
            check(`${H} ${r.path} ▸ ${chain.join(" ▸ ")}`, !oi.filter((i: any) => !i.soft).length, `“${m.label}” ${m.top}..${m.bottom}${oi.length ? " · " + say(oi) : ""}`);
          }
        }
        await ctx.close();
      }
      // DEV ↔ PROD — the same page drawn by both, when a dev server is up.
      const dev = await devBase();
      if (!dev) note("dev ↔ prod", "no dev server on QA_DEV_URL / :3001 / :3000 — not compared");
      else {
        const ctxs = await Promise.all([dev, BASE].map(async () => { const c = await webkit.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA }); await c.addCookies(cookies); return c; }));
        const [dp, pp] = await Promise.all(ctxs.map((c) => c.newPage()));
        for (const r of list.filter((x) => x.compare)) {
          const got: any[] = [];
          for (const [page, base, wait] of [[dp, dev, 4000], [pp, BASE, 1000]] as Array<[any, string, number]>) {
            await page.goto(base + r.path, { waitUntil: "domcontentloaded", timeout: 180000 });
            await settle(page, { first: wait, timeout: 120000 });
            got.push(await page.evaluate(PRINT));
          }
          const d = diffPrint(got[0], got[1]);
          check(`dev ↔ prod ${r.path}`, !d.length, d.slice(0, 5).join(" | "));
        }
        await Promise.all(ctxs.map((c) => c.close()));
      }
      await webkit.close();
    }));
  } finally {
    stopServer(server);
  }
  console.log(bad ? `\n${bad} failing` : "\nall green");
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); console.log("\n1 failing"); process.exit(1); });

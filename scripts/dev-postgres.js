// Run localhost against the Neon "dev" branch (a copy of production) instead
// of the SQLite file — `npm run dev:pg`.
//
// WHY: prisma/schema.prisma is SQLite for local work, Vercel swaps the
// datasource to Postgres at build (scripts/prisma-production-schema.js). That
// split is where "works on my laptop, breaks on Vercel" comes from. With the
// dev branch reset from main (Neon → Branches → dev → Reset from parent) the
// laptop runs the exact production schema on an exact copy of the data.
//
// SAFETY: refuses any URL whose host is production's (ep-blue-hall…). The
// branch to use is read from PREVIEW_DATABASE_URL in .env.local — never
// TARGET_DATABASE_URL, which is production and read-only tooling only.
//
// Switching back: `npm run dev` regenerates the SQLite client first, so the
// two modes never share a stale Prisma client.
const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const root = path.join(__dirname, "..");
const envFile = path.join(root, ".env.local");
const PROD_HOST_MARK = "ep-blue-hall";

function readEnvValue(key) {
  if (!fs.existsSync(envFile)) return null;
  const m = fs.readFileSync(envFile, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

const url = process.env.PREVIEW_DATABASE_URL || readEnvValue("PREVIEW_DATABASE_URL");
if (!url) {
  console.error("PREVIEW_DATABASE_URL is not set in .env.local — paste the Neon `dev` branch connection string there first.");
  process.exit(1);
}
let host;
try {
  host = new URL(url).hostname;
} catch {
  console.error("PREVIEW_DATABASE_URL is not a valid URL.");
  process.exit(1);
}
if (host.includes(PROD_HOST_MARK)) {
  console.error(`Refusing: ${host} is the PRODUCTION host. Point PREVIEW_DATABASE_URL at the dev branch.`);
  process.exit(1);
}
// Neon: the pooled host carries "-pooler"; Prisma's directUrl wants the bare one.
const direct = url.replace("-pooler.", ".");

const env = {
  ...process.env,
  POSTGRES_URL: url,
  POSTGRES_URL_NON_POOLING: direct,
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: direct,
  JOBFLEX_DB_MODE: "postgres-dev-branch",
};
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

console.log(`[dev:pg] Postgres branch host: ${host}`);
run("node", ["scripts/prisma-production-schema.js"]);
run(npx, ["prisma", "generate", "--schema=prisma/schema.production.prisma"]);
// Same invocation as `npm run dev` (heap flag included), just with the env above.
const child = spawn(
  "node",
  ["--max-old-space-size=8192", "node_modules/next/dist/bin/next", "dev", ...process.argv.slice(2)],
  { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" },
);
child.on("exit", (code) => process.exit(code ?? 0));

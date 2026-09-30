// FILES WITHOUT A ROW, ROWS WITHOUT A FILE (stage B, 2026-09-30) — a REPORT,
// never a delete.
//
//   npx tsx --tsconfig tsconfig.json scripts/maintenance/media-orphans.ts [--json]
//
// Lists what the private store (or the local fallback in development) and the
// public store hold, and every URL the database points at: JobPhoto.url,
// JobExpense.receiptUrl, Proposal.beforePhotos / afterPhotos,
// ChangeOrder.photosJson, ReviewRequest.photosJson. Prints the files no row
// names (orphans) and the rows whose private file is gone (dangling). Deleting
// an orphan is a decision for a person, with this list in hand.

import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { kindOfUrl, localRoot, pathnameOf, privateToken, storageMode, storedExists } from "../../src/lib/media/privateStore";

const db = new PrismaClient();
const asJson = process.argv.includes("--json");

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else if (!e.name.endsWith(".meta.json")) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

async function listStore(token: string): Promise<Array<{ url: string; pathname: string; size: number }>> {
  const { list } = await import("@vercel/blob");
  const out: Array<{ url: string; pathname: string; size: number }> = [];
  let cursor: string | undefined;
  do {
    const r = await list({ token, cursor, limit: 1000 });
    for (const b of r.blobs) out.push({ url: b.url, pathname: b.pathname, size: b.size });
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

function urlsIn(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    const arr = Array.isArray(v) ? v : [];
    return arr.map((x) => (typeof x === "string" ? x : typeof x === "object" && x && "url" in x ? String((x as { url: unknown }).url) : "")).filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const [photos, expenses, proposals, changeOrders, reviews] = await Promise.all([
    db.jobPhoto.findMany({ select: { id: true, url: true } }),
    db.jobExpense.findMany({ where: { receiptUrl: { not: null } }, select: { id: true, receiptUrl: true } }),
    db.proposal.findMany({ select: { id: true, beforePhotos: true, afterPhotos: true } }),
    db.changeOrder.findMany({ select: { id: true, photosJson: true } }),
    db.reviewRequest.findMany({ select: { id: true, photosJson: true } }),
  ]);
  const referenced = new Map<string, string>();
  for (const p of photos) referenced.set(p.url, `JobPhoto ${p.id}`);
  for (const e of expenses) referenced.set(e.receiptUrl!, `JobExpense ${e.id}`);
  for (const p of proposals) for (const u of [...urlsIn(p.beforePhotos), ...urlsIn(p.afterPhotos)]) referenced.set(u, `Proposal ${p.id}`);
  for (const c of changeOrders) for (const u of urlsIn(c.photosJson)) referenced.set(u, `ChangeOrder ${c.id}`);
  for (const r of reviews) for (const u of urlsIn(r.photosJson)) referenced.set(u, `ReviewRequest ${r.id}`);

  const orphans: Array<{ where: string; url: string; size?: number }> = [];
  const mode = storageMode();
  // Private files: the store, or the local fallback's folder.
  if (privateToken()) {
    for (const b of await listStore(privateToken()!)) if (!referenced.has(b.url)) orphans.push({ where: "private store", url: b.url, size: b.size });
  } else {
    for (const rel of await walk(localRoot())) {
      const url = `local:${rel}`;
      if (!referenced.has(url)) orphans.push({ where: "local fallback", url });
    }
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    for (const b of await listStore(process.env.BLOB_READ_WRITE_TOKEN)) if (!referenced.has(b.url)) orphans.push({ where: "public store", url: b.url, size: b.size });
  }
  // Rows that point at a private file that is not there.
  const dangling: Array<{ row: string; url: string }> = [];
  for (const [url, row] of referenced) {
    const k = kindOfUrl(url);
    if ((k === "local" && !privateToken()) || (k === "private-blob" && privateToken())) {
      if (!(await storedExists(url))) dangling.push({ row, url });
    }
  }
  const summary = { mode, referenced: referenced.size, orphans: orphans.length, dangling: dangling.length };
  if (asJson) console.log(JSON.stringify({ summary, orphans, dangling }, null, 1));
  else {
    console.log(`storage: ${mode} · rows with a file: ${referenced.size}`);
    console.log(`\nfiles with no row (${orphans.length}) — NOT deleted:`);
    for (const o of orphans) console.log(`  [${o.where}] ${pathnameOf(o.url) ?? o.url}${o.size ? ` (${o.size} B)` : ""}`);
    console.log(`\nrows whose private file is missing (${dangling.length}):`);
    for (const d of dangling) console.log(`  ${d.row} → ${pathnameOf(d.url) ?? d.url}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";

// A worker token idle for this long is rotated (the old /w/<token> link dies).
const INACTIVE_MONTHS = 6;
// Price-cache rows not refreshed within this window are pruned.
const CACHE_TTL_DAYS = 90;

// Daily maintenance: (1) revoke tokens of long-inactive workers, (2) prune stale
// price-cache rows. Fail-closed cron auth, same as the other cron routes.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 1) Revoke tokens of workers inactive for > 6 months ───────────────────
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - INACTIVE_MONTHS);

  // ⛔ SAFETY: only rows with a REAL lastSeenAt older than the cutoff. `lt`
  // already excludes NULL (in SQL, NULL < date is unknown, never true), and
  // `not: null` states that guarantee explicitly. A worker with lastSeenAt =
  // NULL — never backfilled, or brand new — is NEVER revoked here.
  const stale = await db.workerProfile.findMany({
    where: { lastSeenAt: { not: null, lt: cutoff } },
    select: { id: true },
  });

  let revoked = 0;
  for (const w of stale) {
    // Same rotation as revokeWorker: a fresh token instantly kills the old link.
    await db.workerProfile.update({
      where: { id: w.id },
      data: { token: randomUUID() },
    });
    revoked += 1;
  }

  // ── 2) Prune stale price-cache rows ───────────────────────────────────────
  const cacheCutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const pruned = await db.productPriceCache.deleteMany({
    where: { updatedAt: { lt: cacheCutoff } },
  });

  console.info(
    `[cron/daily-cleanup] revoked ${revoked} inactive worker token(s); pruned ${pruned.count} price-cache row(s).`,
  );
  return NextResponse.json({ ok: true, revokedWorkers: revoked, prunedCache: pruned.count });
}

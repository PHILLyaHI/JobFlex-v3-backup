// GET /api/cron/traffic-digest — the analyst's daily reading (2026-10-04).
//
// Saves the day's reading as history (SyncState analyst:<day>) and emails it
// (lib/traffic-digest). Vercel's schedule is in UTC, so it calls at 15, 16 and
// 17 UTC and the run goes ahead only at 8:00 or 9:00 Los Angeles, whichever
// the season makes it; once the day is saved, every later call is a no-op.
// `?force=1` (with the cron secret) saves and sends again. Fail-closed auth.
import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { DIGEST_HOURS, runTrafficDigest } from "@/lib/traffic-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const run = await runTrafficDigest({ force, hours: force ? null : DIGEST_HOURS, origin: process.env.NODE_ENV === "production" ? undefined : url.origin });
  console.info(`[cron/traffic-digest] ${run.day} ${run.status}${run.message ? ` · ${run.message}` : ""}${run.email ? ` · email ${run.email.sentAt ? "sent" : run.email.skipped ?? run.email.error}` : ""}`);
  return NextResponse.json({ ok: run.status !== "failed", ...run }, { status: run.status === "failed" ? 503 : 200 });
}

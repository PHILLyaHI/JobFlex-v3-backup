import { NextResponse } from "next/server";
import { runDueFollowUps } from "@/lib/followUps/engine";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Shared fail-closed cron auth (header / Bearer only, constant-time).
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await runDueFollowUps();
  return NextResponse.json({ ok: true, ...res });
}

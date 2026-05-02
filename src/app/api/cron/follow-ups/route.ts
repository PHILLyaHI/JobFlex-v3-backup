import { NextResponse } from "next/server";
import { runDueFollowUps } from "@/actions/followUps";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Simple shared-secret cron auth. Expect header `x-cron-key` or `?key=` to match CRON_SECRET.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const provided = req.headers.get("x-cron-key") ?? url.searchParams.get("key");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const res = await runDueFollowUps();
  return NextResponse.json({ ok: true, ...res });
}

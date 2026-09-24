import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { runCrewTexts } from "@/lib/sms/crew";

export const runtime = "nodejs";
export const maxDuration = 60;

// THE HOURLY TEXT TICK (2026-09-24): office texts held through the quiet
// hours go out once their window ends (folded into one), and every
// company's opted-in crew gets tomorrow's list at 6 PM and today's at 7 AM,
// company time. Fail-closed cron auth like the other cron routes.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runCrewTexts(new Date());
  return NextResponse.json({ ok: true, ...r });
}

import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { runLeadSetupReminderSweep } from "@/lib/leadSetupReminders";

export const runtime = "nodejs";

// Every morning: one reminder to each new shop still missing its address or
// specialties for leads (lib/leadSetupReminders). Fail-closed cron auth.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await runLeadSetupReminderSweep();
  return NextResponse.json({ ok: true, ...res });
}

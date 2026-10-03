import { NextResponse } from "next/server";
import { sendPlanReminders } from "@/lib/home/reminders";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";

// Home dashboard plans (daily, 16:00 UTC — 9 AM Pacific): the projects
// homeowners planned for a month that has come get their "ready? submit it"
// email (lib/home/reminders).
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = await sendPlanReminders();
  return NextResponse.json({ ok: true, ...res });
}

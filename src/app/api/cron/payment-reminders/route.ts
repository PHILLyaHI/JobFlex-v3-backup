import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { runReminderLadder } from "@/lib/payments/reminders";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily: for every company in AUTO reminder mode, nudge the client for the
// next unpaid stage on the day 1 / 3 / 7 ladder (lib/payments/reminders).
// Manual mode sends nothing from here; the Remind buttons still work.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runReminderLadder(new Date());
  return NextResponse.json(result);
}

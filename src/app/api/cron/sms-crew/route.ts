import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { runCrewTexts } from "@/lib/sms/crew";
import { runClientReminders } from "@/lib/sms/clients";
import { runTimedTextRules } from "@/lib/sms/rulesEngine";
import { refreshPendingRegistrations } from "@/lib/sms/registration";

export const runtime = "nodejs";
export const maxDuration = 60;

// THE HOURLY TEXT TICK (2026-09-24): office texts held through the quiet
// hours go out once their window ends (folded into one), and every
// company's opted-in crew gets tomorrow's list at 6 PM and today's at 7 AM,
// company time. Fail-closed cron auth like the other cron routes.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const r = await runCrewTexts(now);
  const clientReminders = await runClientReminders(now);
  // The company's own timed texts (2026-09-29): hours before a visit or a crew
  // day, days with no answer on a proposal.
  const ownTexts = await runTimedTextRules(now).catch(() => 0);
  // Companies' own numbers waiting on Twilio (2026-10-02): an approval puts
  // the number on the company within the hour, with nobody opening Settings.
  const registrations = await refreshPendingRegistrations().catch(() => 0);
  return NextResponse.json({ ok: true, ...r, clientReminders, ownTexts, registrations });
}

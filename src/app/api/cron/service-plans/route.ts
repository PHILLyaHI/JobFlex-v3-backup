import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { runServicePlans } from "@/lib/servicePlanBook";
import { runBookingReminders } from "@/lib/bookingBook";

export const runtime = "nodejs";
export const maxDuration = 120;

// THE PLANS' OWN DAY (2026-09-22): bills that are due go out, visits two
// weeks out are announced to the office and the client, plans ending
// within 30 days get one warning, and at the end they renew on their own
// or expire. Fail-closed cron auth like the other cron routes; one bad
// plan is logged and the rest still run (lib/servicePlanBook).
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = await runServicePlans(new Date());
  // Online bookings (2026-09-23): the day-before reminder rides the same run.
  const bookings = await runBookingReminders(new Date()).catch((err) => {
    console.error(`[booking] reminders: ${err instanceof Error ? err.message : String(err)}`);
    return { reminded: 0 };
  });
  return NextResponse.json({ ok: true, ...report, bookingsReminded: bookings.reminded });
}

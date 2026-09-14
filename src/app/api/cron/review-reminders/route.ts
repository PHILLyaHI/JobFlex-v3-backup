import { NextResponse } from "next/server";
import { runReviewReminderSweep } from "@/lib/reviews/reminders";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";

// Review reminders (daily): a client mailed a review link 7+ days ago who has
// not used it gets one softer follow-up. Once per request, ever.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = await runReviewReminderSweep();
  return NextResponse.json({ ok: true, ...res });
}

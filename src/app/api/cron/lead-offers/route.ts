import { NextResponse } from "next/server";
import { runDueOfferSweep } from "@/lib/leadCenter/cascade";
import { runLeadAlertSweep } from "@/lib/leadCenter/alerts";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";

// Lead Center sweep (every 15 min): expire 24h offers past their window and
// cascade each to the next-ranked shop; re-drive leads stuck in MATCHING or
// orphaned in OFFERED (a mid-cascade error left no open offer). Then the
// admins' alerts: a reminder for requests still waiting, the morning summary
// (lib/leadCenter/alerts).
export async function GET(req: Request) {
  // Shared fail-closed cron auth (header / Bearer only, constant-time).
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await runDueOfferSweep();
  const alerts = await runLeadAlertSweep();
  return NextResponse.json({ ok: true, ...res, alerts });
}

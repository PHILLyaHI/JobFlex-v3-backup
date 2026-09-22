import { NextResponse } from "next/server";
import { reconcileStripe } from "@/lib/reconcile";
import { isCronAuthorized } from "@/lib/cronAuth";
import { confirmPendingSyncMarks, runPlanGrantExpiry } from "@/lib/planGrant";

export const runtime = "nodejs";

// Hourly/daily backstop: re-sync subscriptions + re-assert accruals from Stripe,
// repairing any dropped webhook. Idempotent.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await reconcileStripe();
  // The admin editor's follow-ups (lib/planGrant): a changed subscription is
  // read back until Stripe confirms it, and a complimentary plan is noticed
  // seven days out and ended on its date. Neither needs Stripe to be up for
  // the grant side, so a Stripe outage does not stop a comp from ending.
  const syncing = await confirmPendingSyncMarks().catch((err) => {
    console.warn("[reconcile] sync marks:", err);
    return { checked: 0, confirmed: 0 };
  });
  const grants = await runPlanGrantExpiry().catch((err) => {
    console.warn("[reconcile] plan grants:", err);
    return { scanned: 0, noticed: 0, ended: 0, superseded: 0 };
  });
  return NextResponse.json({ ok: true, ...res, syncing, grants });
}

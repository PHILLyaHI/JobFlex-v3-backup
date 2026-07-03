import { NextResponse } from "next/server";
import { reconcileStripe } from "@/lib/reconcile";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";

// Hourly/daily backstop: re-sync subscriptions + re-assert accruals from Stripe,
// repairing any dropped webhook. Idempotent.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await reconcileStripe();
  return NextResponse.json({ ok: true, ...res });
}

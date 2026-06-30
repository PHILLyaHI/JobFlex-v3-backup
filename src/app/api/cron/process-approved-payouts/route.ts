import { NextResponse } from "next/server";
import { runApprovedPayouts } from "@/lib/payouts";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";

// Executes admin-approved payouts via Stripe Connect transfers.
// Schedule daily (see vercel.json). Guarded by the shared CRON_SECRET.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await runApprovedPayouts();
  return NextResponse.json({ ok: true, ...res });
}

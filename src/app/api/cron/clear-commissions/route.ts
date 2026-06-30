import { NextResponse } from "next/server";
import { clearDueCommissions } from "@/lib/reconcile";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";

// Daily: move accrued commission past its hold window into CLEARED (payable).
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await clearDueCommissions();
  return NextResponse.json({ ok: true, ...res });
}

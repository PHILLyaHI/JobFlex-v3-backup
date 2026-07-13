import { NextResponse } from "next/server";
import { runDueOfferSweep } from "@/lib/leadCenter/cascade";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";

// Lead Center sweep (every 15 min): expire 24h offers past their window and
// cascade each to the next-ranked shop; re-drive leads stuck in MATCHING or
// orphaned in OFFERED (a mid-cascade error left no open offer).
export async function GET(req: Request) {
  // Shared fail-closed cron auth (header / Bearer only, constant-time).
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await runDueOfferSweep();
  return NextResponse.json({ ok: true, ...res });
}

import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { runTrialWinbackSweep } from "@/lib/trialWinback";

export const runtime = "nodejs";

// Every afternoon: the win-back mails to card-less trials that ended with no
// card — day 1, day 3, the 10% offer on day 5, the last word on day 12
// (lib/trialWinback). Fail-closed cron auth like the others.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await runTrialWinbackSweep();
  return NextResponse.json({ ok: true, ...res });
}

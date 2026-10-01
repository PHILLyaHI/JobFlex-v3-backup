import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { runCardlessTrialSweep } from "@/lib/cardlessTrial";

export const runtime = "nodejs";

// Hourly: the card-less trial's reminder emails (two days out, the last day)
// and the "ended" stamp — lib/cardlessTrial runCardlessTrialSweep. Idempotent:
// each email is sent once per trial, recorded on the trial's own row.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await runCardlessTrialSweep();
  return NextResponse.json({ ok: true, ...res });
}

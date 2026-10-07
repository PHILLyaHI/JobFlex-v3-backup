import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { pullMetaSpend } from "@/lib/metaAdSpend";

export const runtime = "nodejs";

// Every morning: Meta's own ad spend per day for the last two weeks, into the
// investors' figures (lib/metaAdSpend). Does nothing until the deployment has
// the token and the account id. Fail-closed cron auth like the others.
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await pullMetaSpend(14);
  return NextResponse.json(result, { status: result.ok || result.error === "Meta is not connected." ? 200 : 502 });
}

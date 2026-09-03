import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireManager } from "@/lib/orgContext";
import { getGmailAuthUrl, signGmailState, isGmailOAuthConfigured } from "@/lib/sdk/gmail";

// Kicks off the Gmail OAuth consent flow. Manager-only; binds the org into a
// signed state so the callback can't be replayed for another org.
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

  if (!isGmailOAuthConfigured()) {
    return NextResponse.redirect(new URL("/dashboard/settings?tab=integrations&sub=gmail&gmail=unconfigured", appUrl));
  }

  let organizationId: string;
  try {
    const ctx = await requireManager();
    organizationId = ctx.organizationId;
  } catch {
    return NextResponse.redirect(new URL("/auth/login?next=%2Fdashboard%2Fsettings%3Ftab%3Dintegrations%26sub%3Dgmail", appUrl));
  }

  const url = await getGmailAuthUrl(signGmailState(organizationId));
  return NextResponse.redirect(url);
}

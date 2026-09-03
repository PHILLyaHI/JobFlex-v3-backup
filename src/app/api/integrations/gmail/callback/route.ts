import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { exchangeGmailCode, verifyGmailState } from "@/lib/sdk/gmail";
import { parseGmailSettings } from "@/lib/settings";

// Handles the Google redirect: verifies the signed state, exchanges the code for
// tokens, and stores them (+ the connected address) on the org.
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const back = (status: string) =>
    NextResponse.redirect(new URL(`/dashboard/settings?tab=integrations&sub=gmail&gmail=${status}`, appUrl));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError || !code) return back("denied");

  const parsed = verifyGmailState(state);
  if (!parsed) return back("badstate");

  let organizationId: string;
  try {
    const ctx = await requireManager();
    organizationId = ctx.organizationId;
  } catch {
    return NextResponse.redirect(new URL("/auth/login?next=%2Fdashboard%2Fsettings%3Ftab%3Dintegrations%26sub%3Dgmail", appUrl));
  }
  // The signed state must match the acting org (defense against cross-org replay).
  if (parsed.organizationId !== organizationId) return back("mismatch");

  try {
    const tokens = await exchangeGmailCode(code);
    // Google only returns a refresh_token on first consent; prompt=consent forces
    // it, but if it's still missing the connection would break on the next send.
    if (!tokens.refreshToken) return back("norefresh");

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { gmailSettingsJson: true },
    });
    const settings = parseGmailSettings(org?.gmailSettingsJson);
    await db.organization.update({
      where: { id: organizationId },
      data: {
        gmailTokensJson: JSON.stringify(tokens),
        gmailSettingsJson: JSON.stringify({
          ...settings,
          connected: true,
          connectedEmail: tokens.email,
          // Default reply-to to the connected inbox if the user hasn't set one.
          replyTo: settings.replyTo || tokens.email,
        }),
      },
    });
    return back("connected");
  } catch (err) {
    console.error("[gmail callback] token exchange failed:", err);
    return back("error");
  }
}

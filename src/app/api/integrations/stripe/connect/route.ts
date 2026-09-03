import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { signOAuthState, setOAuthNonceCookie } from "@/lib/oauthState";
import {
  connectAuthorizeUrl,
  connectClientIdFor,
  stripeConnectReady,
} from "@/lib/payments/stripeConnect";

// Starts the Stripe Connect OAuth flow (Standard account). Owner-only. The
// state is signed with org + user + nonce; the nonce is also an httpOnly
// cookie, so a callback can only complete in the browser that started here.
const SETTINGS_RETURN = "/dashboard/settings?tab=payments";

export async function GET(req: NextRequest) {
  const appUrl = await appBaseUrl();
  const back = (status: string) =>
    NextResponse.redirect(new URL(`${SETTINGS_RETURN}&stripe=${status}`, appUrl));

  let ctx: Awaited<ReturnType<typeof requireOwner>>;
  try {
    ctx = await requireOwner();
  } catch {
    return NextResponse.redirect(
      new URL(`/auth/login?next=${encodeURIComponent(SETTINGS_RETURN)}`, appUrl),
    );
  }

  const ready = await stripeConnectReady();
  if (!ready.ok) return back("unconfigured");
  const clientId = connectClientIdFor(ready.mode)!;

  const org = await db.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { name: true, billingEmail: true },
  });

  const { state, nonce } = signOAuthState({
    provider: "stripe",
    organizationId: ctx.organizationId,
    userId: ctx.user.id,
  });
  await setOAuthNonceCookie("stripe", nonce);

  void req;
  return NextResponse.redirect(
    connectAuthorizeUrl({
      clientId,
      state,
      redirectUri: `${appUrl}/api/integrations/stripe/callback`,
      email: org?.billingEmail ?? ctx.user.email ?? null,
      businessName: org?.name ?? null,
    }),
  );
}

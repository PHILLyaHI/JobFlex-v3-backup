import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { consumeOAuthNonceCookie, verifyOAuthState } from "@/lib/oauthState";
import { exchangeConnectCode, stripeConnectReady } from "@/lib/payments/stripeConnect";
import { parsePaymentSettings } from "@/lib/settings";
import { ActivityKind, PaymentConnectionStatus } from "@/lib/prismaEnums";

const RETURN = "/dashboard/settings?tab=payments";

// Stripe redirects here with ?code=ac_…&state=… (or ?error=access_denied).
// Verifies state + nonce cookie + acting owner, exchanges the code, stores the
// connected account id with the mode it was joined in.
export async function GET(req: NextRequest) {
  const appUrl = await appBaseUrl();
  const back = (status: string) => NextResponse.redirect(new URL(`${RETURN}&stripe=${status}`, appUrl));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError || !code) return back("denied");

  const parsed = verifyOAuthState(state, "stripe");
  if (!parsed) return back("badstate");
  if (!(await consumeOAuthNonceCookie("stripe", parsed.nonce))) return back("badstate");

  let ctx: Awaited<ReturnType<typeof requireOwner>>;
  try {
    ctx = await requireOwner();
  } catch {
    return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(RETURN)}`, appUrl));
  }
  if (parsed.organizationId !== ctx.organizationId || parsed.userId !== ctx.user.id) {
    return back("mismatch");
  }

  const ready = await stripeConnectReady();
  if (!ready.ok) return back("unconfigured");

  try {
    const acct = await exchangeConnectCode(code, ready.mode);
    // A test-mode client id can only ever return a test account and vice
    // versa; record what Stripe says rather than what we asked for.
    await db.paymentConnection.upsert({
      where: { organizationId_provider: { organizationId: ctx.organizationId, provider: "STRIPE" } },
      create: {
        organizationId: ctx.organizationId,
        provider: "STRIPE",
        status: acct.chargesEnabled ? PaymentConnectionStatus.ACTIVE : PaymentConnectionStatus.RESTRICTED,
        stripeAccountId: acct.accountId,
        stripeLivemode: acct.livemode,
        stripeChargesEnabled: acct.chargesEnabled,
        stripeDetailsSubmitted: acct.detailsSubmitted,
        currency: acct.currency,
        country: acct.country,
        connectedByUserId: ctx.user.id,
      },
      update: {
        status: acct.chargesEnabled ? PaymentConnectionStatus.ACTIVE : PaymentConnectionStatus.RESTRICTED,
        stripeAccountId: acct.accountId,
        stripeLivemode: acct.livemode,
        stripeChargesEnabled: acct.chargesEnabled,
        stripeDetailsSubmitted: acct.detailsSubmitted,
        currency: acct.currency,
        country: acct.country,
        lastError: null,
        connectedByUserId: ctx.user.id,
        connectedAt: new Date(),
      },
    });

    const org = await db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { paymentSettingsJson: true },
    });
    const settings = parsePaymentSettings(org?.paymentSettingsJson);
    await db.organization.update({
      where: { id: ctx.organizationId },
      data: { paymentSettingsJson: JSON.stringify({ ...settings, stripe: true }) },
    });
    await db.activityEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.user.id,
        kind: ActivityKind.PAYMENT_CONNECTED,
        summary: `Stripe connected (${acct.accountId}${acct.livemode ? "" : ", test mode"})`,
      },
    });
    return back(acct.chargesEnabled ? "connected" : "restricted");
  } catch (err) {
    console.error("[stripe connect callback] exchange failed:", err);
    return back("error");
  }
}

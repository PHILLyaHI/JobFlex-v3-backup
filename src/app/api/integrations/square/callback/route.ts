import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { consumeOAuthNonceCookie, verifyOAuthState } from "@/lib/oauthState";
import { isSquareEnabled, squareEnv } from "@/lib/sdk/square";
import { isSecretBoxConfigured } from "@/lib/crypto/secretBox";
import {
  encryptTokens,
  obtainSquareToken,
  pickSquareLocation,
  revokeSquareToken,
} from "@/lib/payments/squareConnect";
import { platformCountry } from "@/lib/payments/fees";
import { parsePaymentSettings } from "@/lib/settings";
import { ActivityKind, PaymentConnectionStatus } from "@/lib/prismaEnums";

const RETURN = "/dashboard/settings?tab=payments";

// Square redirects here with ?code=…&state=… (5-minute, single-use code) or
// ?error=access_denied. Exchanges the code, picks the seller's first usable
// location, stores encrypted tokens.
export async function GET(req: NextRequest) {
  const appUrl = await appBaseUrl();
  const back = (status: string) => NextResponse.redirect(new URL(`${RETURN}&square=${status}`, appUrl));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError || !code) return back("denied");

  const parsed = verifyOAuthState(state, "square");
  if (!parsed) return back("badstate");
  if (!(await consumeOAuthNonceCookie("square", parsed.nonce))) return back("badstate");

  let ctx: Awaited<ReturnType<typeof requireOwner>>;
  try {
    ctx = await requireOwner();
  } catch {
    return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(RETURN)}`, appUrl));
  }
  if (parsed.organizationId !== ctx.organizationId || parsed.userId !== ctx.user.id) {
    return back("mismatch");
  }
  if (!isSquareEnabled() || !isSecretBoxConfigured()) return back("unconfigured");

  try {
    const tokens = await obtainSquareToken(code, `${appUrl}/api/integrations/square/callback`);
    const location = await pickSquareLocation(tokens.accessToken);
    if (!location) {
      await revokeSquareToken(tokens.merchantId);
      return back("nolocation");
    }
    // Square only pays an app fee when platform and seller share a country.
    if (location.country && location.country.toUpperCase() !== platformCountry()) {
      await revokeSquareToken(tokens.merchantId);
      return back("country");
    }

    const enc = encryptTokens(tokens);
    await db.paymentConnection.upsert({
      where: { organizationId_provider: { organizationId: ctx.organizationId, provider: "SQUARE" } },
      create: {
        organizationId: ctx.organizationId,
        provider: "SQUARE",
        status: PaymentConnectionStatus.ACTIVE,
        squareMerchantId: tokens.merchantId,
        squareLocationId: location.id,
        squareLocationName: location.name,
        squareEnv: squareEnv(),
        currency: location.currency,
        country: location.country,
        connectedByUserId: ctx.user.id,
        ...enc,
      },
      update: {
        status: PaymentConnectionStatus.ACTIVE,
        squareMerchantId: tokens.merchantId,
        squareLocationId: location.id,
        squareLocationName: location.name,
        squareEnv: squareEnv(),
        currency: location.currency,
        country: location.country,
        lastError: null,
        connectedByUserId: ctx.user.id,
        connectedAt: new Date(),
        ...enc,
      },
    });

    const org = await db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { paymentSettingsJson: true },
    });
    const settings = parsePaymentSettings(org?.paymentSettingsJson);
    await db.organization.update({
      where: { id: ctx.organizationId },
      data: { paymentSettingsJson: JSON.stringify({ ...settings, square: true }) },
    });
    await db.activityEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.user.id,
        kind: ActivityKind.PAYMENT_CONNECTED,
        summary: `Square connected (${location.name ?? tokens.merchantId}${squareEnv() === "sandbox" ? ", sandbox" : ""})`,
      },
    });
    return back("connected");
  } catch (err) {
    console.error("[square callback] token exchange failed:", err);
    return back("error");
  }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/orgContext";
import { appBaseUrl } from "@/lib/appUrl";
import { signOAuthState, setOAuthNonceCookie } from "@/lib/oauthState";
import { isSquareEnabled } from "@/lib/sdk/square";
import { isSecretBoxConfigured } from "@/lib/crypto/secretBox";
import { squareAuthorizeUrl } from "@/lib/payments/squareConnect";

const RETURN = "/dashboard/settings?tab=payments";

// Starts the Square OAuth flow. Owner-only. Refuses when the app has no
// Square credentials or no key to encrypt the seller's tokens with.
export async function GET(req: NextRequest) {
  const appUrl = await appBaseUrl();
  const back = (status: string) => NextResponse.redirect(new URL(`${RETURN}&square=${status}`, appUrl));

  let ctx: Awaited<ReturnType<typeof requireOwner>>;
  try {
    ctx = await requireOwner();
  } catch {
    return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(RETURN)}`, appUrl));
  }
  if (!isSquareEnabled() || !isSecretBoxConfigured()) return back("unconfigured");

  const { state, nonce } = signOAuthState({
    provider: "square",
    organizationId: ctx.organizationId,
    userId: ctx.user.id,
  });
  await setOAuthNonceCookie("square", nonce);
  void req;
  return NextResponse.redirect(
    squareAuthorizeUrl({ state, redirectUri: `${appUrl}/api/integrations/square/callback` }),
  );
}

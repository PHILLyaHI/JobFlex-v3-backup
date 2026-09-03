// Square as a platform: OAuth (raw REST — two JSON calls, no SDK quirks),
// seller-token SDK client, token refresh, revoke, location pick, payment
// links. Tokens live encrypted on PaymentConnection (secretBox).
import {
  squareAppCredentials,
  squareClientForToken,
  squareConnectBase,
  squareEnv,
} from "@/lib/sdk/square";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secretBox";

export const SQUARE_SCOPES = [
  "MERCHANT_PROFILE_READ",
  "PAYMENTS_WRITE",
  "PAYMENTS_READ",
  "PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS", // app_fee_money
  "ORDERS_WRITE",
  "ORDERS_READ",
] as const;

export interface SquareConnectionLike {
  squareAccessTokenEnc: string | null;
  squareRefreshTokenEnc: string | null;
  squareTokenExpiresAt: Date | null;
  squareLocationId: string | null;
  squareMerchantId: string | null;
}

export function squareAuthorizeUrl(input: { state: string; redirectUri: string }): string {
  const { clientId } = squareAppCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SQUARE_SCOPES.join(" "),
    session: "false",
    state: input.state,
    redirect_uri: input.redirectUri,
  });
  return `${squareConnectBase()}/oauth2/authorize?${params.toString()}`;
}

export interface SquareTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  merchantId: string;
}

async function tokenRequest(body: Record<string, string>): Promise<SquareTokens> {
  const res = await fetch(`${squareConnectBase()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Square-Version": "2025-01-23" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.message as string) || (json.error_description as string) || `HTTP ${res.status}`;
    throw new Error(`Square token: ${msg}`);
  }
  const accessToken = json.access_token as string | undefined;
  const merchantId = json.merchant_id as string | undefined;
  if (!accessToken || !merchantId) throw new Error("Square token: incomplete response");
  return {
    accessToken,
    // A refresh grant may omit refresh_token; the caller keeps the old one.
    refreshToken: (json.refresh_token as string | undefined) ?? "",
    expiresAt: json.expires_at ? new Date(json.expires_at as string) : new Date(Date.now() + 29 * 864e5),
    merchantId,
  };
}

export async function obtainSquareToken(code: string, redirectUri: string): Promise<SquareTokens> {
  const { clientId, clientSecret } = squareAppCredentials();
  return tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
}

export async function refreshSquareToken(refreshToken: string): Promise<SquareTokens> {
  const { clientId, clientSecret } = squareAppCredentials();
  const t = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return { ...t, refreshToken: t.refreshToken || refreshToken };
}

/** Revoke every token we hold for a merchant. Needs the app secret as a
 *  `Client` (not Bearer) authorization. Best-effort. */
export async function revokeSquareToken(merchantId: string): Promise<boolean> {
  try {
    const { clientId, clientSecret } = squareAppCredentials();
    const res = await fetch(`${squareConnectBase()}/oauth2/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Square-Version": "2025-01-23",
        Authorization: `Client ${clientSecret}`,
      },
      body: JSON.stringify({ client_id: clientId, merchant_id: merchantId }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[square] revoke failed", merchantId, err instanceof Error ? err.message : err);
    return false;
  }
}

export function encryptTokens(t: SquareTokens): {
  squareAccessTokenEnc: string;
  squareRefreshTokenEnc: string;
  squareTokenExpiresAt: Date;
} {
  return {
    squareAccessTokenEnc: encryptSecret(t.accessToken),
    squareRefreshTokenEnc: encryptSecret(t.refreshToken),
    squareTokenExpiresAt: t.expiresAt,
  };
}

/** Seller-bound SDK client, or null when the row cannot be used (no token,
 *  undecryptable, expired). */
export async function squareClientForConnection(conn: SquareConnectionLike) {
  if (!conn.squareAccessTokenEnc) return null;
  if (conn.squareTokenExpiresAt && conn.squareTokenExpiresAt.getTime() < Date.now()) return null;
  let token: string;
  try {
    token = decryptSecret(conn.squareAccessTokenEnc);
  } catch {
    return null;
  }
  return squareClientForToken(token);
}

export interface PickedLocation {
  id: string;
  name: string | null;
  currency: string | null;
  country: string | null;
}

/** First ACTIVE location that can take card payments. */
export async function pickSquareLocation(accessToken: string): Promise<PickedLocation | null> {
  const client = await squareClientForToken(accessToken);
  const res = await client.locations.list();
  const locs = res.locations ?? [];
  const usable = locs.find(
    (l) =>
      l.id &&
      (l.status ?? "ACTIVE") === "ACTIVE" &&
      (!l.capabilities || l.capabilities.includes("CREDIT_CARD_PROCESSING")),
  );
  if (!usable?.id) return null;
  return {
    id: usable.id,
    name: usable.name ?? null,
    currency: usable.currency ? String(usable.currency) : null,
    country: usable.country ? String(usable.country) : null,
  };
}

/** Delete a payment link we minted (schedule changed / disconnect). */
export async function deleteSquarePaymentLink(
  conn: SquareConnectionLike,
  linkId: string,
): Promise<"deleted" | "gone" | "unavailable"> {
  const client = await squareClientForConnection(conn);
  if (!client) return "unavailable";
  try {
    await client.checkout.paymentLinks.delete({ id: linkId });
    return "deleted";
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404) return "gone";
    console.warn("[square] delete link failed", linkId, err instanceof Error ? err.message : err);
    return "unavailable";
  }
}

export function squareEnvLabel(): "sandbox" | "production" {
  return squareEnv();
}

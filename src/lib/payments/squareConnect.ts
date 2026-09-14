// Square for a seller's account, joined one of two ways:
//   OAUTH — the platform app (raw REST — two JSON calls, no SDK quirks):
//           seller tokens refreshed by cron, app fee inside each payment.
//   TOKEN — the seller pasted a personal access token from their OWN Square
//           developer app (2026-09-13): no refresh, no expiry, no app fee (that
//           needs the platform app) — JobFlex's cut is billed on the JobFlex
//           invoice (feeBilling.ts). A webhook subscription is registered on
//           their app with the token.
// Tokens live encrypted on PaymentConnection (secretBox).
import crypto from "node:crypto";
import {
  squareAppCredentials,
  squareClientForToken,
  squareConnectBase,
  squareEnv,
  type SquareEnv,
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

/** What a pasted token is used for — the Permissions card shows this in
 *  place of OAuth scopes. A personal access token has every permission of
 *  the app it belongs to. */
export const SQUARE_TOKEN_PERMISSIONS = [
  "Merchant profile · read",
  "Locations · read",
  "Orders · write",
  "Payments · read",
  "Checkout links · write",
  "Webhook subscriptions · write",
] as const;

export interface SquareConnectionLike {
  squareAccessTokenEnc: string | null;
  squareRefreshTokenEnc: string | null;
  squareTokenExpiresAt: Date | null;
  squareLocationId: string | null;
  squareMerchantId: string | null;
  /** sandbox | production the row was joined in; the platform's when unset. */
  squareEnv?: string | null;
  /** oauth | token; null on rows from before the token path. */
  squareAuth?: string | null;
  squareWebhookId?: string | null;
}

export function squareEnvOf(conn: Pick<SquareConnectionLike, "squareEnv">): SquareEnv {
  return conn.squareEnv === "production" ? "production" : conn.squareEnv === "sandbox" ? "sandbox" : squareEnv();
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
 *  undecryptable, expired). Bound to the environment the row was joined in. */
export async function squareClientForConnection(conn: SquareConnectionLike) {
  if (!conn.squareAccessTokenEnc) return null;
  if (conn.squareTokenExpiresAt && conn.squareTokenExpiresAt.getTime() < Date.now()) return null;
  let token: string;
  try {
    token = decryptSecret(conn.squareAccessTokenEnc);
  } catch {
    return null;
  }
  return squareClientForToken(token, squareEnvOf(conn));
}

export interface PickedLocation {
  id: string;
  name: string | null;
  currency: string | null;
  country: string | null;
}

/** First ACTIVE location that can take card payments. */
export async function pickSquareLocation(accessToken: string, env: SquareEnv = squareEnv()): Promise<PickedLocation | null> {
  const client = await squareClientForToken(accessToken, env);
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

// ── The paste-a-token join ───────────────────────────────────────────────

/** Square's own words. The SDK's SquareError carries statusCode + errors[]. */
export function squareErrorMessage(err: unknown): string {
  const e = err as { statusCode?: number; message?: string; errors?: Array<{ detail?: string; code?: string }> } | null;
  const detail = e?.errors?.[0]?.detail ?? e?.errors?.[0]?.code ?? e?.message?.trim() ?? "unknown error";
  if (e?.statusCode === 401) return `Square rejected the token — ${detail}`;
  if (e?.statusCode === 403) return `The token is missing a permission JobFlex needs — ${detail}`;
  return `Square error — ${detail}`;
}

export interface ValidatedSquareToken {
  token: string;
  last4: string;
  env: SquareEnv;
  merchantId: string;
  businessName: string | null;
  country: string | null;
  currency: string | null;
  location: PickedLocation;
}

/** Ask Square whose token this is. A token is bound to one environment and
 *  does not say which, so production is tried first, then sandbox. */
export async function validateSquareToken(
  raw: string,
): Promise<{ ok: true; account: ValidatedSquareToken } | { ok: false; message: string }> {
  const token = raw.trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) {
    return { ok: false, message: "That doesn't look like a Square access token — copy the whole Production access token from your app's Credentials page." };
  }
  let lastMessage = "";
  for (const env of ["production", "sandbox"] as const) {
    try {
      const client = await squareClientForToken(token, env);
      const merchant = (await client.merchants.get({ merchantId: "me" })).merchant;
      if (!merchant?.id) throw new Error("Square returned no merchant");
      const location = await pickSquareLocation(token, env);
      if (!location) {
        return {
          ok: false,
          message: `The token works (${env}), but the account has no active location that can take card payments.`,
        };
      }
      return {
        ok: true,
        account: {
          token,
          last4: token.slice(-4),
          env,
          merchantId: merchant.id,
          businessName: merchant.businessName ?? null,
          country: merchant.country ? String(merchant.country) : location.country,
          currency: merchant.currency ? String(merchant.currency) : location.currency,
          location,
        },
      };
    } catch (err) {
      lastMessage = squareErrorMessage(err);
      const status = (err as { statusCode?: number })?.statusCode;
      if (status !== 401) return { ok: false, message: lastMessage };
    }
  }
  return { ok: false, message: `${lastMessage} (tried production and sandbox)` };
}

/** What the subscription on a token-joined app listens for — the payment and
 *  refund events the platform webhook handles. */
export const SQUARE_TOKEN_EVENTS = ["payment.created", "payment.updated", "refund.created", "refund.updated"] as const;

/** Register our endpoint on the seller's own app. The signature key comes
 *  back with the subscription. Fails soft — the portal's active verification
 *  and the reconcile cron still settle; refunds made in Square then don't sync. */
export async function registerSquareWebhook(
  token: string,
  env: SquareEnv,
  url: string,
): Promise<{ ok: true; id: string; signatureKey: string } | { ok: false; message: string }> {
  try {
    const client = await squareClientForToken(token, env);
    const res = await client.webhooks.subscriptions.create({
      idempotencyKey: crypto.randomUUID(),
      subscription: {
        name: "JobFlex — proposal payments",
        eventTypes: [...SQUARE_TOKEN_EVENTS],
        notificationUrl: url,
        apiVersion: "2025-01-23",
      },
    });
    const s = res.subscription;
    if (!s?.id || !s.signatureKey) return { ok: false, message: "Square returned no subscription" };
    return { ok: true, id: s.id, signatureKey: s.signatureKey };
  } catch (err) {
    return { ok: false, message: squareErrorMessage(err) };
  }
}

export async function removeSquareWebhook(conn: SquareConnectionLike, id: string): Promise<boolean> {
  const client = await squareClientForConnection(conn);
  if (!client) return false;
  try {
    await client.webhooks.subscriptions.delete({ subscriptionId: id });
    return true;
  } catch (err) {
    console.warn("[square-token] webhook removal failed", id, err instanceof Error ? err.message : err);
    return false;
  }
}

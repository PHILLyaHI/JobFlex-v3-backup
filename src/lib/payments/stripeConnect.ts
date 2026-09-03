// Stripe Connect — Standard accounts joined by OAuth, charged with DIRECT
// charges (platform key + `Stripe-Account` header + application_fee_amount).
// We store only the `acct_…` id and which mode it was connected in; the
// contractor's Stripe stays theirs (their fees, their disputes, their payouts).
import type Stripe from "stripe";
import { getStripeMode, stripeKeyFor, type StripeMode } from "@/lib/stripeMode";
import { stripeClientForMode } from "@/lib/sdk/stripe";

export interface StripeConnectionLike {
  stripeAccountId: string | null;
  stripeLivemode: boolean | null;
}

export function connectClientIdFor(mode: StripeMode): string | null {
  return (
    (mode === "live"
      ? process.env.STRIPE_CONNECT_CLIENT_ID
      : process.env.STRIPE_CONNECT_CLIENT_ID_TEST) || null
  );
}

/** OAuth + charging both need a key AND a client id for the current mode. */
export async function stripeConnectReady(): Promise<{
  ok: boolean;
  mode: StripeMode;
  reason?: "no_key" | "no_client_id";
}> {
  const mode = await getStripeMode();
  if (!stripeKeyFor(mode)) return { ok: false, mode, reason: "no_key" };
  if (!connectClientIdFor(mode)) return { ok: false, mode, reason: "no_client_id" };
  return { ok: true, mode };
}

export function connectAuthorizeUrl(input: {
  clientId: string;
  state: string;
  redirectUri: string;
  email?: string | null;
  businessName?: string | null;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    scope: "read_write",
    state: input.state,
    redirect_uri: input.redirectUri,
  });
  if (input.email) params.set("stripe_user[email]", input.email);
  if (input.businessName) params.set("stripe_user[business_name]", input.businessName);
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export interface ExchangedAccount {
  accountId: string;
  livemode: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  currency: string | null;
  country: string | null;
}

/** Trade the OAuth code for the connected account id, then read its flags. */
export async function exchangeConnectCode(code: string, mode: StripeMode): Promise<ExchangedAccount> {
  const stripe = stripeClientForMode(mode);
  if (!stripe) throw new Error("Stripe key missing for mode " + mode);
  const token = await stripe.oauth.token({ grant_type: "authorization_code", code });
  const accountId = token.stripe_user_id;
  if (!accountId) throw new Error("Stripe returned no stripe_user_id");
  const flags = await readAccountFlags(stripe, accountId);
  return { accountId, livemode: Boolean(token.livemode), ...flags };
}

export async function readAccountFlags(stripe: Stripe, accountId: string) {
  const acct = await stripe.accounts.retrieve(accountId);
  return {
    chargesEnabled: Boolean(acct.charges_enabled),
    detailsSubmitted: Boolean(acct.details_submitted),
    currency: acct.default_currency ? acct.default_currency.toUpperCase() : null,
    country: acct.country ?? null,
  };
}

/** The client to use for a connection: the key matching how it was joined
 *  (a test acct id means nothing to the live key), or null when that key is
 *  not configured any more. */
export function stripeForConnection(conn: StripeConnectionLike): {
  stripe: Stripe;
  accountId: string;
  mode: StripeMode;
} | null {
  if (!conn.stripeAccountId) return null;
  const mode: StripeMode = conn.stripeLivemode === false ? "test" : "live";
  const stripe = stripeClientForMode(mode);
  if (!stripe) return null;
  return { stripe, accountId: conn.stripeAccountId, mode };
}

/** Best-effort. Stripe also fires account.application.deauthorized, which
 *  the Connect webhook turns into the same row cleanup. */
export async function deauthorizeConnection(conn: StripeConnectionLike): Promise<boolean> {
  const bound = stripeForConnection(conn);
  if (!bound) return false;
  const clientId = connectClientIdFor(bound.mode);
  if (!clientId) return false;
  try {
    await bound.stripe.oauth.deauthorize({ client_id: clientId, stripe_user_id: bound.accountId });
    return true;
  } catch (err) {
    console.warn("[stripe-connect] deauthorize failed", bound.accountId, err instanceof Error ? err.message : err);
    return false;
  }
}

/** Expire an open Checkout Session on the connected account. Returns the
 *  session's final status so the caller can tell "expired" from "already
 *  paid" (which must be reconciled, not discarded). */
export async function expireStripeSession(
  conn: StripeConnectionLike,
  sessionId: string,
): Promise<"expired" | "complete" | "gone" | "unavailable"> {
  const bound = stripeForConnection(conn);
  if (!bound) return "unavailable";
  try {
    const s = await bound.stripe.checkout.sessions.retrieve(sessionId, undefined, {
      stripeAccount: bound.accountId,
    });
    if (s.status === "complete") return "complete";
    if (s.status === "expired") return "expired";
    await bound.stripe.checkout.sessions.expire(sessionId, undefined, { stripeAccount: bound.accountId });
    return "expired";
  } catch (err) {
    const code = (err as { code?: string; statusCode?: number })?.statusCode;
    if (code === 404) return "gone";
    console.warn("[stripe-connect] expire failed", sessionId, err instanceof Error ? err.message : err);
    return "unavailable";
  }
}

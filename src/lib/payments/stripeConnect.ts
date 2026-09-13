// Stripe for a contractor's account, joined one of two ways:
//   OAUTH — Connect Standard account: we store only the `acct_…` id and call
//           Stripe with the platform key + `Stripe-Account` header; DIRECT
//           charges carry application_fee_amount (JobFlex's cut).
//   KEY   — the contractor pasted their own secret / restricted key
//           (2026-09-12): AES-GCM at rest (crypto/secretBox), every call uses
//           the key itself — no header, no application fee; the cut is billed
//           on their JobFlex invoice instead (payments/feeBilling.ts).
// Either way the contractor's Stripe stays theirs: their fees, their
// disputes, their payouts.
import type Stripe from "stripe";
import { getStripeMode, stripeKeyFor, type StripeMode } from "@/lib/stripeMode";
import { stripeClientForKey, stripeClientForMode } from "@/lib/sdk/stripe";
import { decryptSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox";

export interface StripeConnectionLike {
  stripeAccountId: string | null;
  stripeLivemode: boolean | null;
  /** Set on a key join. Absent / null = OAuth join. */
  stripeKeyEnc?: string | null;
  stripeWebhookId?: string | null;
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

/** The paste-a-key path needs only somewhere safe to keep the key. */
export function stripeKeyPathReady(): boolean {
  return isSecretBoxConfigured();
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

function flagsOf(acct: Stripe.Account) {
  return {
    chargesEnabled: Boolean(acct.charges_enabled),
    detailsSubmitted: Boolean(acct.details_submitted),
    currency: acct.default_currency ? acct.default_currency.toUpperCase() : null,
    country: acct.country ?? null,
  };
}

export async function readAccountFlags(stripe: Stripe, accountId: string) {
  return flagsOf(await stripe.accounts.retrieve(accountId));
}

// ── The paste-a-key join ─────────────────────────────────────────────────

export type StripeKeyKind = "sk" | "rk";
const KEY_RE = /^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$/;
export const KEY_SHAPE_MESSAGE =
  "That doesn't look like a Stripe secret key — it starts with sk_live_, sk_test_, rk_live_ or rk_test_.";

/** Shape check only; Stripe validates for real in validateStripeKey. */
export function parseStripeKey(raw: string): { key: string; kind: StripeKeyKind; livemode: boolean } | null {
  const key = raw.trim();
  const m = KEY_RE.exec(key);
  if (!m) return null;
  return { key, kind: m[1] as StripeKeyKind, livemode: m[2] === "live" };
}

/** Stripe's own words, with the two common cases named. Never echoes the key. */
export function stripeErrorMessage(err: unknown): string {
  const e = err as { statusCode?: number; message?: string } | null;
  const msg = e?.message?.trim() || "unknown error";
  if (e?.statusCode === 401) return `Stripe rejected the key — ${msg}`;
  if (e?.statusCode === 403) return `The key is missing a permission JobFlex needs — ${msg}`;
  return `Stripe error — ${msg}`;
}

export interface ValidatedStripeKey extends ExchangedAccount {
  key: string;
  kind: StripeKeyKind;
  last4: string;
  businessName: string | null;
}

/** Ask Stripe whose key this is (GET /v1/account) and read the account's
 *  flags. A key that cannot read its own account is refused with Stripe's
 *  reason, so the contractor knows which permission to add. */
export async function validateStripeKey(
  raw: string,
): Promise<{ ok: true; account: ValidatedStripeKey; stripe: Stripe } | { ok: false; message: string }> {
  const parsed = parseStripeKey(raw);
  if (!parsed) return { ok: false, message: KEY_SHAPE_MESSAGE };
  const stripe = stripeClientForKey(parsed.key);
  let acct: Stripe.Account;
  try {
    acct = await stripe.accounts.retrieve();
  } catch (err) {
    return { ok: false, message: stripeErrorMessage(err) };
  }
  return {
    ok: true,
    stripe,
    account: {
      accountId: acct.id,
      livemode: parsed.livemode,
      ...flagsOf(acct),
      key: parsed.key,
      kind: parsed.kind,
      last4: parsed.key.slice(-4),
      businessName: acct.settings?.dashboard?.display_name ?? acct.business_profile?.name ?? null,
    },
  };
}

/** What the endpoint on a key-joined account listens for — the same events
 *  the platform Connect endpoint handles (api/webhooks/stripe-connect). */
export const KEY_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "account.updated",
] as const;

/** Register our endpoint on the contractor's account with their key. The
 *  signing secret is returned by this call only. Fails soft: the caller
 *  records "no webhook" and the portal's active verification + the reconcile
 *  cron carry payments through; refunds made in Stripe then don't sync. */
export async function registerKeyWebhook(
  stripe: Stripe,
  url: string,
): Promise<{ ok: true; id: string; secret: string } | { ok: false; message: string }> {
  try {
    const ep = await stripe.webhookEndpoints.create({
      url,
      enabled_events: [...KEY_WEBHOOK_EVENTS],
      description: "JobFlex — proposal payments",
    });
    if (!ep.secret) return { ok: false, message: "Stripe returned no signing secret" };
    return { ok: true, id: ep.id, secret: ep.secret };
  } catch (err) {
    return { ok: false, message: stripeErrorMessage(err) };
  }
}

export async function removeKeyWebhook(stripe: Stripe, id: string): Promise<boolean> {
  try {
    await stripe.webhookEndpoints.del(id);
    return true;
  } catch (err) {
    console.warn("[stripe-key] webhook removal failed", id, err instanceof Error ? err.message : err);
    return false;
  }
}

// ── Calling Stripe for a connection ──────────────────────────────────────

export interface BoundStripe {
  stripe: Stripe;
  accountId: string;
  mode: StripeMode;
  /** Per-request options: the Stripe-Account header for an OAuth join,
   *  nothing for a key join (the client IS the account). Spread into every
   *  call's options. */
  reqOpts: Stripe.RequestOptions;
  /** Joined with the contractor's own key: no application fee inside the
   *  charge — the cut is billed on the JobFlex invoice instead. */
  viaKey: boolean;
}

/** The client to use for a connection: the contractor's own key when they
 *  pasted one, else the platform key matching how the account was joined (a
 *  test acct id means nothing to the live key). Null when the key that would
 *  serve it is not available (platform key unset, TOKEN_ENCRYPTION_KEY
 *  missing or rotated). */
export function stripeForConnection(conn: StripeConnectionLike): BoundStripe | null {
  if (!conn.stripeAccountId) return null;
  const mode: StripeMode = conn.stripeLivemode === false ? "test" : "live";
  if (conn.stripeKeyEnc) {
    let key: string;
    try {
      key = decryptSecret(conn.stripeKeyEnc);
    } catch (err) {
      console.warn("[stripe-key] cannot decrypt key for", conn.stripeAccountId, err instanceof Error ? err.message : err);
      return null;
    }
    return { stripe: stripeClientForKey(key), accountId: conn.stripeAccountId, mode, reqOpts: {}, viaKey: true };
  }
  const stripe = stripeClientForMode(mode);
  if (!stripe) return null;
  return { stripe, accountId: conn.stripeAccountId, mode, reqOpts: { stripeAccount: conn.stripeAccountId }, viaKey: false };
}

/** Best-effort undo of the join. OAuth: deauthorize the app (Stripe also
 *  fires account.application.deauthorized, which the Connect webhook turns
 *  into the same row cleanup). Key: remove the webhook endpoint we
 *  registered; the key itself dies with the row. */
export async function deauthorizeConnection(conn: StripeConnectionLike): Promise<boolean> {
  const bound = stripeForConnection(conn);
  if (!bound) return false;
  if (bound.viaKey) {
    return conn.stripeWebhookId ? removeKeyWebhook(bound.stripe, conn.stripeWebhookId) : true;
  }
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
    const s = await bound.stripe.checkout.sessions.retrieve(sessionId, undefined, bound.reqOpts);
    if (s.status === "complete") return "complete";
    if (s.status === "expired") return "expired";
    await bound.stripe.checkout.sessions.expire(sessionId, undefined, bound.reqOpts);
    return "expired";
  } catch (err) {
    const code = (err as { code?: string; statusCode?: number })?.statusCode;
    if (code === 404) return "gone";
    console.warn("[stripe-connect] expire failed", sessionId, err instanceof Error ? err.message : err);
    return "unavailable";
  }
}

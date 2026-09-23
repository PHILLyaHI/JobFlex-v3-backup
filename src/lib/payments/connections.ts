// PaymentConnection reads + lifecycle (connect rows are written by the OAuth
// callbacks and by the paste-a-key actions; this module owns status,
// disconnect, revoke). Lib-level so both the settings actions and the
// soft-delete flow can call them.
import { db } from "@/lib/db";
import { PaymentConnectionStatus } from "@/lib/prismaEnums";
import { parsePaymentSettings } from "@/lib/settings";
import { getStripeMode } from "@/lib/stripeMode";
import { isSquareEnabled, squareEnv } from "@/lib/sdk/square";
import { isSecretBoxConfigured } from "@/lib/crypto/secretBox";
import { isStaxRailLive } from "./rails";
import { platformFeeBps } from "./fees";
import { connectClientIdFor, deauthorizeConnection } from "./stripeConnect";
import { removeSquareWebhook, revokeSquareToken, SQUARE_SCOPES, SQUARE_TOKEN_PERMISSIONS } from "./squareConnect";
import { removeStaxWebhooks, staxKeyFor, staxWebhookIdsOf } from "./stax";
import { expireOpenCheckoutsForOrg } from "./checkouts";
import { stripeKeyFor } from "@/lib/stripeMode";

export type Provider = "STRIPE" | "SQUARE" | "STAX";

/** What a pasted Stripe key must be allowed to do — the Permissions card
 *  shows this in place of OAuth scopes. A full secret key (sk_) has all of
 *  it; a restricted key (rk_) is built with exactly these. */
export const STRIPE_KEY_PERMISSIONS = [
  "Accounts · read",
  "Checkout Sessions · write",
  "PaymentIntents · read",
  "Charges · read",
  "Refunds · read",
  "Webhook Endpoints · write",
] as const;

/** What a Stax merchant API key is used for. */
export const STAX_KEY_PERMISSIONS = [
  "Merchant profile · read",
  "Customers · write",
  "Invoices · write",
  "Transactions · read",
  "Webhooks · write",
] as const;

export async function getConnection(organizationId: string, provider: Provider) {
  return db.paymentConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
}

export async function getConnections(organizationId: string) {
  const rows = await db.paymentConnection.findMany({ where: { organizationId } });
  return {
    stripe: rows.find((r) => r.provider === "STRIPE") ?? null,
    square: rows.find((r) => r.provider === "SQUARE") ?? null,
    stax: rows.find((r) => r.provider === "STAX") ?? null,
  };
}

export type StripeConnState =
  | "not_configured"
  | "disconnected"
  | "connected"
  | "restricted"
  | "mode_mismatch"
  | "revoked";
export type SquareConnState =
  | "not_configured"
  | "disconnected"
  | "connected"
  | "restricted"
  | "revoked"
  | "token_expired";
export type StaxConnState = "not_configured" | "disconnected" | "connected" | "restricted" | "revoked";

export interface PaymentConnectionStatusView {
  platformFeeBps: number;
  platformFeePct: number;
  stripeMode: "live" | "test";
  stripe: {
    state: StripeConnState;
    /** How the account was joined: OAuth (Connect) or a pasted API key. */
    auth: "oauth" | "key" | null;
    connectionId: string | null;
    accountId: string | null;
    livemode: boolean | null;
    chargesEnabled: boolean;
    achEnabled: boolean;
    currency: string | null;
    connectedAt: string | null;
    lastError: string | null;
    offered: boolean;
    /** OAuth: granted scopes. Key: what the key must be allowed to do. */
    scopes: string[];
    keyLast4: string | null;
    keyKind: "sk" | "rk" | null;
    /** Key join: our endpoint was registered on the account. */
    webhookRegistered: boolean;
    /** Which ways in the platform offers right now. */
    oauthOffered: boolean;
    keyOffered: boolean;
  };
  square: {
    state: SquareConnState;
    /** OAuth through the platform app, or a pasted personal access token. */
    auth: "oauth" | "token" | null;
    connectionId: string | null;
    merchantId: string | null;
    locationId: string | null;
    locationName: string | null;
    env: "sandbox" | "production";
    tokenExpiresAt: string | null;
    tokenLast4: string | null;
    connectedAt: string | null;
    lastError: string | null;
    offered: boolean;
    scopes: string[];
    /** Token join: our subscription was registered on the seller's app. */
    webhookRegistered: boolean;
    oauthOffered: boolean;
    keyOffered: boolean;
  };
  stax: {
    state: StaxConnState;
    connectionId: string | null;
    merchantId: string | null;
    merchantName: string | null;
    keyLast4: string | null;
    currency: string | null;
    connectedAt: string | null;
    lastError: string | null;
    offered: boolean;
    scopes: string[];
    webhookRegistered: boolean;
    /** The only way in: a pasted merchant API key (needs the secret box). */
    keyOffered: boolean;
  };
  bankTransfer: { enabled: boolean; instructions: string };
  connectHref: { stripe: string; square: string };
}

/** Serialisable status for the settings surface and the portal gate. */
export async function getPaymentConnectionStatus(
  organizationId: string,
): Promise<PaymentConnectionStatusView> {
  const [org, conns, mode] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { paymentSettingsJson: true },
    }),
    getConnections(organizationId),
    getStripeMode(),
  ]);
  const settings = parsePaymentSettings(org?.paymentSettingsJson);
  const box = isSecretBoxConfigured();

  // Stripe — two ways in: OAuth needs the platform key + Connect client id
  // for the current mode; a pasted key needs only the secret box. A key join
  // lives in the key's own mode, so the admin switch never mismatches it.
  const oauthOffered = Boolean(stripeKeyFor(mode) && connectClientIdFor(mode));
  const keyOffered = box;
  let stripeState: StripeConnState = oauthOffered || keyOffered ? "disconnected" : "not_configured";
  const s = conns.stripe;
  const viaKey = Boolean(s?.stripeKeyEnc);
  if (s) {
    if (s.status === PaymentConnectionStatus.REVOKED) stripeState = "revoked";
    else if (viaKey && !keyOffered) stripeState = "not_configured";
    else if (!viaKey && s.stripeLivemode !== (mode === "live")) stripeState = "mode_mismatch";
    else if (!s.stripeChargesEnabled || s.status === PaymentConnectionStatus.RESTRICTED)
      stripeState = "restricted";
    else stripeState = "connected";
  }

  // Square — OAuth needs the platform app + the secret box; a pasted personal
  // access token needs only the secret box and never expires.
  const squareOauthOffered = isSquareEnabled() && box;
  const squareKeyOffered = box;
  let squareState: SquareConnState = squareOauthOffered || squareKeyOffered ? "disconnected" : "not_configured";
  const q = conns.square;
  const squareViaToken = q?.squareAuth === "token";
  if (q) {
    if (q.status === PaymentConnectionStatus.REVOKED) squareState = "revoked";
    else if (!box) squareState = "not_configured";
    else if (!squareViaToken && !isSquareEnabled()) squareState = "not_configured";
    else if (q.squareTokenExpiresAt && q.squareTokenExpiresAt.getTime() < Date.now())
      squareState = "token_expired";
    else if (q.status === PaymentConnectionStatus.RESTRICTED) squareState = "restricted";
    else squareState = "connected";
  }

  // Stax — one way in: a pasted merchant API key — and only once the rail
  // has been proven live (lib/payments/rails). An existing row is still
  // described so it can be disconnected.
  const staxOffered = box && isStaxRailLive();
  let staxState: StaxConnState = staxOffered ? "disconnected" : "not_configured";
  const x = conns.stax;
  if (x) {
    if (x.status === PaymentConnectionStatus.REVOKED) staxState = "revoked";
    else if (!box || !x.staxApiKeyEnc) staxState = "not_configured";
    else if (x.status === PaymentConnectionStatus.RESTRICTED) staxState = "restricted";
    else staxState = "connected";
  }

  return {
    platformFeeBps: platformFeeBps(),
    platformFeePct: platformFeeBps() / 100,
    stripeMode: mode,
    stripe: {
      state: stripeState,
      auth: s ? (viaKey ? "key" : "oauth") : null,
      connectionId: s?.id ?? null,
      accountId: s?.stripeAccountId ?? null,
      livemode: s?.stripeLivemode ?? null,
      chargesEnabled: Boolean(s?.stripeChargesEnabled),
      achEnabled: Boolean(s?.stripeAchEnabled),
      currency: s?.currency ?? null,
      connectedAt: s?.connectedAt.toISOString() ?? null,
      lastError: s?.lastError ?? null,
      offered: settings.stripe,
      scopes: s ? (viaKey ? [...STRIPE_KEY_PERMISSIONS] : ["read_write"]) : [],
      keyLast4: s?.stripeKeyLast4 ?? null,
      keyKind: s?.stripeKeyKind === "rk" ? "rk" : s?.stripeKeyKind === "sk" ? "sk" : null,
      webhookRegistered: Boolean(s?.stripeWebhookId),
      oauthOffered,
      keyOffered,
    },
    square: {
      state: squareState,
      auth: q ? (squareViaToken ? "token" : "oauth") : null,
      connectionId: q?.id ?? null,
      merchantId: q?.squareMerchantId ?? null,
      locationId: q?.squareLocationId ?? null,
      locationName: q?.squareLocationName ?? null,
      env: (q?.squareEnv as "sandbox" | "production" | undefined) ?? squareEnv(),
      tokenExpiresAt: q?.squareTokenExpiresAt?.toISOString() ?? null,
      tokenLast4: q?.squareTokenLast4 ?? null,
      connectedAt: q?.connectedAt.toISOString() ?? null,
      lastError: q?.lastError ?? null,
      offered: settings.square,
      scopes: q ? (squareViaToken ? [...SQUARE_TOKEN_PERMISSIONS] : [...SQUARE_SCOPES]) : [],
      webhookRegistered: Boolean(q?.squareWebhookId),
      oauthOffered: squareOauthOffered,
      keyOffered: squareKeyOffered,
    },
    stax: {
      state: staxState,
      connectionId: x?.id ?? null,
      merchantId: x?.staxMerchantId ?? null,
      merchantName: x?.staxMerchantName ?? null,
      keyLast4: x?.staxKeyLast4 ?? null,
      currency: x?.currency ?? null,
      connectedAt: x?.connectedAt.toISOString() ?? null,
      lastError: x?.lastError ?? null,
      offered: settings.stax,
      scopes: x ? [...STAX_KEY_PERMISSIONS] : [],
      webhookRegistered: staxWebhookIdsOf({ staxWebhookIds: x?.staxWebhookIds ?? null }).length > 0,
      keyOffered: staxOffered,
    },
    bankTransfer: {
      enabled: settings.bankTransfer,
      instructions: settings.bankTransferInstructions,
    },
    connectHref: {
      stripe: "/api/integrations/stripe/connect",
      square: "/api/integrations/square/connect",
    },
  };
}

/** The provider told us the contractor removed the app. Keep the row (so the
 *  settings page can explain) but it can never charge again. */
export async function markConnectionRevoked(
  organizationId: string,
  provider: Provider,
  note?: string,
) {
  await db.paymentConnection.updateMany({
    where: { organizationId, provider },
    data: {
      status: PaymentConnectionStatus.REVOKED,
      lastError: note ?? "Access revoked from the provider dashboard",
      squareAccessTokenEnc: provider === "SQUARE" ? null : undefined,
      squareRefreshTokenEnc: provider === "SQUARE" ? null : undefined,
    },
  });
  await expireOpenCheckoutsForOrg(organizationId, provider);
}

const SETTINGS_KEY: Record<Provider, "stripe" | "square" | "stax"> = {
  STRIPE: "stripe",
  SQUARE: "square",
  STAX: "stax",
};

/** Offer / hide a provider at checkout (paymentSettingsJson.stripe / .square / .stax). */
export async function setProviderOfferedFor(organizationId: string, provider: Provider, on: boolean) {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { paymentSettingsJson: true },
  });
  const current = parsePaymentSettings(org?.paymentSettingsJson);
  await db.organization.update({
    where: { id: organizationId },
    data: {
      paymentSettingsJson: JSON.stringify({
        ...current,
        [SETTINGS_KEY[provider]]: on,
      }),
    },
  });
}

/** Full disconnect: release open checkouts → undo the join at Stripe (OAuth:
 *  deauthorize the app; key: remove our webhook endpoint) → drop the row,
 *  and with it the encrypted key. */
export async function disconnectStripeConnectFor(organizationId: string): Promise<{
  ok: true;
  deauthorized: boolean;
}> {
  const conn = await getConnection(organizationId, "STRIPE");
  if (!conn) return { ok: true, deauthorized: false };
  await expireOpenCheckoutsForOrg(organizationId, "STRIPE");
  const deauthorized =
    conn.status === PaymentConnectionStatus.REVOKED ? false : await deauthorizeConnection(conn);
  await db.paymentConnection.delete({ where: { id: conn.id } });
  await setProviderOfferedFor(organizationId, "STRIPE", false);
  return { ok: true, deauthorized };
}

/** OAuth: revoke our tokens at Square. Token join: remove the webhook
 *  subscription we registered on the seller's app; the token dies with the row. */
export async function disconnectSquareFor(organizationId: string): Promise<{
  ok: true;
  revoked: boolean;
}> {
  const conn = await getConnection(organizationId, "SQUARE");
  if (!conn) return { ok: true, revoked: false };
  await expireOpenCheckoutsForOrg(organizationId, "SQUARE");
  let revoked = false;
  if (conn.status !== PaymentConnectionStatus.REVOKED) {
    if (conn.squareAuth === "token") {
      revoked = conn.squareWebhookId ? await removeSquareWebhook(conn, conn.squareWebhookId) : true;
    } else if (conn.squareMerchantId) {
      revoked = await revokeSquareToken(conn.squareMerchantId);
    }
  }
  await db.paymentConnection.delete({ where: { id: conn.id } });
  await setProviderOfferedFor(organizationId, "SQUARE", false);
  return { ok: true, revoked };
}

/** Remove the webhooks we registered with the merchant's key, drop the row. */
export async function disconnectStaxFor(organizationId: string): Promise<{ ok: true; revoked: boolean }> {
  const conn = await getConnection(organizationId, "STAX");
  if (!conn) return { ok: true, revoked: false };
  await expireOpenCheckoutsForOrg(organizationId, "STAX");
  const key = staxKeyFor(conn);
  const ids = staxWebhookIdsOf(conn);
  const revoked = key && ids.length ? await removeStaxWebhooks(key, ids) : true;
  await db.paymentConnection.delete({ where: { id: conn.id } });
  await setProviderOfferedFor(organizationId, "STAX", false);
  return { ok: true, revoked };
}

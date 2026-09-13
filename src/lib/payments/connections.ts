// PaymentConnection reads + lifecycle (connect rows are written by the OAuth
// callbacks and by connectStripeWithKey; this module owns status, disconnect,
// revoke). Lib-level so both the settings actions and the soft-delete flow
// can call them.
import { db } from "@/lib/db";
import { PaymentConnectionStatus } from "@/lib/prismaEnums";
import { parsePaymentSettings } from "@/lib/settings";
import { getStripeMode } from "@/lib/stripeMode";
import { isSquareEnabled, squareEnv } from "@/lib/sdk/square";
import { isSecretBoxConfigured } from "@/lib/crypto/secretBox";
import { platformFeeBps } from "./fees";
import { connectClientIdFor, deauthorizeConnection } from "./stripeConnect";
import { revokeSquareToken, SQUARE_SCOPES } from "./squareConnect";
import { expireOpenCheckoutsForOrg } from "./checkouts";
import { stripeKeyFor } from "@/lib/stripeMode";

export type Provider = "STRIPE" | "SQUARE";

/** What a pasted key must be allowed to do — the Permissions card shows this
 *  in place of OAuth scopes. A full secret key (sk_) has all of it; a
 *  restricted key (rk_) is built with exactly these. */
export const STRIPE_KEY_PERMISSIONS = [
  "Checkout Sessions · write",
  "PaymentIntents · read",
  "Charges · read",
  "Refunds · read",
  "Webhook Endpoints · write",
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
    merchantId: string | null;
    locationId: string | null;
    locationName: string | null;
    env: "sandbox" | "production";
    tokenExpiresAt: string | null;
    connectedAt: string | null;
    lastError: string | null;
    offered: boolean;
    scopes: string[];
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

  // Two ways in: OAuth needs the platform key + Connect client id for the
  // current mode; a pasted key needs only the secret box. A key join lives in
  // the key's own mode, so the admin switch never mismatches it.
  const oauthOffered = Boolean(stripeKeyFor(mode) && connectClientIdFor(mode));
  const keyOffered = isSecretBoxConfigured();
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

  const squareConfigured = isSquareEnabled() && isSecretBoxConfigured();
  let squareState: SquareConnState = squareConfigured ? "disconnected" : "not_configured";
  const q = conns.square;
  if (q) {
    if (q.status === PaymentConnectionStatus.REVOKED) squareState = "revoked";
    else if (!isSecretBoxConfigured()) squareState = "not_configured";
    else if (q.squareTokenExpiresAt && q.squareTokenExpiresAt.getTime() < Date.now())
      squareState = "token_expired";
    else if (q.status === PaymentConnectionStatus.RESTRICTED) squareState = "restricted";
    else squareState = "connected";
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
      merchantId: q?.squareMerchantId ?? null,
      locationId: q?.squareLocationId ?? null,
      locationName: q?.squareLocationName ?? null,
      env: (q?.squareEnv as "sandbox" | "production" | undefined) ?? squareEnv(),
      tokenExpiresAt: q?.squareTokenExpiresAt?.toISOString() ?? null,
      connectedAt: q?.connectedAt.toISOString() ?? null,
      lastError: q?.lastError ?? null,
      offered: settings.square,
      scopes: q ? [...SQUARE_SCOPES] : [],
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

/** Offer / hide a provider at checkout (paymentSettingsJson.stripe / .square). */
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
        [provider === "STRIPE" ? "stripe" : "square"]: on,
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

export async function disconnectSquareFor(organizationId: string): Promise<{
  ok: true;
  revoked: boolean;
}> {
  const conn = await getConnection(organizationId, "SQUARE");
  if (!conn) return { ok: true, revoked: false };
  await expireOpenCheckoutsForOrg(organizationId, "SQUARE");
  const revoked =
    conn.status === PaymentConnectionStatus.REVOKED || !conn.squareMerchantId
      ? false
      : await revokeSquareToken(conn.squareMerchantId);
  await db.paymentConnection.delete({ where: { id: conn.id } });
  await setProviderOfferedFor(organizationId, "SQUARE", false);
  return { ok: true, revoked };
}

// PaymentConnection reads + lifecycle (connect rows are written by the OAuth
// callbacks; this module owns status, disconnect, revoke). Lib-level so both
// the settings actions and the soft-delete flow can call them.
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
    accountId: string | null;
    livemode: boolean | null;
    chargesEnabled: boolean;
    achEnabled: boolean;
    currency: string | null;
    connectedAt: string | null;
    lastError: string | null;
    offered: boolean;
    scopes: string[];
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

  const stripeConfigured = Boolean(stripeKeyFor(mode) && connectClientIdFor(mode));
  let stripeState: StripeConnState = stripeConfigured ? "disconnected" : "not_configured";
  const s = conns.stripe;
  if (s) {
    if (s.status === PaymentConnectionStatus.REVOKED) stripeState = "revoked";
    else if (s.stripeLivemode !== (mode === "live")) stripeState = "mode_mismatch";
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
      accountId: s?.stripeAccountId ?? null,
      livemode: s?.stripeLivemode ?? null,
      chargesEnabled: Boolean(s?.stripeChargesEnabled),
      achEnabled: Boolean(s?.stripeAchEnabled),
      currency: s?.currency ?? null,
      connectedAt: s?.connectedAt.toISOString() ?? null,
      lastError: s?.lastError ?? null,
      offered: settings.stripe,
      scopes: s ? ["read_write"] : [],
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

async function setOffered(organizationId: string, provider: Provider, on: boolean) {
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

/** Full disconnect: release open checkouts → deauthorize at Stripe → drop row. */
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
  await setOffered(organizationId, "STRIPE", false);
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
  await setOffered(organizationId, "SQUARE", false);
  return { ok: true, revoked };
}

"use server";
// Settings → Payments: connection lifecycle + the two org-level toggles that
// live next to it. Connecting by OAuth is a redirect (route handlers under
// /api/integrations/{stripe,square}); connecting Stripe with a pasted key is
// connectStripeWithKey below; everything else is here. Owner-only — this is
// the money.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { parsePaymentSettings } from "@/lib/settings";
import { encryptSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox";
import { ActivityKind, PaymentConnectionStatus } from "@/lib/prismaEnums";
import { enforceRateLimit, RateLimitError, MINUTE } from "@/lib/rateLimit";
import {
  disconnectSquareFor,
  disconnectStaxFor,
  disconnectStripeConnectFor,
  getConnection,
  setProviderOfferedFor,
} from "@/lib/payments/connections";
import {
  deauthorizeConnection,
  registerKeyWebhook,
  stripeKeyPathReady,
  STRIPE_ACCOUNT_TAKEN,
  stripeAccountHeldElsewhere,
  validateStripeKey,
} from "@/lib/payments/stripeConnect";
import {
  registerSquareWebhook,
  removeSquareWebhook,
  revokeSquareToken,
  validateSquareToken,
} from "@/lib/payments/squareConnect";
import {
  newStaxWebhookSecret,
  registerStaxWebhooks,
  removeStaxWebhooks,
  staxKeyFor,
  staxWebhookIdsOf,
  staxWebhookUrl,
  validateStaxKey,
} from "@/lib/payments/stax";

const SETTINGS = "/dashboard/settings";

const keySchema = z.string().trim().min(20).max(400);
const NO_BOX = "Key storage isn't set up on this platform yet (TOKEN_ENCRYPTION_KEY).";

// Shared across providers and server instances. Neither switching providers
// nor switching workspaces should let one user hammer credential validation.
async function keyAttemptLimit(ctx: Awaited<ReturnType<typeof requireOwner>>): Promise<string | null> {
  try {
    await enforceRateLimit(`payment-key:user:${ctx.user.id}`, 10, 10 * MINUTE, "connection attempts");
    await enforceRateLimit(`payment-key:org:${ctx.organizationId}`, 10, 10 * MINUTE, "connection attempts");
    return null;
  } catch (err) {
    if (err instanceof RateLimitError) return err.message;
    throw err;
  }
}

/** What every paste-a-key action answers with: the form reads `ok`,
 *  `message` and `webhook`; the rest is for the activity line. */
export type KeyConnectResult =
  | { ok: true; state: "connected" | "restricted"; label: string; webhook: boolean; webhookError: string | null }
  | { ok: false; message: string };

export type ConnectWithKeyResult = KeyConnectResult;

/** "Use API key": the contractor pastes their own Stripe secret / restricted
 *  key. Checked against Stripe, stored encrypted, and a webhook endpoint is
 *  registered on their account with it. Replaces an OAuth join if one
 *  exists. Returns safe, actionable messages without exposing provider
 *  response bodies or request credentials. */
export async function connectStripeWithKey(raw: unknown): Promise<KeyConnectResult> {
  const ctx = await requireOwner();
  const limited = await keyAttemptLimit(ctx);
  if (limited) return { ok: false, message: limited };
  const parsed = keySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Paste the whole key." };
  if (!stripeKeyPathReady()) return { ok: false, message: NO_BOX };
  const v = await validateStripeKey(parsed.data);
  if (!v.ok) return v;
  const a = v.account;
  if (await stripeAccountHeldElsewhere(a.accountId, ctx.organizationId)) return { ok: false, message: STRIPE_ACCOUNT_TAKEN };

  // One Stripe row per org: an earlier join (the OAuth app link, or a
  // previous key's webhook) is undone first.
  const existing = await getConnection(ctx.organizationId, "STRIPE");
  if (existing && existing.status !== PaymentConnectionStatus.REVOKED) await deauthorizeConnection(existing);

  const data = {
    status: a.chargesEnabled ? PaymentConnectionStatus.ACTIVE : PaymentConnectionStatus.RESTRICTED,
    stripeAccountId: a.accountId,
    stripeLivemode: a.livemode,
    stripeChargesEnabled: a.chargesEnabled,
    stripeDetailsSubmitted: a.detailsSubmitted,
    stripeKeyEnc: encryptSecret(a.key),
    stripeKeyKind: a.kind,
    stripeKeyLast4: a.last4,
    stripeWebhookId: null,
    stripeWebhookSecretEnc: null,
    currency: a.currency,
    country: a.country,
    lastError: null,
    connectedByUserId: ctx.user.id,
    connectedAt: new Date(),
  };
  const row = await db.paymentConnection.upsert({
    where: { organizationId_provider: { organizationId: ctx.organizationId, provider: "STRIPE" } },
    create: { organizationId: ctx.organizationId, provider: "STRIPE", ...data },
    update: data,
  });

  const hook = await registerKeyWebhook(v.stripe, `${await appBaseUrl()}/api/webhooks/stripe-key/${row.id}`);
  if (hook.ok) {
    await db.paymentConnection.update({
      where: { id: row.id },
      data: { stripeWebhookId: hook.id, stripeWebhookSecretEnc: encryptSecret(hook.secret) },
    });
  } else {
    console.warn("[stripe-key] webhook registration failed for", row.id, hook.message);
  }

  await setProviderOfferedFor(ctx.organizationId, "STRIPE", true);
  await db.activityEvent.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.user.id,
      kind: ActivityKind.PAYMENT_CONNECTED,
      summary: `Stripe connected with an API key (${a.accountId}${a.livemode ? "" : ", test mode"})`,
    },
  });
  revalidatePath(SETTINGS);
  return {
    ok: true,
    state: a.chargesEnabled ? "connected" : "restricted",
    label: `${a.accountId}${a.livemode ? "" : " (test mode)"}`,
    webhook: hook.ok,
    webhookError: hook.ok ? null : hook.message,
  };
}

/** "Use access token": the seller pastes a personal access token from their
 *  own Square developer app. Checked against Square (production, then
 *  sandbox), stored encrypted with the first usable location, and a webhook
 *  subscription is registered on their app with it. Replaces an OAuth join. */
export async function connectSquareWithToken(raw: unknown): Promise<KeyConnectResult> {
  const ctx = await requireOwner();
  const limited = await keyAttemptLimit(ctx);
  if (limited) return { ok: false, message: limited };
  const parsed = keySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Paste the whole access token." };
  if (!isSecretBoxConfigured()) return { ok: false, message: NO_BOX };
  const v = await validateSquareToken(parsed.data);
  if (!v.ok) return v;
  const a = v.account;

  const existing = await getConnection(ctx.organizationId, "SQUARE");
  if (existing && existing.status !== PaymentConnectionStatus.REVOKED) {
    if (existing.squareAuth === "token") {
      if (existing.squareWebhookId) await removeSquareWebhook(existing, existing.squareWebhookId);
    } else if (existing.squareMerchantId) {
      await revokeSquareToken(existing.squareMerchantId);
    }
  }

  const data = {
    status: PaymentConnectionStatus.ACTIVE,
    squareAuth: "token",
    squareMerchantId: a.merchantId,
    squareLocationId: a.location.id,
    squareLocationName: a.location.name ?? a.businessName,
    squareEnv: a.env,
    squareAccessTokenEnc: encryptSecret(a.token),
    squareRefreshTokenEnc: null,
    squareTokenExpiresAt: null,
    squareTokenLast4: a.last4,
    squareWebhookId: null,
    squareWebhookSignatureKeyEnc: null,
    currency: a.currency,
    country: a.country,
    lastError: null,
    connectedByUserId: ctx.user.id,
    connectedAt: new Date(),
  };
  const row = await db.paymentConnection.upsert({
    where: { organizationId_provider: { organizationId: ctx.organizationId, provider: "SQUARE" } },
    create: { organizationId: ctx.organizationId, provider: "SQUARE", ...data },
    update: data,
  });

  const hook = await registerSquareWebhook(a.token, a.env, `${await appBaseUrl()}/api/webhooks/square-key/${row.id}`);
  if (hook.ok) {
    await db.paymentConnection.update({
      where: { id: row.id },
      data: { squareWebhookId: hook.id, squareWebhookSignatureKeyEnc: encryptSecret(hook.signatureKey) },
    });
  } else {
    console.warn("[square-token] webhook registration failed for", row.id, hook.message);
  }

  await setProviderOfferedFor(ctx.organizationId, "SQUARE", true);
  await db.activityEvent.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.user.id,
      kind: ActivityKind.PAYMENT_CONNECTED,
      summary: `Square connected with an access token (${a.location.name ?? a.merchantId}${a.env === "sandbox" ? ", sandbox" : ""})`,
    },
  });
  revalidatePath(SETTINGS);
  return {
    ok: true,
    state: "connected",
    label: `${a.location.name ?? a.merchantId}${a.env === "sandbox" ? " (sandbox)" : ""}`,
    webhook: hook.ok,
    webhookError: hook.ok ? null : hook.message,
  };
}

/** "Use API key" for Stax: the contractor pastes their merchant API key.
 *  Checked against Stax (GET /self), stored encrypted, and one webhook per
 *  event registered with it — the target URL carries a random secret because
 *  Stax signs nothing. Built without a Stax account to test against. */
export async function connectStaxWithKey(raw: unknown): Promise<KeyConnectResult> {
  const ctx = await requireOwner();
  const limited = await keyAttemptLimit(ctx);
  if (limited) return { ok: false, message: limited };
  const parsed = keySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Paste the whole key." };
  if (!isSecretBoxConfigured()) return { ok: false, message: NO_BOX };
  const v = await validateStaxKey(parsed.data);
  if (!v.ok) return v;
  const a = v.account;

  const existing = await getConnection(ctx.organizationId, "STAX");
  if (existing) {
    const oldKey = staxKeyFor(existing);
    const ids = staxWebhookIdsOf(existing);
    if (oldKey && ids.length) await removeStaxWebhooks(oldKey, ids);
  }

  const secret = newStaxWebhookSecret();
  const active = !a.status || a.status.toUpperCase() === "ACTIVE";
  const data = {
    status: active ? PaymentConnectionStatus.ACTIVE : PaymentConnectionStatus.RESTRICTED,
    staxApiKeyEnc: encryptSecret(a.key),
    staxKeyLast4: a.last4,
    staxMerchantId: a.merchantId,
    staxMerchantName: a.merchantName,
    staxWebhookIds: null,
    staxWebhookSecretEnc: encryptSecret(secret),
    currency: a.currency,
    lastError: active ? null : `Stax reports the merchant as ${a.status}`,
    connectedByUserId: ctx.user.id,
    connectedAt: new Date(),
  };
  const row = await db.paymentConnection.upsert({
    where: { organizationId_provider: { organizationId: ctx.organizationId, provider: "STAX" } },
    create: { organizationId: ctx.organizationId, provider: "STAX", ...data },
    update: data,
  });

  const hooks = await registerStaxWebhooks(a.key, staxWebhookUrl(await appBaseUrl(), row.id, secret));
  if (hooks.ids.length) {
    await db.paymentConnection.update({ where: { id: row.id }, data: { staxWebhookIds: JSON.stringify(hooks.ids) } });
  }
  if (!hooks.ok) console.warn("[stax] webhook registration failed for", row.id, hooks.message);

  await setProviderOfferedFor(ctx.organizationId, "STAX", true);
  await db.activityEvent.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.user.id,
      kind: ActivityKind.PAYMENT_CONNECTED,
      summary: `Stax connected with an API key (${a.merchantName ?? a.merchantId})`,
    },
  });
  revalidatePath(SETTINGS);
  return {
    ok: true,
    state: active ? "connected" : "restricted",
    label: a.merchantName ?? a.merchantId,
    webhook: hooks.ok,
    webhookError: hooks.ok ? null : hooks.message,
  };
}

export async function disconnectStax() {
  const ctx = await requireOwner();
  const res = await disconnectStaxFor(ctx.organizationId);
  await db.activityEvent.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.user.id,
      kind: ActivityKind.PAYMENT_DISCONNECTED,
      summary: "Stax disconnected",
    },
  });
  revalidatePath(SETTINGS);
  return res;
}

export async function disconnectStripeConnect() {
  const ctx = await requireOwner();
  const res = await disconnectStripeConnectFor(ctx.organizationId);
  await db.activityEvent.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.user.id,
      kind: ActivityKind.PAYMENT_DISCONNECTED,
      summary: "Stripe disconnected",
    },
  });
  revalidatePath(SETTINGS);
  return res;
}

export async function disconnectSquare() {
  const ctx = await requireOwner();
  const res = await disconnectSquareFor(ctx.organizationId);
  await db.activityEvent.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.user.id,
      kind: ActivityKind.PAYMENT_DISCONNECTED,
      summary: "Square disconnected",
    },
  });
  revalidatePath(SETTINGS);
  return res;
}

/** "Accept ACH bank debits" — adds us_bank_account to the contractor's
 *  Stripe Checkout. Needs a Stripe connection to mean anything. */
export async function setStripeAchEnabled(raw: unknown) {
  const { organizationId } = await requireOwner();
  const enabled = z.boolean().parse(raw);
  const conn = await getConnection(organizationId, "STRIPE");
  if (!conn) throw new Error("Connect Stripe first");
  await db.paymentConnection.update({
    where: { id: conn.id },
    data: { stripeAchEnabled: enabled },
  });
  revalidatePath(SETTINGS);
  return { ok: true, enabled };
}

/** Offer/hide a connected provider at checkout without disconnecting it. */
const offeredSchema = z.object({
  provider: z.enum(["stripe", "square", "stax"]),
  offered: z.boolean(),
});
export async function setProviderOffered(raw: unknown) {
  const { organizationId } = await requireOwner();
  const { provider, offered } = offeredSchema.parse(raw);
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { paymentSettingsJson: true },
  });
  const current = parsePaymentSettings(org?.paymentSettingsJson);
  await db.organization.update({
    where: { id: organizationId },
    data: { paymentSettingsJson: JSON.stringify({ ...current, [provider]: offered }) },
  });
  revalidatePath(SETTINGS);
  return { ok: true };
}

const bankSchema = z.object({
  enabled: z.boolean(),
  instructions: z.string().trim().max(1000),
});
/** Manual path: bank details the client sees on an accepted proposal. */
export async function saveBankTransferSettings(raw: unknown) {
  const { organizationId } = await requireOwner();
  const data = bankSchema.parse(raw);
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
        bankTransfer: data.enabled && data.instructions.length > 0,
        bankTransferInstructions: data.instructions,
      }),
    },
  });
  revalidatePath(SETTINGS);
  return { ok: true };
}

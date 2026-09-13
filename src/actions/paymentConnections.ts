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
import { encryptSecret } from "@/lib/crypto/secretBox";
import { ActivityKind, PaymentConnectionStatus } from "@/lib/prismaEnums";
import {
  disconnectSquareFor,
  disconnectStripeConnectFor,
  getConnection,
  setProviderOfferedFor,
} from "@/lib/payments/connections";
import {
  deauthorizeConnection,
  registerKeyWebhook,
  stripeKeyPathReady,
  validateStripeKey,
} from "@/lib/payments/stripeConnect";

const SETTINGS = "/dashboard/settings";

const keySchema = z.string().trim().min(20).max(200);

export type ConnectWithKeyResult =
  | {
      ok: true;
      state: "connected" | "restricted";
      accountId: string;
      livemode: boolean;
      webhook: boolean;
      webhookError: string | null;
    }
  | { ok: false; message: string };

/** "Use API key": the contractor pastes their own Stripe secret / restricted
 *  key. Checked against Stripe, stored encrypted, and a webhook endpoint is
 *  registered on their account with it. Replaces an OAuth join if one
 *  exists. Answers with an envelope, not a throw — production redacts thrown
 *  messages, and Stripe's reason is the whole point. */
export async function connectStripeWithKey(raw: unknown): Promise<ConnectWithKeyResult> {
  const ctx = await requireOwner();
  const parsed = keySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Paste the whole key." };
  if (!stripeKeyPathReady()) {
    return { ok: false, message: "Key storage isn't set up on this platform yet (TOKEN_ENCRYPTION_KEY)." };
  }
  const v = await validateStripeKey(parsed.data);
  if (!v.ok) return v;
  const a = v.account;

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
    accountId: a.accountId,
    livemode: a.livemode,
    webhook: hook.ok,
    webhookError: hook.ok ? null : hook.message,
  };
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
  provider: z.enum(["stripe", "square"]),
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

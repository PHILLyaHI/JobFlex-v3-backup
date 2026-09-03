"use server";
// Settings → Payments: connection lifecycle + the two org-level toggles that
// live next to it. Connecting is an OAuth redirect (route handlers under
// /api/integrations/{stripe,square}); everything else is here. Owner-only —
// this is the money.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { parsePaymentSettings } from "@/lib/settings";
import { ActivityKind } from "@/lib/prismaEnums";
import {
  disconnectSquareFor,
  disconnectStripeConnectFor,
  getConnection,
} from "@/lib/payments/connections";

const SETTINGS = "/dashboard/settings";

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

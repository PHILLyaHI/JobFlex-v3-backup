"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";

// Org-level settings persistence. Each action validates its slice with zod and
// writes it as a JSON-as-String column on Organization. Mirrors the canonical
// company.ts pattern (requireOrg → parse → organization.update → revalidatePath).

const paymentSchema = z.object({
  stripe: z.boolean(),
  square: z.boolean(),
  paypal: z.boolean(),
  ach: z.boolean(),
  autoRemind: z.boolean(),
  lateFees: z.boolean(),
  receiptsOnPayment: z.boolean(),
  currency: z.string(),
  depositPct: z.number(),
  netTerms: z.string(),
  lateFeePct: z.string(),
});

export async function updatePaymentSettings(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = paymentSchema.parse(raw);
  await db.organization.update({
    where: { id: organizationId },
    data: { paymentSettingsJson: JSON.stringify(data) },
  });
  revalidatePath("/dashboard/settings/payment");
  return { ok: true };
}

const leadsSchema = z.object({
  strategy: z.enum(["round-robin", "first-come", "territory", "manual"]),
  aiCategorize: z.boolean(),
  instantSms: z.boolean(),
  businessHours: z.boolean(),
  autoDeclineDupes: z.boolean(),
  zips: z.string(),
  travelRadius: z.number(),
  outsidePolicy: z.string(),
  maxPerDay: z.number(),
  maxPerRep: z.number(),
  smartPrompt: z.string(),
});

export async function updateLeadsSettings(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = leadsSchema.parse(raw);
  await db.organization.update({
    where: { id: organizationId },
    data: { leadsSettingsJson: JSON.stringify(data) },
  });
  revalidatePath("/dashboard/settings/leads");
  return { ok: true };
}

const gmailSchema = z.object({
  connected: z.boolean(),
  sendFromUser: z.boolean(),
  trackOpens: z.boolean(),
  autoSync: z.boolean(),
  displayName: z.string(),
  replyTo: z.string(),
  signature: z.string(),
});

export async function updateGmailSettings(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = gmailSchema.parse(raw);
  await db.organization.update({
    where: { id: organizationId },
    data: { gmailSettingsJson: JSON.stringify(data) },
  });
  revalidatePath("/dashboard/settings/gmail");
  return { ok: true };
}

const metaSchema = z.object({
  connected: z.boolean(),
  autoCreate: z.boolean(),
  autoText: z.boolean(),
  defaultPage: z.string(),
  formCategory: z.string(),
});

export async function updateMetaSettings(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = metaSchema.parse(raw);
  await db.organization.update({
    where: { id: organizationId },
    data: { metaSettingsJson: JSON.stringify(data) },
  });
  revalidatePath("/dashboard/settings/meta");
  return { ok: true };
}

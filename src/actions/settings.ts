"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { parseGmailSettings, parsePaymentSettings } from "@/lib/settings";
import { renderEmail } from "@/lib/email/renderEmail";
import { buildTestEmail } from "@/lib/email/build/platform";
import { sendOrgEmail } from "@/lib/email/orgSend";

// Org-level settings persistence. Each action validates its slice with zod and
// writes it as a JSON-as-String column on Organization. Mirrors the canonical
// company.ts pattern (requireOrg → parse → organization.update → revalidatePath).

// Only the slice the Payments pane still edits. Provider on/off and bank
// transfer live in src/actions/paymentConnections.ts; the write MERGES over
// the stored blob so those (and any legacy keys) survive a save from here.
const paymentSchema = z.object({
  currency: z.string().trim().max(8),
  depositPct: z.number().min(0).max(100),
  receiptsOnPayment: z.boolean(),
});

export async function updatePaymentSettings(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = paymentSchema.parse(raw);
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { paymentSettingsJson: true },
  });
  const current = parsePaymentSettings(org?.paymentSettingsJson);
  await db.organization.update({
    where: { id: organizationId },
    data: { paymentSettingsJson: JSON.stringify({ ...current, ...data }) },
  });
  revalidatePath("/dashboard/settings");
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
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { gmailSettingsJson: true },
  });
  const current = parseGmailSettings(org?.gmailSettingsJson);
  // The connection state is owned by the OAuth callback / disconnect — the
  // settings form only edits preferences and must never flip it.
  const merged = {
    ...current,
    ...data,
    connected: current.connected,
    connectedEmail: current.connectedEmail,
  };
  await db.organization.update({
    where: { id: organizationId },
    data: { gmailSettingsJson: JSON.stringify(merged) },
  });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

// Sends a real test email to the signed-in manager, through whichever transport
// is active (connected Gmail, else Resend). Confirms the whole pipeline works.
export async function sendGmailTestEmail() {
  const { organizationId, user } = await requireManager();
  const to = user.email;
  if (!to) throw new Error("Your account has no email address.");
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      logoUrl: true,
      phone: true,
      gmailSettingsJson: true,
      gmailTokensJson: true,
      billingEmail: true,
    },
  });
  if (!org) throw new Error("Organization not found.");
  const { subject, html } = renderEmail(
    buildTestEmail({ org: { name: org.name, logoUrl: org.logoUrl, phone: org.phone } }),
  );
  const res = await sendOrgEmail(org, { to, subject, html });
  return { ok: true, via: res.via, to };
}

// Revokes the org's Gmail connection: drops the stored tokens and flips the
// settings back to disconnected. New sends fall back to Resend + reply-to.
export async function disconnectGmail() {
  const { organizationId } = await requireManager();
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { gmailSettingsJson: true },
  });
  const current = parseGmailSettings(org?.gmailSettingsJson);
  await db.organization.update({
    where: { id: organizationId },
    data: {
      gmailTokensJson: null,
      gmailSettingsJson: JSON.stringify({ ...current, connected: false, connectedEmail: "" }),
    },
  });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

// Org-wide default profit markup (hidden from the client). These are real
// Organization columns (not JSON) — seeded into every new proposal and applied
// by the estimators. 0% keeps current behaviour. min(0) blocks negative markup
// (which would sell below cost); the ceiling is a sanity guard, not a rule.
const proposalDefaultsSchema = z.object({
  materialMarkupPct: z.number().finite().min(0).max(1000),
  laborMarkupPct: z.number().finite().min(0).max(1000),
  // Default sales tax, stored as a FRACTION 0-1 (0.08 = 8%) to match
  // Proposal.taxRate. The settings UI collects a percent and divides by 100.
  defaultTaxRate: z.number().finite().min(0).max(1),
});

export async function updateProposalDefaults(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = proposalDefaultsSchema.parse(raw);
  await db.organization.update({
    where: { id: organizationId },
    data: {
      materialMarkupPct: data.materialMarkupPct,
      laborMarkupPct: data.laborMarkupPct,
      defaultTaxRate: data.defaultTaxRate,
    },
  });
  revalidatePath("/dashboard/settings/proposals");
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

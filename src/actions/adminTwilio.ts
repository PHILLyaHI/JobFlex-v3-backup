"use server";

// ADMIN · TWILIO (2026-09-24): the platform's texting set up once for every
// contractor. Save the account, check it against Twilio for real, text a
// test to a number, clear it. Platform admin only. The token is written only
// when typed — a blank keeps the stored one — and is never sent back to the
// page in full.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { toE164 } from "@/lib/phone";
import { canStoreIntegrations, clearTwilioIntegration, getTwilioIntegration, saveTwilioIntegration } from "@/lib/platformIntegrations";
import { invalidateTwilioSettings, twilioClient, twilioSettings } from "@/lib/sdk/twilio";
import { testText } from "@/lib/sms/format";
import { sendText } from "@/lib/sms/send";

const PAGE = "/admin/integrations/twilio";

export type AdminTwilioResult = { ok: true; note: string } | { ok: false; error: string };

const settingsInput = z.object({
  accountSid: z.string().trim().regex(/^AC[0-9a-fA-F]{32}$/, "The Account SID starts with AC and is 34 characters."),
  authToken: z.string().trim().optional(),
  messagingServiceSid: z.string().trim().regex(/^(MG[0-9a-fA-F]{32})?$/, "The Messaging Service SID starts with MG and is 34 characters."),
  fromNumber: z.string().trim(),
  enabled: z.boolean(),
});

export async function saveTwilioSettings(raw: unknown): Promise<AdminTwilioResult> {
  const admin = await requirePlatformAdmin();
  if (!canStoreIntegrations()) return { ok: false, error: "Set TOKEN_ENCRYPTION_KEY on the server first (openssl rand -base64 32) — the token is stored encrypted." };
  const parsed = settingsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  const d = parsed.data;
  const fromNumber = d.fromNumber ? toE164(d.fromNumber) : null;
  if (d.fromNumber && !fromNumber) return { ok: false, error: "The number must be a US or Canadian number, like +12065550100." };
  if (!d.messagingServiceSid && !fromNumber) return { ok: false, error: "Give a Messaging Service SID (preferred) or a sending number." };
  const current = await getTwilioIntegration();
  const authToken = d.authToken || current?.authToken || "";
  if (!authToken) return { ok: false, error: "Paste the Auth Token." };
  await saveTwilioIntegration({ accountSid: d.accountSid, authToken, messagingServiceSid: d.messagingServiceSid || null, fromNumber, enabled: d.enabled }, admin.id);
  invalidateTwilioSettings();
  revalidatePath(PAGE);
  revalidatePath("/admin/integrations");
  revalidatePath("/admin/health");
  return { ok: true, note: d.enabled ? "Saved. Texting runs on these settings for every contractor within a minute." : "Saved and paused — nothing is texted until it is enabled." };
}

/** A real round trip: the account, the Messaging Service, the number. */
export async function checkTwilioCredentials(): Promise<AdminTwilioResult> {
  await requirePlatformAdmin();
  invalidateTwilioSettings();
  const s = await twilioSettings();
  if (!s) return { ok: false, error: "Nothing to check — save the settings first." };
  try {
    const client = await twilioClient(s);
    const account = await client.api.v2010.accounts(s.accountSid).fetch();
    const parts = [`Account "${account.friendlyName}" is ${account.status}`];
    if (s.messagingServiceSid) {
      const svc = await client.messaging.v1.services(s.messagingServiceSid).fetch();
      const senders = await client.messaging.v1.services(s.messagingServiceSid).phoneNumbers.list({ limit: 20 });
      parts.push(`Messaging Service "${svc.friendlyName}" with ${senders.length} number${senders.length === 1 ? "" : "s"}`);
    }
    if (s.fromNumber) {
      const nums = await client.incomingPhoneNumbers.list({ phoneNumber: s.fromNumber, limit: 1 });
      parts.push(nums[0] ? `${s.fromNumber} is on the account${nums[0].capabilities?.sms ? " and can text" : " but cannot text"}` : `${s.fromNumber} is not on this account`);
    }
    return { ok: true, note: `${parts.join(" · ")}. Source: ${s.source === "admin" ? "this page" : "the server's environment"}.` };
  } catch (err) {
    const e = err as { status?: number; message?: string };
    return { ok: false, error: `Twilio answered ${e.status ?? "an error"}: ${(e.message ?? String(err)).slice(0, 160)}` };
  }
}

export async function sendAdminTestText(rawTo: string): Promise<AdminTwilioResult> {
  await requirePlatformAdmin();
  const to = toE164(rawTo);
  if (!to) return { ok: false, error: "That doesn't look like a US or Canadian number." };
  const r = await sendText({ organizationId: null, to, body: testText("JobFlex"), kind: "admin-test" });
  if (!r.ok) return { ok: false, error: r.reason === "duplicate" ? "The same test just went out — give it a minute." : r.reason === "opted-out" ? "That number replied STOP." : `Not sent: ${r.reason}. The row on this page has the error.` };
  if (r.status === "SKIPPED") return { ok: false, error: "Texting is not set up — nothing was sent." };
  revalidatePath(PAGE);
  return { ok: true, note: `Test text sent to ${to}. Twilio's delivery status lands on this page in a moment.` };
}

export async function clearTwilioSettings(): Promise<AdminTwilioResult> {
  await requirePlatformAdmin();
  await clearTwilioIntegration();
  invalidateTwilioSettings();
  revalidatePath(PAGE);
  revalidatePath("/admin/integrations");
  return { ok: true, note: "Cleared. Texting falls back to the server's environment, if it has Twilio keys." };
}

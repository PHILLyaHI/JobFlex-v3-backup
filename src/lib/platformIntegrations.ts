// PLATFORM INTEGRATIONS (2026-09-24) — settings the admin makes once for
// every contractor, kept in the PlatformIntegration table as one encrypted
// blob per key (lib/crypto/secretBox, TOKEN_ENCRYPTION_KEY). Twilio is the
// first: the account, the token, the Messaging Service or number. The env
// stays the fallback when there is no row, so nothing changes for a deploy
// that never opened /admin/integrations/twilio.

import { db } from "@/lib/db";
import { decryptSecret, encryptSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox";

export type TwilioIntegration = {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string | null;
  fromNumber: string | null;
  enabled: boolean;
};

const TWILIO_KEY = "twilio";

export function canStoreIntegrations(): boolean {
  return isSecretBoxConfigured();
}

async function readJson<T>(key: string): Promise<T | null> {
  const row = await db.platformIntegration.findUnique({ where: { key }, select: { json: true } });
  if (!row) return null;
  return JSON.parse(decryptSecret(row.json)) as T;
}

async function writeJson(key: string, value: unknown, updatedById: string | null): Promise<void> {
  const json = encryptSecret(JSON.stringify(value));
  await db.platformIntegration.upsert({ where: { key }, create: { key, json, updatedById }, update: { json, updatedById } });
}

export async function getTwilioIntegration(): Promise<TwilioIntegration | null> {
  if (!canStoreIntegrations()) return null;
  const v = await readJson<Partial<TwilioIntegration>>(TWILIO_KEY);
  if (!v) return null;
  return {
    accountSid: String(v.accountSid ?? ""),
    authToken: String(v.authToken ?? ""),
    messagingServiceSid: v.messagingServiceSid ? String(v.messagingServiceSid) : null,
    fromNumber: v.fromNumber ? String(v.fromNumber) : null,
    enabled: v.enabled !== false,
  };
}

export async function saveTwilioIntegration(value: TwilioIntegration, updatedById: string | null): Promise<void> {
  await writeJson(TWILIO_KEY, value, updatedById);
}

export async function clearTwilioIntegration(): Promise<void> {
  await db.platformIntegration.deleteMany({ where: { key: TWILIO_KEY } });
}

/** When the row was last saved and by whom — for the admin page's chip. */
export async function twilioIntegrationMeta(): Promise<{ updatedAt: Date; updatedById: string | null } | null> {
  const row = await db.platformIntegration.findUnique({ where: { key: TWILIO_KEY }, select: { updatedAt: true, updatedById: true } });
  return row ?? null;
}

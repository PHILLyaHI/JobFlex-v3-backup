// A COMPANY'S OWN NUMBER (2026-09-24) — server only.
//
// One click in the Text messages card: JobFlex buys a local number in the
// company's area code on the platform's Twilio account, points its inbound
// webhook at /api/twilio/sms, adds it to the platform's Messaging Service
// (so the A2P registration still covers it), and keeps it on the
// organization. From then on that company's texts show that number, and
// replies to it route straight to the company. Release puts it back.
// Nothing here runs without Twilio set up; the stand answers with a plain
// message instead.

import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { twilioClient, twilioSettings } from "@/lib/sdk/twilio";

export type NumberResult = { ok: true; number: string } | { ok: false; error: string };

function areaCodeOf(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  return d.length === 10 ? d.slice(0, 3) : null;
}

export async function claimNumberFor(organizationId: string): Promise<NumberResult> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true, phone: true, smsFromNumber: true } });
  if (!org) return { ok: false, error: "Not found." };
  if (org.smsFromNumber) return { ok: true, number: org.smsFromNumber };
  const s = await twilioSettings();
  if (!s) return { ok: false, error: "Texting is not set up on this platform yet." };
  try {
    const client = await twilioClient(s);
    const areaCode = areaCodeOf(org.phone);
    const search = client.availablePhoneNumbers("US").local;
    let found = areaCode ? await search.list({ areaCode: Number(areaCode), smsEnabled: true, limit: 1 }) : [];
    if (!found.length) found = await search.list({ smsEnabled: true, limit: 1 });
    const pick = found[0]?.phoneNumber;
    if (!pick) return { ok: false, error: "No number is available right now — try again in a minute." };
    const base = process.env.TWILIO_APP_URL ?? (await appBaseUrl());
    const bought = await client.incomingPhoneNumbers.create({
      phoneNumber: pick,
      friendlyName: `JobFlex · ${org.name}`.slice(0, 64),
      smsUrl: `${base}/api/twilio/sms`,
      smsMethod: "POST",
    });
    if (s.messagingServiceSid) {
      try {
        await client.messaging.v1.services(s.messagingServiceSid).phoneNumbers.create({ phoneNumberSid: bought.sid });
      } catch (err) {
        console.warn(`[sms/numbers] could not add ${pick} to the Messaging Service: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await db.organization.update({ where: { id: organizationId }, data: { smsFromNumber: bought.phoneNumber, smsNumberSid: bought.sid } });
    return { ok: true, number: bought.phoneNumber };
  } catch (err) {
    const e = err as { message?: string };
    return { ok: false, error: `Twilio answered: ${(e.message ?? String(err)).slice(0, 160)}` };
  }
}

export async function releaseNumberFor(organizationId: string): Promise<NumberResult> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { smsFromNumber: true, smsNumberSid: true } });
  if (!org?.smsFromNumber) return { ok: false, error: "No number to release." };
  const s = await twilioSettings();
  if (s && org.smsNumberSid) {
    try {
      const client = await twilioClient(s);
      if (s.messagingServiceSid) await client.messaging.v1.services(s.messagingServiceSid).phoneNumbers(org.smsNumberSid).remove().catch(() => null);
      await client.incomingPhoneNumbers(org.smsNumberSid).remove();
    } catch (err) {
      console.warn(`[sms/numbers] release of ${org.smsFromNumber} on Twilio failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await db.organization.update({ where: { id: organizationId }, data: { smsFromNumber: null, smsNumberSid: null } });
  return { ok: true, number: org.smsFromNumber };
}

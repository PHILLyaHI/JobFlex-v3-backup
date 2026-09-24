import { IntegrationDisabledError } from "./base";

// The platform's one sending identity. A Messaging Service (MG…) is
// preferred over a bare number: US carriers only honor an A2P registration
// for traffic sent through its service — a bare From reads as unregistered
// and comes back undelivered (error 30034).
export function isTwilioEnabled() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER),
  );
}

export async function sendSMS(to: string, body: string, opts: { statusCallback?: string } = {}) {
  if (!isTwilioEnabled()) {
    // Never log the body: SMS bodies carry worker magic links and quote links,
    // which are live bearer credentials in the server logs.
    console.warn(`[sms] Twilio disabled — would send ${body.length} chars → …${to.slice(-4)}`);
    return { sid: "disabled", skipped: true as const };
  }
  if (!/^\+[1-9]\d{6,14}$/.test(to)) {
    throw new Error("SMS destination must be an E.164 number");
  }
  const twilio = (await import("twilio")).default;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const msg = await client.messages.create({
    ...(service ? { messagingServiceSid: service } : { from: process.env.TWILIO_PHONE_NUMBER! }),
    to,
    body,
    ...(opts.statusCallback ? { statusCallback: opts.statusCallback } : {}),
  });
  try {
    const { db } = await import("@/lib/db");
    const at = new Date().toISOString();
    await db.syncState.upsert({
      where: { key: "sms:last-sent" },
      update: { cursor: at },
      create: { key: "sms:last-sent", cursor: at },
    });
  } catch {
    /* bookkeeping for the integrations-health panel; never fails a send */
  }
  return { sid: msg.sid, skipped: false as const };
}

export function requireTwilio() {
  if (!isTwilioEnabled()) throw new IntegrationDisabledError("Twilio", "TWILIO_ACCOUNT_SID");
}

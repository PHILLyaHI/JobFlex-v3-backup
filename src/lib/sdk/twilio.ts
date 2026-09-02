import { IntegrationDisabledError } from "./base";

export function isTwilioEnabled() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER,
  );
}

export async function sendSMS(to: string, body: string) {
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
  const msg = await client.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER!,
    to,
    body,
  });
  return { sid: msg.sid, skipped: false as const };
}

export function requireTwilio() {
  if (!isTwilioEnabled()) throw new IntegrationDisabledError("Twilio", "TWILIO_ACCOUNT_SID");
}

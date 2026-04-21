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
    console.warn("[sms] Twilio disabled — would send:", body, "→", to);
    return { sid: "disabled", skipped: true as const };
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

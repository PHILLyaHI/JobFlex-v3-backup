// E.164 for Twilio. Client.phone is free text ("(555) 123-4567"); sendSMS
// refuses anything but +1XXXXXXXXXX. US/Canada only: ten digits, or eleven
// starting with 1. Anything else → null, and the caller skips the text.
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

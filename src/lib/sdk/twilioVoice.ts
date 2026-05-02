// Tiny string-based TwiML generators + signature verifier. No SDK dependency at runtime.

interface RecordOpts {
  baseUrl: string; // absolute origin for webhook callbacks
  greeting: string;
  maxLengthSec?: number;
}

export function recordingTwiml(opts: RecordOpts): string {
  const max = opts.maxLengthSec ?? 120;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(opts.greeting)}</Say>
  <Record
    action="${opts.baseUrl}/api/twilio/recording-complete"
    method="POST"
    transcribe="true"
    transcribeCallback="${opts.baseUrl}/api/twilio/transcription-complete"
    maxLength="${max}"
    playBeep="true"
    trim="trim-silence"/>
  <Say voice="alice">Thanks. We'll be in touch shortly.</Say>
  <Hangup/>
</Response>`;
}

export function hangupTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response><Hangup/></Response>`;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// HMAC-SHA1 signature verifier per Twilio spec.
// Twilio signs the concatenation of the full URL + sorted form params.
// We don't install crypto-js; Node has crypto built in.
export async function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<boolean> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return true; // graceful-disabled: allow when no token set
  if (!signature) return false;
  const keys = Object.keys(params).sort();
  const data = url + keys.map((k) => k + params[k]).join("");
  const { createHmac } = await import("node:crypto");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  return expected === signature;
}

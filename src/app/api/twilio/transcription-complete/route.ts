import { NextResponse } from "next/server";
import { attachTranscript } from "@/lib/aiPhoneCalls";
import { verifyTwilioSignature } from "@/lib/sdk/twilioVoice";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  // Verify the callback is genuinely from Twilio — it injects transcript text
  // (and can trigger auto lead-creation) into the call's org.
  const fullUrl = process.env.TWILIO_APP_URL
    ? `${process.env.TWILIO_APP_URL}/api/twilio/transcription-complete`
    : new URL(req.url).toString();
  const signatureOk = await verifyTwilioSignature(
    fullUrl,
    params,
    req.headers.get("x-twilio-signature"),
  );
  if (!signatureOk) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const callSid = params.CallSid ?? "";
  const transcript = params.TranscriptionText ?? "";
  if (!callSid) {
    return NextResponse.json({ error: "Missing CallSid" }, { status: 400 });
  }
  try {
    await attachTranscript(callSid, transcript);
  } catch (err) {
    console.warn("[twilio/transcription-complete] failed:", err);
  }
  return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
}

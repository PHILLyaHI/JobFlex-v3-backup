import { NextResponse } from "next/server";
import { attachRecording } from "@/lib/aiPhoneCalls";
import { verifyTwilioSignature } from "@/lib/sdk/twilioVoice";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  // Verify the callback really came from Twilio before trusting its payload —
  // this writes an attacker-supplied recording URL onto the call record.
  const fullUrl = process.env.TWILIO_APP_URL
    ? `${process.env.TWILIO_APP_URL}/api/twilio/recording-complete`
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
  const recordingUrl = params.RecordingUrl ?? "";
  const duration = Number(params.RecordingDuration ?? 0);
  if (!callSid || !recordingUrl) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  try {
    await attachRecording(callSid, recordingUrl + ".mp3", duration);
  } catch (err) {
    console.warn("[twilio/recording-complete] attach failed:", err);
  }
  return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
}

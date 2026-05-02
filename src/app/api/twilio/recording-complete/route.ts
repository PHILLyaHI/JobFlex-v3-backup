import { NextResponse } from "next/server";
import { attachRecording } from "@/actions/aiPhoneCalls";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? "");
  const recordingUrl = String(form.get("RecordingUrl") ?? "");
  const duration = Number(form.get("RecordingDuration") ?? 0);
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

import { NextResponse } from "next/server";
import { attachTranscript } from "@/actions/aiPhoneCalls";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? "");
  const transcript = String(form.get("TranscriptionText") ?? "");
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

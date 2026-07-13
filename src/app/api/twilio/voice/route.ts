import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordingTwiml, unavailableTwiml, verifyTwilioSignature } from "@/lib/sdk/twilioVoice";
import { startInboundCall } from "@/lib/aiPhoneCalls";
import { checkPlanLimit } from "@/lib/limitsEngine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  const fullUrl = process.env.TWILIO_APP_URL
    ? `${process.env.TWILIO_APP_URL}/api/twilio/voice`
    : new URL(req.url).toString();

  const signatureOk = await verifyTwilioSignature(
    fullUrl,
    params,
    req.headers.get("x-twilio-signature"),
  );
  if (!signatureOk) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const callSid = params.CallSid;
  const from = params.From;
  const to = params.To;
  if (!callSid || !from || !to) {
    return NextResponse.json({ error: "Missing call params" }, { status: 400 });
  }

  // Map inbound To number → Organization. Simplest: default to first org.
  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return NextResponse.json({ error: "No org" }, { status: 500 });

  // The one public path that BLOCKS at the cap (product decision): over-limit
  // orgs get a polite unavailable message and no AiPhoneCall row is written.
  const quota = await checkPlanLimit(org.id, "aiPhoneCalls");
  if (!quota.allowed) {
    return new NextResponse(unavailableTwiml(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  try {
    await startInboundCall(callSid, from, to, org.id);
  } catch (err) {
    console.warn("[twilio/voice] startInboundCall failed:", err);
  }

  const baseUrl =
    process.env.TWILIO_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    new URL(req.url).origin;

  const xml = recordingTwiml({
    baseUrl,
    greeting:
      "Thanks for calling. Please leave your name, phone number, and a short description of your project after the beep.",
    maxLengthSec: 180,
  });

  return new NextResponse(xml, {
    headers: { "Content-Type": "text/xml" },
  });
}

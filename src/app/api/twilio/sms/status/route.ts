// POST /api/twilio/sms/status — Twilio says what became of a text (2026-09-24):
// queued, sent, delivered, undelivered, failed. Written onto the SmsMessage
// row by SID, so Settings' counter and a support question read the truth.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { verifyTwilioSignature } from "@/lib/sdk/twilioVoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });
  const url = `${process.env.TWILIO_APP_URL ?? (await appBaseUrl())}/api/twilio/sms/status`;
  if (!(await verifyTwilioSignature(url, params, req.headers.get("x-twilio-signature")))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }
  const sid = params.MessageSid;
  const status = (params.MessageStatus ?? "").toUpperCase();
  if (sid && status) {
    const error = params.ErrorCode ? `${params.ErrorCode}${params.ErrorMessage ? ` ${params.ErrorMessage}` : ""}`.slice(0, 200) : undefined;
    await db.smsMessage.updateMany({ where: { sid }, data: { status, ...(error ? { error } : {}) } }).catch(() => null);
  }
  return new Response(null, { status: 204 });
}

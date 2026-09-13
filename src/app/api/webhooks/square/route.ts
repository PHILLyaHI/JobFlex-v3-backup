import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { runWebhookEnvelope } from "@/lib/webhookEnvelope";
import { isSquareWebhookConfigured } from "@/lib/sdk/square";
import { dispatchSquareEvent, type SquareEvent } from "@/lib/payments/squareEvents";

export const runtime = "nodejs";

// Square webhooks are APPLICATION-level: the platform app's one subscription
// receives events for every OAuth'd seller, `merchant_id` says whose.
// Signature = HMAC-SHA256 over notificationUrl + raw body with the
// subscription's signature key, so the URL must byte-match what is registered
// (SQUARE_WEBHOOK_URL overrides). Token-joined sellers report to
// /api/webhooks/square-key/[id] instead; both feed lib/payments/squareEvents.ts.
export async function POST(req: Request) {
  if (!isSquareWebhookConfigured()) return NextResponse.json({ disabled: true });

  const raw = await req.text();
  const signatureHeader = req.headers.get("x-square-hmacsha256-signature") ?? "";
  const notificationUrl = process.env.SQUARE_WEBHOOK_URL || `${await appBaseUrl()}/api/webhooks/square`;

  const { WebhooksHelper } = await import("square");
  const valid = await WebhooksHelper.verifySignature({
    requestBody: raw,
    signatureHeader,
    signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY!,
    notificationUrl,
  });
  if (!valid) return NextResponse.json({ error: "Webhook signature: invalid" }, { status: 400 });

  let event: SquareEvent;
  try {
    event = JSON.parse(raw) as SquareEvent;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!event.event_id || !event.type) return NextResponse.json({ ignored: true });

  const conn = event.merchant_id
    ? await db.paymentConnection.findFirst({ where: { provider: "SQUARE", squareMerchantId: event.merchant_id } })
    : null;
  const result = await runWebhookEnvelope(
    { provider: "SQUARE", eventId: event.event_id, type: event.type },
    () => dispatchSquareEvent(event, { via: "app", conn }),
  );
  if (result.outcome === "duplicate") return NextResponse.json({ duplicate: true });
  if (result.outcome === "failed") return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ received: true });
}

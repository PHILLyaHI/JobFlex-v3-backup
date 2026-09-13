import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { decryptSecret } from "@/lib/crypto/secretBox";
import { runWebhookEnvelope } from "@/lib/webhookEnvelope";
import { dispatchSquareEvent, type SquareEvent } from "@/lib/payments/squareEvents";

export const runtime = "nodejs";

// TOKEN endpoint — one per token-joined Square seller, registered on THEIR
// developer app by connectSquareWithToken (actions/paymentConnections.ts).
// The row id in the path finds the connection; its stored signature key
// verifies the event (HMAC over this exact URL + body); the merchant on the
// event must be the row's, and the row's org is the only org it may settle for.
export async function POST(req: Request, ctx: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await ctx.params;
  const conn = await db.paymentConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.provider !== "SQUARE" || conn.squareAuth !== "token" || !conn.squareWebhookSignatureKeyEnc) {
    return NextResponse.json({ error: "Unknown endpoint" }, { status: 404 });
  }
  let signatureKey: string;
  try {
    signatureKey = decryptSecret(conn.squareWebhookSignatureKeyEnc);
  } catch {
    return NextResponse.json({ error: "Endpoint unavailable" }, { status: 503 });
  }

  const raw = await req.text();
  const signatureHeader = req.headers.get("x-square-hmacsha256-signature") ?? "";
  const notificationUrl = `${await appBaseUrl()}/api/webhooks/square-key/${conn.id}`;
  const { WebhooksHelper } = await import("square");
  const valid = await WebhooksHelper.verifySignature({ requestBody: raw, signatureHeader, signatureKey, notificationUrl });
  if (!valid) return NextResponse.json({ error: "Webhook signature: invalid" }, { status: 400 });

  let event: SquareEvent;
  try {
    event = JSON.parse(raw) as SquareEvent;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!event.event_id || !event.type) return NextResponse.json({ ignored: true });
  if (event.merchant_id && conn.squareMerchantId && event.merchant_id !== conn.squareMerchantId) {
    return NextResponse.json({ ignored: true, reason: "merchant mismatch" });
  }

  const result = await runWebhookEnvelope(
    { provider: "SQUARE", eventId: event.event_id, type: event.type },
    () => dispatchSquareEvent(event, { via: "key", conn }),
  );
  if (result.outcome === "duplicate") return NextResponse.json({ duplicate: true });
  if (result.outcome === "failed") return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ received: true });
}

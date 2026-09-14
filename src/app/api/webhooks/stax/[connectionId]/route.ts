import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto/secretBox";
import { runWebhookEnvelope } from "@/lib/webhookEnvelope";
import { recordRefund } from "@/lib/payments/settle";
import { settleStaxInvoice } from "@/lib/payments/staxEvents";
import { getStaxInvoice, getStaxTransaction, staxKeyFor, type StaxTransaction } from "@/lib/payments/stax";

export const runtime = "nodejs";

// STAX endpoint — one per connected merchant, registered with their key by
// connectStaxWithKey. Stax signs nothing: the target URL carries a random
// secret (?k=) that must match the row's, and every event is re-read from
// Stax with the merchant's key before it settles anything. The row's org is
// the only org it may settle for (lib/payments/staxEvents.ts).
export async function POST(req: Request, ctx: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await ctx.params;
  const conn = await db.paymentConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.provider !== "STAX" || !conn.staxApiKeyEnc || !conn.staxWebhookSecretEnc) {
    return NextResponse.json({ error: "Unknown endpoint" }, { status: 404 });
  }
  let secret: string;
  try {
    secret = decryptSecret(conn.staxWebhookSecretEnc);
  } catch {
    return NextResponse.json({ error: "Endpoint unavailable" }, { status: 503 });
  }
  const given = new URL(req.url).searchParams.get("k") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Webhook secret: invalid" }, { status: 401 });
  }
  const key = staxKeyFor(conn);
  if (!key) return NextResponse.json({ error: "Endpoint unavailable" }, { status: 503 });

  const eventName = req.headers.get("stax-event-name") ?? "";
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id || !eventName) return NextResponse.json({ ignored: true });

  // Stax carries no event id: dedupe on what the event says changed.
  const eventId =
    eventName === "update_invoice"
      ? `inv:${id}:${String(body.status ?? "")}:${String(body.updated_at ?? "")}`
      : `${eventName}:${id}`;

  const result = await runWebhookEnvelope({ provider: "STAX", eventId, type: eventName }, async () => {
    if (eventName === "update_invoice") {
      if (body.status !== "PAID") return;
      // Trust nothing in the POST: read the invoice back with the merchant's key.
      const inv = await getStaxInvoice(key, id);
      await settleStaxInvoice(conn.organizationId, inv);
      return;
    }
    if (eventName === "create_transaction") {
      const posted = body as StaxTransaction;
      if (posted.type !== "refund" || posted.success === false || !posted.reference_id) return;
      const refund = await getStaxTransaction(key, id);
      if (refund.type !== "refund" || refund.success === false || !refund.reference_id) return;
      const payment = await db.payment.findFirst({
        where: { provider: "STAX", externalPaymentId: refund.reference_id },
        select: { organizationId: true },
      });
      if (!payment || payment.organizationId !== conn.organizationId) return;
      const parent = await getStaxTransaction(key, refund.reference_id);
      const refundedMinor = Math.round(Number(parent.total_refunded ?? refund.total ?? 0) * 100);
      await recordRefund({
        provider: "STAX",
        externalPaymentId: refund.reference_id,
        refundedMinor,
        full: Number(parent.total_refunded ?? 0) >= Number(parent.total ?? Number.POSITIVE_INFINITY),
      });
    }
  });
  if (result.outcome === "duplicate") return NextResponse.json({ duplicate: true });
  if (result.outcome === "failed") return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ received: true });
}

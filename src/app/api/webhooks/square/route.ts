import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { runWebhookEnvelope } from "@/lib/webhookEnvelope";
import { isSquareWebhookConfigured } from "@/lib/sdk/square";
import { InstallmentStatus } from "@/lib/prismaEnums";
import { settleInstallmentPayment, recordRefund } from "@/lib/payments/settle";
import { markConnectionRevoked } from "@/lib/payments/connections";
import { notifyPaymentIssue } from "@/lib/notify";

export const runtime = "nodejs";

// Square webhooks are APPLICATION-level: one subscription receives events for
// every OAuth'd seller, `merchant_id` says whose. Signature = HMAC-SHA256 over
// notificationUrl + raw body with the subscription's signature key, so the
// URL must byte-match what is registered (SQUARE_WEBHOOK_URL overrides).
interface SquareEvent {
  merchant_id?: string;
  type?: string;
  event_id?: string;
  data?: { type?: string; id?: string; object?: Record<string, unknown> };
}

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

  const result = await runWebhookEnvelope(
    { provider: "SQUARE", eventId: event.event_id, type: event.type },
    () => dispatch(event),
  );
  if (result.outcome === "duplicate") return NextResponse.json({ duplicate: true });
  if (result.outcome === "failed") return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ received: true });
}

type SquarePayment = {
  id?: string;
  status?: string;
  order_id?: string;
  amount_money?: { amount?: number | string; currency?: string };
  app_fee_money?: { amount?: number | string };
  source_type?: string;
};
type SquareRefund = {
  id?: string;
  status?: string;
  payment_id?: string;
  amount_money?: { amount?: number | string };
};

async function dispatch(event: SquareEvent) {
  const merchantId = event.merchant_id ?? null;
  const conn = merchantId
    ? await db.paymentConnection.findFirst({ where: { provider: "SQUARE", squareMerchantId: merchantId } })
    : null;

  switch (event.type) {
    case "payment.created":
    case "payment.updated": {
      const p = event.data?.object?.payment as SquarePayment | undefined;
      if (!p?.order_id) return;
      const stages = await db.installment.findMany({
        where: { checkoutOrderId: p.order_id },
        select: { id: true, status: true, proposalId: true, proposal: { select: { organizationId: true, clientId: true, currency: true } } },
      });
      if (!stages.length) return; // not one of our links
      if (p.status === "COMPLETED") {
        const proposal = stages[0].proposal;
        await settleInstallmentPayment({
          provider: "SQUARE",
          externalId: p.order_id,
          externalPaymentId: p.id ?? null,
          organizationId: proposal.organizationId,
          proposalId: stages[0].proposalId,
          installmentIds: stages.map((s) => s.id),
          amountMinor: Number(p.amount_money?.amount ?? 0),
          feeMinor: Number(p.app_fee_money?.amount ?? 0),
          currency: String(p.amount_money?.currency ?? proposal.currency).toUpperCase(),
          livemode: conn?.squareEnv === "production",
          method: p.source_type === "BANK_ACCOUNT" ? "us_bank_account" : "card",
          scheduleVersion: null,
          clientId: proposal.clientId,
        });
        return;
      }
      if (p.status === "FAILED" || p.status === "CANCELED") {
        await db.installment.updateMany({
          where: { checkoutOrderId: p.order_id, status: InstallmentStatus.PENDING },
          data: {
            status: InstallmentStatus.UNPAID,
            checkoutProvider: null,
            checkoutRef: null,
            checkoutOrderId: null,
            checkoutOpenedAt: null,
          },
        });
      }
      return;
    }
    case "refund.created":
    case "refund.updated": {
      const r = event.data?.object?.refund as SquareRefund | undefined;
      if (!r?.payment_id || r.status !== "COMPLETED") return;
      const payment = await db.payment.findFirst({
        where: { provider: "SQUARE", externalPaymentId: r.payment_id },
        select: { amount: true },
      });
      const refundedMinor = Number(r.amount_money?.amount ?? 0);
      await recordRefund({
        provider: "SQUARE",
        externalPaymentId: r.payment_id,
        refundedMinor,
        full: payment ? refundedMinor >= Math.round(payment.amount * 100) : false,
      });
      return;
    }
    case "oauth.authorization.revoked": {
      if (!conn) return;
      await markConnectionRevoked(conn.organizationId, "SQUARE", "Disconnected from the Square dashboard");
      await notifyPaymentIssue({
        organizationId: conn.organizationId,
        title: "Square was disconnected",
        detail: "JobFlex was removed from your Square account. Reconnect it in Settings → Payments to take Square payments again.",
      });
      return;
    }
    default:
      return;
  }
}

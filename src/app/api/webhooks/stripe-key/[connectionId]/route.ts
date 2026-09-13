import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto/secretBox";
import { runWebhookEnvelope } from "@/lib/webhookEnvelope";
import { stripeForConnection } from "@/lib/payments/stripeConnect";
import { dispatchStripeEvent } from "@/lib/payments/stripeEvents";

export const runtime = "nodejs";

// KEY endpoint — one per key-joined Stripe account, registered on that
// account by connectStripeWithKey (actions/paymentConnections.ts) with the
// contractor's own key. The row id in the path finds the connection; its
// stored signing secret verifies the event; the org on the row is the only
// org this endpoint may settle for.
export async function POST(req: Request, ctx: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await ctx.params;
  const conn = await db.paymentConnection.findUnique({ where: { id: connectionId } });
  if (!conn || conn.provider !== "STRIPE" || !conn.stripeKeyEnc || !conn.stripeWebhookSecretEnc) {
    return NextResponse.json({ error: "Unknown endpoint" }, { status: 404 });
  }
  const bound = stripeForConnection(conn);
  let secret: string;
  try {
    secret = decryptSecret(conn.stripeWebhookSecretEnc);
  } catch {
    return NextResponse.json({ error: "Endpoint unavailable" }, { status: 503 });
  }
  if (!bound) return NextResponse.json({ error: "Endpoint unavailable" }, { status: 503 });

  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = bound.stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature: ${err instanceof Error ? err.message : "bad signature"}` },
      { status: 400 },
    );
  }

  const evt = event;
  const result = await runWebhookEnvelope(
    { provider: "STRIPE", eventId: evt.id, type: evt.type },
    () =>
      dispatchStripeEvent(evt, {
        via: "key",
        stripe: bound.stripe,
        reqOpts: {},
        account: conn.stripeAccountId,
        organizationId: conn.organizationId,
      }),
  );
  if (result.outcome === "duplicate") return NextResponse.json({ duplicate: true });
  if (result.outcome === "failed") return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ received: true });
}

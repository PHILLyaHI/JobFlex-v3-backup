import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";

export async function POST(req: Request) {
  if (!isStripeEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ disabled: true });
  }

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  const stripe = getStripe();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature: ${err.message}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const publicId = session.metadata?.publicId;
      if (publicId) {
        const proposal = await db.proposal.findUnique({ where: { publicId } });
        if (proposal) {
          await db.proposal.update({
            where: { id: proposal.id },
            data: { status: "PAID", paidAt: new Date() },
          });
          await db.payment.create({
            data: {
              organizationId: proposal.organizationId,
              proposalId: proposal.id,
              clientId: proposal.clientId,
              amount: (session.amount_total ?? 0) / 100,
              currency: (session.currency ?? "usd").toUpperCase(),
              provider: "STRIPE",
              status: "PAID",
              externalId: session.id,
              method: "card",
              paidAt: new Date(),
            },
          });
        }
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

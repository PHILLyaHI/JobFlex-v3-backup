import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";

export async function POST(req: Request) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ disabled: true });
  }
  const { publicId, amount } = await req.json();
  const proposal = await db.proposal.findUnique({ where: { publicId } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: proposal.currency.toLowerCase(),
          product_data: { name: proposal.title },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/portal/q/${publicId}?paid=1`,
    cancel_url: `${origin}/portal/q/${publicId}`,
    metadata: { proposalId: proposal.id, publicId },
  });
  return NextResponse.json({ url: session.url });
}

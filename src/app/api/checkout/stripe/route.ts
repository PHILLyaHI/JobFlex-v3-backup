import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/appUrl";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";

export async function POST(req: Request) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ disabled: true });
  }
  // The amount is ALWAYS derived server-side from the proposal — never trusted
  // from the request body (a client could otherwise check out for 1¢ and the
  // webhook would flip the proposal to PAID). The `amount` field is ignored.
  const { publicId } = await req.json();
  const gate = await rateLimitShared(`checkout:${ipFromRequest(req)}`, 10, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  const proposal = await db.proposal.findUnique({ where: { publicId } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (proposal.status === "PAID") {
    return NextResponse.json({ error: "This proposal is already paid" }, { status: 409 });
  }
  const unitAmount = Math.round(proposal.total * 100);
  if (unitAmount <= 0) {
    return NextResponse.json({ error: "Nothing to pay on this proposal" }, { status: 400 });
  }

  // Redirect targets come from the platform-set host, never the caller's
  // Origin header — a forged Origin minted a real, contractor-branded checkout
  // whose post-payment landing page was an attacker domain.
  const origin = await appBaseUrl();
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: proposal.currency.toLowerCase(),
          product_data: { name: proposal.title },
          unit_amount: unitAmount,
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

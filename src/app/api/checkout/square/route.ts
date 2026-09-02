import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/appUrl";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { isSquareEnabled, getSquare, SQUARE_LOCATION_ID } from "@/lib/sdk/square";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isSquareEnabled()) return NextResponse.json({ disabled: true });

  // Amount is derived server-side from the proposal, never from the body.
  const { publicId } = await req.json();
  const gate = await rateLimitShared(`checkout:${ipFromRequest(req)}`, 10, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  if (!publicId) return NextResponse.json({ error: "Missing publicId" }, { status: 400 });

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
  const client = await getSquare();

  try {
    const res = await (client as any).checkoutApi.createPaymentLink({
      idempotencyKey: randomUUID(),
      order: {
        locationId: SQUARE_LOCATION_ID!,
        referenceId: proposal.id,
        lineItems: [
          {
            name: proposal.title.slice(0, 500),
            quantity: "1",
            basePriceMoney: {
              amount: BigInt(unitAmount),
              currency: proposal.currency ?? "USD",
            },
          },
        ],
      },
      checkoutOptions: {
        redirectUrl: `${origin}/portal/q/${publicId}?paid=1`,
      },
    });
    const url = res?.result?.paymentLink?.url;
    if (!url) {
      return NextResponse.json({ error: "Square didn't return a URL" }, { status: 500 });
    }
    return NextResponse.json({ url });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Square: ${err?.message ?? "checkout failed"}` },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { isSquareEnabled, getSquare, SQUARE_LOCATION_ID } from "@/lib/sdk/square";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isSquareEnabled()) return NextResponse.json({ disabled: true });

  const { publicId, amount } = await req.json();
  if (!publicId) return NextResponse.json({ error: "Missing publicId" }, { status: 400 });

  const proposal = await db.proposal.findUnique({ where: { publicId } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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
              amount: BigInt(amount),
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

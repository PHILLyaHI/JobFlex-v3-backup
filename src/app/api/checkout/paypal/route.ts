import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isPayPalEnabled, getPayPalAccessToken, paypalBase } from "@/lib/sdk/paypal";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isPayPalEnabled()) return NextResponse.json({ disabled: true });
  const { publicId, amount } = await req.json();
  if (!publicId) return NextResponse.json({ error: "Missing publicId" }, { status: 400 });

  const proposal = await db.proposal.findUnique({ where: { publicId } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const token = await getPayPalAccessToken();

  // Create an Order
  const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: proposal.id,
          description: proposal.title.slice(0, 127),
          amount: {
            currency_code: proposal.currency ?? "USD",
            value: (amount / 100).toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "JobFlex",
        return_url: `${origin}/portal/q/${publicId}?paid=1`,
        cancel_url: `${origin}/portal/q/${publicId}`,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `PayPal: ${text.slice(0, 300)}` }, { status: 500 });
  }
  const order = (await res.json()) as {
    id: string;
    links: { rel: string; href: string }[];
  };
  const approve = order.links.find((l) => l.rel === "approve")?.href;
  if (!approve) return NextResponse.json({ error: "No approval URL from PayPal" }, { status: 500 });
  return NextResponse.json({ url: approve, orderId: order.id });
}

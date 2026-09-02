import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/appUrl";
import { db } from "@/lib/db";
import { isPayPalEnabled, getPayPalAccessToken, paypalBase } from "@/lib/sdk/paypal";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isPayPalEnabled()) return NextResponse.json({ disabled: true });
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
  if (proposal.total <= 0) {
    return NextResponse.json({ error: "Nothing to pay on this proposal" }, { status: 400 });
  }

  // Redirect targets come from the platform-set host, never the caller's
  // Origin header — a forged Origin minted a real, contractor-branded checkout
  // whose post-payment landing page was an attacker domain.
  const origin = await appBaseUrl();
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
            value: proposal.total.toFixed(2),
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

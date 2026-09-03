import { NextResponse } from "next/server";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { createCheckout } from "@/lib/payments/createCheckout";
import { parsePayBody } from "../parse";

// Public (portal) — mints a Stripe Checkout Session on the CONTRACTOR's
// connected account for one stage or the remaining balance. Amount is never
// read from the body.
export async function POST(req: Request) {
  const body = await parsePayBody(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const [ipGate, idGate] = await Promise.all([
    rateLimitShared(`pay:${ipFromRequest(req)}`, 10, HOUR),
    rateLimitShared(`pay:p:${body.publicId}`, 20, HOUR),
  ]);
  if (!ipGate.ok || !idGate.ok) {
    return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  }
  const res = await createCheckout({ provider: "STRIPE", publicId: body.publicId, target: body.target });
  if (!res.ok) return NextResponse.json({ error: res.error, reason: res.reason }, { status: res.status });
  return NextResponse.json({ url: res.url, reused: res.reused });
}

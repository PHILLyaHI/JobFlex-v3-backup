import { NextResponse } from "next/server";
import { isPayPalEnabled } from "@/lib/sdk/paypal";

export async function POST() {
  if (!isPayPalEnabled()) return NextResponse.json({ disabled: true });
  return NextResponse.json({
    disabled: true,
    error: "PayPal checkout scaffolded — full implementation next session.",
  });
}

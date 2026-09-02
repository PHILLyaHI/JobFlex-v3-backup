import { NextResponse } from "next/server";
import { submitReviewPublic } from "@/actions/reviewRequests";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const gate = await rateLimitShared(`review:${ipFromRequest(req)}`, 10, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  const body = await req.json();
  try {
    const result = await submitReviewPublic(token, body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed" }, { status: 400 });
  }
}

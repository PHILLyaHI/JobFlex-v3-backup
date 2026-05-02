import { NextResponse } from "next/server";
import { declineChangeOrderPublic } from "@/actions/changeOrders";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  try {
    await declineChangeOrderPublic(token);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed" }, { status: 400 });
  }
}

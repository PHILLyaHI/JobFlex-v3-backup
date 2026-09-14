import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { respondSchema } from "@/lib/changeOrders/schema";
import { declineChangeOrder } from "@/lib/changeOrders/respond";
import { notifyOfficeChangeOrderAnswered } from "@/lib/changeOrders/send";

// The client declines a change order from /co/[token], with an optional
// reason the office sees. Token-gated and rate-limited; money is untouched.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ip = ipFromRequest(req);
  const gate = await rateLimitShared(`co-respond:${ip}`, 20, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = respondSchema.safeParse(body);
  const reason = parsed.success ? (parsed.data.reason?.trim() || null) : null;

  const co = await db.changeOrder.findUnique({ where: { publicToken: token }, select: { id: true, jobId: true } });
  if (!co) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const res = await declineChangeOrder({ coId: co.id, reason, ip: typeof ip === "string" ? ip : null });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.already) {
    notifyOfficeChangeOrderAnswered(co.id, false).catch((err) => console.warn("[public-co] notify failed:", err));
    if (co.jobId) revalidatePath(`/dashboard/jobs/${co.jobId}`);
    revalidatePath("/dashboard/proposals");
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { respondSchema } from "@/lib/changeOrders/schema";
import { approveChangeOrder } from "@/lib/changeOrders/respond";
import { notifyOfficeChangeOrderAnswered } from "@/lib/changeOrders/send";

// The client approves a change order from /co/[token]. Token-gated and
// rate-limited like every public-quote route; the typed full name and the
// "I agree" tick are the lightweight e-signature, recorded with the IP,
// user agent and time. Everything that moves money is in respond.ts.
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
  if (!parsed.success) return NextResponse.json({ error: "Type your full name to approve." }, { status: 400 });
  const name = parsed.data.name?.trim() ?? "";
  if (name.length < 2) return NextResponse.json({ error: "Type your full name to approve." }, { status: 400 });
  if (parsed.data.agree !== true) return NextResponse.json({ error: "Tick the box to agree to the change." }, { status: 400 });

  const co = await db.changeOrder.findUnique({ where: { publicToken: token }, select: { id: true, jobId: true, proposalId: true } });
  if (!co) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const res = await approveChangeOrder({
    coId: co.id,
    via: "client",
    name,
    ip: typeof ip === "string" ? ip : null,
    userAgent: req.headers.get("user-agent"),
    byUserId: null,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.already) {
    notifyOfficeChangeOrderAnswered(co.id, true).catch((err) => console.warn("[public-co] notify failed:", err));
    if (co.jobId) revalidatePath(`/dashboard/jobs/${co.jobId}`);
    revalidatePath("/dashboard/proposals");
  }
  return NextResponse.json({ ok: true });
}

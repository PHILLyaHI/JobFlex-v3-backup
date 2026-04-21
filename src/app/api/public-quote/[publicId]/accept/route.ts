import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await ctx.params;
  const proposal = await db.proposal.findUnique({ where: { publicId }, include: { client: true } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  await db.proposal.update({
    where: { id: proposal.id },
    data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedIp: ip ?? undefined },
  });

  await db.activityEvent.create({
    data: {
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      clientId: proposal.clientId,
      kind: "ACCEPTED",
      summary: `${proposal.client?.name ?? "Client"} accepted the proposal`,
      meta: JSON.stringify({ ip }),
    },
  });

  return NextResponse.json({ ok: true });
}

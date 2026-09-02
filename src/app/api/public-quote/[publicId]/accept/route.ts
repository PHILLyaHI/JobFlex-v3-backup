import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createJobFromProposalInternal } from "@/lib/jobFromProposal";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await ctx.params;
  const gate = await rateLimitShared(`quote-respond:${ipFromRequest(req)}`, 20, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  const proposal = await db.proposal.findUnique({ where: { publicId }, include: { client: true } });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Don't let a settled deal be re-flipped. Already-accepted is idempotent (no
  // duplicate side effects); a PAID or DECLINED proposal can't regress to
  // ACCEPTED. Mirrors the guard in ../decline.
  if (proposal.status === "ACCEPTED") {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }
  if (proposal.status === "PAID" || proposal.status === "DECLINED") {
    return NextResponse.json(
      { error: "This proposal has already been settled." },
      { status: 409 },
    );
  }

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

  // Auto-create a Job + JobEvent so the new work shows up on calendar + jobs list immediately.
  let jobId: string | null = null;
  try {
    const { id } = await createJobFromProposalInternal(proposal.id);
    jobId = id;
  } catch (err) {
    console.warn("[accept] Couldn't auto-create job:", err);
  }

  // Thank-you to the client + acceptance heads-up to the owner (best-effort).
  try {
    const { notifyProposalAccepted } = await import("@/lib/notify");
    await notifyProposalAccepted({ proposalId: proposal.id });
  } catch (err) {
    console.warn("[accept] notify failed:", err);
  }

  return NextResponse.json({ ok: true, jobId });
}

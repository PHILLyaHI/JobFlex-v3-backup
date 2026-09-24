import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createJobFromProposalInternal } from "@/lib/jobFromProposal";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { trackActivation } from "@/lib/activation-events";
import { proposalAcceptanceSchema } from "@/lib/proposalAcceptance";
import { buildPortalPayModel } from "@/lib/payments/portalModel";
import { money, longDate } from "@/lib/format";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await ctx.params;
  const gate = await rateLimitShared(`quote-respond:${ipFromRequest(req)}`, 20, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  const input = proposalAcceptanceSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Enter your full name to accept the proposal." }, { status: 400 });
  const acceptedName = input.data.name;
  const proposal = await db.proposal.findUnique({
    where: { publicId },
    include: {
      client: true,
      installments: { orderBy: { position: "asc" } },
      changeOrders: { where: { status: "APPROVED" }, select: { status: true, total: true } },
      organization: { select: { deletedAt: true, paymentSettingsJson: true, paymentConnections: true } },
    },
  });
  if (!proposal || proposal.organization.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const paymentModel = () => buildPortalPayModel(publicId, { ...proposal, status: "ACCEPTED" }, proposal.organization, { money, longDate });

  // Don't let a settled deal be re-flipped. Already-accepted is idempotent (no
  // duplicate side effects); a PAID or DECLINED proposal can't regress to
  // ACCEPTED. Mirrors the guard in ../decline.
  // COMPLETED is accepted work that is done — the same idempotent answer,
  // never a regression to ACCEPTED.
  if (proposal.status === "ACCEPTED" || proposal.status === "COMPLETED") {
    return NextResponse.json({ ok: true, alreadyAccepted: true, pay: await paymentModel() });
  }
  if (proposal.status === "PAID" || proposal.status === "DECLINED" || proposal.status === "ARCHIVED") {
    return NextResponse.json(
      { error: "This proposal has already been settled." },
      { status: 409 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  // What the row says now — the update below is conditional on it.
  const prev = proposal.status;

  const pay = await paymentModel();
  const recorded = await db.$transaction(async (tx) => {
    const changed = await tx.proposal.updateMany({
      where: { id: proposal.id, status: prev },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedIp: ip ?? undefined },
    });
    if (!changed.count) return false;
    await tx.activityEvent.create({
      data: {
        organizationId: proposal.organizationId,
        proposalId: proposal.id,
        clientId: proposal.clientId,
        kind: "ACCEPTED",
        summary: acceptedName + " accepted the proposal",
        meta: JSON.stringify({ ip, acceptedName }),
      },
    });
    return true;
  });
  if (!recorded) return NextResponse.json({ error: "This proposal changed. Refresh the page and try again." }, { status: 409 });

  trackActivation("proposal_approved", proposal.organizationId, { via: "client" });

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

  // No way back from the portal (owner, 2026-09-23): an acceptance is final
  // for the client; ../revert refuses an accept claim. Undoing one is the
  // contractor's call, in the dashboard.
  return NextResponse.json({ ok: true, jobId, pay });
}

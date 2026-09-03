import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { InstallmentStatus } from "@/lib/prismaEnums";
import { resolveSchedule } from "@/lib/paymentSchedule";
import { verifyCheckoutRef } from "@/lib/payments/verify";

// Public (portal) — polled after a hosted checkout returns with ?paid=1&ref=.
// If the webhook hasn't landed yet, asks the provider directly and settles.
export async function GET(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const gate = await rateLimitShared(`paystatus:${ipFromRequest(req)}`, 120, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const url = new URL(req.url);
  const ref = url.searchParams.get("ref")?.trim() || null;

  const proposal = await db.proposal.findUnique({
    where: { publicId },
    select: { id: true, status: true, total: true, currency: true, organization: { select: { deletedAt: true } } },
  });
  if (!proposal || proposal.organization.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Active verify: the ref we were given, else the single open checkout.
  let verified: string | null = null;
  const pendingRefs = await db.installment.findMany({
    where: { proposalId: proposal.id, status: InstallmentStatus.PENDING, checkoutRef: { not: null } },
    select: { checkoutRef: true },
    distinct: ["checkoutRef"],
  });
  const candidate =
    ref && pendingRefs.some((p) => p.checkoutRef === ref)
      ? ref
      : pendingRefs.length === 1
        ? pendingRefs[0].checkoutRef
        : null;
  if (candidate) {
    const v = await verifyCheckoutRef(proposal.id, candidate);
    verified = v.state;
  }

  const fresh = await db.proposal.findUnique({
    where: { id: proposal.id },
    select: { status: true, installments: { orderBy: { position: "asc" } } },
  });
  const schedule = resolveSchedule({
    total: proposal.total,
    currency: proposal.currency,
    installments: fresh?.installments ?? [],
  });
  return NextResponse.json({
    proposalStatus: fresh?.status ?? proposal.status,
    remainingMinor: schedule.remainingMinor,
    paidMinor: schedule.paidMinor,
    pending: schedule.stages.some((s) => s.status === "PENDING"),
    verified,
    stages: schedule.stages.map((s) => ({ id: s.id, status: s.status, amountMinor: s.amountMinor })),
  });
}

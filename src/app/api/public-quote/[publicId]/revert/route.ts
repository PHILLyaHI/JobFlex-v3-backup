import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";
import { verifyRevert } from "@/lib/quoteRevert";
import { appBaseUrl } from "@/lib/appUrl";
import { sendToMembersByPref } from "@/lib/notificationPrefs";
import { buildOwnerReverted } from "@/lib/email/build/operator";

// Public proposal REVERT — the homeowner takes back an accept or a decline
// they did not mean, from the same page, while it is still open.
//
// Guarded by the signed token ../accept and ../decline hand back (see
// lib/quoteRevert.ts): it names the proposal, the action, the status to put
// back and the job the accept created. Without a valid token there is nothing
// here to call. A PAID proposal can never be reverted — money has moved.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await ctx.params;
  const gate = await rateLimitShared(`quote-respond:${ipFromRequest(req)}`, 20, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const claim = verifyRevert((body as { token?: unknown })?.token);
  if (!claim) return NextResponse.json({ error: "This change can no longer be reverted." }, { status: 403 });

  const proposal = await db.proposal.findUnique({
    where: { publicId },
    include: { client: true, organization: { select: { deletedAt: true, name: true, logoUrl: true, phone: true } } },
  });
  if (!proposal || proposal.organization.deletedAt || proposal.id !== claim.p) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The token says what was done; the row must still say the same thing.
  const expected = claim.a === "accept" ? "ACCEPTED" : "DECLINED";
  if (proposal.status === "PAID") {
    return NextResponse.json({ error: "A payment has been made — this can't be reverted." }, { status: 409 });
  }
  if (proposal.status !== expected) {
    // Already put back (double tap, two tabs): idempotent.
    if (proposal.status === claim.prev) return NextResponse.json({ ok: true, alreadyReverted: true });
    return NextResponse.json({ error: "This proposal has changed since — reload the page." }, { status: 409 });
  }

  // Only ever back to an OPEN state. `prev` is whatever the row held before the
  // click (SENT / VIEWED / …); anything settled-looking is refused outright so
  // a forged-looking claim cannot promote a proposal.
  const prev = ["SENT", "VIEWED", "DRAFT"].includes(claim.prev) ? claim.prev : "VIEWED";

  await db.proposal.update({
    where: { id: proposal.id },
    data:
      claim.a === "accept"
        ? { status: prev, acceptedAt: null, acceptedIp: null }
        : { status: prev, declinedAt: null },
  });

  // The job the accept auto-created goes with it — but ONLY while nobody has
  // touched it. Anything hung off it since (a crew, a receipt, a photo, a
  // message, a change order) means the office has started work on it, and a
  // homeowner's second thought must not delete that.
  let jobRemoved = false;
  if (claim.a === "accept" && claim.j) {
    const job = await db.job.findFirst({
      where: { id: claim.j, organizationId: proposal.organizationId, proposalId: proposal.id },
      include: {
        _count: {
          select: { assignments: true, photos: true, expenses: true, messages: true, changeOrders: true, reviewRequests: true },
        },
      },
    });
    if (job && Object.values(job._count).every((n) => n === 0)) {
      await db.jobEvent.deleteMany({ where: { jobId: job.id } });
      await db.job.delete({ where: { id: job.id } });
      jobRemoved = true;
    }
  }

  const ip = ipFromRequest(req);
  const what = claim.a === "accept" ? "acceptance" : "decline";
  await db.activityEvent.create({
    data: {
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      clientId: proposal.clientId,
      kind: "REVERTED",
      summary: `${proposal.client?.name ?? "Client"} took back their ${what}`,
      meta: JSON.stringify({ action: claim.a, restored: prev, jobRemoved, ip }),
    },
  });

  // The office already got the "accepted" or "declined" email; it must get
  // this one too, or the earlier one stands as the last word. Gated by the
  // same preference as the event it cancels.
  try {
    const appUrl = await appBaseUrl();
    await sendToMembersByPref(
      proposal.organizationId,
      claim.a === "accept" ? "proposal-accepted" : "proposal-declined",
      buildOwnerReverted({
        org: { name: proposal.organization.name, logoUrl: proposal.organization.logoUrl, phone: proposal.organization.phone },
        clientName: proposal.client?.name ?? "A client",
        title: proposal.title,
        action: claim.a,
        total: proposal.total,
        href: `${appUrl}/dashboard/proposals/${proposal.id}`,
      }),
    );
  } catch (err) {
    console.warn("[revert] office email failed", err);
  }

  return NextResponse.json({ ok: true, status: prev, jobRemoved });
}

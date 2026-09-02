import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitShared, ipFromRequest, HOUR } from "@/lib/rateLimit";

// Public proposal decline. Mirrors ../accept, but a short note is REQUIRED so
// the contractor learns why. The note is recorded on the DECLINED ActivityEvent
// (no schema field — the activity trail is the record of record for this).
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
  const rawNote = (body as { note?: unknown })?.note;
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (!note) {
    return NextResponse.json({ error: "A note is required to decline." }, { status: 400 });
  }
  // Cap length defensively — this is an unauthenticated, public endpoint.
  const safeNote = note.slice(0, 2000);

  const proposal = await db.proposal.findUnique({
    where: { publicId },
    include: { client: true },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Don't let a settled deal be flipped. Already-declined is idempotent.
  if (proposal.status === "ACCEPTED" || proposal.status === "PAID") {
    return NextResponse.json(
      { error: "This proposal has already been accepted." },
      { status: 409 },
    );
  }
  if (proposal.status === "DECLINED") {
    return NextResponse.json({ ok: true, alreadyDeclined: true });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  await db.proposal.update({
    where: { id: proposal.id },
    data: { status: "DECLINED", declinedAt: new Date() },
  });

  await db.activityEvent.create({
    data: {
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      clientId: proposal.clientId,
      kind: "DECLINED",
      summary: `${proposal.client?.name ?? "Client"} declined: ${safeNote}`,
      meta: JSON.stringify({ note: safeNote, ip }),
    },
  });

  return NextResponse.json({ ok: true });
}

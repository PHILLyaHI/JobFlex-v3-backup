"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";

// A change order amends a contract. It attaches to either a Job (legacy) or a
// Proposal (the contract itself). Exactly one parent is provided.
const coInput = z
  .object({
    jobId: z.string().optional(),
    proposalId: z.string().optional(),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    amount: z.number(),
    send: z.boolean().default(false),
  })
  .refine((d) => Boolean(d.jobId) !== Boolean(d.proposalId), {
    message: "Provide exactly one of jobId or proposalId.",
  });

export async function createChangeOrder(raw: unknown) {
  const { organizationId, user } = await requireManager();
  const data = coInput.parse(raw);

  // Ownership-gate whichever parent the change order hangs off.
  if (data.jobId) {
    const job = await db.job.findUnique({ where: { id: data.jobId } });
    if (!job || job.organizationId !== organizationId) throw new Error("Not found");
  } else if (data.proposalId) {
    const proposal = await db.proposal.findUnique({ where: { id: data.proposalId } });
    if (!proposal || proposal.organizationId !== organizationId) throw new Error("Not found");
  }

  const co = await db.changeOrder.create({
    data: {
      organizationId,
      jobId: data.jobId ?? null,
      proposalId: data.proposalId ?? null,
      title: data.title,
      description: data.description ?? null,
      amount: data.amount,
      status: data.send ? "SENT" : "DRAFT",
      sentAt: data.send ? new Date() : null,
    },
  });

  if (data.send) {
    await emailChangeOrder(co.id).catch((err) => console.warn("[createChangeOrder] email failed:", err));
  }

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: data.proposalId ?? null,
      kind: data.send ? "SENT" : "CREATED",
      summary: `${data.send ? "Sent" : "Drafted"} change order "${co.title}"`,
    },
  });

  revalidateForChangeOrder(data.jobId ?? null, data.proposalId ?? null);
  return { id: co.id, publicToken: co.publicToken };
}

export async function sendChangeOrder(id: string) {
  const { organizationId, user } = await requireManager();
  const co = await db.changeOrder.findUnique({ where: { id } });
  if (!co || co.organizationId !== organizationId) throw new Error("Not found");
  if (co.status !== "DRAFT") throw new Error("Only draft change orders can be sent.");

  await db.changeOrder.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });

  await emailChangeOrder(id).catch((err) => console.warn("[sendChangeOrder] email failed:", err));

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      proposalId: co.proposalId ?? null,
      kind: "SENT",
      summary: `Sent change order "${co.title}"`,
    },
  });

  revalidateForChangeOrder(co.jobId, co.proposalId);
  return { ok: true };
}

export async function deleteChangeOrder(id: string) {
  const { organizationId } = await requireManager();
  const co = await db.changeOrder.findUnique({ where: { id } });
  if (!co || co.organizationId !== organizationId) throw new Error("Not found");
  if (co.status !== "DRAFT") throw new Error("Only drafts can be deleted.");
  await db.changeOrder.delete({ where: { id } });
  revalidateForChangeOrder(co.jobId, co.proposalId);
}

// Called from the public approval route (no auth; token-gated).
export async function approveChangeOrderPublic(token: string, ip: string | null) {
  const co = await db.changeOrder.findUnique({ where: { publicToken: token } });
  if (!co) throw new Error("Not found");
  if (co.status === "APPROVED" || co.status === "DECLINED") return;

  await db.changeOrder.update({
    where: { id: co.id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedIp: ip ?? undefined },
  });

  // Proposal-scoped: the approved delta updates the contract value, so the
  // proposal's total reflects the amended scope everywhere it's read.
  if (co.proposalId) {
    await db.proposal.update({
      where: { id: co.proposalId },
      data: { subtotal: { increment: co.amount }, total: { increment: co.amount } },
    });
  }

  await db.activityEvent.create({
    data: {
      organizationId: co.organizationId,
      proposalId: co.proposalId ?? null,
      kind: "ACCEPTED",
      summary: `Client approved change order "${co.title}"`,
    },
  });
  revalidateForChangeOrder(co.jobId, co.proposalId);
}

export async function declineChangeOrderPublic(token: string) {
  const co = await db.changeOrder.findUnique({ where: { publicToken: token } });
  if (!co) throw new Error("Not found");
  if (co.status === "APPROVED" || co.status === "DECLINED") return;
  await db.changeOrder.update({
    where: { id: co.id },
    data: { status: "DECLINED", declinedAt: new Date() },
  });
  await db.activityEvent.create({
    data: {
      organizationId: co.organizationId,
      proposalId: co.proposalId ?? null,
      kind: "DECLINED",
      summary: `Client declined change order "${co.title}"`,
    },
  });
  revalidateForChangeOrder(co.jobId, co.proposalId);
}

// ── helpers ───────────────────────────────────────────

function revalidateForChangeOrder(jobId: string | null, proposalId: string | null) {
  if (jobId) revalidatePath(`/dashboard/jobs/${jobId}`);
  if (proposalId) revalidatePath(`/dashboard/proposals/${proposalId}`);
  revalidatePath("/dashboard/proposals");
}

// Resolve the client + contract context from whichever parent and email the
// approval link. Best-effort: callers swallow errors so a send never blocks.
async function emailChangeOrder(id: string) {
  const co = await db.changeOrder.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true, logoUrl: true, phone: true } },
      job: { include: { client: true, proposal: { select: { total: true } } } },
      proposal: { select: { title: true, total: true, client: true } },
    },
  });
  if (!co) return;
  const client = co.proposal?.client ?? co.job?.client ?? null;
  if (!client?.email) return;

  const contextTitle = co.proposal?.title ?? co.job?.title ?? "your project";
  const { sendEmail } = await import("@/lib/sdk/resend");
  const { renderEmail } = await import("@/lib/email/renderEmail");
  const { buildChangeOrder } = await import("@/lib/email/build/client");
  const appUrl = await appBaseUrl();
  // Prefer the CO's own proposal total; fall back to the parent job's linked
  // proposal. If neither resolves (e.g. a job with no proposal at all), leave
  // it unset — buildChangeOrder suppresses the "Agreed contract" row rather
  // than printing a lying $0 (Task 5 fix round 1, Finding B).
  const previousTotal = co.proposal?.total ?? co.job?.proposal?.total ?? null;
  const { subject, html } = renderEmail(
    buildChangeOrder({
      org: { name: co.organization.name, logoUrl: co.organization.logoUrl, phone: co.organization.phone },
      clientName: client.name,
      contextTitle,
      coTitle: co.title,
      description: co.description,
      amount: co.amount,
      previousTotal,
      href: `${appUrl}/co/${co.publicToken}`,
    }),
  );
  await sendEmail({ to: client.email, subject, html });
}

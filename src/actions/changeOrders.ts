"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";

const coInput = z.object({
  jobId: z.string(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  amount: z.number(),
  send: z.boolean().default(false),
});

export async function createChangeOrder(raw: unknown) {
  const { organizationId, user } = await requireOrg();
  const data = coInput.parse(raw);

  const job = await db.job.findUnique({ where: { id: data.jobId } });
  if (!job || job.organizationId !== organizationId) throw new Error("Not found");

  const co = await db.changeOrder.create({
    data: {
      organizationId,
      jobId: data.jobId,
      title: data.title,
      description: data.description ?? null,
      amount: data.amount,
      status: data.send ? "SENT" : "DRAFT",
      sentAt: data.send ? new Date() : null,
    },
  });

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: data.send ? "SENT" : "CREATED",
      summary: `${data.send ? "Sent" : "Drafted"} change order "${co.title}"`,
    },
  });

  revalidatePath(`/dashboard/jobs/${data.jobId}`);
  return { id: co.id, publicToken: co.publicToken };
}

export async function sendChangeOrder(id: string) {
  const { organizationId, user } = await requireOrg();
  const co = await db.changeOrder.findUnique({ where: { id } });
  if (!co || co.organizationId !== organizationId) throw new Error("Not found");
  if (co.status !== "DRAFT") throw new Error("Only draft change orders can be sent.");

  await db.changeOrder.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });

  // Best-effort email via Resend
  try {
    const { db: database } = await import("@/lib/db");
    const full = await database.changeOrder.findUnique({
      where: { id },
      include: {
        job: {
          include: {
            client: true,
            organization: { select: { name: true } },
          },
        },
      },
    });
    if (full?.job.client?.email) {
      const { sendEmail } = await import("@/lib/sdk/resend");
      const { wrapEmail } = await import("@/lib/email/render");
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const wrapped = wrapEmail({
        subject: `Change order for ${full.job.title}`,
        body: `Hi ${full.job.client.name},

We have a change to the contract on "${full.job.title}" that needs your sign-off:

${full.title}
${full.amount >= 0 ? "+" : "−"}$${Math.abs(full.amount).toLocaleString()}

${full.description ?? ""}

Review and approve here:
${appUrl}/co/${full.publicToken}

— ${full.job.organization.name}`,
        orgName: full.job.organization.name,
      });
      await sendEmail({
        to: full.job.client.email,
        subject: wrapped.subject,
        html: wrapped.html,
      });
    }
  } catch (err) {
    console.warn("[sendChangeOrder] email failed:", err);
  }

  await db.activityEvent.create({
    data: {
      organizationId,
      actorId: user.id,
      kind: "SENT",
      summary: `Sent change order "${co.title}"`,
    },
  });

  revalidatePath(`/dashboard/jobs/${co.jobId}`);
  return { ok: true };
}

export async function deleteChangeOrder(id: string) {
  const { organizationId } = await requireOrg();
  const co = await db.changeOrder.findUnique({ where: { id } });
  if (!co || co.organizationId !== organizationId) throw new Error("Not found");
  if (co.status !== "DRAFT") throw new Error("Only drafts can be deleted.");
  await db.changeOrder.delete({ where: { id } });
  revalidatePath(`/dashboard/jobs/${co.jobId}`);
}

// Called from the public approval route (no auth; token-gated)
export async function approveChangeOrderPublic(token: string, ip: string | null) {
  const co = await db.changeOrder.findUnique({ where: { publicToken: token } });
  if (!co) throw new Error("Not found");
  if (co.status === "APPROVED" || co.status === "DECLINED") return;
  await db.changeOrder.update({
    where: { id: co.id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedIp: ip ?? undefined },
  });
  await db.activityEvent.create({
    data: {
      organizationId: co.organizationId,
      kind: "ACCEPTED",
      summary: `Client approved change order "${co.title}"`,
    },
  });
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
      kind: "DECLINED",
      summary: `Client declined change order "${co.title}"`,
    },
  });
}

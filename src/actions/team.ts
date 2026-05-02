"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireOrg, requireUser } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { Role } from "@/lib/prismaEnums";

const inviteInput = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "SALES", "ESTIMATOR", "INSTALLER", "ACCOUNTANT", "USER"]),
});

export async function createInvite(raw: unknown) {
  const { organizationId, user } = await requireOrg();
  const data = inviteInput.parse(raw);

  const email = data.email.toLowerCase().trim();

  // If the user already has a membership here, error
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    const m = await db.membership.findFirst({
      where: { userId: existing.id, organizationId },
    });
    if (m) throw new Error("That person is already on your team.");
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

  const invite = await db.invite.create({
    data: {
      organizationId,
      email,
      role: data.role,
      token,
      invitedById: user.id,
      expiresAt,
    },
  });

  // Best-effort email
  try {
    const { sendEmail } = await import("@/lib/sdk/resend");
    const { wrapEmail } = await import("@/lib/email/render");
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const wrapped = wrapEmail({
      subject: `Invitation to ${org?.name ?? "JobFlex"}`,
      body: `${user.name ?? user.email} has invited you to join ${org?.name ?? "their team"} on JobFlex as ${data.role.toLowerCase()}.

Accept here (link expires in 7 days):
${appUrl}/auth/invite/${token}`,
      orgName: org?.name ?? "JobFlex",
    });
    await sendEmail({ to: email, subject: wrapped.subject, html: wrapped.html });
  } catch (err) {
    console.warn("[createInvite] email failed:", err);
  }

  revalidatePath("/dashboard/settings/team");
  return { id: invite.id, token };
}

export async function revokeInvite(id: string) {
  const { organizationId } = await requireOrg();
  const invite = await db.invite.findUnique({ where: { id } });
  if (!invite || invite.organizationId !== organizationId) throw new Error("Not found");
  await db.invite.delete({ where: { id } });
  revalidatePath("/dashboard/settings/team");
}

export async function acceptInvite(token: string) {
  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite) throw new Error("This invite doesn't exist or was revoked.");
  if (invite.acceptedAt) throw new Error("This invite was already accepted.");
  if (invite.expiresAt < new Date()) throw new Error("This invite has expired.");

  // Find or create the user
  let user = await db.user.findUnique({ where: { email: invite.email } });
  let requiresLogin = false;
  if (!user) {
    user = await db.user.create({
      data: {
        email: invite.email,
        name: invite.email.split("@")[0],
      },
    });
    requiresLogin = true;
  }

  // Create membership
  await db.membership.upsert({
    where: {
      userId_organizationId: { userId: user.id, organizationId: invite.organizationId },
    },
    update: { role: invite.role },
    create: {
      userId: user.id,
      organizationId: invite.organizationId,
      role: invite.role,
    },
  });

  await db.invite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  // Set active org if user doesn't have one
  if (!user.activeOrgId) {
    await db.user.update({
      where: { id: user.id },
      data: { activeOrgId: invite.organizationId },
    });
  }

  await db.activityEvent.create({
    data: {
      organizationId: invite.organizationId,
      actorId: user.id,
      kind: "CREATED",
      summary: `${user.name ?? user.email} joined the team as ${invite.role.toLowerCase()}`,
    },
  });

  revalidatePath("/dashboard/settings/team");
  return { ok: true, requiresLogin };
}

export async function declineInvite(token: string) {
  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite) return { ok: true };
  await db.invite.delete({ where: { id: invite.id } });
  return { ok: true };
}

export async function updateMembershipRole(membershipId: string, role: string) {
  const { organizationId } = await requireOrg();
  const m = await db.membership.findUnique({ where: { id: membershipId } });
  if (!m || m.organizationId !== organizationId) throw new Error("Not found");
  if (!["OWNER", "ADMIN", "SALES", "ESTIMATOR", "INSTALLER", "ACCOUNTANT", "USER"].includes(role))
    throw new Error("Invalid role");
  await db.membership.update({ where: { id: membershipId }, data: { role } });
  revalidatePath("/dashboard/settings/team");
}

export async function removeMember(membershipId: string) {
  const { organizationId } = await requireOrg();
  const m = await db.membership.findUnique({ where: { id: membershipId } });
  if (!m || m.organizationId !== organizationId) throw new Error("Not found");
  // Prevent removing the last OWNER
  if (m.role === Role.OWNER) {
    const owners = await db.membership.count({
      where: { organizationId, role: Role.OWNER },
    });
    if (owners <= 1) throw new Error("Can't remove the last owner.");
  }
  await db.membership.delete({ where: { id: membershipId } });
  revalidatePath("/dashboard/settings/team");
}

export async function switchActiveOrg(organizationId: string) {
  const user = await requireUser();
  const m = await db.membership.findFirst({
    where: { userId: user.id, organizationId },
  });
  if (!m) throw new Error("You're not a member of that organization.");
  await db.user.update({
    where: { id: user.id },
    data: { activeOrgId: organizationId },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { INFLUENCER_TOKEN_PREFIX, sendInfluencerInviteEmail } from "@/lib/influencerInvite";
import { InfluencerStatus } from "@/lib/prismaEnums";

// Public + admin actions for the influencer invite → set-password flow.
// Mirrors the hardened user reset flow: hashed single-use tokens, atomic burn,
// ONE generic error for every failure mode so a token can't be probed.

const INVALID_LINK = "This link is invalid or has expired. Ask your JobFlex contact for a fresh invite.";

const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

/** Public: consume an invite token and set the influencer's password. */
export async function completeInfluencerSetPassword(raw: unknown): Promise<{ ok: true }> {
  const data = setPasswordSchema.parse(raw);
  const tokenHash = hashToken(data.token);
  // bcrypt before the transaction so the slow hash never holds it open.
  const hashedPassword = await bcrypt.hash(data.password, 10);

  await db.$transaction(async (tx) => {
    const record = await tx.verificationToken.findUnique({ where: { token: tokenHash } });
    if (
      !record ||
      record.expires < new Date() ||
      !record.identifier.startsWith(INFLUENCER_TOKEN_PREFIX)
    ) {
      throw new Error(INVALID_LINK);
    }
    const email = record.identifier.slice(INFLUENCER_TOKEN_PREFIX.length);
    const influencer = await tx.influencer.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (
      !influencer ||
      influencer.status === InfluencerStatus.SUSPENDED ||
      influencer.status === InfluencerStatus.TERMINATED
    ) {
      throw new Error(INVALID_LINK);
    }
    await tx.influencer.update({
      where: { id: influencer.id },
      data: {
        hashedPassword,
        // A PENDING partner completing their invite becomes ACTIVE.
        ...(influencer.status === InfluencerStatus.PENDING ? { status: InfluencerStatus.ACTIVE } : {}),
      },
    });
    // Single-use: burn this link and any siblings for the same influencer.
    await tx.verificationToken.deleteMany({ where: { identifier: record.identifier } });
  });

  return { ok: true };
}

/** Admin: re-send (rotate) the invite. Returns the fresh link for the copy row. */
export async function sendInfluencerInvite(influencerId: string): Promise<{ inviteUrl: string }> {
  await requirePlatformAdmin();
  const influencer = await db.influencer.findUnique({
    where: { id: influencerId },
    select: {
      email: true,
      displayName: true,
      status: true,
      promoCodes: { where: { active: true }, orderBy: { createdAt: "asc" }, take: 1, select: { code: true } },
    },
  });
  if (!influencer) throw new Error("Influencer not found");
  if (influencer.status === InfluencerStatus.SUSPENDED || influencer.status === InfluencerStatus.TERMINATED) {
    throw new Error("This partner is suspended — reactivate them before sending an invite.");
  }
  const { inviteUrl } = await sendInfluencerInviteEmail({
    email: influencer.email,
    displayName: influencer.displayName,
    code: influencer.promoCodes[0]?.code ?? null,
  });
  revalidatePath("/admin/influencers");
  return { inviteUrl };
}

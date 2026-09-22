"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { INFLUENCER_TOKEN_PREFIX, sendInfluencerInviteEmail } from "@/lib/influencerInvite";
import { InfluencerStatus } from "@/lib/prismaEnums";
import { refusal, refused, type ActionResult } from "@/lib/actionResult";

// Public + admin actions for the influencer invite → set-password flow.
// Mirrors the hardened user reset flow: hashed single-use tokens, atomic burn,
// ONE generic error for every failure mode so a token can't be probed. The
// refusal is RETURNED (lib/actionResult): thrown, it reached the form only on
// the dev server — production redacts it, and the form fell back to a guess.

const INVALID_LINK = "This link is invalid or has expired. Ask your JobFlex contact for a fresh invite.";

const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

class InvalidLink extends Error {}

/** Public: consume an invite token and set the influencer's password. */
export async function completeInfluencerSetPassword(raw: unknown): Promise<ActionResult> {
  const parsed = setPasswordSchema.safeParse(raw);
  if (!parsed.success) return refusal(parsed.error);
  const data = parsed.data;
  const tokenHash = hashToken(data.token);
  // The token is looked at BEFORE the slow hash: a caller with no valid link
  // used to cost a bcrypt round (~100 ms of CPU) per request.
  const live = await db.verificationToken.findUnique({
    where: { token: tokenHash },
    select: { expires: true, identifier: true },
  });
  if (!live || live.expires < new Date() || !live.identifier.startsWith(INFLUENCER_TOKEN_PREFIX)) {
    return refused(INVALID_LINK);
  }
  // bcrypt before the transaction so the slow hash never holds it open.
  const hashedPassword = await bcrypt.hash(data.password, 10);

  try {
    await db.$transaction(async (tx) => {
      const record = await tx.verificationToken.findUnique({ where: { token: tokenHash } });
      if (
        !record ||
        record.expires < new Date() ||
        !record.identifier.startsWith(INFLUENCER_TOKEN_PREFIX)
      ) {
        throw new InvalidLink(INVALID_LINK);
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
        throw new InvalidLink(INVALID_LINK);
      }
      await tx.influencer.update({
        where: { id: influencer.id },
        data: {
          hashedPassword,
          // Every session issued before this moment is out: the JWT carries
          // the version it was stamped with (lib/auth) and requireInfluencer
          // refuses a stale one on the next request.
          sessionVersion: { increment: 1 },
          // A PENDING partner completing their invite becomes ACTIVE.
          ...(influencer.status === InfluencerStatus.PENDING ? { status: InfluencerStatus.ACTIVE } : {}),
        },
      });
      // Single-use: burn this link and any siblings for the same influencer.
      await tx.verificationToken.deleteMany({ where: { identifier: record.identifier } });
    });
  } catch (err) {
    if (err instanceof InvalidLink) return refused(INVALID_LINK);
    throw err;
  }

  return { ok: true };
}

/** Admin: re-send (rotate) the invite. Returns the fresh link for the copy row. */
export async function sendInfluencerInvite(influencerId: string): Promise<ActionResult<{ inviteUrl: string }>> {
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
  if (!influencer) return refused("Influencer not found");
  if (influencer.status === InfluencerStatus.SUSPENDED || influencer.status === InfluencerStatus.TERMINATED) {
    return refused("This partner is suspended — reactivate them before sending an invite.");
  }
  const { inviteUrl } = await sendInfluencerInviteEmail({
    email: influencer.email,
    displayName: influencer.displayName,
    code: influencer.promoCodes[0]?.code ?? null,
  });
  revalidatePath("/admin/influencers");
  return { ok: true, inviteUrl };
}

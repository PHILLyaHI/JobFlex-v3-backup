"use server";
import { revalidatePath } from "next/cache";
import { requireManager, requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { applyReferralReward } from "@/lib/referralRewards";

function generateCode(seed: string) {
  // Short, shareable, not cryptographically unique — uniqueness guaranteed by DB constraint + retry loop.
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const prefix = seed
    .replace(/[^a-z]/gi, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += letters[Math.floor(Math.random() * letters.length)];
  }
  return `${prefix}-${suffix}`;
}

export async function getOrCreateMyReferralCode() {
  const { organizationId, user } = await requireManager();
  const existing = await db.referralCode.findFirst({
    where: { organizationId, userId: user.id },
  });
  if (existing) return existing;

  const seed = (user.name ?? user.email ?? "JOB").slice(0, 6);
  let code = generateCode(seed);
  // Retry on collision
  for (let i = 0; i < 5; i++) {
    try {
      const created = await db.referralCode.create({
        data: {
          organizationId,
          userId: user.id,
          code,
          rewardAmount: 50,
          rewardType: "CREDIT",
        },
      });
      return created;
    } catch {
      code = generateCode(seed);
    }
  }
  throw new Error("Couldn't generate a unique code");
}

// ── platform admin: /admin/referrals queue ────────────────────────────────────

/** Retry the automated 50%-of-a-month Stripe credit for a CONVERTED conversion. */
export async function adminRetryReferralCredit(conversionId: string) {
  await requirePlatformAdmin();
  const result = await applyReferralReward(conversionId);
  revalidatePath("/admin/referrals");
  return result;
}

/**
 * Manual override: mark a conversion PAID without a Stripe credit (reward was
 * settled out of band). Records nothing on Stripe — audit lives in the note.
 */
export async function adminMarkReferralPaid(conversionId: string, note?: string) {
  await requirePlatformAdmin();
  const conv = await db.referralConversion.findUnique({ where: { id: conversionId } });
  if (!conv) throw new Error("Conversion not found");
  if (conv.status === "PENDING") throw new Error("Not converted yet — the referred org hasn't paid.");
  if (conv.rewardAppliedAt) throw new Error("Reward was already applied.");
  await db.referralConversion.update({
    where: { id: conversionId },
    data: {
      status: "PAID",
      rewardAppliedAt: new Date(),
      note: note?.trim() ? `${conv.note ? `${conv.note} · ` : ""}${note.trim()}` : conv.note,
    },
  });
  revalidatePath("/admin/referrals");
}

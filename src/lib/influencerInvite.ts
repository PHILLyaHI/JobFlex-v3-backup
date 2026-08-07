import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { hashToken } from "@/lib/tokens";

// Influencer invite links, riding the VerificationToken table. The identifier
// is prefix-namespaced so these tokens can never be consumed by the user
// password-reset flow (which resolves identifiers as plain User emails), and
// vice versa. Same posture as resets: hashed at rest, single-use, expiring.
export const INFLUENCER_TOKEN_PREFIX = "influencer:";
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days — invites are slower than resets

export async function mintInfluencerInvite(email: string): Promise<{ inviteUrl: string }> {
  const identifier = `${INFLUENCER_TOKEN_PREFIX}${email.toLowerCase()}`;
  // One live link per influencer — a fresh invite invalidates prior ones.
  await db.verificationToken.deleteMany({ where: { identifier } });
  const rawToken = randomBytes(32).toString("hex");
  await db.verificationToken.create({
    data: {
      identifier,
      token: hashToken(rawToken),
      expires: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  const appUrl = await appBaseUrl();
  return { inviteUrl: `${appUrl}/influencer/set-password?token=${rawToken}` };
}

/**
 * Mint an invite and email it (best-effort — the returned inviteUrl is always
 * valid, so the admin sheet can hand the link over even when email is stubbed).
 */
export async function sendInfluencerInviteEmail(opts: {
  email: string;
  displayName: string;
  code?: string | null;
}): Promise<{ inviteUrl: string }> {
  const { inviteUrl } = await mintInfluencerInvite(opts.email);
  try {
    const { sendEmail } = await import("@/lib/sdk/resend");
    const { renderEmail } = await import("@/lib/email/renderEmail");
    const { buildPartnerInvite } = await import("@/lib/email/build/platform");
    const { subject, html } = renderEmail(
      buildPartnerInvite({ name: opts.displayName, code: opts.code, href: inviteUrl }),
    );
    await sendEmail({ to: opts.email, subject, html });
  } catch (err) {
    console.warn("[influencerInvite] email failed:", err);
  }
  return { inviteUrl };
}

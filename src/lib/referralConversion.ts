// Records a PENDING referral conversion from the public homeowner intake.
// Plain server module — it used to be an exported server action, i.e. a public
// endpoint anyone could hit to fabricate conversions against any code.
import { db } from "@/lib/db";

export async function recordReferralConversion(code: string, signupEmail: string) {
  const ref = await db.referralCode.findUnique({ where: { code } });
  if (!ref) return { skipped: true as const };
  await db.referralConversion.create({
    data: {
      codeId: ref.id,
      signupEmail,
      status: "PENDING",
    },
  });
  // Bell + referrals badge for the REFERRER's org — a signup on your link is
  // news you shouldn't have to visit the referrals page to learn. Best-effort:
  // the conversion stands even if the event write fails.
  if (ref.organizationId) {
    await db.activityEvent
      .create({
        data: {
          organizationId: ref.organizationId,
          kind: "CREATED",
          summary: `Someone signed up with your referral link (${signupEmail})`,
        },
      })
      .catch(() => {});
  }
  return { skipped: false as const, codeId: ref.id };
}

// Referrals — the ONE loader both editions read.
//
// /dashboard/referrals (desktop sheet + handheld build behind the viewport
// switch) and the /mobile-referrals-v2 preview route call this, so the code,
// the two share links, the stat tiles and every conversion row are the same
// database rows on every screen. The query is the archived classic page's —
// same `getOrCreateMyReferralCode()` call, same counts, same PAID-reward
// aggregate, same `appBaseUrl()` links.

import { redirect } from "next/navigation";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { relative } from "@/lib/format";
import { getOrCreateMyReferralCode } from "@/actions/referrals";
import { REFERRAL_REWARD_PCT } from "@/lib/referralRewards";
import type { ReferralsContentProps } from "@/components/v3/referrals-blueprint/referrals-content";
import type {
  Conversion,
  ConversionStatus,
} from "@/components/v3/referrals-blueprint/referrals-data";

/** Everything the desktop sheet takes, plus the programme's reward percentage
 *  (lib/referralRewards is the source of truth; the handheld build prints it). */
export type ReferralsProps = ReferralsContentProps & { rewardPct: number };

/** `status` is a free String column; anything unrecognised reads as PENDING,
 *  which is the state that promises nothing. */
function asStatus(raw: string): ConversionStatus {
  return raw === "PAID" || raw === "CONVERTED" ? raw : "PENDING";
}

/**
 * @param nextPath where the login redirect should return to — the route that
 *   called this, so a preview URL comes back to the preview.
 */
export async function loadReferralsProps(nextPath: string): Promise<ReferralsProps> {
  try {
    await requireOrg();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  // `getOrCreateMyReferralCode` is manager-gated (requireManager). A limited
  // role has no code to show, so it goes where every other manager-only surface
  // sends it rather than rendering an empty sheet.
  let code: Awaited<ReturnType<typeof getOrCreateMyReferralCode>>;
  try {
    code = await getOrCreateMyReferralCode();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const [rows, uses, converted, paid, pending, credited] = await Promise.all([
    db.referralConversion.findMany({
      where: { codeId: code.id },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.referralConversion.count({ where: { codeId: code.id } }),
    db.referralConversion.count({ where: { codeId: code.id, status: "CONVERTED" } }),
    db.referralConversion.count({ where: { codeId: code.id, status: "PAID" } }),
    db.referralConversion.count({ where: { codeId: code.id, status: "PENDING" } }),
    db.referralConversion.aggregate({
      where: { codeId: code.id, status: "PAID" },
      _sum: { rewardCents: true },
    }),
  ]);

  const conversions: Conversion[] = rows.map((c) => ({
    id: c.id,
    email: c.signupEmail,
    status: asStatus(c.status),
    reward: c.rewardCents ?? 0,
    when: relative(c.createdAt),
  }));

  const appUrl = await appBaseUrl();

  return {
    code: code.code,
    signupUrl: `${appUrl}/auth/register?ref=${code.code}`,
    homeownerUrl: `${appUrl}/homeowners?ref=${code.code}`,
    conversions,
    // CONVERTED = the referred org has paid and the 50%-off-a-month credit is
    // owed; PAID = that credit already landed on this org's Stripe balance.
    uses,
    convertedCount: converted + paid,
    pendingCount: pending,
    onTheWayCount: converted,
    creditedCents: credited._sum.rewardCents ?? 0,
    rewardPct: REFERRAL_REWARD_PCT,
  };
}

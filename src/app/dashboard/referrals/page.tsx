// Referrals — Blueprint edition. Pixel-identical port of the canonical
// referrals donor (jobflex-referrals-blueprint_1.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The classic page was archived to old-design-pages/dashboard/referrals.
//
// This is NOT a fixture page: the code, the two share links, the three stat
// tiles and every conversion row are read from the database here. The query is
// the archived classic page's — same `getOrCreateMyReferralCode()` call, same
// counts, same PAID-reward aggregate, same `appBaseUrl()` links — so both
// editions describe the same referral program.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { relative } from "@/lib/format";
import { getOrCreateMyReferralCode } from "@/actions/referrals";
import { ReferralsContent } from "@/components/v3/referrals-blueprint/referrals-content";
import type {
  Conversion,
  ConversionStatus,
} from "@/components/v3/referrals-blueprint/referrals-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Referrals",
  description: "Referrals — your code, the reward, and every conversion it has earned on one sheet.",
};

/** `status` is a free String column; anything unrecognised reads as PENDING,
 *  which is the state that promises nothing. */
function asStatus(raw: string): ConversionStatus {
  return raw === "PAID" || raw === "CONVERTED" ? raw : "PENDING";
}

export default async function ReferralsPage() {
  try {
    await requireOrg();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Freferrals");
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

  return (
    <ReferralsContent
      code={code.code}
      signupUrl={`${appUrl}/auth/register?ref=${code.code}`}
      homeownerUrl={`${appUrl}/homeowners?ref=${code.code}`}
      conversions={conversions}
      // CONVERTED = the referred org has paid and the 50%-off-a-month credit is
      // owed; PAID = that credit already landed on this org's Stripe balance.
      uses={uses}
      convertedCount={converted + paid}
      pendingCount={pending}
      onTheWayCount={converted}
      creditedCents={credited._sum.rewardCents ?? 0}
    />
  );
}

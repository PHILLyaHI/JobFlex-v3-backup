import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { AdminReferralsContent, type ConversionDTO } from "@/components/v3/admin-referrals/referrals-content";

export default async function AdminReferralsPage() {
  await requirePlatformAdmin();

  const conversions = await db.referralConversion.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      code: {
        select: {
          code: true,
          organization: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  // Referred orgs' names in one sweep (signupOrgId has no Prisma relation).
  const signupOrgIds = [...new Set(conversions.map((c) => c.signupOrgId).filter((v): v is string => !!v))];
  const signupOrgs = signupOrgIds.length
    ? await db.organization.findMany({ where: { id: { in: signupOrgIds } }, select: { id: true, name: true } })
    : [];
  const orgName = new Map(signupOrgs.map((o) => [o.id, o.name]));

  const dto: ConversionDTO[] = conversions.map((c) => ({
    id: c.id,
    signupEmail: c.signupEmail,
    signupOrgName: c.signupOrgId ? (orgName.get(c.signupOrgId) ?? null) : null,
    referrerName: c.code.user.name ?? c.code.user.email ?? "—",
    referrerOrgName: c.code.organization.name,
    code: c.code.code,
    status: c.status,
    rewardCents: c.rewardCents,
    rewardAppliedAt: c.rewardAppliedAt ? c.rewardAppliedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    convertedAt: c.convertedAt ? c.convertedAt.toISOString() : null,
    note: c.note,
  }));

  return <AdminReferralsContent conversions={dto} />;
}

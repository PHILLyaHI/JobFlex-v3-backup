import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { money } from "@/lib/format";
import { ReferralsAdminClient, type ConversionDTO } from "./referrals-client";

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
  }));

  const pending = dto.filter((c) => c.status === "PENDING").length;
  const owed = dto.filter((c) => c.status === "CONVERTED" && !c.rewardAppliedAt).length;
  const creditedCents = dto
    .filter((c) => c.status === "PAID")
    .reduce((sum, c) => sum + (c.rewardCents ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Referrals"
        description="Member-to-member referrals. Conversions advance automatically when the referred workspace first pays; the referrer's 50%-of-a-month credit applies to their Stripe balance."
      />
      <StaggerGrid className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending signups" value={String(pending)} />
        <StatCard label="Credits owed" value={String(owed)} hint="converted, not yet credited" />
        <StatCard label="Credited to date" value={money(creditedCents / 100)} />
      </StaggerGrid>
      <ReferralsAdminClient conversions={dto} />
    </>
  );
}

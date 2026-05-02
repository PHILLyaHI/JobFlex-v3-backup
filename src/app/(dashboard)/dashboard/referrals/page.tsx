import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReferralHeroCard } from "@/components/referrals/ReferralHeroCard";
import { getOrCreateMyReferralCode } from "@/actions/referrals";
import { relative, money } from "@/lib/format";
import { Gift } from "lucide-react";

export default async function ReferralsPage() {
  const { organizationId, user } = await requireOrg();
  const code = await getOrCreateMyReferralCode();

  const [conversions, converted, pending] = await Promise.all([
    db.referralConversion.findMany({
      where: { codeId: code.id },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.referralConversion.count({ where: { codeId: code.id, status: "CONVERTED" } }),
    db.referralConversion.count({ where: { codeId: code.id, status: "PENDING" } }),
  ]);

  const uses = conversions.length;
  const rewardsEarned = converted * code.rewardAmount;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shareUrl = `${appUrl}/homeowners?ref=${code.code}`;

  return (
    <>
      <PageHeader
        eyebrow="Growth"
        title="Referrals"
        description={`Share your code. We track every signup that uses it — you earn ${money(code.rewardAmount)} per converted account.`}
      />
      <ReferralHeroCard
        code={code.code}
        shareUrl={shareUrl}
        rewardSummary={`Earn ${money(code.rewardAmount)} ${code.rewardType === "CREDIT" ? "in credit" : code.rewardType.toLowerCase()} for every contractor who signs up`}
      />

      <StaggerGrid className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <StatCard label="Code uses" value={String(uses)} />
        <StatCard label="Converted signups" value={String(converted)} hint={`${pending} pending`} />
        <StatCard label="Rewards earned" value={money(rewardsEarned)} />
      </StaggerGrid>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Conversions</CardTitle>
            <CardSubtitle>People who've used your code</CardSubtitle>
          </div>
        </CardHeader>
        {conversions.length === 0 ? (
          <EmptyState
            icon={<Gift className="h-5 w-5" />}
            title="No conversions yet"
            description="Share your code — conversions appear here as soon as someone signs up with it."
          />
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {conversions.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-[13px] font-medium text-[color:var(--ink)]">
                    {c.signupEmail}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] tabular">
                    {relative(c.createdAt)}
                  </div>
                </div>
                <Badge
                  tone={
                    c.status === "CONVERTED"
                      ? "success"
                      : c.status === "PAID"
                        ? "accent"
                        : "neutral"
                  }
                >
                  {c.status.toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

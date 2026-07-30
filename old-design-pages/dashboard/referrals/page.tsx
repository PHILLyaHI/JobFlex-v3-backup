import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReferralHeroCard } from "@/components/referrals/ReferralHeroCard";
import { getOrCreateMyReferralCode } from "@/actions/referrals";
import { relative, money } from "@/lib/format";
import { MarkNavSeen } from "@/components/layout/MarkNavSeen";
import { Gift } from "lucide-react";

export default async function ReferralsPage() {
  await requireOrg();
  const code = await getOrCreateMyReferralCode();

  const [conversions, converted, paid, pending, credited] = await Promise.all([
    db.referralConversion.findMany({
      where: { codeId: code.id },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.referralConversion.count({ where: { codeId: code.id, status: "CONVERTED" } }),
    db.referralConversion.count({ where: { codeId: code.id, status: "PAID" } }),
    db.referralConversion.count({ where: { codeId: code.id, status: "PENDING" } }),
    db.referralConversion.aggregate({
      where: { codeId: code.id, status: "PAID" },
      _sum: { rewardCents: true },
    }),
  ]);

  const uses = conversions.length;
  // CONVERTED = the referred org has paid; the 50%-off-a-month credit is owed.
  // PAID = that credit already landed on this org's Stripe balance.
  const creditedUsd = (credited._sum.rewardCents ?? 0) / 100;
  const appUrl = await appBaseUrl();
  const shareUrl = `${appUrl}/auth/register?ref=${code.code}`;
  const homeownerUrl = `${appUrl}/homeowners?ref=${code.code}`;

  return (
    <>
      <MarkNavSeen surface="referrals" />
      <PageHeader
        eyebrow="Growth"
        title="Referrals"
        description="Share your code. Every contractor who signs up with it and goes paid takes 50% off one month of your subscription."
      />
      <ReferralHeroCard
        code={code.code}
        shareUrl={shareUrl}
        homeownerUrl={homeownerUrl}
        rewardSummary="Each one who upgrades to a paid plan knocks 50% off a month of your own subscription — two referrals, two half-price months"
      />

      <StaggerGrid className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <StatCard label="Code uses" value={String(uses)} />
        <StatCard label="Converted signups" value={String(converted + paid)} hint={`${pending} pending`} />
        <StatCard
          label="Credit earned"
          value={money(creditedUsd)}
          hint={converted > 0 ? `${converted} credit${converted === 1 ? "" : "s"} on the way` : undefined}
        />
      </StaggerGrid>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Conversions</CardTitle>
            <CardSubtitle>People who&apos;ve used your code</CardSubtitle>
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
                  {c.status === "PAID" ? "credited" : c.status.toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

import Link from "next/link";
import { Receipt, Star, CreditCard, LifeBuoy } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { relative } from "@/lib/format";
import { PlatformStatsHero, type PlatformStats } from "@/components/admin/PlatformStatsHero";
import { planMrr } from "@/lib/planPricing";
import { getMonthlyCentsBySlugUpper } from "@/lib/planCatalogServer";

export default async function AdminHome() {
  await requirePlatformAdmin();

  const [
    orgCount,
    userCount,
    proposalCount,
    openTickets,
    activeSubs,
    influencerCount,
    planCount,
    recentOrgs,
    recentSubs,
    paidSubs,
    allOrgs,
  ] = await Promise.all([
    db.organization.count(),
    db.user.count(),
    db.proposal.count({ where: { status: { in: ["SENT", "VIEWED", "ACCEPTED", "PAID"] } } }),
    db.supportTicket.count({ where: { status: "OPEN" } }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.influencer.count({ where: { status: "ACTIVE" } }),
    db.pricingPlan.count(),
    db.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { memberships: { select: { id: true } } },
    }),
    db.subscription.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { organization: { select: { name: true } } },
    }),
    db.subscription.findMany({ where: { status: "ACTIVE" }, select: { plan: true } }),
    db.organization.findMany({ select: { createdAt: true } }),
  ]);

  const hubCards = [
    { href: "/admin/subscribers", label: "Subscribers", icon: Receipt, count: activeSubs, hint: "active subscriptions" },
    { href: "/admin/influencers", label: "Influencers", icon: Star, count: influencerCount, hint: "active affiliates" },
    { href: "/admin/plans", label: "Plans", icon: CreditCard, count: planCount, hint: "pricing tiers" },
    { href: "/admin/support", label: "Support", icon: LifeBuoy, count: openTickets, hint: "open tickets" },
  ];

  // Live catalog prices first; static planMrr only for slugs missing from it.
  const monthlyCents = await getMonthlyCentsBySlugUpper();
  const estimatedMrr = paidSubs.reduce((a, s) => {
    const cents = monthlyCents[s.plan.toUpperCase()];
    return a + (cents !== undefined ? cents / 100 : planMrr(s.plan));
  }, 0);

  // 12-week signup sparkline
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const buckets: { label: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(weekStart);
    start.setDate(start.getDate() - i * 7);
    buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, count: 0 });
  }
  for (const o of allOrgs) {
    for (let i = 0; i < buckets.length; i++) {
      const start = new Date(weekStart);
      start.setDate(start.getDate() - (11 - i) * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      if (o.createdAt >= start && o.createdAt < end) {
        buckets[i].count++;
        break;
      }
    }
  }

  const stats: PlatformStats = {
    organizations: orgCount,
    users: userCount,
    proposals: proposalCount,
    activeSubs,
    estimatedMrr,
    organizationsTrend: buckets,
  };

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Admin"
        description="Global oversight for the JobFlex platform."
      />

      <PlatformStatsHero stats={stats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {hubCards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href as never} className="block">
              <Card hover className="h-full">
                <div className="flex items-center justify-between">
                  <span className="quiet-caps">{c.label}</span>
                  <Icon className="h-4 w-4 text-[color:var(--accent)]" />
                </div>
                <div className="stat-numeric text-[30px] mt-2 leading-none">{c.count}</div>
                <div className="text-[11px] text-[color:var(--ink-muted)] mt-1">{c.hint}</div>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent organizations</CardTitle>
              <CardSubtitle>Newest signups</CardSubtitle>
            </div>
          </CardHeader>
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {recentOrgs.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-[13px] font-medium text-[color:var(--ink)]">{o.name}</div>
                  <div className="text-[11px] text-[color:var(--ink-muted)]">
                    {o.memberships.length} member{o.memberships.length === 1 ? "" : "s"} · signed up {relative(o.createdAt)}
                  </div>
                </div>
              </li>
            ))}
            {recentOrgs.length === 0 && (
              <li className="text-[12px] text-[color:var(--ink-muted)] py-3">No organizations yet.</li>
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Subscription activity</CardTitle>
              <CardSubtitle>Latest plan changes</CardSubtitle>
            </div>
          </CardHeader>
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {recentSubs.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-[13px] font-medium text-[color:var(--ink)]">
                    {s.organization.name}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)]">
                    {s.plan.toLowerCase()} · {s.status.toLowerCase()} · {relative(s.updatedAt)}
                  </div>
                </div>
              </li>
            ))}
            {recentSubs.length === 0 && (
              <li className="text-[12px] text-[color:var(--ink-muted)] py-3">No subscriptions yet.</li>
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}

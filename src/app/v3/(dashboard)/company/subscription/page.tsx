import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlanFeatureMatrix } from "@/components/billing/PlanFeatureMatrix";
import { PlanActions } from "../../../../(dashboard)/dashboard/settings/account/plan-actions";
import { money, longDate } from "@/lib/format";
import { titleCaseSlug } from "@/lib/planCatalog";
import { getPlanCatalog, getOrgPlanContext } from "@/lib/planCatalogServer";
import { getOrgLimitUsage } from "@/lib/limitsEngine";
import { LIMIT_DEFS } from "@/lib/planLimits";
import { CreditCard, Sparkles, ScrollText } from "lucide-react";

const STATUS_TONES: Record<
  string,
  "success" | "warn" | "danger" | "accent" | "neutral"
> = {
  ACTIVE: "success",
  TRIALING: "accent",
  PAST_DUE: "danger",
  CANCELED: "danger",
  EXPIRED: "danger",
  FREE: "neutral",
};

export default async function CompanyV3SubscriptionPage() {
  const { organizationId } = await requireOrg();

  const [sub, payments, planContext, plans, limitUsage] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId } }),
    db.payment.findMany({
      where: { organizationId, status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 8,
    }),
    getOrgPlanContext(organizationId),
    getPlanCatalog(),
    getOrgLimitUsage(organizationId),
  ]);

  const { plan: planDto, rawPlan } = planContext;
  const planName = planDto?.name ?? titleCaseSlug(rawPlan);
  const currentSlug = planDto?.slug ?? rawPlan.toLowerCase();
  const status = sub?.status ?? "FREE";

  // The limits engine's enforced caps — only finite ones render as bars.
  const usageRows = limitUsage
    .filter((u) => u.limit !== null)
    .map((u) => ({
      resource: u.resource,
      label: LIMIT_DEFS.find((d) => d.key === u.resource)?.label ?? u.resource,
      used: u.used,
      limit: u.limit as number,
    }));

  return (
    <div className="space-y-6">
      {/* Hero plan card */}
      <Card className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 100% 0%, color-mix(in srgb, var(--accent) 12%, transparent) 0%, transparent 60%)",
          }}
        />
        <div className="relative grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
          <div>
            <div className="flex items-center gap-2">
              <div className="quiet-caps">Your plan</div>
              <Badge tone={STATUS_TONES[status] ?? "neutral"}>
                {status.replace("_", " ").toLowerCase()}
              </Badge>
            </div>
            <div className="mt-4 flex items-end gap-4">
              <div className="font-display text-[56px] leading-[0.95] tracking-[-0.025em] text-[color:var(--ink)]">
                {planName}
              </div>
              <Sparkles className="h-5 w-5 text-[color:var(--accent)] mb-2.5" />
            </div>
            {sub?.currentPeriodEnd && (
              <div className="mt-3 text-[12px] text-[color:var(--ink-muted)] tabular">
                Next bill · {longDate(sub.currentPeriodEnd)}
              </div>
            )}
            <div className="mt-6">
              <PlanActions plans={plans} currentSlug={currentSlug} />
            </div>
          </div>

          <div className="space-y-4">
            {usageRows.length === 0 ? (
              <p className="text-[12px] text-[color:var(--ink-soft)]">
                Everything on your plan is unlimited.
              </p>
            ) : (
              usageRows.map((u) => (
                <UsageBar key={u.resource} label={u.label} used={u.used} limit={u.limit} />
              ))
            )}
            <p className="text-[10.5px] text-[color:var(--ink-muted)] leading-relaxed pt-2 border-t border-[color:var(--ink-line)]">
              Limits reset each billing cycle. Hitting one triggers a soft upgrade prompt — work isn&apos;t blocked.
            </p>
          </div>
        </div>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent payments</CardTitle>
            <CardSubtitle>Latest 8 successful charges.</CardSubtitle>
          </div>
          <ScrollText className="h-4 w-4 text-[color:var(--ink-muted)]" />
        </CardHeader>
        {payments.length === 0 ? (
          <div className="text-center py-10 text-[12px] text-[color:var(--ink-muted)]">
            <CreditCard className="h-5 w-5 mx-auto mb-2 opacity-50" />
            No payments yet.
          </div>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[1fr_180px_120px] gap-3 pb-2 mb-1 border-b border-[color:var(--ink-line)] px-1">
              <div className="quiet-caps">Method</div>
              <div className="quiet-caps">Date</div>
              <div className="quiet-caps text-right">Amount</div>
            </div>
            <ul className="divide-y divide-[color:var(--ink-line)]">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="grid grid-cols-1 md:grid-cols-[1fr_180px_120px] items-center gap-3 py-3"
                >
                  <div>
                    <div className="text-[13px] font-medium text-[color:var(--ink)] capitalize">
                      {p.method ?? p.provider.toLowerCase()}
                    </div>
                    <div className="text-[10.5px] text-[color:var(--ink-muted)] md:hidden tabular">
                      {longDate(p.paidAt ?? p.createdAt)}
                    </div>
                  </div>
                  <div className="hidden md:block text-[12px] text-[color:var(--ink-muted)] tabular">
                    {longDate(p.paidAt ?? p.createdAt)}
                  </div>
                  <span className="font-display tabular text-[15px] text-right">
                    {money(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Plan matrix */}
      <div>
        <div className="quiet-caps mb-1">Compare</div>
        <h2 className="font-display text-[22px] tracking-[-0.015em] mb-5">Feature matrix</h2>
        <PlanFeatureMatrix plans={plans} currentSlug={currentSlug} />
      </div>
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / Math.max(1, limit)) * 100);
  const tone =
    pct >= 90 ? "#E11D48" : pct >= 60 ? "#C89450" : "var(--accent)";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-[color:var(--ink-soft)] font-medium">{label}</span>
        <span className="tabular text-[color:var(--ink-muted)]">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 mt-1.5 rounded-full bg-black/[0.05] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: tone as string }}
        />
      </div>
    </div>
  );
}

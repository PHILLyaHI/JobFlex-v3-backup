import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlanFeatureMatrix } from "@/components/billing/PlanFeatureMatrix";
import { PlanActions } from "../../settings/account/plan-actions";
import { money, longDate } from "@/lib/format";
import { getOrgPlan, type Plan } from "@/lib/entitlements";

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

const PLAN_QUOTAS: Record<Plan, { proposalsPerMonth: number; aiDraftsPerMonth: number }> = {
  FREE: { proposalsPerMonth: 5, aiDraftsPerMonth: 3 },
  STARTER: { proposalsPerMonth: 25, aiDraftsPerMonth: 25 },
  PROFESSIONAL: { proposalsPerMonth: 200, aiDraftsPerMonth: 200 },
  ENTERPRISE: { proposalsPerMonth: 9999, aiDraftsPerMonth: 9999 },
};

export default async function CompanySubscriptionPage() {
  const { organizationId } = await requireOrg();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [sub, payments, proposalsThisMonth, aiDraftsThisMonth] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId } }),
    db.payment.findMany({
      where: { organizationId, status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 8,
    }),
    db.proposal.count({
      where: { organizationId, createdAt: { gte: monthStart } },
    }),
    db.aiDraft.count({
      where: { organizationId, createdAt: { gte: monthStart } },
    }),
  ]);

  const plan: Plan = getOrgPlan(sub);
  const status = sub?.status ?? "FREE";
  const quotas = PLAN_QUOTAS[plan];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Your plan</CardTitle>
              <CardSubtitle>Active subscription</CardSubtitle>
            </div>
            <Badge tone={STATUS_TONES[status] ?? "neutral"}>
              {status.replace("_", " ").toLowerCase()}
            </Badge>
          </CardHeader>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="quiet-caps mb-2">Plan</div>
              <div className="font-display text-[42px] tracking-[-0.02em] leading-none">
                {labelFor(plan)}
              </div>
              {sub?.currentPeriodEnd && (
                <div className="text-[12px] text-[color:var(--ink-muted)] mt-3 tabular">
                  Next bill · {longDate(sub.currentPeriodEnd)}
                </div>
              )}
            </div>
            <PlanActions currentPlan={plan} />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>This cycle</CardTitle>
              <CardSubtitle>Recent payments</CardSubtitle>
            </div>
          </CardHeader>
          {payments.length === 0 ? (
            <p className="text-[12px] text-[color:var(--ink-muted)]">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--ink-line)]">
              {payments.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-[12.5px] font-medium text-[color:var(--ink)]">
                      {p.method ?? p.provider.toLowerCase()}
                    </div>
                    <div className="text-[10px] text-[color:var(--ink-muted)] tabular">
                      {longDate(p.paidAt ?? p.createdAt)}
                    </div>
                  </div>
                  <span className="font-display tabular text-[14px]">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Usage bars */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Usage · this month</CardTitle>
            <CardSubtitle>
              Resets on the 1st. Hitting a limit triggers a soft upgrade prompt.
            </CardSubtitle>
          </div>
        </CardHeader>
        <div className="space-y-4">
          <UsageBar
            label="Proposals created"
            used={proposalsThisMonth}
            limit={quotas.proposalsPerMonth}
          />
          <UsageBar
            label="AI drafts generated"
            used={aiDraftsThisMonth}
            limit={quotas.aiDraftsPerMonth}
          />
        </div>
      </Card>

      <div>
        <div className="quiet-caps mb-1">Plans</div>
        <h2 className="font-display text-[20px] tracking-[-0.015em] mb-4">Feature matrix</h2>
        <PlanFeatureMatrix currentPlan={plan} />
      </div>
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / Math.max(1, limit)) * 100);
  const tone = pct >= 90 ? "#E11D48" : pct >= 60 ? "#C89450" : "var(--accent)";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-[color:var(--ink-soft)] font-medium">{label}</span>
        <span className="tabular text-[color:var(--ink-muted)]">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 mt-1.5 rounded-full bg-black/[0.05] overflow-hidden">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, background: tone }}
        />
      </div>
    </div>
  );
}

function labelFor(p: Plan) {
  return (
    {
      FREE: "Free",
      STARTER: "Starter",
      PROFESSIONAL: "Professional",
      ENTERPRISE: "Enterprise",
    } as const
  )[p];
}

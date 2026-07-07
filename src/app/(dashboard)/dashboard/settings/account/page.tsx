import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { PlanFeatureMatrix } from "@/components/billing/PlanFeatureMatrix";
import { PlanActions } from "./plan-actions";
import { money, longDate } from "@/lib/format";
import { titleCaseSlug } from "@/lib/planCatalog";
import { getPlanCatalog, getOrgPlanContext } from "@/lib/planCatalogServer";

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

export default async function AccountSettingsPage() {
  const { organizationId, user } = await requireOrg();
  const [sub, payments, planContext, plans] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId } }),
    db.payment.findMany({
      where: { organizationId, status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 12,
    }),
    getOrgPlanContext(organizationId),
    getPlanCatalog(),
  ]);

  const { plan: planDto, rawPlan } = planContext;
  const planName = planDto?.name ?? titleCaseSlug(rawPlan);
  const currentSlug = planDto?.slug ?? rawPlan.toLowerCase();
  const status = sub?.status ?? "FREE";

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Account"
        description="Your profile, your subscription, your payment history."
      />

      <Card className="mb-5">
        <CardHeader>
          <div>
            <CardTitle>Profile</CardTitle>
            <CardSubtitle>Visible to your team and on outgoing emails.</CardSubtitle>
          </div>
        </CardHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <Input label="Full name" defaultValue={user.name ?? ""} />
          <Input label="Email" defaultValue={user.email ?? ""} disabled />
        </div>
      </Card>

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
                {planName}
              </div>
              {sub?.currentPeriodEnd && (
                <div className="text-[12px] text-[color:var(--ink-muted)] mt-3 tabular">
                  Next bill · {longDate(sub.currentPeriodEnd)}
                </div>
              )}
              {sub?.trialEndsAt && (
                <div className="text-[12px] text-[color:var(--ink-muted)] tabular">
                  Trial ends · {longDate(sub.trialEndsAt)}
                </div>
              )}
            </div>
            <PlanActions plans={plans} currentSlug={currentSlug} />
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

      <div className="mt-10">
        <div className="mb-4">
          <div className="quiet-caps mb-1">Plans</div>
          <h2 className="font-display text-[24px] tracking-[-0.015em]">Feature matrix</h2>
        </div>
        <PlanFeatureMatrix plans={plans} currentSlug={currentSlug} />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <div>
            <CardTitle>Payment history</CardTitle>
            <CardSubtitle>
              {payments.length} payment{payments.length === 1 ? "" : "s"}
            </CardSubtitle>
          </div>
        </CardHeader>
        {payments.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-[13px] font-medium text-[color:var(--ink)]">
                    {p.method ?? p.provider.toLowerCase()}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] tabular">
                    {longDate(p.paidAt ?? p.createdAt)} · {p.provider}
                  </div>
                </div>
                <span className="font-display tabular text-[15px]">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

import { redirect } from "next/navigation";
import { requireInfluencer } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { money, longDate } from "@/lib/format";
import { ledgerBalances, describeCommission } from "@/lib/commission";
import { AttributionStatus, LedgerEntryType, PayoutRequestStatus } from "@/lib/prismaEnums";
import { RequestPayoutButton } from "./request-payout-button";
import { ConnectCard } from "./connect-card";
import { CopyShareLink } from "./copy-link";

export default async function InfluencerHome() {
  const session = await requireInfluencer().catch(() => null);
  if (!session) redirect("/influencer/login");
  const influencer = session;

  const [promoCodes, attributions, ledger, payoutRequests] = await Promise.all([
    db.promoCode.findMany({ where: { influencerId: influencer.id }, orderBy: { createdAt: "asc" } }),
    db.attribution.findMany({
      where: { influencerId: influencer.id },
      orderBy: { createdAt: "desc" },
      include: { promoCode: { select: { code: true } } },
    }),
    db.commissionLedger.findMany({
      where: { influencerId: influencer.id },
      select: { entryType: true, amountCents: true, state: true, createdAt: true },
    }),
    db.payoutRequest.findMany({ where: { influencerId: influencer.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const balances = ledgerBalances(ledger);
  const activeCount = attributions.filter((a) => a.status === AttributionStatus.ACTIVE).length;
  const totalClicks = promoCodes.reduce((sum, p) => sum + p.clicks, 0);
  const appUrl = await appBaseUrl();

  // Net earnings by month (accruals minus reversals; payout debits excluded).
  const byMonth = new Map<string, number>();
  for (const entry of ledger) {
    if (entry.entryType === LedgerEntryType.PAID) continue;
    const d = entry.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + entry.amountCents);
  }
  const monthlyEarnings = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 6)
    .map(([key, cents]) => ({
      key,
      label: new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      cents,
    }));

  // Join referred subscribers to org name + plan/status (no PII like email).
  const orgIds = attributions.map((a) => a.organizationId).filter(Boolean) as string[];
  const subIds = attributions.map((a) => a.stripeSubscriptionId);
  const [orgs, subs] = await Promise.all([
    orgIds.length ? db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [],
    subIds.length
      ? db.subscription.findMany({ where: { externalSubId: { in: subIds } }, select: { externalSubId: true, plan: true, status: true } })
      : [],
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const subByExt = new Map(subs.map((s) => [s.externalSubId, s]));

  const openRequest = payoutRequests.find((r) =>
    [PayoutRequestStatus.PENDING, PayoutRequestStatus.APPROVED, PayoutRequestStatus.PROCESSING].includes(r.status as never),
  );
  const belowMin = balances.clearedCents < influencer.minPayoutCents;
  const payoutReason = openRequest
    ? `A payout request is ${openRequest.status.toLowerCase()}.`
    : belowMin
      ? `You need ${money(influencer.minPayoutCents / 100)} cleared to request a payout.`
      : null;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="quiet-caps mb-2">Partner dashboard</div>
          <h1 className="font-display text-[30px] tracking-[-0.02em]">Hi, {influencer.displayName}.</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ink-muted)]">
            Earnings reflect only Stripe-confirmed, non-refunded charges.
          </p>
        </div>
        <RequestPayoutButton disabled={!!openRequest || belowMin} reason={payoutReason} />
      </div>

      {!influencer.payoutsEnabled && <ConnectCard status={influencer.connectStatus} />}

      <StaggerGrid className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Active codes" value={String(promoCodes.filter((p) => p.active).length)} />
        <StatCard label="Link clicks" value={String(totalClicks)} />
        <StatCard label="Subscribers referred" value={String(activeCount)} />
        <StatCard label="Lifetime earned" value={money(balances.lifetimeEarnedCents / 100)} />
        <StatCard label="Available to withdraw" value={money(balances.clearedCents / 100)} accent hint={money(balances.pendingCents / 100) + " still clearing"} />
      </StaggerGrid>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Your promo codes</CardTitle>
            <CardSubtitle>Share these — commission accrues when a subscriber pays.</CardSubtitle>
          </div>
        </CardHeader>
        {promoCodes.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No promo codes assigned yet.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {promoCodes.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-[14px] text-[color:var(--ink)]">{p.code}</span>
                    <div className="text-[11px] text-[color:var(--ink-muted)]">
                      {describeCommission(p)}
                      {p.customerPercentOff ? ` · buyer saves ${p.customerPercentOff}%` : ""}
                      {` · ${p.clicks} click${p.clicks === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  <Badge tone={p.active ? "success" : "neutral"} dot>
                    {p.active ? "active" : "off"}
                  </Badge>
                </div>
                {p.active && <CopyShareLink url={`${appUrl}/?promo=${p.code}`} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {monthlyEarnings.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Earnings by month</CardTitle>
              <CardSubtitle>Net accrued commission (refund reversals included)</CardSubtitle>
            </div>
          </CardHeader>
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {monthlyEarnings.map((m) => (
              <li key={m.key} className="flex items-center justify-between py-3">
                <span className="text-[13px] text-[color:var(--ink)]">{m.label}</span>
                <span className="tabular text-[13px] text-[color:var(--ink)]">{money(m.cents / 100)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Referred subscribers</CardTitle>
            <CardSubtitle>{activeCount} active · confirmed through Stripe</CardSubtitle>
          </div>
        </CardHeader>
        {attributions.length === 0 ? (
          <EmptyState
            title="No referrals yet"
            description="When someone subscribes with your code and their first payment clears, they'll appear here."
          />
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {attributions.map((a) => {
              const sub = subByExt.get(a.stripeSubscriptionId);
              return (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                      {a.organizationId ? (orgName.get(a.organizationId) ?? "A subscriber") : "A subscriber"}
                    </div>
                    <div className="text-[11px] text-[color:var(--ink-muted)]">
                      <span className="font-mono">{a.promoCode.code}</span>
                      {sub && <> · {sub.plan.toLowerCase()}</>}
                      {a.firstPaidInvoiceAt && <> · since {longDate(a.firstPaidInvoiceAt)}</>}
                    </div>
                  </div>
                  <Badge tone={a.status === "ACTIVE" ? "success" : "neutral"}>{a.status.toLowerCase()}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {payoutRequests.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Payout history</CardTitle>
            </div>
          </CardHeader>
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {payoutRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-[13px] tabular text-[color:var(--ink)]">{money(r.amountCents / 100)}</div>
                  <div className="text-[11px] text-[color:var(--ink-muted)]">{longDate(r.createdAt)}</div>
                </div>
                <Badge
                  tone={r.status === "PAID" ? "success" : r.status === "REJECTED" || r.status === "FAILED" ? "danger" : "warn"}
                >
                  {r.status.toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
